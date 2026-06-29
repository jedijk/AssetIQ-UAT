"""Chat observation / work-signal creation."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from database import db
from services.cache_service import cache
from services.chat_central_action_service import create_chat_central_action
from services.chat_routes_state import tenant_ctx_for_user
from services.tenant_scope import scoped
from services.threat_score_service import (
    calculate_rank,
    calculate_risk_score,
    get_risk_settings_for_installation,
    update_all_ranks,
)

logger = logging.getLogger(__name__)


def chat_observation_title(equipment_name: str, user_description: str) -> str:
    """Title for chat-created observations — reflects the report, not auto-mapped failure mode."""
    eq = (equipment_name or "").strip()
    if eq in ("Unknown", "Unknown equipment"):
        eq = ""
    desc = (user_description or "").strip()
    if len(desc) > 100:
        desc = desc[:97].rstrip() + "..."
    if eq and desc:
        return f"{eq} - {desc}"
    if desc:
        return desc
    if eq:
        return eq
    return "New observation"


async def create_observation(
    user_id: str,
    obs_data: dict,
    session_id: str,
    image_thumbnail: str = None,
    user_description: str = None,
) -> dict:
    threat_id = str(uuid.uuid4())
    equipment_name = obs_data.get("equipment_name", "Unknown")
    failure_mode_name = obs_data.get("failure_mode_name", "Unknown")

    chat_lang = (obs_data.get("chat_ui_language") or "en").lower()

    if chat_lang in ("nl", "de"):
        quick_fm_translate = {
            "oververhitting": "Overheating",
            "lekkage": "Leakage",
            "lek": "Leak",
            "trillingen": "Vibrations",
            "trilling": "Vibration",
            "lawaai": "Noise",
            "geluid": "Noise",
            "storing": "Malfunction",
            "defect": "Defect",
            "kapot": "Broken",
            "schade": "Damage",
            "slijtage": "Wear",
            "corrosie": "Corrosion",
        }
        fm_lower = failure_mode_name.lower() if failure_mode_name else ""
        if fm_lower in quick_fm_translate:
            failure_mode_name = quick_fm_translate[fm_lower]

    fmea_data = obs_data.get("failure_mode", {})
    rpn = fmea_data.get("rpn", 100) if isinstance(fmea_data, dict) else 100
    fmea_score = min(100, int(rpn / 10))

    equipment_type = (
        obs_data.get("equipment_type")
        or (fmea_data.get("equipment") if isinstance(fmea_data, dict) else None)
        or "Equipment"
    )
    installation_id = obs_data.get("installation_id")

    criticality = obs_data.get("criticality", {})
    criticality_score = 0
    if isinstance(criticality, dict):
        s = criticality.get("safety_impact", 0) or 0
        p = criticality.get("production_impact", 0) or 0
        e = criticality.get("environmental_impact", 0) or 0
        r = criticality.get("reputation_impact", 0) or 0
        from services.criticality_score import compute_criticality_score
        criticality_score = compute_criticality_score(s, p, e, r)

    risk_settings = await get_risk_settings_for_installation(installation_id)
    final_risk_score, risk_level = calculate_risk_score(criticality_score, fmea_score, risk_settings)
    tenant_user = await tenant_ctx_for_user(user_id)
    rank, total = await calculate_rank(final_risk_score, user_id, user=tenant_user)

    observation_title = chat_observation_title(
        equipment_name,
        user_description or obs_data.get("original_description") or "",
    )

    threat_doc = {
        "id": threat_id,
        "title": observation_title,
        "description": user_description or "",
        "user_context": user_description or "",
        "asset": equipment_name,
        "equipment_type": equipment_type,
        "failure_mode": failure_mode_name,
        "failure_mode_id": obs_data.get("failure_mode_id"),
        "failure_mode_data": fmea_data if fmea_data else None,
        "is_new_failure_mode": obs_data.get("is_custom_failure_mode", False),
        "cause": None,
        "impact": "Equipment Damage",
        "frequency": "First Time",
        "likelihood": "Possible",
        "detectability": "Moderate",
        "risk_level": risk_level,
        "risk_score": final_risk_score,
        "fmea_score": fmea_score,
        "fmea_rpn": rpn if fmea_data else None,
        "criticality_score": criticality_score,
        "base_risk_score": fmea_score,
        "rank": rank,
        "total_threats": total,
        "status": "Observation",
        "recommended_actions": (
            obs_data.get("recommended_actions")
            or (fmea_data.get("recommended_actions", []) if isinstance(fmea_data, dict) else [])
            or []
        ),
        "created_by": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "occurrence_count": 1,
        "image_url": None,
        "location": None,
        "linked_equipment_id": obs_data.get("equipment_id"),
        "installation_id": installation_id,
        "risk_settings_used": {
            "criticality_weight": risk_settings["criticality_weight"],
            "fmea_weight": risk_settings["fmea_weight"],
            "installation_id": installation_id,
        },
        "equipment_criticality": criticality.get("level") if isinstance(criticality, dict) else None,
        "equipment_criticality_data": criticality if isinstance(criticality, dict) else None,
        "session_id": session_id,
        "attachments": [],
    }

    if image_thumbnail:
        att: dict = {
            "type": "image",
            "data": image_thumbnail,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        caption = (user_description or obs_data.get("original_description") or "").strip()
        if caption:
            att["description"] = caption
        threat_doc["attachments"] = [att]

    try:
        from services.work_signal_lifecycle import create_work_signal

        tenant_user = await tenant_ctx_for_user(user_id)
        created = await create_work_signal(
            threat_doc,
            user=tenant_user,
            source="chat",
            graph_label="chat_threat_create",
        )
        threat_id = created["id"]
        logger.info(
            "Created work signal %s with %s attachments",
            threat_id,
            len(threat_doc.get("attachments", [])),
        )
    except Exception as e:
        logger.error(f"Failed to create work signal {threat_id}: {e}")
        raise

    threat_doc["id"] = threat_id

    auto_created = []
    rec_actions = obs_data.get("recommended_actions", [])
    if not rec_actions and isinstance(fmea_data, dict):
        rec_actions = fmea_data.get("recommended_actions", [])

    for ra in rec_actions:
        if isinstance(ra, dict) and ra.get("auto_create"):
            desc = ra.get("action") or ra.get("description", "")
            action_doc = await create_chat_central_action(
                user_id=user_id,
                threat_id=threat_id,
                threat_title=threat_doc["title"],
                title=desc[:200],
                description=desc,
                action_type=ra.get("action_type", "CM"),
                discipline=ra.get("discipline", "Mechanical"),
                priority="medium",
                linked_equipment_id=obs_data.get("equipment_id"),
                equipment_name=equipment_name,
                failure_mode_id=obs_data.get("failure_mode_id"),
                failure_mode_name=failure_mode_name,
                auto_source="failure_mode",
                installation_id=installation_id,
                rpn=threat_doc.get("fmea_rpn"),
                risk_score=threat_doc.get("risk_score"),
                risk_level=threat_doc.get("risk_level"),
            )
            aid = action_doc["id"]
            auto_created.append({"id": aid, "title": desc[:100], "type": ra.get("action_type", "CM")})

    if auto_created:
        from services.work_signal_lifecycle import update_work_signal

        await update_work_signal(
            threat_id,
            user=tenant_user,
            set_fields={"auto_created_action_ids": [a["id"] for a in auto_created]},
            graph_label="chat_auto_actions",
            sync_graph=False,
        )

    asyncio.create_task(update_all_ranks(user_id, user=tenant_user))

    updated = await db.threats.find_one(
        scoped(tenant_user, {"id": threat_id}) if tenant_user else {"id": threat_id},
        {"_id": 0},
    )
    if isinstance(updated.get("risk_score"), float):
        updated["risk_score"] = int(updated["risk_score"])

    cache.invalidate_stats(f"stats:{user_id}")

    return {"threat": updated, "auto_created_actions": auto_created, "threat_id": threat_id}
