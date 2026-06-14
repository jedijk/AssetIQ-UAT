"""
Chat routes — single source of truth state machine.

State lives in `chat_conversations` (one doc per user).
`chat_messages` stores history only, never queried for state.
"""
import re
import uuid
import base64
import io
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, File, HTTPException
from database import db, failure_modes_service
from auth import get_current_user, require_permission
from models.api_models import (
    ChatMessageCreate, ChatResponse, ThreatResponse, VoiceTranscriptionResponse,
)
from ai_helpers import (
    classify_user_intent, get_data_context, answer_data_query, transcribe_audio_with_ai,
    analyze_attachment_image, summarize_issue_description,
    merge_issue_description_with_edit,
    translate_to_english_for_record,
    generate_observation_description,
)
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from chat_handler_v2 import process_chat_message, ChatState, _chat_ui
from services.equipment_search_service import search_equipment_hierarchy
from failure_modes import FAILURE_MODES_LIBRARY
from services.threat_score_service import (
    calculate_rank, update_all_ranks, get_risk_settings_for_installation, calculate_risk_score,
)
from services.cache_service import cache
from utils.auto_translate import translate_observation, translate_action
from services.chat_central_action_service import create_chat_central_action

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Chat"])

_tasks_read = require_permission("tasks:read")

# ---------------------------------------------------------------------------
# Image compression
# ---------------------------------------------------------------------------
MAX_IMAGE_BYTES = 100_000  # ~100KB base64 target

def _fix_orientation(img):
    """Apply EXIF orientation so the image displays correctly after stripping metadata."""
    try:
        from PIL import ImageOps
        return ImageOps.exif_transpose(img)
    except Exception:
        return img

def _compress_image(b64_data: str) -> str:
    """Fix orientation and optionally compress a base64 image for chat storage."""
    try:
        from PIL import Image
        raw = base64.b64decode(b64_data)
        img = Image.open(io.BytesIO(raw))
        img = _fix_orientation(img)

        needs_compress = len(b64_data) > MAX_IMAGE_BYTES or max(img.size) > 800

        if not needs_compress:
            # Re-encode with orientation fix applied
            buf = io.BytesIO()
            rgb = img.convert("RGB") if img.mode != "RGB" else img
            rgb.save(buf, format="JPEG", quality=85, optimize=True)
            return base64.b64encode(buf.getvalue()).decode("utf-8")

        # Resize if very large
        if max(img.size) > 800:
            img.thumbnail((800, 800), Image.LANCZOS)
        # Compress as JPEG
        buf = io.BytesIO()
        rgb = img.convert("RGB") if img.mode != "RGB" else img
        quality = 70
        rgb.save(buf, format="JPEG", quality=quality, optimize=True)
        while buf.tell() > MAX_IMAGE_BYTES * 0.75 and quality > 20:
            quality -= 15
            buf = io.BytesIO()
            rgb.save(buf, format="JPEG", quality=quality, optimize=True)
        result = base64.b64encode(buf.getvalue()).decode("utf-8")
        logger.info(f"Image processed: {len(b64_data)//1024}KB -> {len(result)//1024}KB (q={quality})")
        return result
    except Exception as e:
        logger.warning(f"Image processing failed: {e}")
        return b64_data


# ---------------------------------------------------------------------------
# Language detection (utils/text_language.py)
# ---------------------------------------------------------------------------
from utils.text_language import analyze_text_languages, detect_language, resolve_chat_ui_language


# ---------------------------------------------------------------------------
# Failure mode loader
# ---------------------------------------------------------------------------
async def get_failure_modes_from_db():
    try:
        result = await failure_modes_service.get_all(limit=2000)
        fm = result.get("failure_modes", [])
        if fm:
            logger.info(f"Chat using {len(fm)}/{result.get('total',0)} failure modes from database")
            return fm
    except Exception as e:
        logger.error(f"Failed to fetch failure modes from DB: {e}")
    logger.info(f"Using static FAILURE_MODES_LIBRARY ({len(FAILURE_MODES_LIBRARY)} entries)")
    return FAILURE_MODES_LIBRARY


# ---------------------------------------------------------------------------
# Conversation state helpers (single source of truth: chat_conversations)
# ---------------------------------------------------------------------------
async def _read_conv(user_id: str) -> dict:
    """Read conversation state. Returns empty-ish dict if none exists."""
    doc = await db.chat_conversations.find_one({"user_id": user_id}, {"_id": 0})
    if doc:
        return doc

    # Migration fallback: check chat_messages for state from old system
    msgs = await db.chat_messages.find(
        {"user_id": user_id, "role": "assistant", "chat_state": {"$exists": True, "$ne": None}},
        {"_id": 0, "chat_state": 1, "equipment_suggestions": 1,
         "failure_mode_suggestions": 1, "pending_data": 1,
         "original_message": 1, "awaiting_context_for_threat": 1}
    ).sort("created_at", -1).limit(1).to_list(1)

    if msgs:
        m = msgs[0]
        state = m.get("chat_state")
        if state and state != ChatState.INITIAL:
            logger.info(f"Migrating state '{state}' from chat_messages to chat_conversations")
            migrated = {
                "user_id": user_id,
                "state": state,
                "pending_data": m.get("pending_data", {}),
                "equipment_suggestions": m.get("equipment_suggestions"),
                "failure_mode_suggestions": m.get("failure_mode_suggestions"),
                "original_message": m.get("original_message"),
                "awaiting_context_for_threat": m.get("awaiting_context_for_threat"),
            }
            await db.chat_conversations.update_one(
                {"user_id": user_id}, {"$set": migrated}, upsert=True
            )
            return migrated

    return {"user_id": user_id, "state": ChatState.INITIAL}


async def _write_conv(user_id: str, **fields):
    """Atomically update conversation state."""
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.chat_conversations.update_one(
        {"user_id": user_id}, {"$set": fields}, upsert=True
    )


async def _reset_conv(user_id: str):
    await _write_conv(
        user_id,
        state=ChatState.INITIAL,
        pending_data={},
        equipment_suggestions=None,
        failure_mode_suggestions=None,
        original_message=None,
        awaiting_context_for_threat=None,
        issue_description=None,
        issue_summary=None,
    )


# ---------------------------------------------------------------------------
# Store assistant message helper
# ---------------------------------------------------------------------------
async def _tenant_ctx_for_user(user_id: str) -> Optional[dict]:
    return await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "company_id": 1, "organization_id": 1},
    )


async def _store_assistant_msg(user_id: str, content: str, **extra) -> dict:
    msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "assistant",
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    with_tenant_id(msg, await _tenant_ctx_for_user(user_id))
    await db.chat_messages.insert_one(msg)
    return msg


# ---------------------------------------------------------------------------
# Observation creation
# ---------------------------------------------------------------------------
def _chat_observation_title(equipment_name: str, user_description: str) -> str:
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


async def _create_observation(user_id: str, obs_data: dict, session_id: str,
                              image_thumbnail: str = None, user_description: str = None) -> dict:
    threat_id = str(uuid.uuid4())
    equipment_name = obs_data.get("equipment_name", "Unknown")
    failure_mode_name = obs_data.get("failure_mode_name", "Unknown")

    chat_lang = (obs_data.get("chat_ui_language") or "en").lower()
    
    # Skip slow AI translations - use quick dictionary lookup only
    # Background translation task will handle proper translation later
    if chat_lang in ("nl", "de"):
        # Quick Dutch-English dictionary for common failure modes
        QUICK_FM_TRANSLATE = {
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
        if fm_lower in QUICK_FM_TRANSLATE:
            failure_mode_name = QUICK_FM_TRANSLATE[fm_lower]
        # If not in dictionary, keep original - background task will translate

    fmea_data = obs_data.get("failure_mode", {})
    rpn = fmea_data.get("rpn", 100) if isinstance(fmea_data, dict) else 100
    fmea_score = min(100, int(rpn / 10))

    equipment_type = obs_data.get("equipment_type") or (fmea_data.get("equipment") if isinstance(fmea_data, dict) else None) or "Equipment"
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
    rank, total = await calculate_rank(final_risk_score, user_id)

    observation_title = _chat_observation_title(
        equipment_name,
        user_description or obs_data.get("original_description") or "",
    )

    threat_doc = {
        "id": threat_id,
        "title": observation_title,
        "description": user_description or "",
        "user_context": user_description or "",  # Frontend uses this field for the description display
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
        "status": "Observation",  # New status model: Observation -> Assessment -> Planning -> Learning
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
        threat_doc["attachments"] = [{"type": "image", "data": image_thumbnail,
                                      "created_at": datetime.now(timezone.utc).isoformat()}]

    try:
        result = await db.threats.insert_one(threat_doc)
        logger.info(f"Created threat {threat_id} with {len(threat_doc.get('attachments', []))} attachments")
    except Exception as e:
        logger.error(f"Failed to create threat {threat_id}: {e}")
        raise

    # Skip auto-translation for faster response - can be done manually later if needed
    # asyncio.create_task(
    #     translate_observation(
    #         threat_id,
    #         {
    #             "title": threat_doc.get("title") or threat_doc.get("description", "")[:120],
    #             "description": threat_doc.get("description", "") or "",
    #         },
    #         user_id,
    #     )
    # )

    from services.reliability_graph import dispatch_graph_sync

    asyncio.create_task(
        dispatch_graph_sync(
            "sync_threat_edges",
            "chat_threat_create",
            threat_id=threat_id,
            equipment_id=obs_data.get("equipment_id"),
            failure_mode_id=obs_data.get("failure_mode_id"),
        )
    )

    # Auto-create actions
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
            # Skip auto-translation for faster response
            # asyncio.create_task(
            #     translate_action(
            #         aid,
            #         {
            #             "title": action_doc.get("title", ""),
            #             "description": action_doc.get("description", "") or "",
            #         },
            #         user_id,
            #     )
            # )
            auto_created.append({"id": aid, "title": desc[:100], "type": ra.get("action_type", "CM")})

    if auto_created:
        await db.threats.update_one(
            {"id": threat_id},
            {"$set": {"auto_created_action_ids": [a["id"] for a in auto_created]}}
        )

    # Run rank update in background (non-blocking)
    asyncio.create_task(update_all_ranks(user_id))

    updated = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    if isinstance(updated.get("risk_score"), float):
        updated["risk_score"] = int(updated["risk_score"])

    cache.invalidate_stats(f"stats:{user_id}")

    return {"threat": updated, "auto_created_actions": auto_created, "threat_id": threat_id}


def _issue_confirm_yes(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return False
    if t in {
        "yes", "y", "yeah", "yep", "correct", "ok", "okay", "sure", "fine",
        "ja", "klopt", "akkoord", "precies", "continue", "proceed", "next", "go",
        "accept", "accepteren", "confirm", "bevestig", "bevestigen",
    }:
        return True
    return t.startswith("yes") or t.startswith("ja ") or t.startswith("ja,") or t.startswith("ok ") or t.startswith("accept")


def _issue_confirm_no(text: str) -> bool:
    t = (text or "").strip().lower()
    return t in {
        "no", "nope", "nee", "incorrect", "wrong", "not correct", "klopt niet",
        "revise", "revision", "change", "different", "anders", "aanpassen", "wijzig",
    }


def _issue_confirm_assistant_text(detected_lang: str, summary: str) -> str:
    """Generate confirmation message with professional summary and clear action options."""
    if detected_lang == "nl":
        return (
            f"📋 **Observatie Samenvatting**\n\n"
            f"{summary}\n\n"
            f"---\n"
            f"**Kies een actie:**\n"
            f"• **Accepteren** - Maak de melding aan met bovenstaande gegevens\n"
            f"• **Aanpassen** - Typ uw wijzigingen hieronder\n"
            f"• **Annuleren** - Stop en begin opnieuw"
        )
    return (
        f"📋 **Observation Summary**\n\n"
        f"{summary}\n\n"
        f"---\n"
        f"**Choose an action:**\n"
        f"• **Accept** - Create observation with above details\n"
        f"• **Revise** - Type your changes below\n"
        f"• **Cancel** - Stop and start over"
    )


def _issue_confirm_language_code(detected_lang: str) -> str:
    return "nl" if detected_lang == "nl" else "en"


def _threat_to_response(threat: dict) -> ThreatResponse:
    """Normalize a threat document before Pydantic validation."""
    data = dict(threat or {})
    if isinstance(data.get("risk_score"), float):
        data["risk_score"] = int(data["risk_score"])
    if data.get("recommended_actions") is None:
        data["recommended_actions"] = []
    data.setdefault("rank", 1)
    data.setdefault("total_threats", 1)
    data.setdefault("occurrence_count", 1)
    data.setdefault("impact", "Equipment Damage")
    data.setdefault("frequency", "First Time")
    data.setdefault("likelihood", "Possible")
    data.setdefault("detectability", "Moderate")
    data.setdefault("status", "Observation")  # New status model
    data.setdefault("created_by", "")
    data.setdefault("created_at", datetime.now(timezone.utc).isoformat())
    return ThreatResponse(**data)


def _issue_confirm_ui_lang_from_copy(summary: str, issue_body: str, fallback: str) -> str:
    """
    Match issue-confirm chrome (intro + buttons) to readable language.
    Mixed-language reports use the app/fallback language for buttons.
    """
    blob = f"{summary or ''}\n{issue_body or ''}".strip()
    if len(blob) < 3:
        fb = (fallback or "en").lower()[:2]
        return fb if fb == "nl" else "en"

    profile = analyze_text_languages(blob)
    if profile.get("is_mixed"):
        fb = (fallback or "en").lower()[:2]
        return fb if fb in ("nl", "de") else "en"

    primary = profile.get("primary") or "en"
    if primary == "nl":
        return "nl"
    if primary == "de":
        return "en"
    return "en"


async def _finalize_chat_machine_result(
    user_id: str,
    session_id: str,
    detected_lang: str,
    image_thumbnail: Optional[str],
    result: dict,
    ai_mode: bool = False,
) -> ChatResponse:
    """Persist state + assistant message after `process_chat_message` (observation or in-flow)."""
    new_state = result["state"]
    resp_text = result["response_text"]
    conv = await _read_conv(user_id)
    
    logger.info(f"_save_and_respond: create_observation={result.get('create_observation')}, has_obs_data={bool(result.get('observation_data'))}, ai_mode={ai_mode}")

    if result.get("create_observation") and result.get("observation_data"):
        obs_data = result.get("observation_data") or {}
        
        # Get the original user input for description generation
        original_input = (
            conv.get("issue_description") 
            or conv.get("original_message") 
            or result.get("original_message") 
            or obs_data.get("original_description")
            or ""
        )
        
        # Try to get description from issue_summary first (if summary was generated)
        issue_summary = conv.get("issue_summary") or ""
        parsed_description = ""
        for line in issue_summary.split('\n'):
            if '**Description:**' in line or '**Beschrijving:**' in line:
                parsed_description = line.replace('**Description:**', '').replace('**Beschrijving:**', '').strip()
                break
        
        # If no parsed description from summary, generate one (AI if enabled, else fast)
        if not parsed_description and original_input:
            chat_lang = (obs_data.get("chat_ui_language") or "en").lower()
            parsed_description = await generate_observation_description(
                user_input=original_input,
                equipment_name=obs_data.get("equipment_name"),
                failure_mode=obs_data.get("failure_mode_name"),
                language=chat_lang,
                use_ai=ai_mode,
            )
            logger.info(f"Generated observation description (ai_mode={ai_mode}): {parsed_description[:100]}...")
        
        # Final fallback to original message
        user_description = parsed_description or original_input or ""
        
        obs = await _create_observation(user_id, obs_data,
                                        session_id, image_thumbnail, user_description)
        threat = obs["threat"]
        auto_actions = obs["auto_created_actions"]
        new_threat_id = obs["threat_id"]

        ctx_nl = obs_data.get("chat_ui_language") == "nl"

        actions_info = ""
        if auto_actions:
            if ctx_nl:
                actions_info = f"\n\n**{len(auto_actions)} actie(s) automatisch aangemaakt:**\n"
                for a in auto_actions[:3]:
                    actions_info += f"- {a['title'][:50]}{'...' if len(a['title'])>50 else ''}\n"
                if len(auto_actions) > 3:
                    actions_info += f"- ...en nog {len(auto_actions)-3}\n"
            else:
                actions_info = f"\n\n**{len(auto_actions)} action(s) auto-created:**\n"
                for a in auto_actions[:3]:
                    actions_info += f"- {a['title'][:50]}{'...' if len(a['title'])>50 else ''}\n"
                if len(auto_actions) > 3:
                    actions_info += f"- ...and {len(auto_actions)-3} more\n"

        if ctx_nl:
            context_prompt = (
                f"Melding vastgelegd: **{threat['title']}**{actions_info}\n\n"
                f"Wilt u aanvullende context toevoegen? Dat kan bijvoorbeeld:\n"
                f"- Opmerkingen over wat u heeft gezien\n"
                f"- Temperaturen of metingen\n"
                f"- Omstandigheden (weer, bedrijfstoestand)\n"
                f"- Een foto van het probleem\n\n"
                f"Typ uw opmerkingen of zeg 'skip' om verder te gaan."
            )
        else:
            context_prompt = (
                f"Observation recorded: **{threat['title']}**{actions_info}\n\n"
                f"Would you like to add any additional context? You can:\n"
                f"- Add comments about what you observed\n"
                f"- Provide temperature or measurement readings\n"
                f"- Describe the conditions (weather, operating state)\n"
                f"- Upload a photo of the issue\n\n"
                f"Type your observations or say 'skip' to continue."
            )

        await _write_conv(
            user_id,
            state=ChatState.AWAITING_CONTEXT,
            pending_data={},
            equipment_suggestions=None,
            failure_mode_suggestions=None,
            original_message=None,
            awaiting_context_for_threat=new_threat_id,
            issue_description=None,
            issue_summary=None,
        )

        eq_data = result["observation_data"].get("equipment", {})
        await _store_assistant_msg(
            user_id, context_prompt,
            chat_state=ChatState.AWAITING_CONTEXT,
            threat_id=new_threat_id,
            threat_title=threat["title"],
            threat_asset=threat["asset"],
            threat_equipment_type=threat.get("equipment_type"),
            threat_equipment_tag=eq_data.get("tag"),
            threat_description=threat.get("description", ""),
            threat_risk_level=threat["risk_level"],
            threat_risk_score=threat["risk_score"],
            threat_rank=threat.get("rank"),
            threat_summary=True,
            awaiting_context_for_threat=new_threat_id,
            question_type="context",
        )

        return ChatResponse(
            message=context_prompt,
            threat=_threat_to_response(threat),
            follow_up_question=context_prompt,
            question_type="context",
            awaiting_context_for_threat=new_threat_id,
            detected_language=detected_lang,
            is_mixed_language=bool((obs_data or {}).get("mixed_language_input")),
        )

    await _write_conv(
        user_id,
        state=new_state,
        pending_data=result.get("pending_data", {}),
        equipment_suggestions=result.get("equipment_suggestions"),
        failure_mode_suggestions=result.get("failure_mode_suggestions"),
        original_message=result.get("original_message"),
        awaiting_context_for_threat=None,
    )

    q_type = ("asset" if result.get("equipment_suggestions")
              else ("failure" if result.get("failure_mode_suggestions") is not None else None))

    await _store_assistant_msg(
        user_id, resp_text,
        chat_state=new_state,
        pending_data=result.get("pending_data", {}),
        equipment_suggestions=result.get("equipment_suggestions"),
        failure_mode_suggestions=result.get("failure_mode_suggestions"),
        show_new_failure_mode_option=result.get("show_new_failure_mode_option"),
        question_type=q_type,
        original_message=result.get("original_message"),
    )

    return ChatResponse(
        message=resp_text,
        follow_up_question=resp_text if new_state != ChatState.COMPLETE else None,
        question_type=q_type,
        equipment_suggestions=result.get("equipment_suggestions"),
        failure_mode_suggestions=result.get("failure_mode_suggestions"),
        show_new_failure_mode_option=result.get("show_new_failure_mode_option"),
        detected_language=detected_lang,
        is_mixed_language=bool((result.get("pending_data") or {}).get("mixed_language_input")),
    )


# ---------------------------------------------------------------------------
# Core chat processing (shared by text and voice endpoints)
# ---------------------------------------------------------------------------
async def _core_chat_process(user_id: str, content: str, session_id: str,
                             detected_lang: str, image_base64: str = None, ai_mode: bool = False):
    """
    Central chat processing used by both /chat/send and /chat/voice-send.
    Returns a ChatResponse-compatible dict.
    
    ai_mode: When True, enables AI-powered description generation and better
             language detection (slower). When False, uses fast text processing.
    """
    logger.info(f"=== CHAT REQUEST === user={user_id}, content={content[:50] if content else 'None'}..., ai_mode={ai_mode}")
    
    image_thumbnail = None
    if image_base64:
        image_thumbnail = _compress_image(image_base64)
    
    # 0. Stale control signals — when the conversation is INITIAL (no active prompt),
    # silently swallow command words like "skip", "cancel", "yes", "no", "ok".
    # These usually mean an earlier auto-skip/double-click fired after the active
    # context had already ended. Without this guard the bot stores "skip" in
    # history AND treats it as a new observation, producing duplicate or
    # nonsensical messages like 'Here is what I understood: skip'.
    _content_lc = (content or "").strip().lower()
    _ignored_commands = {
        "skip", "cancel", "yes", "y", "no", "n", "ok", "okay",
        "revise", "ja", "nee", "klopt", "akkoord",
    }
    if not image_base64 and _content_lc in _ignored_commands:
        _conv_peek = await _read_conv(user_id)
        if _conv_peek.get("state", ChatState.INITIAL) == ChatState.INITIAL:
            # Neither store the user message nor reply — keep the UI clean.
            return ChatResponse(message="", detected_language=detected_lang, is_mixed_language=None)

    # 1. Store user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "user",
        "content": content,
        "has_image": image_base64 is not None,
        "image_data": image_thumbnail,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with_tenant_id(user_msg, await _tenant_ctx_for_user(user_id))
    await db.chat_messages.insert_one(user_msg)

    # 2. Read conversation state (single source of truth)
    conv = await _read_conv(user_id)
    state = conv.get("state", ChatState.INITIAL)
    pending_data = dict(conv.get("pending_data") or {})
    low = content.strip().lower()
    short_cmd = (
        low
        in {
            "yes", "y", "yeah", "yep", "ja", "ja,", "skip", "revise", "no", "nee",
            "cancel", "ok", "okay", "klopt", "akkoord",
        }
        or len(content.strip()) < 4
    )
    sticky_ul = conv.get("chat_ui_language")
    explicit_ul = (detected_lang or "").lower()[:2] if detected_lang else None
    if explicit_ul not in ("nl", "en", "de"):
        explicit_ul = None
    ul, lang_profile = resolve_chat_ui_language(
        content,
        explicit=explicit_ul,
        fallback=explicit_ul or sticky_ul or "en",
        sticky=sticky_ul,
        short_command=short_cmd,
    )
    pending_data["chat_ui_language"] = ul
    if lang_profile.get("is_mixed"):
        pending_data["mixed_language_input"] = True
    await _write_conv(user_id, chat_ui_language=ul)
    ui_is_nl = ul == "nl"
    is_mixed_language = bool(lang_profile.get("is_mixed"))
    original_message = conv.get("original_message")
    eq_suggestions = conv.get("equipment_suggestions") or []
    fm_suggestions = conv.get("failure_mode_suggestions") or []
    threat_id = conv.get("awaiting_context_for_threat")

    from database import get_current_db_name
    logger.info(f"Chat: db={get_current_db_name()}, user={user_id[:20]}, state={state}, msg='{content[:50]}'")

    # ------------------------------------------------------------------
    # 3. Issue description summary / confirm (before equipment & failure modes)
    # ------------------------------------------------------------------
    if state == ChatState.AWAITING_ISSUE_CONFIRM:
        issue_desc = (conv.get("issue_description") or "").strip()
        if content.strip().lower() == "cancel":
            await _reset_conv(user_id)
            reply = (
                "Geannuleerd. Wat wilt u melden?"
                if ui_is_nl
                else "Cancelled. What would you like to report?"
            )
            await _store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
            return ChatResponse(message=reply, detected_language=detected_lang, is_mixed_language=is_mixed_language or None)

        if _issue_confirm_yes(content):
            if not issue_desc:
                await _reset_conv(user_id)
                reply = (
                    "Begin opnieuw met een korte beschrijving van het probleem."
                    if ui_is_nl
                    else "Please start again with a short description of the issue."
                )
                await _store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
                return ChatResponse(message=reply, detected_language=detected_lang, is_mixed_language=is_mixed_language or None)
            await _write_conv(user_id, issue_description=None, issue_summary=None)
            fm_library = await get_failure_modes_from_db()
            pd = {
                **pending_data,
                "original_description": issue_desc,
                "issue_description": issue_desc,
            }
            result = await process_chat_message(
                db=db,
                user_id=user_id,
                message_content=issue_desc,
                failure_modes_library=fm_library,
                current_state=ChatState.INITIAL,
                pending_data=pd,
                prev_equipment_suggestions=[],
                prev_failure_mode_suggestions=[],
                original_message=issue_desc,
                ui_language=detected_lang,
            )
            return await _finalize_chat_machine_result(
                user_id, session_id, detected_lang, image_thumbnail, result, ai_mode
            )

        if _issue_confirm_no(content):
            await _write_conv(
                user_id,
                state=ChatState.AWAITING_ISSUE_DESCRIPTION,
                issue_description=None,
                issue_summary=None,
            )
            reply = (
                "Geef het probleem opnieuw kort met eigen woorden."
                if ui_is_nl
                else "Please describe the issue again in your own words."
            )
            await _store_assistant_msg(
                user_id, reply,
                chat_state=ChatState.AWAITING_ISSUE_DESCRIPTION,
                question_type="issue_redescribe",
            )
            return ChatResponse(
                message=reply,
                follow_up_question=reply,
                question_type="issue_redescribe",
                detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            )

        prior_summary = (conv.get("issue_summary") or "").strip()
        if issue_desc:
            merged = await merge_issue_description_with_edit(
                issue_desc, prior_summary, content, detected_lang
            )
            updated_issue = (merged or "").strip() or content.strip()
        else:
            updated_issue = content.strip()

        summary = await summarize_issue_description(updated_issue, detected_lang)
        await _write_conv(
            user_id,
            state=ChatState.AWAITING_ISSUE_CONFIRM,
            issue_description=updated_issue,
            issue_summary=summary,
        )
        ic_ui_lang = _issue_confirm_ui_lang_from_copy(
            summary, updated_issue, pending_data.get("chat_ui_language") or detected_lang
        )
        reply = _issue_confirm_assistant_text(ic_ui_lang, summary)
        ic_lang = _issue_confirm_language_code(ic_ui_lang)
        await _store_assistant_msg(
            user_id, reply,
            chat_state=ChatState.AWAITING_ISSUE_CONFIRM,
            question_type="issue_confirm",
            issue_summary=summary,
            issue_confirm_language=ic_lang,
        )
        return ChatResponse(
            message=reply,
            follow_up_question=reply,
            question_type="issue_confirm",
            detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            issue_summary=summary,
            issue_confirm_language=ic_lang,
        )

    if state == ChatState.AWAITING_ISSUE_DESCRIPTION:
        if content.strip().lower() == "cancel":
            await _reset_conv(user_id)
            reply = (
                "Geannuleerd. Wat wilt u melden?"
                if ui_is_nl
                else "Cancelled. What would you like to report?"
            )
            await _store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
            return ChatResponse(message=reply, detected_language=detected_lang, is_mixed_language=is_mixed_language or None)
        summary = await summarize_issue_description(content, detected_lang)
        await _write_conv(
            user_id,
            state=ChatState.AWAITING_ISSUE_CONFIRM,
            issue_description=content,
            issue_summary=summary,
        )
        ic_ui_lang = _issue_confirm_ui_lang_from_copy(
            summary, content, pending_data.get("chat_ui_language") or detected_lang
        )
        reply = _issue_confirm_assistant_text(ic_ui_lang, summary)
        ic_lang = _issue_confirm_language_code(ic_ui_lang)
        await _store_assistant_msg(
            user_id, reply,
            chat_state=ChatState.AWAITING_ISSUE_CONFIRM,
            question_type="issue_confirm",
            issue_summary=summary,
            issue_confirm_language=ic_lang,
        )
        return ChatResponse(
            message=reply,
            follow_up_question=reply,
            question_type="issue_confirm",
            detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            issue_summary=summary,
            issue_confirm_language=ic_lang,
        )

    # ------------------------------------------------------------------
    # 4. AWAITING_CONTEXT — handle context/skip (highest priority)
    # ------------------------------------------------------------------
    if state == ChatState.AWAITING_CONTEXT:
        analysis = None
        skip_phrases = {"skip", "no", "done", "next", "nee", "klaar", "volgende"}
        is_skip = content.strip().lower() in skip_phrases

        if not is_skip and threat_id:
            ctx = {"user_context": content, "context_added_at": datetime.now(timezone.utc).isoformat()}
            if image_base64:
                att = {"type": "image", "data": image_thumbnail,
                       "description": content, "created_at": datetime.now(timezone.utc).isoformat()}
                await db.threats.update_one({"id": threat_id}, {"$set": ctx, "$push": {"attachments": att}})

                # AI image analysis — analyze photo and update threat with findings
                threat_doc = await db.threats.find_one({"id": threat_id}, {"_id": 0, "title": 1, "asset": 1, "failure_mode": 1})
                threat_context = f"{threat_doc.get('title', '')} — {threat_doc.get('asset', '')} — {threat_doc.get('failure_mode', '')}" if threat_doc else content
                analysis = await analyze_attachment_image(image_thumbnail, threat_context)
                if analysis:
                    analysis_update = {
                        "image_analysis": analysis,
                        "image_analysis_at": datetime.now(timezone.utc).isoformat(),
                    }
                    if analysis.get("severity"):
                        sev = analysis["severity"].lower()
                        if sev in ("critical", "high"):
                            analysis_update["ai_severity"] = sev
                    
                    # Build AI analysis text to append to description
                    ai_analysis_parts = []
                    if analysis.get("image_description"):
                        ai_analysis_parts.append(f"AI Photo Analysis: {analysis['image_description']}")
                    if analysis.get("visible_damage"):
                        ai_analysis_parts.append("Visible damage: " + "; ".join(analysis["visible_damage"]))
                    if analysis.get("safety_concerns"):
                        ai_analysis_parts.append("Safety concerns: " + "; ".join(analysis["safety_concerns"]))
                    
                    # Merge AI analysis into description field
                    if ai_analysis_parts:
                        ai_analysis_text = "\n".join(ai_analysis_parts)
                        # Get current description and append AI analysis
                        current_threat = await db.threats.find_one({"id": threat_id}, {"_id": 0, "description": 1})
                        current_desc = (current_threat or {}).get("description", "") or ""
                        if current_desc:
                            new_desc = f"{current_desc}\n\n{ai_analysis_text}"
                        else:
                            new_desc = ai_analysis_text
                        analysis_update["description"] = new_desc
                    
                    await db.threats.update_one({"id": threat_id}, {"$set": analysis_update})

                    # Create actions from AI recommendations
                    ai_actions = analysis.get("recommended_actions", [])
                    created_action_ids = []
                    threat_full = await db.threats.find_one(
                        {"id": threat_id},
                        {
                            "_id": 0,
                            "title": 1,
                            "asset": 1,
                            "linked_equipment_id": 1,
                            "installation_id": 1,
                            "fmea_rpn": 1,
                            "risk_score": 1,
                            "risk_level": 1,
                        },
                    )
                    for ra in ai_actions:
                        action_desc = ra.get("action", "")
                        if not action_desc:
                            continue
                        action_doc = await create_chat_central_action(
                            user_id=user_id,
                            threat_id=threat_id,
                            threat_title=(threat_full or threat_doc or {}).get("title", ""),
                            title=action_desc[:200],
                            description=action_desc,
                            action_type=ra.get("type", "CM"),
                            discipline=ra.get("discipline", "Mechanical"),
                            priority=ra.get("priority", "medium"),
                            linked_equipment_id=(threat_full or {}).get("linked_equipment_id"),
                            equipment_name=(threat_full or threat_doc or {}).get("asset"),
                            auto_source="image_analysis",
                            installation_id=(threat_full or {}).get("installation_id"),
                            rpn=(threat_full or {}).get("fmea_rpn"),
                            risk_score=(threat_full or {}).get("risk_score"),
                            risk_level=(threat_full or {}).get("risk_level"),
                        )
                        aid = action_doc["id"]
                        asyncio.create_task(
                            translate_action(
                                aid,
                                {
                                    "title": action_doc.get("title", ""),
                                    "description": action_doc.get("description", "") or "",
                                },
                                user_id,
                            )
                        )
                        created_action_ids.append(aid)

                    if created_action_ids:
                        await db.threats.update_one(
                            {"id": threat_id},
                            {"$push": {"auto_created_action_ids": {"$each": created_action_ids}}}
                        )
            else:
                await db.threats.update_one({"id": threat_id}, {"$set": ctx})

        # Build reply and determine next state
        if is_skip:
            # User explicitly skipped - reset and move on
            await _reset_conv(user_id)
            reply = (
                "Begrepen! Uw melding is opgeslagen. Wat wilt u nog melden?"
                if ui_is_nl
                else "Got it! Your observation has been saved. What else would you like to report?"
            )
            await _store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
            return ChatResponse(message=reply, detected_language=detected_lang, is_mixed_language=is_mixed_language or None)
        
        # User added context - ask for more context (keep skip timer running)
        if image_base64 and analysis:
            if ui_is_nl:
                parts = ["Bedankt! Ik heb uw foto toegevoegd aan de melding."]
                desc = analysis.get("image_description")
                if desc:
                    parts.append(f"\n\n**Beeldanalyse:** {desc}")
                severity = analysis.get("severity")
                if severity:
                    parts.append(f"\n**Ingeschatte ernst:** {severity.capitalize()}")
                safety = analysis.get("safety_concerns", [])
                if safety:
                    parts.append("\n**Veiligheid:** " + "; ".join(safety))
                ai_actions = analysis.get("recommended_actions", [])
                if ai_actions:
                    parts.append(f"\n\n**{len(ai_actions)} actie(s) aangemaakt op basis van de foto:**")
                    for a in ai_actions[:3]:
                        parts.append(f"- [{a.get('priority','').capitalize()}] {a.get('action','')[:80]}")
                parts.append(
                    "\n\n**Wilt u nog foto's of aanvullende context toevoegen?** "
                    "U kunt overslaan als u klaar bent."
                )
            else:
                parts = ["Thanks! I've added your photo to the observation."]
                desc = analysis.get("image_description")
                if desc:
                    parts.append(f"\n\n**Image analysis:** {desc}")
                severity = analysis.get("severity")
                if severity:
                    parts.append(f"\n**Assessed severity:** {severity.capitalize()}")
                safety = analysis.get("safety_concerns", [])
                if safety:
                    parts.append("\n**Safety concerns:** " + "; ".join(safety))
                ai_actions = analysis.get("recommended_actions", [])
                if ai_actions:
                    parts.append(f"\n\n**{len(ai_actions)} action(s) created from photo analysis:**")
                    for a in ai_actions[:3]:
                        parts.append(f"- [{a.get('priority','').capitalize()}] {a.get('action','')[:80]}")
                parts.append("\n\n**Would you like to add more photos or context?** You can skip if you're done.")
            reply = "".join(parts)
        elif image_base64:
            reply = (
                "Bedankt! Ik heb uw foto toegevoegd aan de melding.\n\n"
                "**Wilt u nog foto's of aanvullende context toevoegen?** U kunt overslaan als u klaar bent."
                if ui_is_nl
                else (
                    "Thanks! I've added your photo to the observation.\n\n"
                    "**Would you like to add more photos or context?** You can skip if you're done."
                )
            )
        else:
            reply = (
                "Bedankt! Ik heb uw aanvullende tekst toegevoegd aan de melding.\n\n"
                "**Wilt u nog foto's of aanvullende context toevoegen?** U kunt overslaan als u klaar bent."
                if ui_is_nl
                else (
                    "Thanks! I've added your context to the observation.\n\n"
                    "**Would you like to add more photos or context?** You can skip if you're done."
                )
            )

        # Keep awaiting_context state so skip timer runs
        await _write_conv(
            user_id,
            state=ChatState.AWAITING_CONTEXT,
            pending_data={},
            awaiting_context_for_threat=threat_id,
        )
        await _store_assistant_msg(
            user_id, reply,
            chat_state="awaiting_context",
            awaiting_context_for_threat=threat_id,
            question_type="context",
        )
        return ChatResponse(
            message=reply,
            follow_up_question=reply,
            question_type="context",
            awaiting_context_for_threat=threat_id,
            detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
        )

    # ------------------------------------------------------------------
    # 5. Intent classification (only in INITIAL, no image, not in-flow)
    # ------------------------------------------------------------------
    in_flow = state in {
        ChatState.AWAITING_ISSUE_CONFIRM,
        ChatState.AWAITING_ISSUE_DESCRIPTION,
        ChatState.AWAITING_EQUIPMENT,
        ChatState.AWAITING_FAILURE_MODE,
        ChatState.AWAITING_NEW_FAILURE_MODE,
    }
    
    logger.info(f"Chat flow check: state={state}, in_flow={in_flow}, has_image={bool(image_base64)}")
    
    if state == ChatState.INITIAL and not in_flow and not image_base64:
        # Quick check: Skip intent classification if message looks like an issue report
        # This saves ~1-2 seconds of AI call time
        content_lower = content.lower()
        issue_keywords = [
            # English
            "broken", "overheating", "leaking", "noise", "vibration", "failure", 
            "issue", "problem", "defect", "damage", "fault", "error", "malfunction",
            "reporting", "report", "equipment", "hot", "cold", "high", "low",
            # Dutch
            "kapot", "lek", "storing", "defect", "probleem", "schade", "fout",
            "temperatuur", "hoog", "laag", "warm", "koud", "geluid", "trilling",
            "melding", "apparaat", "machine", "motor", "pomp", "falen",
            "oververhitting", "lekkage", "slijtage", "breuk",
        ]
        looks_like_issue = any(kw in content_lower for kw in issue_keywords)
        
        # Only run intent classification if it doesn't look like an issue report
        if not looks_like_issue:
            intent = await classify_user_intent(content, session_id)
            if intent.get("is_data_query") and intent.get("confidence", 0) > 0.6:
                data_ctx = await get_data_context(user_id, intent.get("entities"))
                answer = (await answer_data_query(content, session_id, data_ctx)).get(
                    "answer", "I couldn't find the information you're looking for."
                )
                await _store_assistant_msg(user_id, answer, chat_state=ChatState.INITIAL, is_data_query=True)
                return ChatResponse(message=answer, question_type="data_query", detected_language=detected_lang, is_mixed_language=is_mixed_language or None)

        # ------------------------------------------------------------------
        # Check equipment confidence BEFORE summary
        # If no high-confidence equipment match, ask user to select first
        # ------------------------------------------------------------------
        eq_matches = await search_equipment_hierarchy(db, content, user_id, ui_language=ul)
        
        # Check if the TOP match has high confidence (>= 80%)
        # This covers both single matches and cases where exact tag gives 100% confidence
        has_high_confidence_match = (
            len(eq_matches) >= 1 and eq_matches[0].get("confidence", 0) >= 80
        )
        
        if eq_matches and not has_high_confidence_match:
            # Low-confidence matches - ask for equipment selection FIRST
            logger.info(f"Chat: {len(eq_matches)} equipment matches, top confidence={eq_matches[0].get('confidence', 0)}%, asking user to select first")
            await _write_conv(
                user_id,
                state=ChatState.AWAITING_EQUIPMENT,
                pending_data={"original_description": content, "chat_ui_language": ul},
                equipment_suggestions=eq_matches,
                failure_mode_suggestions=None,
                original_message=content,
                awaiting_context_for_threat=None,
                issue_description=content,
                issue_summary=None,
            )
            reply = _chat_ui(
                ul,
                "Which equipment? Please select:",
                "Welk stuk apparatuur bedoelt u? Maak een keuze:",
                "Welche Anlage? Bitte auswählen:",
            )
            await _store_assistant_msg(
                user_id, reply,
                chat_state=ChatState.AWAITING_EQUIPMENT,
                question_type="equipment_select",
                equipment_suggestions=eq_matches,
            )
            return ChatResponse(
                message=reply,
                follow_up_question=reply,
                question_type="equipment_select",
                equipment_suggestions=eq_matches,
                detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            )
        
        if not eq_matches:
            # NO equipment matches found - ask user to specify equipment
            logger.info("Chat: No equipment matches found, asking user to specify equipment")
            await _write_conv(
                user_id,
                state=ChatState.AWAITING_EQUIPMENT,
                pending_data={"original_description": content, "chat_ui_language": ul},
                equipment_suggestions=[],
                failure_mode_suggestions=None,
                original_message=content,
                awaiting_context_for_threat=None,
                issue_description=content,
                issue_summary=None,
            )
            reply = (
                "Ik kon de apparatuur niet vinden. Geef de naam of tag van de apparatuur op:"
                if ui_is_nl
                else "I couldn't find that equipment. Please specify the equipment name or tag:"
            )
            await _store_assistant_msg(
                user_id, reply,
                chat_state=ChatState.AWAITING_EQUIPMENT,
                question_type="equipment_input",
                equipment_suggestions=[],
            )
            return ChatResponse(
                message=reply,
                follow_up_question=reply,
                question_type="equipment_input",
                equipment_suggestions=[],
                detected_language=detected_lang,
            is_mixed_language=is_mixed_language or None,
            )

        # High-confidence match - auto-select equipment and proceed to observation creation
        if has_high_confidence_match:
            selected_equipment = eq_matches[0]
            logger.info(f"Chat: Auto-selected equipment with {selected_equipment.get('confidence')}% confidence: {selected_equipment.get('name')} ({selected_equipment.get('tag')})")
            
            # Get failure modes library and auto-select failure mode
            fm_library = await db.failure_modes.find({}, {"_id": 0}).to_list(1000)
            
            # Use chat_handler_v2 to process and auto-select failure mode
            result = await process_chat_message(
                db=db,
                user_id=user_id,
                message_content=selected_equipment.get("name", ""),  # Select equipment by name
                failure_modes_library=fm_library,
                current_state=ChatState.AWAITING_EQUIPMENT,
                pending_data={"original_description": content, "chat_ui_language": ul},
                prev_equipment_suggestions=[selected_equipment],
                prev_failure_mode_suggestions=[],
                original_message=content,
            )
            
            # Process the result through _finalize_chat_machine_result if observation should be created
            return await _finalize_chat_machine_result(user_id, session_id, detected_lang, None, result, ai_mode)

    # ------------------------------------------------------------------
    # 6. Process with state machine (equipment / failure mode flow)
    # ------------------------------------------------------------------
    fm_library = await get_failure_modes_from_db()

    result = await process_chat_message(
        db=db,
        user_id=user_id,
        message_content=content,
        failure_modes_library=fm_library,
        current_state=state,
        pending_data=pending_data,
        prev_equipment_suggestions=eq_suggestions,
        prev_failure_mode_suggestions=fm_suggestions,
        original_message=original_message,
        ui_language=detected_lang,
    )

    return await _finalize_chat_machine_result(
        user_id, session_id, detected_lang, image_thumbnail, result, ai_mode
    )


# ===========================================================================
# Endpoints
# ===========================================================================

@router.post("/chat/send", response_model=ChatResponse)
async def send_chat_message(
    message: ChatMessageCreate,
    current_user: dict = Depends(require_permission("tasks:read")),
):
    session_id = f"user_{current_user['id']}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    detected_lang = message.language or detect_language(message.content)
    try:
        return await _core_chat_process(
            current_user["id"], message.content, session_id, detected_lang, 
            message.image_base64, message.ai_mode
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "chat/send failed for user %s: %s",
            current_user.get("id"),
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail="Chat processing failed. Please try again.",
        ) from exc


@router.get("/chat/history")
async def get_chat_history(limit: int = 50, current_user: dict = Depends(_tasks_read)):
    messages = await db.chat_messages.find(
        merge_tenant_filter({"user_id": current_user["id"]}, current_user),
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(messages))


@router.delete("/chat/clear")
async def clear_chat_history(current_user: dict = Depends(require_permission("tasks:read"))):
    user_id = current_user["id"]
    result = await db.chat_messages.delete_many(
        merge_tenant_filter({"user_id": user_id}, current_user)
    )
    await db.chat_conversations.delete_many({"user_id": user_id})
    return {"success": True, "deleted_messages": result.deleted_count, "message": "Chat history cleared"}


@router.post("/chat/cancel")
async def cancel_chat_flow(current_user: dict = Depends(require_permission("tasks:read"))):
    user_id = current_user["id"]
    conv = await _read_conv(user_id)
    ui_nl = conv.get("chat_ui_language") == "nl"
    await _reset_conv(user_id)
    msg = (
        "Geannuleerd. Wat wilt u melden?"
        if ui_nl
        else "Cancelled. What would you like to report?"
    )
    await _store_assistant_msg(user_id, msg, chat_state=ChatState.INITIAL)
    return {"success": True, "message": "Cancelled"}


# ===========================================================================
# Voice endpoints
# ===========================================================================

@router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(audio_base64: str = Form(...),
                           current_user: dict = Depends(require_permission("tasks:read"))):
    text = await transcribe_audio_with_ai(
        audio_base64,
        user_id=current_user.get("id", "system"),
        company_id=current_user.get("company_id")
        or current_user.get("organization_id")
        or "default",
        installation_id=current_user.get("installation_id"),
        installation_name=current_user.get("installation"),
    )
    return VoiceTranscriptionResponse(text=text)


@router.post("/chat/voice-send")
async def voice_send(
    audio: bytes = File(...),
    language: Optional[str] = Form(None),
    transcribe_only: Optional[str] = Form(None),
    current_user: dict = Depends(require_permission("tasks:read")),
):
    """Transcribe audio then optionally process as chat message.
    
    If transcribe_only=true, only transcribe and return the text without processing.
    This allows combining voice with typed text before sending.
    """
    user_id = current_user["id"]
    session_id = f"user_{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"

    audio_b64 = base64.b64encode(audio).decode("utf-8")
    transcribed = await transcribe_audio_with_ai(
        audio_b64,
        user_id=user_id,
        company_id=current_user.get("company_id")
        or current_user.get("organization_id")
        or "default",
        installation_id=current_user.get("installation_id"),
        installation_name=current_user.get("installation"),
        language=language,
    )

    if not transcribed or not transcribed.strip():
        return {"message": "Could not transcribe voice - no text detected",
                "transcribed_text": "", "detected_language": None}

    detected_lang = language or detect_language(transcribed)

    # If transcribe_only, just return the transcription without processing
    if transcribe_only and transcribe_only.lower() == "true":
        return {
            "message": "Transcription complete",
            "transcribed_text": transcribed,
            "detected_language": detected_lang,
        }

    # Reuse the same core processing as text chat
    resp = await _core_chat_process(user_id, transcribed, session_id, detected_lang)

    return {
        "message": resp.message,
        "transcribed_text": transcribed,
        "detected_language": detected_lang,
        "follow_up_question": resp.follow_up_question,
        "question_type": resp.question_type,
        "equipment_suggestions": resp.equipment_suggestions,
        "failure_mode_suggestions": resp.failure_mode_suggestions,
        "show_new_failure_mode_option": resp.show_new_failure_mode_option,
        "threat": resp.threat,
        "issue_summary": resp.issue_summary,
        "issue_confirm_language": resp.issue_confirm_language,
    }
