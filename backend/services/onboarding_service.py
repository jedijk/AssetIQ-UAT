"""Self-service client onboarding workspace — state, progress, and validation."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database import db
from iso14224_models import ISOLevel
from services.onboarding_constants import (
    ENTRY_PATHS,
    PHASE_EFFORT_MINUTES,
    PHASE_LABELS,
    PHASE_ORDER,
    PHASE_WEIGHTS,
    UNWEIGHTED_PHASES,
    VALID_ENTRY_PATHS,
    VALID_PHASES,
)
from services.tenant_management_service import _resolve_tenant_doc, _tenant_counts, register_legacy_tenant
from services.executive_dashboard_exposure import ASSESSMENT_COVERAGE_LEVELS
from services.production_exposure import production_impact_from_criticality
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)

COLLECTION = "onboarding_state"
MAX_COMPANY_LOGO_BYTES = 5 * 1024 * 1024
ALLOWED_LOGO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _status_from_score(score: float) -> str:
    if score >= 100:
        return "passed"
    if score >= 60:
        return "warning"
    return "action_required"


def _check(status: str, message: str, *, code: str, detail: Optional[dict] = None) -> dict:
    return {
        "code": code,
        "status": status,
        "message": message,
        "detail": detail or {},
    }


def _check_tally(checks: List[dict]) -> dict:
    return {
        "passed": sum(1 for c in checks if c.get("status") == "passed"),
        "warning": sum(1 for c in checks if c.get("status") == "warning"),
        "action_required": sum(1 for c in checks if c.get("status") == "action_required"),
        "total": len(checks),
    }


def _detail_from_checks(checks: List[dict], code: str, key: str, default: Any = 0) -> Any:
    for check in checks:
        if check.get("code") == code:
            return check.get("detail", {}).get(key, default)
    return default


def _phase_score_explanation(result: dict) -> str:
    phase = result.get("phase", "")
    score = result.get("score", 0)
    checks = result.get("checks") or []
    tally = _check_tally(checks)

    if phase == "equipment":
        dupes = _detail_from_checks(checks, "duplicate_tags", "duplicates", [])
        depth = _detail_from_checks(checks, "hierarchy_depth", "levels", [])
        parts = ["Hierarchy health starts at 100%"]
        if _detail_from_checks(checks, "equipment_count", "equipment_count", 0) == 0:
            parts.append("no equipment → 0%")
        else:
            if dupes:
                parts.append(f"{len(dupes)} duplicate tag(s) reduce score")
            if len(depth) < 2:
                parts.append("shallow hierarchy (−15%)")
        parts.append(f"→ {score}%")
        return "; ".join(parts)

    if phase == "users":
        user_count = _detail_from_checks(checks, "user_count", "user_count", 0)
        base = "100% with 2+ users" if user_count >= 2 else ("60% with 1 user" if user_count == 1 else "0% with no users")
        assigned = any(c.get("code") == "installation_assignments" and c.get("status") == "passed" for c in checks)
        bonus = "; +20% for installation assignments" if assigned and score < 100 else ""
        return f"{base}{bonus} → {score}%"

    if phase == "failure_modes":
        coverage = _detail_from_checks(checks, "coverage_score", "coverage_percent", 0)
        customer = _detail_from_checks(checks, "customer_failure_modes", "count", 0)
        if customer > 0:
            return f"50% base + half of FM coverage ({coverage}%) → {score}%"
        return f"No customer failure modes yet → {score}%"

    if phase == "maintenance_strategy":
        coverage = result.get("coverage_percent", _detail_from_checks(checks, "coverage_percent", "coverage_percent", 0))
        needs_apply = _detail_from_checks(checks, "strategy_needs_apply", "count", 0)
        parts = []
        if coverage or any(c.get("code") == "maintenance_programs" and c.get("status") == "passed" for c in checks):
            parts.append(f"40% base + half of program coverage ({coverage}%)")
        if needs_apply == 0 and any(c.get("code") == "active_strategies" and c.get("status") == "passed" for c in checks):
            parts.append("+20% when strategies applied")
        return ("; ".join(parts) if parts else "No maintenance programs yet") + f" → {score}%"

    if phase == "criticality":
        return f"Risk settings (40%) + criticality definitions (30%) + subunit/maintainable assessment coverage (30%) → {score}%"

    if phase == "spare_parts":
        return f"60% when spares exist; +40% when linked to equipment → {score}%"

    if phase == "go_live":
        blocking = [c.get("message") for c in checks if c.get("status") == "action_required"]
        if blocking:
            return f"Blocked by {len(blocking)} mandatory phase(s) → {score}%"
        return f"Average of weighted mandatory phases → {score}%"

    if tally["total"]:
        return (
            f"{tally['passed']}/{tally['total']} checks passed"
            f" · {tally['warning']} warning(s)"
            f" · {tally['action_required']} action required → {score}%"
        )
    return f"Score: {score}%"


def _enrich_validation(result: dict) -> dict:
    checks = result.get("checks") or []
    enriched = dict(result)
    enriched["check_tally"] = _check_tally(checks)
    enriched["score_explanation"] = _phase_score_explanation(enriched)
    return enriched


def _readiness_breakdown(phase_results: Dict[str, dict]) -> dict:
    equipment = phase_results.get("equipment", {}).get("score", 0)
    failure_modes = phase_results.get("failure_modes", {}).get("score", 0)
    maintenance = phase_results.get("maintenance_strategy", {}).get("score", 0)
    criticality = phase_results.get("criticality", {}).get("score", 0)

    overall_components = []
    for phase_id, weight in PHASE_WEIGHTS.items():
        phase_score = phase_results.get(phase_id, {}).get("score", 0)
        overall_components.append(
            {
                "phase_id": phase_id,
                "label": PHASE_LABELS.get(phase_id, phase_id),
                "weight_percent": round(weight * 100),
                "score": phase_score,
                "contribution": round((phase_score / 100.0) * weight * 100, 1),
            }
        )

    data_phases = [
        ("company", phase_results.get("company", {}).get("score", 0)),
        ("users", phase_results.get("users", {}).get("score", 0)),
        ("equipment", equipment),
        ("forms", phase_results.get("forms", {}).get("score", 0)),
        ("spare_parts", phase_results.get("spare_parts", {}).get("score", 0)),
    ]

    return {
        "overall": {
            "formula": "Sum of (phase score × phase weight)",
            "components": overall_components,
        },
        "reliability": {
            "formula": "Failure Modes × 50% + Criticality × 30% + Equipment × 20%",
            "components": [
                {"label": "Failure Modes", "phase_id": "failure_modes", "weight_percent": 50, "score": failure_modes},
                {"label": "Criticality", "phase_id": "criticality", "weight_percent": 30, "score": criticality},
                {"label": "Equipment", "phase_id": "equipment", "weight_percent": 20, "score": equipment},
            ],
        },
        "maintenance": {
            "formula": "Maintenance Strategy × 70% + Failure Modes × 30%",
            "components": [
                {"label": "Maintenance Strategy", "phase_id": "maintenance_strategy", "weight_percent": 70, "score": maintenance},
                {"label": "Failure Modes", "phase_id": "failure_modes", "weight_percent": 30, "score": failure_modes},
            ],
        },
        "data_quality": {
            "formula": "Average of Company, Users, Equipment, Forms, Spare Parts scores",
            "components": [
                {"label": PHASE_LABELS.get(pid, pid), "phase_id": pid, "weight_percent": 20, "score": sc}
                for pid, sc in data_phases
            ],
        },
        "go_live": {
            "formula": "100% only when all mandatory phases pass; otherwise average of weighted phases",
            "components": overall_components,
        },
        "ai_readiness": {
            "formula": "Average of Failure Modes and Maintenance Strategy scores",
            "components": [
                {"label": "Failure Modes", "phase_id": "failure_modes", "weight_percent": 50, "score": failure_modes},
                {"label": "Maintenance Strategy", "phase_id": "maintenance_strategy", "weight_percent": 50, "score": maintenance},
            ],
        },
    }


async def _get_state_doc(tenant_id: str) -> dict:
    doc = await db[COLLECTION].find_one({"tenant_id": tenant_id}, {"_id": 0})
    if doc:
        return doc
    now = _now_iso()
    doc = {
        "tenant_id": tenant_id,
        "entry_path": None,
        "entry_path_selected_at": None,
        "phase_validations": {},
        "go_live_completed_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db[COLLECTION].insert_one(dict(doc))
    return doc


async def _duplicate_equipment_tags(tenant_id: str) -> List[str]:
    pipeline = [
        {"$match": {"tenant_id": tenant_id, "tag": {"$exists": True, "$nin": [None, ""]}}},
        {"$group": {"_id": "$tag", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 20},
    ]
    dupes: List[str] = []
    async for row in db.equipment_nodes.aggregate(pipeline):
        tag = row.get("_id")
        if tag:
            dupes.append(str(tag))
    return dupes


async def _equipment_below_installation(tenant_id: str) -> int:
    return await db.equipment_nodes.count_documents(
        {
            "tenant_id": tenant_id,
            "level": {
                "$in": [
                    ISOLevel.PLANT_UNIT.value,
                    ISOLevel.SECTION_SYSTEM.value,
                    ISOLevel.EQUIPMENT_UNIT.value,
                    ISOLevel.SUBUNIT.value,
                    ISOLevel.MAINTAINABLE_ITEM.value,
                ]
            },
        }
    )


def _has_criticality_assessment(criticality: Any) -> bool:
    """True when equipment has any criticality dimension assessed (Equipment Manager parity)."""
    if not criticality or not isinstance(criticality, dict):
        return False
    if criticality.get("level"):
        return True
    for field in (
        "safety_impact",
        "production_impact",
        "environmental_impact",
        "reputation_impact",
        "safety",
        "production",
        "environmental",
        "reputation",
    ):
        if (criticality.get(field) or 0) > 0:
            return True
    return False


async def _criticality_assessment_counts(tenant_id: str) -> dict:
    """Count in-scope nodes (subunit + maintainable_item only) and assessed coverage."""
    levels = list(ASSESSMENT_COVERAGE_LEVELS)
    in_scope_nodes = await db.equipment_nodes.find(
        {"tenant_id": tenant_id, "level": {"$in": levels}},
        {"_id": 0, "level": 1, "criticality": 1},
    ).to_list(length=10000)

    by_level = {level: {"total": 0, "assessed": 0} for level in levels}
    assessed = 0
    for node in in_scope_nodes:
        level = node.get("level")
        if level in by_level:
            by_level[level]["total"] += 1
        if _has_criticality_assessment(node.get("criticality")):
            assessed += 1
            if level in by_level:
                by_level[level]["assessed"] += 1

    total = len(in_scope_nodes)
    coverage = round((assessed / total) * 100) if total else 0
    return {
        "in_scope_total": total,
        "assessed_count": assessed,
        "coverage_percent": coverage,
        "subunit_total": by_level.get(ISOLevel.SUBUNIT.value, {}).get("total", 0),
        "subunit_assessed": by_level.get(ISOLevel.SUBUNIT.value, {}).get("assessed", 0),
        "maintainable_total": by_level.get(ISOLevel.MAINTAINABLE_ITEM.value, {}).get("total", 0),
        "maintainable_assessed": by_level.get(ISOLevel.MAINTAINABLE_ITEM.value, {}).get("assessed", 0),
        "production_assessed_count": sum(
            1 for n in in_scope_nodes if production_impact_from_criticality(n.get("criticality")) > 0
        ),
    }


async def _validate_company(tenant_id: str) -> dict:
    checks: List[dict] = []
    try:
        tenant = await _resolve_tenant_doc(db, tenant_id)
    except HTTPException:
        tenant = {}

    name = (tenant.get("name") or "").strip()
    language = (tenant.get("default_language") or "").strip()
    timezone_val = (tenant.get("default_timezone") or "").strip()

    checks.append(
        _check(
            "passed" if name else "action_required",
            "Company name configured" if name else "Company name is missing",
            code="company_name",
        )
    )
    checks.append(
        _check(
            "passed" if language else "warning",
            f"Default language: {language or 'not set'}",
            code="default_language",
        )
    )
    checks.append(
        _check(
            "passed" if timezone_val else "warning",
            f"Timezone: {timezone_val or 'not set'}",
            code="default_timezone",
        )
    )

    # Logo is optional
    logo_path = (tenant.get("logo_path") or "").strip()
    has_logo = bool(logo_path or tenant.get("logo_data"))
    checks.append(
        _check(
            "passed" if has_logo else "warning",
            "Company logo configured" if has_logo else "Company logo not configured (optional)",
            code="company_logo",
        )
    )

    passed = sum(1 for c in checks if c["status"] == "passed")
    score = round((passed / max(len(checks), 1)) * 100)
    return {"phase": "company", "score": score, "status": _status_from_score(score), "checks": checks}


async def _validate_sites(tenant_id: str) -> dict:
    site_count = await db.equipment_nodes.count_documents(
        {"tenant_id": tenant_id, "level": ISOLevel.INSTALLATION.value}
    )
    checks = [
        _check(
            "passed" if site_count >= 1 else "action_required",
            f"{site_count} site(s) configured",
            code="site_count",
            detail={"site_count": site_count},
        )
    ]
    score = 100 if site_count >= 1 else 0
    return {"phase": "sites", "score": score, "status": _status_from_score(score), "checks": checks}


async def _validate_equipment(tenant_id: str) -> dict:
    sites = await db.equipment_nodes.count_documents(
        {"tenant_id": tenant_id, "level": ISOLevel.INSTALLATION.value}
    )
    equipment_count = await _equipment_below_installation(tenant_id)
    dupes = await _duplicate_equipment_tags(tenant_id)

    checks: List[dict] = []
    checks.append(
        _check(
            "passed" if equipment_count > 0 else "action_required",
            f"{equipment_count} equipment node(s) below site level",
            code="equipment_count",
            detail={"equipment_count": equipment_count},
        )
    )
    checks.append(
        _check(
            "passed" if sites >= 1 else "action_required",
            f"{sites} site(s) available for hierarchy",
            code="sites_prerequisite",
        )
    )
    checks.append(
        _check(
            "passed" if not dupes else "warning",
            "No duplicate equipment tags" if not dupes else f"{len(dupes)} duplicate tag(s) found",
            code="duplicate_tags",
            detail={"duplicates": dupes},
        )
    )

    depth_levels = await db.equipment_nodes.distinct(
        "level",
        {"tenant_id": tenant_id, "level": {"$ne": ISOLevel.INSTALLATION.value}},
    )
    hierarchy_depth = len(depth_levels)
    checks.append(
        _check(
            "passed" if hierarchy_depth >= 2 else "warning",
            f"Hierarchy spans {hierarchy_depth} level(s) below site",
            code="hierarchy_depth",
            detail={"levels": depth_levels},
        )
    )

    health = 100
    if equipment_count == 0:
        health = 0
    elif dupes:
        health -= min(30, len(dupes) * 5)
    if hierarchy_depth < 2:
        health -= 15
    health = max(0, min(100, health))

    return {
        "phase": "equipment",
        "score": health,
        "status": _status_from_score(health),
        "checks": checks,
        "hierarchy_health_score": health,
    }


async def _validate_users(tenant_id: str) -> dict:
    counts = await _tenant_counts(db, tenant_id)
    user_count = counts.get("user_count", 0)

    assigned_count = await db.users.count_documents(
        {
            "$or": [{"tenant_id": tenant_id}, {"company_id": tenant_id}],
            "assigned_installations.0": {"$exists": True},
        }
    )

    checks = [
        _check(
            "passed" if user_count >= 2 else "warning" if user_count == 1 else "action_required",
            f"{user_count} user(s) in tenant",
            code="user_count",
            detail={"user_count": user_count},
        ),
        _check(
            "passed" if assigned_count >= 1 else "warning",
            f"{assigned_count} user(s) with installation assignments",
            code="installation_assignments",
        ),
    ]

    score = 0
    if user_count >= 2:
        score = 100
    elif user_count == 1:
        score = 60
    if assigned_count >= 1 and score < 100:
        score = min(100, score + 20)

    return {"phase": "users", "score": score, "status": _status_from_score(score), "checks": checks}


async def _validate_criticality(tenant_id: str) -> dict:
    installations = await db.equipment_nodes.find(
        {"tenant_id": tenant_id, "level": ISOLevel.INSTALLATION.value},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(length=50)

    risk_docs = await db.risk_settings.count_documents({"tenant_id": tenant_id})
    criticality_defs = await db.definitions.count_documents(
        {"tenant_id": tenant_id, "criticality": {"$exists": True, "$ne": None}}
    )

    assessment = await _criticality_assessment_counts(tenant_id)
    in_scope = assessment["in_scope_total"]
    assessed = assessment["assessed_count"]
    coverage = assessment["coverage_percent"]

    checks = [
        _check(
            "passed" if risk_docs > 0 or len(installations) == 0 else "warning",
            f"Risk settings configured for {risk_docs} installation(s)",
            code="risk_settings",
        ),
        _check(
            "passed" if criticality_defs > 0 else "warning",
            "Criticality definitions configured" if criticality_defs else "Using default criticality definitions",
            code="criticality_definitions",
        ),
        _check(
            "passed" if in_scope > 0 else "warning",
            (
                f"{in_scope} subunit(s) and maintainable item(s) in scope for criticality assessment"
                if in_scope
                else "No subunits or maintainable items yet — expand equipment hierarchy first"
            ),
            code="assessment_scope",
            detail={
                "subunit_total": assessment["subunit_total"],
                "maintainable_total": assessment["maintainable_total"],
                "in_scope_total": in_scope,
            },
        ),
        _check(
            "passed" if coverage >= 80 else "warning" if assessed > 0 else "action_required" if in_scope else "warning",
            (
                f"{assessed} of {in_scope} in-scope items assessed ({coverage}%)"
                if in_scope
                else "Assessment coverage pending — add subunits or maintainable items"
            ),
            code="assessment_coverage",
            detail={
                "assessed_count": assessed,
                "in_scope_total": in_scope,
                "coverage_percent": coverage,
                "subunit_assessed": assessment["subunit_assessed"],
                "subunit_total": assessment["subunit_total"],
                "maintainable_assessed": assessment["maintainable_assessed"],
                "maintainable_total": assessment["maintainable_total"],
                "production_assessed_count": assessment["production_assessed_count"],
            },
        ),
    ]

    score = 0
    if risk_docs > 0:
        score += 40
    if criticality_defs > 0:
        score += 30
    if in_scope > 0:
        score += round(coverage * 0.3)
    score = min(100, score)

    return {
        "phase": "criticality",
        "score": score,
        "status": _status_from_score(score),
        "checks": checks,
        "assessment_coverage_percent": coverage,
    }


async def _validate_failure_modes(tenant_id: str) -> dict:
    customer_fm = await db.failure_modes.count_documents(
        {"tenant_id": tenant_id, "failure_mode_type": "customer_specific"}
    )
    total_fm = await db.failure_modes.count_documents({"tenant_id": tenant_id})
    equipment_count = await _equipment_below_installation(tenant_id)

    coverage = round((customer_fm / equipment_count) * 100) if equipment_count else 0
    coverage = min(100, coverage)

    checks = [
        _check(
            "passed" if customer_fm > 0 else "action_required",
            f"{customer_fm} customer-specific failure mode(s)",
            code="customer_failure_modes",
            detail={"count": customer_fm},
        ),
        _check(
            "passed" if total_fm > 0 else "warning",
            f"{total_fm} total failure mode(s) including built-in library",
            code="total_failure_modes",
        ),
        _check(
            "passed" if coverage >= 10 else "warning" if customer_fm else "action_required",
            f"Coverage score: {coverage}% (customer FMs vs equipment)",
            code="coverage_score",
            detail={"coverage_percent": coverage},
        ),
    ]

    score = 0
    if customer_fm > 0:
        score = min(100, 50 + coverage // 2)

    return {"phase": "failure_modes", "score": score, "status": _status_from_score(score), "checks": checks}


async def _validate_maintenance_strategy(tenant_id: str) -> dict:
    v2_programs = await db.maintenance_programs_v2.count_documents({"tenant_id": tenant_id})
    active_strategies = await db.equipment_type_strategies.count_documents(
        {"tenant_id": tenant_id, "status": "active"}
    )
    needs_apply = await db.equipment_type_strategies.count_documents(
        {"tenant_id": tenant_id, "strategy_needs_apply": True}
    )
    equipment_count = await _equipment_below_installation(tenant_id)
    coverage = round((v2_programs / equipment_count) * 100) if equipment_count else 0
    coverage = min(100, coverage)

    checks = [
        _check(
            "passed" if v2_programs > 0 else "action_required",
            f"{v2_programs} maintenance program(s) created",
            code="maintenance_programs",
        ),
        _check(
            "passed" if active_strategies > 0 else "warning",
            f"{active_strategies} active maintenance strateg(ies)",
            code="active_strategies",
        ),
        _check(
            "passed" if needs_apply == 0 else "warning",
            f"{needs_apply} strateg(ies) still need Apply Strategy",
            code="strategy_needs_apply",
            detail={"count": needs_apply},
        ),
        _check(
            "passed" if coverage >= 5 else "warning" if v2_programs else "action_required",
            f"Maintenance coverage: {coverage}%",
            code="coverage_percent",
            detail={"coverage_percent": coverage},
        ),
    ]

    score = 0
    if v2_programs > 0:
        score = min(100, 40 + coverage // 2)
    if needs_apply == 0 and active_strategies > 0:
        score = min(100, score + 20)

    return {
        "phase": "maintenance_strategy",
        "score": score,
        "status": _status_from_score(score),
        "checks": checks,
        "coverage_percent": coverage,
    }


async def _validate_spare_parts(tenant_id: str) -> dict:
    spare_count = await db.spare_parts.count_documents({"tenant_id": tenant_id})
    linked = await db.spare_parts.count_documents(
        {"tenant_id": tenant_id, "equipment_id": {"$exists": True, "$nin": [None, ""]}}
    )

    checks = [
        _check(
            "passed" if spare_count > 0 else "action_required",
            f"{spare_count} spare part(s) imported",
            code="spare_parts_count",
        ),
        _check(
            "passed" if linked > 0 else "warning" if spare_count else "action_required",
            f"{linked} spare part(s) linked to equipment",
            code="spare_parts_linked",
        ),
    ]

    score = 0
    if spare_count > 0:
        score = 60
    if linked > 0:
        score = min(100, score + 40)

    return {"phase": "spare_parts", "score": score, "status": _status_from_score(score), "checks": checks}


async def _validate_forms(tenant_id: str) -> dict:
    template_count = await db.form_templates.count_documents({"tenant_id": tenant_id})
    submission_count = await db.form_submissions.count_documents({"tenant_id": tenant_id})

    checks = [
        _check(
            "passed" if template_count > 0 else "action_required",
            f"{template_count} form template(s) created",
            code="form_templates",
        ),
        _check(
            "passed" if submission_count > 0 else "warning" if template_count else "action_required",
            f"{submission_count} form submission(s) recorded",
            code="form_submissions",
        ),
    ]

    score = 100 if template_count > 0 and submission_count > 0 else (70 if template_count else 0)
    return {"phase": "forms", "score": score, "status": _status_from_score(score), "checks": checks}


async def _validate_visual_boards(tenant_id: str) -> dict:
    board_count = await db.visual_boards.count_documents({"tenant_id": tenant_id})
    published = await db.visual_boards.count_documents(
        {"tenant_id": tenant_id, "status": {"$in": ["published", "active", "online"]}}
    )
    if published == 0 and board_count > 0:
        published = board_count

    checks = [
        _check(
            "passed" if board_count > 0 else "action_required",
            f"{board_count} visual board(s) created",
            code="board_count",
        ),
        _check(
            "passed" if published > 0 else "warning" if board_count else "action_required",
            f"{published} board(s) online",
            code="boards_online",
        ),
    ]

    score = 100 if published > 0 else (50 if board_count else 0)
    return {"phase": "visual_boards", "score": score, "status": _status_from_score(score), "checks": checks}


async def _validate_external_api(tenant_id: str) -> dict:
    active_keys = await db.external_api_keys.count_documents(
        {
            "tenant_id": tenant_id,
            "revoked_at": None,
            "$or": [{"enabled": True}, {"enabled": {"$exists": False}}],
        }
    )

    checks = [
        _check(
            "passed" if active_keys > 0 else "action_required",
            f"{active_keys} active API key(s)",
            code="api_keys",
        ),
        _check(
            "warning",
            "Connection test requires live integration (stubbed for MVP)",
            code="connection_test",
        ),
    ]

    score = 80 if active_keys > 0 else 0
    return {"phase": "external_api", "score": score, "status": _status_from_score(score), "checks": checks}


async def _validate_go_live(tenant_id: str, phase_results: Dict[str, dict]) -> dict:
    mandatory = [p for p in PHASE_ORDER if p != "go_live"]
    blocking = [p for p in mandatory if phase_results.get(p, {}).get("status") == "action_required"]
    warnings = [p for p in mandatory if phase_results.get(p, {}).get("status") == "warning"]

    checks = [
        _check(
            "passed" if not blocking else "action_required",
            "All mandatory phases passed" if not blocking else f"{len(blocking)} phase(s) need attention",
            code="mandatory_phases",
            detail={"blocking_phases": blocking},
        ),
        _check(
            "passed" if not warnings else "warning",
            "No warnings" if not warnings else f"{len(warnings)} phase(s) with warnings",
            code="phase_warnings",
            detail={"warning_phases": warnings},
        ),
    ]

    avg_score = 0.0
    weighted_phases = [p for p in PHASE_ORDER if p in PHASE_WEIGHTS]
    if weighted_phases:
        avg_score = sum(phase_results.get(p, {}).get("score", 0) for p in weighted_phases) / len(
            weighted_phases
        )

    score = 0 if blocking else round(avg_score)
    status = "action_required" if blocking else ("warning" if warnings else "passed")

    return {"phase": "go_live", "score": score, "status": status, "checks": checks}


PHASE_VALIDATORS = {
    "company": _validate_company,
    "sites": _validate_sites,
    "equipment": _validate_equipment,
    "users": _validate_users,
    "criticality": _validate_criticality,
    "failure_modes": _validate_failure_modes,
    "maintenance_strategy": _validate_maintenance_strategy,
    "spare_parts": _validate_spare_parts,
    "forms": _validate_forms,
    "visual_boards": _validate_visual_boards,
    "external_api": _validate_external_api,
}


async def validate_phase(tenant_id: str, phase_id: str, *, persist: bool = True) -> dict:
    if phase_id not in VALID_PHASES:
        raise HTTPException(status_code=404, detail="Unknown onboarding phase")

    if phase_id == "go_live":
        phase_results = {}
        for pid in PHASE_ORDER:
            if pid == "go_live":
                continue
            phase_results[pid] = await validate_phase(tenant_id, pid, persist=False)
        result = await _validate_go_live(tenant_id, phase_results)
    else:
        validator = PHASE_VALIDATORS.get(phase_id)
        result = await validator(tenant_id)

    result["validated_at"] = _now_iso()
    result = _enrich_validation(result)

    if persist:
        await db[COLLECTION].update_one(
            {"tenant_id": tenant_id},
            {
                "$set": {
                    f"phase_validations.{phase_id}": result,
                    "updated_at": _now_iso(),
                    **(
                        {"go_live_completed_at": _now_iso()}
                        if phase_id == "go_live" and result.get("status") == "passed"
                        else {}
                    ),
                }
            },
            upsert=True,
        )

    return result


async def _run_all_validations(tenant_id: str) -> Dict[str, dict]:
    results: Dict[str, dict] = {}
    for phase_id in PHASE_ORDER:
        if phase_id == "go_live":
            continue
        results[phase_id] = _enrich_validation(await PHASE_VALIDATORS[phase_id](tenant_id))
    results["go_live"] = _enrich_validation(await _validate_go_live(tenant_id, results))
    return results


def _compute_overall_progress(phase_results: Dict[str, dict]) -> float:
    total = 0.0
    for phase_id, weight in PHASE_WEIGHTS.items():
        score = phase_results.get(phase_id, {}).get("score", 0)
        total += (score / 100.0) * weight
    return round(total * 100, 1)


def _compute_readiness_scores(phase_results: Dict[str, dict]) -> dict:
    equipment = phase_results.get("equipment", {}).get("score", 0)
    failure_modes = phase_results.get("failure_modes", {}).get("score", 0)
    maintenance = phase_results.get("maintenance_strategy", {}).get("score", 0)
    criticality = phase_results.get("criticality", {}).get("score", 0)
    data_sources = [
        phase_results.get("company", {}).get("score", 0),
        phase_results.get("users", {}).get("score", 0),
        equipment,
        phase_results.get("forms", {}).get("score", 0),
        phase_results.get("spare_parts", {}).get("score", 0),
    ]
    data_quality = round(sum(data_sources) / len(data_sources)) if data_sources else 0

    reliability = round((failure_modes * 0.5 + criticality * 0.3 + equipment * 0.2))
    maintenance_readiness = round((maintenance * 0.7 + failure_modes * 0.3))
    go_live = phase_results.get("go_live", {}).get("score", 0)

    return {
        "overall": _compute_overall_progress(phase_results),
        "reliability": reliability,
        "maintenance": maintenance_readiness,
        "data_quality": data_quality,
        "go_live": go_live,
        "ai_readiness": round((failure_modes + maintenance) / 2),
        "commercial_readiness": phase_results.get("company", {}).get("score", 0),
        "breakdown": _readiness_breakdown(phase_results),
    }


def _estimate_time_remaining(phase_results: Dict[str, dict]) -> int:
    minutes = 0
    for phase_id in PHASE_ORDER:
        score = phase_results.get(phase_id, {}).get("score", 0)
        if score < 100:
            effort = PHASE_EFFORT_MINUTES.get(phase_id, 10)
            remaining_fraction = (100 - score) / 100.0
            minutes += int(effort * remaining_fraction)
    return minutes


def _outstanding_actions(phase_results: Dict[str, dict]) -> List[dict]:
    actions: List[dict] = []
    for phase_id in PHASE_ORDER:
        result = phase_results.get(phase_id, {})
        if result.get("status") in ("action_required", "warning"):
            for check in result.get("checks", []):
                if check.get("status") in ("action_required", "warning"):
                    actions.append(
                        {
                            "phase": phase_id,
                            "phase_label": PHASE_LABELS.get(phase_id, phase_id),
                            "code": check.get("code"),
                            "status": check.get("status"),
                            "message": check.get("message"),
                        }
                    )
    return actions[:20]


def _serialize_phases(phase_results: Dict[str, dict]) -> List[dict]:
    phases = []
    for phase_id in PHASE_ORDER:
        result = phase_results.get(phase_id, {})
        phases.append(
            {
                "id": phase_id,
                "label": PHASE_LABELS.get(phase_id, phase_id),
                "weight": PHASE_WEIGHTS.get(phase_id, 0),
                "score": result.get("score", 0),
                "status": result.get("status", "action_required"),
                "effort_minutes": PHASE_EFFORT_MINUTES.get(phase_id, 10),
                "check_tally": result.get("check_tally"),
                "score_explanation": result.get("score_explanation"),
            }
        )
    return phases


async def get_onboarding_summary(user: dict) -> dict:
    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")

    state = await _get_state_doc(tenant_id)
    phase_results = await _run_all_validations(tenant_id)
    readiness = _compute_readiness_scores(phase_results)

    return {
        "tenant_id": tenant_id,
        "entry_path": state.get("entry_path"),
        "entry_path_options": ENTRY_PATHS,
        "phases": _serialize_phases(phase_results),
        "readiness": readiness,
        "outstanding_actions": _outstanding_actions(phase_results),
        "estimated_time_remaining_minutes": _estimate_time_remaining(phase_results),
        "go_live_completed_at": state.get("go_live_completed_at"),
        "checked_at": _now_iso(),
    }


async def get_phase_detail(user: dict, phase_id: str) -> dict:
    if phase_id not in VALID_PHASES:
        raise HTTPException(status_code=404, detail="Unknown onboarding phase")

    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")

    state = await _get_state_doc(tenant_id)
    phase_results = await _run_all_validations(tenant_id)
    validation = phase_results.get(phase_id, {})

    return {
        "phase_id": phase_id,
        "label": PHASE_LABELS.get(phase_id, phase_id),
        "weight": PHASE_WEIGHTS.get(phase_id, 0),
        "unweighted": phase_id in UNWEIGHTED_PHASES,
        "validation": validation,
        "readiness": _compute_readiness_scores(phase_results),
        "phases": _serialize_phases(phase_results),
        "entry_path": state.get("entry_path"),
        "checked_at": _now_iso(),
    }


async def select_entry_path(user: dict, entry_path: str) -> dict:
    if entry_path not in VALID_ENTRY_PATHS:
        raise HTTPException(status_code=400, detail="Invalid entry path")

    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")

    now = _now_iso()
    await db[COLLECTION].update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                "entry_path": entry_path,
                "entry_path_selected_at": now,
                "updated_at": now,
            },
            "$setOnInsert": {"tenant_id": tenant_id, "phase_validations": {}, "created_at": now},
        },
        upsert=True,
    )

    meta = ENTRY_PATHS[entry_path]
    return {
        "entry_path": entry_path,
        "start_phase": meta["start_phase"],
        "label": meta["label"],
        "selected_at": now,
    }


async def run_go_live_validation(user: dict) -> dict:
    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")

    result = await validate_phase(tenant_id, "go_live", persist=True)
    phase_results = await _run_all_validations(tenant_id)
    readiness = _compute_readiness_scores(phase_results)

    return {
        "validation": result,
        "readiness": readiness,
        "outstanding_actions": _outstanding_actions(phase_results),
        "ready": result.get("status") == "passed",
        "checked_at": _now_iso(),
    }


def _serialize_company_profile(tenant: dict) -> dict:
    logo_path = (tenant.get("logo_path") or "").strip()
    has_logo = bool(logo_path or tenant.get("logo_data"))
    return {
        "tenant_id": tenant.get("tenant_id"),
        "name": tenant.get("name") or "",
        "default_language": tenant.get("default_language") or "en",
        "default_timezone": tenant.get("default_timezone") or "UTC",
        "has_logo": has_logo,
        "logo_updated_at": tenant.get("logo_updated_at"),
    }


async def _ensure_tenant_doc(tenant_id: str, actor: dict) -> dict:
    try:
        return await _resolve_tenant_doc(db, tenant_id)
    except HTTPException:
        await register_legacy_tenant(db, tenant_id, actor)
        return await _resolve_tenant_doc(db, tenant_id)


async def get_company_profile(user: dict) -> dict:
    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")
    tenant = await _ensure_tenant_doc(tenant_id, user)
    return _serialize_company_profile(tenant)


async def update_company_profile(user: dict, payload: dict) -> dict:
    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")

    updates: Dict[str, Any] = {}
    if "name" in payload and payload["name"] is not None:
        name = str(payload["name"]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Company name is required")
        updates["name"] = name
    if "default_language" in payload and payload["default_language"] is not None:
        lang = str(payload["default_language"]).strip()
        if lang:
            updates["default_language"] = lang
    if "default_timezone" in payload and payload["default_timezone"] is not None:
        tz = str(payload["default_timezone"]).strip()
        if tz:
            updates["default_timezone"] = tz

    if not updates:
        tenant = await _ensure_tenant_doc(tenant_id, user)
        return _serialize_company_profile(tenant)

    await _ensure_tenant_doc(tenant_id, user)
    updates["updated_at"] = _now_iso()
    await db.tenants.update_one({"tenant_id": tenant_id}, {"$set": updates})
    tenant = await _ensure_tenant_doc(tenant_id, user)
    return _serialize_company_profile(tenant)


async def upload_company_logo(
    user: dict,
    *,
    content: bytes,
    content_type: str,
    filename: str,
) -> dict:
    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")

    if content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: JPEG, PNG, WebP, GIF")
    if len(content) > MAX_COMPANY_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be 5 MB or smaller")

    ext = "png"
    if "jpeg" in content_type or "jpg" in content_type:
        ext = "jpg"
    elif "webp" in content_type:
        ext = "webp"
    elif "gif" in content_type:
        ext = "gif"

    now = _now_iso()
    storage_path = f"tenants/{tenant_id}/company-logo.{ext}"

    try:
        from services.storage_service import is_storage_available, put_object_async

        if is_storage_available():
            await put_object_async(storage_path, content, content_type)
            await db.tenants.update_one(
                {"tenant_id": tenant_id},
                {
                    "$set": {
                        "logo_path": storage_path,
                        "logo_content_type": content_type,
                        "logo_storage": "object",
                        "logo_updated_at": now,
                        "updated_at": now,
                    },
                    "$unset": {"logo_data": ""},
                },
            )
        else:
            import base64

            await db.tenants.update_one(
                {"tenant_id": tenant_id},
                {
                    "$set": {
                        "logo_data": base64.b64encode(content).decode("utf-8"),
                        "logo_content_type": content_type,
                        "logo_storage": "mongodb",
                        "logo_updated_at": now,
                        "updated_at": now,
                    },
                    "$unset": {"logo_path": ""},
                },
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Company logo upload failed for tenant %s", tenant_id)
        raise HTTPException(status_code=500, detail="Failed to upload company logo") from exc

    tenant = await _ensure_tenant_doc(tenant_id, user)
    return _serialize_company_profile(tenant)


async def get_company_logo_response(tenant_id: str):
    from fastapi.responses import Response

    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not tenant:
        return Response(status_code=204)

    storage_type = tenant.get("logo_storage", "object")
    if storage_type == "mongodb" and tenant.get("logo_data"):
        import base64

        try:
            body = base64.b64decode(tenant["logo_data"])
            content_type = tenant.get("logo_content_type") or "image/png"
            return Response(content=body, media_type=content_type)
        except Exception:
            return Response(status_code=204)

    logo_path = tenant.get("logo_path")
    if not logo_path:
        return Response(status_code=204)

    try:
        from services.storage_service import get_object_async

        body, content_type = await get_object_async(logo_path)
        return Response(content=body, media_type=content_type or "image/png")
    except Exception as exc:
        logger.warning("Company logo not found for tenant %s: %s", tenant_id, exc)
        return Response(status_code=204)


def _coach_fallback_reply(phase_id: str) -> str:
    label = PHASE_LABELS.get(phase_id, phase_id)
    return (
        f"I can help with the {label} step. Use the action button on this page to configure "
        f"{label.lower()}, then run validation to confirm progress. "
        "Ask a specific question and I'll explain in plain language."
    )


async def ask_coach(user: dict, phase_id: str, message: str) -> dict:
    """Onboarding AI coach — guidance only, not the observation chat workflow."""
    if phase_id not in VALID_PHASES:
        raise HTTPException(status_code=404, detail="Unknown onboarding phase")

    text = (message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")

    tenant_id = tenant_id_from_user(user)
    phase_label = PHASE_LABELS.get(phase_id, phase_id)

    validation_summary = "not checked"
    if tenant_id:
        try:
            validation = await validate_phase(tenant_id, phase_id, persist=False)
            validation_summary = f"{validation.get('status', 'unknown')} ({validation.get('score', 0)}%)"
        except Exception as exc:
            logger.debug("coach validation snapshot skipped: %s", exc)

    coach_context = (
        "You are the AssetIQ Self-Service Onboarding AI Coach.\n"
        f"Current onboarding phase: {phase_label} ({phase_id}).\n"
        f"Phase validation: {validation_summary}.\n"
        "Your role:\n"
        "- Explain AssetIQ concepts in plain language (keep answers concise).\n"
        "- Suggest best practices for this onboarding step.\n"
        "- Tell the user what to do next on this phase.\n"
        "- You must NEVER claim you changed data or executed actions — only guide the user.\n"
        "- Do NOT treat messages as equipment failure observations.\n"
        "- Do NOT ask the user to select equipment or create observations."
    )

    try:
        from services.ai_platform import execute_prompt

        result = await execute_prompt(
            "chat.general_assistant",
            user=user,
            user_message=text,
            context=coach_context,
            endpoint="onboarding.ask_coach",
            model="gpt-4o-mini",
            temperature=0.4,
            max_tokens=600,
        )
        reply = (result.get("content") or "").strip()
        if not reply:
            reply = _coach_fallback_reply(phase_id)
    except Exception as exc:
        logger.warning("Onboarding coach AI failed for phase %s: %s", phase_id, exc)
        reply = _coach_fallback_reply(phase_id)

    return {
        "message": reply,
        "phase_id": phase_id,
        "phase_label": phase_label,
    }
