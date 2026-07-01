"""Onboarding phase validators — tenant-scoped Mongo reads."""
from __future__ import annotations

from typing import Any, Dict, List  # noqa: F401 used by validators

from fastapi import HTTPException

from database import db
from iso14224_models import ISOLevel
from services.onboarding_constants import PHASE_ORDER, PHASE_WEIGHTS, VALID_PHASES
from services.onboarding_helpers import check, enrich_validation, now_iso, status_from_score
from services.onboarding_criticality_scope import (
    count_criticality_definitions_for_scope,
    count_risk_settings_for_scope,
    criticality_assessment_counts,
    tenant_installation_scope,
)
from services.onboarding_tenant import (
    OPERATIONAL_LEVELS,
    _scope_pipeline,
    _tenant_query,
)
from services.production_exposure import production_impact_from_criticality
from services.tenant_management_service import _resolve_tenant_doc, _tenant_counts

COLLECTION = "onboarding_state"


async def _duplicate_equipment_tags(tenant_id: str) -> List[str]:
    pipeline = _scope_pipeline(tenant_id, [
        {"$match": {"tag": {"$exists": True, "$nin": [None, ""]}}},
        {"$group": {"_id": "$tag", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 20},
    ])
    dupes: List[str] = []
    async for row in db.equipment_nodes.aggregate(pipeline):
        tag = row.get("_id")
        if tag:
            dupes.append(str(tag))
    return dupes


async def _equipment_below_installation(tenant_id: str) -> int:
    return await db.equipment_nodes.count_documents(
        _tenant_query(tenant_id, {"level": {"$in": list(OPERATIONAL_LEVELS)}})
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
        check(
            "passed" if name else "action_required",
            "Company name configured" if name else "Company name is missing",
            code="company_name",
        )
    )
    checks.append(
        check(
            "passed" if language else "warning",
            f"Default language: {language or 'not set'}",
            code="default_language",
        )
    )
    checks.append(
        check(
            "passed" if timezone_val else "warning",
            f"Timezone: {timezone_val or 'not set'}",
            code="default_timezone",
        )
    )

    # Logo is optional
    logo_path = (tenant.get("logo_path") or "").strip()
    has_logo = bool(logo_path or tenant.get("logo_data"))
    checks.append(
        check(
            "passed" if has_logo else "warning",
            "Company logo configured" if has_logo else "Company logo not configured (optional)",
            code="company_logo",
        )
    )

    passed = sum(1 for c in checks if c["status"] == "passed")
    score = round((passed / max(len(checks), 1)) * 100)
    return {"phase": "company", "score": score, "status": status_from_score(score), "checks": checks}


async def _validate_sites(tenant_id: str) -> dict:
    site_count = await db.equipment_nodes.count_documents(
        _tenant_query(tenant_id, {"level": ISOLevel.INSTALLATION.value})
    )
    checks = [
        check(
            "passed" if site_count >= 1 else "action_required",
            f"{site_count} site(s) configured",
            code="site_count",
            detail={"site_count": site_count},
        )
    ]
    score = 100 if site_count >= 1 else 0
    return {"phase": "sites", "score": score, "status": status_from_score(score), "checks": checks}


async def _validate_equipment(tenant_id: str) -> dict:
    sites = await db.equipment_nodes.count_documents(
        _tenant_query(tenant_id, {"level": ISOLevel.INSTALLATION.value})
    )
    equipment_count = await _equipment_below_installation(tenant_id)
    dupes = await _duplicate_equipment_tags(tenant_id)

    checks: List[dict] = []
    checks.append(
        check(
            "passed" if equipment_count > 0 else "action_required",
            f"{equipment_count} equipment node(s) below site level",
            code="equipment_count",
            detail={"equipment_count": equipment_count},
        )
    )
    checks.append(
        check(
            "passed" if sites >= 1 else "action_required",
            f"{sites} site(s) available for hierarchy",
            code="sites_prerequisite",
        )
    )
    checks.append(
        check(
            "passed" if not dupes else "warning",
            "No duplicate equipment tags" if not dupes else f"{len(dupes)} duplicate tag(s) found",
            code="duplicate_tags",
            detail={"duplicates": dupes},
        )
    )

    depth_levels = await db.equipment_nodes.distinct(
        "level",
        _tenant_query(tenant_id, {"level": {"$ne": ISOLevel.INSTALLATION.value}}),
    )
    hierarchy_depth = len(depth_levels)
    checks.append(
        check(
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
        "status": status_from_score(health),
        "checks": checks,
        "hierarchy_health_score": health,
    }


async def _validate_users(tenant_id: str) -> dict:
    counts = await _tenant_counts(db, tenant_id)
    user_count = counts.get("user_count", 0)

    assigned_count = await db.users.count_documents(_tenant_query(tenant_id, {"assigned_installations.0": {"$exists": True}}))

    checks = [
        check(
            "passed" if user_count >= 2 else "warning" if user_count == 1 else "action_required",
            f"{user_count} user(s) in tenant",
            code="user_count",
            detail={"user_count": user_count},
        ),
        check(
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

    return {"phase": "users", "score": score, "status": status_from_score(score), "checks": checks}


async def _validate_criticality(tenant_id: str) -> dict:
    scope = await tenant_installation_scope(tenant_id)
    installations_total = scope["installations_total"]
    risk_customized = await count_risk_settings_for_scope(scope["scope_ids"], scope["scope_names"])
    criticality_defs = await count_criticality_definitions_for_scope(scope["scope_ids"], scope["scope_names"])

    assessment = await criticality_assessment_counts(tenant_id)
    in_scope = assessment["in_scope_total"]
    assessed = assessment["assessed_count"]
    coverage = assessment["coverage_percent"]

    checks = [
        check(
            "passed" if risk_customized > 0 or installations_total > 0 else "warning",
            (
                f"Risk settings active for {installations_total} installation(s)"
                f"{f' ({risk_customized} customized)' if risk_customized else ''}"
                if installations_total
                else "Add a site before configuring risk settings"
            ),
            code="risk_settings",
            detail={
                "customized_count": risk_customized,
                "installations_total": installations_total,
            },
        ),
        check(
            "passed" if criticality_defs > 0 or installations_total > 0 else "warning",
            (
                f"Custom criticality definitions for {criticality_defs} installation(s)"
                if criticality_defs
                else (
                    f"Default criticality ranks apply for {installations_total} installation(s)"
                    if installations_total
                    else "Add a site before configuring criticality definitions"
                )
            ),
            code="criticality_definitions",
            detail={
                "customized_count": criticality_defs,
                "installations_total": installations_total,
            },
        ),
        check(
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
        check(
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
    if risk_customized > 0 or installations_total > 0:
        score += 40
    if criticality_defs > 0 or installations_total > 0:
        score += 30
    if in_scope > 0:
        score += round(coverage * 0.3)
    score = min(100, score)

    return {
        "phase": "criticality",
        "score": score,
        "status": status_from_score(score),
        "checks": checks,
        "assessment_coverage_percent": coverage,
    }


async def _validate_failure_modes(tenant_id: str) -> dict:
    customer_fm = await db.failure_modes.count_documents(
        _tenant_query(tenant_id, {"failure_mode_type": "customer_specific"})
    )

    types_in_use_raw = await db.equipment_nodes.distinct(
        "equipment_type_id",
        _tenant_query(tenant_id, {"level": {"$in": list(OPERATIONAL_LEVELS)}, "equipment_type_id": {"$ne": None, "$exists": True}}),
    )
    types_in_use = [equipment_type_id for equipment_type_id in types_in_use_raw if equipment_type_id]
    types_in_use_count = len(types_in_use)

    if types_in_use:
        linked_fm = await db.failure_modes.count_documents(
            _tenant_query(tenant_id, {"equipment_type_ids": {"$elemMatch": {"$in": types_in_use}}})
        )
        fm_et_pipeline = _scope_pipeline(tenant_id, [
            {"$match": {"equipment_type_ids": {"$exists": True, "$ne": []}}},
            {"$unwind": "$equipment_type_ids"},
            {"$match": {"equipment_type_ids": {"$in": types_in_use}}},
            {"$group": {"_id": "$equipment_type_ids"}},
        ])
        fm_et_result = await db.failure_modes.aggregate(fm_et_pipeline).to_list(length=None)
        types_with_fm = [row["_id"] for row in fm_et_result if row.get("_id")]
        types_with_fm_count = len(types_with_fm)

        equipment_with_type = await db.equipment_nodes.count_documents(
            _tenant_query(tenant_id, {"level": {"$in": list(OPERATIONAL_LEVELS)}, "equipment_type_id": {"$in": types_in_use}})
        )
        equipment_with_fm = (
            await db.equipment_nodes.count_documents(
                _tenant_query(
                    tenant_id,
                    {"level": {"$in": list(OPERATIONAL_LEVELS)}, "equipment_type_id": {"$in": types_with_fm}},
                )
            )
            if types_with_fm
            else 0
        )
    else:
        linked_fm = 0
        types_with_fm_count = 0
        equipment_with_type = 0
        equipment_with_fm = 0

    type_coverage = round((types_with_fm_count / types_in_use_count) * 100) if types_in_use_count else 0
    asset_coverage = round((equipment_with_fm / equipment_with_type) * 100) if equipment_with_type else 0

    checks = [
        check(
            "passed" if customer_fm > 0 else "action_required",
            f"{customer_fm} customer-specific failure mode(s)",
            code="customer_failure_modes",
            detail={"count": customer_fm},
        ),
        check(
            "passed" if linked_fm > 0 else "warning",
            f"{linked_fm} failure mode(s) linked to equipment types in use",
            code="linked_failure_modes",
            detail={"count": linked_fm},
        ),
        check(
            "passed" if type_coverage >= 50 else "warning" if types_with_fm_count else "action_required",
            (
                f"{types_with_fm_count} of {types_in_use_count} equipment type(s) have failure modes ({type_coverage}%)"
                if types_in_use_count
                else "Assign equipment types before linking failure modes"
            ),
            code="type_coverage",
            detail={
                "type_coverage_percent": type_coverage,
                "types_in_use": types_in_use_count,
                "types_with_failure_modes": types_with_fm_count,
                "asset_coverage_percent": asset_coverage,
                "equipment_with_type": equipment_with_type,
                "equipment_with_failure_modes": equipment_with_fm,
            },
        ),
    ]

    score = 0
    if customer_fm > 0:
        score = min(100, 50 + type_coverage // 2)

    return {"phase": "failure_modes", "score": score, "status": status_from_score(score), "checks": checks}


async def _validate_maintenance_strategy(tenant_id: str) -> dict:
    v2_programs = await db.maintenance_programs_v2.count_documents(_tenant_query(tenant_id, {}))
    active_strategies = await db.equipment_type_strategies.count_documents(
        _tenant_query(tenant_id, {"status": "active"})
    )
    needs_apply = await db.equipment_type_strategies.count_documents(
        _tenant_query(tenant_id, {"strategy_needs_apply": True})
    )
    equipment_count = await _equipment_below_installation(tenant_id)
    coverage = round((v2_programs / equipment_count) * 100) if equipment_count else 0
    coverage = min(100, coverage)

    checks = [
        check(
            "passed" if v2_programs > 0 else "action_required",
            f"{v2_programs} maintenance program(s) created",
            code="maintenance_programs",
        ),
        check(
            "passed" if active_strategies > 0 else "warning",
            f"{active_strategies} active maintenance strateg(ies)",
            code="active_strategies",
        ),
        check(
            "passed" if needs_apply == 0 else "warning",
            f"{needs_apply} strateg(ies) still need Apply Strategy",
            code="strategy_needs_apply",
            detail={"count": needs_apply},
        ),
        check(
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
        "status": status_from_score(score),
        "checks": checks,
        "coverage_percent": coverage,
    }


async def _validate_spare_parts(tenant_id: str) -> dict:
    linked_spare_query = _tenant_query(
        tenant_id,
        {"equipment_links": {"$elemMatch": {"equipment_id": {"$exists": True, "$nin": [None, ""]}}}},
    )

    spare_count = await db.spare_parts.count_documents(_tenant_query(tenant_id, {}))
    linked = await db.spare_parts.count_documents(linked_spare_query)

    sp_linked_pipeline = [
        {"$match": linked_spare_query},
        {"$unwind": "$equipment_links"},
        {"$match": {"equipment_links.equipment_id": {"$exists": True, "$nin": [None, ""]}}},
        {"$group": {"_id": "$equipment_links.equipment_id"}},
    ]
    linked_equipment_result = await db.spare_parts.aggregate(sp_linked_pipeline).to_list(length=None)
    linked_equipment_ids = [row["_id"] for row in linked_equipment_result if row.get("_id")]

    equipment_count = await _equipment_below_installation(tenant_id)
    equipment_with_spares = (
        await db.equipment_nodes.count_documents(
            _tenant_query(tenant_id, {"level": {"$in": list(OPERATIONAL_LEVELS)}, "id": {"$in": linked_equipment_ids}})
        )
        if linked_equipment_ids
        else 0
    )
    equipment_coverage = round((equipment_with_spares / equipment_count) * 100) if equipment_count else 0

    checks = [
        check(
            "passed" if spare_count > 0 else "action_required",
            f"{spare_count} spare part(s) imported",
            code="spare_parts_count",
        ),
        check(
            "passed" if linked > 0 else "warning" if spare_count else "action_required",
            (
                f"{linked} spare part(s) linked to equipment ({equipment_coverage}% equipment coverage)"
                if linked > 0
                else "No spare parts linked to equipment yet"
            ),
            code="spare_parts_linked",
            detail={
                "linked_count": linked,
                "linked_equipment_count": len(linked_equipment_ids),
                "equipment_in_scope": equipment_count,
                "equipment_with_spares": equipment_with_spares,
                "equipment_coverage_percent": equipment_coverage,
            },
        ),
    ]

    score = 0
    if spare_count > 0:
        score = 60
    if linked > 0:
        score = min(100, score + (equipment_coverage * 40 // 100))

    return {
        "phase": "spare_parts",
        "score": score,
        "status": status_from_score(score),
        "checks": checks,
        "equipment_coverage_percent": equipment_coverage,
    }


async def _validate_forms(tenant_id: str) -> dict:
    template_count = await db.form_templates.count_documents(_tenant_query(tenant_id, {}))
    submission_count = await db.form_submissions.count_documents(_tenant_query(tenant_id, {}))

    checks = [
        check(
            "passed" if template_count > 0 else "action_required",
            f"{template_count} form template(s) created",
            code="form_templates",
        ),
        check(
            "passed" if submission_count > 0 else "warning" if template_count else "action_required",
            f"{submission_count} form submission(s) recorded",
            code="form_submissions",
        ),
    ]

    score = 100 if template_count > 0 and submission_count > 0 else (70 if template_count else 0)
    return {"phase": "forms", "score": score, "status": status_from_score(score), "checks": checks}


async def _validate_visual_boards(tenant_id: str) -> dict:
    board_count = await db.visual_boards.count_documents(_tenant_query(tenant_id, {}))
    published = await db.visual_boards.count_documents(
        _tenant_query(tenant_id, {"status": {"$in": ["published", "active", "online"]}})
    )
    if published == 0 and board_count > 0:
        published = board_count

    checks = [
        check(
            "passed" if board_count > 0 else "action_required",
            f"{board_count} visual board(s) created",
            code="board_count",
        ),
        check(
            "passed" if published > 0 else "warning" if board_count else "action_required",
            f"{published} board(s) online",
            code="boards_online",
        ),
    ]

    score = 100 if published > 0 else (50 if board_count else 0)
    return {"phase": "visual_boards", "score": score, "status": status_from_score(score), "checks": checks}


async def _validate_external_api(tenant_id: str) -> dict:
    active_keys = await db.external_api_keys.count_documents(
        _tenant_query(
            tenant_id,
            {"revoked_at": None, "$or": [{"enabled": True}, {"enabled": {"$exists": False}}]},
        )
    )

    checks = [
        check(
            "passed" if active_keys > 0 else "action_required",
            f"{active_keys} active API key(s)",
            code="api_keys",
        ),
        check(
            "warning",
            "Connection test requires live integration (stubbed for MVP)",
            code="connection_test",
        ),
    ]

    score = 80 if active_keys > 0 else 0
    return {"phase": "external_api", "score": score, "status": status_from_score(score), "checks": checks}


async def _validate_go_live(tenant_id: str, phase_results: Dict[str, dict]) -> dict:
    mandatory = [p for p in PHASE_ORDER if p != "go_live"]
    blocking = [p for p in mandatory if phase_results.get(p, {}).get("status") == "action_required"]
    warnings = [p for p in mandatory if phase_results.get(p, {}).get("status") == "warning"]

    checks = [
        check(
            "passed" if not blocking else "action_required",
            "All mandatory phases passed" if not blocking else f"{len(blocking)} phase(s) need attention",
            code="mandatory_phases",
            detail={"blocking_phases": blocking},
        ),
        check(
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

    result["validated_at"] = now_iso()
    result = enrich_validation(result)

    if persist:
        await db[COLLECTION].update_one(
            {"tenant_id": tenant_id},
            {
                "$set": {
                    f"phase_validations.{phase_id}": result,
                    "updated_at": now_iso(),
                    **(
                        {"go_live_completed_at": now_iso()}
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
        results[phase_id] = enrich_validation(await PHASE_VALIDATORS[phase_id](tenant_id))
    results["go_live"] = enrich_validation(await _validate_go_live(tenant_id, results))
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
