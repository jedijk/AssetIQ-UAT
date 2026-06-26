"""Post-submission reliability graph + threat score refresh."""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


async def after_form_submission_reliability_update(
    db,
    submission: Dict[str, Any],
    submitted_by: str,
    notes: Optional[str] = None,
) -> None:
    """
    Closed loop: form evidence → graph edges → threat score refresh (Q1 Phase 3).
    Best-effort; failures are logged unless graph strict mode propagates.
    """
    equipment_id = submission.get("equipment_id")
    task_instance_id = submission.get("task_instance_id")
    if not equipment_id and not task_instance_id:
        return

    try:
        from services.reliability_graph import dispatch_graph_sync
        from services.threat_score_service import recalculate_threat_scores_for_asset

        completed_at = submission.get("submitted_at")
        if hasattr(completed_at, "isoformat"):
            completed_at = completed_at.isoformat()
        completed_at = completed_at or datetime.now(timezone.utc).isoformat()

        scheduled_task_id = None
        failure_mode_id = None
        tenant_id = submission.get("tenant_id")
        if task_instance_id:
            inst = await db.task_instances.find_one(
                {"_id": task_instance_id},
                {"scheduled_task_id": 1, "failure_mode_id": 1, "equipment_id": 1, "tenant_id": 1},
            )
            if not inst:
                inst = await db.task_instances.find_one(
                    {"id": task_instance_id},
                    {"scheduled_task_id": 1, "failure_mode_id": 1, "equipment_id": 1, "tenant_id": 1},
                )
            if inst:
                scheduled_task_id = inst.get("scheduled_task_id")
                failure_mode_id = inst.get("failure_mode_id")
                equipment_id = equipment_id or inst.get("equipment_id")
                tenant_id = tenant_id or inst.get("tenant_id")

            await dispatch_graph_sync(
                "sync_task_instance_completion_edges",
                "form_submission",
                task_instance_id=str(task_instance_id),
                equipment_id=equipment_id,
                failure_mode_id=failure_mode_id,
                scheduled_task_id=scheduled_task_id,
                completed_at=completed_at,
                tenant_id=tenant_id,
                findings_text=notes or submission.get("form_template_name"),
            )

        if equipment_id:
            equip = await db.equipment_nodes.find_one(
                {"id": equipment_id},
                {"name": 1, "installation_id": 1},
            )
            if equip and equip.get("name"):
                user_ctx = {"id": submitted_by}
                if tenant_id:
                    user_ctx["tenant_id"] = tenant_id
                await recalculate_threat_scores_for_asset(
                    asset_name=equip["name"],
                    user_id=submitted_by or "system",
                    equipment_node_id=equipment_id,
                    installation_id=equip.get("installation_id"),
                    user=user_ctx,
                )
    except Exception as exc:
        logger.warning(
            "Form submission reliability loop failed: %s",
            exc,
            extra={"submission_id": submission.get("id"), "equipment_id": equipment_id},
        )
        from services.reliability_graph_strict import graph_sync_strict

        if graph_sync_strict():
            raise
