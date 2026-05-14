"""
Forms routes.
"""
import os
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Header
from datetime import datetime
from database import db, form_service
from services.cache_service import cache
from auth import get_current_user
from models.form_models import (
    FormTemplateCreate, FormTemplateUpdate,
    FormFieldDefinition, FormFieldUpdate,
    FormSubmission
)
from services.storage_service import put_object, get_object, MIME_TYPES
import logging
import uuid

logger = logging.getLogger(__name__)

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
        limit=limit
    )
    
    if cache_key:
        query_cache.set(cache_key, result, ttl=300)  # 5 minutes
        logger.info(f"CACHE MISS: form_templates fetched from DB in {(time.time()-start)*1000:.0f}ms")
    
    return result

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
    from services.query_cache import query_cache
    result = await form_service.create_template(data.model_dump(), current_user["id"])
    query_cache.invalidate("form_templates")
    return result

@router.patch("/form-templates/{template_id}")
async def update_form_template(
    template_id: str,
    data: FormTemplateUpdate,
    create_version: bool = True,
    current_user: dict = Depends(get_current_user)
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
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[FormTemplateUpdate] error template_id={template_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update template: {str(e)}")

@router.delete("/form-templates/{template_id}")
async def delete_form_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
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
    template_id: Optional[str] = None,  # Legacy parameter name
    has_warnings: Optional[bool] = None,
    has_critical: Optional[bool] = None,
    skip: int = 0,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """
    Get form submissions list - ULTRA-LIGHTWEIGHT endpoint.
    
    Returns lightweight submission objects for list view.
    For full submission details, use GET /api/form-submissions/{id}
    
    Performance target: < 500ms response time; supports skip/limit (max 200) and returns full match count in `total`.
    """
    import time
    import asyncio
    
    start_time = time.time()
    
    # Pagination: default 10, max 200 (list view stays lightweight via projection)
    limit = min(max(limit, 1), 200)
    skip = max(skip, 0)
    
    # MINIMAL projection - lightweight fields only
    projection = {
        "_id": 0,
        "id": 1,
        "form_template_id": 1,
        "form_template_name": 1,
        # Critical for consistent reprints: use the label template captured at submission time
        "label_template_id": 1,
        "task_instance_id": 1,
        "equipment_id": 1,
        "equipment_name": 1,
        "submitted_by": 1,
        "submitted_by_name": 1,
        "submitted_at": 1,
        "created_at": 1,
        "status": 1,
        "has_warnings": 1,
        "has_critical": 1,
        "discipline": 1,
        "task_template_name": 1
    }
    
    # Build query
    query = {}
    effective_template_id = form_template_id or template_id
    if effective_template_id:
        query["form_template_id"] = effective_template_id
    if has_warnings is not None:
        query["has_warnings"] = has_warnings
    if has_critical is not None:
        query["has_critical"] = has_critical
    
    try:
        total_matching = await asyncio.wait_for(
            db.form_submissions.count_documents(query),
            timeout=2.0,
        )

        # 3 second hard timeout
        async def execute_query():
            # Query with projection, sort by submitted_at DESC, skip/limit
            cursor = db.form_submissions.find(query, projection).sort("submitted_at", -1).skip(skip).limit(limit)
            return await cursor.to_list(length=limit)
        
        raw_submissions = await asyncio.wait_for(execute_query(), timeout=2.0)
        
        # Collect equipment IDs for tag lookup
        equipment_ids = list(set(doc.get("equipment_id") for doc in raw_submissions if doc.get("equipment_id")))
        
        # Batch fetch equipment tags
        equipment_tag_map = {}
        if equipment_ids:
            try:
                equip_cursor = db.equipment_nodes.find(
                    {"id": {"$in": equipment_ids}},
                    {"_id": 0, "id": 1, "tag": 1}
                )
                async for eq in equip_cursor:
                    if eq.get("tag"):
                        equipment_tag_map[eq["id"]] = eq["tag"]
            except Exception:
                pass
        
        # Collect user IDs for avatar lookup (fast batch query)
        user_ids = list(set(doc.get("submitted_by") for doc in raw_submissions if doc.get("submitted_by")))
        
        # Quick user avatar lookup (1 second timeout)
        user_avatars = {}
        if user_ids:
            try:
                async def fetch_avatars():
                    users = await db.users.find(
                        {"id": {"$in": user_ids}},
                        {"_id": 0, "id": 1, "avatar_path": 1, "avatar_data": 1}
                    ).to_list(length=200)
                    return {u["id"]: bool(u.get("avatar_path") or u.get("avatar_data")) for u in users}
                user_avatars = await asyncio.wait_for(fetch_avatars(), timeout=1.0)
            except asyncio.TimeoutError:
                pass  # Skip avatars on timeout
        
        # Transform to response format matching frontend expectations
        submissions = []
        def serialize_datetime(dt):
            """Serialize datetime to ISO format with UTC timezone suffix."""
            if dt is None:
                return None
            if hasattr(dt, 'isoformat'):
                iso_str = dt.isoformat()
                # Ensure UTC suffix is present (MongoDB returns naive datetimes)
                if not iso_str.endswith('Z') and '+' not in iso_str and '-' not in iso_str[-6:]:
                    iso_str += '+00:00'
                return iso_str
            return dt
        
        for doc in raw_submissions:
            # Handle datetime serialization - ensure UTC suffix
            submitted_at = serialize_datetime(doc.get("submitted_at") or doc.get("created_at"))
            created_at = serialize_datetime(doc.get("created_at"))
            
            # Build avatar URL if user has avatar
            submitted_by = doc.get("submitted_by")
            submitted_by_photo = None
            if submitted_by and user_avatars.get(submitted_by):
                submitted_by_photo = f"/api/users/{submitted_by}/avatar"
            
            submissions.append({
                "id": doc.get("id"),
                "form_template_id": doc.get("form_template_id"),
                "form_template_name": doc.get("form_template_name"),
                "label_template_id": doc.get("label_template_id"),
                "task_instance_id": doc.get("task_instance_id"),
                "task_template_name": doc.get("task_template_name"),
                "equipment_id": doc.get("equipment_id"),
                "equipment_name": doc.get("equipment_name"),
                "equipment_tag": equipment_tag_map.get(doc.get("equipment_id")),
                "submitted_by": submitted_by,
                "submitted_by_name": doc.get("submitted_by_name"),
                "submitted_by_photo": submitted_by_photo,
                "submitted_at": submitted_at,
                "created_at": created_at,
                "status": doc.get("status", "completed"),
                "has_warnings": doc.get("has_warnings", False),
                "has_critical": doc.get("has_critical", False),
                "discipline": doc.get("discipline")
            })
        
        duration = time.time() - start_time
        logger.info(
            f"GET /api/form-submissions completed in {duration:.3f}s - returned {len(submissions)} of {total_matching} matching (skip={skip}, limit={limit})"
        )
        
        # `total` = documents matching query; list may be shorter due to skip/limit
        return {
            "total": total_matching,
            "returned": len(submissions),
            "skip": skip,
            "limit": limit,
            "submissions": submissions,
        }
        
    except asyncio.TimeoutError:
        logger.error("GET /api/form-submissions TIMEOUT after 3s")
        return {"total": 0, "submissions": [], "error": "timeout"}
    except Exception as e:
        logger.error(f"GET /api/form-submissions ERROR: {e}")
        return {"total": 0, "submissions": [], "error": "timeout"}

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


@router.delete("/form-submissions/{submission_id}")
async def delete_form_submission(
    submission_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a form submission by custom ID or MongoDB ObjectId."""
    from bson import ObjectId
    
    # First, get the submission to check if it's linked to a task
    submission = await db.form_submissions.find_one({"id": submission_id})
    if not submission:
        if ObjectId.is_valid(submission_id):
            submission = await db.form_submissions.find_one({"_id": ObjectId(submission_id)})
    
    if not submission:
        raise HTTPException(status_code=404, detail="Form submission not found")

    # Authorization: only owner/admin or the original submitter can delete.
    role = (current_user or {}).get("role")
    user_id = (current_user or {}).get("id")
    submitted_by = submission.get("submitted_by")
    is_privileged = role in ("owner", "admin")
    is_submitter = bool(user_id) and bool(submitted_by) and (submitted_by == user_id)
    if not (is_privileged or is_submitter):
        raise HTTPException(status_code=403, detail="Not allowed to delete this submission")
    
    task_instance_id = submission.get("task_instance_id") if submission else None
    
    # Delete the form submission
    result = await db.form_submissions.delete_one({"id": submission_id})
    
    if result.deleted_count == 0:
        # Fallback: try by MongoDB ObjectId
        if ObjectId.is_valid(submission_id):
            result = await db.form_submissions.delete_one({"_id": ObjectId(submission_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Form submission not found")
    
    # If the submission was linked to a task instance, reset the task status
    if task_instance_id:
        await db.task_instances.update_one(
            {"id": task_instance_id},
            {
                "$set": {
                    "status": "planned",
                    "completed_at": None,
                    "completed_by_id": None,
                    "completed_by_name": None,
                    "completion_notes": None,
                }
            }
        )
    
    return {"message": "Form submission deleted successfully"}


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


# --- Document Management ---

@router.post("/form-templates/{template_id}/documents")
async def upload_form_document(
    template_id: str,
    file: UploadFile = File(...),
    description: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Upload a reference document to a form template."""
    from bson import ObjectId
    from services.storage_service import put_object_async, is_storage_available
    
    if not is_storage_available():
        raise HTTPException(status_code=501, detail="Storage service not available")
    
    # Verify template exists
    template = await form_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Form template not found")
    
    # Get file extension and validate
    filename = file.filename or "document"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    allowed_extensions = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv", "jpg", "jpeg", "png"]
    
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not allowed. Allowed: {allowed_extensions}")
    
    # Read file data
    file_data = await file.read()
    max_size = 25 * 1024 * 1024  # 25MB limit
    if len(file_data) > max_size:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 25MB")
    
    # Generate storage path
    doc_id = str(uuid.uuid4())
    storage_path = f"forms/{template_id}/documents/{doc_id}.{ext}"
    content_type = MIME_TYPES.get(ext, "application/octet-stream")
    
    # Upload to MongoDB storage
    try:
        result = await put_object_async(storage_path, file_data, content_type)
        doc_url = result.get("path", storage_path)
    except Exception as e:
        logger.error(f"Failed to upload document: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload document")
    
    # Create document metadata
    doc_metadata = {
        "id": doc_id,
        "name": filename,
        "url": doc_url,
        "storage_path": storage_path,
        "type": ext,
        "content_type": content_type,
        "size_bytes": len(file_data),
        "description": description or "",
        "uploaded_by": current_user["id"],
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    
    # Add document to template using ObjectId
    await db.form_templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$push": {"documents": doc_metadata}}
    )
    
    return {"message": "Document uploaded successfully", "document": doc_metadata}


@router.delete("/form-templates/{template_id}/documents/{document_id}")
async def delete_form_document(
    template_id: str,
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a document from a form template."""
    from bson import ObjectId
    
    template = await form_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Form template not found")
    
    # Remove document from template using ObjectId
    result = await db.form_templates.update_one(
        {"_id": ObjectId(template_id)},
        {"$pull": {"documents": {"id": document_id}}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {"message": "Document deleted successfully"}


@router.get("/form-documents/{document_path:path}")
async def serve_form_document(
    document_path: str,
    token: str = Query(None),
    authorization: str = Header(None),
    current_user: dict = Depends(get_current_user)
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
    current_user: dict = Depends(get_current_user)
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
    current_user: dict = Depends(get_current_user)
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
        from openai import OpenAI
        
        # Build context from documents
        doc_context = "\n\n".join([
            f"Document: {d['name']}\nDescription: {d.get('description', 'No description')}\nType: {d['type']}"
            for d in documents
        ])
        
        system_prompt = f"""You are a helpful assistant that searches reference documents for a form.
The user is filling out a form and needs help finding information in the attached documents.

Available Documents:
{doc_context}

Provide helpful, concise answers based on the document names, descriptions and types available.
If a specific document would be most relevant, mention its name.
If you cannot find relevant information, say so clearly and suggest which document type might help."""
        
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise Exception("OpenAI API key not configured")
            
        client = OpenAI(api_key=api_key)
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.query}
            ],
            temperature=0.3
        )
        
        answer = response.choices[0].message.content
        
        return {
            "query": request.query,
            "answer": answer,
            "relevant_documents": [
                {"id": d["id"], "name": d["name"], "url": d["url"], "type": d["type"]}
                for d in documents
            ],
            "source": "ai"
        }
        
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

