"""
Forms routes.
"""
import os
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Header, BackgroundTasks
from datetime import datetime
from database import form_service
from services.cache_service import cache
from auth import get_current_user, require_permission
from services.background_jobs import schedule_tracked_job
from services.ai_gateway import chat as ai_gateway_chat, user_context
from models.form_models import (
    FormTemplateCreate, FormTemplateUpdate,
    FormFieldDefinition, FormFieldUpdate,
    FormSubmission
)
from services.storage_service import put_object, get_object, MIME_TYPES
from utils.auto_translate import translate_form_template
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Forms"])

_forms_read = require_permission("forms:read")
_forms_write = require_permission("forms:write")
_forms_delete = require_permission("forms:delete")

@router.get("/form-templates")
async def get_form_templates(
    discipline: Optional[str] = None,
    equipment_type_id: Optional[str] = None,
    failure_mode_id: Optional[str] = None,
    search: Optional[str] = None,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(_forms_read)
):
    """Get form templates with optional filters."""
    from services.query_cache import query_cache
    import time
    
    start = time.time()
    
    # Cache only for default unfiltered queries
    is_default = not discipline and not equipment_type_id and not failure_mode_id and not search and active_only and skip == 0
    cache_key = f"form_templates:default:{limit}" if is_default else None
    
    if cache_key:
        cached = query_cache.get(cache_key)
        if cached is not None:
            logger.info(f"CACHE HIT: form_templates in {(time.time()-start)*1000:.0f}ms")
            return cached
    
    result = await form_service.get_templates(
        discipline=discipline,
        equipment_type_id=equipment_type_id,
        failure_mode_id=failure_mode_id,
        search=search,
        active_only=active_only,
        skip=skip,
        limit=limit,
        user=current_user,
    )
    
    if cache_key:
        query_cache.set(cache_key, result, ttl=300)  # 5 minutes
        logger.info(f"CACHE MISS: form_templates fetched from DB in {(time.time()-start)*1000:.0f}ms")
    
    return result

@router.get("/form-templates/{template_id}")
async def get_form_template(
    template_id: str,
    current_user: dict = Depends(_forms_read)
):
    """Get a specific form template."""
    template = await form_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Form template not found")
    return template

@router.get("/form-templates/{template_id}/versions")
async def get_form_template_versions(
    template_id: str,
    current_user: dict = Depends(_forms_read)
):
    """Get all versions of a form template."""
    versions = await form_service.get_template_versions(template_id)
    return {"versions": versions}

@router.post("/form-templates")
async def create_form_template(
    data: FormTemplateCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_forms_write)
):
    """Create a new form template."""
    from services.query_cache import query_cache
    result = await form_service.create_template(data.model_dump(), current_user["id"], user=current_user)
    query_cache.invalidate("form_templates")
    # Trigger auto-translation in background
    if result and result.get("id"):
        schedule_tracked_job(
            background_tasks,
            "translate_form_template",
            translate_form_template,
            result["id"],
            {
                "name": result.get("name", ""),
                "description": result.get("description", "") or "",
            },
            current_user["id"],
            user_id=current_user["id"],
        )
    return result

@router.patch("/form-templates/{template_id}")
async def update_form_template(
    template_id: str,
    data: FormTemplateUpdate,
    background_tasks: BackgroundTasks,
    create_version: bool = True,
    current_user: dict = Depends(_forms_write)
):
    """Update a form template. Creates new version if template has been used."""
    import logging
    from services.query_cache import query_cache
    logger = logging.getLogger(__name__)
    
    # Log update attempt
    logger.info(f"[FormTemplateUpdate] template_id={template_id} user={current_user.get('id')} create_version={create_version}")
    
    try:
        update_data = data.model_dump(exclude_unset=True)
        logger.info(f"[FormTemplateUpdate] payload_keys={list(update_data.keys())}")
        
        result = await form_service.update_template(
            template_id,
            update_data,
            create_new_version=create_version
        )
        
        if not result:
            logger.warning(f"[FormTemplateUpdate] template_id={template_id} not found")
            raise HTTPException(status_code=404, detail="Form template not found")
        
        query_cache.invalidate("form_templates")
        logger.info(f"[FormTemplateUpdate] success template_id={template_id} version={result.get('version')}")
        # Trigger auto-translation if name or description changed
        if any(k in update_data for k in ("name", "description")):
            schedule_tracked_job(
                background_tasks,
                "translate_form_template",
                translate_form_template,
                template_id,
                {
                    "name": result.get("name", ""),
                    "description": result.get("description", "") or "",
                },
                current_user["id"],
                user_id=current_user["id"],
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[FormTemplateUpdate] error template_id={template_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update template: {str(e)}")

@router.delete("/form-templates/{template_id}")
async def delete_form_template(
    template_id: str,
    current_user: dict = Depends(_forms_delete)
):
    """Delete (deactivate) a form template."""
    from services.query_cache import query_cache
    deleted = await form_service.delete_template(template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Form template not found")
    query_cache.invalidate("form_templates")
    return {"message": "Form template deactivated"}

# --- Form Fields ---

@router.post("/form-templates/{template_id}/fields")
async def add_form_field(
    template_id: str,
    field: FormFieldDefinition,
    current_user: dict = Depends(_forms_write)
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
    current_user: dict = Depends(_forms_write)
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
    current_user: dict = Depends(_forms_delete)
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
    current_user: dict = Depends(_forms_write)
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
    template_id: Optional[str] = None,
    has_warnings: Optional[bool] = None,
    has_critical: Optional[bool] = None,
    skip: int = 0,
    limit: int = 10,
    current_user: dict = Depends(_forms_read),
):
    """Get form submissions list (lightweight projection)."""
    return await form_service.list_submissions_lightweight(
        form_template_id=form_template_id,
        template_id=template_id,
        has_warnings=has_warnings,
        has_critical=has_critical,
        skip=skip,
        limit=limit,
        user=current_user,
    )


@router.get("/form-submissions/{submission_id}")
async def get_form_submission(
    submission_id: str,
    current_user: dict = Depends(_forms_read)
):
    """Get a specific form submission."""
    submission = await form_service.get_submission_by_id(submission_id, user=current_user)
    if not submission:
        raise HTTPException(status_code=404, detail="Form submission not found")
    return submission

@router.post("/form-submissions")
async def submit_form(
    data: FormSubmission,
    current_user: dict = Depends(_forms_write)
):
    """Submit a form with data validation and threshold evaluation."""
    try:
        return await form_service.submit_form(
            data.model_dump(), current_user["id"], user=current_user
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/form-submissions/{submission_id}")
async def delete_form_submission(
    submission_id: str,
    current_user: dict = Depends(_forms_delete),
):
    """Delete a form submission by custom ID or MongoDB ObjectId."""
    return await form_service.delete_submission(submission_id, current_user)


# --- Form Analytics ---

@router.get("/form-templates/{template_id}/analytics")
async def get_form_analytics(
    template_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(_forms_read)
):
    """Get analytics for a form template."""
    from_dt = datetime.fromisoformat(from_date) if from_date else None
    to_dt = datetime.fromisoformat(to_date) if to_date else None
    
    return await form_service.get_form_analytics(
        template_id, from_dt, to_dt, user=current_user
    )


# --- Document Management ---

@router.post("/form-templates/{template_id}/documents")
async def upload_form_document(
    template_id: str,
    file: UploadFile = File(...),
    description: Optional[str] = None,
    current_user: dict = Depends(_forms_write)
):
    """Upload a reference document to a form template."""
    from services.storage_service import is_storage_available

    if not is_storage_available():
        raise HTTPException(status_code=501, detail="Storage service not available")

    template = await form_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Form template not found")

    filename = file.filename or "document"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    allowed_extensions = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv", "jpg", "jpeg", "png"]

    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not allowed. Allowed: {allowed_extensions}")

    file_data = await file.read()
    if len(file_data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 25MB")

    content_type = MIME_TYPES.get(ext, "application/octet-stream")

    return await form_service.add_template_document(
        template_id,
        filename=filename,
        file_data=file_data,
        content_type=content_type,
        ext=ext,
        description=description,
        uploaded_by=current_user["id"],
    )


@router.delete("/form-templates/{template_id}/documents/{document_id}")
async def delete_form_document(
    template_id: str,
    document_id: str,
    current_user: dict = Depends(_forms_delete),
):
    """Delete a document from a form template."""
    template = await form_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Form template not found")

    return await form_service.remove_template_document(template_id, document_id)


@router.get("/form-documents/{document_path:path}")
async def serve_form_document(
    document_path: str,
    token: str = Query(None),
    authorization: str = Header(None),
    current_user: dict = Depends(_forms_read)
):
    """Serve a form document file from MongoDB storage.
    
    Authentication can be provided via:
    - Authorization: Bearer <token> header
    - ?token=<token> query parameter (for browser image loading)
    """
    from fastapi.responses import Response
    from services.storage_service import get_object_async
    
    try:
        # Get the document from storage
        content, content_type = await get_object_async(document_path)
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename=\"{document_path.split('/')[-1]}\"",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*"
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        logger.error(f"Failed to serve document {document_path}: {e}")
        raise HTTPException(status_code=404, detail="Document not found")



@router.get("/form-templates/{template_id}/documents")
async def get_form_documents(
    template_id: str,
    current_user: dict = Depends(_forms_read)
):
    """Get all documents attached to a form template."""
    template = await form_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Form template not found")
    
    return {"documents": template.get("documents", [])}


class DocumentSearchRequest(BaseModel):
    query: str
    document_ids: Optional[List[str]] = None  # Specific docs to search, or all if None


@router.post("/form-templates/{template_id}/documents/search")
async def search_form_documents(
    template_id: str,
    request: DocumentSearchRequest,
    current_user: dict = Depends(_forms_write)
):
    """AI-powered search across form template documents."""
    template = await form_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Form template not found")
    
    documents = template.get("documents", [])
    if not documents:
        return {"results": [], "message": "No documents attached to this form template"}
    
    # Filter to specific documents if requested
    if request.document_ids:
        documents = [d for d in documents if d["id"] in request.document_ids]
    
    if not documents:
        return {"results": [], "message": "No matching documents found"}
    
    # Use AI to search documents
    try:
        # Build context from documents
        doc_context = "\n\n".join([
            f"Document: {d['name']}\nDescription: {d.get('description', 'No description')}\nType: {d['type']}"
            for d in documents
        ])
        
        from services.ai_execute_grounded import execute_grounded, overlay_grounded_contract

        grounded = await execute_grounded(
            user=current_user,
            intent="document_search",
            query=request.query,
            feature="forms.document_search",
            prompt_id="forms.document_search",
            endpoint="forms.document_search",
            model="gpt-4o-mini",
            temperature=0.3,
            use_registry_prompt=True,
            prompt_variables={"doc_context": doc_context},
        )

        return overlay_grounded_contract(
            {
                "query": request.query,
                "answer": grounded.get("summary") or grounded.get("recommendation") or "",
                "relevant_documents": [
                    {"id": d["id"], "name": d["name"], "url": d["url"], "type": d["type"]}
                    for d in documents
                ],
                "source": "ai",
            },
            grounded,
        )
        
    except Exception as e:
        logger.error(f"AI document search failed: {e}")
        # Fallback: return documents with simple keyword matching
        query_lower = request.query.lower()
        relevant = [
            d for d in documents
            if query_lower in d["name"].lower() or query_lower in d.get("description", "").lower()
        ]
        
        return {
            "query": request.query,
            "answer": f"Found {len(relevant)} potentially relevant document(s). AI search unavailable.",
            "relevant_documents": [
                {"id": d["id"], "name": d["name"], "url": d["url"], "type": d["type"]}
                for d in (relevant if relevant else documents)
            ],
            "source": "keyword"
        }

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

