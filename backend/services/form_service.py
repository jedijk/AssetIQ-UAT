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
                "require_signature", "tags", "is_active"
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
        
        # Create submission document
        doc = {
            "form_template_id": data["form_template_id"],
            "form_template_name": template["name"],
            "form_template_version": template.get("version", 1),
            "task_instance_id": data.get("task_instance_id"),
            "equipment_id": data.get("equipment_id"),
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
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get form submissions with filters."""
        
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
        
        cursor = self.submissions.find(query).sort("submitted_at", -1).skip(skip).limit(limit)
        
        submissions = []
        async for doc in cursor:
            submissions.append(self._serialize_submission(doc))
        
        total = await self.submissions.count_documents(query)
        
        return {"total": total, "submissions": submissions}
    
    async def get_submission_by_id(self, submission_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific submission."""
        if not ObjectId.is_valid(submission_id):
            return None
        
        doc = await self.submissions.find_one({"_id": ObjectId(submission_id)})
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
            "version": doc.get("version", 1),
            "is_active": doc.get("is_active", True),
            "is_latest": doc.get("is_latest", True),
            "usage_count": doc.get("usage_count", 0),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") and hasattr(doc.get("created_at"), 'isoformat') else doc.get("created_at"),
            "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") and hasattr(doc.get("updated_at"), 'isoformat') else doc.get("updated_at"),
        }
    
    def _serialize_submission(self, doc: Dict) -> Dict[str, Any]:
        """Serialize submission document."""
        return {
            "id": str(doc["_id"]),
            "form_template_id": doc["form_template_id"],
            "form_template_name": doc.get("form_template_name"),
            "form_template_version": doc.get("form_template_version"),
            "task_instance_id": doc.get("task_instance_id"),
            "equipment_id": doc.get("equipment_id"),
            "efm_id": doc.get("efm_id"),
            "values": doc.get("values", []),
            "threshold_breaches": doc.get("threshold_breaches", []),
            "failure_indicators": doc.get("failure_indicators", []),
            "has_warnings": doc.get("has_warnings", False),
            "has_critical": doc.get("has_critical", False),
            "has_failures": doc.get("has_failures", False),
            "notes": doc.get("notes"),
            "has_signature": doc.get("signature_data") is not None,
            "submitted_by": doc.get("submitted_by"),
            "submitted_at": doc.get("submitted_at").isoformat() if doc.get("submitted_at") and hasattr(doc.get("submitted_at"), 'isoformat') else doc.get("submitted_at"),
        }
