"""
Task Management Service - Handles task templates, plans, and instances.

Implements:
- Task Templates: Reusable task definitions
- Task Plans: Equipment-specific task schedules
- Task Instances: Individual scheduled tasks
- Auto-scheduling: Generate instances from plans
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from services.tenant_scope import scoped, scoped_job
from services.tenant_schema import BACKFILL_TENANT_ID, with_tenant_id
from services.task_service_helpers import (
    calculate_next_due,
    serialize_instance,
)
from services import task_service_scheduling
from services.task_service_plans import (
    create_plan as _create_plan,
    delete_plan as _delete_plan,
    get_plan_by_id as _get_plan_by_id,
    get_plans as _get_plans,
    update_plan as _update_plan,
)
from services.task_service_templates import (
    create_template as _create_template,
    delete_template as _delete_template,
    get_template_by_id as _get_template_by_id,
    get_templates as _get_templates,
    update_template as _update_template,
)

logger = logging.getLogger(__name__)


class TaskService:
    """Service for task management operations."""

    @staticmethod
    def _scope(user: Optional[dict], query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return scoped(user, query) if user else scoped_job(query)

    @staticmethod
    def _stamp_user(user: Optional[dict]) -> Optional[dict]:
        if user:
            return user
        if BACKFILL_TENANT_ID:
            return {"company_id": BACKFILL_TENANT_ID}
        return None
    
    def __init__(self, db):
        """Initialize with a database proxy (supports dynamic per-request switching)."""
        self.db = db
        self.templates = db["task_templates"]
        self.plans = db["task_plans"]
        self.instances = db["task_instances"]
        self.equipment = db["equipment_nodes"]
        self.efms = db["equipment_failure_modes"]
    
    # ==================== TASK TEMPLATES ====================

    async def create_template(
        self, data: Dict[str, Any], created_by: str, user: Optional[dict] = None
    ) -> Dict[str, Any]:
        return await _create_template(
            templates=self.templates,
            data=data,
            created_by=created_by,
            scope=self._scope,
            stamp_user=self._stamp_user,
            user=user,
        )

    async def get_templates(
        self,
        discipline: Optional[str] = None,
        mitigation_strategy: Optional[str] = None,
        equipment_type_id: Optional[str] = None,
        search: Optional[str] = None,
        active_only: bool = True,
        skip: int = 0,
        limit: int = 100,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        return await _get_templates(
            templates=self.templates,
            scope=self._scope,
            discipline=discipline,
            mitigation_strategy=mitigation_strategy,
            equipment_type_id=equipment_type_id,
            search=search,
            active_only=active_only,
            skip=skip,
            limit=limit,
            user=user,
        )

    async def get_template_by_id(
        self, template_id: str, user: Optional[dict] = None
    ) -> Optional[Dict[str, Any]]:
        return await _get_template_by_id(
            templates=self.templates,
            scope=self._scope,
            template_id=template_id,
            user=user,
        )

    async def update_template(
        self, template_id: str, data: Dict[str, Any], user: Optional[dict] = None
    ) -> Optional[Dict[str, Any]]:
        return await _update_template(
            templates=self.templates,
            scope=self._scope,
            template_id=template_id,
            data=data,
            user=user,
        )

    async def delete_template(self, template_id: str, user: Optional[dict] = None) -> bool:
        return await _delete_template(
            templates=self.templates,
            plans=self.plans,
            scope=self._scope,
            template_id=template_id,
            user=user,
        )

    # ==================== TASK PLANS ====================

    async def create_plan(
        self, data: Dict[str, Any], created_by: str, user: Optional[dict] = None
    ) -> Dict[str, Any]:
        return await _create_plan(
            db=self.db,
            templates=self.templates,
            plans=self.plans,
            equipment=self.equipment,
            data=data,
            created_by=created_by,
            scope=self._scope,
            stamp_user=self._stamp_user,
            get_template_by_id=self.get_template_by_id,
            user=user,
        )

    async def get_plans(
        self,
        equipment_id: Optional[str] = None,
        template_id: Optional[str] = None,
        active_only: bool = True,
        due_before: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        return await _get_plans(
            plans=self.plans,
            scope=self._scope,
            equipment_id=equipment_id,
            template_id=template_id,
            active_only=active_only,
            due_before=due_before,
            skip=skip,
            limit=limit,
            user=user,
        )

    async def get_plan_by_id(
        self, plan_id: str, user: Optional[dict] = None
    ) -> Optional[Dict[str, Any]]:
        return await _get_plan_by_id(
            plans=self.plans,
            scope=self._scope,
            plan_id=plan_id,
            user=user,
        )

    async def update_plan(
        self, plan_id: str, data: Dict[str, Any], user: Optional[dict] = None
    ) -> Optional[Dict[str, Any]]:
        return await _update_plan(
            plans=self.plans,
            scope=self._scope,
            plan_id=plan_id,
            data=data,
            user=user,
        )

    async def delete_plan(self, plan_id: str, user: Optional[dict] = None) -> bool:
        return await _delete_plan(
            templates=self.templates,
            plans=self.plans,
            scope=self._scope,
            plan_id=plan_id,
            user=user,
        )
    
    # ==================== TASK INSTANCES ====================
    
    async def create_instance(
        self, data: Dict[str, Any], created_by: str, user: Optional[dict] = None
    ) -> Dict[str, Any]:
        """Create a task instance."""
        now = datetime.now(timezone.utc)
        
        plan = await self.get_plan_by_id(data["task_plan_id"], user=user)
        if not plan:
            raise ValueError("Task plan not found")
        
        template = await self.get_template_by_id(plan["task_template_id"], user=user)
        
        doc = {
            "id": str(uuid.uuid4()),
            "task_plan_id": data["task_plan_id"],
            "task_template_id": plan["task_template_id"],
            "task_template_name": plan["task_template_name"],
            "equipment_id": plan["equipment_id"],
            "equipment_name": plan["equipment_name"],
            "efm_id": plan.get("efm_id"),
            "scheduled_date": data["scheduled_date"],
            "due_date": data["due_date"],
            "status": "planned",
            "priority": data.get("priority", "medium"),
            "assigned_team": data.get("assigned_team") or plan.get("assigned_team"),
            "assigned_user_id": data.get("assigned_user_id") or plan.get("assigned_user_id"),
            "discipline": template["discipline"] if template else None,
            "estimated_duration_minutes": template.get("estimated_duration_minutes") if template else None,
            "started_at": None,
            "completed_at": None,
            "actual_duration_minutes": None,
            "completion_notes": None,
            "issues_found": [],
            "follow_up_required": False,
            "follow_up_notes": None,
            "form_data": None,
            "notes": data.get("notes"),
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        
        result = await self.instances.insert_one(with_tenant_id(doc, self._stamp_user(user)))
        doc["_id"] = result.inserted_id
        
        return serialize_instance(doc)
    
    async def create_adhoc_instance(
        self, data: Dict[str, Any], created_by: str, user: Optional[dict] = None
    ) -> Dict[str, Any]:
        """Create an ad-hoc task instance directly from a template (no plan required)."""
        now = datetime.now(timezone.utc)
        
        # Get template details
        template = await self.get_template_by_id(data["task_template_id"], user=user)
        if not template:
            raise ValueError("Task template not found")
        
        # Set default dates
        scheduled_date = data.get("scheduled_date") or now
        if isinstance(scheduled_date, str):
            scheduled_date = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
        
        due_date = data.get("due_date")
        if due_date:
            if isinstance(due_date, str):
                due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        else:
            # Default: 1 day after scheduled date
            due_date = scheduled_date + timedelta(days=1)
        
        # Get equipment name if equipment_id provided
        equipment_name = data.get("equipment_name")
        if data.get("equipment_id") and not equipment_name:
            equipment = await self.equipment.find_one(self._scope(user, {"id": data["equipment_id"]}))
            if equipment:
                equipment_name = equipment.get("name", "Unknown")
        
        # Get form template if linked to template
        form_fields = []
        form_template_name = None
        if template.get("form_template_id"):
            try:
                form_template = await self.db.form_templates.find_one(
                    self._scope(user, {"_id": ObjectId(str(template["form_template_id"]))})
                )
                if form_template:
                    form_fields = form_template.get("fields", [])
                    form_template_name = form_template.get("name", "")
            except Exception as e:
                logger.warning(f"Failed to fetch form template: {e}")
        
        doc = {
            "id": str(uuid.uuid4()),
            "task_plan_id": None,  # No plan for ad-hoc tasks
            "task_template_id": data["task_template_id"],
            "task_template_name": template["name"],
            "equipment_id": data.get("equipment_id"),
            "equipment_name": equipment_name,
            "efm_id": None,
            "scheduled_date": scheduled_date,
            "due_date": due_date,
            "status": "planned",
            "priority": data.get("priority", "medium"),
            "assigned_team": data.get("assigned_team"),
            "assigned_user_id": data.get("assigned_user_id"),
            "discipline": template.get("discipline"),
            "mitigation_strategy": template.get("mitigation_strategy"),
            "estimated_duration_minutes": template.get("estimated_duration_minutes"),
            "form_fields": form_fields,
            "form_template_name": form_template_name,
            "photo_extraction_config": form_template.get("photo_extraction_config") if form_template else None,
            "started_at": None,
            "completed_at": None,
            "actual_duration_minutes": None,
            "completion_notes": None,
            "issues_found": [],
            "follow_up_required": False,
            "follow_up_notes": None,
            "form_data": None,
            "notes": data.get("notes"),
            "is_adhoc": True,  # Mark as ad-hoc task
            "source": "adhoc",
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        
        result = await self.instances.insert_one(with_tenant_id(doc, self._stamp_user(user)))
        doc["_id"] = result.inserted_id
        
        return serialize_instance(doc)
    
    async def get_instances(
        self,
        equipment_id: Optional[str] = None,
        plan_id: Optional[str] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        assigned_user_id: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Get task instances with filters."""
        import asyncio
        
        query = {}
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        
        if plan_id:
            query["task_plan_id"] = plan_id
        
        if status:
            query["status"] = status
        
        if priority:
            query["priority"] = priority
        
        if assigned_user_id:
            query["assigned_user_id"] = assigned_user_id
        
        if from_date or to_date:
            query["scheduled_date"] = {}
            if from_date:
                query["scheduled_date"]["$gte"] = from_date
            if to_date:
                query["scheduled_date"]["$lte"] = to_date
        
        # Projection to limit fields returned (for performance)
        projection = {
            "_id": 1,
            "id": 1,
            "task_plan_id": 1,
            "task_template_name": 1,
            "task_type": 1,
            "equipment_id": 1,
            "equipment_name": 1,
            "installation_name": 1,
            "scheduled_date": 1,
            "due_date": 1,
            "status": 1,
            "priority": 1,
            "assigned_user_id": 1,
            "assigned_user_name": 1,
            "completed_at": 1,
            "created_at": 1,
            "description": 1
        }
        
        # Run count and fetch in parallel for better performance
        scoped_query = self._scope(user, query)
        
        async def fetch_instances():
            cursor = self.instances.find(scoped_query, projection).sort("scheduled_date", 1).skip(skip).limit(limit)
            instances = []
            async for doc in cursor:
                instances.append(serialize_instance(doc))
            return instances
        
        count_task = self.instances.count_documents(scoped_query)
        
        fetch_task = fetch_instances()
        
        total, instances = await asyncio.gather(count_task, fetch_task)
        
        return {"total": total, "instances": instances}
    
    async def get_instance_by_id(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific instance."""
        from services.task_instance_bridge import resolve_task_instance

        doc = await resolve_task_instance(instance_id)
        if doc:
            return serialize_instance(doc)
        return None
    
    async def update_instance(
        self, instance_id: str, data: Dict[str, Any], user: Optional[dict] = None
    ) -> Optional[Dict[str, Any]]:
        """Update a task instance."""
        from services.task_instance_bridge import resolve_task_instance

        instance = await resolve_task_instance(instance_id)
        if not instance:
            return None
        
        update = {"updated_at": datetime.now(timezone.utc)}
        
        allowed_fields = [
            "scheduled_date", "due_date", "status", "priority",
            "assigned_team", "assigned_user_id", "started_at",
            "completed_at", "completion_notes", "notes"
        ]
        
        for field in allowed_fields:
            if field in data and data[field] is not None:
                update[field] = data[field]
        
        result = await self.instances.find_one_and_update(
            self._scope(user, {"_id": instance["_id"]}),
            {"$set": update},
            return_document=True
        )
        
        if result:
            return serialize_instance(result)
        return None
    
    async def start_task(
        self, instance_id: str, user_id: str, user: Optional[dict] = None
    ) -> Optional[Dict[str, Any]]:
        """Mark a task as started."""
        from services.task_instance_bridge import resolve_task_instance

        instance = await resolve_task_instance(instance_id, triggered_by_user_id=user_id)
        if not instance:
            return None

        result = await self.instances.find_one_and_update(
            self._scope(user, {"_id": instance["_id"]}),
            {"$set": {
                "status": "in_progress",
                "started_at": datetime.now(timezone.utc),
                "assigned_user_id": user_id,
                "updated_at": datetime.now(timezone.utc)
            }},
            return_document=True
        )

        if result:
            return serialize_instance(result)
        return None
    
    async def complete_task(
        self,
        instance_id: str,
        data: Dict[str, Any],
        completed_by_id: str = None,
        completed_by_name: str = None,
        user: Optional[dict] = None,
    ) -> Optional[Dict[str, Any]]:
        """Mark a task as completed and update plan."""
        from services.task_instance_bridge import resolve_task_instance

        instance = await resolve_task_instance(
            instance_id,
            triggered_by_user_id=completed_by_id,
        )
        if not instance:
            return None
        
        now = datetime.now(timezone.utc)
        
        # Calculate actual duration if started_at exists
        actual_duration = None
        if instance.get("started_at"):
            started = instance["started_at"]
            if isinstance(started, str):
                started = datetime.fromisoformat(started.replace('Z', '+00:00'))
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            delta = now - started
            actual_duration = int(delta.total_seconds() / 60)
        
        # Process attachments - strip large base64 data before storing in task instance
        # (Full attachments will be stored in form_submissions)
        raw_attachments = data.get("attachments", [])
        lightweight_attachments = []
        for att in raw_attachments:
            # Only store metadata in task instance, not full data
            lightweight_attachments.append({
                "name": att.get("name"),
                "type": att.get("type"),
                "size": att.get("size"),
                "url": att.get("url"),  # Keep URL if present
            })
        
        update = {
            "status": "completed",
            "completed_at": now,
            "completed_by_id": completed_by_id,
            "completed_by_name": completed_by_name,
            "actual_duration_minutes": data.get("actual_duration_minutes") or actual_duration,
            "completion_notes": data.get("completion_notes"),
            "issues_found": data.get("issues_found", []),
            "follow_up_required": data.get("follow_up_required", False),
            "follow_up_notes": data.get("follow_up_notes"),
            "form_data": data.get("form_data"),
            "ai_extraction": data.get("ai_extraction"),
            "attachments": lightweight_attachments,  # Lightweight metadata only
            "updated_at": now,
        }
        
        # Use _id from the found instance for the update query
        result = await self.instances.find_one_and_update(
            self._scope(user, {"_id": instance["_id"]}),
            {"$set": update},
            return_document=True
        )
        
        if result:
            created_submission_id = None
            label_print_config = None
            # Create form submission if form_data is present
            if data.get("form_data") and instance.get("form_template_id"):
                from services.task_service_completion import create_form_submission_from_task

                created_submission_id = await create_form_submission_from_task(
                    self.db, instance, data, now, completed_by_id, completed_by_name
                )
                # Fetch form template to return its label_print_config (so the
                # frontend can trigger auto-print even when the cached task
                # object predates this field being exposed).
                try:
                    from bson import ObjectId as _OID
                    ftid = instance.get("form_template_id")
                    ft = None
                    if ftid:
                        if _OID.is_valid(str(ftid)):
                            ft = await self.db.form_templates.find_one(
                                self._scope(user, {"_id": _OID(str(ftid))}),
                                {"_id": 0, "label_print_config": 1},
                            )
                        if not ft:
                            ft = await self.db.form_templates.find_one(
                                self._scope(user, {"id": str(ftid)}),
                                {"_id": 0, "label_print_config": 1},
                            )
                    if ft:
                        label_print_config = ft.get("label_print_config")
                except Exception as e:
                    logger.warning(f"label_print_config lookup failed: {e}")
            
            # Update plan: set last_executed_at and calculate next_due_date
            plan_id = instance.get("task_plan_id")
            if plan_id:
                # Handle both ObjectId string and UUID formats
                plan = None
                try:
                    plan = await self.plans.find_one(self._scope(user, {"_id": ObjectId(plan_id)}))
                except Exception:
                    # If ObjectId conversion fails, the plan_id might be a UUID
                    # which means there's no valid plan to update
                    pass
                
                if plan:
                    next_due = calculate_next_due(
                        now,
                        plan["interval_value"],
                        plan["interval_unit"]
                    )
                    await self.plans.update_one(
                        self._scope(user, {"_id": plan["_id"]}),
                        {"$set": {
                            "last_executed_at": now,
                            "next_due_date": next_due,
                            "updated_at": now
                        },
                        "$inc": {"execution_count": 1}}
                    )
            
            # Create observation if issue was found and flagged for observation
            if data.get("create_observation") and data.get("issues_found"):
                from services.task_service_completion import create_observation_from_task

                tenant_user = (
                    {"company_id": instance["tenant_id"]}
                    if instance.get("tenant_id")
                    else None
                )
                await create_observation_from_task(
                    self.db, instance, data, now, user=tenant_user
                )

            from services.task_service_completion import sync_reliability_graph_on_complete

            await sync_reliability_graph_on_complete(self.db, instance, result, now)

            serialized = serialize_instance(result)
            if created_submission_id:
                serialized["form_submission_id"] = created_submission_id
            if label_print_config:
                serialized["label_print_config"] = label_print_config

            if user:
                from services.dashboard_read_model_hooks import notify_dashboard_data_changed

                await notify_dashboard_data_changed(user, reason="task_complete")
            return serialized
        return None

    async def delete_instance(self, instance_id: str, user: Optional[dict] = None) -> bool:
        """Delete a task instance."""
        from services.task_instance_bridge import resolve_task_instance

        try:
            instance = await resolve_task_instance(instance_id)
            if not instance:
                return False
            result = await self.instances.delete_one(self._scope(user, {"_id": instance["_id"]}))
            return result.deleted_count > 0
        except Exception:
            return False
    
    # ==================== SCHEDULING ====================
    
    async def generate_instances_for_plan(
        self,
        plan_id: str,
        horizon_days: int = 30,
        created_by: str = "system",
        user: Optional[dict] = None,
    ) -> List[Dict[str, Any]]:
        """Generate task instances for a plan within the horizon and date range."""
        return await task_service_scheduling.generate_instances_for_plan(
            self, plan_id, horizon_days, created_by, user=user
        )

    async def generate_all_due_instances(
        self,
        horizon_days: int = 30,
        created_by: str = "system",
    ) -> Dict[str, Any]:
        """Generate instances for all active plans within their effective date ranges."""
        return await task_service_scheduling.generate_all_due_instances(
            self, horizon_days, created_by
        )

    async def mark_overdue_tasks(self) -> int:
        """Mark tasks past due date as overdue."""
        return await task_service_scheduling.mark_overdue_tasks(self)

    # ==================== DASHBOARD / STATS ====================
    
    async def get_task_stats(
        self, user_id: Optional[str] = None, user: Optional[dict] = None
    ) -> Dict[str, Any]:
        """Get task statistics."""
        
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = today_start + timedelta(days=7)
        
        status_counts = {}
        for status in ["planned", "scheduled", "in_progress", "completed", "overdue"]:
            status_counts[status] = await self.instances.count_documents(
                self._scope(user, {"status": status})
            )
        
        due_this_week = await self.instances.count_documents(
            self._scope(user, {
                "status": {"$in": ["planned", "scheduled"]},
                "due_date": {"$gte": today_start, "$lte": week_end}
            })
        )
        
        completed_this_week = await self.instances.count_documents(
            self._scope(user, {
                "status": "completed",
                "completed_at": {"$gte": today_start}
            })
        )
        
        active_plans = await self.plans.count_documents(self._scope(user, {"is_active": True}))
        active_templates = await self.templates.count_documents(self._scope(user, {"is_active": True}))
        
        return {
            "by_status": status_counts,
            "due_this_week": due_this_week,
            "completed_this_week": completed_this_week,
            "active_plans": active_plans,
            "active_templates": active_templates,
            "overdue_count": status_counts.get("overdue", 0)
        }
    
    async def get_calendar_view(
        self,
        from_date: datetime,
        to_date: datetime,
        equipment_id: Optional[str] = None,
        user: Optional[dict] = None,
    ) -> List[Dict[str, Any]]:
        """Get tasks for calendar view."""
        
        query = {
            "scheduled_date": {"$gte": from_date, "$lte": to_date}
        }
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        
        cursor = self.instances.find(self._scope(user, query)).sort("scheduled_date", 1)
        
        events = []
        async for doc in cursor:
            events.append({
                "id": str(doc["_id"]),
                "title": doc.get("task_template_name", "Task"),
                "equipment": doc.get("equipment_name"),
                "start": doc["scheduled_date"].isoformat(),
                "end": doc["due_date"].isoformat() if doc.get("due_date") else None,
                "status": doc["status"],
                "priority": doc.get("priority", "medium"),
            })
        
        return events


from services.task_service_completion import (  # noqa: E402
    create_form_submission_from_task,
    create_observation_from_task,
    sync_reliability_graph_on_complete,
)

__all__ = [
    "TaskService",
    "create_form_submission_from_task",
    "create_observation_from_task",
    "sync_reliability_graph_on_complete",
]
