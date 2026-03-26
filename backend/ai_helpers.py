"""
AI Helper functions and prompts for threat analysis, chat, and data queries.
"""
import os
import re
import json
import base64
import logging
import tempfile
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

from database import db, EMERGENT_LLM_KEY

logger = logging.getLogger(__name__)

# ============= SYSTEM PROMPTS =============

THREAT_ANALYSIS_SYSTEM_PROMPT = """You are AssetIQ AI extracting equipment failures from user messages.

## EXTRACT BEFORE ASKING
Analyze message for: Equipment (P-101, pump, extruder, compressor) + Problem (leaking, vibrating, overheating, wear)

## Required Fields:
1. Asset: Equipment tag or name
2. Failure: What's wrong (problem/symptom) - MUST be specific

## Response Rules:
- If BOTH asset AND specific failure found -> complete=true
- If asset unclear/generic (just "pump", "extruder" without tag) -> complete=false, question_type="asset"
- If failure is VAGUE (failing, broken, problem, issue, not working, down) -> complete=false, question_type="failure", ask what specifically is wrong
- NEVER ask for info already clearly stated

## VAGUE FAILURE TERMS (always ask for clarification):
failing, failed, broken, problem, issue, trouble, not working, down, bad, wrong, fault, error, malfunction, acting up, stopped

## SPECIFIC FAILURE TERMS (can proceed):
- leaking/leak/drip -> "Seal Failure"
- vibration/vibrating/shaking -> "Bearing Failure"
- noise/grinding/squealing -> "Bearing Failure"
- overheating/hot/high temperature -> "Overheating"
- corrosion/rust/corroded -> "Corrosion"
- stuck/jammed/won't move -> "Valve Stuck"
- wear/worn/wearing/abrasion -> "Screw Wear (Abrasive)" for extruders, "Bearing Failure" for pumps/motors
- fouling/blocked/clogged -> "Fouling"
- cavitation/bubbles -> "Cavitation"
- misalignment/alignment -> "Misalignment"
- surge/unstable -> "Surge"

## Equipment Detection:
- Specific tags (P-101, C-201) -> Use directly
- Generic names (pump, extruder, compressor) without ID -> complete=false, question_type="asset"
- 'Reporting issue for equipment "X"' -> asset=X exactly

RESPOND IN JSON:
{"complete":true/false,"follow_up_question":"if incomplete","question_type":"asset|failure","is_vague_failure":true/false,"threat":{"title":"short title","asset":"equipment name","equipment_type":"pump|compressor|extruder|etc","failure_mode":"standard mode or null if vague","impact":"description","frequency":"First Time|Occasional|Frequent","risk_score":0-100,"risk_level":"Critical|High|Medium|Low","recommended_actions":["action1","action2"]}}"""

IMAGE_ANALYSIS_SYSTEM_PROMPT = """You are ThreatBase AI analyzing an image of equipment failure or damage. 
Describe what you see in the image, identifying:
1. Type of equipment visible
2. Visible damage or failure indicators
3. Severity assessment
4. Any safety concerns

Be concise and technical. Focus on observable facts that would help a reliability engineer assess the threat."""

DATA_QUERY_SYSTEM_PROMPT = """You are ThreatBase AI, a helpful assistant for reliability engineers. 
The user is asking a question about their threat data, equipment, or system information.

You have access to the following data context:
{data_context}

Based on this data, answer the user's question in a clear, concise, and helpful manner.
- If they ask about counts, give specific numbers
- If they ask about specific threats or equipment, provide details
- If they ask for summaries or trends, analyze the data and provide insights
- Be conversational but professional
- Use bullet points for lists
- Include relevant statistics when helpful

If the data doesn't contain the answer, politely explain what information is available.

RESPOND IN JSON:
{{
  "answer": "your helpful response to the user's question",
  "is_data_query": true,
  "query_type": "count|list|summary|detail|comparison",
  "data_used": ["threats", "equipment", "actions", "investigations"]
}}"""

QUERY_CLASSIFIER_PROMPT = """Classify if the user message is:
1. A DATA QUERY - asking about existing data (counts, lists, summaries, statistics, questions about threats/equipment/actions)
2. A THREAT REPORT - reporting a new equipment failure or problem

DATA QUERY examples:
- "How many threats are there?"
- "What pump failures do we have?"
- "Show me critical threats"
- "List all open actions"
- "What equipment has the most issues?"
- "Summary of threats this month"
- "How many high priority items?"

THREAT REPORT examples:
- "Pump P-101 is leaking"
- "There's a strange noise from the compressor"
- "Motor overheating in unit 3"
- "Found damage on heat exchanger"

RESPOND IN JSON ONLY:
{
  "is_data_query": true/false,
  "confidence": 0.0-1.0,
  "query_type": "count|list|summary|detail|comparison|null",
  "entities": ["equipment_type", "status", "priority", "time_period"]
}"""


# ============= AI FUNCTIONS =============

async def classify_user_intent(message: str, session_id: str) -> dict:
    """Classify if the user is asking a data query or reporting a threat."""
    message_lower = message.lower()

    # Fast keyword pre-classification for obvious threat reports
    threat_keywords = ["leak", "broken", "failed", "vibrat", "noise", "overheat", "damage", "issue",
                       "problem", "malfunction", "crack", "corros", "stuck", "fault", "alarm",
                       "reporting", "p-", "c-", "hx-", "pump", "motor", "valve", "compressor"]
    if any(kw in message_lower for kw in threat_keywords):
        return {"is_data_query": False, "confidence": 0.9}

    # Fast keyword pre-classification for obvious data queries
    query_keywords = ["how many", "count", "list", "show me", "what are", "which", "summary",
                      "total", "statistics", "report on", "give me"]
    if any(kw in message_lower for kw in query_keywords):
        return {"is_data_query": True, "confidence": 0.85, "entities": []}

    # Only use AI for ambiguous cases
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{session_id}_classifier",
            system_message=QUERY_CLASSIFIER_PROMPT
        ).with_model("openai", "gpt-4o-mini")

        user_message = UserMessage(text=message)
        response = await chat.send_message(user_message)

        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()

        return json.loads(clean_response)
    except Exception as e:
        logger.error(f"Intent classification failed: {e}")
        return {"is_data_query": False, "confidence": 0.5}


async def get_data_context(user_id: str, query_entities: list = None) -> str:
    """Gather relevant data context for answering data queries."""
    context_parts = []

    threats = await db.threats.find({"created_by": user_id}, {"_id": 0}).to_list(500)

    if threats:
        status_counts = {}
        risk_counts = {}
        equipment_type_counts = {}
        failure_mode_counts = {}
        asset_counts = {}

        for t in threats:
            status_counts[t.get("status", "Unknown")] = status_counts.get(t.get("status", "Unknown"), 0) + 1
            risk_counts[t.get("risk_level", "Unknown")] = risk_counts.get(t.get("risk_level", "Unknown"), 0) + 1
            equipment_type_counts[t.get("equipment_type", "Unknown")] = equipment_type_counts.get(t.get("equipment_type", "Unknown"), 0) + 1
            failure_mode_counts[t.get("failure_mode", "Unknown")] = failure_mode_counts.get(t.get("failure_mode", "Unknown"), 0) + 1
            asset_counts[t.get("asset", "Unknown")] = asset_counts.get(t.get("asset", "Unknown"), 0) + 1

        context_parts.append(f"""
THREATS DATA:
- Total threats: {len(threats)}
- By Status: {json.dumps(status_counts)}
- By Risk Level: {json.dumps(risk_counts)}
- By Equipment Type: {json.dumps(equipment_type_counts)}
- By Failure Mode: {json.dumps(failure_mode_counts)}
- By Asset: {json.dumps(asset_counts)}

Recent Threats (last 10):
""")
        for t in threats[:10]:
            context_parts.append(f"  - {t.get('title', 'Untitled')} | Asset: {t.get('asset', 'N/A')} | Status: {t.get('status', 'N/A')} | Risk: {t.get('risk_level', 'N/A')} | Type: {t.get('equipment_type', 'N/A')}")
    else:
        context_parts.append("THREATS DATA: No threats registered yet.")

    actions = await db.actions.find({"created_by": user_id}, {"_id": 0}).to_list(200)
    if actions:
        action_status_counts = {}
        action_priority_counts = {}
        for a in actions:
            action_status_counts[a.get("status", "Unknown")] = action_status_counts.get(a.get("status", "Unknown"), 0) + 1
            action_priority_counts[a.get("priority", "Unknown")] = action_priority_counts.get(a.get("priority", "Unknown"), 0) + 1
        context_parts.append(f"\n\nACTIONS DATA:\n- Total actions: {len(actions)}\n- By Status: {json.dumps(action_status_counts)}\n- By Priority: {json.dumps(action_priority_counts)}")
    else:
        context_parts.append("\nACTIONS DATA: No actions registered yet.")

    equipment = await db.equipment_nodes.find({"created_by": user_id}, {"_id": 0}).to_list(500)
    if equipment:
        level_counts = {}
        for e in equipment:
            level_counts[e.get("level", "Unknown")] = level_counts.get(e.get("level", "Unknown"), 0) + 1
        context_parts.append(f"\n\nEQUIPMENT DATA:\n- Total equipment nodes: {len(equipment)}\n- By Hierarchy Level: {json.dumps(level_counts)}")
    else:
        context_parts.append("\nEQUIPMENT DATA: No equipment registered yet.")

    investigations = await db.investigations.find({"created_by": user_id}, {"_id": 0}).to_list(100)
    if investigations:
        inv_status_counts = {}
        for inv in investigations:
            inv_status_counts[inv.get("status", "Unknown")] = inv_status_counts.get(inv.get("status", "Unknown"), 0) + 1
        context_parts.append(f"\n\nINVESTIGATIONS DATA:\n- Total investigations: {len(investigations)}\n- By Status: {json.dumps(inv_status_counts)}")
    else:
        context_parts.append("\nINVESTIGATIONS DATA: No investigations yet.")

    return "\n".join(context_parts)


async def answer_data_query(message: str, session_id: str, data_context: str) -> dict:
    """Answer a data query using the provided context."""
    try:
        prompt = DATA_QUERY_SYSTEM_PROMPT.format(data_context=data_context)

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{session_id}_data",
            system_message=prompt
        ).with_model("openai", "gpt-4o-mini")

        user_message = UserMessage(text=message)
        response = await chat.send_message(user_message)

        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()

        return json.loads(clean_response)
    except Exception as e:
        logger.error(f"Data query answer failed: {e}")
        return {"answer": "I'm sorry, I couldn't process your question. Please try rephrasing it.", "is_data_query": True}


async def analyze_threat_with_ai(message: str, session_id: str, image_base64: Optional[str] = None) -> dict:
    """Analyze failure description using AI with fallback for AI unavailability."""
    try:
        model_name = "gpt-5.2"

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=THREAT_ANALYSIS_SYSTEM_PROMPT
        ).with_model("openai", model_name)

        image_context = ""
        if image_base64:
            image_chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"{session_id}_image",
                system_message=IMAGE_ANALYSIS_SYSTEM_PROMPT
            ).with_model("openai", "gpt-4o-mini")

            image_content = ImageContent(image_base64=image_base64)
            image_message = UserMessage(
                text="Analyze this image of equipment failure:",
                file_contents=[image_content]
            )
            image_analysis = await image_chat.send_message(image_message)
            image_context = f"\n\nImage Analysis: {image_analysis}"

        full_message = message + image_context
        user_message = UserMessage(text=full_message)
        response = await chat.send_message(user_message)

        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()

        return json.loads(clean_response)
    except Exception as e:
        error_str = str(e)
        logger.error(f"AI analysis error: {e}")

        # Fallback extraction for budget/gateway errors
        if "502" in error_str or "BadGateway" in error_str or "402" in error_str or "budget" in error_str.lower():
            logger.warning("AI service unavailable, using fallback extraction")
            message_lower = message.lower()

            asset = "Unknown"
            tag_match = re.search(r'\b([A-Z]{1,3}-?\d{2,4}[A-Z]?)\b', message, re.IGNORECASE)
            if tag_match:
                asset = tag_match.group(1).upper()

            failure_mode = "Unknown"
            failure_keywords = ["leak", "vibration", "noise", "overheat", "corrosion", "crack", "wear", "failure", "damage", "broken"]
            for keyword in failure_keywords:
                if keyword in message_lower:
                    failure_mode = keyword.capitalize()
                    break

            return {
                "complete": True,
                "threat": {
                    "title": message[:100] + ("..." if len(message) > 100 else ""),
                    "description": message,
                    "asset": asset,
                    "failure_mode": failure_mode,
                    "equipment_type": "Unknown",
                    "severity": "medium",
                    "impact": "moderate",
                    "detectability": "moderate",
                    "likelihood": "possible"
                },
                "ai_unavailable": True,
                "message": "AI service temporarily unavailable. Threat created with basic extraction - please review and update details."
            }

        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


async def transcribe_audio_with_ai(audio_base64: str) -> str:
    """Transcribe audio using OpenAI Whisper via emergentintegrations."""
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText

        audio_data = base64.b64decode(audio_base64)

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name

        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)

        with open(temp_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json"
                # Language auto-detection enabled (supports Dutch, English, and 50+ languages)
            )

        return response.text

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if 'temp_path' in locals():
            os.unlink(temp_path)
