"""
Audit log routes.

Stores high-level change/transaction events for the application, separate from
security audit events (login attempts, lockouts, etc).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from datetime import datetime
from typing import Optional, List, Dict, Any
import csv
import io
import json
import re

from auth import get_current_user, require_permission
from database import db

router = APIRouter(tags=["Audit Log"])

_settings_read = require_permission("settings:read")


def _require_owner(user: dict):
    role = (user or {}).get("role")
    if role != "owner":
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _build_audit_query(
    *,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    actor_id: Optional[str] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
    status_min: Optional[int] = None,
    status_max: Optional[int] = None,
) -> Dict[str, Any]:
    q: Dict[str, Any] = {}

    def _parse_iso(s: str) -> Optional[datetime]:
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    from_dt = _parse_iso(from_ts)
    to_dt = _parse_iso(to_ts)
    if from_dt or to_dt:
        q["ts"] = {}
        if from_dt:
            q["ts"]["$gte"] = from_dt
        if to_dt:
            q["ts"]["$lte"] = to_dt
        if not q["ts"]:
            q.pop("ts", None)

    if actor_id:
        q["actor.id"] = actor_id
    if method:
        q["http.method"] = method.upper()
    if path:
        q["http.path"] = {"$regex": re.escape(path), "$options": "i"}

    if status_min is not None or status_max is not None:
        q["http.status"] = {}
        if status_min is not None:
            q["http.status"]["$gte"] = int(status_min)
        if status_max is not None:
            q["http.status"]["$lte"] = int(status_max)

    return q


@router.get("/audit-log")
async def list_audit_log(
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    actor_id: Optional[str] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
    status_min: Optional[int] = None,
    status_max: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    List application audit log events.

    Owner only.
    """
    _require_owner(current_user)

    q = _build_audit_query(
        from_ts=from_ts,
        to_ts=to_ts,
        actor_id=actor_id,
        method=method,
        path=path,
        status_min=status_min,
        status_max=status_max,
    )

    total = await db.audit_log.count_documents(q)
    items: List[dict] = await db.audit_log.find(q, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit).to_list(limit)

    return {"total": total, "items": items, "limit": limit, "skip": skip}


@router.get("/audit-log/export")
async def export_audit_log(
    format: str = Query("json", pattern="^(json|csv)$"),
    limit: int = Query(5000, ge=1, le=20000),
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    actor_id: Optional[str] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
    current_user: dict = Depends(_settings_read),
):
    """Export application audit log as JSON or CSV (owner or settings:read)."""
    _require_owner(current_user)

    q = _build_audit_query(
        from_ts=from_ts,
        to_ts=to_ts,
        actor_id=actor_id,
        method=method,
        path=path,
    )
    items: List[dict] = await db.audit_log.find(q, {"_id": 0}).sort("ts", -1).limit(limit).to_list(limit)

    if format == "json":
        payload = json.dumps({"total": len(items), "items": items}, default=str, indent=2)
        return StreamingResponse(
            io.BytesIO(payload.encode("utf-8")),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="audit-log-export.json"'},
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ts", "method", "path", "status", "actor_id", "actor_email", "duration_ms"])
    for row in items:
        http = row.get("http") or {}
        actor = row.get("actor") or {}
        writer.writerow([
            row.get("ts"),
            http.get("method"),
            http.get("path"),
            http.get("status"),
            actor.get("id"),
            actor.get("email"),
            row.get("duration_ms"),
        ])
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit-log-export.csv"'},
    )

