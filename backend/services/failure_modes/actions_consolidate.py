"""AI-assisted consolidation of failure-mode recommended actions."""
from __future__ import annotations

from typing import Any, Dict, List, Set, Tuple

from services.ai_platform import execute_json_prompt
from services.failure_modes.cache import _invalidate_cache

CONSOLIDATE_ACTIONS_PROMPT = (
    "You are a senior reliability engineer cleaning up a failure-mode FMEA action list. "
    "Merge duplicate and overlapping recommended maintenance actions into a concise set "
    "of DISTINCT tasks. Each output action must be a different maintenance intent "
    "(do not merge inspect vs replace vs lubricate vs overhaul unless they are true duplicates). "
    "Prefer PM for scheduled upkeep, PDM for condition monitoring, CM for corrective work. "
    "Use lowercase discipline keys: rotating, static, piping, electrical, instrumentation, "
    "civil, operations, laboratory. "
    "Return strict JSON only."
)


class ActionsConsolidateMixin:
    """Mixin — requires FailureModesMixin action helpers and CRUD update()."""

    CONSOLIDATE_ACTIONS_SYSTEM_PROMPT = CONSOLIDATE_ACTIONS_PROMPT

    @staticmethod
    def _consolidate_system_prompt() -> str:
        from services.ai_prompt_registry import render_prompt
        return render_prompt("fm.consolidate_actions")

    @classmethod
    def _clamp_consolidation_targets(
        cls, target_min: int, target_max: int
    ) -> Tuple[int, int]:
        lo = max(2, min(int(target_min or 3), 8))
        hi = max(lo, min(int(target_max or 5), 8))
        lo = max(2, min(lo, hi))
        return lo, hi

    def _build_consolidated_action_objects(
        self,
        actions: List[Any],
        ai_items: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Merge source action metadata into AI-consolidated rows."""
        n = len(actions)
        used_indices: Set[int] = set()
        consolidated: List[Dict[str, Any]] = []

        for item in ai_items:
            if not isinstance(item, dict):
                continue
            raw_indices = item.get("merged_from_indices") or item.get("source_indices") or []
            indices: List[int] = []
            for raw in raw_indices:
                try:
                    idx = int(raw)
                except (TypeError, ValueError):
                    continue
                if 0 <= idx < n and idx not in used_indices:
                    indices.append(idx)
            if not indices:
                continue
            used_indices.update(indices)

            merged = actions[indices[0]]
            for ri in indices[1:]:
                merged = self._merge_action_dict(merged, actions[ri])

            if isinstance(merged, dict):
                row: Dict[str, Any] = dict(merged)
            else:
                row = {"description": str(merged)}

            description = (
                (item.get("description") or item.get("action") or "").strip()
                or self._action_display_label(row, indices[0])
            )
            row["description"] = description[:500]
            row.pop("action", None)

            action_type = item.get("action_type") or item.get("task_type")
            if action_type:
                row["action_type"] = str(action_type).upper()
                row["task_type"] = row["action_type"]

            discipline = item.get("discipline")
            if discipline:
                row["discipline"] = str(discipline).strip().lower()

            est = item.get("estimated_minutes")
            if est is not None:
                try:
                    row["estimated_minutes"] = int(est)
                except (TypeError, ValueError):
                    pass

            if any(
                isinstance(actions[i], dict) and actions[i].get("auto_create")
                for i in indices
            ):
                row["auto_create"] = True

            row["merged_from_indices"] = sorted(indices)
            rationale = (item.get("rationale") or "").strip()
            if rationale:
                row["consolidation_rationale"] = rationale[:240]

            consolidated.append(row)

        return consolidated

    async def consolidate_recommended_actions_with_ai(
        self,
        failure_mode_id: str,
        *,
        target_min: int = 3,
        target_max: int = 5,
        apply: bool = False,
        updated_by: str = "AI action consolidation",
        user_id: str = "system",
        company_id: str = "default",
    ) -> Dict[str, Any]:
        """
        Use AI to merge duplicate/overlapping recommended_actions into 3–5 distinct tasks.
        """
        import json

        target_min, target_max = self._clamp_consolidation_targets(target_min, target_max)
        doc = await self._resolve_fm_doc(failure_mode_id)
        if not doc:
            raise LookupError(f"Failure mode {failure_mode_id} not found")

        actions = list(doc.get("recommended_actions") or [])
        n = len(actions)
        if n < 4:
            raise ValueError("Need at least 4 recommended actions to consolidate")

        fm_name = doc.get("failure_mode") or ""
        equipment = doc.get("equipment") or ""
        payload = []
        for idx, action in enumerate(actions):
            payload.append({
                "index": idx,
                "description": self._action_display_label(action, idx)[:400],
                "action_type": (
                    action.get("action_type") or action.get("task_type")
                    if isinstance(action, dict)
                    else ""
                ),
                "discipline": (
                    action.get("discipline") if isinstance(action, dict) else ""
                ),
                "estimated_minutes": (
                    action.get("estimated_minutes") if isinstance(action, dict) else None
                ),
            })

        user_msg = (
            f"Failure mode: {fm_name}\n"
            f"Equipment: {equipment or '—'}\n"
            f"Current action count: {n}\n"
            f"Target consolidated count: {target_min}–{target_max} distinct actions\n\n"
            f"Actions:\n{json.dumps(payload, indent=2)}\n\n"
            "Merge duplicates and near-duplicates; combine overlapping inspect/lube tasks "
            "only when they are the same maintenance scope. Keep PM, PDM, and CM separate "
            "when they represent different work.\n\n"
            'Return JSON: {"summary": "<=40 words", "consolidated_actions": ['
            '{"description": "...", "action_type": "PM|CM|PDM", "discipline": "rotating|...", '
            '"estimated_minutes": number|null, "merged_from_indices": [0,2], '
            '"rationale": "<=20 words"}]}. '
            f"Every input index 0–{n - 1} must appear in exactly one merged_from_indices list. "
            f"Return {target_min}–{target_max} consolidated_actions."
        )

        from services.ai_platform import execute_json_prompt

        result = await execute_json_prompt(
            "fm.consolidate_actions",
            user={"id": user_id, "company_id": company_id},
            user_message=user_msg,
            endpoint="ai_fm_suggestions.consolidate_failure_mode_actions",
            model="gpt-4o-mini",
            temperature=0,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )
        data = result["parsed"] or {}
        if not isinstance(data, dict):
            raise ValueError("Failed to parse AI consolidation response")

        ai_items = data.get("consolidated_actions") or []
        consolidated = self._build_consolidated_action_objects(actions, ai_items)
        if not consolidated:
            raise ValueError("AI returned no valid consolidated actions")

        if len(consolidated) > target_max + 1:
            raise ValueError(
                f"AI returned {len(consolidated)} actions; expected at most {target_max}"
            )

        covered = {
            idx
            for row in consolidated
            for idx in (row.get("merged_from_indices") or [])
        }
        if covered != set(range(n)):
            missing = sorted(set(range(n)) - covered)
            extra = sorted(covered - set(range(n)))
            raise ValueError(
                "AI consolidation did not cover all actions"
                + (f" (missing indices: {missing})" if missing else "")
                + (f" (invalid indices: {extra})" if extra else "")
            )

        persist_actions: List[Dict[str, Any]] = []
        preview_actions: List[Dict[str, Any]] = []
        for row in consolidated:
            preview_row = dict(row)
            persist_row = {
                k: v
                for k, v in row.items()
                if k not in ("merged_from_indices", "consolidation_rationale")
            }
            persist_actions.append(persist_row)
            preview_actions.append(preview_row)

        mode_id_str = str(doc.get("id") or doc["_id"])
        result: Dict[str, Any] = {
            "failure_mode_id": mode_id_str,
            "failure_mode": fm_name,
            "equipment": equipment,
            "actions_before": n,
            "actions_after": len(persist_actions),
            "target_min": target_min,
            "target_max": target_max,
            "summary": (data.get("summary") or "").strip()[:500],
            "original_actions": [
                {
                    "index": i,
                    "label": self._action_display_label(a, i),
                    "action_type": (
                        a.get("action_type") or a.get("task_type")
                        if isinstance(a, dict)
                        else None
                    ),
                    "discipline": a.get("discipline") if isinstance(a, dict) else None,
                }
                for i, a in enumerate(actions)
            ],
            "consolidated_actions": preview_actions,
            "applied": False,
        }

        if apply:
            updated = await self.update(
                mode_id_str,
                {"recommended_actions": persist_actions},
                updated_by=updated_by,
                change_reason="AI consolidated duplicate/overlapping recommended actions",
            )
            if not updated:
                raise RuntimeError("Failed to update failure mode")
            result["applied"] = True
            _invalidate_cache()

        return result
