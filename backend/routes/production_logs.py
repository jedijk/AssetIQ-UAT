"""Production logs routes — orchestration only (Wave 10)."""
from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile

from auth import require_permission
from services import production_logs_service as svc
from services.production_logs_service import (
    BatchIngestRequest,
    BatchIngestWithTemplateRequest,
    IngestRequest,
    ParseTemplate,
    SaveTemplateRequest,
    SavedTemplate,
)

router = APIRouter(prefix="/production-logs", tags=["Production Logs"])

_read = require_permission("settings:read")
_write = require_permission("settings:write")


@router.post("/upload")
async def upload_log_files(
    files: List[UploadFile] = File(...),
    job_id: Optional[str] = Form(None),
    current_user: dict = Depends(_write),
):
    return await svc.upload_log_files(current_user, files, job_id)

@router.post("/detect-columns")
async def detect_columns(
    job_id: str = Form(...),
    file_id: Optional[str] = Form(None),
    delimiter: str = Form(","),
    has_header: bool = Form(True),
    skip_rows: int = Form(0),
    current_user: dict = Depends(_write),
):
    return await svc.detect_columns(current_user, job_id, file_id, delimiter, has_header, skip_rows)

@router.post("/parse-preview")
async def parse_preview(
    job_id: str = Form(...),
    template_json: str = Form(...),
    current_user: dict = Depends(_write),
):
    return await svc.parse_preview(current_user, job_id, template_json)

@router.post("/ingest")
async def ingest_logs(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_write),
):
    return await svc.ingest_logs(current_user, request, background_tasks)

@router.post("/batch-ingest")
async def batch_ingest_logs(
    request: BatchIngestRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_write),
):
    return await svc.batch_ingest_logs(current_user, request, background_tasks)

@router.get("/jobs")
async def list_jobs(
    current_user: dict = Depends(_read),
):
    return await svc.list_jobs(current_user)

@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    current_user: dict = Depends(_read),
):
    return await svc.get_job(current_user, job_id)

@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    current_user: dict = Depends(_write),
):
    return await svc.delete_job(current_user, job_id)

@router.post("/templates")
async def save_template(
    request: SaveTemplateRequest,
    current_user: dict = Depends(_write),
):
    return await svc.save_template(current_user, request)

@router.get("/templates")
async def list_templates(
    current_user: dict = Depends(_read),
):
    return await svc.list_templates(current_user)

@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    current_user: dict = Depends(_read),
):
    return await svc.get_template(current_user, template_id)

@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    request: SaveTemplateRequest,
    current_user: dict = Depends(_write),
):
    return await svc.update_template(current_user, template_id, request)

@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    current_user: dict = Depends(_write),
):
    return await svc.delete_template(current_user, template_id)

@router.post("/batch-ingest-with-template")
async def batch_ingest_with_saved_template(
    request: BatchIngestWithTemplateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_write),
):
    return await svc.batch_ingest_with_saved_template(current_user, request, background_tasks)

@router.post("/preview-template-match")
async def preview_template_match(
    job_id: str = Form(...),
    template_id: str = Form(...),
    current_user: dict = Depends(_write),
):
    return await svc.preview_template_match(current_user, job_id, template_id)

@router.get("/entries")
async def query_entries(
    asset_id: Optional[str] = None,
    event_type: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    current_user: dict = Depends(_read),
):
    return await svc.query_entries(current_user, asset_id, event_type, start, end, limit, skip)

@router.get("/available-dates")
async def get_available_dates(
    asset_id: Optional[str] = None,
    current_user: dict = Depends(_read),
):
    return await svc.get_available_dates(current_user, asset_id)

@router.get("/stats")
async def get_log_stats(
    current_user: dict = Depends(_read),
):
    return await svc.get_log_stats(current_user)

@router.post("/aggregate")
async def run_aggregation(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(_write),
):
    return await svc.run_aggregation(current_user, background_tasks)

@router.get("/history")
async def get_asset_history(
    asset_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 500,
    current_user: dict = Depends(_read),
):
    return await svc.get_asset_history(current_user, asset_id, start, end, limit)

@router.get("/assets")
async def list_log_assets(
    current_user: dict = Depends(_read),
):
    return await svc.list_log_assets(current_user)

@router.get("/timeseries")
async def get_timeseries(
    asset_id: str,
    metric: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: dict = Depends(_read),
):
    return await svc.get_timeseries(current_user, asset_id, metric, start, end)

@router.post("/ai-parse")
async def ai_parse_file(
    job_id: str = Form(...),
    file_id: Optional[str] = Form(None),
    current_user: dict = Depends(_write),
):
    return await svc.ai_parse_file(current_user, job_id, file_id)
