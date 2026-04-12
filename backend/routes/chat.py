"""
Chat routes.
"""
from fastapi import APIRouter, Depends, Form, File
from typing import Optional
from datetime import datetime, timezone
import uuid
from database import db, failure_modes_service
from auth import get_current_user
from models.api_models import ChatMessageCreate, ChatResponse, ThreatResponse, VoiceTranscriptionResponse
from ai_helpers import classify_user_intent, get_data_context, answer_data_query, analyze_threat_with_ai, transcribe_audio_with_ai
from chat_handler_v2 import process_chat_message, ChatState
from failure_modes import FAILURE_MODES_LIBRARY
from services.threat_score_service import calculate_rank, update_all_ranks
from services.cache_service import cache
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])

# Language detection using common word frequency
_LANG_WORDS = {
    "nl": {"de", "het", "een", "is", "van", "en", "in", "dat", "niet", "op", "te", "zijn", "voor", "met", "aan", "er", "ook", "maar", "als", "nog", "wel", "geen", "moet", "wordt", "kan", "naar", "bij", "dit", "wat", "meer", "uit", "over", "zo", "dan", "hun", "werd", "heeft", "hoe", "nee", "ja", "kapot", "stuk", "lek", "pomp", "klep", "sensor", "storing", "onderhoud", "controleer", "draait"},
    "de": {"der", "die", "und", "ist", "ein", "eine", "nicht", "von", "mit", "auf", "das", "den", "auch", "sich", "des", "dem", "wird", "sind", "wie", "oder", "noch", "kann", "nach", "aber", "nur", "aus", "wenn", "hat", "haben", "ich", "wir", "sie", "es", "kaputt", "defekt", "pumpe", "ventil"},
    "fr": {"le", "la", "les", "de", "des", "est", "un", "une", "du", "et", "en", "que", "qui", "dans", "pas", "sur", "pour", "avec", "sont", "ce", "cette", "au", "aux", "ne", "ont", "il", "elle", "nous", "vous", "ils", "mais", "ou", "comme", "pompe", "vanne", "capteur"},
}

def detect_language(text: str) -> str:
    """Detect language from text using word frequency matching. Returns ISO code."""
    words = set(text.lower().split())
    if len(words) < 2:
        return "en"
    scores = {}
    for lang, lang_words in _LANG_WORDS.items():
        scores[lang] = len(words & lang_words)
    best = max(scores, key=scores.get)
    return best if scores[best] >= 2 else "en"


async def get_failure_modes_from_db():
    """Fetch ALL failure modes from MongoDB, fallback to static library if empty."""
    try:
        # Fetch all failure modes (no limit) to ensure we always have the latest complete set
        result = await failure_modes_service.get_all(limit=2000)
        failure_modes = result.get("failure_modes", [])
        total = result.get("total", 0)
        
        if failure_modes and len(failure_modes) > 0:
            logger.info(f"Chat using {len(failure_modes)}/{total} failure modes from database")
            return failure_modes
        else:
            logger.warning("No failure modes found in database, using static library")
    except Exception as e:
        logger.error(f"Failed to fetch failure modes from DB: {e}")
    
    # Fallback to static library
    logger.info(f"Using static FAILURE_MODES_LIBRARY with {len(FAILURE_MODES_LIBRARY)} entries")
    return FAILURE_MODES_LIBRARY

@router.post("/chat/send", response_model=ChatResponse)
async def send_chat_message(
    message: ChatMessageCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Clean 2-step chat flow:
    1. Match equipment from hierarchy (subunit level and below)
    2. Match failure mode from FMEA library
    3. After observation creation, ask for additional context
    Auto-creates observation if confident (1 match each)
    """
    session_id = f"user_{current_user['id']}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    user_id = current_user["id"]
    
    # Detect or use manually set language
    detected_lang = message.language or detect_language(message.content)
    
    # Store user message
    image_thumbnail = None
    if message.image_base64:
        image_thumbnail = message.image_base64[:50000] if len(message.image_base64) > 50000 else message.image_base64
    
    chat_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "user",
        "content": message.content,
        "has_image": message.image_base64 is not None,
        "image_data": image_thumbnail,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(chat_msg)
    
    # Check if user is in AWAITING_CONTEXT state (after observation was created)
    conversation_state = await db.chat_conversations.find_one({"user_id": user_id})
    if conversation_state and conversation_state.get("state") == ChatState.AWAITING_CONTEXT:
        threat_id = conversation_state.get("awaiting_context_for_threat")
        
        # Check if user wants to skip
        skip_phrases = ["skip", "no", "done", "next", "nee", "klaar", "volgende"]
        user_wants_skip = message.content.strip().lower() in skip_phrases
        
        if user_wants_skip:
            # Clear the awaiting context state
            await db.chat_conversations.update_one(
                {"user_id": user_id},
                {"$set": {"state": ChatState.INITIAL, "awaiting_context_for_threat": None}}
            )
            
            skip_response = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "role": "assistant",
                "content": "Got it! Your observation has been saved. What else would you like to report?",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.chat_messages.insert_one(skip_response)
            
            return ChatResponse(
                message="Got it! Your observation has been saved. What else would you like to report?",
                detected_language=detected_lang
            )
        
        # User is providing context - update the threat with the additional info
        if threat_id:
            # Build context update
            context_update = {
                "user_context": message.content,
                "context_added_at": datetime.now(timezone.utc).isoformat()
            }
            
            # If user uploaded an image with the context, add it as attachment
            if message.image_base64:
                attachment = {
                    "type": "image",
                    "data": image_thumbnail,
                    "description": message.content,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.threats.update_one(
                    {"id": threat_id},
                    {
                        "$set": context_update,
                        "$push": {"attachments": attachment}
                    }
                )
            else:
                await db.threats.update_one(
                    {"id": threat_id},
                    {"$set": context_update}
                )
            
            # Clear the awaiting context state
            await db.chat_conversations.update_one(
                {"user_id": user_id},
                {"$set": {"state": ChatState.INITIAL, "awaiting_context_for_threat": None}}
            )
            
            # Build confirmation message
            confirmation = "Thanks! I've added your context to the observation"
            if message.image_base64:
                confirmation += " along with the photo"
            confirmation += ". What else would you like to report?"
            
            context_added_response = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "role": "assistant",
                "content": confirmation,
                "context_added_to_threat": threat_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.chat_messages.insert_one(context_added_response)
            
            return ChatResponse(
                message=confirmation,
                detected_language=detected_lang
            )
    
    # Check for data queries (skip if image provided)
    if not message.image_base64:
        intent = await classify_user_intent(message.content, session_id)
        
        if intent.get("is_data_query", False) and intent.get("confidence", 0) > 0.6:
            data_context = await get_data_context(user_id, intent.get("entities"))
            query_response = await answer_data_query(message.content, session_id, data_context)
            answer = query_response.get("answer", "I couldn't find the information you're looking for.")
            
            ai_response = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "role": "assistant",
                "content": answer,
                "is_data_query": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.chat_messages.insert_one(ai_response)
            
            return ChatResponse(
                message=answer,
                follow_up_question=None,
                question_type="data_query",
                detected_language=detected_lang
            )
    
    # Process with clean 2-step chat handler
    # Fetch latest failure modes from database
    failure_modes_library = await get_failure_modes_from_db()
    
    result = await process_chat_message(
        db=db,
        user_id=user_id,
        message_content=message.content,
        failure_modes_library=failure_modes_library,
        session_id=session_id,
        image_base64=message.image_base64
    )
    
    # Store assistant response
    ai_response = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "assistant",
        "content": result["response_text"],
        "chat_state": result["state"],
        "pending_data": result.get("pending_data", {}),
        "equipment_suggestions": result.get("equipment_suggestions"),
        "failure_mode_suggestions": result.get("failure_mode_suggestions"),
        "show_new_failure_mode_option": result.get("show_new_failure_mode_option"),
        "question_type": "asset" if result.get("equipment_suggestions") else ("failure" if result.get("failure_mode_suggestions") is not None else None),
        "original_message": result.get("original_message"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # If we need to create an observation
    if result.get("create_observation") and result.get("observation_data"):
        obs_data = result["observation_data"]
        
        # Build the threat/observation
        threat_id = str(uuid.uuid4())
        equipment_name = obs_data.get("equipment_name", "Unknown")
        failure_mode_name = obs_data.get("failure_mode_name", "Unknown")
        
        # Get FMEA data for risk calculation
        fmea_data = obs_data.get("failure_mode", {})
        rpn = fmea_data.get("rpn", 100)
        fmea_score = min(100, int(rpn / 10))
        
        # Get equipment_type - prefer from equipment hierarchy, fallback to FMEA data
        equipment_type = obs_data.get("equipment_type") or fmea_data.get("equipment") or "Equipment"
        
        # Get installation_id for this observation
        installation_id = obs_data.get("installation_id")
        
        # Get criticality data if available
        criticality = obs_data.get("criticality", {})
        criticality_score = 0
        if isinstance(criticality, dict):
            safety = criticality.get("safety_impact", 0) or 0
            production = criticality.get("production_impact", 0) or 0
            environmental = criticality.get("environmental_impact", 0) or 0
            reputation = criticality.get("reputation_impact", 0) or 0
            criticality_score = int(((safety * 25) + (production * 20) + (environmental * 15) + (reputation * 10)) / 3.5)
            criticality_score = min(100, criticality_score)
        
        # Get installation-specific risk settings
        from services.threat_score_service import get_risk_settings_for_installation, calculate_risk_score
        risk_settings = await get_risk_settings_for_installation(installation_id)
        
        # Calculate risk score using installation settings
        final_risk_score, risk_level = calculate_risk_score(criticality_score, fmea_score, risk_settings)
        
        # Calculate rank
        rank, total = await calculate_rank(final_risk_score, user_id)
        
        # Create threat document
        threat_doc = {
            "id": threat_id,
            "title": f"{equipment_name} - {failure_mode_name}",
            "asset": equipment_name,
            "equipment_type": equipment_type,
            "failure_mode": failure_mode_name,
            "failure_mode_id": obs_data.get("failure_mode_id"),
            "failure_mode_data": fmea_data if fmea_data else None,
            "is_new_failure_mode": obs_data.get("is_custom_failure_mode", False),  # Track if this is a new/custom failure mode
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
            "recommended_actions": obs_data.get("recommended_actions", fmea_data.get("recommended_actions", [])),
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
                "installation_id": installation_id
            },
            "equipment_criticality": criticality.get("level") if isinstance(criticality, dict) else None,
            "equipment_criticality_data": criticality if isinstance(criticality, dict) else None,
            "session_id": session_id,
            "attachments": []
        }
        
        # Add images if available
        if message.image_base64:
            threat_doc["attachments"] = [{
                "type": "image",
                "data": image_thumbnail,
                "created_at": datetime.now(timezone.utc).isoformat()
            }]
        
        await db.threats.insert_one(threat_doc)
        
        # Auto-create actions from failure mode's recommended actions with auto_create flag
        auto_created_actions = []
        recommended_actions = obs_data.get("recommended_actions", [])
        if not recommended_actions and fmea_data:
            recommended_actions = fmea_data.get("recommended_actions", [])
        
        for rec_action in recommended_actions:
            # Check if auto_create is enabled for this action
            auto_create = False
            if isinstance(rec_action, dict):
                auto_create = rec_action.get("auto_create", False)
            
            if auto_create:
                action_id = str(uuid.uuid4())
                action_description = rec_action.get("action") or rec_action.get("description") if isinstance(rec_action, dict) else str(rec_action)
                action_type = rec_action.get("action_type", "CM") if isinstance(rec_action, dict) else "CM"
                discipline = rec_action.get("discipline", "Mechanical") if isinstance(rec_action, dict) else "Mechanical"
                
                action_doc = {
                    "id": action_id,
                    "title": action_description[:200],  # Limit title length
                    "description": action_description,
                    "status": "Open",
                    "priority": "Medium",
                    "type": action_type,
                    "discipline": discipline,
                    "threat_id": threat_id,
                    "threat_title": threat_doc["title"],
                    "auto_created_from_failure_mode": True,
                    "failure_mode_id": obs_data.get("failure_mode_id"),
                    "failure_mode_name": failure_mode_name,
                    "created_by": user_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "installation_id": installation_id
                }
                await db.actions.insert_one(action_doc)
                auto_created_actions.append({
                    "id": action_id,
                    "title": action_description[:100],
                    "type": action_type
                })
        
        # Update threat with auto-created action IDs
        if auto_created_actions:
            await db.threats.update_one(
                {"id": threat_id},
                {"$set": {"auto_created_action_ids": [a["id"] for a in auto_created_actions]}}
            )
        
        # Update all ranks
        await update_all_ranks(user_id)
        
        # Get updated threat
        updated_threat = await db.threats.find_one({"id": threat_id}, {"_id": 0})
        if isinstance(updated_threat.get("risk_score"), float):
            updated_threat["risk_score"] = int(updated_threat["risk_score"])
        
        # Build context prompt message (this is the ONLY message we store for observations)
        actions_info = ""
        if auto_created_actions:
            actions_info = f"\n\n🎯 **{len(auto_created_actions)} action(s) auto-created:**\n"
            for act in auto_created_actions[:3]:  # Show max 3
                actions_info += f"• {act['title'][:50]}{'...' if len(act['title']) > 50 else ''}\n"
            if len(auto_created_actions) > 3:
                actions_info += f"• ...and {len(auto_created_actions) - 3} more\n"
        
        context_prompt = (
            f"✅ Observation recorded: **{updated_threat['title']}**{actions_info}\n\n"
            f"Would you like to add any additional context? You can:\n"
            f"• Add comments about what you observed\n"
            f"• Provide temperature or measurement readings\n"
            f"• Describe the conditions (weather, operating state)\n"
            f"• Upload a photo of the issue\n\n"
            f"Type your observations or say 'skip' to continue."
        )
        
        # Update the ai_response content to be the context prompt (single message)
        ai_response["content"] = context_prompt
        ai_response["chat_state"] = ChatState.AWAITING_CONTEXT
        ai_response["threat_id"] = threat_id
        ai_response["threat_title"] = updated_threat["title"]
        ai_response["threat_asset"] = updated_threat["asset"]
        ai_response["threat_equipment_type"] = updated_threat["equipment_type"]
        ai_response["threat_equipment_tag"] = obs_data.get("equipment", {}).get("tag")
        ai_response["threat_failure_mode"] = updated_threat["failure_mode"]
        ai_response["threat_risk_level"] = updated_threat["risk_level"]
        ai_response["threat_risk_score"] = updated_threat["risk_score"]
        ai_response["threat_rank"] = updated_threat["rank"]
        ai_response["threat_summary"] = True
        ai_response["awaiting_context_for_threat"] = threat_id
        
        # Store this single combined message
        await db.chat_messages.insert_one(ai_response)
        
        # Invalidate stats cache since a new threat was created
        cache.invalidate_stats(f"stats:{user_id}")
        
        # Update conversation state
        await db.chat_conversations.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "state": ChatState.AWAITING_CONTEXT,
                    "awaiting_context_for_threat": threat_id,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
        
        return ChatResponse(
            message=context_prompt,
            threat=ThreatResponse(**updated_threat),
            follow_up_question=context_prompt,
            question_type="context",
            awaiting_context_for_threat=threat_id,
            detected_language=detected_lang
        )
    
    # No observation created - store the regular response
    await db.chat_messages.insert_one(ai_response)
    
    # Return follow-up question response
    return ChatResponse(
        message=result["response_text"],
        follow_up_question=result["response_text"] if result["state"] != ChatState.COMPLETE else None,
        question_type="asset" if result.get("equipment_suggestions") else ("failure" if result.get("failure_mode_suggestions") is not None else None),
        equipment_suggestions=result.get("equipment_suggestions"),
        failure_mode_suggestions=result.get("failure_mode_suggestions"),
        show_new_failure_mode_option=result.get("show_new_failure_mode_option"),
        detected_language=detected_lang
    )
@router.get("/chat/history")
async def get_chat_history(
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    messages = await db.chat_messages.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(messages))


@router.delete("/chat/clear")
async def clear_chat_history(
    current_user: dict = Depends(get_current_user)
):
    """Clear all chat messages and conversation state for the current user."""
    user_id = current_user["id"]
    
    # Delete all chat messages for this user
    result = await db.chat_messages.delete_many({"user_id": user_id})
    
    # Also clear the conversation state
    await db.chat_conversations.delete_many({"user_id": user_id})
    
    return {
        "success": True,
        "deleted_messages": result.deleted_count,
        "message": "Chat history cleared"
    }


@router.post("/chat/cancel")
async def cancel_chat_flow(
    current_user: dict = Depends(get_current_user)
):
    """Reset conversation state without clearing chat history."""
    user_id = current_user["id"]
    await db.chat_conversations.update_one(
        {"user_id": user_id},
        {"$set": {"state": ChatState.INITIAL, "pending_data": {}, "equipment_suggestions": None, "failure_mode_suggestions": None}},
        upsert=True
    )
    # Add a system message so the user sees confirmation
    cancel_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "assistant",
        "content": "Cancelled. What would you like to report?",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(cancel_msg)
    return {"success": True, "message": "Cancelled"}



# ============= VOICE ENDPOINT =============

@router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(
    audio_base64: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    text = await transcribe_audio_with_ai(audio_base64)
    return VoiceTranscriptionResponse(text=text)


@router.post("/chat/voice-send")
async def voice_send(
    audio: bytes = File(...),
    language: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Combined voice transcribe + chat send in a single request.
    Accepts raw audio file upload, transcribes, then processes as chat message.
    Eliminates the extra round-trip of separate transcribe → send calls.
    """
    import base64
    user_id = current_user["id"]
    session_id = f"user_{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"

    # Transcribe audio
    audio_base64 = base64.b64encode(audio).decode("utf-8")
    transcribed_text = await transcribe_audio_with_ai(audio_base64)

    if not transcribed_text or not transcribed_text.strip():
        return {"message": "Could not transcribe voice - no text detected", "transcribed_text": "", "detected_language": None}

    # Detect language
    detected_lang = language or detect_language(transcribed_text)

    # Store user message
    chat_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "user",
        "content": transcribed_text,
        "source": "voice",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(chat_msg)

    # Process with chat handler (same logic as send_chat_message)
    failure_modes_library = await get_failure_modes_from_db()
    result = await process_chat_message(
        db=db,
        message_content=transcribed_text,
        session_id=session_id,
        user_id=user_id,
        failure_modes_library=failure_modes_library
    )

    # Handle observation creation
    if result.get("create_observation") and result.get("observation_data"):
        obs_data = result["observation_data"]
        equipment_name = obs_data.get("equipment_name", "Unknown")
        failure_mode_name = obs_data.get("failure_mode_name", "Unknown")
        equipment_type = obs_data.get("equipment_type", "")
        failure_mode_data = obs_data.get("failure_mode", {})

        threat_id = str(uuid.uuid4())
        rpn = failure_mode_data.get("rpn", 0) if isinstance(failure_mode_data, dict) else 0

        threat = {
            "id": threat_id,
            "title": f"{equipment_name} - {failure_mode_name}",
            "asset": equipment_name,
            "equipment_type": equipment_type,
            "failure_mode": failure_mode_name,
            "failure_mode_id": obs_data.get("failure_mode_id"),
            "failure_mode_data": failure_mode_data,
            "is_new_failure_mode": obs_data.get("is_new_failure_mode", False),
            "cause": obs_data.get("cause", "To be determined"),
            "impact": failure_mode_data.get("impact", "Operational") if isinstance(failure_mode_data, dict) else "Operational",
            "frequency": "Occasional",
            "risk_priority_number": rpn,
            "rpn": rpn,
            "fmea_rpn": rpn,
            "status": "Open",
            "risk_score": 0,
            "risk_level": "Low",
            "recommended_actions": obs_data.get("recommended_actions", []),
            "linked_equipment_id": obs_data.get("equipment_id"),
            "original_description": obs_data.get("original_description", transcribed_text),
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.threats.insert_one(threat)
        rank, total = await calculate_rank(threat["risk_score"], user_id)
        threat["rank"] = rank
        threat["total_threats"] = total

    # Store assistant response
    ai_response = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": "assistant",
        "content": result["response_text"],
        "equipment_suggestions": result.get("equipment_suggestions"),
        "failure_mode_suggestions": result.get("failure_mode_suggestions"),
        "show_new_failure_mode_option": result.get("show_new_failure_mode_option"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(ai_response)

    return {
        "message": result["response_text"],
        "transcribed_text": transcribed_text,
        "detected_language": detected_lang,
        "follow_up_question": result["response_text"] if result.get("state") != ChatState.COMPLETE else None,
        "question_type": "asset" if result.get("equipment_suggestions") else ("failure" if result.get("failure_mode_suggestions") is not None else None),
        "equipment_suggestions": result.get("equipment_suggestions"),
        "failure_mode_suggestions": result.get("failure_mode_suggestions"),
        "show_new_failure_mode_option": result.get("show_new_failure_mode_option"),
        "threat": threat if result.get("create_observation") else None,
    }

