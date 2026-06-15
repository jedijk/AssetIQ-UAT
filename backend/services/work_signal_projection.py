"""
Unified read projection for observations (threats collection) and legacy threat records.

Normalizes both shapes into one list/detail view model for workspace, KPI, and dashboard code.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional


OPEN_STATUSES = frozenset({"open", "in progress", "in_progress", "active"})
CLOSED_STATUSES = frozenset({"closed", "mitigated", "completed", "done"})


def _parse_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
    return None


def normalize_work_signal(doc: dict, *, source: str = "observation") -> Dict[str, Any]:
    """Map a threat/observation document to a unified work-signal projection."""
    if not doc:
        return {}

    status_raw = (doc.get("status") or "open").strip()
    status_key = status_raw.lower().replace("-", "_")
    equipment_id = doc.get("linked_equipment_id") or doc.get("equipment_id")
    title = doc.get("title") or doc.get("asset") or doc.get("failure_mode") or "Untitled"
    created_at = doc.get("created_at") or doc.get("observed_at")

    return {
        "id": doc.get("id"),
        "signal_type": source,
        "title": title,
        "status": status_raw,
        "status_bucket": (
            "closed" if status_key in CLOSED_STATUSES
            else "open" if status_key in OPEN_STATUSES
            else "other"
        ),
        "equipment_id": equipment_id,
        "equipment_name": doc.get("asset") or doc.get("equipment_name"),
        "equipment_tag": doc.get("equipment_tag"),
        "failure_mode": doc.get("failure_mode"),
        "risk_score": doc.get("risk_score"),
        "risk_level": doc.get("risk_level") or doc.get("severity"),
        "priority": doc.get("priority") or doc.get("risk_level"),
        "created_at": created_at,
        "created_at_dt": _parse_dt(created_at),
        "threat_number": doc.get("threat_number") or doc.get("observation_number"),
        "source_collection": "threats" if source == "observation" else source,
        "linked_investigation_id": doc.get("investigation_id"),
        "tenant_id": doc.get("tenant_id"),
    }


def normalize_work_signals(docs: List[dict], *, source: str = "observation") -> List[Dict[str, Any]]:
    return [normalize_work_signal(doc, source=source) for doc in docs if doc]


def project_list_item(doc: dict) -> Dict[str, Any]:
    """Compact list-row projection for KPI tables and supervisor dashboards."""
    base = normalize_work_signal(doc)
    return {
        "id": base.get("id"),
        "title": base.get("title"),
        "status": base.get("status"),
        "status_bucket": base.get("status_bucket"),
        "equipment_id": base.get("equipment_id"),
        "equipment_name": base.get("equipment_name"),
        "risk_score": base.get("risk_score"),
        "risk_level": base.get("risk_level"),
        "created_at": base.get("created_at"),
        "threat_number": base.get("threat_number"),
    }


def project_detail(doc: dict) -> Dict[str, Any]:
    """Detail view projection retaining fields needed by workspace/KPI consumers."""
    base = normalize_work_signal(doc)
    return {
        **base,
        "description": doc.get("description"),
        "installation_name": doc.get("installation_name"),
        "created_by": doc.get("created_by"),
        "failure_mode_id": doc.get("failure_mode_id"),
        "fmea_rpn": doc.get("fmea_rpn"),
        "rank": doc.get("rank"),
        "attachments_count": len(doc.get("attachments") or []),
    }
