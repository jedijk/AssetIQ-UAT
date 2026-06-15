"""My Tasks service — Wave 8 convergence."""
from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException

from database import db
from services.task_instance_bridge import resolve_task_instance
from services.tenant_schema import merge_tenant_filter
from services.work_execution_kpi_materializer import get_or_compute_work_execution_kpis
from services.work_item_query import (
    fetch_work_items,
    safe_isoformat,
    serialize_action_as_task,
    serialize_task,
    _user_can_see_item,
)
from services.work_signal_projection import project_detail

logger = logging.getLogger(__name__)


async def get_my_tasks_kpis(user: dict) -> Dict[str, Any]:
    return await get_or_compute_work_execution_kpis(user)


async def list_my_tasks(
    user: dict,
    *,
    filter_name: str = "open",
    date: Optional[str] = None,
    equipment_id: Optional[str] = None,
    status: Optional[str] = None,
    discipline: Optional[str] = None,
) -> Dict[str, Any]:
    tasks = await fetch_work_items(
        user["id"],
        filter_name=filter_name,
        date=date,
        equipment_id=equipment_id,
        status=status,
        discipline=discipline,
        user=user,
    )
    return {"tasks": tasks, "count": len(tasks), "filter": filter_name}


def _assigned_user_id_str(task: dict) -> Optional[str]:
    raw = task.get("assigned_user_id")
    if raw is None:
        return None
    return str(raw)


def _ensure_user_can_execute_task(task: dict, user_id: str) -> None:
    assigned = _assigned_user_id_str(task)
    if not _user_can_see_item(assigned, user_id):
        raise HTTPException(status_code=403, detail="Not assigned to this task")


async def _process_attachments(raw_attachments: List[dict]) -> List[dict]:
    """Process attachments - upload to object storage if large, otherwise keep base64."""
    processed = []
    
    for att in raw_attachments:
        data = att.get("data", "")
        
        # If attachment has large base64 data (> 100KB), try to upload to storage
        if data and len(data) > 100000:
            try:
                from services.storage_service import is_storage_available, put_object
                
                if is_storage_available():
                    # Extract base64 content (remove data URI prefix)
                    if "," in data:
                        base64_data = data.split(",", 1)[1]
                    else:
                        base64_data = data
                    
                    file_bytes = base64.b64decode(base64_data)
                    
                    # Generate storage path
                    file_ext = att.get("name", "file").split(".")[-1] if "." in att.get("name", "") else "bin"
                    storage_path = f"attachments/{uuid.uuid4()}.{file_ext}"
                    
                    # Upload with timeout
                    result = await asyncio.wait_for(
                        asyncio.get_event_loop().run_in_executor(
                            None, put_object, storage_path, file_bytes, att.get("type", "application/octet-stream")
                        ),
                        timeout=30.0
                    )
                    
                    # put_object returns dict with 'path' key
                    url = result.get("path", storage_path)
                    processed.append({
                        "name": att.get("name"),
                        "type": att.get("type"),
                        "size": len(file_bytes),
                        "url": url,
                    })
                    logger.info(f"Uploaded attachment {att.get('name')} to {url}")
                    continue
                    
            except asyncio.TimeoutError:
                logger.warning(f"Attachment upload timeout for {att.get('name')}")
            except Exception as e:
                logger.warning(f"Failed to upload attachment to storage: {e}")
        
        # Fallback: keep attachment as-is (but truncate large data for MongoDB)
        if data and len(data) > 500000:  # > 500KB - too large for MongoDB
            processed.append({
                "name": att.get("name"),
                "type": att.get("type"),
                "size": att.get("size"),
                "error": "File too large to store",
            })
        else:
            processed.append(att)
    
    return processed


async def _resolve_observation_id_for_task(task: dict) -> Optional[str]:
    """Resolve linked observation/threat id from a task instance document."""
    for key in ("observation_id", "threat_id", "source_observation_id"):
        if task.get(key):
            return str(task[key])
    if task.get("created_from_observation") and task.get("source_id"):
        return str(task["source_id"])
    return None


async def _attach_work_signal(task: dict, user: Optional[dict]) -> None:
    """Add unified work_signal when task links to an observation/threat."""
    obs_id = await _resolve_observation_id_for_task(task)
    if not obs_id:
        return
    obs = await db.threats.find_one(
        merge_tenant_filter({"id": obs_id}, user),
        {"_id": 0},
    )
    if obs:
        task["work_signal"] = project_detail(obs)


async def _load_task_instance_detail(task: dict, user_id: str, user: Optional[dict] = None) -> dict:
    """Enrich a task_instances document for My Tasks detail/start responses."""
    _ensure_user_can_execute_task(task, user_id)

    if task.get("equipment_id"):
        eq_query = merge_tenant_filter({"id": task["equipment_id"]}, user)
        equipment = await db.equipment_nodes.find_one(eq_query)
        if not equipment:
            equipment = await db.equipment.find_one({"_id": task["equipment_id"]})
        if equipment:
            task["equipment_name"] = equipment.get("name", "Unknown")
            task["equipment_tag"] = equipment.get("tag", "")

    if task.get("task_plan_id"):
        plan_oid = task["task_plan_id"]
        try:
            if isinstance(plan_oid, str):
                plan_oid = ObjectId(plan_oid)
        except Exception:
            plan_oid = task["task_plan_id"]
        plan = await db.task_plans.find_one({"_id": plan_oid})
        if not plan and isinstance(task.get("task_plan_id"), str):
            plan = await db.maintenance_programs_v2.find_one({"id": task["task_plan_id"]})
        if plan:
            task["is_recurring"] = True
            task["frequency_display"] = f"Every {plan.get('interval_value', 0)} {plan.get('interval_unit', 'days')}"

            if plan.get("task_template_id"):
                template = await db.task_templates.find_one({"_id": plan["task_template_id"]})
                if template:
                    task["template"] = {
                        "name": template.get("name"),
                        "description": template.get("description"),
                        "mitigation_strategy": template.get("mitigation_strategy"),
                        "procedure_steps": template.get("procedure_steps", []),
                        "safety_requirements": template.get("safety_requirements", []),
                        "tools_required": template.get("tools_required", []),
                    }
                    task["mitigation_strategy"] = template.get("mitigation_strategy", "")

            form_template_id = plan.get("form_template_id")
            if form_template_id:
                form_template = await db.form_templates.find_one({"_id": ObjectId(form_template_id)})
                if form_template:
                    task["form_fields"] = form_template.get("fields", [])

    last_execution = await db.task_executions.find_one(
        {"task_plan_id": task.get("task_plan_id"), "status": "completed"},
        sort=[("completed_at", -1)],
    )
    if last_execution:
        task["last_completed"] = last_execution.get("completed_at")

    return task


async def get_task_detail(user: dict, task_id: str):
    """Get detailed information about a specific task."""
    user_id = user["id"]
    task = await resolve_task_instance(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task = await _load_task_instance_detail(task, user_id, user=user)
    await _attach_work_signal(task, user)
    return serialize_task(task)


async def start_task(user: dict, task_id: str):
    """Mark a task as started/in-progress."""
    user_id = user["id"]
    task = await resolve_task_instance(task_id, triggered_by_user_id=user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _ensure_user_can_execute_task(task, user_id)

    now = datetime.now(timezone.utc)
    try:
        user_id_value = ObjectId(user_id)
    except Exception:
        user_id_value = user_id

    await db.task_instances.update_one(
        {"_id": task["_id"]},
        {
            "$set": {
                "status": "in_progress",
                "started_at": now,
                "started_by": user_id_value,
                "updated_at": now,
            }
        },
    )

    updated_task = await db.task_instances.find_one({"_id": task["_id"]})
    updated_task = await _load_task_instance_detail(updated_task, user_id, user=user)
    return serialize_task(updated_task)


async def complete_action(user: dict, action_id: str, data: Optional[dict] = None):
    """Mark an action as completed from My Tasks."""
    user_id = user["id"]
    
    # Find the action
    action = await db.central_actions.find_one({"id": action_id, "created_by": user_id})
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Update action status
    now = datetime.now(timezone.utc)
    update_data = {
        "status": "completed",
        "completed_at": now.isoformat(),
        "completed_by": user_id,
        "completed_by_name": user.get("name", "Unknown"),
        "updated_at": now.isoformat(),
    }
    
    # Add completion notes if provided
    if data:
        if data.get("completion_notes"):
            update_data["completion_notes"] = data["completion_notes"]
        # Store form data if provided
        if data.get("form_data"):
            update_data["form_data"] = data["form_data"]
        # Store AI extraction traceability data if provided
        if data.get("ai_extraction"):
            update_data["ai_extraction"] = data["ai_extraction"]
        # Process and store attachments if provided
        if data.get("attachments"):
            processed_attachments = await _process_attachments(data["attachments"])
            update_data["attachments"] = processed_attachments
    
    await db.central_actions.update_one(
        {"id": action_id},
        {"$set": update_data}
    )
    
    # Create observation if issue was found
    if data and data.get("create_observation") and data.get("issues_found"):
        issues = data.get("issues_found", [])
        issue_text = issues[0] if issues else "Issue found during action execution"
        severity = data.get("issue_severity", "medium")
        
        severity_map = {
            "low": {"impact": "Minor", "likelihood": "Unlikely", "risk_level": "Low", "score": 40},
            "medium": {"impact": "Moderate", "likelihood": "Possible", "risk_level": "Medium", "score": 60},
            "high": {"impact": "Major", "likelihood": "Likely", "risk_level": "High", "score": 80},
        }
        risk_data = severity_map.get(severity, severity_map["medium"])
        
        observation_doc = {
            "id": str(uuid.uuid4()),
            "title": f"Issue: {issue_text[:100]}",
            "description": f"Issue discovered during action execution.\n\nAction: {action.get('title', 'Unknown')}\n\nDetails: {issue_text}",
            "status": "Open",
            "priority": "high" if severity == "high" else "medium",
            "asset": action.get("source_name", ""),
            "equipment_type": "",
            "failure_mode": "",
            "impact": risk_data["impact"],
            "likelihood": risk_data["likelihood"],
            "frequency": "Once",
            "detectability": "Moderate",
            "risk_level": risk_data["risk_level"],
            "risk_score": risk_data["score"],
            "cause": data.get("follow_up_notes") or data.get("completion_notes") or "",
            "source": "action_execution",
            "source_action_id": action_id,
            "created_at": now,
            "updated_at": now,
            "created_by_action": True,
        }
        
        await db.threats.insert_one(observation_doc)
        logger.info(f"Created observation from action: {observation_doc['id']}")
    
    # Check if all actions for the source are now completed
    from services.observation_mitigation import build_action_plan_completion_notification

    completion_notification = await build_action_plan_completion_notification(
        action,
        user_id=user_id,
    )
    
    response = {"success": True, "message": "Action completed successfully"}
    if completion_notification:
        response["completion_notification"] = completion_notification
    
    return response


async def start_action(user: dict, action_id: str):
    """Mark an action as in-progress from My Tasks."""
    user_id = user["id"]
    
    # Find the action
    action = await db.central_actions.find_one({"id": action_id, "created_by": user_id})
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Update action status
    now = datetime.now(timezone.utc)
    await db.central_actions.update_one(
        {"id": action_id},
        {
            "$set": {
                "status": "in_progress",
                "started_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
        }
    )
    
    # Return updated action
    updated_action = await db.central_actions.find_one({"id": action_id}, {"_id": 0})
    return serialize_action_as_task(updated_action)


async def get_adhoc_plans(user: dict):
    """Get all active ad-hoc plans that can be executed on-demand."""
    
    # Find all active plans that are ad-hoc
    query = {
        "is_active": True,
        "is_adhoc": True
    }
    
    # Collect all plans first to batch lookups
    raw_plans = await db.task_plans.find(query).sort("created_at", -1).to_list(length=100)
    
    # ============================================
    # BATCH LOOKUP: Extract all unique IDs upfront
    # ============================================
    template_ids_str = set()
    template_ids_oid = set()
    equipment_ids = set()
    form_template_ids = set()
    plan_str_ids = []
    
    for plan in raw_plans:
        template_id = plan.get("task_template_id")
        if template_id:
            template_ids_str.add(str(template_id))
            try:
                template_ids_oid.add(ObjectId(str(template_id)))
            except Exception:
                pass
        
        if plan.get("equipment_id") and not plan.get("equipment_name"):
            equipment_ids.add(plan["equipment_id"])
        
        if plan.get("form_template_id"):
            form_template_ids.add(str(plan["form_template_id"]))
        
        plan_str_ids.append(plan.get("id") or str(plan["_id"]))
    
    # Batch fetch task templates (try by _id ObjectId)
    template_map = {}
    if template_ids_oid:
        templates_cursor = db.task_templates.find({"_id": {"$in": list(template_ids_oid)}})
        async for tmpl in templates_cursor:
            template_map[str(tmpl["_id"])] = tmpl
    
    # Also try by string 'id' field for any missing templates
    missing_ids = template_ids_str - set(template_map.keys())
    if missing_ids:
        templates_cursor = db.task_templates.find({"id": {"$in": list(missing_ids)}})
        async for tmpl in templates_cursor:
            template_map[tmpl.get("id")] = tmpl
    
    # Batch fetch equipment
    equipment_map = {}
    if equipment_ids:
        equipment_cursor = db.equipment.find({"id": {"$in": list(equipment_ids)}}, {"id": 1, "name": 1})
        async for eq in equipment_cursor:
            equipment_map[eq["id"]] = eq.get("name", "Unknown Equipment")
    
    # Batch fetch form templates
    form_template_map = {}
    if form_template_ids:
        form_cursor = db.form_templates.find({"id": {"$in": list(form_template_ids)}})
        async for ft in form_cursor:
            form_template_map[ft.get("id")] = ft
    
    # Batch check for in-progress tasks
    in_progress_map = {}
    if plan_str_ids:
        ip_cursor = db.task_instances.find(
            {"task_plan_id": {"$in": plan_str_ids}, "status": "in_progress"},
            {"_id": 1, "task_plan_id": 1}
        )
        async for ip_task in ip_cursor:
            in_progress_map[ip_task["task_plan_id"]] = str(ip_task["_id"])
    
    # ============================================
    # PROCESS PLANS using pre-fetched lookups
    # ============================================
    plans = []
    for plan in raw_plans:
        # Get template from map
        template_name = plan.get("task_template_name", "Unknown Task")
        template = None
        template_id = plan.get("task_template_id")
        if template_id:
            template = template_map.get(str(template_id))
        
        # Get equipment name from map
        equipment_name = plan.get("equipment_name", "Unknown Equipment")
        if plan.get("equipment_id") and not equipment_name:
            equipment_name = equipment_map.get(plan["equipment_id"], "Unknown Equipment")
        
        # Get form template from map
        form_template = None
        if plan.get("form_template_id"):
            form_template = form_template_map.get(str(plan["form_template_id"]))
        
        # Check for in-progress task from map
        plan_str_id = plan.get("id") or str(plan["_id"])
        in_progress_task_id = in_progress_map.get(plan_str_id)
        
        plans.append({
            "id": plan_str_id,
            "title": template_name,
            "description": template.get("description", "") if template else "",
            "equipment_id": plan.get("equipment_id"),
            "equipment_name": equipment_name,
            "task_template_id": str(plan.get("task_template_id", "")),
            "task_template_name": template_name,
            "discipline": template.get("discipline", "") if template else "",
            "form_template_id": plan.get("form_template_id"),
            "form_template_name": plan.get("form_template_name") or (form_template.get("name") if form_template else None),
            "has_form": bool(plan.get("form_template_id")),
            "assigned_team": plan.get("assigned_team"),
            "assigned_user_id": plan.get("assigned_user_id"),
            "notes": plan.get("notes"),
            "last_executed_at": safe_isoformat(plan.get("last_executed_at")),
            "execution_count": plan.get("execution_count", 0),
            "created_at": safe_isoformat(plan.get("created_at")),
            "has_in_progress_task": bool(in_progress_task_id),
            "in_progress_task_id": in_progress_task_id,
        })
    
    return {
        "plans": plans,
        "count": len(plans)
    }


async def execute_adhoc_plan(user: dict, plan_id: str):
    """Create a task instance from an ad-hoc plan for immediate execution."""
    
    # Find the plan - try by string id first, then ObjectId
    plan = await db.task_plans.find_one({"id": plan_id})
    if not plan:
        try:
            plan = await db.task_plans.find_one({"_id": ObjectId(plan_id)})
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid plan ID")
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    if not plan.get("is_adhoc"):
        raise HTTPException(status_code=400, detail="This is not an ad-hoc plan")
    
    if not plan.get("is_active"):
        raise HTTPException(status_code=400, detail="This plan is inactive")
    
    # Check if there's already an in-progress task for this plan
    plan_str_id = plan.get("id") or str(plan["_id"])
    existing_task = await db.task_instances.find_one({
        "task_plan_id": plan_str_id,
        "status": "in_progress"
    })
    
    if existing_task:
        # Enrich with photo_extraction_config from form template if missing
        if not existing_task.get("photo_extraction_config") and plan.get("form_template_id"):
            ft = await db.form_templates.find_one({"_id": ObjectId(plan["form_template_id"])}) if ObjectId.is_valid(str(plan["form_template_id"])) else None
            if ft:
                existing_task["photo_extraction_config"] = ft.get("photo_extraction_config")
        return serialize_task(existing_task)
    
    # Get template details - try by string id first, then ObjectId
    template = None
    template_id = plan.get("task_template_id")
    if template_id:
        template = await db.task_templates.find_one({"id": template_id})
        if not template:
            try:
                template = await db.task_templates.find_one({"_id": ObjectId(template_id)})
            except Exception:
                pass
    
    # Get form template and its fields
    form_fields = []
    form_documents = []
    form_template = None
    if plan.get("form_template_id"):
        # Try finding by 'id' field first (string ID)
        form_template = await db.form_templates.find_one({"id": plan["form_template_id"]})
        # If not found, try by ObjectId
        if not form_template:
            try:
                form_template = await db.form_templates.find_one({"_id": ObjectId(plan["form_template_id"])})
            except Exception:
                pass
        if form_template:
            form_fields = form_template.get("fields", [])
            form_documents = form_template.get("documents", [])
    
    # Create a new task instance
    now = datetime.now(timezone.utc)
    
    task_instance = {
        "id": str(uuid.uuid4()),  # Add explicit id field
        "task_plan_id": plan.get("id") or str(plan["_id"]),
        "task_template_id": plan.get("task_template_id"),
        "task_template_name": plan.get("task_template_name", "Ad-hoc Task"),
        "title": plan.get("task_template_name", "Ad-hoc Task"),
        "description": template.get("description", "") if template else "",
        "equipment_id": plan.get("equipment_id"),
        "equipment_name": plan.get("equipment_name"),
        "discipline": template.get("discipline", "") if template else "",
        "mitigation_strategy": template.get("discipline", "") if template else "",
        "form_template_id": plan.get("form_template_id"),
        "form_template_name": plan.get("form_template_name") or (form_template.get("name") if form_template else None),
        "form_fields": form_fields,
        "form_documents": form_documents,
        "photo_extraction_config": form_template.get("photo_extraction_config") if form_template else None,
        "status": "in_progress",  # Start immediately
        "priority": template.get("priority", "medium") if template else "medium",
        "due_date": now,  # Due immediately
        "scheduled_date": now,
        "started_at": now,
        "assigned_team": plan.get("assigned_team"),
        "assigned_user_id": plan.get("assigned_user_id") or user.get("user_id"),
        "assignee": user.get("name", ""),
        "source": "adhoc",
        "source_type": "task",
        "is_adhoc": True,
        "created_by": user.get("user_id"),
        "created_at": now,
        "updated_at": now,
    }
    
    result = await db.task_instances.insert_one(task_instance)
    task_instance["_id"] = result.inserted_id
    
    # Update plan's last_executed_at and execution_count - use the correct query field
    plan_query = {"id": plan_id} if plan.get("id") == plan_id else {"_id": plan["_id"]}
    await db.task_plans.update_one(
        plan_query,
        {
            "$set": {"last_executed_at": now, "updated_at": now},
            "$inc": {"execution_count": 1}
        }
    )
    
    return serialize_task(task_instance)
