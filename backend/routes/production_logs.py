"""
Production Log Ingestion & History Builder.

Endpoints for uploading, parsing, previewing, and ingesting production log files.
Supports CSV, TXT, LOG, ZIP formats with template-based and AI-assisted parsing.
Owner-only access.
"""
import os
import io
import csv
import json
import uuid
import zipfile
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel
from auth import get_current_user
from database import db
from services.storage_service import put_object_async

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/production-logs", tags=["Production Logs"])

ALLOWED_EXTENSIONS = {"csv", "txt", "log", "zip"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


# ======================== Models ========================

class ColumnMapping(BaseModel):
    timestamp: Optional[str] = None
    asset_id: Optional[str] = None
    status: Optional[str] = None
    event_type: Optional[str] = None
    metric_columns: List[str] = []

class ParseTemplate(BaseModel):
    delimiter: str = ","
    has_header: bool = True
    skip_rows: int = 0
    timestamp_format: Optional[str] = None
    column_mapping: ColumnMapping = ColumnMapping()

class IngestRequest(BaseModel):
    job_id: str
    confirm: bool = True


# ======================== Helpers ========================

def _owner_only(user: dict):
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")


def _get_ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _detect_delimiter(sample: str) -> str:
    """Auto-detect delimiter from first few lines."""
    for delim in [",", ";", "\t", "|"]:
        if delim in sample:
            return delim
    return ","


def _parse_timestamp(val: str, fmt: Optional[str] = None) -> Optional[str]:
    """Try to parse a timestamp string into ISO format."""
    if not val or not val.strip():
        return None
    val = val.strip()
    formats = []
    if fmt:
        formats.append(fmt)
    formats.extend([
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%m/%d/%Y %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%d",
        "%d-%m-%Y",
    ])
    for f in formats:
        try:
            dt = datetime.strptime(val, f)
            return dt.isoformat()
        except ValueError:
            continue
    # Try ISO parse as last resort
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        return dt.isoformat()
    except Exception:
        return None


def _classify_event(status: Optional[str], metrics: dict) -> str:
    """Basic event classification rules."""
    if not status:
        return "normal"
    s = str(status).lower().strip()
    if any(w in s for w in ["stop", "down", "off", "shutdown", "error", "fault", "trip"]):
        return "downtime"
    if any(w in s for w in ["waste", "reject", "scrap", "discard"]):
        return "waste"
    if any(w in s for w in ["alarm", "alert", "warning", "abnormal", "high", "low", "critical"]):
        return "alarm"
    return "normal"


def _parse_csv_content(content: str, template: ParseTemplate) -> List[dict]:
    """Parse CSV/TXT content using a template configuration."""
    lines = content.splitlines()
    if template.skip_rows > 0:
        lines = lines[template.skip_rows:]
    if not lines:
        return []

    delimiter = template.delimiter
    if delimiter == "\\t":
        delimiter = "\t"

    reader = csv.reader(lines, delimiter=delimiter)
    rows = list(reader)
    if not rows:
        return []

    headers = None
    data_start = 0
    if template.has_header:
        headers = [h.strip() for h in rows[0]]
        data_start = 1
    else:
        headers = [f"col_{i}" for i in range(len(rows[0]))]

    mapping = template.column_mapping
    records = []
    errors = []

    for row_idx, row in enumerate(rows[data_start:], start=data_start + 1):
        if not row or all(not cell.strip() for cell in row):
            continue  # Skip empty rows

        record = {"_row": row_idx}

        # Build a dict from row
        row_dict = {}
        for i, val in enumerate(row):
            if i < len(headers):
                row_dict[headers[i]] = val.strip()

        # Map timestamp
        ts_val = row_dict.get(mapping.timestamp) if mapping.timestamp else None
        if ts_val:
            parsed_ts = _parse_timestamp(ts_val, template.timestamp_format)
            record["timestamp"] = parsed_ts
            if not parsed_ts:
                record["_errors"] = record.get("_errors", []) + [f"Invalid timestamp: {ts_val}"]
        else:
            record["timestamp"] = None
            if mapping.timestamp:
                record["_errors"] = record.get("_errors", []) + ["Missing timestamp"]

        # Map asset_id
        record["asset_id"] = row_dict.get(mapping.asset_id, "").strip() if mapping.asset_id else None

        # Map status
        record["status"] = row_dict.get(mapping.status, "").strip() if mapping.status else None

        # Map event_type (auto-classify if not mapped)
        if mapping.event_type and row_dict.get(mapping.event_type):
            record["event_type"] = row_dict[mapping.event_type].strip().lower()
        else:
            record["event_type"] = _classify_event(record.get("status"), {})

        # Map metrics (all metric_columns)
        metrics = {}
        for col in mapping.metric_columns:
            val = row_dict.get(col, "").strip()
            if val:
                try:
                    metrics[col] = float(val.replace(",", "."))
                except ValueError:
                    metrics[col] = val
        record["metrics"] = metrics

        # Also classify based on metrics
        if record["event_type"] == "normal":
            record["event_type"] = _classify_event(record.get("status"), metrics)

        records.append(record)

    return records


# ======================== Endpoints ========================

@router.post("/upload")
async def upload_log_files(
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload one or more log files. Creates an ingestion job."""
    _owner_only(current_user)

    job_id = str(uuid.uuid4())
    uploaded_files = []

    for file in files:
        ext = _get_ext(file.filename or "")
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File too large: {file.filename} ({len(content)} bytes). Max: 100MB")

        # Handle ZIP files — extract and store each inner file
        if ext == "zip":
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    for name in zf.namelist():
                        inner_ext = _get_ext(name)
                        if inner_ext not in ("csv", "txt", "log"):
                            continue
                        inner_content = zf.read(name)
                        file_id = str(uuid.uuid4())
                        storage_path = f"production-logs/{job_id}/{file_id}.{inner_ext}"
                        await put_object_async(storage_path, inner_content, "text/plain")
                        uploaded_files.append({
                            "file_id": file_id,
                            "filename": name,
                            "storage_path": storage_path,
                            "size": len(inner_content),
                            "extension": inner_ext,
                        })
            except zipfile.BadZipFile:
                raise HTTPException(status_code=400, detail=f"Invalid ZIP file: {file.filename}")
        else:
            file_id = str(uuid.uuid4())
            storage_path = f"production-logs/{job_id}/{file_id}.{ext}"
            mime = "text/csv" if ext == "csv" else "text/plain"
            await put_object_async(storage_path, content, mime)
            uploaded_files.append({
                "file_id": file_id,
                "filename": file.filename,
                "storage_path": storage_path,
                "size": len(content),
                "extension": ext,
            })

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
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name", "Unknown"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.log_ingestion_jobs.insert_one(job)

    return {
        "job_id": job_id,
        "files_uploaded": len(uploaded_files),
        "files": [{"filename": f["filename"], "size": f["size"]} for f in uploaded_files],
    }


@router.post("/detect-columns")
async def detect_columns(
    job_id: str = Form(...),
    file_id: Optional[str] = Form(None),
    delimiter: str = Form(","),
    has_header: bool = Form(True),
    skip_rows: int = Form(0),
    current_user: dict = Depends(get_current_user),
):
    """Read the first file in a job and return detected columns/sample rows."""
    _owner_only(current_user)

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
        content = data.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

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
        "total_lines": len(content.splitlines()) - (skip_rows + (1 if has_header else 0)),
        "suggestions": suggestions,
        "detected_delimiter": _detect_delimiter(lines[0]) if lines else ",",
    }


@router.post("/parse-preview")
async def parse_preview(
    job_id: str = Form(...),
    template_json: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Parse files using a template and return a preview of the first 100 records."""
    _owner_only(current_user)

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


@router.post("/ingest")
async def ingest_logs(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Confirm and start async ingestion of parsed logs into production_logs collection."""
    _owner_only(current_user)

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
    background_tasks.add_task(_run_ingestion, request.job_id, job)

    return {"job_id": request.job_id, "status": "processing", "message": "Ingestion started"}


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


@router.get("/jobs")
async def list_jobs(
    current_user: dict = Depends(get_current_user),
):
    """List all ingestion jobs."""
    _owner_only(current_user)

    jobs = await db.log_ingestion_jobs.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    return {"jobs": jobs}


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get details of a specific ingestion job."""
    _owner_only(current_user)

    job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a job and its ingested data."""
    _owner_only(current_user)

    job = await db.log_ingestion_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Delete ingested records
    result = await db.production_logs.delete_many({"source.job_id": job_id})
    logger.info(f"[LogIngest] Deleted {result.deleted_count} records for job {job_id}")

    # Delete job
    await db.log_ingestion_jobs.delete_one({"id": job_id})

    return {"deleted_records": result.deleted_count, "message": "Job and data deleted"}


@router.get("/entries")
async def query_entries(
    asset_id: Optional[str] = None,
    event_type: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """Query production log entries with filters."""
    _owner_only(current_user)

    query = {}
    if asset_id:
        query["asset_id"] = asset_id
    if event_type:
        query["event_type"] = event_type
    if start or end:
        ts_filter = {}
        if start:
            ts_filter["$gte"] = start
        if end:
            ts_filter["$lte"] = end
        query["timestamp"] = ts_filter

    entries = await db.production_logs.find(
        query, {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)

    total = await db.production_logs.count_documents(query)

    return {"entries": entries, "total": total, "limit": limit, "skip": skip}


@router.get("/stats")
async def get_log_stats(
    current_user: dict = Depends(get_current_user),
):
    """Get overall production log statistics."""
    _owner_only(current_user)

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

    return {
        "total_entries": total,
        "unique_assets": assets[0]["total"] if assets else 0,
        "events": {e["_id"]: e["count"] for e in events if e["_id"]},
        "jobs_total": jobs_total,
        "jobs_completed": jobs_completed,
    }
