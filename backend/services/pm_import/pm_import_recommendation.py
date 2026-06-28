"""PM Import AI review — AI recommendation helpers."""
from __future__ import annotations

import os
import re
import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple

from services.tenant_scope import scoped_job
from services.pm_import_constants import (
    _sanitize_for_json,
    normalize_pm_import_discipline,
)

logger = logging.getLogger(__name__)


class PMImportMixin:
    """Mixin — use only via PMImportService."""

    async def _ai_generate_recommendation(
        self,
        task: Dict[str, Any],
        equipment_match: Optional[Dict[str, Any]],
        similar_failure_modes: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Use AI to generate a recommendation for the task."""
        from services.ai_gateway import chat as ai_gateway_chat

        task_description = task.get("task_description") or task.get("original_task") or ""
        discipline = normalize_pm_import_discipline(task.get("discipline"))
        frequency = task.get("frequency") or ""
        equipment_tag = task.get("equipment_tag") or ""
        
        # Build context for AI — include the FULL recommended_actions list for the
        # top candidate so the LLM can pick a specific action to replace.
        fm_context = ""
        target_actions_list: List[str] = []  # 1-indexed list of action texts for the top FM (used by frontend preview)
        if similar_failure_modes:
            fm_list = []
            for i, fm in enumerate(similar_failure_modes[:5], 1):
                actions = fm.get("recommended_actions") or []
                actions_strs = []
                for a in actions:
                    if isinstance(a, dict):
                        actions_strs.append(
                            a.get("description") or a.get("action") or a.get("name") or str(a)
                        )
                    else:
                        actions_strs.append(str(a))
                if i == 1:
                    target_actions_list = list(actions_strs)
                # Render each candidate's full action list with 1-based indices so
                # the LLM can reference them by number.
                if actions_strs:
                    actions_block = "\n      ".join(
                        f"[{idx}] {txt}" for idx, txt in enumerate(actions_strs, 1)
                    )
                else:
                    actions_block = "(no existing actions)"
                fm_list.append(
                    f"{i}. ID: {fm.get('id')} | Failure Mode: {fm.get('failure_mode')} | "
                    f"Equipment: {fm.get('equipment')} | Mechanism: {fm.get('mechanism')}\n"
                    f"   Existing actions:\n      {actions_block}"
                )
            fm_context = "\n".join(fm_list)
        else:
            fm_context = "No similar failure modes found in library."
        
        equipment_context = ""
        if equipment_match and equipment_match.get("matched"):
            equipment_context = (
                f"Equipment matched: {equipment_match.get('equipment_name')} "
                f"(Type: {equipment_match.get('equipment_type_name') or 'Unknown'})"
            )
        else:
            equipment_context = "No equipment match found in hierarchy."
        
        prompt = f"""Analyze this maintenance task and recommend how to handle it.

TASK DETAILS:
- Description: {task_description}
- Equipment Tag: {equipment_tag}
- Discipline: {discipline}
- Frequency: {frequency}

EQUIPMENT MATCH:
{equipment_context}

SIMILAR FAILURE MODES IN LIBRARY (each candidate's existing recommended actions
are listed with 1-based indices in [brackets]):
{fm_context}

Based on this information, recommend ONE of these actions:
1. "merge" - Merge this task into an existing failure mode's recommended actions.
   IMPORTANT: prefer REPLACING an existing semantically-equivalent action over
   adding a duplicate. Examples of semantic equivalence:
     • "Lubricate input bearings with grease" ≡ "Improve lubrication"
     • "Check vibration on motor monthly" ≡ "Monitor vibration"
     • "Replace V-belt when worn" ≡ "Replace belt on failure"
   Only add as a brand-new action if NO existing action covers the same intent.
2. "new_failure_mode" - Create a new failure mode for this task.
3. "new_task" - Add as a new task under an existing failure mode (same
   replace-or-add rule applies — prefer replace when an equivalent action exists).
4. "keep_custom" - Keep as a custom task (not linked to failure mode library).

Respond with a JSON object:
{{
    "action": "merge" | "new_failure_mode" | "new_task" | "keep_custom",
    "target_failure_mode_id": "id of failure mode if merge or new_task, null otherwise",
    "replace_action_index": <integer 1-based index from the target FM's existing actions list to replace, or null to ADD as a new action>,
    "replace_action_text": "<the EXACT text of the action you chose to replace, copy-paste from the list above, or null>",
    "reasoning": "Brief explanation of why this recommendation AND why this specific action was chosen for replacement (or why nothing was equivalent and a new task was added)",
    "suggested_failure_mode_name": "Name if creating new failure mode, null otherwise",
    "suggested_equipment_type": "Suggested equipment type if no match found, null otherwise",
    "confidence": 0-100
}}"""

        try:
            import os
            import json

            api_key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")
            if not api_key:
                # Return default recommendation without AI
                return self._default_recommendation(similar_failure_modes, task)
            
            from services.ai_platform import execute_json_prompt

            result = await execute_json_prompt(
                "pm_import.recommendation",
                user={"id": "pm-import", "company_id": "default"},
                user_message=prompt,
                endpoint="pm_import.ai_review.recommendation",
                model="gpt-4o-mini",
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            recommendation = result["parsed"]
            if not recommendation or not isinstance(recommendation, dict):
                return self._default_recommendation(similar_failure_modes, task)
            
            # Validate and enrich recommendation
            if recommendation.get("action") in ["merge", "new_task"] and recommendation.get("target_failure_mode_id"):
                target_id = str(recommendation["target_failure_mode_id"])
                recommendation["target_failure_mode_id"] = target_id
                # Find the target failure mode details
                target_fm = next(
                    (fm for fm in similar_failure_modes if str(fm.get("id")) == target_id),
                    None
                )
                if target_fm:
                    recommendation["target_failure_mode"] = {
                        "id": target_fm.get("id"),
                        "failure_mode": target_fm.get("failure_mode"),
                        "equipment": target_fm.get("equipment"),
                        "category": target_fm.get("category")
                    }
                    if not target_actions_list:
                        for a in target_fm.get("recommended_actions") or []:
                            if isinstance(a, dict):
                                target_actions_list.append(
                                    a.get("description") or a.get("action") or a.get("name") or str(a)
                                )
                            else:
                                target_actions_list.append(str(a))

            # Normalize the replace_action_index — accept 1-based int, validate against
            # the target FM's actions, and attach the resolved text for the frontend.
            raw_idx = recommendation.get("replace_action_index")
            replace_idx_zero: Optional[int] = None
            if raw_idx is not None:
                try:
                    raw_idx_int = int(raw_idx)
                    if 1 <= raw_idx_int <= len(target_actions_list):
                        replace_idx_zero = raw_idx_int - 1
                except (TypeError, ValueError):
                    pass
            recommendation["replace_action_index"] = replace_idx_zero  # store 0-based for backend use
            recommendation["replace_action_text"] = (
                target_actions_list[replace_idx_zero] if replace_idx_zero is not None else None
            )
            # Always expose the candidate's full action list so the UI can render a preview.
            recommendation["target_actions_list"] = target_actions_list

            from services.ai_citation import attach_citations_to_response, make_citation

            citations = []
            task_id = task.get("id") or task.get("task_id")
            if task_id:
                citations.append(
                    make_citation(
                        id=str(task_id),
                        type="pm_import_task",
                        label=(task_description or task_id)[:120],
                        url_path=f"/pm-import/tasks/{task_id}",
                    )
                )
            for fm in similar_failure_modes[:5]:
                fm_id = fm.get("id")
                if fm_id:
                    citations.append(
                        make_citation(
                            id=str(fm_id),
                            type="failure_mode",
                            label=fm.get("failure_mode") or str(fm_id),
                            url_path=f"/failure-modes/{fm_id}",
                        )
                    )
            if equipment_match and equipment_match.get("matched") and equipment_match.get("equipment_id"):
                eq_id = str(equipment_match["equipment_id"])
                citations.append(
                    make_citation(
                        id=eq_id,
                        type="equipment",
                        label=equipment_match.get("equipment_name") or eq_id,
                        url_path=f"/equipment/{eq_id}",
                    )
                )

            from services.ai_platform import finalize_recommendation_response

            payload = dict(recommendation)
            payload["recommendations"] = [recommendation]
            finalized = finalize_recommendation_response(
                payload,
                citations=citations,
                evidence={
                    "deterministic": {
                        "equipment_match": equipment_match,
                        "similar_failure_mode_count": len(similar_failure_modes),
                    }
                },
            )
            recommendation.update(
                {
                    k: v
                    for k, v in finalized.items()
                    if k in ("citations", "evidence_not_available", "evidence", "source_refs")
                }
            )
            return recommendation
            
        except Exception as e:
            logger.error(f"AI recommendation error: {e}")
            return self._default_recommendation(similar_failure_modes, task)
    
    def _build_action_text_from_task(self, task: Dict[str, Any]) -> str:
        """Build the recommended_actions description text for a PM import task."""
        return self._build_recommended_action_from_task(task).get("description", "")

    @staticmethod
    def _resolve_task_type_and_discipline(task: Dict[str, Any]) -> Tuple[str, str]:
        """Canonical PM import task type (PM/PDM/CBM/CM) and discipline for FM actions."""
        raw_type = (task.get("task_type") or task.get("action_type") or "PM")
        if isinstance(raw_type, str):
            raw_type = raw_type.upper().strip()
        else:
            raw_type = "PM"
        allowed_types = {"PM", "PDM", "CBM", "CM"}
        action_type = raw_type if raw_type in allowed_types else "PM"
        discipline = normalize_pm_import_discipline((task.get("discipline") or "").strip() or None)
        return action_type, discipline

    def _merge_action_metadata(
        self,
        existing: Any,
        action_entry: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Merge PM import type/discipline (and related fields) into an FM recommended action."""
        if isinstance(existing, dict):
            merged = dict(existing)
            merged.update(action_entry)
        else:
            merged = dict(action_entry)
        merged["action_type"] = action_entry.get("action_type") or merged.get("action_type") or "PM"
        merged["task_type"] = action_entry.get("task_type") or merged.get("task_type") or merged["action_type"]
        merged["discipline"] = normalize_pm_import_discipline(
            action_entry.get("discipline") or merged.get("discipline")
        )
        return merged

    def _build_recommended_action_from_task(
        self,
        task: Dict[str, Any],
        source: str = "PM Import AI Review",
    ) -> Dict[str, Any]:
        """Build a structured failure-mode recommended_actions entry from a PM task."""
        task_description = task.get("task_description") or task.get("original_task") or ""
        frequency = task.get("frequency") or ""
        description = (
            f"{task_description} (Frequency: {frequency})"
            if frequency
            else task_description
        )

        action_type, discipline = self._resolve_task_type_and_discipline(task)

        estimated_minutes = None
        try:
            hours = float(task.get("estimated_hours") or 0)
            if hours > 0:
                estimated_minutes = max(1, int(round(hours * 60)))
        except (TypeError, ValueError):
            pass

        estimated_time = (task.get("estimated_time") or "").strip()
        if not estimated_time and estimated_minutes is not None:
            if estimated_minutes >= 60:
                h = estimated_minutes / 60
                estimated_time = (
                    f"{int(h)} hours" if h == int(h) else f"{h:.1f} hours"
                )
            else:
                estimated_time = f"{estimated_minutes} min"

        action: Dict[str, Any] = {
            "description": description,
            "action_type": action_type,
            "task_type": action_type,
            "discipline": discipline,
            "source": source,
            "requires_downtime": False,
        }
        if frequency:
            action["frequency"] = frequency
        if estimated_minutes is not None:
            action["estimated_minutes"] = estimated_minutes
        if estimated_time:
            action["estimated_time"] = estimated_time
        return action

    def _action_texts_from_fm_actions(self, actions: List[Any]) -> List[str]:
        texts: List[str] = []
        for action in actions or []:
            if isinstance(action, dict):
                texts.append(
                    action.get("description") or action.get("action") or action.get("name") or str(action)
                )
            else:
                texts.append(str(action))
        return texts

    def _summarize_failure_mode_for_review(self, fm: Dict[str, Any]) -> Dict[str, Any]:
        """Lean, JSON-safe failure mode summary for AI review responses."""
        fm_id = fm.get("id")
        if fm_id is not None:
            fm_id = str(fm_id)
        return {
            "id": fm_id,
            "failure_mode": fm.get("failure_mode"),
            "equipment": fm.get("equipment"),
            "category": fm.get("category"),
            "mechanism": fm.get("mechanism"),
            "similarity_score": fm.get("similarity_score", 0),
            "rpn": fm.get("rpn"),
            "recommended_actions": self._action_texts_from_fm_actions(
                fm.get("recommended_actions") or []
            ),
        }

    def _resolve_replace_action_index(
        self,
        action_text: str,
        existing_actions: List[Any],
        preferred_index: Optional[int] = None,
    ) -> Tuple[Optional[int], str]:
        """Pick an existing action to update, or decide to add new.

        Returns (index, mode) where mode is 'existing' | 'replace' | 'add'.
        """
        target_norm = self._normalize_action_text(action_text)
        if target_norm:
            for idx, existing in enumerate(existing_actions or []):
                if self._normalize_action_text(existing) == target_norm:
                    return idx, "existing"

        if (
            preferred_index is not None
            and isinstance(preferred_index, int)
            and 0 <= preferred_index < len(existing_actions or [])
        ):
            return preferred_index, "replace"

        match_idx, _ratio = self._find_similar_action_index(action_text, existing_actions or [])
        if match_idx >= 0:
            return match_idx, "replace"

        return None, "add"

    def _enrich_recommendation(
        self,
        recommendation: Dict[str, Any],
        task: Dict[str, Any],
        similar_failure_modes: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Prefer updating/reusing existing FM tasks before adding new ones."""
        if not recommendation:
            return recommendation

        action_text = self._build_action_text_from_task(task)
        enriched = dict(recommendation)

        # If AI suggested a new FM but we have a reasonable library match, merge instead.
        if enriched.get("action") == "new_failure_mode" and similar_failure_modes:
            best = similar_failure_modes[0]
            if best.get("similarity_score", 0) >= 25:
                enriched["action"] = "merge"
                enriched["target_failure_mode_id"] = best.get("id")
                enriched["target_failure_mode"] = {
                    "id": best.get("id"),
                    "failure_mode": best.get("failure_mode"),
                    "equipment": best.get("equipment"),
                    "category": best.get("category"),
                }
                enriched.setdefault(
                    "reasoning",
                    f"Matched existing failure mode '{best.get('failure_mode')}' — will update or reuse an existing task before adding.",
                )

        action = enriched.get("action")
        if action not in ("merge", "new_task"):
            return enriched

        target_id = enriched.get("target_failure_mode_id")
        if not target_id and similar_failure_modes:
            best = similar_failure_modes[0]
            target_id = best.get("id")
            enriched["target_failure_mode_id"] = target_id
            enriched["target_failure_mode"] = {
                "id": best.get("id"),
                "failure_mode": best.get("failure_mode"),
                "equipment": best.get("equipment"),
                "category": best.get("category"),
            }

        if not target_id:
            return enriched

        target_fm = next(
            (fm for fm in similar_failure_modes if str(fm.get("id")) == str(target_id)),
            None,
        )
        existing_actions = (target_fm or {}).get("recommended_actions") or []
        action_texts = self._action_texts_from_fm_actions(existing_actions)

        preferred = enriched.get("replace_action_index")
        if preferred is not None and not isinstance(preferred, int):
            try:
                preferred = int(preferred)
            except (TypeError, ValueError):
                preferred = None

        replace_idx, mode = self._resolve_replace_action_index(
            action_text, existing_actions, preferred
        )

        if mode == "existing":
            enriched["replace_action_index"] = replace_idx
            enriched["already_exists"] = True
            enriched["replace_action_text"] = action_texts[replace_idx] if replace_idx is not None else None
        elif mode == "replace" and replace_idx is not None:
            enriched["replace_action_index"] = replace_idx
            enriched["already_exists"] = False
            enriched["replace_action_text"] = action_texts[replace_idx]
        else:
            enriched["replace_action_index"] = None
            enriched["already_exists"] = False
            enriched["replace_action_text"] = None

        enriched["target_actions_list"] = action_texts
        return enriched

    def _default_recommendation(
        self,
        similar_failure_modes: List[Dict[str, Any]],
        task: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate default recommendation without AI."""
        if similar_failure_modes and similar_failure_modes[0].get("similarity_score", 0) >= 25:
            best_match = similar_failure_modes[0]
            score = best_match.get("similarity_score", 0)
            
            # Determine confidence based on score
            if score >= 75:
                confidence = 85
                reasoning = f"Strong match with '{best_match.get('failure_mode')}' (equipment type match)"
            elif score >= 50:
                confidence = 70
                reasoning = f"Good match with '{best_match.get('failure_mode')}'"
            else:
                confidence = 55
                reasoning = f"Possible match with '{best_match.get('failure_mode')}' - review recommended"
            
            recommendation = {
                "action": "merge",
                "target_failure_mode_id": best_match.get("id"),
                "target_failure_mode": {
                    "id": best_match.get("id"),
                    "failure_mode": best_match.get("failure_mode"),
                    "equipment": best_match.get("equipment"),
                    "category": best_match.get("category")
                },
                "reasoning": reasoning,
                "suggested_failure_mode_name": None,
                "suggested_equipment_type": None,
                "confidence": confidence
            }
            if task:
                return self._enrich_recommendation(recommendation, task, similar_failure_modes)
            return recommendation
        else:
            return {
                "action": "keep_custom",
                "target_failure_mode_id": None,
                "reasoning": "No strong match found in failure mode library. Consider creating a new failure mode or keeping as custom task.",
                "suggested_failure_mode_name": None,
                "suggested_equipment_type": None,
                "confidence": 40
            }
    
    @staticmethod
    def _normalize_action_text(value: Any) -> str:
        """Normalize an action (string OR dict) into a comparable lowercased string.

        Strips the "(Frequency: ...)" suffix added by PM import, removes punctuation,
        and collapses whitespace so similar tasks match regardless of formatting.
        """
        if value is None:
            return ""
        if isinstance(value, dict):
            text = value.get("action") or value.get("description") or value.get("name") or ""
        else:
            text = str(value)
        text = re.sub(r"\(\s*frequency\s*:.*?\)", "", text, flags=re.IGNORECASE)
        text = re.sub(r"[^a-z0-9\s]", " ", text.lower())
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @classmethod
    def _find_similar_action_index(
        cls,
        new_action_text: str,
        existing_actions: List[Any],
        threshold: float = 0.55,
    ) -> Tuple[int, float]:
        """Find the index of the most similar existing action.

        Returns (index, ratio). index = -1 if nothing crosses the threshold.
        Uses difflib SequenceMatcher on the normalized text — good enough for
        catching near-duplicates like "Inspect bearings" vs "Inspect the bearings".
        """
        from difflib import SequenceMatcher

        target = cls._normalize_action_text(new_action_text)
        if not target:
            return -1, 0.0

        best_idx, best_ratio = -1, 0.0
        for idx, existing in enumerate(existing_actions or []):
            candidate = cls._normalize_action_text(existing)
            if not candidate:
                continue
            ratio = SequenceMatcher(None, target, candidate).ratio()
            # Also treat full-substring containment as a strong match.
            if target in candidate or candidate in target:
                ratio = max(ratio, 0.85)
            if ratio > best_ratio:
                best_ratio, best_idx = ratio, idx

        if best_ratio >= threshold:
            return best_idx, best_ratio
        return -1, best_ratio
