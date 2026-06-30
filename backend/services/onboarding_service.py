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
from services.tenant_management_service import _resolve_tenant_doc, _tenant_counts
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)

COLLECTION = "onboarding_state"


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

    # Logo is optional — stub check
    checks.append(
        _check(
            "warning",
            "Company logo not configured (optional)",
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

    equipment_with_scores = await db.equipment_nodes.count_documents(
        {
            "tenant_id": tenant_id,
            "$or": [
                {"criticality.safety": {"$exists": True, "$gt": 0}},
                {"criticality.production": {"$exists": True, "$gt": 0}},
                {"safety": {"$exists": True, "$gt": 0}},
                {"production": {"$exists": True, "$gt": 0}},
            ],
        }
    )

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
            "passed" if equipment_with_scores > 0 else "warning",
            f"{equipment_with_scores} equipment node(s) with criticality scores",
            code="equipment_criticality",
        ),
    ]

    score = 0
    if risk_docs > 0:
        score += 40
    if criticality_defs > 0:
        score += 30
    if equipment_with_scores > 0:
        score += 30
    score = min(100, score)

    return {"phase": "criticality", "score": score, "status": _status_from_score(score), "checks": checks}


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
        results[phase_id] = await PHASE_VALIDATORS[phase_id](tenant_id)
    results["go_live"] = await _validate_go_live(tenant_id, results)
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
