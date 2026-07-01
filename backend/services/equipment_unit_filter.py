"""Optional equipment-unit scope from X-Equipment-Unit-Ids request header."""
from __future__ import annotations

from typing import List, Optional

from fastapi import Request

EQUIPMENT_UNIT_FILTER_HEADER = "X-Equipment-Unit-Ids"


def read_equipment_unit_filter_ids(request: Optional[Request]) -> List[str]:
    if request is None:
        return []
    raw = request.headers.get(EQUIPMENT_UNIT_FILTER_HEADER) or ""
    if not raw.strip():
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def apply_equipment_unit_filter_to_user(user: dict, request: Optional[Request]) -> dict:
    unit_ids = read_equipment_unit_filter_ids(request)
    if not unit_ids:
        return user
    result = dict(user)
    result["_equipment_unit_filter_ids"] = unit_ids
    return result


def equipment_unit_filter_cache_suffix(user: Optional[dict]) -> str:
    if not user:
        return ""
    raw = user.get("_equipment_unit_filter_ids") or []
    ids = sorted({str(x).strip() for x in raw if str(x).strip()})
    if not ids:
        return ""
    return ":" + ",".join(ids)
