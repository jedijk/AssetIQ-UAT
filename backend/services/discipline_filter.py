"""Optional discipline scope from X-Discipline-Ids request header."""
from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import Request

from models.disciplines import normalize_discipline

DISCIPLINE_FILTER_HEADER = "X-Discipline-Ids"


def read_discipline_filter_ids(request: Optional[Request]) -> List[str]:
    if request is None:
        return []
    raw = request.headers.get(DISCIPLINE_FILTER_HEADER) or ""
    if not raw.strip():
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def apply_discipline_filter_to_user(user: dict, request: Optional[Request]) -> dict:
    discipline_ids = read_discipline_filter_ids(request)
    if not discipline_ids:
        return user
    result = dict(user)
    result["_discipline_filter_ids"] = discipline_ids
    return result


def discipline_filter_cache_suffix(user: Optional[dict]) -> str:
    if not user:
        return ""
    values = discipline_filter_values(user)
    if not values:
        return ""
    return ":disc:" + ",".join(values)


def discipline_filter_values(user: Optional[dict]) -> List[str]:
    if not user:
        return []
    raw = user.get("_discipline_filter_ids") or []
    out: List[str] = []
    seen = set()
    for item in raw:
        normalized = normalize_discipline(str(item))
        if normalized and normalized not in seen:
            seen.add(normalized)
            out.append(normalized)
    return out


def apply_discipline_filter_to_query(query: dict, user: Optional[dict]) -> dict:
    """AND a discipline $in clause onto an existing Mongo filter when header filter is set."""
    values = discipline_filter_values(user)
    if not values or query.get("_impossible"):
        return query
    merged = dict(query)
    merged["discipline"] = {"$in": values}
    return merged
