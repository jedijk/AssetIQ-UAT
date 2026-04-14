"""
Chat routes — single source of truth state machine.

State lives in `chat_conversations` (one doc per user).
`chat_messages` stores history only, never queried for state.
"""
import re
import uuid
import base64
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, File
from database import db, failure_modes_service
from auth import get_current_user
from models.api_models import (
    ChatMessageCreate, ChatResponse, ThreatResponse, VoiceTranscriptionResponse,
)
from ai_helpers import (
    classify_user_intent, get_data_context, answer_data_query, transcribe_audio_with_ai,
)
from chat_handler_v2 import (
    process_chat_message, ChatState, message_looks_like_equipment,
    extract_tag_from_message, lookup_equipment_by_tag,
)
from failure_modes import FAILURE_MODES_LIBRARY
from services.threat_score_service import (
    calculate_rank, update_all_ranks, get_risk_settings_for_installation, calculate_risk_score,
)
from services.cache_service import cache

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Chat"])

# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------
_LANG_WORDS = {
    "nl": {"de", "het", "een", "is", "van", "en", "in", "dat", "niet", "op",
           "te", "zijn", "voor", "met", "aan", "er", "ook", "maar", "als",
           "nog", "wel", "geen", "moet", "wordt", "kan", "naar", "bij", "dit",
           "wat", "meer", "uit", "over", "zo", "dan", "hun", "werd", "heeft",
           "hoe", "nee", "ja", "kapot", "stuk", "lek", "pomp", "klep",
           "sensor", "storing", "onderhoud", "controleer", "draait"},
}

def detect_language(text: str) -> str:
    words = set(text.lower().split())
    if len(words) < 2:
        return "en"
    scores = {lang: len(words & lw) for lang, lw in _LANG_WORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] >= 2 else "en"


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
    )


# ---------------------------------------------------------------------------
# Store assistant message helper
# ---------------------------------------------------------------------------
async def _store_assistant_msg(user_id: str, content: str, **extra) -> dict:
    msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "assistant",
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    await db.chat_messages.insert_one(msg)
    return msg


# ---------------------------------------------------------------------------
# Observation creation
# ---------------------------------------------------------------------------
async def _create_observation(user_id: str, obs_data: dict, session_id: str,
                              image_thumbnail: str = None) -> dict:
    threat_id = str(uuid.uuid4())
    equipment_name = obs_data.get("equipment_name", "Unknown")
    failure_mode_name = obs_data.get("failure_mode_name", "Unknown")

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
        criticality_score = min(100, int(((s * 25) + (p * 20) + (e * 15) + (r * 10)) / 3.5))

    risk_settings = await get_risk_settings_for_installation(installation_id)
    final_risk_score, risk_level = calculate_risk_score(criticality_score, fmea_score, risk_settings)
    rank, total = await calculate_rank(final_risk_score, user_id)

    threat_doc = {
        "id": threat_id,
        "title": f"{equipment_name} - {failure_mode_name}",
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
        "status": "Open",
        "recommended_actions": obs_data.get("recommended_actions", (fmea_data.get("recommended_actions", []) if isinstance(fmea_data, dict) else [])),
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

    await db.threats.insert_one(threat_doc)

    # Auto-create actions
    auto_created = []
    rec_actions = obs_data.get("recommended_actions", [])
    if not rec_actions and isinstance(fmea_data, dict):
        rec_actions = fmea_data.get("recommended_actions", [])

    for ra in rec_actions:
        if isinstance(ra, dict) and ra.get("auto_create"):
            aid = str(uuid.uuid4())
            desc = ra.get("action") or ra.get("description", "")
            action_doc = {
                "id": aid, "title": desc[:200], "description": desc,
                "status": "Open", "priority": "Medium",
                "type": ra.get("action_type", "CM"),
                "discipline": ra.get("discipline", "Mechanical"),
                "threat_id": threat_id, "threat_title": threat_doc["title"],
                "auto_created_from_failure_mode": True,
                "failure_mode_id": obs_data.get("failure_mode_id"),
                "failure_mode_name": failure_mode_name,
                "created_by": user_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "installation_id": installation_id,
            }
            await db.actions.insert_one(action_doc)
            auto_created.append({"id": aid, "title": desc[:100], "type": ra.get("action_type", "CM")})

    if auto_created:
        await db.threats.update_one(
            {"id": threat_id},
            {"$set": {"auto_created_action_ids": [a["id"] for a in auto_created]}}
        )

    await update_all_ranks(user_id)

    updated = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    if isinstance(updated.get("risk_score"), float):
        updated["risk_score"] = int(updated["risk_score"])

    cache.invalidate_stats(f"stats:{user_id}")

    return {"threat": updated, "auto_created_actions": auto_created, "threat_id": threat_id}


# ---------------------------------------------------------------------------
# Core chat processing (shared by text and voice endpoints)
# ---------------------------------------------------------------------------
async def _core_chat_process(user_id: str, content: str, session_id: str,
                             detected_lang: str, image_base64: str = None):
    """
    Central chat processing used by both /chat/send and /chat/voice-send.
    Returns a ChatResponse-compatible dict.
    """
    image_thumbnail = None
    if image_base64:
        image_thumbnail = image_base64[:50000] if len(image_base64) > 50000 else image_base64

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
    await db.chat_messages.insert_one(user_msg)

    # 2. Read conversation state (single source of truth)
    conv = await _read_conv(user_id)
    state = conv.get("state", ChatState.INITIAL)
    pending_data = conv.get("pending_data", {})
    original_message = conv.get("original_message")
    eq_suggestions = conv.get("equipment_suggestions") or []
    fm_suggestions = conv.get("failure_mode_suggestions") or []
    threat_id = conv.get("awaiting_context_for_threat")

    from database import get_current_db_name
    logger.info(f"Chat: db={get_current_db_name()}, user={user_id[:20]}, state={state}, msg='{content[:50]}'")

    # ------------------------------------------------------------------
    # 3. AWAITING_CONTEXT — handle context/skip (highest priority)
    # ------------------------------------------------------------------
    if state == ChatState.AWAITING_CONTEXT:
        skip_phrases = {"skip", "no", "done", "next", "nee", "klaar", "volgende"}
        is_skip = content.strip().lower() in skip_phrases

        if not is_skip and threat_id:
            ctx = {"user_context": content, "context_added_at": datetime.now(timezone.utc).isoformat()}
            if image_base64:
                att = {"type": "image", "data": image_thumbnail,
                       "description": content, "created_at": datetime.now(timezone.utc).isoformat()}
                await db.threats.update_one({"id": threat_id}, {"$set": ctx, "$push": {"attachments": att}})
            else:
                await db.threats.update_one({"id": threat_id}, {"$set": ctx})

        # Reset state
        await _reset_conv(user_id)

        reply = ("Thanks! I've added your context to the observation"
                 + (" along with the photo" if image_base64 and not is_skip else "")
                 + ". What else would you like to report?"
                 if not is_skip
                 else "Got it! Your observation has been saved. What else would you like to report?")

        await _store_assistant_msg(user_id, reply, chat_state=ChatState.INITIAL)
        return ChatResponse(message=reply, detected_language=detected_lang)

    # ------------------------------------------------------------------
    # 4. Race-condition guard: message looks like equipment but state is INITIAL
    # ------------------------------------------------------------------
    is_equip_format = message_looks_like_equipment(content)
    if state == ChatState.INITIAL and is_equip_format:
        logger.info("Equipment format detected with state=INITIAL, forcing AWAITING_EQUIPMENT")
        state = ChatState.AWAITING_EQUIPMENT

    # ------------------------------------------------------------------
    # 5. Intent classification (only in INITIAL, no image, not in-flow)
    # ------------------------------------------------------------------
    in_flow = state in {ChatState.AWAITING_EQUIPMENT, ChatState.AWAITING_FAILURE_MODE,
                        ChatState.AWAITING_NEW_FAILURE_MODE}
    if state == ChatState.INITIAL and not in_flow and not image_base64:
        intent = await classify_user_intent(content, session_id)
        if intent.get("is_data_query") and intent.get("confidence", 0) > 0.6:
            data_ctx = await get_data_context(user_id, intent.get("entities"))
            answer = (await answer_data_query(content, session_id, data_ctx)).get(
                "answer", "I couldn't find the information you're looking for."
            )
            await _store_assistant_msg(user_id, answer, chat_state=ChatState.INITIAL, is_data_query=True)
            return ChatResponse(message=answer, question_type="data_query", detected_language=detected_lang)

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
    )

    new_state = result["state"]
    resp_text = result["response_text"]

    # ------------------------------------------------------------------
    # 7. If COMPLETE → create observation → move to AWAITING_CONTEXT
    # ------------------------------------------------------------------
    if result.get("create_observation") and result.get("observation_data"):
        obs = await _create_observation(user_id, result["observation_data"],
                                        session_id, image_thumbnail)
        threat = obs["threat"]
        auto_actions = obs["auto_created_actions"]
        new_threat_id = obs["threat_id"]

        # Build context prompt
        actions_info = ""
        if auto_actions:
            actions_info = f"\n\n**{len(auto_actions)} action(s) auto-created:**\n"
            for a in auto_actions[:3]:
                actions_info += f"- {a['title'][:50]}{'...' if len(a['title'])>50 else ''}\n"
            if len(auto_actions) > 3:
                actions_info += f"- ...and {len(auto_actions)-3} more\n"

        context_prompt = (
            f"Observation recorded: **{threat['title']}**{actions_info}\n\n"
            f"Would you like to add any additional context? You can:\n"
            f"- Add comments about what you observed\n"
            f"- Provide temperature or measurement readings\n"
            f"- Describe the conditions (weather, operating state)\n"
            f"- Upload a photo of the issue\n\n"
            f"Type your observations or say 'skip' to continue."
        )

        # Write AWAITING_CONTEXT state
        await _write_conv(
            user_id,
            state=ChatState.AWAITING_CONTEXT,
            pending_data={},
            equipment_suggestions=None,
            failure_mode_suggestions=None,
            original_message=None,
            awaiting_context_for_threat=new_threat_id,
        )

        # Store assistant message with threat summary
        eq_data = result["observation_data"].get("equipment", {})
        await _store_assistant_msg(
            user_id, context_prompt,
            chat_state=ChatState.AWAITING_CONTEXT,
            threat_id=new_threat_id,
            threat_title=threat["title"],
            threat_asset=threat["asset"],
            threat_equipment_type=threat.get("equipment_type"),
            threat_equipment_tag=eq_data.get("tag"),
            threat_failure_mode=threat["failure_mode"],
            threat_risk_level=threat["risk_level"],
            threat_risk_score=threat["risk_score"],
            threat_rank=threat.get("rank"),
            threat_summary=True,
            awaiting_context_for_threat=new_threat_id,
            question_type="context",
        )

        return ChatResponse(
            message=context_prompt,
            threat=ThreatResponse(**threat),
            follow_up_question=context_prompt,
            question_type="context",
            awaiting_context_for_threat=new_threat_id,
            detected_language=detected_lang,
        )

    # ------------------------------------------------------------------
    # 8. Non-observation result: write new state, store message, return
    # ------------------------------------------------------------------
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
    )


# ===========================================================================
# Endpoints
# ===========================================================================

@router.post("/chat/send", response_model=ChatResponse)
async def send_chat_message(
    message: ChatMessageCreate,
    current_user: dict = Depends(get_current_user),
):
    session_id = f"user_{current_user['id']}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    detected_lang = message.language or detect_language(message.content)
    return await _core_chat_process(
        current_user["id"], message.content, session_id, detected_lang, message.image_base64
    )


@router.get("/chat/history")
async def get_chat_history(limit: int = 50, current_user: dict = Depends(get_current_user)):
    messages = await db.chat_messages.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(messages))


@router.delete("/chat/clear")
async def clear_chat_history(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    result = await db.chat_messages.delete_many({"user_id": user_id})
    await db.chat_conversations.delete_many({"user_id": user_id})
    return {"success": True, "deleted_messages": result.deleted_count, "message": "Chat history cleared"}


@router.post("/chat/cancel")
async def cancel_chat_flow(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    await _reset_conv(user_id)
    await _store_assistant_msg(user_id, "Cancelled. What would you like to report?",
                               chat_state=ChatState.INITIAL)
    return {"success": True, "message": "Cancelled"}


# ===========================================================================
# Voice endpoints
# ===========================================================================

@router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(audio_base64: str = Form(...),
                           current_user: dict = Depends(get_current_user)):
    text = await transcribe_audio_with_ai(audio_base64)
    return VoiceTranscriptionResponse(text=text)


@router.post("/chat/voice-send")
async def voice_send(
    audio: bytes = File(...),
    language: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Transcribe audio then process as chat message (single round-trip)."""
    user_id = current_user["id"]
    session_id = f"user_{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"

    audio_b64 = base64.b64encode(audio).decode("utf-8")
    transcribed = await transcribe_audio_with_ai(audio_b64)

    if not transcribed or not transcribed.strip():
        return {"message": "Could not transcribe voice - no text detected",
                "transcribed_text": "", "detected_language": None}

    detected_lang = language or detect_language(transcribed)

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
    }
