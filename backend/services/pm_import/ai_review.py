"""PM Import AI review and recommendation helpers."""
from __future__ import annotations

import os
import io
import re
import json
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.pm_import_constants import (
    PM_IMPORT_DISPLAY_STATUSES,
    ACTION_TYPES,
    ACTION_TYPE_KEYWORDS,
    DISCIPLINE_KEYWORDS,
    DURATION_PATTERNS,
    FREQUENCY_PATTERNS,
    TAG_REGEX,
    TASK_CLASSIFICATION_RULES,
    TASK_TYPE_DEFAULTS,
    TASK_TYPES,
    _sanitize_for_json,
    normalize_pm_import_display_status,
)

logger = logging.getLogger(__name__)


class PMImportMixin:
    """Mixin — use only via PMImportService."""

    async def ai_review_accepted_tasks(self, session_id: str) -> Dict[str, Any]:
        """
        AI-powered review of accepted tasks.
        
        For each accepted task:
        1. Match equipment type by tag → equipment_nodes → equipment_type_id
        2. Suggest existing failure mode to merge with, or suggest new failure mode
        3. If failure mode matches but task doesn't, suggest new task under FM
        
        Returns suggestions for each accepted task.
        """
        # Get session
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        tasks = session.get("tasks_extracted", [])
        accepted_tasks = [
            t for t in tasks
            if t.get("review_status") in ("accepted", "edited")
        ]
        
        if not accepted_tasks:
            return {"suggestions": [], "total_reviewed": 0, "message": "No accepted tasks to review"}
        
        suggestions = []
        
        for task in accepted_tasks:
            try:
                suggestion = await self._generate_task_suggestion(task)
                suggestions.append(_sanitize_for_json(suggestion))
            except Exception as e:
                logger.error(
                    "AI review failed for task %s: %s",
                    task.get("task_id"),
                    e,
                    exc_info=True,
                )
                suggestions.append(_sanitize_for_json({
                    "task_id": task.get("task_id"),
                    "equipment_tag": task.get("equipment_tag") or task.get("asset") or "",
                    "task_description": task.get("task_description") or task.get("original_task") or "",
                    "discipline": task.get("discipline") or "Mechanical",
                    "frequency": task.get("frequency") or "",
                    "task_type": task.get("task_type") or "PM",
                    "equipment_match": None,
                    "similar_failure_modes": [],
                    "recommendation": {
                        "action": "keep_custom",
                        "target_failure_mode_id": None,
                        "reasoning": f"AI review could not complete for this task: {e}",
                        "confidence": 0,
                    },
                    "status": "pending",
                    "error": str(e),
                }))
        
        # Store suggestions in session
        try:
            await self.sessions_collection.update_one(
                {"session_id": session_id},
                {"$set": {
                    "ai_review_suggestions": suggestions,
                    "ai_review_status": "completed",
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
        except Exception as e:
            logger.error(
                "Failed to persist AI review suggestions for session %s: %s",
                session_id,
                e,
                exc_info=True,
            )

        return _sanitize_for_json({
            "suggestions": suggestions,
            "total_reviewed": len(accepted_tasks),
            "message": f"AI review completed for {len(accepted_tasks)} tasks"
        })
    
    async def _generate_task_suggestion(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI suggestion for a single task."""
        import os
        
        task_id = task.get("task_id")
        equipment_tag = task.get("equipment_tag") or task.get("asset") or ""
        task_description = task.get("task_description") or task.get("original_task") or ""
        discipline = task.get("discipline") or "Mechanical"
        frequency = task.get("frequency") or ""
        task_type = task.get("task_type") or "PM"
        
        # Step 1: Match equipment type by tag
        equipment_match = await self._match_equipment_by_tag(equipment_tag)
        
        # Step 2: Find similar failure modes
        similar_failure_modes = await self._find_similar_failure_modes(
            task_description, 
            equipment_match.get("equipment_type_id") if equipment_match else None,
            discipline
        )
        
        # Step 3: Use AI to generate recommendation
        recommendation = await self._ai_generate_recommendation(
            task=task,
            equipment_match=equipment_match,
            similar_failure_modes=similar_failure_modes
        )
        recommendation = self._enrich_recommendation(
            recommendation, task, similar_failure_modes
        )
        
        return _sanitize_for_json({
            "task_id": task_id,
            "equipment_tag": equipment_tag,
            "task_description": task_description,
            "discipline": discipline,
            "frequency": frequency,
            "task_type": task_type,
            "estimated_hours": task.get("estimated_hours"),
            "equipment_match": equipment_match,
            "action_preview": self._build_recommended_action_from_task(task),
            "similar_failure_modes": [
                self._summarize_failure_mode_for_review(fm)
                for fm in similar_failure_modes[:5]
            ],
            "recommendation": recommendation,
            "status": "pending"  # pending, accepted, rejected
        })
    
    async def _match_equipment_by_tag(self, tag: str) -> Optional[Dict[str, Any]]:
        """Match equipment tag to equipment_nodes and get equipment_type_id."""
        if not tag:
            return None
        
        # Normalize the tag - remove common variations
        tag_normalized = tag.strip()
        tag_escaped = re.escape(tag_normalized)
        # Also create a version without hyphens for fuzzy matching
        tag_no_hyphens = tag_normalized.replace("-", "").replace(" ", "").lower()
        
        logger.info(f"_match_equipment_by_tag: tag='{tag}', normalized='{tag_normalized}', no_hyphens='{tag_no_hyphens}'")
        
        # Try exact match first on tag field
        equipment_node = await self.db.equipment_nodes.find_one(
            {"$or": [
                {"tag": {"$regex": f"^{tag_escaped}$", "$options": "i"}},
                {"id": {"$regex": f"^{tag_escaped}$", "$options": "i"}},
                {"name": {"$regex": f"^{tag_escaped}$", "$options": "i"}}
            ]},
            {"_id": 0, "id": 1, "tag": 1, "name": 1, "equipment_type_id": 1, "level": 1}
        )
        
        if equipment_node:
            logger.info(f"_match_equipment_by_tag: exact match found - {equipment_node.get('tag')}")
            return await self._build_equipment_match(equipment_node)
        
        # Try matching with normalized tag (no hyphens) against stored tags
        # This handles cases like "1F3001-0122" matching "1F-3001-0122"
        logger.info(f"_match_equipment_by_tag: trying normalized match for '{tag_no_hyphens}'")
        cursor = self.db.equipment_nodes.find(
            {},
            {"_id": 0, "id": 1, "tag": 1, "name": 1, "equipment_type_id": 1, "level": 1}
        )
        async for node in cursor:
            node_tag = node.get("tag") or ""
            if node_tag and node_tag != "None":
                node_tag_normalized = node_tag.replace("-", "").replace(" ", "").lower()
                if node_tag_normalized == tag_no_hyphens:
                    logger.info(f"_match_equipment_by_tag: normalized match found - {node.get('tag')} (type: {node.get('equipment_type_id')})")
                    return await self._build_equipment_match(node)
        
        logger.info(f"_match_equipment_by_tag: no normalized match, trying partial")
        # Try partial/prefix match - tag might be a parent (e.g., "1F-3001" should match "1F-3001-0128")
        equipment_node = await self.db.equipment_nodes.find_one(
            {"$or": [
                {"tag": {"$regex": f"^{tag_normalized}", "$options": "i"}},
                {"tag": {"$regex": tag_normalized, "$options": "i"}}
            ]},
            {"_id": 0, "id": 1, "tag": 1, "name": 1, "equipment_type_id": 1, "level": 1}
        )
        
        if equipment_node:
            logger.info(f"_match_equipment_by_tag: partial match found - {equipment_node.get('tag')}")
            return await self._build_equipment_match(equipment_node, partial=True)
        
        # Try matching where the stored tag starts with our tag (parent equipment)
        # Or our tag contains the stored tag
        cursor = self.db.equipment_nodes.find(
            {"tag": {"$exists": True, "$ne": None, "$ne": "None"}},
            {"_id": 0, "id": 1, "tag": 1, "name": 1, "equipment_type_id": 1, "level": 1}
        ).limit(500)
        
        best_match = None
        best_score = 0
        async for node in cursor:
            node_tag = node.get("tag")
            if not node_tag or node_tag == "None":
                continue
            
            # Check if tags match when normalized
            node_tag_no_hyphens = node_tag.replace("-", "").replace(" ", "").lower()
            
            # Score based on how well they match
            if tag_no_hyphens.lower().startswith(node_tag_no_hyphens):
                score = len(node_tag_no_hyphens)
                if score > best_score:
                    best_score = score
                    best_match = node
            elif node_tag_no_hyphens.startswith(tag_no_hyphens.lower()):
                score = len(tag_no_hyphens)
                if score > best_score:
                    best_score = score
                    best_match = node
        
        if best_match:
            return await self._build_equipment_match(best_match, partial=True)
        
        return {
            "matched": False,
            "equipment_tag": tag,
            "suggestion": "No equipment found. Consider creating new equipment or mapping this tag."
        }
    
    async def _build_equipment_match(self, equipment_node: Dict, partial: bool = False) -> Dict[str, Any]:
        """Build equipment match response with type details."""
        equipment_type = None
        equipment_type_id = equipment_node.get("equipment_type_id")
        
        if equipment_type_id:
            # First try custom_equipment_types collection
            equipment_type = await self.db.custom_equipment_types.find_one(
                {"id": equipment_type_id},
                {"_id": 0, "id": 1, "name": 1, "category": 1}
            )
            
            # If not found in custom, check ISO14224 standard types
            if not equipment_type:
                try:
                    from iso14224_models import EQUIPMENT_TYPES
                    iso_type = next(
                        (t for t in EQUIPMENT_TYPES if t.get("id") == equipment_type_id),
                        None
                    )
                    if iso_type:
                        equipment_type = {
                            "id": iso_type.get("id"),
                            "name": iso_type.get("name"),
                            "category": iso_type.get("category")
                        }
                except Exception as e:
                    logger.warning("Could not load ISO equipment types for match: %s", e)
        
        result = {
            "matched": True,
            "equipment_id": equipment_node.get("id"),
            "equipment_tag": equipment_node.get("tag") or equipment_node.get("id"),
            "equipment_name": equipment_node.get("name"),
            "equipment_type_id": str(equipment_type_id) if equipment_type_id is not None else None,
            "equipment_type_name": equipment_type.get("name") if equipment_type else None,
            "equipment_type_category": equipment_type.get("category") if equipment_type else None,
            "level": equipment_node.get("level")
        }
        
        if partial:
            result["partial_match"] = True
        
        return result
    
    async def _find_similar_failure_modes(
        self, 
        task_description: str, 
        equipment_type_id: Optional[str],
        discipline: str
    ) -> List[Dict[str, Any]]:
        """Find similar failure modes from the library."""
        
        # Get all failure modes (we'll score them all)
        # Include _id since some failure modes use it as identifier
        cursor = self.failure_modes_collection.find(
            {},
            {"_id": 1, "id": 1, "failure_mode": 1, "equipment": 1, "category": 1, 
             "mechanism": 1, "detection_methods": 1, "severity": 1, "occurrence": 1,
             "detectability": 1, "rpn": 1, "recommended_actions": 1, "equipment_type_ids": 1}
        ).limit(500)
        
        failure_modes = await cursor.to_list(length=500)
        
        if not failure_modes:
            return []
        
        # Normalize IDs - use 'id' field if present, otherwise convert _id to string
        for fm in failure_modes:
            if fm.get("id") is not None:
                fm["id"] = str(fm.get("id"))
            elif fm.get("_id"):
                fm["id"] = str(fm["_id"])
            # Remove _id from response to avoid serialization issues
            if "_id" in fm:
                del fm["_id"]
            fm["equipment_type_ids"] = [str(t) for t in fm.get("equipment_type_ids", [])]
        
        # Score each failure mode based on text similarity
        task_lower = task_description.lower()
        task_words = set(task_lower.split())
        
        # Extract key terms from task (words > 3 chars, excluding common words)
        stop_words = {'the', 'and', 'for', 'that', 'with', 'from', 'this', 'have', 'been', 'will', 'system', 'systems'}
        key_terms = {w for w in task_words if len(w) > 3 and w not in stop_words}
        
        # Map common task verbs to failure mode concepts
        task_to_fm_mapping = {
            'clean': ['cooling', 'contamination', 'fouling', 'blockage', 'clogging', 'dirt', 'debris', 'filter'],
            'lubricate': ['lubrication', 'bearing', 'wear', 'friction', 'oil', 'grease'],
            'inspect': ['inspection', 'visual', 'check', 'monitor'],
            'calibrate': ['calibration', 'accuracy', 'drift', 'sensor', 'instrument'],
            'replace': ['wear', 'fatigue', 'degradation', 'life'],
            'cooling': ['overheat', 'thermal', 'temperature', 'fan', 'heat'],
            'motor': ['overload', 'burnout', 'winding', 'rotor', 'stator', 'phase', 'electric'],
            'bearing': ['vibration', 'noise', 'wear', 'lubrication', 'alignment'],
            'pump': ['cavitation', 'seal', 'impeller', 'flow', 'pressure'],
            'valve': ['leak', 'seat', 'stem', 'actuator', 'stuck'],
        }
        
        scored_modes = []
        for fm in failure_modes:
            score = 0
            
            fm_name = (fm.get('failure_mode') or '').lower()
            fm_mechanism = (fm.get('mechanism') or '').lower()
            fm_equipment = (fm.get('equipment') or '').lower()
            fm_text = f"{fm_name} {fm_mechanism} {fm_equipment}"
            fm_words = set(fm_text.split())
            
            # Direct word overlap (high value)
            common_words = key_terms & fm_words
            score += len(common_words) * 15
            
            # Check task-to-FM concept mapping
            for task_term, fm_concepts in task_to_fm_mapping.items():
                if task_term in task_lower:
                    for concept in fm_concepts:
                        if concept in fm_text:
                            score += 25  # Strong conceptual match
                            break
            
            # Check if any recommended action matches task terms
            for action in fm.get("recommended_actions", []):
                if isinstance(action, dict):
                    raw_action = (
                        action.get("description")
                        or action.get("action")
                        or action.get("name")
                        or ""
                    )
                else:
                    raw_action = action
                action_text = str(raw_action).lower()
                
                # Check for key term matches in actions
                matching_terms = sum(1 for term in key_terms if term in action_text)
                if matching_terms > 0:
                    score += matching_terms * 20  # Actions are highly relevant
            
            # Check detection methods
            for method in fm.get("detection_methods", []):
                method_lower = str(method).lower() if method is not None else ""
                if any(term in method_lower for term in key_terms):
                    score += 10
                    break
            
            # Equipment type match - BIG bonus
            fm_type_ids = [str(t) for t in fm.get("equipment_type_ids", [])]
            if equipment_type_id and str(equipment_type_id) in fm_type_ids:
                score += 50  # Strong equipment type match
            
            # Partial equipment type match (e.g., task for motor, FM for electric equipment)
            if equipment_type_id:
                eq_base = str(equipment_type_id).split('_')[0] if '_' in str(equipment_type_id) else str(equipment_type_id)
                for fm_type in fm_type_ids:
                    if eq_base in fm_type or fm_type.split('_')[0] == eq_base:
                        score += 25
                        break
            
            if score > 0:
                scored_modes.append({
                    **fm,
                    "similarity_score": score
                })
        
        # Sort by score descending
        scored_modes.sort(key=lambda x: x["similarity_score"], reverse=True)
        
        return scored_modes[:10]
    
    async def _ai_generate_recommendation(
        self,
        task: Dict[str, Any],
        equipment_match: Optional[Dict[str, Any]],
        similar_failure_modes: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Use AI to generate a recommendation for the task."""
        from services.openai_service import chat_completion
        import os
        import json
        
        task_description = task.get("task_description") or task.get("original_task") or ""
        discipline = task.get("discipline") or "Mechanical"
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
            api_key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")
            if not api_key:
                # Return default recommendation without AI
                return self._default_recommendation(similar_failure_modes, task)
            
            system_message = (
                "You are an expert in industrial equipment maintenance and failure mode analysis. "
                "Respond only with valid JSON."
            )
            response = await chat_completion(
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt},
                ],
                model="gpt-4o-mini",
                temperature=0.2,
                response_format={"type": "json_object"},
                api_key=api_key,
            )
            
            # Parse JSON response
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            response_text = response_text.strip()
            
            recommendation = json.loads(response_text)
            
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
        discipline = (task.get("discipline") or "Mechanical").strip() or "Mechanical"
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
        merged["discipline"] = action_entry.get("discipline") or merged.get("discipline") or "Mechanical"
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

