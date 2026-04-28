"""
Audit log routes.

Stores high-level change/transaction events for the application, separate from
security audit events (login attempts, lockouts, etc).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime
from typing import Optional, List, Dict, Any
import re

from auth import get_current_user
from database import db

router = APIRouter(tags=["Audit Log"])


def _require_owner_or_admin(user: dict):
    role = (user or {}).get("role")
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


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

    Owner/Admin only.
    """
    _require_owner_or_admin(current_user)

    q: Dict[str, Any] = {}

    # Time filters
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
        # Simple substring match on path
        q["http.path"] = {"$regex": re.escape(path), "$options": "i"}

    if status_min is not None or status_max is not None:
        q["http.status"] = {}
        if status_min is not None:
            q["http.status"]["$gte"] = int(status_min)
        if status_max is not None:
            q["http.status"]["$lte"] = int(status_max)

    total = await db.audit_log.count_documents(q)
    items: List[dict] = await db.audit_log.find(q, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit).to_list(limit)

    return {"total": total, "items": items, "limit": limit, "skip": skip}

