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
from openai import OpenAI
from services.storage_service import put_object_async

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/production-logs", tags=["Production Logs"])

ALLOWED_EXTENSIONS = {"csv", "txt", "log", "zip", "xlsx", "xls"}
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

class BatchIngestRequest(BaseModel):
    job_ids: List[str]
    template: dict


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


def _parse_excel_content(file_bytes: bytes, ext: str, template: ParseTemplate) -> List[dict]:
    """Parse XLSX/XLS content using openpyxl or xlrd."""
    import openpyxl

    if ext == "xls":
        import xlrd
        wb = xlrd.open_workbook(file_contents=file_bytes)
        ws = wb.sheet_by_index(0)
        rows = []
        for r in range(ws.nrows):
            rows.append([str(ws.cell_value(r, c)) for c in range(ws.ncols)])
    else:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        ws = wb.active
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append([str(c) if c is not None else "" for c in row])
        wb.close()

    if not rows:
        return []

    # Skip rows
    if template.skip_rows > 0:
        rows = rows[template.skip_rows:]
    if not rows:
        return []

    mapping = template.column_mapping
    headers = None
    data_start = 0
    if template.has_header:
        headers = [h.strip() for h in rows[0]]
        data_start = 1
    else:
        headers = [f"col_{i}" for i in range(len(rows[0]))]

    records = []
    for row_idx, row in enumerate(rows[data_start:], start=data_start + 1):
        if all(not cell.strip() for cell in row):
            continue

        row_dict = {}
        for i, val in enumerate(row):
            if i < len(headers):
                row_dict[headers[i]] = val.strip()

        record = {"_row": row_idx}

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

        record["asset_id"] = row_dict.get(mapping.asset_id, "").strip() if mapping.asset_id else None
        record["status"] = row_dict.get(mapping.status, "").strip() if mapping.status else None

        if mapping.event_type and row_dict.get(mapping.event_type):
            record["event_type"] = row_dict[mapping.event_type].strip().lower()
        else:
            record["event_type"] = _classify_event(record.get("status"), {})

        metrics = {}
        for col in mapping.metric_columns:
            val = row_dict.get(col, "").strip()
            if val:
                try:
                    metrics[col] = float(val.replace(",", "."))
                except ValueError:
                    metrics[col] = val
        record["metrics"] = metrics

        if record["event_type"] == "normal":
            record["event_type"] = _classify_event(record.get("status"), metrics)

        records.append(record)

    return records


# ======================== Endpoints ========================

@router.post("/upload")
async def upload_log_files(
    files: List[UploadFile] = File(...),
    job_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Upload one or more log files. Creates or appends to an ingestion job."""
    _owner_only(current_user)

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
            "created_by": current_user.get("id"),
            "created_by_name": current_user.get("name", "Unknown"),
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


@router.post("/batch-ingest")
async def batch_ingest_logs(
    request: BatchIngestRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Parse and ingest multiple jobs at once using the same template."""
    _owner_only(current_user)

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
        background_tasks.add_task(_run_ingestion, job_id, job)
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


# ======================== Aggregation Layer ========================

@router.post("/aggregate")
async def run_aggregation(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Build/rebuild asset_history aggregations from production_logs."""
    _owner_only(current_user)

    total = await db.production_logs.count_documents({})
    if total == 0:
        raise HTTPException(status_code=400, detail="No production logs to aggregate")

    background_tasks.add_task(_run_aggregation)
    return {"message": "Aggregation started", "total_source_records": total}


async def _run_aggregation():
    """Background: aggregate production_logs into asset_history (hourly buckets)."""
    try:
        pipeline = [
            {"$addFields": {
                "ts_parsed": {
                    "$cond": {
                        "if": {"$eq": [{"$type": "$timestamp"}, "string"]},
                        "then": {"$dateFromString": {"dateString": "$timestamp", "onError": None}},
                        "else": "$timestamp"
                    }
                }
            }},
            {"$match": {"ts_parsed": {"$ne": None}}},
            {"$group": {
                "_id": {
                    "asset_id": "$asset_id",
                    "hour": {"$dateToString": {"format": "%Y-%m-%dT%H:00:00", "date": "$ts_parsed"}},
                },
                "records": {"$sum": 1},
                "events": {"$push": "$event_type"},
                "statuses": {"$push": "$status"},
                "all_metrics": {"$push": "$metrics"},
            }},
            {"$sort": {"_id.hour": 1}},
        ]

        results = await db.production_logs.aggregate(pipeline).to_list(100000)

        if not results:
            logger.info("[Aggregation] No valid records to aggregate")
            return

        # Clear old aggregations
        await db.asset_history.delete_many({})

        docs = []
        for r in results:
            asset_id = r["_id"]["asset_id"]
            hour = r["_id"]["hour"]

            # Aggregate metrics
            metric_agg = {}
            for m in r["all_metrics"]:
                if not m:
                    continue
                for k, v in m.items():
                    if isinstance(v, (int, float)):
                        if k not in metric_agg:
                            metric_agg[k] = {"values": []}
                        metric_agg[k]["values"].append(v)

            metrics_summary = {}
            for k, data in metric_agg.items():
                vals = data["values"]
                if vals:
                    metrics_summary[k] = {
                        "avg": round(sum(vals) / len(vals), 2),
                        "min": round(min(vals), 2),
                        "max": round(max(vals), 2),
                        "count": len(vals),
                    }

            # Count events
            event_counts = {}
            for e in r["events"]:
                event_counts[e] = event_counts.get(e, 0) + 1

            docs.append({
                "id": str(uuid.uuid4()),
                "asset_id": asset_id,
                "hour": hour,
                "records": r["records"],
                "metrics": metrics_summary,
                "events": event_counts,
                "downtime_count": event_counts.get("downtime", 0),
                "alarm_count": event_counts.get("alarm", 0),
                "waste_count": event_counts.get("waste", 0),
                "aggregated_at": datetime.now(timezone.utc).isoformat(),
            })

        if docs:
            await db.asset_history.insert_many(docs)
            logger.info(f"[Aggregation] Created {len(docs)} hourly buckets")

    except Exception as e:
        logger.error(f"[Aggregation] Failed: {e}")


@router.get("/history")
async def get_asset_history(
    asset_id: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 500,
    current_user: dict = Depends(get_current_user),
):
    """Query aggregated asset history."""
    _owner_only(current_user)

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


@router.get("/assets")
async def list_log_assets(
    current_user: dict = Depends(get_current_user),
):
    """List all unique asset_ids in production logs."""
    _owner_only(current_user)

    pipeline = [
        {"$group": {"_id": "$asset_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    results = await db.production_logs.aggregate(pipeline).to_list(1000)
    return {"assets": [{"asset_id": r["_id"], "count": r["count"]} for r in results if r["_id"]]}


@router.get("/timeseries")
async def get_timeseries(
    asset_id: str,
    metric: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get time series data for charts — from asset_history aggregation."""
    _owner_only(current_user)

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

@router.post("/ai-parse")
async def ai_parse_file(
    job_id: str = Form(...),
    file_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Use AI to analyze an unstructured log file and suggest column mappings."""
    _owner_only(current_user)

    vision_key = os.environ.get("OPENAI_VISION_KEY") or os.environ.get("OPENAI_API_KEY")
    if not vision_key:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY not configured")

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

    # Call OpenAI to analyze the log structure
    try:
        client = OpenAI(api_key=vision_key)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
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
                {"role": "user", "content": f"Analyze this production log file sample:\n\n{sample_text}"}
            ],
            max_completion_tokens=1000,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()
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
