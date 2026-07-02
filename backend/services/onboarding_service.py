"""Self-service client onboarding workspace — state, progress, and API surface."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import HTTPException

from database import db
from services.onboarding_constants import (
    ENTRY_PATHS,
    PHASE_EFFORT_MINUTES,
    PHASE_LABELS,
    PHASE_ORDER,
    PHASE_WEIGHTS,
    OPTIONAL_PHASES,
    UNWEIGHTED_PHASES,
    VALID_ENTRY_PATHS,
    VALID_PHASES,
)
from services.onboarding_helpers import (
    enrich_validation,
    estimate_time_remaining,
    now_iso,
    outstanding_actions,
    readiness_breakdown,
    serialize_phases,
)
from services.onboarding_validation import (
    COLLECTION,
    _run_all_validations,
    _validate_go_live,
    validate_phase,
)
from services.tenant_management_service import _resolve_tenant_doc, register_legacy_tenant
from services.tenant_schema import tenant_id_from_user

logger = logging.getLogger(__name__)

MAX_COMPANY_LOGO_BYTES = 5 * 1024 * 1024
ALLOWED_LOGO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


async def _get_state_doc(tenant_id: str) -> dict:
    doc = await db[COLLECTION].find_one({"tenant_id": tenant_id}, {"_id": 0})
    if doc:
        return doc
    now = now_iso()
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


def compute_overall_progress(phase_results: Dict[str, dict]) -> float:
    total = 0.0
    for phase_id, weight in PHASE_WEIGHTS.items():
        score = phase_results.get(phase_id, {}).get("score", 0)
        total += (score / 100.0) * weight
    return round(total * 100, 1)


def compute_readiness_scores(phase_results: Dict[str, dict]) -> dict:
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
        "overall": compute_overall_progress(phase_results),
        "reliability": reliability,
        "maintenance": maintenance_readiness,
        "data_quality": data_quality,
        "go_live": go_live,
        "ai_readiness": round((failure_modes + maintenance) / 2),
        "commercial_readiness": phase_results.get("company", {}).get("score", 0),
        "breakdown": readiness_breakdown(phase_results),
    }


# Re-export validation helpers for tests and backward compatibility.
from services.onboarding_helpers import enrich_validation as _enrich_validation  # noqa: E402
from services.onboarding_validation import (  # noqa: E402
    _validate_criticality,
    _validate_failure_modes,
    _validate_spare_parts,
)

_compute_overall_progress = compute_overall_progress
_compute_readiness_scores = compute_readiness_scores
_estimate_time_remaining = estimate_time_remaining


async def get_onboarding_summary(user: dict) -> dict:
    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        from services.tenant_schema import BACKFILL_TENANT_ID

        tenant_id = BACKFILL_TENANT_ID
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")

    state = await _get_state_doc(tenant_id)
    phase_results = await _run_all_validations(tenant_id)
    readiness = compute_readiness_scores(phase_results)

    return {
        "tenant_id": tenant_id,
        "entry_path": state.get("entry_path"),
        "entry_path_options": ENTRY_PATHS,
        "phases": serialize_phases(phase_results),
        "readiness": readiness,
        "outstanding_actions": outstanding_actions(phase_results),
        "estimated_time_remaining_minutes": estimate_time_remaining(phase_results),
        "go_live_completed_at": state.get("go_live_completed_at"),
        "checked_at": now_iso(),
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
        "optional": phase_id in OPTIONAL_PHASES,
        "validation": validation,
        "readiness": compute_readiness_scores(phase_results),
        "phases": serialize_phases(phase_results),
        "entry_path": state.get("entry_path"),
        "checked_at": now_iso(),
    }


async def select_entry_path(user: dict, entry_path: str) -> dict:
    if entry_path not in VALID_ENTRY_PATHS:
        raise HTTPException(status_code=400, detail="Invalid entry path")

    tenant_id = tenant_id_from_user(user)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant context for user")

    now = now_iso()
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
    readiness = compute_readiness_scores(phase_results)

    return {
        "validation": result,
        "readiness": readiness,
        "outstanding_actions": outstanding_actions(phase_results),
        "ready": result.get("status") == "passed",
        "checked_at": now_iso(),
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
        from services.tenant_schema import BACKFILL_TENANT_ID

        tenant_id = BACKFILL_TENANT_ID
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
    updates["updated_at"] = now_iso()
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

    now = now_iso()
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
