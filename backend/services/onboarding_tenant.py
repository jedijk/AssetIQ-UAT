"""Tenant-scoped Mongo queries for onboarding validation."""
from __future__ import annotations

from typing import Any, Dict, List

from iso14224_models import ISOLevel
from services.tenant_schema import TENANT_STRICT_MODE, merge_tenant_filter

OPERATIONAL_LEVELS = (
    ISOLevel.PLANT_UNIT.value,
    ISOLevel.SECTION_SYSTEM.value,
    ISOLevel.EQUIPMENT_UNIT.value,
    ISOLevel.SUBUNIT.value,
    ISOLevel.MAINTAINABLE_ITEM.value,
)


def _tenant_user(tenant_id: str) -> dict:
    return {"company_id": tenant_id, "tenant_id": tenant_id}


def _tenant_query(tenant_id: str, query: Dict[str, Any]) -> Dict[str, Any]:
    return merge_tenant_filter(query, _tenant_user(tenant_id))


def _tenant_membership_filter(tenant_id: str) -> Dict[str, Any]:
    """Match tenant-owned records via tenant_id or legacy company_id."""
    clauses: List[Dict[str, Any]] = [
        {"tenant_id": tenant_id},
        {"company_id": tenant_id},
    ]
    if not TENANT_STRICT_MODE:
        clauses.append({"tenant_id": {"$exists": False}})
    return {"$or": clauses}


def _scope_pipeline(tenant_id: str, pipeline: List[dict]) -> List[dict]:
    if pipeline and "$match" in pipeline[0]:
        merged = dict(pipeline[0])
        merged["$match"] = _tenant_query(tenant_id, merged["$match"])
        return [merged, *pipeline[1:]]
    return [{"$match": _tenant_query(tenant_id, {})}, *pipeline]
