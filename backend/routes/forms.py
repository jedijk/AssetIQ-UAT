"""
Forms routes.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from database import db, form_service
from auth import get_current_user
from models.form_models import (
    FormTemplateCreate, FormTemplateUpdate,
    FormFieldDefinition, FormFieldUpdate,
    FormSubmission
)

router = APIRouter(tags=["Forms"])

@router.get("/form-templates")
async def get_form_templates(
    discipline: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    search: Optional[str] = None,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get form templates with optional filters."""
    return await form_service.get_templates(
        discipline=discipline,
        equipment_type_id=equipment_type_id,
        failure_mode_id=failure_mode_id,
        search=search,
        active_only=active_only,
        skip=skip,
        limit=limit
    )

@router.get("/form-templates/{template_id}")
async def get_form_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific form template."""
    template = await form_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Form template not found")
    return template

@router.get("/form-templates/{template_id}/versions")
async def get_form_template_versions(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all versions of a form template."""
    versions = await form_service.get_template_versions(template_id)
    return {"versions": versions}

@router.post("/form-templates")
async def create_form_template(
    data: FormTemplateCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new form template."""
    return await form_service.create_template(data.model_dump(), current_user["id"])

@router.patch("/form-templates/{template_id}")
async def update_form_template(
    template_id: str,
    data: FormTemplateUpdate,
    create_version: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Update a form template. Creates new version if template has been used."""
    result = await form_service.update_template(
        template_id,
        data.model_dump(exclude_unset=True),
        create_new_version=create_version
    )
    if not result:
        raise HTTPException(status_code=404, detail="Form template not found")
    return result

@router.delete("/form-templates/{template_id}")
async def delete_form_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete (deactivate) a form template."""
    deleted = await form_service.delete_template(template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Form template not found")
    return {"message": "Form template deactivated"}

# --- Form Fields ---

@router.post("/form-templates/{template_id}/fields")
async def add_form_field(
    template_id: str,
    field: FormFieldDefinition,
    current_user: dict = Depends(get_current_user)
):
    """Add a field to a form template."""
    result = await form_service.add_field_to_template(template_id, field.model_dump())
    if not result:
        raise HTTPException(status_code=404, detail="Form template not found")
    return result

@router.patch("/form-templates/{template_id}/fields/{field_id}")
async def update_form_field(
    template_id: str,
    field_id: str,
    updates: FormFieldUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a specific field in a form template."""
    result = await form_service.update_field_in_template(
        template_id, field_id, updates.model_dump(exclude_unset=True)
    )
    if not result:
        raise HTTPException(status_code=404, detail="Form template or field not found")
    return result

@router.delete("/form-templates/{template_id}/fields/{field_id}")
async def remove_form_field(
    template_id: str,
    field_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove a field from a form template."""
    result = await form_service.remove_field_from_template(template_id, field_id)
    if not result:
        raise HTTPException(status_code=404, detail="Form template or field not found")
    return result

class FieldOrderRequest(BaseModel):
    field_order: List[str]

@router.post("/form-templates/{template_id}/fields/reorder")
async def reorder_form_fields(
    template_id: str,
    data: FieldOrderRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder fields in a form template."""
    result = await form_service.reorder_fields(template_id, data.field_order)
    if not result:
        raise HTTPException(status_code=404, detail="Form template not found")
    return result

# --- Form Submissions ---

@router.get("/form-submissions")
async def get_form_submissions(
    form_template_id: Optional[str] = None,
    task_instance_id: Optional[str] = None,
    equipment_id: Optional[str] = None,
    has_warnings: Optional[bool] = None,
    has_critical: Optional[bool] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get form submissions with filters."""
    from_dt = datetime.fromisoformat(from_date) if from_date else None
    to_dt = datetime.fromisoformat(to_date) if to_date else None
    
    return await form_service.get_submissions(
        form_template_id=form_template_id,
        task_instance_id=task_instance_id,
        equipment_id=equipment_id,
        has_warnings=has_warnings,
        has_critical=has_critical,
        from_date=from_dt,
        to_date=to_dt,
        skip=skip,
        limit=limit
    )

@router.get("/form-submissions/{submission_id}")
async def get_form_submission(
    submission_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific form submission."""
    submission = await form_service.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Form submission not found")
    return submission

@router.post("/form-submissions")
async def submit_form(
    data: FormSubmission,
    current_user: dict = Depends(get_current_user)
):
    """Submit a form with data validation and threshold evaluation."""
    try:
        return await form_service.submit_form(data.model_dump(), current_user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Form Analytics ---

@router.get("/form-templates/{template_id}/analytics")
async def get_form_analytics(
    template_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get analytics for a form template."""
    from_dt = datetime.fromisoformat(from_date) if from_date else None
    to_dt = datetime.fromisoformat(to_date) if to_date else None
    
    return await form_service.get_form_analytics(template_id, from_dt, to_dt)

# ============= OBSERVATION ENGINE ENDPOINTS =============

class ObservationCreate(BaseModel):
    equipment_id: Optional[str] = None
    efm_id: Optional[str] = None
    task_id: Optional[str] = None
    failure_mode_id: Optional[str] = None
    description: str
    severity: Optional[str] = "medium"
    observation_type: Optional[str] = "general"
    media_urls: List[str] = []
    measured_values: List[dict] = []
    location: Optional[str] = None
    tags: List[str] = []

class ObservationUpdate(BaseModel):
    description: Optional[str] = None
    severity: Optional[str] = None
    observation_type: Optional[str] = None
    status: Optional[str] = None
    failure_mode_id: Optional[str] = None
    efm_id: Optional[str] = None
    media_urls: Optional[List[str]] = None
    measured_values: Optional[List[dict]] = None
    location: Optional[str] = None
    tags: Optional[List[str]] = None

