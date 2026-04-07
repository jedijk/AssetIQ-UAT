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
from openai import OpenAI

from database import db

logger = logging.getLogger(__name__)

def get_openai_client() -> OpenAI:
    """Get OpenAI client with API key from environment."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured in environment")
    return OpenAI(api_key=api_key)

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
        client = get_openai_client()
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": QUERY_CLASSIFIER_PROMPT},
                {"role": "user", "content": message}
            ],
            temperature=0.3
        )

        clean_response = response.choices[0].message.content.strip()
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

        client = get_openai_client()
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": message}
            ],
            temperature=0.5
        )

        clean_response = response.choices[0].message.content.strip()
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
        client = get_openai_client()

        image_context = ""
        if image_base64:
            # Analyze image first using vision model
            image_content = [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                },
                {
                    "type": "text",
                    "text": "Analyze this image of equipment failure:"
                }
            ]
            
            image_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": IMAGE_ANALYSIS_SYSTEM_PROMPT},
                    {"role": "user", "content": image_content}
                ],
                temperature=0.5
            )
            image_analysis = image_response.choices[0].message.content
            image_context = f"\n\nImage Analysis: {image_analysis}"

        full_message = message + image_context
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": THREAT_ANALYSIS_SYSTEM_PROMPT},
                {"role": "user", "content": full_message}
            ],
            temperature=0.5
        )

        clean_response = response.choices[0].message.content.strip()
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


def detect_audio_format(audio_data: bytes) -> str:
    """Detect audio format from magic bytes and return appropriate file extension."""
    if len(audio_data) < 4:
        return ".webm"
    
    # Check magic bytes for common audio formats
    if audio_data[:4] == b'\x1a\x45\xdf\xa3':
        return ".webm"
    elif audio_data[:4] == b'OggS':
        return ".ogg"
    elif audio_data[:4] == b'RIFF':
        return ".wav"
    elif audio_data[:3] == b'ID3' or (len(audio_data) >= 2 and audio_data[:2] == b'\xff\xfb'):
        return ".mp3"
    elif audio_data[:4] == b'fLaC':
        return ".flac"
    elif audio_data[:4] == b'ftyp' or audio_data[4:8] == b'ftyp':
        return ".m4a"
    else:
        # Default to webm as that's what MediaRecorder typically produces
        return ".webm"


async def transcribe_audio_with_ai(audio_base64: str) -> str:
    """Transcribe audio using OpenAI Whisper."""
    temp_path = None
    try:
        client = get_openai_client()

        # Strip data URL prefix if present (e.g., "data:audio/webm;base64,...")
        if ',' in audio_base64:
            audio_base64 = audio_base64.split(',')[1]
        
        # Decode the base64 audio data
        audio_data = base64.b64decode(audio_base64)
        
        # Determine file extension based on magic bytes
        suffix = detect_audio_format(audio_data)
        
        logger.info(f"Detected audio format: {suffix}, data size: {len(audio_data)} bytes")

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_data)
            temp_path = f.name

        with open(temp_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="json"
            )

        return response.text

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)
