"""
Task instance completion helpers — observation creation, form submission, graph sync.

Extracted from task_service.py to keep the main service module under the LOC budget.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


async def sync_reliability_graph_on_complete(
    db,
    instance: Dict[str, Any],
    result: Dict[str, Any],
    completed_at: datetime,
) -> None:
    """Materialize reliability graph edges after task instance completion."""
    from services.reliability_graph_strict import graph_sync_strict

    strict = graph_sync_strict()
    try:
        from services.reliability_graph import dispatch_graph_sync
        from services.tenant_schema import merge_tenant_filter

        ti_id = str(result.get("id") or instance.get("id") or instance.get("_id", ""))
        sched_id = instance.get("scheduled_task_id")
        equipment_id = instance.get("equipment_id")
        failure_mode_id = instance.get("failure_mode_id")
        if not failure_mode_id:
            meta = instance.get("metadata") or {}
            failure_mode_id = meta.get("failure_mode_id")

        tenant_id = instance.get("tenant_id")
        tenant_user = {"company_id": tenant_id} if tenant_id else None

        if sched_id:
            sched_query = merge_tenant_filter({"id": sched_id}, tenant_user)
            scheduled_task = await db.scheduled_tasks.find_one(sched_query)
            if scheduled_task:
                await dispatch_graph_sync(
                    "sync_edges_for_scheduled_task",
                    f"scheduled_task_completed_{sched_id}",
                    scheduled_task=scheduled_task,
                    event="completed",
                    tenant_id=tenant_id or scheduled_task.get("tenant_id"),
                    metadata={
                        "completed_at": completed_at.isoformat(),
                        "task_instance_id": ti_id,
                    },
                )

        findings_text = (
            result.get("findings")
            or instance.get("findings")
            or (result.get("completion_data") or {}).get("findings")
        )
        await dispatch_graph_sync(
            "sync_task_instance_completion_edges",
            f"task_instance_completed_{ti_id}",
            task_instance_id=ti_id,
            equipment_id=equipment_id,
            failure_mode_id=failure_mode_id,
            scheduled_task_id=sched_id,
            completed_at=completed_at.isoformat(),
            findings_text=findings_text,
            tenant_id=tenant_id,
        )
    except Exception as exc:
        logger.warning("task instance graph edge sync failed: %s", exc)
        if strict:
            raise


async def create_observation_from_task(
    db,
    task_instance: Dict[str, Any],
    completion_data: Dict[str, Any],
    timestamp: datetime,
    *,
    user: Optional[dict] = None,
) -> Optional[str]:
    """Create an observation/threat from a completed task with issues."""
    from services.tenant_schema import with_tenant_id

    issues = completion_data.get("issues_found", [])
    issue_text = issues[0] if issues else "Issue found during task execution"
    task_title = task_instance.get("task_template_name") or "Task"
    equipment_name = task_instance.get("equipment_name") or "Unknown Equipment"

    severity = completion_data.get("issue_severity", "medium")
    severity_map = {
        "low": {"impact": "Minor", "likelihood": "Unlikely", "risk_level": "Low"},
        "medium": {"impact": "Moderate", "likelihood": "Possible", "risk_level": "Medium"},
        "high": {"impact": "Major", "likelihood": "Likely", "risk_level": "High"},
    }
    risk_data = severity_map.get(severity, severity_map["medium"])

    tenant_user = user
    if not tenant_user and task_instance.get("tenant_id"):
        tenant_user = {"company_id": task_instance["tenant_id"]}

    observation_doc = with_tenant_id({
        "id": str(uuid.uuid4()),
        "title": f"Issue: {issue_text[:100]}",
        "description": (
            f"Issue discovered during task execution.\n\n"
            f"Task: {task_title}\nEquipment: {equipment_name}\n\nDetails: {issue_text}"
        ),
        "status": "Open",
        "priority": "high" if severity == "high" else "medium",
        "asset": equipment_name,
        "equipment_type": task_instance.get("discipline", ""),
        "failure_mode": "",
        "impact": risk_data["impact"],
        "likelihood": risk_data["likelihood"],
        "frequency": "Once",
        "detectability": "Moderate",
        "risk_level": risk_data["risk_level"],
        "risk_score": 40 if severity == "low" else (60 if severity == "medium" else 80),
        "cause": completion_data.get("follow_up_notes") or completion_data.get("completion_notes") or "",
        "source": "task_execution",
        "source_task_id": str(task_instance.get("_id", "")),
        "linked_equipment_id": task_instance.get("equipment_id"),
        "created_at": timestamp,
        "updated_at": timestamp,
        "created_by_task": True,
    }, tenant_user)

    try:
        await db.threats.insert_one(observation_doc)
        logger.info("Created observation from task: %s", observation_doc["id"])

        from services.threat_observation_bridge import sync_threat_mirror

        await sync_threat_mirror(observation_doc, user=tenant_user)

        from services.reliability_graph import dispatch_graph_sync

        equipment_id = task_instance.get("equipment_id")
        await dispatch_graph_sync(
            "sync_threat_edges",
            "task_observation_threat",
            threat_id=observation_doc["id"],
            equipment_id=equipment_id,
            tenant_id=observation_doc.get("tenant_id"),
        )
        return observation_doc["id"]
    except Exception as e:
        logger.error("Failed to create observation from task: %s", e)
        return None


async def create_form_submission_from_task(
    db,
    task_instance: Dict[str, Any],
    completion_data: Dict[str, Any],
    timestamp: datetime,
    submitted_by_id: str,
    submitted_by_name: str,
) -> Optional[str]:
    """Create a form submission record when a task with form is completed."""
    from bson import ObjectId

    form_data = completion_data.get("form_data", {})

    values = []
    if isinstance(form_data, dict):
        for field_id, value in form_data.items():
            values.append({
                "field_id": field_id,
                "field_label": field_id,
                "value": value,
            })
    elif isinstance(form_data, list):
        values = form_data

    raw_attachments = completion_data.get("attachments", [])
    processed_attachments = []

    for att in raw_attachments:
        data = att.get("data", "")
        if data and len(data) > 100000:
            try:
                from services.storage_service import is_storage_available, put_object_async
                if is_storage_available():
                    if "," in data:
                        base64_data = data.split(",", 1)[1]
                    else:
                        base64_data = data

                    file_bytes = base64.b64decode(base64_data)
                    file_ext = att.get("name", "file").split(".")[-1] if "." in att.get("name", "") else "bin"
                    storage_path = f"attachments/{uuid.uuid4()}.{file_ext}"

                    try:
                        result = await asyncio.wait_for(
                            put_object_async(
                                storage_path,
                                file_bytes,
                                att.get("type", "application/octet-stream"),
                            ),
                            timeout=30.0,
                        )
                        url = result.get("path", storage_path)
                        processed_attachments.append({
                            "name": att.get("name"),
                            "type": att.get("type"),
                            "size": len(file_bytes),
                            "url": url,
                        })
                        logger.info("Uploaded attachment %s to %s", att.get("name"), url)
                        continue
                    except asyncio.TimeoutError:
                        logger.warning("Attachment upload timeout for %s", att.get("name"))
            except Exception as e:
                logger.warning("Failed to upload attachment to storage: %s", e)

        if data and len(data) > 500000:
            processed_attachments.append({
                "name": att.get("name"),
                "type": att.get("type"),
                "size": att.get("size"),
                "error": "File too large to store",
            })
        else:
            processed_attachments.append(att)

    submission_doc = {
        "id": str(uuid.uuid4()),
        "form_template_id": task_instance.get("form_template_id"),
        "form_template_name": task_instance.get("form_template_name"),
        "task_instance_id": (
            str(task_instance.get("_id")) if task_instance.get("_id") else task_instance.get("id")
        ),
        "task_template_name": task_instance.get("task_template_name"),
        "equipment_id": task_instance.get("equipment_id"),
        "equipment_name": task_instance.get("equipment_name"),
        "discipline": task_instance.get("discipline"),
        "values": values,
        "attachments": processed_attachments,
        "notes": completion_data.get("completion_notes"),
        "submitted_by": submitted_by_id,
        "submitted_by_name": submitted_by_name,
        "submitted_at": timestamp,
        "label_template_id": None,
        "has_warnings": False,
        "has_critical": False,
        "has_signature": False,
        "status": "completed",
        "created_at": timestamp,
    }

    try:
        ft_id = task_instance.get("form_template_id")
        if ft_id:
            form_tpl = await db.form_templates.find_one(
                {"_id": ObjectId(str(ft_id))},
                {"_id": 0, "label_print_config": 1},
            )
            label_cfg = form_tpl.get("label_print_config") if isinstance(form_tpl, dict) else None
            if isinstance(label_cfg, dict):
                submission_doc["label_template_id"] = label_cfg.get("label_template_id")
    except Exception:
        pass

    ai_extraction = completion_data.get("ai_extraction")
    if ai_extraction:
        submission_doc["ai_extraction"] = ai_extraction

    try:
        await db.form_submissions.insert_one(submission_doc)
        logger.info("Created form submission: %s", submission_doc["id"])
        try:
            from services.form_service import FormService
            await FormService(db).try_auto_pair_mooney_viscosity(submission_doc)
        except Exception as pair_err:
            logger.warning(
                "Mooney viscosity auto-pair failed for task submission %s: %s",
                submission_doc.get("id"),
                pair_err,
            )
        return submission_doc["id"]
    except Exception as e:
        logger.error("Failed to create form submission: %s", e)
        return None
