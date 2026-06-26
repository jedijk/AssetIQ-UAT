"""PM Import AI review and recommendation helpers — thin facade."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, Any

from services.tenant_scope import scoped_job
from services.pm_import_constants import (
    _sanitize_for_json,
    normalize_pm_import_discipline,
)
from services.pm_import.pm_import_equipment_match import PMImportMixin as _EquipmentMatchMixin
from services.pm_import.pm_import_fm_match import PMImportMixin as _FMMatchMixin
from services.pm_import.pm_import_recommendation import PMImportMixin as _RecommendationMixin

logger = logging.getLogger(__name__)


class PMImportMixin(_EquipmentMatchMixin, _FMMatchMixin, _RecommendationMixin):
    """Mixin — use only via PMImportService."""

    async def ai_review_accepted_tasks(self, session_id: str) -> Dict[str, Any]:
        """
        AI-powered review of accepted tasks.
        """
        session = await self.sessions_collection.find_one(
            scoped_job({"session_id": session_id})
        )
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
                    "discipline": normalize_pm_import_discipline(task.get("discipline")),
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

        try:
            await self.sessions_collection.update_one(
                scoped_job({"session_id": session_id}),
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
        task_id = task.get("task_id")
        equipment_tag = task.get("equipment_tag") or task.get("asset") or ""
        task_description = task.get("task_description") or task.get("original_task") or ""
        discipline = normalize_pm_import_discipline(task.get("discipline"))
        frequency = task.get("frequency") or ""
        task_type = task.get("task_type") or "PM"

        equipment_match = await self._match_equipment_by_tag(equipment_tag)

        similar_failure_modes = await self._find_similar_failure_modes(
            task_description,
            equipment_match.get("equipment_type_id") if equipment_match else None,
            discipline
        )

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
            "status": "pending"
        })
