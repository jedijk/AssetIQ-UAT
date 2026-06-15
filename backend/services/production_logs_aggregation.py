"""Production log aggregation — batched processing to avoid memory spikes."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from database import db

logger = logging.getLogger(__name__)

AGGREGATION_BATCH_SIZE = 2000
MAX_AGGREGATION_BUCKETS = 50000


def _hourly_aggregation_pipeline() -> List[dict]:
    return [
        {"$addFields": {
            "ts_parsed": {
                "$cond": {
                    "if": {"$eq": [{"$type": "$timestamp"}, "string"]},
                    "then": {"$dateFromString": {"dateString": "$timestamp", "onError": None}},
                    "else": "$timestamp",
                },
            },
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


def _bucket_to_asset_history_doc(row: dict) -> dict:
    asset_id = row["_id"]["asset_id"]
    hour = row["_id"]["hour"]

    metric_agg: Dict[str, dict] = {}
    for m in row.get("all_metrics") or []:
        if not m:
            continue
        for key, value in m.items():
            if isinstance(value, (int, float)):
                metric_agg.setdefault(key, {"values": []})["values"].append(value)

    metrics_summary = {}
    for key, data in metric_agg.items():
        vals = data["values"]
        if vals:
            metrics_summary[key] = {
                "avg": round(sum(vals) / len(vals), 2),
                "min": round(min(vals), 2),
                "max": round(max(vals), 2),
                "count": len(vals),
            }

    event_counts: Dict[str, int] = {}
    for event in row.get("events") or []:
        event_counts[event] = event_counts.get(event, 0) + 1

    return {
        "id": str(uuid.uuid4()),
        "asset_id": asset_id,
        "hour": hour,
        "records": row.get("records", 0),
        "metrics": metrics_summary,
        "events": event_counts,
        "downtime_count": event_counts.get("downtime", 0),
        "alarm_count": event_counts.get("alarm", 0),
        "waste_count": event_counts.get("waste", 0),
        "aggregated_at": datetime.now(timezone.utc).isoformat(),
    }


async def aggregate_production_logs_to_asset_history() -> Dict[str, Any]:
    """
    Stream aggregation buckets in batches and write asset_history documents.
    Replaces single to_list(100000) with bounded memory use.
    """
    cursor = db.production_logs.aggregate(
        _hourly_aggregation_pipeline(),
        allowDiskUse=True,
    )

    await db.asset_history.delete_many({})

    docs_batch: List[dict] = []
    buckets_processed = 0
    docs_written = 0

    async for row in cursor:
        buckets_processed += 1
        if buckets_processed > MAX_AGGREGATION_BUCKETS:
            logger.warning(
                "Aggregation stopped at %s buckets (MAX_AGGREGATION_BUCKETS)",
                MAX_AGGREGATION_BUCKETS,
            )
            break
        docs_batch.append(_bucket_to_asset_history_doc(row))
        if len(docs_batch) >= AGGREGATION_BATCH_SIZE:
            await db.asset_history.insert_many(docs_batch)
            docs_written += len(docs_batch)
            docs_batch.clear()

    if docs_batch:
        await db.asset_history.insert_many(docs_batch)
        docs_written += len(docs_batch)

    if docs_written == 0:
        logger.info("[Aggregation] No valid records to aggregate")
    else:
        logger.info("[Aggregation] Created %s hourly buckets", docs_written)

    return {"buckets_processed": buckets_processed, "docs_written": docs_written}
