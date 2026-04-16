"""
Form Designer Service - Handles form templates, fields, and submissions.

Implements:
- Form Templates: Reusable form definitions with versioning
- Form Fields: Typed fields with validation and thresholds
- Form Submissions: Data capture with threshold evaluation
- Auto-observations: Create observations on threshold breach
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import uuid

logger = logging.getLogger(__name__)


class FormService:
    """Service for form management operations."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.templates = db["form_templates"]
        self.submissions = db["form_submissions"]
        self.observations = db["observations"]
        self.efms = db["equipment_failure_modes"]
    
    # ==================== FORM TEMPLATES ====================
    
    async def create_template(self, data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
        """Create a new form template."""
        now = datetime.now(timezone.utc)
        
        # Assign order to fields if not provided
        fields = data.get("fields", [])
        for i, field in enumerate(fields):
            if isinstance(field, dict) and field.get("order") is None:
                field["order"] = i
        
        doc = {
            "id": str(uuid.uuid4()),  # Generate unique ID
            "name": data["name"],
            "description": data.get("description"),
            "discipline": data.get("discipline"),
            "failure_mode_ids": data.get("failure_mode_ids", []),
            "equipment_type_ids": data.get("equipment_type_ids", []),
            "fields": fields,
            "allow_partial_submission": data.get("allow_partial_submission", False),
            "require_signature": data.get("require_signature", False),
            "tags": data.get("tags", []),
            "version": 1,
            "is_active": True,
            "is_latest": True,
            "parent_id": None,  # For version tracking
            "usage_count": 0,
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
        equipment_type_id: Optional[str] = None,
        failure_mode_id: Optional[str] = None,
        search: Optional[str] = None,
        active_only: bool = True,
        latest_only: bool = True,
        skip: int = 0,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get form templates with filters."""
        
        query = {}
        
        if active_only:
            query["is_active"] = True
        
        if latest_only:
            query["is_latest"] = True
        
        if discipline:
            query["discipline"] = discipline
        
        if equipment_type_id:
            query["equipment_type_ids"] = equipment_type_id
        
        if failure_mode_id:
            query["failure_mode_ids"] = failure_mode_id
        
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
        """Get a specific template."""
        if not ObjectId.is_valid(template_id):
            return None
        
        doc = await self.templates.find_one({"_id": ObjectId(template_id)})
        if doc:
            return self._serialize_template(doc)
        return None
    
    async def get_template_versions(self, template_id: str) -> List[Dict[str, Any]]:
        """Get all versions of a template."""
        if not ObjectId.is_valid(template_id):
            return []
        
        # Get the template
        template = await self.templates.find_one({"_id": ObjectId(template_id)})
        if not template:
            return []
        
        # Find root template
        root_id = template.get("parent_id") or template_id
        
        # Get all versions
        cursor = self.templates.find({
            "$or": [
                {"_id": ObjectId(root_id)},
                {"parent_id": root_id}
            ]
        }).sort("version", -1)
        
        versions = []
        async for doc in cursor:
            versions.append(self._serialize_template(doc))
        
        return versions
    
    async def update_template(
        self,
        template_id: str,
        data: Dict[str, Any],
        create_new_version: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Update a form template.
        If create_new_version=True, creates a new version (recommended for published forms).
        If False, updates in place (only for drafts).
        """
        if not ObjectId.is_valid(template_id):
            return None
        
        existing = await self.templates.find_one({"_id": ObjectId(template_id)})
        if not existing:
            return None
        
        now = datetime.now(timezone.utc)
        
        if create_new_version and existing.get("usage_count", 0) > 0:
            # Create new version
            # Mark old version as not latest
            await self.templates.update_one(
                {"_id": ObjectId(template_id)},
                {"$set": {"is_latest": False, "updated_at": now}}
            )
            
            # Create new version with all data from existing + updates
            new_doc = {
                "id": str(uuid.uuid4()),
                "name": data.get("name", existing["name"]),
                "description": data.get("description", existing.get("description")),
                "discipline": data.get("discipline", existing.get("discipline")),
                "failure_mode_ids": data.get("failure_mode_ids", existing.get("failure_mode_ids", [])),
                "equipment_type_ids": data.get("equipment_type_ids", existing.get("equipment_type_ids", [])),
                "fields": data.get("fields", existing.get("fields", [])),
                "documents": data.get("documents", existing.get("documents", [])),  # Copy documents
                "allow_partial_submission": data.get("allow_partial_submission", existing.get("allow_partial_submission", False)),
                "require_signature": data.get("require_signature", existing.get("require_signature", False)),
                "tags": data.get("tags", existing.get("tags", [])),
                "photo_extraction_config": data.get("photo_extraction_config", existing.get("photo_extraction_config")),
                "version": existing.get("version", 1) + 1,
                "is_active": True,
                "is_latest": True,
                "parent_id": existing.get("parent_id") or template_id,
                "usage_count": 0,
                "created_by": existing["created_by"],
                "created_at": now,
                "updated_at": now,
            }
            
            result = await self.templates.insert_one(new_doc)
            new_doc["_id"] = result.inserted_id
            new_template_id = str(result.inserted_id)
            
            # Update all associated task plans to link to the new version
            old_template_id = template_id
            await self._update_linked_tasks(old_template_id, new_template_id, new_doc.get("name"))
            
            return self._serialize_template(new_doc)
        else:
            # Update in place - increment version
            update = {
                "updated_at": now,
                "version": existing.get("version", 1) + 1,  # Always increment version on edit
            }
            
            allowed_fields = [
                "name", "description", "discipline", "failure_mode_ids",
                "equipment_type_ids", "fields", "documents", "allow_partial_submission",
                "require_signature", "tags", "is_active", "photo_extraction_config"
            ]
            
            for field in allowed_fields:
                if field in data and data[field] is not None:
                    update[field] = data[field]
            
            result = await self.templates.find_one_and_update(
                {"_id": ObjectId(template_id)},
                {"$set": update},
                return_document=True
            )
            
            # Update linked task names if form name changed
            if result and "name" in data:
                await self._update_linked_task_names(template_id, data["name"])
            
            if result:
                return self._serialize_template(result)
            return None
    
    async def _update_linked_tasks(self, old_template_id: str, new_template_id: str, new_name: str = None):
        """Update all task plans and task templates that reference this form template to use the new version."""
        # Update task_plans collection
        update_data = {"form_template_id": new_template_id}
        if new_name:
            update_data["form_template_name"] = new_name
        
        await self.db.task_plans.update_many(
            {"form_template_id": old_template_id},
            {"$set": update_data}
        )
        
        # Also update task_templates that have this form linked
        await self.db.task_templates.update_many(
            {"form_template_id": old_template_id},
            {"$set": update_data}
        )
    
    async def _update_linked_task_names(self, template_id: str, new_name: str):
        """Update form_template_name in linked tasks when form name changes."""
        await self.db.task_plans.update_many(
            {"form_template_id": template_id},
            {"$set": {"form_template_name": new_name}}
        )
        
        await self.db.task_templates.update_many(
            {"form_template_id": template_id},
            {"$set": {"form_template_name": new_name}}
        )
    
    async def delete_template(self, template_id: str) -> bool:
        """Deactivate a form template."""
        if not ObjectId.is_valid(template_id):
            return False
        
        result = await self.templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return result.modified_count > 0
    
    # ==================== FORM FIELDS ====================
    
    async def add_field_to_template(
        self,
        template_id: str,
        field: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Add a field to a form template."""
        if not ObjectId.is_valid(template_id):
            return None
        
        template = await self.templates.find_one({"_id": ObjectId(template_id)})
        if not template:
            return None
        
        fields = template.get("fields", [])
        
        # Set order if not provided
        if field.get("order") is None:
            field["order"] = len(fields)
        
        fields.append(field)
        
        await self.templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": {"fields": fields, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return await self.get_template_by_id(template_id)
    
    async def update_field_in_template(
        self,
        template_id: str,
        field_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a specific field in a template."""
        if not ObjectId.is_valid(template_id):
            return None
        
        template = await self.templates.find_one({"_id": ObjectId(template_id)})
        if not template:
            return None
        
        fields = template.get("fields", [])
        updated = False
        
        for field in fields:
            if field.get("id") == field_id:
                for key, value in updates.items():
                    if value is not None:
                        field[key] = value
                updated = True
                break
        
        if not updated:
            return None
        
        await self.templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": {"fields": fields, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return await self.get_template_by_id(template_id)
    
    async def remove_field_from_template(
        self,
        template_id: str,
        field_id: str
    ) -> Optional[Dict[str, Any]]:
        """Remove a field from a template."""
        if not ObjectId.is_valid(template_id):
            return None
        
        template = await self.templates.find_one({"_id": ObjectId(template_id)})
        if not template:
            return None
        
        fields = [f for f in template.get("fields", []) if f.get("id") != field_id]
        
        await self.templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": {"fields": fields, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return await self.get_template_by_id(template_id)
    
    async def reorder_fields(
        self,
        template_id: str,
        field_order: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Reorder fields in a template."""
        if not ObjectId.is_valid(template_id):
            return None
        
        template = await self.templates.find_one({"_id": ObjectId(template_id)})
        if not template:
            return None
        
        fields = template.get("fields", [])
        field_map = {f.get("id"): f for f in fields}
        
        reordered = []
        for i, field_id in enumerate(field_order):
            if field_id in field_map:
                field_map[field_id]["order"] = i
                reordered.append(field_map[field_id])
        
        await self.templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": {"fields": reordered, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return await self.get_template_by_id(template_id)
    
    # ==================== FORM SUBMISSIONS ====================
    
    async def submit_form(
        self,
        data: Dict[str, Any],
        submitted_by: str
    ) -> Dict[str, Any]:
        """Submit a form with data validation and threshold checking."""
        now = datetime.now(timezone.utc)
        
        # Get the template
        template = await self.get_template_by_id(data["form_template_id"])
        if not template:
            raise ValueError("Form template not found")
        
        # Validate required fields
        field_map = {f["id"]: f for f in template.get("fields", [])}
        values = data.get("values", [])
        value_map = {v["field_id"]: v for v in values}
        
        if not template.get("allow_partial_submission"):
            for field in template.get("fields", []):
                if field.get("required") and field["id"] not in value_map:
                    raise ValueError(f"Required field '{field.get('label', field['id'])}' is missing")
        
        # Evaluate thresholds and failure indicators
        evaluated_values = []
        threshold_breaches = []
        failure_indicators = []
        
        for value in values:
            field_id = value["field_id"]
            field_def = field_map.get(field_id)
            
            if not field_def:
                continue
            
            evaluated = {
                "field_id": field_id,
                "field_label": field_def.get("label"),
                "value": value["value"],
                "unit": field_def.get("unit"),
                "threshold_status": "normal",
                "is_failure_indicator": False
            }
            
            # Evaluate numeric thresholds
            if field_def.get("field_type") == "numeric" and field_def.get("thresholds"):
                threshold_status = self._evaluate_numeric_threshold(
                    value["value"],
                    field_def["thresholds"]
                )
                evaluated["threshold_status"] = threshold_status
                
                if threshold_status in ["warning", "critical"]:
                    threshold_breaches.append({
                        "field_id": field_id,
                        "field_label": field_def.get("label"),
                        "value": value["value"],
                        "unit": field_def.get("unit"),
                        "status": threshold_status,
                        "thresholds": field_def["thresholds"]
                    })
            
            # Check dropdown failure indicators
            if field_def.get("field_type") == "dropdown" and field_def.get("options"):
                for option in field_def["options"]:
                    if option.get("value") == value["value"] and option.get("is_failure"):
                        evaluated["is_failure_indicator"] = True
                        evaluated["threshold_status"] = option.get("severity", "warning")
                        failure_indicators.append({
                            "field_id": field_id,
                            "field_label": field_def.get("label"),
                            "value": value["value"],
                            "severity": option.get("severity", "warning")
                        })
                        break
            
            # Check general failure indicator type
            if field_def.get("failure_indicator_type") != "none":
                is_failure = self._check_failure_indicator(
                    value["value"],
                    field_def
                )
                if is_failure:
                    evaluated["is_failure_indicator"] = True
                    failure_indicators.append({
                        "field_id": field_id,
                        "field_label": field_def.get("label"),
                        "value": value["value"],
                        "failure_mode_id": field_def.get("failure_mode_id")
                    })
            
            evaluated_values.append(evaluated)
        
        # Check signature requirement
        if template.get("require_signature") and not data.get("signature_data"):
            raise ValueError("Signature is required for this form")
        
        # Resolve equipment name/tag if equipment_id provided
        equipment_name = ""
        equipment_tag = ""
        if data.get("equipment_id"):
            equip = await self.db.equipment_nodes.find_one(
                {"id": data["equipment_id"]}, {"_id": 0, "name": 1, "tag": 1}
            )
            if equip:
                equipment_name = equip.get("name", "")
                equipment_tag = equip.get("tag", "")

        # Resolve submitted_by_name
        submitted_by_name = ""
        if submitted_by:
            user = await self.db.users.find_one(
                {"id": submitted_by}, {"_id": 0, "name": 1}
            )
            if user:
                submitted_by_name = user.get("name", "")

        # Create submission document
        doc = {
            "id": str(uuid.uuid4()),  # Custom string ID for consistency
            "form_template_id": data["form_template_id"],
            "form_template_name": template["name"],
            "form_template_version": template.get("version", 1),
            "task_instance_id": data.get("task_instance_id"),
            "task_template_name": data.get("task_template_name"),
            "equipment_id": data.get("equipment_id"),
            "equipment_name": equipment_name,
            "equipment_tag": equipment_tag,
            "efm_id": data.get("efm_id"),
            "values": evaluated_values,
            "threshold_breaches": threshold_breaches,
            "failure_indicators": failure_indicators,
            "has_warnings": any(v.get("threshold_status") == "warning" for v in evaluated_values),
            "has_critical": any(v.get("threshold_status") == "critical" for v in evaluated_values),
            "has_failures": len(failure_indicators) > 0,
            "notes": data.get("notes"),
            "signature_data": data.get("signature_data"),
            "submitted_by": submitted_by,
            "submitted_by_name": submitted_by_name,
            "submitted_at": now,
            "created_at": now,
        }
        
        result = await self.submissions.insert_one(doc)
        doc["_id"] = result.inserted_id
        
        # Increment template usage count
        await self.templates.update_one(
            {"_id": ObjectId(data["form_template_id"])},
            {"$inc": {"usage_count": 1}}
        )
        
        # Auto-create observations for critical breaches
        observations_created = []
        for breach in threshold_breaches:
            if breach["status"] == "critical":
                field_def = field_map.get(breach["field_id"])
                if field_def and field_def.get("auto_create_observation"):
                    obs = await self._create_observation_for_breach(
                        doc, breach, field_def, submitted_by
                    )
                    if obs:
                        observations_created.append(obs)
        
        serialized = self._serialize_submission(doc)
        serialized["observations_created"] = len(observations_created)
        
        return serialized
    
    async def get_submissions(
        self,
        form_template_id: Optional[str] = None,
        task_instance_id: Optional[str] = None,
        equipment_id: Optional[str] = None,
        has_warnings: Optional[bool] = None,
        has_critical: Optional[bool] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 10,  # REDUCED default limit for performance
        include_details: bool = False  # NEW: Only include full details if requested
    ) -> Dict[str, Any]:
        """Get form submissions with filters - optimized for fast response."""
        import asyncio
        import time
        import logging
        
        logger = logging.getLogger(__name__)
        start_time = time.time()
        
        # STRICT PAGINATION - cap at 50 max
        limit = min(limit, 50)
        
        query = {}
        
        if form_template_id:
            query["form_template_id"] = form_template_id
        
        if task_instance_id:
            query["task_instance_id"] = task_instance_id
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        
        if has_warnings is not None:
            query["has_warnings"] = has_warnings
        
        if has_critical is not None:
            query["has_critical"] = has_critical
        
        if from_date or to_date:
            query["submitted_at"] = {}
            if from_date:
                query["submitted_at"]["$gte"] = from_date
            if to_date:
                query["submitted_at"]["$lte"] = to_date
        
        # LIGHTWEIGHT PROJECTION - exclude large fields for list view
        projection = {
            "_id": 0,
            "id": 1,
            "form_template_id": 1,
            "form_template_name": 1,
            "task_instance_id": 1,
            "equipment_id": 1,
            "equipment_name": 1,
            "submitted_by": 1,
            "submitted_by_name": 1,
            "submitted_at": 1,
            "has_warnings": 1,
            "has_critical": 1,
            "notes": 1,
            # Summary fields only - NOT full responses/attachments
            "response_count": 1,
            "attachment_count": 1
        }
        
        # Only include heavy fields if explicitly requested
        if include_details:
            projection["responses"] = 1
            projection["attachments"] = 1
        
        logger.info(f"[FormService] Starting query: filters={bool(query)}, limit={limit}, include_details={include_details}")
        
        # Use estimated count for unfiltered queries (much faster)
        if query:
            count_task = self.submissions.count_documents(query)
        else:
            count_task = self.submissions.estimated_document_count()
        
        # Sort by submitted_at DESC using index
        fetch_task = self.submissions.find(query, projection).sort("submitted_at", -1).skip(skip).limit(limit).to_list(length=limit)
        
        total, raw_submissions = await asyncio.gather(count_task, fetch_task)
        
        query_time = time.time() - start_time
        logger.info(f"[FormService] Query completed in {query_time:.3f}s - returned {len(raw_submissions)} of {total} total")
        
        # Early return if no submissions - skip unnecessary lookups
        if not raw_submissions:
            return {"total": total, "submissions": []}
        
        # ============================================
        # BATCH LOOKUP: Extract all unique IDs upfront
        # ============================================
        user_ids = set()
        equipment_ids = set()
        task_ids_str = set()
        task_ids_oid = set()
        form_template_ids = set()
        
        for doc in raw_submissions:
            if doc.get("submitted_by"):
                user_ids.add(doc["submitted_by"])
            if doc.get("equipment_id"):
                equipment_ids.add(doc["equipment_id"])
            if doc.get("task_instance_id"):
                task_ids_str.add(doc["task_instance_id"])
                if ObjectId.is_valid(doc["task_instance_id"]):
                    task_ids_oid.add(ObjectId(doc["task_instance_id"]))
            if doc.get("form_template_id"):
                form_template_ids.add(doc["form_template_id"])
        
        # Run all batch lookups in parallel with timeout
        async def fetch_users():
            if not user_ids:
                return {}
            try:
                users = await asyncio.wait_for(
                    self.db.users.find(
                        {"id": {"$in": list(user_ids)}}, 
                        {"_id": 0, "id": 1, "name": 1, "email": 1, "avatar_path": 1, "avatar_data": 1}
                    ).to_list(length=100),
                    timeout=2.0
                )
                return {u["id"]: {
                    "name": u.get("name", u.get("email", "Unknown")),
                    "has_avatar": bool(u.get("avatar_path") or u.get("avatar_data"))
                } for u in users}
            except asyncio.TimeoutError:
                logger.warning("[FormService] fetch_users timeout")
                return {}
        
        async def fetch_equipment():
            if not equipment_ids:
                return {}
            try:
                equipment = await asyncio.wait_for(
                    self.db.equipment_nodes.find(
                        {"id": {"$in": list(equipment_ids)}}, 
                        {"_id": 0, "id": 1, "name": 1, "path": 1}
                    ).to_list(length=100),
                    timeout=2.0
                )
                return {eq["id"]: {"name": eq.get("name", "Unknown Equipment"), "path": eq.get("path", "")} for eq in equipment}
            except asyncio.TimeoutError:
                logger.warning("[FormService] fetch_equipment timeout")
                return {}
        
        async def fetch_tasks():
            result = {}
            try:
                if task_ids_str:
                    tasks = await asyncio.wait_for(
                        self.db.task_instances.find({"id": {"$in": list(task_ids_str)}}).to_list(length=100),
                        timeout=2.0
                    )
                    for task in tasks:
                        result[task.get("id")] = task
                if task_ids_oid:
                    tasks = await asyncio.wait_for(
                        self.db.task_instances.find({"_id": {"$in": list(task_ids_oid)}}).to_list(length=100),
                        timeout=2.0
                    )
                    for task in tasks:
                        result[str(task["_id"])] = task
            except asyncio.TimeoutError:
                logger.warning("[FormService] fetch_tasks timeout")
            return result
        
        async def fetch_templates():
            result = {}
            if not form_template_ids:
                return result
            try:
                # Try by string id
                templates = await asyncio.wait_for(
                    self.templates.find({"id": {"$in": list(form_template_ids)}}).to_list(length=100),
                    timeout=2.0
                )
                for tmpl in templates:
                    result[tmpl.get("id")] = tmpl
                # Also try by ObjectId for any missing
                missing_ids = form_template_ids - set(result.keys())
                if missing_ids:
                    oid_list = [ObjectId(fid) for fid in missing_ids if ObjectId.is_valid(fid)]
                    if oid_list:
                        templates = await asyncio.wait_for(
                            self.templates.find({"_id": {"$in": oid_list}}).to_list(length=100),
                            timeout=2.0
                        )
                        for tmpl in templates:
                            result[str(tmpl["_id"])] = tmpl
            except asyncio.TimeoutError:
                logger.warning("[FormService] fetch_templates timeout")
            return result
        
        # Execute all lookups in parallel
        user_map, equipment_map, task_map, template_map = await asyncio.gather(
            fetch_users(),
            fetch_equipment(),
            fetch_tasks(),
            fetch_templates()
        )
        
        # ============================================
        # PROCESS SUBMISSIONS using pre-fetched lookups
        # ============================================
        submissions = []
        for doc in raw_submissions:
            serialized = self._serialize_submission(doc)
            
            # Get submitted_by info from map (name and avatar)
            if serialized.get("submitted_by"):
                user_data = user_map.get(serialized["submitted_by"])
                if user_data:
                    if not serialized.get("submitted_by_name"):
                        serialized["submitted_by_name"] = user_data.get("name", "Unknown")
                    if user_data.get("has_avatar"):
                        serialized["submitted_by_photo"] = f"/api/users/{serialized['submitted_by']}/avatar"
            
            # Get equipment info from map
            if serialized.get("equipment_id"):
                eq_data = equipment_map.get(serialized["equipment_id"])
                if eq_data:
                    serialized["equipment_name"] = eq_data["name"]
                    serialized["equipment_path"] = eq_data["path"]
            
            # Get task info from map
            if serialized.get("task_instance_id"):
                task = task_map.get(serialized["task_instance_id"])
                if task:
                    serialized["task_template_name"] = task.get("task_template_name", "Unknown Task")
                    serialized["discipline"] = task.get("discipline")
            
            # Get form template discipline from map if not in task
            if not serialized.get("discipline") and serialized.get("form_template_id"):
                template = template_map.get(serialized["form_template_id"])
                if template:
                    serialized["discipline"] = template.get("discipline")
            
            submissions.append(serialized)
        
        return {"total": total, "submissions": submissions}
    
    async def get_submission_by_id(self, submission_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific submission by custom ID or MongoDB ObjectId.
        
        Uses aggregation pipeline to handle large base64 attachments efficiently.
        """
        import asyncio
        
        # Build the pipeline to process attachments without loading huge data fields
        # MongoDB 4.2+ supports $map and $cond in aggregation
        pipeline = [
            # Match the submission
            {"$match": {"id": submission_id}},
            # Process attachments to exclude large base64 data
            {"$addFields": {
                "attachments": {
                    "$map": {
                        "input": {"$ifNull": ["$attachments", []]},
                        "as": "att",
                        "in": {
                            "$cond": {
                                # Case 1: Has URL - return with URL (migrated attachment)
                                "if": {"$and": [
                                    {"$ifNull": ["$$att.url", False]},
                                    {"$ne": ["$$att.url", ""]}
                                ]},
                                "then": {
                                    "name": "$$att.name",
                                    "type": "$$att.type", 
                                    "size": "$$att.size",
                                    "url": "$$att.url"
                                },
                                "else": {
                                    "$cond": {
                                        # Case 2: Has error field - pass through the error
                                        "if": {"$ifNull": ["$$att.error", False]},
                                        "then": {
                                            "name": "$$att.name",
                                            "type": "$$att.type",
                                            "size": "$$att.size",
                                            "error": "$$att.error",
                                            "needs_migration": True
                                        },
                                        "else": {
                                            "$cond": {
                                                # Case 3: Has large data - mark as needs migration
                                                "if": {"$gt": [{"$strLenCP": {"$ifNull": ["$$att.data", ""]}}, 50000]},
                                                "then": {
                                                    "name": "$$att.name",
                                                    "type": "$$att.type",
                                                    "size": "$$att.size",
                                                    "error": "Legacy attachment - file too large to display inline",
                                                    "needs_migration": True
                                                },
                                                # Case 4: Has small data - keep it inline
                                                "else": {
                                                    "name": "$$att.name",
                                                    "type": "$$att.type",
                                                    "size": "$$att.size",
                                                    "data": {"$ifNull": ["$$att.data", ""]}
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }}
        ]
        
        try:
            # Try by custom 'id' field first with timeout
            result = await asyncio.wait_for(
                self.submissions.aggregate(pipeline).to_list(length=1),
                timeout=5.0
            )
            if result:
                return self._serialize_submission(result[0])
            
            # Fallback: try by MongoDB ObjectId
            if ObjectId.is_valid(submission_id):
                pipeline[0]["$match"] = {"_id": ObjectId(submission_id)}
                result = await asyncio.wait_for(
                    self.submissions.aggregate(pipeline).to_list(length=1),
                    timeout=5.0
                )
                if result:
                    return self._serialize_submission(result[0])
            
            return None
            
        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching submission {submission_id} - falling back to projection")
            # Fallback: use simple projection excluding attachments entirely
            projection = {"attachments.data": 0}  # Exclude just the data field
            
            doc = await self.submissions.find_one({"id": submission_id}, projection)
            if not doc and ObjectId.is_valid(submission_id):
                doc = await self.submissions.find_one({"_id": ObjectId(submission_id)}, projection)
            
            if doc:
                return self._serialize_submission(doc)
            return None
    
    # ==================== THRESHOLD EVALUATION ====================
    
    def _evaluate_numeric_threshold(
        self,
        value: Any,
        thresholds: Dict[str, Any]
    ) -> str:
        """Evaluate a numeric value against thresholds."""
        try:
            val = float(value)
        except (TypeError, ValueError):
            return "normal"
        
        # Check critical thresholds first
        critical_low = thresholds.get("critical_low")
        critical_high = thresholds.get("critical_high")
        
        if critical_low is not None and val < critical_low:
            return "critical"
        if critical_high is not None and val > critical_high:
            return "critical"
        
        # Check warning thresholds
        warning_low = thresholds.get("warning_low")
        warning_high = thresholds.get("warning_high")
        
        if warning_low is not None and val < warning_low:
            return "warning"
        if warning_high is not None and val > warning_high:
            return "warning"
        
        return "normal"
    
    def _check_failure_indicator(
        self,
        value: Any,
        field_def: Dict[str, Any]
    ) -> bool:
        """Check if a value indicates failure based on field configuration."""
        indicator_type = field_def.get("failure_indicator_type", "none")
        
        if indicator_type == "none":
            return False
        
        thresholds = field_def.get("thresholds", {})
        
        try:
            val = float(value)
        except (TypeError, ValueError):
            return False
        
        if indicator_type == "above":
            threshold = thresholds.get("critical_high") or thresholds.get("warning_high")
            return threshold is not None and val > threshold
        
        elif indicator_type == "below":
            threshold = thresholds.get("critical_low") or thresholds.get("warning_low")
            return threshold is not None and val < threshold
        
        elif indicator_type == "outside":
            low = thresholds.get("warning_low")
            high = thresholds.get("warning_high")
            if low is not None and high is not None:
                return val < low or val > high
        
        return False
    
    async def _create_observation_for_breach(
        self,
        submission: Dict,
        breach: Dict,
        field_def: Dict,
        created_by: str
    ) -> Optional[Dict]:
        """Create an observation when a threshold breach occurs."""
        now = datetime.now(timezone.utc)
        
        obs_doc = {
            "equipment_id": submission.get("equipment_id"),
            "efm_id": submission.get("efm_id") or field_def.get("failure_mode_id"),
            "task_id": submission.get("task_instance_id"),
            "form_submission_id": str(submission["_id"]),
            "source": "form_threshold_breach",
            "description": f"Threshold breach detected: {breach['field_label']} = {breach['value']} {breach.get('unit', '')}",
            "severity": breach["status"],
            "field_id": breach["field_id"],
            "field_label": breach["field_label"],
            "measured_value": breach["value"],
            "unit": breach.get("unit"),
            "threshold_status": breach["status"],
            "created_by": created_by,
            "created_at": now,
        }
        
        result = await self.observations.insert_one(obs_doc)
        obs_doc["_id"] = result.inserted_id
        
        # Update EFM observation count if linked
        if obs_doc.get("efm_id"):
            await self.efms.update_one(
                {"_id": ObjectId(obs_doc["efm_id"])},
                {
                    "$inc": {"observations_count": 1},
                    "$set": {"last_observation_at": now}
                }
            )
        
        return {
            "id": str(obs_doc["_id"]),
            "description": obs_doc["description"],
            "severity": obs_doc["severity"]
        }
    
    # ==================== ANALYTICS ====================
    
    async def get_form_analytics(
        self,
        form_template_id: str,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get analytics for a form template."""
        
        query = {"form_template_id": form_template_id}
        if from_date:
            query["submitted_at"] = {"$gte": from_date}
        if to_date:
            query.setdefault("submitted_at", {})["$lte"] = to_date
        
        # Total submissions
        total = await self.submissions.count_documents(query)
        
        # Count warnings and criticals
        warnings = await self.submissions.count_documents({**query, "has_warnings": True})
        criticals = await self.submissions.count_documents({**query, "has_critical": True})
        
        # Get field value distributions (for numeric fields)
        template = await self.get_template_by_id(form_template_id)
        field_stats = {}
        
        if template:
            for field in template.get("fields", []):
                if field.get("field_type") == "numeric":
                    # Aggregate field values
                    pipeline = [
                        {"$match": query},
                        {"$unwind": "$values"},
                        {"$match": {"values.field_id": field["id"]}},
                        {"$group": {
                            "_id": None,
                            "avg": {"$avg": {"$toDouble": "$values.value"}},
                            "min": {"$min": {"$toDouble": "$values.value"}},
                            "max": {"$max": {"$toDouble": "$values.value"}},
                            "count": {"$sum": 1}
                        }}
                    ]
                    
                    result = await self.submissions.aggregate(pipeline).to_list(1)
                    if result:
                        field_stats[field["id"]] = {
                            "label": field.get("label"),
                            "unit": field.get("unit"),
                            "avg": round(result[0]["avg"], 2) if result[0]["avg"] else None,
                            "min": result[0]["min"],
                            "max": result[0]["max"],
                            "count": result[0]["count"]
                        }
        
        return {
            "form_template_id": form_template_id,
            "total_submissions": total,
            "with_warnings": warnings,
            "with_criticals": criticals,
            "warning_rate": round(warnings / total * 100, 1) if total > 0 else 0,
            "critical_rate": round(criticals / total * 100, 1) if total > 0 else 0,
            "field_statistics": field_stats
        }
    
    # ==================== HELPERS ====================
    
    def _serialize_datetime(self, dt) -> str:
        """Serialize datetime to ISO format with UTC timezone suffix.
        
        MongoDB returns naive datetimes (without timezone info), but our frontend
        needs the UTC suffix to correctly interpret times.
        """
        if dt is None:
            return None
        if hasattr(dt, 'isoformat'):
            iso_str = dt.isoformat()
            # Ensure UTC suffix is present (MongoDB returns naive datetimes)
            if not iso_str.endswith('Z') and '+' not in iso_str and '-' not in iso_str[-6:]:
                iso_str += '+00:00'
            return iso_str
        return dt
    
    def _serialize_template(self, doc: Dict) -> Dict[str, Any]:
        """Serialize template document."""
        return {
            "id": str(doc["_id"]),
            "name": doc["name"],
            "description": doc.get("description"),
            "discipline": doc.get("discipline"),
            "failure_mode_ids": doc.get("failure_mode_ids", []),
            "equipment_type_ids": doc.get("equipment_type_ids", []),
            "fields": doc.get("fields", []),
            "field_count": len(doc.get("fields", [])),
            "documents": doc.get("documents", []),  # Reference documents
            "allow_partial_submission": doc.get("allow_partial_submission", False),
            "require_signature": doc.get("require_signature", False),
            "tags": doc.get("tags", []),
            "photo_extraction_config": doc.get("photo_extraction_config"),
            "version": doc.get("version", 1),
            "is_active": doc.get("is_active", True),
            "is_latest": doc.get("is_latest", True),
            "usage_count": doc.get("usage_count", 0),
            "created_at": self._serialize_datetime(doc.get("created_at")),
            "updated_at": self._serialize_datetime(doc.get("updated_at")),
        }
    
    def _serialize_submission(self, doc: Dict) -> Dict[str, Any]:
        """Serialize submission document."""
        values = doc.get("values", [])
        
        # Handle both custom 'id' field (from task_service) and MongoDB '_id'
        doc_id = doc.get("id") or (str(doc["_id"]) if doc.get("_id") else None)
        
        # Process attachments - strip large base64 data to prevent timeouts
        raw_attachments = doc.get("attachments", [])
        processed_attachments = []
        for att in raw_attachments:
            processed = {
                "name": att.get("name"),
                "type": att.get("type"),
                "size": att.get("size"),
            }
            
            # Prefer URL if available (properly stored in object storage)
            if att.get("url"):
                processed["url"] = att["url"]
            elif att.get("data"):
                # Legacy attachment with base64 data but no URL
                # Check if data is small enough to include (< 50KB)
                data = att.get("data", "")
                if len(data) < 50000:  # 50KB threshold
                    processed["data"] = data
                else:
                    # Too large - mark as needing migration
                    processed["error"] = "Legacy attachment - file too large to display inline"
                    processed["needs_migration"] = True
            elif att.get("error"):
                processed["error"] = att["error"]
            
            processed_attachments.append(processed)
        
        return {
            "id": doc_id,
            "form_template_id": doc["form_template_id"],
            "form_template_name": doc.get("form_template_name"),
            "template_name": doc.get("form_template_name"),  # Alias for frontend
            "form_template_version": doc.get("form_template_version"),
            "task_instance_id": doc.get("task_instance_id"),
            "equipment_id": doc.get("equipment_id"),
            "equipment_name": doc.get("equipment_name"),
            "equipment_path": doc.get("equipment_path"),
            "efm_id": doc.get("efm_id"),
            "values": values,
            "responses": values,  # Alias for frontend compatibility
            "attachments": processed_attachments,
            "threshold_breaches": doc.get("threshold_breaches", []),
            "failure_indicators": doc.get("failure_indicators", []),
            "has_warnings": doc.get("has_warnings", False),
            "has_critical": doc.get("has_critical", False),
            "has_failures": doc.get("has_failures", False),
            "notes": doc.get("notes"),
            "has_signature": doc.get("signature_data") is not None,
            "submitted_by": doc.get("submitted_by"),
            "submitted_by_name": doc.get("submitted_by_name"),  # Add name if available
            "submitted_by_photo": doc.get("submitted_by_photo"),  # Avatar path
            "submitted_at": self._serialize_datetime(doc.get("submitted_at")),
            "created_at": self._serialize_datetime(doc.get("created_at")),
            "status": doc.get("status", "completed"),  # Default to completed
            "task_template_name": doc.get("task_template_name"),
            "discipline": doc.get("discipline"),
        }
