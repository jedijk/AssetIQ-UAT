"""
Chat routes.
"""
from fastapi import APIRouter, Depends, Form
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
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])


async def get_failure_modes_from_db():
    """Fetch failure modes from MongoDB, fallback to static library if empty."""
    try:
        result = await failure_modes_service.get_all(limit=1000)
        failure_modes = result.get("failure_modes", [])
        if failure_modes and len(failure_modes) > 0:
            logger.info(f"Using {len(failure_modes)} failure modes from database")
            return failure_modes
    except Exception as e:
        logger.warning(f"Failed to fetch failure modes from DB: {e}")
    
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
    Auto-creates observation if confident (1 match each)
    """
    session_id = f"user_{current_user['id']}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    user_id = current_user["id"]
    
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
                question_type="data_query"
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
        "original_message": result.get("original_message"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(ai_response)
    
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
        
        # Calculate risk score: (Criticality × 0.75) + (FMEA × 0.25)
        final_risk_score = int((criticality_score * 0.75) + (fmea_score * 0.25))
        final_risk_score = min(100, max(0, final_risk_score))
        
        # Determine risk level
        if final_risk_score >= 70:
            risk_level = "Critical"
        elif final_risk_score >= 50:
            risk_level = "High"
        elif final_risk_score >= 30:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
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
        
        # Update all ranks
        await update_all_ranks(user_id)
        
        # Get updated threat
        updated_threat = await db.threats.find_one({"id": threat_id}, {"_id": 0})
        if isinstance(updated_threat.get("risk_score"), float):
            updated_threat["risk_score"] = int(updated_threat["risk_score"])
        
        # Update assistant message with threat info
        await db.chat_messages.update_one(
            {"id": ai_response["id"]},
            {"$set": {
                "threat_id": threat_id,
                "threat_title": updated_threat["title"],
                "threat_asset": updated_threat["asset"],
                "threat_equipment_type": updated_threat["equipment_type"],
                "threat_failure_mode": updated_threat["failure_mode"],
                "threat_risk_level": updated_threat["risk_level"],
                "threat_risk_score": updated_threat["risk_score"],
                "threat_rank": updated_threat["rank"],
                "threat_summary": True
            }}
        )
        
        return ChatResponse(
            message=result["response_text"],
            threat=ThreatResponse(**updated_threat)
        )
    
    # Return follow-up question response
    return ChatResponse(
        message=result["response_text"],
        follow_up_question=result["response_text"] if result["state"] != ChatState.COMPLETE else None,
        question_type="asset" if result.get("equipment_suggestions") else ("failure" if result.get("failure_mode_suggestions") is not None else None),
        equipment_suggestions=result.get("equipment_suggestions"),
        failure_mode_suggestions=result.get("failure_mode_suggestions"),
        show_new_failure_mode_option=result.get("show_new_failure_mode_option")
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


# ============= VOICE ENDPOINT =============

@router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(
    audio_base64: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    text = await transcribe_audio_with_ai(audio_base64)
    return VoiceTranscriptionResponse(text=text)

