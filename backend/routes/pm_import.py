"""
PM Intelligence Import Routes - Upload and process maintenance plans.

Converts preventive maintenance plans (Excel, PDF, images) into structured
failure mode intelligence for the AssetIQ Failure Mode Library.
"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import io
import json

from database import db
from auth import get_current_user
from services.pm_import_service import PMImportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pm-import", tags=["PM Intelligence Import"])


# ============== MODELS ==============

class TaskUpdateRequest(BaseModel):
    """Request model for updating a task."""
    component: Optional[str] = None
    task_type: Optional[str] = None
    suggested_failure_modes: Optional[List[str]] = None
    failure_mechanisms: Optional[List[str]] = None
    detection_methods: Optional[List[str]] = None
    existing_control: Optional[str] = None
    frequency: Optional[str] = None


class ImportRequest(BaseModel):
    """Request model for final import."""
    include_low_confidence: bool = True


class BulkActionRequest(BaseModel):
    """Request model for bulk actions."""
    task_ids: Optional[List[str]] = None
    action: str  # "accept", "reject", "accept_high_confidence"


class SelectMatchRequest(BaseModel):
    """Request model for selecting a failure mode match."""
    match_id: str


class ApproveNewFMRequest(BaseModel):
    """Request model for approving a new failure mode creation."""
    failure_mode: str
    equipment: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[int] = 5
    occurrence: Optional[int] = 5
    detectability: Optional[int] = 5


# Background task for processing
async def process_pm_file_background(
    session_id: str,
    file_name: str,
    file_type: str,
    file_content: bytes,
    created_by: str
):
    """Process PM file in background."""
    pm_service = PMImportService(db)
    try:
        await pm_service.process_session(
            session_id=session_id,
            file_name=file_name,
            file_type=file_type,
            file_content=file_content
        )
    except Exception as e:
        logger.error(f"Background processing error for session {session_id}: {e}", exc_info=True)
        # Update session with error
        await db.pm_import_sessions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "error",
                "error_message": str(e),
                "progress_message": f"Error: {str(e)[:200]}",
                "updated_at": datetime.now(timezone.utc)
            }}
        )


# ============== ROUTES ==============

@router.post("/upload")
async def upload_pm_plan(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a preventive maintenance plan for processing.
    
    Supported file types:
    - Excel (.xlsx, .xls)
    - PDF
    - Images (.png, .jpg, .jpeg, .webp)
    
    Returns a session ID to track processing progress.
    """
    
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Get file extension
    filename_lower = file.filename.lower()
    
    if filename_lower.endswith(('.xlsx', '.xls')):
        file_type = 'xlsx' if filename_lower.endswith('.xlsx') else 'xls'
    elif filename_lower.endswith('.pdf'):
        file_type = 'pdf'
    elif filename_lower.endswith('.png'):
        file_type = 'png'
    elif filename_lower.endswith(('.jpg', '.jpeg')):
        file_type = 'jpg'
    elif filename_lower.endswith('.webp'):
        file_type = 'webp'
    else:
        raise HTTPException(
            status_code=400, 
            detail="Unsupported file type. Supported: Excel (.xlsx, .xls), PDF, Images (.png, .jpg, .jpeg, .webp)"
        )
    
    # Read file content
    content = await file.read()
    
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    
    # Max file size: 20MB
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 20MB")
    
    # Create PM Import service
    pm_service = PMImportService(db)
    user_id = current_user.get("id", current_user.get("email", "unknown"))
    
    # Create session first (quick - just DB insert)
    try:
        session_id = await pm_service.create_session_placeholder(
            file_name=file.filename,
            file_type=file_type,
            created_by=user_id
        )
        
        # Process file in background to avoid timeout
        asyncio.create_task(process_pm_file_background(
            session_id=session_id,
            file_name=file.filename,
            file_type=file_type,
            file_content=content,
            created_by=user_id
        ))
        
        return {
            "session_id": session_id,
            "status": "processing",
            "message": "File uploaded. Processing started in background. Poll session for status.",
            "stats": None,
            "tasks_count": 0
        }
        
    except Exception as e:
        logger.error(f"Upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the status and results of a PM import session.
    
    Returns:
    - Session status (processing, ready_for_review, imported, error)
    - Progress percentage
    - Extracted tasks with AI analysis
    - Statistics
    """
    
    pm_service = PMImportService(db)
    session = await pm_service.get_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Remove internal fields
    session.pop("_id", None)
    
    return session


@router.patch("/session/{session_id}/task/{task_id}")
async def update_task(
    session_id: str,
    task_id: str,
    updates: TaskUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a specific task in the review session.
    
    Allows editing:
    - Component name
    - Task type
    - Suggested failure modes
    - Failure mechanisms
    - Detection methods
    - Existing control description
    - Frequency
    """
    
    pm_service = PMImportService(db)
    
    update_data = updates.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    result = await pm_service.update_task(session_id, task_id, update_data)
    
    if not result:
        raise HTTPException(status_code=404, detail="Session or task not found")
    
    return {
        "success": True,
        "stats": result["stats"]
    }


@router.post("/session/{session_id}/task/{task_id}/accept")
async def accept_task(
    session_id: str,
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a task as accepted for import."""
    
    pm_service = PMImportService(db)
    result = await pm_service.accept_task(session_id, task_id)
    
    if not result:
        raise HTTPException(status_code=404, detail="Session or task not found")
    
    return {"success": True, "stats": result["stats"]}


@router.post("/session/{session_id}/task/{task_id}/reject")
async def reject_task(
    session_id: str,
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a task as rejected (won't be imported)."""
    
    pm_service = PMImportService(db)
    result = await pm_service.reject_task(session_id, task_id)
    
    if not result:
        raise HTTPException(status_code=404, detail="Session or task not found")
    
    return {"success": True, "stats": result["stats"]}


@router.post("/session/{session_id}/task/{task_id}/select-match")
async def select_match(
    session_id: str,
    task_id: str,
    request: SelectMatchRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Select a failure mode match for a task (Scenario B).
    
    When a task has multiple possible matches, user selects one.
    The task will be linked to the selected failure mode during import.
    """
    
    pm_service = PMImportService(db)
    
    result = await pm_service.update_task(
        session_id, 
        task_id, 
        {
            "selected_match_id": request.match_id,
            "review_status": "accepted"
        }
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Session or task not found")
    
    return {"success": True, "stats": result["stats"]}


@router.post("/session/{session_id}/task/{task_id}/approve-new-fm")
async def approve_new_failure_mode(
    session_id: str,
    task_id: str,
    request: ApproveNewFMRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Approve creation of a new failure mode for a task (Scenario C).
    
    When no reliable match is found, AI proposes a new failure mode.
    User reviews and approves the details before it gets created.
    """
    
    pm_service = PMImportService(db)
    
    result = await pm_service.update_task(
        session_id, 
        task_id, 
        {
            "approved_new_fm": {
                "failure_mode": request.failure_mode,
                "equipment": request.equipment,
                "category": request.category,
                "severity": request.severity,
                "occurrence": request.occurrence,
                "detectability": request.detectability
            },
            "review_status": "accepted"
        }
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Session or task not found")
    
    return {"success": True, "stats": result["stats"]}


@router.post("/session/{session_id}/bulk-action")
async def bulk_action(
    session_id: str,
    request: BulkActionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Perform bulk actions on tasks.
    
    Actions:
    - accept: Accept specified tasks
    - reject: Reject specified tasks
    - accept_high_confidence: Accept all tasks with confidence >= 70%
    """
    
    pm_service = PMImportService(db)
    
    if request.action == "accept_high_confidence":
        result = await pm_service.accept_all_high_confidence(session_id)
        if not result:
            raise HTTPException(status_code=404, detail="Session not found")
        return {
            "success": True,
            "accepted_count": result["accepted_count"],
            "stats": result["stats"]
        }
    
    elif request.action in ["accept", "reject"]:
        if not request.task_ids:
            raise HTTPException(status_code=400, detail="task_ids required for accept/reject")
        
        for task_id in request.task_ids:
            if request.action == "accept":
                await pm_service.accept_task(session_id, task_id)
            else:
                await pm_service.reject_task(session_id, task_id)
        
        session = await pm_service.get_session(session_id)
        return {
            "success": True,
            "processed_count": len(request.task_ids),
            "stats": session.get("stats") if session else {}
        }
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {request.action}")


@router.post("/session/{session_id}/import")
async def import_to_library(
    session_id: str,
    request: ImportRequest = ImportRequest(),
    current_user: dict = Depends(get_current_user)
):
    """
    Import accepted tasks to the Failure Mode Library.
    
    - Tasks with existing matches: Links as preventive control
    - New proposed tasks: Creates new failure mode entries
    - Low confidence items: Imported with warning if include_low_confidence=True
    """
    
    pm_service = PMImportService(db)
    
    try:
        result = await pm_service.import_to_library(
            session_id=session_id,
            created_by=current_user.get("id", current_user.get("email", "unknown"))
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Import error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}/export")
async def export_review(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Export the review results as an Excel file."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    
    pm_service = PMImportService(db)
    session = await pm_service.get_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    tasks = session.get("tasks_extracted", [])
    
    # Create workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "PM Import Review"
    
    # Headers
    headers = [
        "Original Task", "Component", "Task Type", "Suggested Failure Modes",
        "Failure Mechanisms", "Detection Methods", "Existing Control", 
        "Frequency", "Confidence", "Library Match", "Review Status"
    ]
    
    # Styles
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Write headers
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        cell.border = thin_border
    
    # Write data
    for row_idx, task in enumerate(tasks, 2):
        failure_modes = task.get("suggested_failure_modes", [])
        fm_str = ", ".join(fm if isinstance(fm, str) else fm.get("name", "") for fm in failure_modes)
        
        mechanisms = task.get("failure_mechanisms", [])
        mech_str = ", ".join(mechanisms) if isinstance(mechanisms, list) else str(mechanisms)
        
        detection = task.get("detection_methods", [])
        det_str = ", ".join(detection) if isinstance(detection, list) else str(detection)
        
        library_match = task.get("library_match", {})
        match_str = library_match.get("status", "unknown")
        if library_match.get("matched_name"):
            match_str += f" ({library_match['matched_name']})"
        
        row_data = [
            task.get("original_task", ""),
            task.get("component", ""),
            task.get("task_type", ""),
            fm_str,
            mech_str,
            det_str,
            task.get("existing_control", ""),
            task.get("frequency", ""),
            task.get("confidence_score", 0),
            match_str,
            task.get("review_status", "pending")
        ]
        
        for col, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            
            # Color code confidence
            if col == 9:  # Confidence column
                if value >= 90:
                    cell.fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
                elif value >= 70:
                    cell.fill = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid")
                else:
                    cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    
    # Adjust column widths
    column_widths = [40, 20, 15, 35, 30, 25, 35, 15, 12, 25, 15]
    for col, width in enumerate(column_widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width
    
    # Freeze header
    ws.freeze_panes = "A2"
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"pm_import_review_{session_id[:8]}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a PM import session."""
    
    result = await db.pm_import_sessions.delete_one({"session_id": session_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"success": True, "message": "Session deleted"}


@router.get("/sessions")
async def list_sessions(
    limit: int = 20,
    skip: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """List PM import sessions for the current user."""
    
    user_id = current_user.get("id", current_user.get("email", "unknown"))
    
    cursor = db.pm_import_sessions.find(
        {"created_by": user_id}
    ).sort("created_at", -1).skip(skip).limit(limit)
    
    sessions = []
    async for session in cursor:
        sessions.append({
            "session_id": session["session_id"],
            "file_name": session["file_name"],
            "status": session["status"],
            "stats": session.get("stats", {}),
            "created_at": session["created_at"].isoformat() if session.get("created_at") else None
        })
    
    total = await db.pm_import_sessions.count_documents({"created_by": user_id})
    
    return {
        "sessions": sessions,
        "total": total
    }
