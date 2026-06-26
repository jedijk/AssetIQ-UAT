"""
Form Designer Service - Handles form templates, fields, and submissions.

Implements:
- Form Templates: Reusable form definitions with versioning
- Form Fields: Typed fields with validation and thresholds
- Form Submissions: Data capture with threshold evaluation
- Auto-observations: Create observations on threshold breach
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from services.tenant_schema import merge_tenant_filter
from services.form_service_analytics import get_form_analytics as _get_form_analytics
from services.form_service_submissions_list import list_submissions_lightweight as _list_submissions_lightweight
from services.form_service_templates import (
    add_field_to_template as _add_field_to_template,
    add_template_document as _add_template_document,
    create_template as _create_template,
    delete_template as _delete_template,
    get_template_by_id as _get_template_by_id,
    get_template_versions as _get_template_versions,
    get_templates as _get_templates,
    remove_field_from_template as _remove_field_from_template,
    remove_template_document as _remove_template_document,
    reorder_fields as _reorder_fields,
    update_field_in_template as _update_field_in_template,
    update_template as _update_template,
)

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

    async def create_template(
        self,
        data: Dict[str, Any],
        created_by: str,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        return await _create_template(
            templates=self.templates,
            data=data,
            created_by=created_by,
            user=user,
        )

    async def get_templates(
        self,
        discipline: Optional[str] = None,
        equipment_type_id: Optional[str] = None,
        failure_mode_id: Optional[str] = None,
        search: Optional[str] = None,
        active_only: bool = True,
        latest_only: bool = True,
        skip: int = 0,
        limit: int = 100,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        return await _get_templates(
            templates=self.templates,
            discipline=discipline,
            equipment_type_id=equipment_type_id,
            failure_mode_id=failure_mode_id,
            search=search,
            active_only=active_only,
            latest_only=latest_only,
            skip=skip,
            limit=limit,
            user=user,
        )

    async def get_template_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        return await _get_template_by_id(templates=self.templates, template_id=template_id)

    async def get_template_versions(self, template_id: str) -> List[Dict[str, Any]]:
        return await _get_template_versions(templates=self.templates, template_id=template_id)

    async def update_template(
        self,
        template_id: str,
        data: Dict[str, Any],
        create_new_version: bool = True,
    ) -> Optional[Dict[str, Any]]:
        return await _update_template(
            templates=self.templates,
            db=self.db,
            template_id=template_id,
            data=data,
            create_new_version=create_new_version,
        )

    async def delete_template(self, template_id: str) -> bool:
        return await _delete_template(templates=self.templates, template_id=template_id)

    # ==================== FORM FIELDS ====================

    async def add_field_to_template(
        self,
        template_id: str,
        field: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        return await _add_field_to_template(
            templates=self.templates,
            template_id=template_id,
            field=field,
        )

    async def update_field_in_template(
        self,
        template_id: str,
        field_id: str,
        updates: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        return await _update_field_in_template(
            templates=self.templates,
            template_id=template_id,
            field_id=field_id,
            updates=updates,
        )

    async def remove_field_from_template(
        self,
        template_id: str,
        field_id: str,
    ) -> Optional[Dict[str, Any]]:
        return await _remove_field_from_template(
            templates=self.templates,
            template_id=template_id,
            field_id=field_id,
        )

    async def reorder_fields(
        self,
        template_id: str,
        field_order: List[str],
    ) -> Optional[Dict[str, Any]]:
        return await _reorder_fields(
            templates=self.templates,
            template_id=template_id,
            field_order=field_order,
        )

    # ==================== FORM SUBMISSIONS ====================

    async def submit_form(
        self,
        data: Dict[str, Any],
        submitted_by: str,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        from services.form_service_submit import submit_form as _submit_form
        return await _submit_form(
            db=self.db,
            submissions=self.submissions,
            templates=self.templates,
            observations=self.observations,
            efms=self.efms,
            get_template_by_id=self.get_template_by_id,
            try_auto_pair_mooney_viscosity=self.try_auto_pair_mooney_viscosity,
            after_form_submission_reliability_update=self._after_form_submission_reliability_update,
            data=data,
            submitted_by=submitted_by,
            user=user,
        )

    async def _after_form_submission_reliability_update(
        self,
        submission: Dict[str, Any],
        submitted_by: str,
        notes: Optional[str] = None,
    ) -> None:
        from services.form_service_reliability import after_form_submission_reliability_update
        await after_form_submission_reliability_update(self.db, submission, submitted_by, notes=notes)

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
        limit: int = 10,
        include_details: bool = False,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Get form submissions with filters - optimized for fast response."""
        from services.form_service_submissions_query import get_submissions as _get_submissions
        return await _get_submissions(
            db=self.db,
            submissions=self.submissions,
            templates=self.templates,
            form_template_id=form_template_id,
            task_instance_id=task_instance_id,
            equipment_id=equipment_id,
            has_warnings=has_warnings,
            has_critical=has_critical,
            from_date=from_date,
            to_date=to_date,
            skip=skip,
            limit=limit,
            include_details=include_details,
            user=user,
        )

    async def get_submission_by_id(
        self,
        submission_id: str,
        user: Optional[dict] = None,
    ) -> Optional[Dict[str, Any]]:
        from services.form_service_submission_detail import get_submission_by_id as _get_submission_by_id
        return await _get_submission_by_id(self.submissions, submission_id, user=user)

    async def get_form_analytics(
        self,
        form_template_id: str,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Get analytics for a form template."""
        return await _get_form_analytics(
            submissions=self.submissions,
            get_template_by_id=self.get_template_by_id,
            form_template_id=form_template_id,
            from_date=from_date,
            to_date=to_date,
            user=user,
        )

    async def list_submissions_lightweight(
        self,
        *,
        form_template_id: Optional[str] = None,
        template_id: Optional[str] = None,
        has_warnings: Optional[bool] = None,
        has_critical: Optional[bool] = None,
        skip: int = 0,
        limit: int = 10,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Ultra-lightweight submission list — see form_service_submissions_list."""
        return await _list_submissions_lightweight(
            db=self.db,
            submissions=self.submissions,
            form_template_id=form_template_id,
            template_id=template_id,
            has_warnings=has_warnings,
            has_critical=has_critical,
            skip=skip,
            limit=limit,
            user=user,
        )

    async def delete_submission(self, submission_id: str, user: dict) -> dict:
        """Delete a form submission and reset linked task instance if needed."""
        from fastapi import HTTPException

        submission = await self.submissions.find_one(
            merge_tenant_filter({"id": submission_id}, user)
        )
        if not submission:
            if ObjectId.is_valid(submission_id):
                submission = await self.submissions.find_one(
                    merge_tenant_filter({"_id": ObjectId(submission_id)}, user)
                )
        if not submission:
            raise HTTPException(status_code=404, detail="Form submission not found")

        role = (user or {}).get("role")
        user_id = (user or {}).get("id")
        submitted_by = submission.get("submitted_by")
        is_privileged = role in ("owner", "admin")
        is_submitter = bool(user_id) and bool(submitted_by) and (submitted_by == user_id)
        if not (is_privileged or is_submitter):
            raise HTTPException(status_code=403, detail="Not allowed to delete this submission")

        task_instance_id = submission.get("task_instance_id")
        result = await self.submissions.delete_one({"id": submission_id})
        if result.deleted_count == 0 and ObjectId.is_valid(submission_id):
            result = await self.submissions.delete_one({"_id": ObjectId(submission_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Form submission not found")

        if task_instance_id:
            await self.db.task_instances.update_one(
                {"id": task_instance_id},
                {
                    "$set": {
                        "status": "planned",
                        "completed_at": None,
                        "completed_by_id": None,
                        "completed_by_name": None,
                        "completion_notes": None,
                    }
                },
            )
        return {"message": "Form submission deleted successfully"}

    async def add_template_document(
        self,
        template_id: str,
        *,
        filename: str,
        file_data: bytes,
        content_type: str,
        ext: str,
        description: Optional[str],
        uploaded_by: str,
    ) -> dict:
        return await _add_template_document(
            templates=self.templates,
            template_id=template_id,
            filename=filename,
            file_data=file_data,
            content_type=content_type,
            ext=ext,
            description=description,
            uploaded_by=uploaded_by,
        )

    async def remove_template_document(self, template_id: str, document_id: str) -> dict:
        return await _remove_template_document(
            templates=self.templates,
            template_id=template_id,
            document_id=document_id,
        )
