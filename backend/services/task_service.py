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

logger = logging.getLogger(__name__)


def _safe_isoformat(value):
    """Safely convert datetime to ISO format string with UTC timezone suffix.
    
    MongoDB returns naive datetimes (without timezone info), but our frontend
    needs the UTC suffix to correctly interpret times.
    """
    if value is None:
        return None
    if isinstance(value, str):
        # If already a string, ensure it has UTC suffix
        if value and not value.endswith('Z') and '+' not in value and '-' not in value[-6:]:
            return value + '+00:00'
        return value
    if hasattr(value, 'isoformat'):
        iso_str = value.isoformat()
        # Ensure UTC suffix is present (MongoDB returns naive datetimes)
        if not iso_str.endswith('Z') and '+' not in iso_str and '-' not in iso_str[-6:]:
            iso_str += '+00:00'
        return iso_str
    return str(value)


class TaskService:
    """Service for task management operations."""
    
    def __init__(self, db):
        """Initialize with a database proxy (supports dynamic per-request switching)."""
        self.db = db
        self.templates = db["task_templates"]
        self.plans = db["task_plans"]
        self.instances = db["task_instances"]
        self.equipment = db["equipment_nodes"]
        self.efms = db["equipment_failure_modes"]
    
    # ==================== TASK TEMPLATES ====================
    
    async def create_template(self, data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
        """Create a new task template."""
        import uuid
        now = datetime.now(timezone.utc)
        
        # Determine if ad-hoc
        is_adhoc = data.get("is_adhoc", False)
        
        doc = {
            "id": str(uuid.uuid4()),  # Add explicit id field for index
            "name": data["name"],
            "description": data.get("description"),
            "discipline": data["discipline"],
            "mitigation_strategy": data["mitigation_strategy"],
            "equipment_type_ids": data.get("equipment_type_ids", []),
            "failure_mode_ids": data.get("failure_mode_ids", []),
            "frequency_type": "adhoc" if is_adhoc else data.get("frequency_type", "time_based"),
            "default_interval": 0 if is_adhoc else data.get("default_interval", 30),
            "default_unit": None if is_adhoc else data.get("default_unit", "days"),
            "estimated_duration_minutes": data.get("estimated_duration_minutes"),
            "procedure_steps": data.get("procedure_steps", []),
            "safety_requirements": data.get("safety_requirements", []),
            "tools_required": data.get("tools_required", []),
            "spare_parts": data.get("spare_parts", []),
            "form_template_id": data.get("form_template_id"),
            "tags": data.get("tags", []),
            "is_adhoc": is_adhoc,
            "is_active": True,
            "usage_count": 0,  # Track how many plans use this template
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        
        result = await self.templates.insert_one(doc)
        doc["_id"] = result.inserted_id
        
        return self._serialize_template(doc)
    
    async def get_templates(
        self,
        discipline: Optional[str] = None,
        mitigation_strategy: Optional[str] = None,
        equipment_type_id: Optional[str] = None,
        search: Optional[str] = None,
        active_only: bool = True,
        skip: int = 0,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get task templates with filters."""
        
        query = {}
        
        if active_only:
            query["is_active"] = True
        
        if discipline:
            query["discipline"] = discipline
        
        if mitigation_strategy:
            query["mitigation_strategy"] = mitigation_strategy
        
        if equipment_type_id:
            query["equipment_type_ids"] = equipment_type_id
        
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"tags": {"$regex": search, "$options": "i"}},
            ]
        
        cursor = self.templates.find(query).sort("name", 1).skip(skip).limit(limit)
        
        templates = []
        async for doc in cursor:
            templates.append(self._serialize_template(doc))
        
        total = await self.templates.count_documents(query)
        
        return {"total": total, "templates": templates}
    
    async def get_template_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific template by id (string UUID) or _id (ObjectId)."""
        # First try to find by string 'id' field
        doc = await self.templates.find_one({"id": template_id})
        if doc:
            return self._serialize_template(doc)
        
        # Fallback to ObjectId lookup
        if ObjectId.is_valid(template_id):
            doc = await self.templates.find_one({"_id": ObjectId(template_id)})
            if doc:
                return self._serialize_template(doc)
        
        return None
    
    async def update_template(self, template_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a task template."""
        update = {"updated_at": datetime.now(timezone.utc)}
        
        allowed_fields = [
            "name", "description", "discipline", "mitigation_strategy",
            "equipment_type_ids", "failure_mode_ids", "frequency_type",
            "default_interval", "default_unit", "estimated_duration_minutes",
            "procedure_steps", "safety_requirements", "tools_required",
            "spare_parts", "form_template_id", "tags", "is_active", "is_adhoc"
        ]
        
        for field in allowed_fields:
            if field in data and data[field] is not None:
                update[field] = data[field]
        
        # Try to find by string 'id' field first
        result = await self.templates.find_one_and_update(
            {"id": template_id},
            {"$set": update},
            return_document=True
        )
        
        # Fallback to ObjectId lookup
        if not result and ObjectId.is_valid(template_id):
            result = await self.templates.find_one_and_update(
                {"_id": ObjectId(template_id)},
                {"$set": update},
                return_document=True
            )
        
        if result:
            return self._serialize_template(result)
        return None
    
    async def delete_template(self, template_id: str) -> bool:
        """Delete a task template (soft delete by deactivating)."""
        # Check if any active plans use this template
        plans_count = await self.plans.count_documents({
            "task_template_id": template_id,
            "is_active": True
        })
        
        if plans_count > 0:
            raise ValueError(f"Cannot delete template: {plans_count} active plans use it")
        
        # Try to find by string 'id' field first
        result = await self.templates.update_one(
            {"id": template_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        
        if result.modified_count > 0:
            return True
        
        # Fallback to ObjectId lookup
        if ObjectId.is_valid(template_id):
            result = await self.templates.update_one(
                {"_id": ObjectId(template_id)},
                {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
            )
            return result.modified_count > 0
        
        return False
    
    # ==================== TASK PLANS ====================
    
    async def create_plan(self, data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
        """Create a task plan for specific equipment."""
        now = datetime.now(timezone.utc)
        
        # Validate equipment exists
        equipment = await self.equipment.find_one({"id": data["equipment_id"]})
        if not equipment:
            raise ValueError("Equipment not found")
        
        # Validate template exists
        template = await self.get_template_by_id(data["task_template_id"])
        if not template:
            raise ValueError("Task template not found")
        
        # === EQUIPMENT TYPE VALIDATION FOR SYSTEM AND BELOW ===
        # Levels that require equipment type matching
        system_and_below_levels = [
            "section_system", "system",  # Level 3
            "equipment_unit", "equipment",  # Level 4
            "subunit",  # Level 5
            "maintainable_item"  # Level 6
        ]
        
        equipment_level = equipment.get("level", "").lower()
        
        if equipment_level in system_and_below_levels:
            # Get the equipment type
            equipment_type_id = equipment.get("equipment_type_id")
            
            # Get the template's applicable equipment types
            template_equipment_types = template.get("equipment_type_ids", [])
            
            # If template has specific equipment types defined, validate match
            if template_equipment_types and len(template_equipment_types) > 0:
                if not equipment_type_id:
                    raise ValueError(
                        f"Equipment '{equipment.get('name')}' at level '{equipment_level}' "
                        f"has no equipment type defined. Cannot create plan with this template."
                    )
                
                if equipment_type_id not in template_equipment_types:
                    raise ValueError(
                        f"Equipment type '{equipment_type_id}' does not match template's "
                        f"applicable types: {', '.join(template_equipment_types)}. "
                        f"Plan creation is only allowed for matching equipment types at "
                        f"system level and below."
                    )
        
        # Check if template is ad-hoc
        is_adhoc_template = template.get("is_adhoc", False)
        
        # Get form_template_id from template if not provided in plan data
        form_template_id = data.get("form_template_id") or template.get("form_template_id")
        
        # Lookup form template name
        form_template_name = None
        if form_template_id:
            # Try finding by 'id' field first (string ID)
            form_template = await self.db.form_templates.find_one({"id": form_template_id})
            # If not found, try by ObjectId
            if not form_template:
                try:
                    form_template = await self.db.form_templates.find_one({"_id": ObjectId(form_template_id)})
                except Exception:
                    pass
            if form_template:
                form_template_name = form_template.get("name")
        
        # Get frequency settings (use template defaults if not overridden)
        frequency_type = data.get("frequency_type") or template["frequency_type"]
        
        # For ad-hoc templates, only use interval if explicitly provided by user
        # For regular templates, fall back to template defaults
        if is_adhoc_template:
            interval_value = data.get("interval_value")  # None if not provided
            interval_unit = data.get("interval_unit") if data.get("interval_value") else None
        else:
            interval_value = data.get("interval_value") or template.get("default_interval")
            interval_unit = data.get("interval_unit") or template.get("default_unit")
        
        # Calculate next due date (or None for ad-hoc without interval)
        effective_from = data.get("effective_from") or now
        next_due = None
        if interval_value and interval_unit:
            next_due = self._calculate_next_due(effective_from, interval_value, interval_unit)
        elif is_adhoc_template:
            # For ad-hoc templates, next_due can be None (execute manually)
            next_due = None
        else:
            # Default to 30 days if somehow no interval is set
            next_due = self._calculate_next_due(effective_from, 30, "days")
        
        doc = {
            "id": str(uuid.uuid4()),  # Add explicit id field for index
            "equipment_id": data["equipment_id"],
            "equipment_name": equipment.get("name"),
            "task_template_id": data["task_template_id"],
            "task_template_name": template["name"],
            "form_template_id": form_template_id,
            "form_template_name": form_template_name,
            "efm_id": data.get("efm_id"),
            "frequency_type": frequency_type,
            "interval_value": interval_value,
            "interval_unit": interval_unit,
            "trigger_condition": data.get("trigger_condition"),
            "assigned_team": data.get("assigned_team"),
            "assigned_user_id": data.get("assigned_user_id"),
            "effective_from": effective_from,
            "effective_until": data.get("effective_until"),
            "last_executed_at": None,
            "next_due_date": next_due,
            "execution_count": 0,
            "notes": data.get("notes"),
            "is_active": True,
            "is_adhoc": is_adhoc_template,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        
        result = await self.plans.insert_one(doc)
        doc["_id"] = result.inserted_id
        
        # Increment template usage count - try by string id first, then ObjectId
        update_result = await self.templates.update_one(
            {"id": data["task_template_id"]},
            {"$inc": {"usage_count": 1}}
        )
        if update_result.modified_count == 0 and ObjectId.is_valid(data["task_template_id"]):
            await self.templates.update_one(
                {"_id": ObjectId(data["task_template_id"])},
                {"$inc": {"usage_count": 1}}
            )
        
        return self._serialize_plan(doc)
    
    async def get_plans(
        self,
        equipment_id: Optional[str] = None,
        template_id: Optional[str] = None,
        active_only: bool = True,
        due_before: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get task plans with filters."""
        
        query = {}
        
        if active_only:
            query["is_active"] = True
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        
        if template_id:
            query["task_template_id"] = template_id
        
        if due_before:
            query["next_due_date"] = {"$lte": due_before}
        
        cursor = self.plans.find(query).sort("next_due_date", 1).skip(skip).limit(limit)
        
        plans = []
        async for doc in cursor:
            plans.append(self._serialize_plan(doc))
        
        total = await self.plans.count_documents(query)
        
        return {"total": total, "plans": plans}
    
    async def get_plan_by_id(self, plan_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific plan by id (string UUID) or _id (ObjectId)."""
        # First try to find by string 'id' field
        doc = await self.plans.find_one({"id": plan_id})
        if doc:
            return self._serialize_plan(doc)
        
        # Fallback to ObjectId lookup
        if ObjectId.is_valid(plan_id):
            doc = await self.plans.find_one({"_id": ObjectId(plan_id)})
            if doc:
                return self._serialize_plan(doc)
        
        return None
    
    async def update_plan(self, plan_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a task plan."""
        # First try to find by string 'id' field
        existing = await self.plans.find_one({"id": plan_id})
        query_field = "id" if existing else "_id"
        query_value = plan_id if existing else (ObjectId(plan_id) if ObjectId.is_valid(plan_id) else None)
        
        if not existing and query_value:
            existing = await self.plans.find_one({"_id": query_value})
        
        if not existing:
            return None
        
        update = {"updated_at": datetime.now(timezone.utc)}
        
        allowed_fields = [
            "frequency_type", "interval_value", "interval_unit",
            "trigger_condition", "assigned_team", "assigned_user_id",
            "effective_from", "effective_until", "notes", "is_active"
        ]
        
        for field in allowed_fields:
            if field in data and data[field] is not None:
                update[field] = data[field]
        
        # Recalculate next due if frequency changed
        if any(f in data for f in ["interval_value", "interval_unit"]):
            interval_value = data.get("interval_value") or existing["interval_value"]
            interval_unit = data.get("interval_unit") or existing["interval_unit"]
            base_date = existing.get("last_executed_at") or existing.get("effective_from") or datetime.now(timezone.utc)
            update["next_due_date"] = self._calculate_next_due(base_date, interval_value, interval_unit)
        
        result = await self.plans.find_one_and_update(
            {query_field: query_value},
            {"$set": update},
            return_document=True
        )
        
        if result:
            return self._serialize_plan(result)
        return None
    
    async def delete_plan(self, plan_id: str) -> bool:
        """Deactivate a task plan."""
        # First try to find by string 'id' field
        plan = await self.plans.find_one({"id": plan_id})
        query_field = "id" if plan else "_id"
        query_value = plan_id if plan else (ObjectId(plan_id) if ObjectId.is_valid(plan_id) else None)
        
        if not plan and query_value:
            plan = await self.plans.find_one({"_id": query_value})
        
        if not plan:
            return False
        
        result = await self.plans.update_one(
            {query_field: query_value},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        
        # Decrement template usage count
        if result.modified_count > 0 and plan.get("task_template_id"):
            # Try by string id first, then ObjectId
            template_id = plan["task_template_id"]
            update_result = await self.templates.update_one(
                {"id": template_id},
                {"$inc": {"usage_count": -1}}
            )
            if update_result.modified_count == 0 and ObjectId.is_valid(template_id):
                await self.templates.update_one(
                    {"_id": ObjectId(template_id)},
                    {"$inc": {"usage_count": -1}}
                )
        
        return result.modified_count > 0
    
    # ==================== TASK INSTANCES ====================
    
    async def create_instance(self, data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
        """Create a task instance."""
        now = datetime.now(timezone.utc)
        
        # Get plan details
        plan = await self.get_plan_by_id(data["task_plan_id"])
        if not plan:
            raise ValueError("Task plan not found")
        
        # Get template for additional info
        template = await self.get_template_by_id(plan["task_template_id"])
        
        doc = {
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
        
        result = await self.instances.insert_one(doc)
        doc["_id"] = result.inserted_id
        
        return self._serialize_instance(doc)
    
    async def create_adhoc_instance(self, data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
        """Create an ad-hoc task instance directly from a template (no plan required)."""
        now = datetime.now(timezone.utc)
        
        # Get template details
        template = await self.get_template_by_id(data["task_template_id"])
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
            equipment = await self.equipment.find_one({"id": data["equipment_id"]})
            if equipment:
                equipment_name = equipment.get("name", "Unknown")
        
        # Get form template if linked to template
        form_fields = []
        form_template_name = None
        if template.get("form_template_id"):
            try:
                form_template = await self.db.form_templates.find_one({"_id": ObjectId(str(template["form_template_id"]))})
                if form_template:
                    form_fields = form_template.get("fields", [])
                    form_template_name = form_template.get("name", "")
            except Exception as e:
                logger.warning(f"Failed to fetch form template: {e}")
        
        doc = {
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
        
        result = await self.instances.insert_one(doc)
        doc["_id"] = result.inserted_id
        
        return self._serialize_instance(doc)
    
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
        limit: int = 100
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
        async def fetch_instances():
            cursor = self.instances.find(query, projection).sort("scheduled_date", 1).skip(skip).limit(limit)
            instances = []
            async for doc in cursor:
                instances.append(self._serialize_instance(doc))
            return instances
        
        # Use estimated count for unfiltered queries (much faster)
        if query:
            count_task = self.instances.count_documents(query)
        else:
            count_task = self.instances.estimated_document_count()
        
        fetch_task = fetch_instances()
        
        total, instances = await asyncio.gather(count_task, fetch_task)
        
        return {"total": total, "instances": instances}
    
    async def get_instance_by_id(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific instance."""
        if not ObjectId.is_valid(instance_id):
            return None
        
        doc = await self.instances.find_one({"_id": ObjectId(instance_id)})
        if doc:
            return self._serialize_instance(doc)
        return None
    
    async def update_instance(self, instance_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a task instance."""
        if not ObjectId.is_valid(instance_id):
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
            {"_id": ObjectId(instance_id)},
            {"$set": update},
            return_document=True
        )
        
        if result:
            return self._serialize_instance(result)
        return None
    
    async def start_task(self, instance_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Mark a task as started."""
        # Build query to find by either ObjectId or string 'id' field
        query = None
        if ObjectId.is_valid(instance_id):
            query = {"_id": ObjectId(instance_id)}
        
        # Try ObjectId first
        instance = None
        if query:
            instance = await self.instances.find_one(query)
        
        # If not found, try by 'id' field (UUID string)
        if not instance:
            query = {"id": instance_id}
            instance = await self.instances.find_one(query)
        
        if not instance:
            return None
        
        result = await self.instances.find_one_and_update(
            {"_id": instance["_id"]},
            {"$set": {
                "status": "in_progress",
                "started_at": datetime.now(timezone.utc),
                "assigned_user_id": user_id,
                "updated_at": datetime.now(timezone.utc)
            }},
            return_document=True
        )
        
        if result:
            return self._serialize_instance(result)
        return None
    
    async def complete_task(self, instance_id: str, data: Dict[str, Any], completed_by_id: str = None, completed_by_name: str = None) -> Optional[Dict[str, Any]]:
        """Mark a task as completed and update plan."""
        # Try to find the task instance by ObjectId first, then by string 'id' field
        instance = None
        query = None
        
        if ObjectId.is_valid(instance_id):
            query = {"_id": ObjectId(instance_id)}
            instance = await self.instances.find_one(query)
        
        # If not found by ObjectId, try by 'id' field (UUID string)
        if not instance:
            query = {"id": instance_id}
            instance = await self.instances.find_one(query)
        
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
            {"_id": instance["_id"]},
            {"$set": update},
            return_document=True
        )
        
        if result:
            created_submission_id = None
            label_print_config = None
            # Create form submission if form_data is present
            if data.get("form_data") and instance.get("form_template_id"):
                created_submission_id = await self._create_form_submission(
                    instance, data, now, completed_by_id, completed_by_name
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
                                {"_id": _OID(str(ftid))},
                                {"_id": 0, "label_print_config": 1},
                            )
                        if not ft:
                            ft = await self.db.form_templates.find_one(
                                {"id": str(ftid)},
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
                    plan = await self.plans.find_one({"_id": ObjectId(plan_id)})
                except Exception:
                    # If ObjectId conversion fails, the plan_id might be a UUID
                    # which means there's no valid plan to update
                    pass
                
                if plan:
                    next_due = self._calculate_next_due(
                        now,
                        plan["interval_value"],
                        plan["interval_unit"]
                    )
                    await self.plans.update_one(
                        {"_id": plan["_id"]},
                        {"$set": {
                            "last_executed_at": now,
                            "next_due_date": next_due,
                            "updated_at": now
                        },
                        "$inc": {"execution_count": 1}}
                    )
            
            # Create observation if issue was found and flagged for observation
            if data.get("create_observation") and data.get("issues_found"):
                await self._create_observation_from_task(instance, data, now)
            
            serialized = self._serialize_instance(result)
            if created_submission_id:
                serialized["form_submission_id"] = created_submission_id
            if label_print_config:
                serialized["label_print_config"] = label_print_config
            return serialized
        return None
    
    async def _create_observation_from_task(
        self,
        task_instance: Dict[str, Any],
        completion_data: Dict[str, Any],
        timestamp: datetime
    ) -> Optional[str]:
        """Create an observation/threat from a completed task with issues."""
        import uuid
        
        # Build observation title from task and issue
        issues = completion_data.get("issues_found", [])
        issue_text = issues[0] if issues else "Issue found during task execution"
        task_title = task_instance.get("task_template_name") or "Task"
        equipment_name = task_instance.get("equipment_name") or "Unknown Equipment"
        
        # Map severity to risk/impact levels
        severity = completion_data.get("issue_severity", "medium")
        severity_map = {
            "low": {"impact": "Minor", "likelihood": "Unlikely", "risk_level": "Low"},
            "medium": {"impact": "Moderate", "likelihood": "Possible", "risk_level": "Medium"},
            "high": {"impact": "Major", "likelihood": "Likely", "risk_level": "High"},
        }
        risk_data = severity_map.get(severity, severity_map["medium"])
        
        # Create the observation/threat document
        observation_doc = {
            "id": str(uuid.uuid4()),
            "title": f"Issue: {issue_text[:100]}",
            "description": f"Issue discovered during task execution.\n\nTask: {task_title}\nEquipment: {equipment_name}\n\nDetails: {issue_text}",
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
            "created_at": timestamp,
            "updated_at": timestamp,
            "created_by_task": True,
        }
        
        try:
            await self.db.threats.insert_one(observation_doc)
            logger.info(f"Created observation from task: {observation_doc['id']}")
            return observation_doc["id"]
        except Exception as e:
            logger.error(f"Failed to create observation from task: {e}")
            return None
    
    async def _create_form_submission(
        self,
        task_instance: Dict[str, Any],
        completion_data: Dict[str, Any],
        timestamp: datetime,
        submitted_by_id: str,
        submitted_by_name: str
    ) -> Optional[str]:
        """Create a form submission record when a task with form is completed."""
        import uuid
        import asyncio
        
        form_data = completion_data.get("form_data", {})
        
        # Convert form_data to values array format
        values = []
        if isinstance(form_data, dict):
            for field_id, value in form_data.items():
                values.append({
                    "field_id": field_id,
                    "field_label": field_id,  # Will be enriched by form_service
                    "value": value,
                })
        elif isinstance(form_data, list):
            values = form_data
        
        # Process attachments - upload to storage if large, otherwise keep base64
        raw_attachments = completion_data.get("attachments", [])
        processed_attachments = []
        
        for att in raw_attachments:
            # If attachment has base64 data and is large (> 100KB), try to upload to storage
            data = att.get("data", "")
            if data and len(data) > 100000:  # > 100KB
                try:
                    from services.storage_service import is_storage_available, put_object_async
                    if is_storage_available():
                        # Extract base64 content
                        if "," in data:
                            base64_data = data.split(",", 1)[1]
                        else:
                            base64_data = data
                        
                        import base64
                        file_bytes = base64.b64decode(base64_data)
                        
                        # Generate storage path
                        file_ext = att.get("name", "file").split(".")[-1] if "." in att.get("name", "") else "bin"
                        storage_path = f"attachments/{uuid.uuid4()}.{file_ext}"
                        
                        # Upload with timeout - now using async directly
                        try:
                            result = await asyncio.wait_for(
                                put_object_async(storage_path, file_bytes, att.get("type", "application/octet-stream")),
                                timeout=30.0
                            )
                            # put_object_async returns dict with 'path' key
                            url = result.get("path", storage_path)
                            processed_attachments.append({
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
            "task_instance_id": str(task_instance.get("_id")) if task_instance.get("_id") else task_instance.get("id"),
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
            # Freeze label template at submission-time so prints/reprints match even if
            # the form template's label_print_config is later changed.
            "label_template_id": None,
            "has_warnings": False,
            "has_critical": False,
            "has_signature": False,
            "status": "completed",
            "created_at": timestamp,
        }

        # Resolve label_template_id from the form template (if available).
        try:
            ft_id = task_instance.get("form_template_id")
            if ft_id:
                from bson import ObjectId
                form_tpl = await self.db.form_templates.find_one({"_id": ObjectId(str(ft_id))}, {"_id": 0, "label_print_config": 1})
                label_cfg = form_tpl.get("label_print_config") if isinstance(form_tpl, dict) else None
                if isinstance(label_cfg, dict):
                    submission_doc["label_template_id"] = label_cfg.get("label_template_id")
        except Exception:
            # Non-critical — printing can still fall back to current config.
            pass
        
        # Include AI extraction traceability if present
        ai_extraction = completion_data.get("ai_extraction")
        if ai_extraction:
            submission_doc["ai_extraction"] = ai_extraction

        try:
            await self.db.form_submissions.insert_one(submission_doc)
            logger.info(f"Created form submission: {submission_doc['id']}")
            return submission_doc["id"]
        except Exception as e:
            logger.error(f"Failed to create form submission: {e}")
            return None
    
    async def delete_instance(self, instance_id: str) -> bool:
        """Delete a task instance."""
        try:
            result = await self.instances.delete_one({"_id": ObjectId(instance_id)})
            return result.deleted_count > 0
        except Exception:
            return False
    
    # ==================== SCHEDULING ====================
    
    async def generate_instances_for_plan(
        self,
        plan_id: str,
        horizon_days: int = 30,
        created_by: str = "system"
    ) -> List[Dict[str, Any]]:
        """Generate task instances for a plan within the horizon and date range."""
        
        plan = await self.get_plan_by_id(plan_id)
        if not plan or not plan["is_active"]:
            return []
        
        # Skip ad-hoc plans - they don't have recurring schedules
        if plan.get("is_adhoc"):
            return []
        
        # Ensure the plan has the required scheduling fields
        if not plan.get("next_due_date") or not plan.get("interval_value") or not plan.get("interval_unit"):
            return []
        
        now = datetime.now(timezone.utc)
        horizon_end = now + timedelta(days=horizon_days)
        
        # Parse plan's effective_from and effective_until dates
        effective_from = plan.get("effective_from")
        if effective_from:
            if isinstance(effective_from, str):
                effective_from = datetime.fromisoformat(effective_from.replace('Z', '+00:00'))
            if effective_from.tzinfo is None:
                effective_from = effective_from.replace(tzinfo=timezone.utc)
        else:
            effective_from = now
        
        effective_until = plan.get("effective_until")
        if effective_until:
            if isinstance(effective_until, str):
                effective_until = datetime.fromisoformat(effective_until.replace('Z', '+00:00'))
            if effective_until.tzinfo is None:
                effective_until = effective_until.replace(tzinfo=timezone.utc)
        
        # The generation window is bounded by both the horizon AND the plan's effective_until
        generation_end = horizon_end
        if effective_until and effective_until < generation_end:
            generation_end = effective_until
        
        # Start date must be at least effective_from, or now if that's later
        generation_start = max(now, effective_from)
        
        # If the plan's date range is entirely in the past, don't generate anything
        if effective_until and effective_until < now:
            return []
        
        # Get existing instances to avoid duplicates
        existing = await self.instances.find({
            "task_plan_id": plan_id,
            "scheduled_date": {"$gte": generation_start, "$lte": generation_end},
            "status": {"$in": ["planned", "scheduled"]}
        }).to_list(100)
        
        existing_dates = set()
        for inst in existing:
            sd = inst["scheduled_date"]
            if isinstance(sd, str):
                sd = datetime.fromisoformat(sd.replace('Z', '+00:00'))
            if sd.tzinfo is None:
                sd = sd.replace(tzinfo=timezone.utc)
            existing_dates.add(sd.date())
        
        # Generate instances
        generated = []
        current_date = plan["next_due_date"]
        
        # Parse if string and ensure timezone
        if isinstance(current_date, str):
            current_date = datetime.fromisoformat(current_date.replace('Z', '+00:00'))
        if current_date.tzinfo is None:
            current_date = current_date.replace(tzinfo=timezone.utc)
        
        # If the next_due_date is before effective_from, calculate forward to effective_from
        while current_date < effective_from:
            current_date = self._calculate_next_due(
                current_date,
                plan["interval_value"],
                plan["interval_unit"]
            )
        
        # Generate instances within the valid date range
        while current_date <= generation_end:
            # Only create if within the effective date range and not already existing
            if current_date.date() not in existing_dates and current_date >= generation_start:
                if not effective_until or current_date <= effective_until:
                    instance = await self.create_instance({
                        "task_plan_id": plan_id,
                        "scheduled_date": current_date,
                        "due_date": current_date + timedelta(days=1),  # 1 day grace period
                        "priority": "medium",
                    }, created_by)
                    generated.append(instance)
            
            # Calculate next occurrence
            current_date = self._calculate_next_due(
                current_date,
                plan["interval_value"],
                plan["interval_unit"]
            )
        
        return generated
    
    async def generate_all_due_instances(
        self,
        horizon_days: int = 30,
        created_by: str = "system"
    ) -> Dict[str, Any]:
        """Generate instances for all active plans within their effective date ranges."""
        
        now = datetime.now(timezone.utc)
        horizon_end = now + timedelta(days=horizon_days)
        
        # Get all active plans - we'll filter dates in Python since dates might be stored as strings
        all_active_plans = await self.plans.find({
            "is_active": True
        }).to_list(1000)
        
        # Filter plans based on next_due_date and effective_until
        plans = []
        for plan in all_active_plans:
            next_due = plan.get("next_due_date")
            effective_until = plan.get("effective_until")
            
            # Parse next_due_date if it's a string
            if isinstance(next_due, str):
                try:
                    next_due = datetime.fromisoformat(next_due.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    continue  # Skip if can't parse
            
            if next_due is None:
                continue
            
            # Make timezone aware if needed
            if next_due.tzinfo is None:
                next_due = next_due.replace(tzinfo=timezone.utc)
            
            # Check if next_due is within horizon
            if next_due > horizon_end:
                continue
            
            # Parse and check effective_until
            if effective_until is not None:
                if isinstance(effective_until, str):
                    try:
                        effective_until = datetime.fromisoformat(effective_until.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        effective_until = None
                
                if effective_until and effective_until.tzinfo is None:
                    effective_until = effective_until.replace(tzinfo=timezone.utc)
                
                if effective_until and effective_until < now:
                    continue  # Plan has expired
            
            plans.append(plan)
        
        total_generated = 0
        plans_processed = 0
        
        for plan in plans:
            plan_id = str(plan["_id"])
            instances = await self.generate_instances_for_plan(
                plan_id, horizon_days, created_by
            )
            total_generated += len(instances)
            plans_processed += 1
        
        return {
            "plans_processed": plans_processed,
            "instances_generated": total_generated,
            "horizon_days": horizon_days
        }
    
    async def mark_overdue_tasks(self) -> int:
        """Mark tasks past due date as overdue."""
        now = datetime.now(timezone.utc)
        
        result = await self.instances.update_many(
            {
                "status": {"$in": ["planned", "scheduled"]},
                "due_date": {"$lt": now}
            },
            {"$set": {"status": "overdue", "updated_at": now}}
        )
        
        return result.modified_count
    
    # ==================== DASHBOARD / STATS ====================
    
    async def get_task_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get task statistics."""
        
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = today_start + timedelta(days=7)
        
        # Don't filter by user for overall stats
        base_query = {}
        
        # Count by status
        status_counts = {}
        for status in ["planned", "scheduled", "in_progress", "completed", "overdue"]:
            query = {**base_query, "status": status}
            status_counts[status] = await self.instances.count_documents(query)
        
        # Due this week
        due_this_week = await self.instances.count_documents({
            **base_query,
            "status": {"$in": ["planned", "scheduled"]},
            "due_date": {"$gte": today_start, "$lte": week_end}
        })
        
        # Completed this week
        completed_this_week = await self.instances.count_documents({
            **base_query,
            "status": "completed",
            "completed_at": {"$gte": today_start}
        })
        
        # Active plans count
        active_plans = await self.plans.count_documents({"is_active": True})
        
        # Active templates count
        active_templates = await self.templates.count_documents({"is_active": True})
        
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
        equipment_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get tasks for calendar view."""
        
        query = {
            "scheduled_date": {"$gte": from_date, "$lte": to_date}
        }
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        
        cursor = self.instances.find(query).sort("scheduled_date", 1)
        
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
    
    # ==================== HELPERS ====================
    
    def _calculate_next_due(
        self,
        base_date: datetime,
        interval_value: int,
        interval_unit: str
    ) -> datetime:
        """Calculate next due date based on interval."""
        
        if isinstance(base_date, str):
            base_date = datetime.fromisoformat(base_date.replace('Z', '+00:00'))
        
        if interval_unit == "hours":
            return base_date + timedelta(hours=interval_value)
        elif interval_unit == "days":
            return base_date + timedelta(days=interval_value)
        elif interval_unit == "weeks":
            return base_date + timedelta(weeks=interval_value)
        elif interval_unit == "months":
            # Approximate months as 30 days
            return base_date + timedelta(days=interval_value * 30)
        elif interval_unit == "years":
            return base_date + timedelta(days=interval_value * 365)
        else:
            return base_date + timedelta(days=interval_value)
    
    def _serialize_template(self, doc: Dict) -> Dict[str, Any]:
        """Serialize template document."""
        return {
            "id": doc.get("id") or str(doc["_id"]),
            "name": doc["name"],
            "description": doc.get("description"),
            "discipline": doc["discipline"],
            "mitigation_strategy": doc["mitigation_strategy"],
            "equipment_type_ids": doc.get("equipment_type_ids", []),
            "failure_mode_ids": doc.get("failure_mode_ids", []),
            "frequency_type": doc.get("frequency_type", "time_based"),
            "default_interval": doc.get("default_interval", 30),
            "default_unit": doc.get("default_unit", "days"),
            "estimated_duration_minutes": doc.get("estimated_duration_minutes"),
            "procedure_steps": doc.get("procedure_steps", []),
            "safety_requirements": doc.get("safety_requirements", []),
            "tools_required": doc.get("tools_required", []),
            "spare_parts": doc.get("spare_parts", []),
            "form_template_id": doc.get("form_template_id"),
            "tags": doc.get("tags", []),
            "is_adhoc": doc.get("is_adhoc", False),
            "is_active": doc.get("is_active", True),
            "usage_count": doc.get("usage_count", 0),
            "created_at": _safe_isoformat(doc.get("created_at")),
            "updated_at": _safe_isoformat(doc.get("updated_at")),
        }
    
    def _serialize_plan(self, doc: Dict) -> Dict[str, Any]:
        """Serialize plan document."""
        return {
            "id": doc.get("id") or str(doc["_id"]),
            "equipment_id": doc["equipment_id"],
            "equipment_name": doc.get("equipment_name"),
            "task_template_id": doc["task_template_id"],
            "task_template_name": doc.get("task_template_name"),
            "form_template_id": doc.get("form_template_id"),
            "form_template_name": doc.get("form_template_name"),
            "efm_id": doc.get("efm_id"),
            "frequency_type": doc["frequency_type"],
            "interval_value": doc.get("interval_value"),
            "interval_unit": doc.get("interval_unit"),
            "trigger_condition": doc.get("trigger_condition"),
            "assigned_team": doc.get("assigned_team"),
            "assigned_user_id": doc.get("assigned_user_id"),
            "effective_from": _safe_isoformat(doc.get("effective_from")),
            "effective_until": _safe_isoformat(doc.get("effective_until")),
            "last_executed_at": _safe_isoformat(doc.get("last_executed_at")),
            "next_due_date": _safe_isoformat(doc.get("next_due_date")),
            "execution_count": doc.get("execution_count", 0),
            "notes": doc.get("notes"),
            "is_active": doc.get("is_active", True),
            "is_adhoc": doc.get("is_adhoc", False),
            "created_at": _safe_isoformat(doc.get("created_at")),
            "updated_at": _safe_isoformat(doc.get("updated_at")),
        }
    
    def _serialize_instance(self, doc: Dict) -> Dict[str, Any]:
        """Serialize instance document."""
        # Handle task_plan_id which might be ObjectId or string
        task_plan_id = doc.get("task_plan_id")
        if task_plan_id and hasattr(task_plan_id, '__str__'):
            task_plan_id = str(task_plan_id)
        
        return {
            "id": str(doc["_id"]),
            "task_plan_id": task_plan_id,
            "task_template_id": doc.get("task_template_id"),
            "task_template_name": doc.get("task_template_name"),
            "equipment_id": doc.get("equipment_id"),  # Optional - adhoc tasks may not have equipment
            "equipment_name": doc.get("equipment_name"),
            "efm_id": doc.get("efm_id"),
            "scheduled_date": _safe_isoformat(doc.get("scheduled_date")),
            "due_date": _safe_isoformat(doc.get("due_date")),
            "status": doc.get("status", "pending"),  # Default to pending if not set
            "priority": doc.get("priority", "medium"),
            "assigned_team": doc.get("assigned_team"),
            "assigned_user_id": doc.get("assigned_user_id"),
            "discipline": doc.get("discipline"),
            "estimated_duration_minutes": doc.get("estimated_duration_minutes"),
            "started_at": _safe_isoformat(doc.get("started_at")),
            "completed_at": _safe_isoformat(doc.get("completed_at")),
            "actual_duration_minutes": doc.get("actual_duration_minutes"),
            "completion_notes": doc.get("completion_notes"),
            "issues_found": doc.get("issues_found", []),
            "follow_up_required": doc.get("follow_up_required", False),
            "follow_up_notes": doc.get("follow_up_notes"),
            "notes": doc.get("notes"),
            "created_at": _safe_isoformat(doc.get("created_at")),
            "updated_at": _safe_isoformat(doc.get("updated_at")),
        }
