"""
Tenant ID schema helpers — pilot for multi-tenant readiness.

Pilot collections store optional ``tenant_id`` (company_id / organization_id from JWT).
Existing collections remain unchanged until a migration phase.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

# Collections created after the tenant pilot that should always carry tenant_id.
PILOT_COLLECTIONS = frozenset({
    "work_item_projections",
    "reliability_context_snapshots",
    "background_jobs",
    "audit_log",
})

# Wave 1 — tenant_id on reads/writes with migration-safe $or filter.
WAVE1_COLLECTIONS = frozenset({
    "equipment_nodes",
    "threats",
    "users",
    "observations",
})

# Wave 2 — work execution and maintenance program collections.
WAVE2_COLLECTIONS = frozenset({
    "task_instances",
    "scheduled_tasks",
    "central_actions",
    "maintenance_programs_v2",
    "equipment_type_strategies",
})

# Wave 3 — library, forms, investigations, graph, PM import analytics.
WAVE3_COLLECTIONS = frozenset({
    "failure_modes",
    "form_templates",
    "form_submissions",
    "investigations",
    "timeline_events",
    "failure_identifications",
    "cause_nodes",
    "action_items",
    "evidence_items",
    "reliability_edges",
    "pm_import_sessions",
})

# Wave 4 — platform telemetry, chat, templates, production logs.
WAVE4_COLLECTIONS = frozenset({
    "chat_messages",
    "user_events",
    "task_templates",
    "task_plans",
    "equipment_failure_modes",
    "disciplines",
    "production_logs",
    "log_ingestion_jobs",
})

# Wave 5 — preferences, graph impacts, granulometry, production read models.
WAVE5_COLLECTIONS = frozenset({
    "user_preferences",
    "reliability_impacts",
    "granulometry_records",
})

# Wave 6 — AI insight caches and domain event outbox (Wave 11 tenant hardening).
WAVE6_COLLECTIONS = frozenset({
    "ai_risk_insights",
    "ai_causal_analysis",
    "ai_fault_trees",
    "ai_bow_ties",
    "ai_action_optimization",
    "ai_fm_suggestion_cache",
    "domain_event_outbox",
})

# Wave 7 — AI extraction learning, scheduler telemetry (Wave 12 tenant hardening).
WAVE7_COLLECTIONS = frozenset({
    "ai_extraction_corrections",
    "maintenance_history",
    "technician_capacity",
    "custom_equipment_types",
})

# Wave 8 — equipment attachments (Wave 16 tenant hardening).
WAVE8_COLLECTIONS = frozenset({
    "equipment_files",
})

# Wave 9 — unstructured import staging (Wave 18 tenant hardening).
WAVE9_COLLECTIONS = frozenset({
    "unstructured_items",
})

# Wave 10 — Visual Management Studio collections.
WAVE10_COLLECTIONS = frozenset({
    "visual_boards",
    "visual_board_versions",
    "visual_board_tokens",
    "visual_board_screens",
})

WAVE_COLLECTIONS = (
    PILOT_COLLECTIONS
    | WAVE1_COLLECTIONS
    | WAVE2_COLLECTIONS
    | WAVE3_COLLECTIONS
    | WAVE4_COLLECTIONS
    | WAVE5_COLLECTIONS
    | WAVE6_COLLECTIONS
    | WAVE7_COLLECTIONS
    | WAVE8_COLLECTIONS
    | WAVE9_COLLECTIONS
    | WAVE10_COLLECTIONS
)

DEFAULT_TENANT_FIELD = "tenant_id"

# When true, reads use strict {tenant_id: tid} instead of migration-safe $or.
# Staging / UAT: set TENANT_STRICT_MODE=true after Wave 2 backfill (see scripts/strict_mode_cutover_check.py).
TENANT_STRICT_MODE = os.environ.get("TENANT_STRICT_MODE", "false").lower() == "true"


def tenant_id_from_user(user: Optional[dict]) -> Optional[str]:
    if not user:
        return None
    return user.get("company_id") or user.get("organization_id") or None


def with_tenant_id(doc: Dict[str, Any], user: Optional[dict]) -> Dict[str, Any]:
    """Attach tenant_id to a new document when the user carries org context."""
    tid = tenant_id_from_user(user)
    if tid:
        doc[DEFAULT_TENANT_FIELD] = tid
    return doc


def tenant_filter(user: Optional[dict]) -> Dict[str, Any]:
    """Mongo filter fragment scoping reads to the user's tenant when present."""
    tid = tenant_id_from_user(user)
    if tid:
        return {DEFAULT_TENANT_FIELD: tid}
    return {}


def tenant_read_filter(user: Optional[dict]) -> Dict[str, Any]:
    """Read filter: strict tenant match, or migration-safe $or when strict mode is off."""
    tid = tenant_id_from_user(user)
    if not tid:
        return {}
    if TENANT_STRICT_MODE:
        return {DEFAULT_TENANT_FIELD: tid}
    return {
        "$or": [
            {DEFAULT_TENANT_FIELD: tid},
            {DEFAULT_TENANT_FIELD: {"$exists": False}},
        ]
    }


def merge_tenant_filter(base_query: Dict[str, Any], user: Optional[dict]) -> Dict[str, Any]:
    """Combine an existing Mongo query with the tenant read filter."""
    tenant_part = tenant_read_filter(user)
    if not tenant_part:
        return base_query or {}
    if not base_query:
        return tenant_part
    return {"$and": [base_query, tenant_part]}


def prepend_tenant_match(pipeline: list, user: Optional[dict]) -> list:
    """Prepend a $match stage with the tenant read filter to an aggregation pipeline."""
    tenant_part = tenant_read_filter(user)
    if not tenant_part:
        return pipeline
    return [{"$match": tenant_part}, *pipeline]


def ensure_tenant_indexes(db, collections: Optional[frozenset] = None) -> int:
    """Create {tenant_id: 1} indexes on wave collections (idempotent). Returns count created."""
    created = 0
    target = collections or WAVE_COLLECTIONS
    for name in target:
        try:
            db[name].create_index(
                [(DEFAULT_TENANT_FIELD, 1)],
                name=f"{name}_tenant_id",
                background=True,
            )
            created += 1
        except Exception:
            pass
    return created


def ensure_pilot_indexes(db) -> None:
    """Create tenant-scoped indexes on pilot collections (idempotent)."""
    for name in PILOT_COLLECTIONS:
        db[name].create_index(
            [(DEFAULT_TENANT_FIELD, 1), ("user_id", 1), ("updated_at", -1)],
            name=f"{name}_tenant_user_updated",
            background=True,
        )
