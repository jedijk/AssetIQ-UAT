"""Production log upload, preview, and ingestion job lifecycle."""
import asyncio
import csv
import io
import json
import logging
import uuid
import zipfile
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from database import db
from services.background_jobs import schedule_tracked_job
from services.production_logs_parsing import (
    ParseTemplate,
    _detect_delimiter,
    _get_ext,
    _parse_csv_content,
    _parse_excel_content,
)
from services.storage_service import put_object_async
from services.tenant_scope import scoped

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"csv", "txt", "log", "zip", "xlsx", "xls"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


class IngestRequest(BaseModel):
    job_id: str
    confirm: bool = True


class BatchIngestRequest(BaseModel):
    job_ids: List[str]
    template: dict


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
    job = await db.log_ingestion_jobs.find_one(scoped(user, {"id": job_id}), {"_id": 0})
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
    job = await db.log_ingestion_jobs.find_one(scoped(user, {"id": job_id}), {"_id": 0})
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
    job = await db.log_ingestion_jobs.find_one(scoped(user, {"id": request.job_id}), {"_id": 0})
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
        job = await db.log_ingestion_jobs.find_one(scoped(user, {"id": job_id}), {"_id": 0})
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
        scoped(user, {"status": "uploaded"}), {"_id": 1, "id": 1, "files": 1}
    ).to_list(200)

    if uploaded_jobs:
        # Get all ingested filenames in one query
        ingested_filenames = set(await db.production_logs.distinct("source.filename", scoped(user, {})))

        for job in uploaded_jobs:
            fnames = [f.get("filename", "") for f in job.get("files", [])]
            matched = sum(1 for f in fnames if f in ingested_filenames)
            if matched > 0:
                # Count actual ingested records for this job's files
                count = await db.production_logs.count_documents(
                    scoped(user, {"source.filename": {"$in": fnames}})
                )
                if count > 0:
                    await db.log_ingestion_jobs.update_one(
                        {"_id": job["_id"]},
                        {"$set": {"status": "completed", "records_ingested": count}},
                    )

    jobs = await db.log_ingestion_jobs.find(
        scoped(user, {}), {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    return {"jobs": jobs}


async def get_job(user: dict,
    job_id: str,
):
    """Get details of a specific ingestion job."""
    job = await db.log_ingestion_jobs.find_one(scoped(user, {"id": job_id}), {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


async def delete_job(user: dict,
    job_id: str,
):
    """Delete a job and its ingested data."""
    job = await db.log_ingestion_jobs.find_one(scoped(user, {"id": job_id}), {"_id": 0})
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


