"""Score manual Success Readiness KPIs from register entries."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def _meta(entry: Dict[str, Any]) -> Dict[str, Any]:
    return entry.get("metadata") or {}


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def derive_register_completion_pct(register_type: str, payload: Dict[str, Any]) -> int:
    """Auto-set completion_pct when structured metadata is supplied."""
    metadata = payload.get("metadata") or {}
    status = (payload.get("status") or metadata.get("status") or "").lower()

    if register_type == "training":
        if status in ("completed", "complete"):
            expires = _parse_iso(metadata.get("expires_at") or metadata.get("expiry_date"))
            if expires and expires < datetime.now(timezone.utc):
                return 0
            return 100
        if status in ("expired",):
            return 0
        if status in ("in_progress", "partial"):
            return min(100, max(0, int(metadata.get("completion_pct") or payload.get("completion_pct") or 50)))
        return min(100, max(0, int(payload.get("completion_pct") or 0)))

    if register_type == "champion":
        champion = (metadata.get("champion") or metadata.get("champion_name") or "").strip()
        backup = (metadata.get("backup_champion") or metadata.get("backup") or "").strip()
        if champion and backup:
            return 100
        if champion:
            return 70
        return 0

    if register_type == "procedure":
        if metadata.get("updated_for_assetiq") is True:
            return 100
        if metadata.get("updated_for_assetiq") is False:
            return 0
        return min(100, max(0, int(payload.get("completion_pct") or 0)))

    if register_type == "governance":
        if status in ("completed", "complete", "done"):
            return 100
        if status in ("partial", "in_progress"):
            return min(100, max(0, int(metadata.get("completion_pct") or payload.get("completion_pct") or 50)))
        return min(100, max(0, int(payload.get("completion_pct") or 0)))

    return min(100, max(0, int(payload.get("completion_pct") or 0)))


def score_training_registers(entries: List[Dict[str, Any]]) -> Tuple[Optional[int], Dict[str, Any]]:
    if not entries:
        return None, {"total": 0, "completed": 0, "expired": 0}
    now = datetime.now(timezone.utc)
    completed = 0
    expired = 0
    for entry in entries:
        meta = _meta(entry)
        status = (entry.get("status") or meta.get("status") or "").lower()
        expires = _parse_iso(meta.get("expires_at") or meta.get("expiry_date"))
        if status in ("expired",) or (expires and expires < now and status != "completed"):
            expired += 1
        elif entry.get("completion_pct", 0) >= 100 or status in ("completed", "complete"):
            if expires and expires < now:
                expired += 1
            else:
                completed += 1
    total = len(entries)
    score = round((completed / total) * 100) if total else None
    return score, {
        "total": total,
        "completed": completed,
        "expired": expired,
        "outstanding": max(0, total - completed - expired),
    }


def score_champion_registers(entries: List[Dict[str, Any]]) -> Tuple[Optional[int], Dict[str, Any]]:
    if not entries:
        return None, {"departments": 0, "with_champion": 0}
    departments: set = set()
    with_champion: set = set()
    for entry in entries:
        meta = _meta(entry)
        dept = (meta.get("department") or entry.get("title") or "").strip()
        if not dept:
            continue
        departments.add(dept)
        champion = (meta.get("champion") or meta.get("champion_name") or "").strip()
        if champion or entry.get("completion_pct", 0) >= 70:
            with_champion.add(dept)
    if not departments:
        return None, {"departments": 0, "with_champion": 0}
    score = round((len(with_champion) / len(departments)) * 100)
    return score, {
        "departments": len(departments),
        "with_champion": len(with_champion),
        "missing": sorted(departments - with_champion),
    }


def score_procedure_registers(entries: List[Dict[str, Any]]) -> Tuple[Optional[int], Dict[str, Any]]:
    if not entries:
        return None, {"total": 0, "updated_for_assetiq": 0}
    updated = sum(1 for e in entries if _meta(e).get("updated_for_assetiq") is True or e.get("completion_pct") == 100)
    total = len(entries)
    return round((updated / total) * 100), {
        "total": total,
        "updated_for_assetiq": updated,
        "outstanding": total - updated,
    }


def score_governance_registers(entries: List[Dict[str, Any]]) -> Tuple[Optional[int], Dict[str, Any]]:
    if not entries:
        return None, {"total": 0, "completed": 0}
    completed = sum(
        1
        for e in entries
        if (e.get("status") or _meta(e).get("status") or "").lower() in ("completed", "complete", "done")
        or e.get("completion_pct", 0) >= 100
    )
    total = len(entries)
    return round((completed / total) * 100), {
        "total": total,
        "completed": completed,
        "outstanding": total - completed,
    }


def score_register_kpi(register_type: str, entries: List[Dict[str, Any]]) -> Tuple[Optional[int], Dict[str, Any]]:
    if register_type == "training":
        return score_training_registers(entries)
    if register_type == "champion":
        return score_champion_registers(entries)
    if register_type == "procedure":
        return score_procedure_registers(entries)
    if register_type == "governance":
        return score_governance_registers(entries)
    if not entries:
        return None, {}
    avg = sum(int(e.get("completion_pct") or 0) for e in entries) / len(entries)
    return min(100, round(avg)), {"entry_count": len(entries)}
