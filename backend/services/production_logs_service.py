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
from services.tenant_scope import scoped
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

# Re-export parsing models for route imports
__all__ = ["ColumnMapping", "ParseTemplate"]

# ======================== Models ========================


from services.production_logs_ingest import (
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
    BatchIngestRequest,
    IngestRequest,
    _run_ingestion,
    batch_ingest_logs,
    delete_job,
    detect_columns,
    get_job,
    ingest_logs,
    list_jobs,
    parse_preview,
    upload_log_files,
)
from services.production_logs_templates import (
    BatchIngestWithTemplateRequest,
    SaveTemplateRequest,
    SavedTemplate,
    batch_ingest_with_saved_template,
    delete_template,
    get_template,
    list_templates,
    preview_template_match,
    save_template,
    update_template,
)

# ======================== Endpoints ========================

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

    scoped_match = scoped(user, match_stage)
    pipeline = [
        {"$match": scoped_match},
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
        {"$match": scoped_match},
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
        {"$match": scoped(user, match)},
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
    total = await db.production_logs.count_documents(scoped(user, {}))

    # Event type counts
    event_pipeline = [
        {"$match": scoped(user, {})},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}}
    ]
    events = await db.production_logs.aggregate(event_pipeline).to_list(10)

    # Unique assets
    asset_pipeline = [
        {"$match": scoped(user, {})},
        {"$group": {"_id": "$asset_id"}},
        {"$count": "total"}
    ]
    assets = await db.production_logs.aggregate(asset_pipeline).to_list(1)

    # Jobs summary
    jobs_total = await db.log_ingestion_jobs.count_documents(scoped(user, {}))
    jobs_completed = await db.log_ingestion_jobs.count_documents(scoped(user, {"status": "completed"}))
    jobs_pending = await db.log_ingestion_jobs.count_documents(scoped(user, {"status": {"$in": ["uploaded", "previewed", "processing"]}}))
    total_files = 0
    async for j in db.log_ingestion_jobs.find(scoped(user, {}), {"total_files": 1, "_id": 0}):
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
    total = await db.production_logs.count_documents(scoped(user, {}))
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

    docs = await db.asset_history.find(scoped(user, query), {"_id": 0}).sort("hour", 1).limit(limit).to_list(limit)
    return {"history": docs, "total": len(docs)}


async def list_log_assets(user: dict,
):
    """List all unique asset_ids in production logs."""
    pipeline = [
        {"$match": scoped(user, {})},
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

    docs = await db.asset_history.find(scoped(user, query), {"_id": 0}).sort("hour", 1).limit(2000).to_list(2000)

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

    job = await db.log_ingestion_jobs.find_one(scoped(user, {"id": job_id}), {"_id": 0})
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
        from services.ai_platform import execute_json_prompt

        result = await execute_json_prompt(
            "production.log_parse",
            user={"id": uid, "company_id": cid},
            user_message=f"Analyze this production log file sample:\n\n{sample_text}",
            endpoint="production_logs.ai_parse",
            model="gpt-4o",
            max_tokens=1000,
            temperature=0.1,
        )
        analysis = result["parsed"]
        if not analysis:
            return {"success": False, "error": "AI returned invalid format", "raw": raw[:500]}
        return {"success": True, "analysis": analysis, "sample_lines": len(sample_text.splitlines())}
    except Exception as e:
        logger.error(f"[AI Parse] Failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")