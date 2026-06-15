"""
Production Log Ingestion & History Builder.

Endpoints for uploading, parsing, previewing, and ingesting production log files.
Supports CSV, TXT, LOG, ZIP formats with template-based and AI-assisted parsing.
Owner-only access.
"""
import os
import io
import re
import csv
import json
import uuid
import zipfile
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel
from database import db
from services.production_logs_parsing import (
    ColumnMapping,
    ParseTemplate,
    _detect_delimiter,
    _fuzzy_match_columns,
    _get_ext,
    _parse_csv_content,
    _parse_excel_content,
    _parse_timestamp,
)
from services.storage_service import put_object_async
from services.background_jobs import schedule_tracked_job
from services.ai_gateway import chat as ai_gateway_chat, user_context

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"csv", "txt", "log", "zip", "xlsx", "xls"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


# Re-export parsing models for route imports
__all__ = ["ColumnMapping", "ParseTemplate"]

# ======================== Models ========================

class IngestRequest(BaseModel):
    job_id: str
    confirm: bool = True

class BatchIngestRequest(BaseModel):
    job_ids: List[str]
    template: dict


class ColumnAlias(BaseModel):
    """Defines aliases for flexible column matching."""
    canonical_name: str  # The standard name used internally
    aliases: List[str] = []  # Alternative names that map to this column


class SavedTemplate(BaseModel):
    name: str
    description: Optional[str] = None
    delimiter: str = ","
    has_header: bool = True
    skip_rows: int = 0
    timestamp_format: Optional[str] = None
    column_mapping: ColumnMapping = ColumnMapping()
    # Column aliases for fuzzy matching
    column_aliases: Dict[str, List[str]] = {}  # {canonical_name: [alias1, alias2, ...]}


class SaveTemplateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    template: dict
    column_aliases: Dict[str, List[str]] = {}


class BatchIngestWithTemplateRequest(BaseModel):
    job_ids: List[str]
    template_id: str


# ======================== Endpoints ========================

async def upload_log_files(user: dict,
    files: List[UploadFile] = File(...),
    job_id: Optional[str] = Form(None),
):
    """Upload one or more log files. Creates or appends to an ingestion job."""
    is_new = job_id is None
    if is_new:
        job_id = str(uuid.uuid4())

    # Read all files into memory first (fast)
    pending_uploads = []
    for file in files:
        ext = _get_ext(file.filename or "")
        if ext not in ALLOWED_EXTENSIONS:
            continue  # Skip invalid silently in chunked mode
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            continue

        if ext == "zip":
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    for name in zf.namelist():
                        inner_ext = _get_ext(name)
                        if inner_ext not in ("csv", "txt", "log", "xlsx", "xls"):
                            continue
                        inner_content = zf.read(name)
                        file_id = str(uuid.uuid4())
                        storage_path = f"production-logs/{job_id}/{file_id}.{inner_ext}"
                        mime = {"csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xls": "application/vnd.ms-excel"}.get(inner_ext, "text/plain")
                        pending_uploads.append((file_id, name, storage_path, inner_content, mime, inner_ext))
            except zipfile.BadZipFile:
                continue
        else:
            file_id = str(uuid.uuid4())
            storage_path = f"production-logs/{job_id}/{file_id}.{ext}"
            mime = {"csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xls": "application/vnd.ms-excel"}.get(ext, "text/plain")
            pending_uploads.append((file_id, file.filename, storage_path, content, mime, ext))

    if not pending_uploads:
        if is_new:
            raise HTTPException(status_code=400, detail="No valid files found")
        return {"job_id": job_id, "files_uploaded": 0, "files": []}

    # Upload to R2 in parallel batches of 10
    uploaded_files = []
    BATCH_SIZE = 10
    for i in range(0, len(pending_uploads), BATCH_SIZE):
        batch = pending_uploads[i:i + BATCH_SIZE]
        tasks = [put_object_async(p[2], p[3], p[4]) for p in batch]
        await asyncio.gather(*tasks)
        for file_id, filename, storage_path, content, mime, ext in batch:
            uploaded_files.append({
                "file_id": file_id,
                "filename": filename,
                "storage_path": storage_path,
                "size": len(content),
                "extension": ext,
            })

    if is_new:
        # Create new job
        job = {
            "id": job_id,
            "status": "uploaded",
            "files": uploaded_files,
            "total_files": len(uploaded_files),
            "records_parsed": 0,
            "records_ingested": 0,
            "records_failed": 0,
            "parse_template": None,
            "created_by": user.get("id"),
            "created_by_name": user.get("name", "Unknown"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.log_ingestion_jobs.insert_one(job)
    else:
        # Append files to existing job
        await db.log_ingestion_jobs.update_one(
            {"id": job_id},
            {
                "$push": {"files": {"$each": uploaded_files}},
                "$inc": {"total_files": len(uploaded_files)},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
            }
        )

    if not uploaded_files:
        raise HTTPException(status_code=400, detail="No valid files found")

    # Create ingestion job
    job = {
        "id": job_id,
        "status": "uploaded",
        "files": uploaded_files,
        "total_files": len(uploaded_files),
        "records_parsed": 0,
        "records_ingested": 0,
        "records_failed": 0,
        "parse_template": None,
        "created_by": user.get("id"),
        "created_by_name": user.get("name", "Unknown"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.log_ingestion_jobs.insert_one(job)

    return {
        "job_id": job_id,
        "files_uploaded": len(uploaded_files),
        "files": [{"filename": f["filename"], "size": f["size"]} for f in uploaded_files],
    }


async def detect_columns(user: dict,
    job_id: str = Form(...),
    file_id: Optional[str] = Form(None),
    delimiter: str = Form(","),
    has_header: bool = Form(True),
    skip_rows: int = Form(0),
):
    """Read the first file in a job and return detected columns/sample rows."""
    job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Pick target file
    target = None
    if file_id:
        target = next((f for f in job["files"] if f["file_id"] == file_id), None)
    if not target:
        target = job["files"][0]

    # Read file content
    from services.storage_service import get_object_async
    try:
        data, _ = await get_object_async(target["storage_path"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

    file_ext = target.get("extension", "").lower()
    is_excel = file_ext in ("xlsx", "xls")

    if is_excel:
        # Parse Excel to rows
        import openpyxl
        if file_ext == "xls":
            import xlrd
            wb = xlrd.open_workbook(file_contents=data)
            ws = wb.sheet_by_index(0)
            all_rows = []
            for r in range(ws.nrows):
                all_rows.append([str(ws.cell_value(r, c)) for c in range(ws.ncols)])
        else:
            wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            ws = wb.active
            all_rows = []
            for row in ws.iter_rows(values_only=True):
                all_rows.append([str(c) if c is not None else "" for c in row])
            wb.close()

        if skip_rows > 0:
            all_rows = all_rows[skip_rows:]

        rows = all_rows[:51]
        total_data_lines = len(all_rows) - (1 if has_header else 0)
    else:
        content = data.decode("utf-8", errors="replace")
        lines = content.splitlines()
        if skip_rows > 0:
            lines = lines[skip_rows:]
        if not lines:
            return {"columns": [], "sample_rows": [], "total_lines": 0}

        delim = delimiter
        if delim == "\\t":
            delim = "\t"

        reader = csv.reader(lines[:51], delimiter=delim)
        rows = list(reader)
        total_data_lines = len(lines) - (1 if has_header else 0)

    columns = []
    sample_rows = []
    if has_header and rows:
        columns = [h.strip() for h in rows[0]]
        sample_rows = rows[1:11]  # Next 10 rows
    elif rows:
        columns = [f"col_{i}" for i in range(len(rows[0]))]
        sample_rows = rows[:10]

    # Auto-detect timestamp and asset columns
    suggestions = {"timestamp": None, "asset_id": None, "status": None, "metrics": []}
    for col in columns:
        cl = col.lower()
        if any(w in cl for w in ["time", "date", "timestamp", "datetime"]):
            if not suggestions["timestamp"]:
                suggestions["timestamp"] = col
        elif any(w in cl for w in ["asset", "equipment", "tag", "unit", "machine", "device"]):
            if not suggestions["asset_id"]:
                suggestions["asset_id"] = col
        elif any(w in cl for w in ["status", "state", "condition"]):
            if not suggestions["status"]:
                suggestions["status"] = col
        else:
            # Check if column has numeric data
            numeric_count = 0
            for row in sample_rows[:5]:
                idx = columns.index(col) if col in columns else -1
                if idx >= 0 and idx < len(row):
                    try:
                        float(row[idx].replace(",", "."))
                        numeric_count += 1
                    except ValueError:
                        pass
            if numeric_count >= 2:
                suggestions["metrics"].append(col)

    return {
        "columns": columns,
        "sample_rows": [dict(zip(columns, row)) for row in sample_rows],
        "total_lines": total_data_lines,
        "suggestions": suggestions,
        "detected_delimiter": _detect_delimiter(rows[0][0] if rows else "") if not is_excel else ",",
    }


async def parse_preview(user: dict,
    job_id: str = Form(...),
    template_json: str = Form(...),
):
    """Parse files using a template and return a preview of the first 100 records."""
    job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        template = ParseTemplate(**json.loads(template_json))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid template: {e}")

    from services.storage_service import get_object_async

    all_records = []
    file_stats = []

    for f in job["files"]:
        try:
            data, _ = await get_object_async(f["storage_path"])
            file_ext = f.get("extension", "").lower()
            if file_ext in ("xlsx", "xls"):
                records = _parse_excel_content(data, file_ext, template)
            else:
                content = data.decode("utf-8", errors="replace")
                records = _parse_csv_content(content, template)
            file_stats.append({
                "filename": f["filename"],
                "total_rows": len(records),
                "errors": sum(1 for r in records if r.get("_errors")),
            })
            all_records.extend(records)
        except Exception as e:
            file_stats.append({"filename": f["filename"], "total_rows": 0, "errors": 0, "error": str(e)})

    # Calculate stats
    total = len(all_records)
    with_errors = sum(1 for r in all_records if r.get("_errors"))
    with_timestamp = sum(1 for r in all_records if r.get("timestamp"))
    with_asset = sum(1 for r in all_records if r.get("asset_id"))
    success_rate = round(((total - with_errors) / total * 100) if total > 0 else 0, 1)

    # Save template to job
    await db.log_ingestion_jobs.update_one(
        {"id": job_id},
        {"$set": {
            "parse_template": json.loads(template_json),
            "records_parsed": total,
            "status": "previewed",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Return preview (first 100)
    preview = all_records[:100]
    # Strip internal fields for response
    clean_preview = []
    for r in preview:
        entry = {k: v for k, v in r.items() if not k.startswith("_")}
        entry["_errors"] = r.get("_errors", [])
        entry["_row"] = r.get("_row")
        clean_preview.append(entry)

    return {
        "job_id": job_id,
        "total_records": total,
        "records_with_errors": with_errors,
        "records_with_timestamp": with_timestamp,
        "records_with_asset_id": with_asset,
        "success_rate": success_rate,
        "file_stats": file_stats,
        "preview": clean_preview,
        "event_summary": {
            "normal": sum(1 for r in all_records if r.get("event_type") == "normal"),
            "downtime": sum(1 for r in all_records if r.get("event_type") == "downtime"),
            "waste": sum(1 for r in all_records if r.get("event_type") == "waste"),
            "alarm": sum(1 for r in all_records if r.get("event_type") == "alarm"),
        }
    }


async def ingest_logs(user: dict,
    request: IngestRequest,
    background_tasks: BackgroundTasks,
):
    """Confirm and start async ingestion of parsed logs into production_logs collection."""
    job = await db.log_ingestion_jobs.find_one({"id": request.job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Job already ingested")
    if not job.get("parse_template"):
        raise HTTPException(status_code=400, detail="No parse template configured. Run preview first.")

    # Update status to processing
    await db.log_ingestion_jobs.update_one(
        {"id": request.job_id},
        {"$set": {"status": "processing", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Run ingestion in background
    schedule_tracked_job(
        background_tasks,
        "production_logs_ingest",
        _run_ingestion,
        request.job_id,
        job,
        user_id=user.get("id"),
    )

    return {"job_id": request.job_id, "status": "processing", "message": "Ingestion started"}


async def batch_ingest_logs(user: dict,
    request: BatchIngestRequest,
    background_tasks: BackgroundTasks,
):
    """Parse and ingest multiple jobs at once using the same template."""
    if not request.job_ids:
        raise HTTPException(status_code=400, detail="No jobs selected")

    try:
        template = ParseTemplate(**request.template)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid template: {e}")

    template_dict = request.template
    started = []

    for job_id in request.job_ids:
        job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            continue
        if job.get("status") == "completed":
            continue

        # Set template and mark as processing
        await db.log_ingestion_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "parse_template": template_dict,
                "status": "processing",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        job["parse_template"] = template_dict
        schedule_tracked_job(
            background_tasks,
            "production_logs_batch_ingest",
            _run_ingestion,
            job_id,
            job,
            user_id=user.get("id"),
        )
        started.append(job_id)

    return {
        "started": len(started),
        "job_ids": started,
        "message": f"Batch ingestion started for {len(started)} job(s)",
    }


async def _run_ingestion(job_id: str, job: dict):
    """Background task: parse all files and insert into production_logs."""
    from services.storage_service import get_object_async

    template = ParseTemplate(**job["parse_template"])
    total_ingested = 0
    total_failed = 0

    try:
        for f in job["files"]:
            try:
                data, _ = await get_object_async(f["storage_path"])
                file_ext = f.get("extension", "").lower()
                if file_ext in ("xlsx", "xls"):
                    records = _parse_excel_content(data, file_ext, template)
                else:
                    content = data.decode("utf-8", errors="replace")
                    records = _parse_csv_content(content, template)

                docs = []
                for r in records:
                    if not r.get("timestamp"):
                        total_failed += 1
                        continue
                    doc = {
                        "id": str(uuid.uuid4()),
                        "timestamp": r["timestamp"],
                        "asset_id": r.get("asset_id") or "unknown",
                        "metrics": r.get("metrics", {}),
                        "status": r.get("status"),
                        "event_type": r.get("event_type", "normal"),
                        "source": {
                            "job_id": job_id,
                            "file_id": f["file_id"],
                            "filename": f["filename"],
                            "row": r.get("_row"),
                        },
                        "ingested_at": datetime.now(timezone.utc).isoformat(),
                    }
                    # Add header metadata and secondary sheet data
                    for key in r:
                        if key not in ["_row", "_errors", "timestamp", "asset_id", "metrics", "status", "event_type"]:
                            doc[key] = r[key]
                    docs.append(doc)

                if docs:
                    await db.production_logs.insert_many(docs)
                    total_ingested += len(docs)

            except Exception as e:
                logger.error(f"[LogIngest] Failed to process {f['filename']}: {e}")
                total_failed += len(_parse_csv_content("", template))  # approximate

        # Update job as completed
        await db.log_ingestion_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "completed",
                "records_ingested": total_ingested,
                "records_failed": total_failed,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        logger.info(f"[LogIngest] Job {job_id} completed: {total_ingested} ingested, {total_failed} failed")

    except Exception as e:
        logger.error(f"[LogIngest] Job {job_id} failed: {e}")
        await db.log_ingestion_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "error": str(e),
                "records_ingested": total_ingested,
                "records_failed": total_failed,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )


async def list_jobs(user: dict,
):
    """List all ingestion jobs. Auto-reconciles uploaded jobs whose files are already ingested."""
    # Auto-reconcile: check if any "uploaded" jobs have files already in production_logs
    uploaded_jobs = await db.log_ingestion_jobs.find(
        {"status": "uploaded"}, {"_id": 1, "id": 1, "files": 1}
    ).to_list(200)

    if uploaded_jobs:
        # Get all ingested filenames in one query
        ingested_filenames = set(await db.production_logs.distinct("source.filename"))

        for job in uploaded_jobs:
            fnames = [f.get("filename", "") for f in job.get("files", [])]
            matched = sum(1 for f in fnames if f in ingested_filenames)
            if matched > 0:
                # Count actual ingested records for this job's files
                count = await db.production_logs.count_documents(
                    {"source.filename": {"$in": fnames}}
                )
                if count > 0:
                    await db.log_ingestion_jobs.update_one(
                        {"_id": job["_id"]},
                        {"$set": {"status": "completed", "records_ingested": count}},
                    )

    jobs = await db.log_ingestion_jobs.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    return {"jobs": jobs}


async def get_job(user: dict,
    job_id: str,
):
    """Get details of a specific ingestion job."""
    job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


async def delete_job(user: dict,
    job_id: str,
):
    """Delete a job and its ingested data."""
    job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Delete ingested records
    logs_result = await db.production_logs.delete_many({"source.job_id": job_id})
    logger.info(f"[LogIngest] Deleted {logs_result.deleted_count} records for job {job_id}")

    # Delete job
    job_result = await db.log_ingestion_jobs.delete_one({"id": job_id})
    if job_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "deleted_records": logs_result.deleted_count,
        "message": "Job and data deleted",
    }


# ======================== Template Management ========================

async def save_template(user: dict,
    request: SaveTemplateRequest,
):
    """Save a parse template for reuse."""
    # Check for duplicate name
    existing = await db.log_parse_templates.find_one({"name": request.name})
    if existing:
        raise HTTPException(status_code=400, detail="Template with this name already exists")
    
    template_doc = {
        "id": str(uuid.uuid4()),
        "name": request.name,
        "description": request.description,
        "template": request.template,
        "column_aliases": request.column_aliases,
        "created_by": user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "usage_count": 0,
    }
    
    await db.log_parse_templates.insert_one(template_doc)
    del template_doc["_id"]
    
    logger.info(f"[Templates] Created template '{request.name}' by user {user.get('id')}")
    return template_doc


async def list_templates(user: dict,
):
    """List all saved parse templates."""
    templates = await db.log_parse_templates.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"templates": templates}


async def get_template(user: dict,
    template_id: str,
):
    """Get a specific template."""
    template = await db.log_parse_templates.find_one({"id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return template


async def update_template(user: dict,
    template_id: str,
    request: SaveTemplateRequest,
):
    """Update an existing template."""
    template = await db.log_parse_templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check for duplicate name (if changed)
    if request.name != template.get("name"):
        existing = await db.log_parse_templates.find_one({"name": request.name, "id": {"$ne": template_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Template with this name already exists")
    
    await db.log_parse_templates.update_one(
        {"id": template_id},
        {"$set": {
            "name": request.name,
            "description": request.description,
            "template": request.template,
            "column_aliases": request.column_aliases,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    
    logger.info(f"[Templates] Updated template '{request.name}'")
    return {"message": "Template updated"}


async def delete_template(user: dict,
    template_id: str,
):
    """Delete a template."""
    result = await db.log_parse_templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    logger.info(f"[Templates] Deleted template {template_id}")
    return {"message": "Template deleted"}


async def batch_ingest_with_saved_template(user: dict,
    request: BatchIngestWithTemplateRequest,
    background_tasks: BackgroundTasks,
):
    """
    Batch ingest multiple jobs using a saved template with fuzzy column matching.
    This is the "train once, apply to many" workflow.
    """
    if not request.job_ids:
        raise HTTPException(status_code=400, detail="No jobs selected")
    
    # Get the saved template
    saved_template = await db.log_parse_templates.find_one({"id": request.template_id}, {"_id": 0})
    if not saved_template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    try:
        base_template = ParseTemplate(**saved_template["template"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid template configuration: {e}")
    
    column_aliases = saved_template.get("column_aliases", {})
    started = []
    match_reports = []
    
    for job_id in request.job_ids:
        job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            continue
        if job.get("status") == "completed":
            continue
        
        # Get file columns to perform fuzzy matching
        from services.storage_service import get_object_async
        file_columns = []
        try:
            first_file = job["files"][0]
            data, _ = await get_object_async(first_file["storage_path"])
            file_ext = first_file.get("extension", "").lower()
            
            if file_ext in ("xlsx", "xls"):
                import openpyxl
                if file_ext == "xls":
                    import xlrd
                    wb = xlrd.open_workbook(file_contents=data)
                    ws = wb.sheet_by_index(0)
                    if ws.nrows > 0:
                        file_columns = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]
                else:
                    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
                    ws = wb.active
                    first_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None)
                    if first_row:
                        file_columns = [str(c).strip() if c else "" for c in first_row]
                    wb.close()
            else:
                content = data.decode("utf-8", errors="replace")
                lines = content.splitlines()
                if lines and base_template.has_header:
                    delimiter = base_template.delimiter
                    if delimiter == "\\t":
                        delimiter = "\t"
                    file_columns = [c.strip() for c in lines[0].split(delimiter)]
        except Exception as e:
            logger.warning(f"[BatchIngest] Could not read columns for job {job_id}: {e}")
            # Use original template columns if we can't read the file
            file_columns = []
        
        # Perform fuzzy column matching
        matched_columns = _fuzzy_match_columns(
            file_columns, 
            base_template.column_mapping,
            column_aliases
        )
        
        # Create adjusted template with matched columns
        adjusted_template = {
            "delimiter": base_template.delimiter,
            "has_header": base_template.has_header,
            "skip_rows": base_template.skip_rows,
            "timestamp_format": base_template.timestamp_format,
            "base_date_location": base_template.base_date_location,
            "header_metadata": base_template.header_metadata,
            "secondary_sheet": base_template.secondary_sheet,
            "column_mapping": {
                "timestamp": matched_columns.get("timestamp"),
                "asset_id": base_template.column_mapping.asset_id,  # Keep original (may be static)
                "status": matched_columns.get("status"),
                "event_type": matched_columns.get("event_type"),
                "metric_columns": matched_columns.get("metric_columns", []),
            }
        }
        
        # Log the matching for debugging
        match_reports.append({
            "job_id": job_id,
            "filename": job["files"][0]["filename"] if job["files"] else "unknown",
            "file_columns": file_columns[:10],  # First 10 columns
            "matched": matched_columns,
        })
        
        # Set template and mark as processing
        await db.log_ingestion_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "parse_template": adjusted_template,
                "template_used": saved_template["name"],
                "status": "processing",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        job["parse_template"] = adjusted_template
        schedule_tracked_job(
            background_tasks,
            "production_logs_template_ingest",
            _run_ingestion,
            job_id,
            job,
            user_id=user.get("id"),
        )
        started.append(job_id)
    
    # Update template usage count
    await db.log_parse_templates.update_one(
        {"id": request.template_id},
        {"$inc": {"usage_count": len(started)}}
    )
    
    logger.info(f"[BatchIngest] Started {len(started)} jobs with template '{saved_template['name']}'")
    
    return {
        "started": len(started),
        "job_ids": started,
        "template_name": saved_template["name"],
        "match_reports": match_reports,
        "message": f"Batch ingestion started for {len(started)} job(s) using template '{saved_template['name']}'",
    }


async def preview_template_match(user: dict,
    job_id: str = Form(...),
    template_id: str = Form(...),
):
    """
    Preview how a saved template would match columns in a specific job.
    Useful for verifying the fuzzy matching before batch processing.
    """
    # Get job
    job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get template
    saved_template = await db.log_parse_templates.find_one({"id": template_id}, {"_id": 0})
    if not saved_template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    try:
        base_template = ParseTemplate(**saved_template["template"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid template: {e}")
    
    column_aliases = saved_template.get("column_aliases", {})
    
    # Get file columns
    from services.storage_service import get_object_async
    file_columns = []
    sample_rows = []
    
    try:
        first_file = job["files"][0]
        data, _ = await get_object_async(first_file["storage_path"])
        file_ext = first_file.get("extension", "").lower()
        
        if file_ext in ("xlsx", "xls"):
            import openpyxl
            if file_ext == "xls":
                import xlrd
                wb = xlrd.open_workbook(file_contents=data)
                ws = wb.sheet_by_index(0)
                if ws.nrows > 0:
                    file_columns = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]
                for r in range(1, min(ws.nrows, 6)):
                    row_data = {file_columns[c]: str(ws.cell_value(r, c)) for c in range(min(len(file_columns), ws.ncols))}
                    sample_rows.append(row_data)
            else:
                wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
                ws = wb.active
                rows_iter = ws.iter_rows(values_only=True)
                first_row = next(rows_iter, None)
                if first_row:
                    file_columns = [str(c).strip() if c else "" for c in first_row]
                for i, row in enumerate(rows_iter):
                    if i >= 5:
                        break
                    row_data = {file_columns[j]: str(row[j]) if row[j] is not None else "" for j in range(min(len(file_columns), len(row)))}
                    sample_rows.append(row_data)
                wb.close()
        else:
            content = data.decode("utf-8", errors="replace")
            lines = content.splitlines()
            delimiter = base_template.delimiter
            if delimiter == "\\t":
                delimiter = "\t"
            if lines and base_template.has_header:
                file_columns = [c.strip() for c in lines[0].split(delimiter)]
            for line in lines[1:6]:
                vals = line.split(delimiter)
                row_data = {file_columns[j]: vals[j].strip() if j < len(vals) else "" for j in range(len(file_columns))}
                sample_rows.append(row_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")
    
    # Perform fuzzy matching
    matched_columns = _fuzzy_match_columns(
        file_columns,
        base_template.column_mapping,
        column_aliases
    )
    
    # Build match details showing what was matched
    match_details = []
    template_mapping = base_template.column_mapping
    
    if template_mapping.timestamp:
        match_details.append({
            "field": "timestamp",
            "template_column": template_mapping.timestamp,
            "matched_to": matched_columns.get("timestamp"),
            "match_type": "exact" if matched_columns.get("timestamp") == template_mapping.timestamp else "fuzzy",
            "success": matched_columns.get("timestamp") in file_columns,
        })
    
    if template_mapping.asset_id:
        match_details.append({
            "field": "asset_id",
            "template_column": template_mapping.asset_id,
            "matched_to": matched_columns.get("asset_id"),
            "match_type": "exact" if matched_columns.get("asset_id") == template_mapping.asset_id else "fuzzy",
            "success": matched_columns.get("asset_id") in file_columns,
        })
    
    if template_mapping.status:
        match_details.append({
            "field": "status",
            "template_column": template_mapping.status,
            "matched_to": matched_columns.get("status"),
            "match_type": "exact" if matched_columns.get("status") == template_mapping.status else "fuzzy",
            "success": matched_columns.get("status") in file_columns,
        })
    
    for metric in template_mapping.metric_columns:
        matched_metric = next((m for m in matched_columns.get("metric_columns", []) if _normalize_column_name(m) == _normalize_column_name(metric) or m == metric), None)
        match_details.append({
            "field": "metric",
            "template_column": metric,
            "matched_to": matched_metric,
            "match_type": "exact" if matched_metric == metric else "fuzzy",
            "success": matched_metric in file_columns if matched_metric else False,
        })
    
    return {
        "template_name": saved_template["name"],
        "file_columns": file_columns,
        "matched_columns": matched_columns,
        "match_details": match_details,
        "sample_rows": sample_rows,
        "all_matched": all(d["success"] for d in match_details if d["template_column"]),
    }


async def query_entries(user: dict,
    asset_id: Optional[str] = None,
    event_type: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
):
    """Query production log entries with filters, deduplicating by timestamp+asset_id.
    When duplicate timestamps exist, prefer the entry with mooney_viscosity data."""
    match_stage = {}
    if asset_id:
        match_stage["asset_id"] = asset_id
    if event_type:
        match_stage["event_type"] = event_type
    if start or end:
        ts_filter = {}
        if start:
            ts_filter["$gte"] = start
        if end:
            ts_filter["$lte"] = end
        match_stage["timestamp"] = ts_filter

    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        # Sort so entries WITH mooney_viscosity come first (non-empty string > empty)
        {"$addFields": {
            "_has_visc": {"$cond": [
                {"$gt": [{"$ifNull": ["$mooney_viscosity", ""]}, ""]},
                1, 0
            ]}
        }},
        {"$sort": {"timestamp": -1, "_has_visc": -1}},
        # Group by timestamp+asset_id, keep the first (which has viscosity if available)
        {"$group": {
            "_id": {"timestamp": "$timestamp", "asset_id": "$asset_id"},
            "doc": {"$first": "$$ROOT"}
        }},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$project": {"_id": 0, "_has_visc": 0}},
        {"$sort": {"timestamp": -1}},
        {"$skip": skip},
        {"$limit": limit},
    ]

    entries = await db.production_logs.aggregate(pipeline).to_list(limit)

    # Count deduplicated total
    count_pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$group": {"_id": {"timestamp": "$timestamp", "asset_id": "$asset_id"}}},
        {"$count": "total"},
    ]
    count_result = await db.production_logs.aggregate(count_pipeline).to_list(1)
    total = count_result[0]["total"] if count_result else 0

    return {"entries": entries, "total": total, "limit": limit, "skip": skip}


async def get_available_dates(user: dict,
    asset_id: Optional[str] = None,
):
    """Get sorted list of unique production dates for an asset."""
    match = {}
    if asset_id:
        match["asset_id"] = asset_id
    pipeline = [
        {"$match": match} if match else {"$match": {}},
        {"$addFields": {"_date": {"$substr": ["$timestamp", 0, 10]}}},
        {"$group": {"_id": "$_date"}},
        {"$sort": {"_id": -1}},
    ]
    results = await db.production_logs.aggregate(pipeline).to_list(500)
    dates = [r["_id"] for r in results if r["_id"]]
    return {"dates": dates}



async def get_log_stats(user: dict,
):
    """Get overall production log statistics."""
    total = await db.production_logs.count_documents({})

    # Event type counts
    event_pipeline = [
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}}
    ]
    events = await db.production_logs.aggregate(event_pipeline).to_list(10)

    # Unique assets
    asset_pipeline = [
        {"$group": {"_id": "$asset_id"}},
        {"$count": "total"}
    ]
    assets = await db.production_logs.aggregate(asset_pipeline).to_list(1)

    # Jobs summary
    jobs_total = await db.log_ingestion_jobs.count_documents({})
    jobs_completed = await db.log_ingestion_jobs.count_documents({"status": "completed"})
    jobs_pending = await db.log_ingestion_jobs.count_documents({"status": {"$in": ["uploaded", "previewed", "processing"]}})
    total_files = 0
    async for j in db.log_ingestion_jobs.find({}, {"total_files": 1, "_id": 0}):
        total_files += j.get("total_files", 0)

    return {
        "total_entries": total,
        "unique_assets": assets[0]["total"] if assets else 0,
        "events": {e["_id"]: e["count"] for e in events if e["_id"]},
        "jobs_total": jobs_total,
        "jobs_completed": jobs_completed,
        "jobs_pending": jobs_pending,
        "total_files": total_files,
    }


# ======================== Aggregation Layer ========================

async def run_aggregation(user: dict,
    background_tasks: BackgroundTasks,
):
    """Build/rebuild asset_history aggregations from production_logs."""
    total = await db.production_logs.count_documents({})
    if total == 0:
        raise HTTPException(status_code=400, detail="No production logs to aggregate")

    schedule_tracked_job(
        background_tasks,
        "production_logs_aggregate",
        _run_aggregation,
        user_id=user.get("id"),
    )
    return {"message": "Aggregation started", "total_source_records": total}


async def _run_aggregation():
    """Background: aggregate production_logs into asset_history (hourly buckets)."""
    try:
        from services.production_logs_aggregation import aggregate_production_logs_to_asset_history

        await aggregate_production_logs_to_asset_history()
    except Exception as e:
        logger.error(f"[Aggregation] Failed: {e}")


async def get_asset_history(user: dict,
    asset_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 500,
):
    """Query aggregated asset history."""
    query = {}
    if asset_id:
        query["asset_id"] = asset_id
    if start or end:
        hour_filter = {}
        if start:
            hour_filter["$gte"] = start
        if end:
            hour_filter["$lte"] = end
        query["hour"] = hour_filter

    docs = await db.asset_history.find(query, {"_id": 0}).sort("hour", 1).limit(limit).to_list(limit)
    return {"history": docs, "total": len(docs)}


async def list_log_assets(user: dict,
):
    """List all unique asset_ids in production logs."""
    pipeline = [
        {"$group": {"_id": "$asset_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    results = await db.production_logs.aggregate(pipeline).to_list(1000)
    return {"assets": [{"asset_id": r["_id"], "count": r["count"]} for r in results if r["_id"]]}


async def get_timeseries(user: dict,
    asset_id: str,
    metric: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    """Get time series data for charts — from asset_history aggregation."""
    query = {"asset_id": asset_id}
    if start or end:
        hour_filter = {}
        if start:
            hour_filter["$gte"] = start
        if end:
            hour_filter["$lte"] = end
        query["hour"] = hour_filter

    docs = await db.asset_history.find(query, {"_id": 0}).sort("hour", 1).limit(2000).to_list(2000)

    # Build time series
    timestamps = []
    metrics_data = {}
    events_data = {"downtime": [], "alarm": [], "waste": [], "normal": []}

    for d in docs:
        timestamps.append(d["hour"])
        for et in ["downtime", "alarm", "waste", "normal"]:
            events_data[et].append(d.get("events", {}).get(et, 0))
        for mk, mv in d.get("metrics", {}).items():
            if metric and mk != metric:
                continue
            if mk not in metrics_data:
                metrics_data[mk] = {"avg": [], "min": [], "max": []}
            metrics_data[mk]["avg"].append(mv.get("avg"))
            metrics_data[mk]["min"].append(mv.get("min"))
            metrics_data[mk]["max"].append(mv.get("max"))

    return {
        "asset_id": asset_id,
        "timestamps": timestamps,
        "metrics": metrics_data,
        "events": events_data,
        "total_points": len(timestamps),
    }


# ======================== AI-Assisted Parsing ========================

async def ai_parse_file(user: dict,
    job_id: str = Form(...),
    file_id: Optional[str] = Form(None),
):
    """Use AI to analyze an unstructured log file and suggest column mappings."""
    vision_key = os.environ.get("OPENAI_VISION_KEY") or os.environ.get("OPENAI_API_KEY")
    if not vision_key:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY not configured")

    uid, cid = user_context(user)

    job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    target = None
    if file_id:
        target = next((f for f in job["files"] if f["file_id"] == file_id), None)
    if not target:
        target = job["files"][0]

    from services.storage_service import get_object_async
    try:
        data, _ = await get_object_async(target["storage_path"])
        file_ext = target.get("extension", "").lower()
        if file_ext in ("xlsx", "xls"):
            # Convert Excel to text for AI
            import openpyxl
            if file_ext == "xls":
                import xlrd
                wb = xlrd.open_workbook(file_contents=data)
                ws = wb.sheet_by_index(0)
                lines = []
                for r in range(min(ws.nrows, 30)):
                    lines.append(",".join(str(ws.cell_value(r, c)) for c in range(ws.ncols)))
                sample_text = "\n".join(lines)
            else:
                wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
                ws = wb.active
                lines = []
                for i, row in enumerate(ws.iter_rows(values_only=True)):
                    if i >= 30:
                        break
                    lines.append(",".join(str(c) if c is not None else "" for c in row))
                sample_text = "\n".join(lines)
                wb.close()
        else:
            content = data.decode("utf-8", errors="replace")
            lines = content.splitlines()[:30]
            sample_text = "\n".join(lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

    # Call AI to analyze the log structure
    try:
        raw = await ai_gateway_chat(
            [
                {"role": "system", "content": """You are a production log analyst. Analyze the sample data and return a JSON object with:
{
  "delimiter": "detected delimiter character (comma, semicolon, tab, pipe, or space)",
  "has_header": true/false,
  "skip_rows": number of rows to skip before data starts,
  "columns": ["list of column names"],
  "column_mapping": {
    "timestamp": "name of timestamp column or null",
    "asset_id": "name of asset/equipment ID column or null",
    "status": "name of status column or null",
    "metric_columns": ["names of numeric metric columns"]
  },
  "timestamp_format": "detected format like %Y-%m-%d %H:%M:%S or null",
  "notes": "brief description of the data structure"
}
Return ONLY valid JSON, no markdown."""},
                {"role": "user", "content": f"Analyze this production log file sample:\n\n{sample_text}"},
            ],
            user_id=uid,
            company_id=cid,
            endpoint="production_logs.ai_parse",
            model="gpt-4o",
            max_tokens=1000,
            temperature=0.1,
        )
        raw = raw.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        result = json.loads(raw)
        return {"success": True, "analysis": result, "sample_lines": len(sample_text.splitlines())}

    except json.JSONDecodeError:
        return {"success": False, "error": "AI returned invalid format", "raw": raw[:500]}
    except Exception as e:
        logger.error(f"[AI Parse] Failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")