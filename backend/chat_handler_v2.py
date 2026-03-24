"""
Chat Handler V2 - Clean, Simple 2-Step Flow

Step 1: Match Equipment from Hierarchy (subunit level and below)
Step 2: Match Failure Mode from FMEA Library
Auto-create if confident (1 match each), otherwise ask user to select
"""

import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class ChatState:
    """Tracks conversation state for multi-step flow"""
    INITIAL = "initial"  # Fresh start
    AWAITING_EQUIPMENT = "awaiting_equipment"  # User needs to select equipment
    AWAITING_FAILURE_MODE = "awaiting_failure_mode"  # User needs to select failure mode
    COMPLETE = "complete"  # Ready to create observation


def normalize_text(text: str) -> str:
    """Normalize text for matching"""
    return ' '.join(text.lower().strip().split())


def extract_keywords(text: str) -> List[str]:
    """Extract meaningful keywords from text (3+ chars)"""
    words = re.findall(r'\b[a-zA-Z0-9]{3,}\b', text.lower())
    # Remove common stop words
    stop_words = {'the', 'and', 'for', 'has', 'have', 'had', 'was', 'were', 'are', 'been', 
                  'being', 'with', 'from', 'this', 'that', 'these', 'those', 'there'}
    return [w for w in words if w not in stop_words]


async def search_equipment_hierarchy(
    db: AsyncIOMotorDatabase,
    search_text: str,
    user_id: str
) -> List[Dict[str, Any]]:
    """
    Search equipment hierarchy for matching equipment.
    Only searches subunit level and below (not sites, plants, units).
    Matches by name, tag, description, or equipment_type.
    """
    keywords = extract_keywords(search_text)
    if not keywords:
        return []
    
    # Only search equipment at operational levels
    operational_levels = ["subunit", "maintainable_item", "equipment", "component", "equipment_unit"]
    
    # Build search query - match any keyword in any field
    search_conditions = []
    for keyword in keywords:
        keyword_regex = {"$regex": keyword, "$options": "i"}
        search_conditions.append({"name": keyword_regex})
        search_conditions.append({"tag": keyword_regex})
        search_conditions.append({"tag_number": keyword_regex})
        search_conditions.append({"description": keyword_regex})
        search_conditions.append({"equipment_type": keyword_regex})
        search_conditions.append({"equipment_type_name": keyword_regex})
    
    query = {
        "$and": [
            {"level": {"$in": operational_levels}},
            {"$or": search_conditions}
        ]
    }
    
    equipment_list = await db.equipment_nodes.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "tag_number": 1, 
         "equipment_type": 1, "equipment_type_name": 1, "description": 1, 
         "level": 1, "criticality": 1}
    ).limit(20).to_list(20)
    
    # Score and rank results
    scored = []
    for eq in equipment_list:
        score = 0
        name = (eq.get("name") or "").lower()
        tag = (eq.get("tag") or eq.get("tag_number") or "").lower()
        desc = (eq.get("description") or "").lower()
        eq_type = (eq.get("equipment_type") or eq.get("equipment_type_name") or "").lower()
        
        for keyword in keywords:
            # Name match (highest priority)
            if keyword in name:
                score += 10
            # Tag match (high priority)
            if keyword in tag:
                score += 8
            # Equipment type match
            if keyword in eq_type:
                score += 5
            # Description match
            if keyword in desc:
                score += 3
        
        if score > 0:
            scored.append({
                "id": eq.get("id"),
                "name": eq.get("name"),
                "tag": eq.get("tag") or eq.get("tag_number"),
                "equipment_type": eq.get("equipment_type") or eq.get("equipment_type_name"),
                "description": eq.get("description"),
                "level": eq.get("level"),
                "criticality": eq.get("criticality"),
                "score": score
            })
    
    # Sort by score descending
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:10]  # Return top 10


def search_failure_modes(
    failure_modes_library: List[Dict],
    search_text: str,
    equipment_type: str = None
) -> List[Dict[str, Any]]:
    """
    Search FMEA failure modes library for matching failure modes.
    Matches by failure_mode name, keywords, category, or equipment.
    Optionally filters by equipment type.
    """
    keywords = extract_keywords(search_text)
    if not keywords:
        return []
    
    scored = []
    for fm in failure_modes_library:
        score = 0
        fm_name = (fm.get("failure_mode") or "").lower()
        fm_keywords = [k.lower() for k in fm.get("keywords", [])]
        fm_category = (fm.get("category") or "").lower()
        fm_equipment = (fm.get("equipment") or "").lower()
        
        for keyword in keywords:
            # Direct name match (highest priority)
            if keyword in fm_name or fm_name in keyword:
                score += 20
            # Keyword match (high priority)
            for fm_kw in fm_keywords:
                if keyword in fm_kw or fm_kw in keyword:
                    score += 15
                    break
            # Category match
            if keyword in fm_category:
                score += 5
            # Equipment match
            if keyword in fm_equipment:
                score += 3
        
        # Boost if equipment type matches
        if equipment_type:
            eq_type_lower = equipment_type.lower()
            if eq_type_lower in fm_equipment or fm_equipment in eq_type_lower:
                score += 10
        
        if score > 0:
            scored.append({
                "id": fm.get("id"),
                "failure_mode": fm.get("failure_mode"),
                "category": fm.get("category"),
                "equipment": fm.get("equipment"),
                "severity": fm.get("severity"),
                "occurrence": fm.get("occurrence"),
                "detectability": fm.get("detectability"),
                "rpn": fm.get("rpn"),
                "recommended_actions": fm.get("recommended_actions", []),
                "score": score
            })
    
    # Sort by score descending
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:10]  # Return top 10


async def get_conversation_state(
    db: AsyncIOMotorDatabase,
    user_id: str
) -> Dict[str, Any]:
    """Get the current conversation state from recent messages"""
    # Get last 5 assistant messages
    recent_msgs = await db.chat_messages.find(
        {"user_id": user_id, "role": "assistant"},
        {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)
    
    # Find the most recent state-related message
    for msg in recent_msgs:
        if msg.get("chat_state"):
            return {
                "state": msg.get("chat_state"),
                "pending_data": msg.get("pending_data", {}),
                "equipment_suggestions": msg.get("equipment_suggestions"),
                "failure_mode_suggestions": msg.get("failure_mode_suggestions"),
                "original_message": msg.get("original_message")
            }
    
    return {"state": ChatState.INITIAL, "pending_data": {}}


async def process_chat_message(
    db: AsyncIOMotorDatabase,
    user_id: str,
    message_content: str,
    failure_modes_library: List[Dict],
    session_id: str,
    image_base64: str = None
) -> Dict[str, Any]:
    """
    Main chat processing function with clean 2-step flow.
    
    Returns:
    {
        "response_text": str,
        "state": str,
        "equipment_suggestions": list or None,
        "failure_mode_suggestions": list or None,
        "create_observation": bool,
        "observation_data": dict or None,
        "pending_data": dict
    }
    """
    
    # Get current conversation state
    conv_state = await get_conversation_state(db, user_id)
    current_state = conv_state.get("state", ChatState.INITIAL)
    pending_data = conv_state.get("pending_data", {})
    original_message = conv_state.get("original_message", message_content)
    
    # ============================================
    # STATE: AWAITING EQUIPMENT SELECTION
    # ============================================
    if current_state == ChatState.AWAITING_EQUIPMENT:
        prev_suggestions = conv_state.get("equipment_suggestions", [])
        
        # Check if user selected one of the suggested equipment
        message_normalized = normalize_text(message_content)
        selected_equipment = None
        
        for eq in prev_suggestions:
            eq_name_normalized = normalize_text(eq.get("name", ""))
            if eq_name_normalized and (eq_name_normalized == message_normalized or 
                                       eq_name_normalized in message_normalized or 
                                       message_normalized in eq_name_normalized):
                selected_equipment = eq
                break
        
        if selected_equipment:
            # Equipment selected! Now search for failure modes
            pending_data["equipment"] = selected_equipment
            pending_data["equipment_id"] = selected_equipment.get("id")
            pending_data["equipment_name"] = selected_equipment.get("name")
            pending_data["equipment_type"] = selected_equipment.get("equipment_type")
            pending_data["criticality"] = selected_equipment.get("criticality")
            
            # Search failure modes based on original message and equipment type
            fm_matches = search_failure_modes(
                failure_modes_library,
                original_message,
                selected_equipment.get("equipment_type")
            )
            
            if len(fm_matches) == 1:
                # Single match - auto-select and create observation
                selected_fm = fm_matches[0]
                pending_data["failure_mode"] = selected_fm
                pending_data["failure_mode_id"] = selected_fm.get("id")
                pending_data["failure_mode_name"] = selected_fm.get("failure_mode")
                
                return {
                    "response_text": "Observation recorded successfully.",
                    "state": ChatState.COMPLETE,
                    "equipment_suggestions": None,
                    "failure_mode_suggestions": None,
                    "create_observation": True,
                    "observation_data": pending_data,
                    "pending_data": pending_data,
                    "original_message": original_message
                }
            
            elif len(fm_matches) > 1:
                # Multiple matches - ask user to select
                return {
                    "response_text": "What type of failure is it? Please select:",
                    "state": ChatState.AWAITING_FAILURE_MODE,
                    "equipment_suggestions": None,
                    "failure_mode_suggestions": fm_matches,
                    "create_observation": False,
                    "observation_data": None,
                    "pending_data": pending_data,
                    "original_message": original_message
                }
            
            else:
                # No failure mode matches - create with "Unknown" or ask
                pending_data["failure_mode_name"] = "Unknown"
                return {
                    "response_text": "Observation recorded successfully.",
                    "state": ChatState.COMPLETE,
                    "equipment_suggestions": None,
                    "failure_mode_suggestions": None,
                    "create_observation": True,
                    "observation_data": pending_data,
                    "pending_data": pending_data,
                    "original_message": original_message
                }
        
        else:
            # User didn't select - search again with their new input
            eq_matches = await search_equipment_hierarchy(db, message_content, user_id)
            
            if len(eq_matches) == 1:
                # Found single match with new input
                selected_equipment = eq_matches[0]
                pending_data["equipment"] = selected_equipment
                pending_data["equipment_id"] = selected_equipment.get("id")
                pending_data["equipment_name"] = selected_equipment.get("name")
                pending_data["equipment_type"] = selected_equipment.get("equipment_type")
                
                # Now search for failure modes
                fm_matches = search_failure_modes(
                    failure_modes_library,
                    original_message + " " + message_content,
                    selected_equipment.get("equipment_type")
                )
                
                if len(fm_matches) == 1:
                    pending_data["failure_mode"] = fm_matches[0]
                    pending_data["failure_mode_id"] = fm_matches[0].get("id")
                    pending_data["failure_mode_name"] = fm_matches[0].get("failure_mode")
                    
                    return {
                        "response_text": "Observation recorded successfully.",
                        "state": ChatState.COMPLETE,
                        "equipment_suggestions": None,
                        "failure_mode_suggestions": None,
                        "create_observation": True,
                        "observation_data": pending_data,
                        "pending_data": pending_data,
                        "original_message": original_message
                    }
                elif len(fm_matches) > 1:
                    return {
                        "response_text": "What type of failure is it? Please select:",
                        "state": ChatState.AWAITING_FAILURE_MODE,
                        "equipment_suggestions": None,
                        "failure_mode_suggestions": fm_matches,
                        "create_observation": False,
                        "observation_data": None,
                        "pending_data": pending_data,
                        "original_message": original_message
                    }
                else:
                    pending_data["failure_mode_name"] = "Unknown"
                    return {
                        "response_text": "Observation recorded successfully.",
                        "state": ChatState.COMPLETE,
                        "equipment_suggestions": None,
                        "failure_mode_suggestions": None,
                        "create_observation": True,
                        "observation_data": pending_data,
                        "pending_data": pending_data,
                        "original_message": original_message
                    }
            
            elif len(eq_matches) > 1:
                return {
                    "response_text": "Which equipment? Please select:",
                    "state": ChatState.AWAITING_EQUIPMENT,
                    "equipment_suggestions": eq_matches,
                    "failure_mode_suggestions": None,
                    "create_observation": False,
                    "observation_data": None,
                    "pending_data": pending_data,
                    "original_message": original_message
                }
            else:
                return {
                    "response_text": "I couldn't find that equipment. Please specify the equipment name or tag:",
                    "state": ChatState.AWAITING_EQUIPMENT,
                    "equipment_suggestions": prev_suggestions,  # Show previous suggestions again
                    "failure_mode_suggestions": None,
                    "create_observation": False,
                    "observation_data": None,
                    "pending_data": pending_data,
                    "original_message": original_message
                }
    
    # ============================================
    # STATE: AWAITING FAILURE MODE SELECTION
    # ============================================
    if current_state == ChatState.AWAITING_FAILURE_MODE:
        prev_suggestions = conv_state.get("failure_mode_suggestions", [])
        
        # Check if user selected one of the suggested failure modes
        message_normalized = normalize_text(message_content)
        # Also handle "Failure mode: X" pattern from frontend buttons
        if message_normalized.startswith("failure mode:"):
            message_normalized = normalize_text(message_content.split(":", 1)[1])
        
        selected_fm = None
        
        for fm in prev_suggestions:
            fm_name_normalized = normalize_text(fm.get("failure_mode", ""))
            if fm_name_normalized and (fm_name_normalized == message_normalized or
                                       fm_name_normalized in message_normalized or
                                       message_normalized in fm_name_normalized):
                selected_fm = fm
                break
        
        if selected_fm:
            # Failure mode selected! Create observation
            pending_data["failure_mode"] = selected_fm
            pending_data["failure_mode_id"] = selected_fm.get("id")
            pending_data["failure_mode_name"] = selected_fm.get("failure_mode")
            pending_data["recommended_actions"] = selected_fm.get("recommended_actions", [])
            
            return {
                "response_text": "Observation recorded successfully.",
                "state": ChatState.COMPLETE,
                "equipment_suggestions": None,
                "failure_mode_suggestions": None,
                "create_observation": True,
                "observation_data": pending_data,
                "pending_data": pending_data,
                "original_message": original_message
            }
        
        else:
            # User didn't select - search again with their input
            fm_matches = search_failure_modes(
                failure_modes_library,
                message_content,
                pending_data.get("equipment_type")
            )
            
            if len(fm_matches) == 1:
                selected_fm = fm_matches[0]
                pending_data["failure_mode"] = selected_fm
                pending_data["failure_mode_id"] = selected_fm.get("id")
                pending_data["failure_mode_name"] = selected_fm.get("failure_mode")
                
                return {
                    "response_text": "Observation recorded successfully.",
                    "state": ChatState.COMPLETE,
                    "equipment_suggestions": None,
                    "failure_mode_suggestions": None,
                    "create_observation": True,
                    "observation_data": pending_data,
                    "pending_data": pending_data,
                    "original_message": original_message
                }
            
            elif len(fm_matches) > 1:
                return {
                    "response_text": "Which failure type? Please select:",
                    "state": ChatState.AWAITING_FAILURE_MODE,
                    "equipment_suggestions": None,
                    "failure_mode_suggestions": fm_matches,
                    "create_observation": False,
                    "observation_data": None,
                    "pending_data": pending_data,
                    "original_message": original_message
                }
            
            else:
                # Still no match - use what they typed or "Unknown"
                pending_data["failure_mode_name"] = message_content if len(message_content) < 100 else "Unknown"
                return {
                    "response_text": "Observation recorded successfully.",
                    "state": ChatState.COMPLETE,
                    "equipment_suggestions": None,
                    "failure_mode_suggestions": None,
                    "create_observation": True,
                    "observation_data": pending_data,
                    "pending_data": pending_data,
                    "original_message": original_message
                }
    
    # ============================================
    # STATE: INITIAL - Fresh message
    # ============================================
    # Step 1: Search for equipment
    eq_matches = await search_equipment_hierarchy(db, message_content, user_id)
    
    if len(eq_matches) == 0:
        # No equipment found - ask user to specify
        return {
            "response_text": "Which equipment are you reporting an issue for? Please specify the equipment name or tag:",
            "state": ChatState.AWAITING_EQUIPMENT,
            "equipment_suggestions": None,
            "failure_mode_suggestions": None,
            "create_observation": False,
            "observation_data": None,
            "pending_data": {"original_description": message_content},
            "original_message": message_content
        }
    
    elif len(eq_matches) == 1:
        # Single equipment match - auto-select and proceed to failure mode
        selected_equipment = eq_matches[0]
        pending_data = {
            "equipment": selected_equipment,
            "equipment_id": selected_equipment.get("id"),
            "equipment_name": selected_equipment.get("name"),
            "equipment_type": selected_equipment.get("equipment_type"),
            "criticality": selected_equipment.get("criticality"),
            "original_description": message_content
        }
        
        # Search for failure modes
        fm_matches = search_failure_modes(
            failure_modes_library,
            message_content,
            selected_equipment.get("equipment_type")
        )
        
        if len(fm_matches) == 1:
            # Single match for both - auto-create observation
            selected_fm = fm_matches[0]
            pending_data["failure_mode"] = selected_fm
            pending_data["failure_mode_id"] = selected_fm.get("id")
            pending_data["failure_mode_name"] = selected_fm.get("failure_mode")
            pending_data["recommended_actions"] = selected_fm.get("recommended_actions", [])
            
            return {
                "response_text": "Observation recorded successfully.",
                "state": ChatState.COMPLETE,
                "equipment_suggestions": None,
                "failure_mode_suggestions": None,
                "create_observation": True,
                "observation_data": pending_data,
                "pending_data": pending_data,
                "original_message": message_content
            }
        
        elif len(fm_matches) > 1:
            # Multiple failure mode matches - ask user to select
            return {
                "response_text": f"Issue reported for {selected_equipment.get('name')}. What type of failure is it? Please select:",
                "state": ChatState.AWAITING_FAILURE_MODE,
                "equipment_suggestions": None,
                "failure_mode_suggestions": fm_matches,
                "create_observation": False,
                "observation_data": None,
                "pending_data": pending_data,
                "original_message": message_content
            }
        
        else:
            # No failure mode match - create with "Unknown"
            pending_data["failure_mode_name"] = "Unknown"
            return {
                "response_text": "Observation recorded successfully.",
                "state": ChatState.COMPLETE,
                "equipment_suggestions": None,
                "failure_mode_suggestions": None,
                "create_observation": True,
                "observation_data": pending_data,
                "pending_data": pending_data,
                "original_message": message_content
            }
    
    else:
        # Multiple equipment matches - ask user to select
        return {
            "response_text": "Which equipment are you reporting an issue for? Please select:",
            "state": ChatState.AWAITING_EQUIPMENT,
            "equipment_suggestions": eq_matches,
            "failure_mode_suggestions": None,
            "create_observation": False,
            "observation_data": None,
            "pending_data": {"original_description": message_content},
            "original_message": message_content
        }
