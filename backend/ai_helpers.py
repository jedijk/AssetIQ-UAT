"""
AI Helper functions and prompts for threat analysis, chat, and data queries.
"""
import os
import re
import json
import asyncio
import base64
import logging
import tempfile
from pathlib import Path
from typing import Any, Optional
from dotenv import load_dotenv
from fastapi import HTTPException

from database import db
from services.ai_cost_guard import guard_ai_request, record_ai_tokens

logger = logging.getLogger(__name__)


def chat_completions_create(
    client: Any,
    endpoint: str,
    *,
    user_id: str = "system",
    company_id: str = "default",
    installation_id: Optional[str] = None,
    installation_name: Optional[str] = None,
    feature: Optional[str] = None,
    **create_kwargs,
):
    """OpenAI chat completion with rate limits and usage tracking."""
    guard_ai_request(
        user_id=user_id,
        company_id=company_id,
        endpoint=endpoint,
        estimated_tokens=create_kwargs.get("max_tokens") or 1000,
    )
    response = client.chat.completions.create(**create_kwargs)
    usage = getattr(response, "usage", None)
    if usage:
        record_ai_tokens(
            user_id=user_id,
            company_id=company_id,
            endpoint=endpoint,
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            model=create_kwargs.get("model", ""),
            feature=feature or endpoint,
            installation_id=installation_id,
            installation_name=installation_name,
        )
    return response


def get_openai_client():
    """Get OpenAI client with API key from environment."""
    from services.openai_service import get_openai_client as _get_client

    return _get_client()

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
        from services.ai_platform import execute_json_prompt

        result = await execute_json_prompt(
            "chat.query_classifier",
            user={"id": "system", "company_id": "default"},
            user_message=message,
            endpoint="ai_helpers.classify_user_intent",
            model="gpt-4o-mini",
            temperature=0.3,
            default={"is_data_query": False, "confidence": 0.5},
        )
        parsed = result["parsed"]
        if isinstance(parsed, dict) and parsed:
            return parsed
        return {"is_data_query": False, "confidence": 0.5}
    except Exception as e:
        logger.error(f"Intent classification failed: {e}")
        return {"is_data_query": False, "confidence": 0.5}


async def summarize_issue_description(text: str, language: str = "en") -> str:
    """
    Rewrite the operator's issue description as a professional reliability engineer would.
    Supports mixed-language operator input (mirrors their language mix in the summary).
    """
    from utils.text_language import ai_language_instruction

    t = (text or "").strip()
    if not t:
        return ""
    
    try:
        from services.ai_platform import execute_prompt
        from services.ai_prompt_registry import render_prompt
        lang_rule = ai_language_instruction(t, fallback=language or "en")
        result = await execute_prompt(
            "chat.issue_summary",
            user={"id": "system", "company_id": "default"},
            user_message=t[:4000],
            variables={"lang_rule": lang_rule},
            endpoint="ai_helpers.summarize_issue_description",
            model=os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
            temperature=0.2,
            max_tokens=250,
        )
        out = (result["content"] or "").strip()
        if out:
            return out
    except Exception as e:
        logger.warning("summarize_issue_description fallback: %s", e)
    
    # Fallback: return original text
    return t[:280] + ("…" if len(t) > 280 else "")


async def merge_issue_description_with_edit(
    current_issue: str,
    current_summary: str,
    edit_instruction: str,
    language: str = "en",
) -> str:
    """
    Combine the stored operator issue text with a follow-up correction
    (e.g. 'say motor instead of pump') into one updated issue description
    before re-summarizing for confirmation.
    """
    ci = (current_issue or "").strip()
    ed = (edit_instruction or "").strip()
    if not ed:
        return ci
    if not ci:
        return ed

    try:
        from services.ai_platform import execute_prompt

        lang_rule = ai_language_instruction(f"{ci}\n{ed}", fallback=language or "en")
        result = await execute_prompt(
            "chat.issue_merge_edit",
            user={"id": "system", "company_id": "default"},
            user_message=(
                f"ISSUE REPORT:\n{ci[:3500]}\n\n"
                f"SHORT SUMMARY (for context):\n{(current_summary or '(none)')[:800]}\n\n"
                f"OPERATOR CORRECTION / WHAT TO CHANGE:\n{ed[:2000]}\n\n"
                "Updated full issue report:"
            ),
            variables={"lang_rule": lang_rule},
            endpoint="ai_helpers.merge_issue_description_with_edit",
            temperature=0.2,
            max_tokens=500,
        )
        out = (result["content"] or "").strip()
        if out:
            return out
    except Exception as e:
        logger.warning("merge_issue_description_with_edit fallback: %s", e)

    return f"{ci}\n\n(Clarification / correction: {ed})"


async def generate_observation_description(
    user_input: str,
    equipment_name: str = None,
    failure_mode: str = None,
    language: str = "en",
    use_ai: bool = False,
) -> str:
    """
    Generate a professional engineer-style description for an observation.
    
    use_ai: When True, uses AI for better descriptions (slower).
            When False, uses simple template expansion (fast).
    """
    t = (user_input or "").strip()
    if not t:
        return ""
    
    # If AI mode is enabled, use GPT for better descriptions
    if use_ai:
        try:
            from services.ai_platform import execute_prompt
            from utils.text_language import ai_language_instruction

            lang_rule = ai_language_instruction(t, fallback=language or "en")
            context_parts = []
            if equipment_name and equipment_name.lower() not in ["unknown", "to be confirmed"]:
                context_parts.append(f"Equipment: {equipment_name}")
            if failure_mode and failure_mode.lower() not in ["unknown", "unknown / not specified"]:
                context_parts.append(f"Failure mode: {failure_mode}")
            context = "\n".join(context_parts) if context_parts else ""
            
            result = await execute_prompt(
                "chat.observation_description",
                user={"id": "system", "company_id": "default"},
                user_message=f"Issue report: {t[:1000]}\n{context}".strip(),
                variables={"lang_rule": lang_rule},
                endpoint="ai_helpers.generate_observation_description",
                model="gpt-4o-mini",
                temperature=0.3,
                max_tokens=150,
            )
            out = (result["content"] or "").strip()
            if out:
                return out
        except Exception as e:
            logger.warning("generate_observation_description AI fallback: %s", e)
    
    # Fast mode: Simple template-based description (no AI call - instant)
    t_clean = t.replace('"', '').strip()
    
    # Remove equipment name if it's at the start (redundant)
    if equipment_name:
        eq_lower = equipment_name.lower()
        t_lower = t_clean.lower()
        if t_lower.startswith(eq_lower):
            t_clean = t_clean[len(equipment_name):].strip(" :-")
        # Also check for "Reporting issue for equipment X:"
        if "equipment" in t_lower and eq_lower in t_lower:
            # Extract just the issue part after the colon
            if ":" in t_clean:
                t_clean = t_clean.split(":", 1)[-1].strip()
    
    # Capitalize first letter
    if t_clean:
        t_clean = t_clean[0].upper() + t_clean[1:] if len(t_clean) > 1 else t_clean.upper()
    
    # Add period if missing
    if t_clean and not t_clean.endswith(('.', '!', '?')):
        t_clean += "."
    
    return t_clean or t[:500]


async def translate_to_english_for_record(text: str, purpose: str = "threat register") -> str:
    """
    Translate operator-facing text to concise English for stored threats / actions.
    Used when the chat UI was Dutch but the canonical record must be English.
    """
    t = (text or "").strip()
    if not t:
        return ""
    low = t.lower()
    if low in {"unknown / not specified", "unknown", "unknown equipment", "n/a", "—", "-"}:
        return t
    
    # Quick dictionary lookup for common Dutch terms (avoids AI call)
    DUTCH_TO_ENGLISH_QUICK = {
        "oververhitting": "overheating",
        "lekkage": "leakage", 
        "lek": "leak",
        "trillingen": "vibrations",
        "trilling": "vibration",
        "lawaai": "noise",
        "geluid": "noise",
        "storing": "malfunction",
        "defect": "defect",
        "kapot": "broken",
        "schade": "damage",
        "slijtage": "wear",
        "corrosie": "corrosion",
        "breuk": "fracture",
        "blokkade": "blockage",
        "verstopping": "clogging",
        "motor": "motor",
        "moter": "motor",
        "pomp": "pump",
        "ventilator": "fan",
        "compressor": "compressor",
        "lager": "bearing",
        "kraan": "crane",
        "klep": "valve",
        "ventiel": "valve",
    }
    
    # Check if it's a simple term we can translate directly
    if low in DUTCH_TO_ENGLISH_QUICK:
        return DUTCH_TO_ENGLISH_QUICK[low]
    
    # Check if it's already English (common English words)
    english_indicators = ["overheating", "leaking", "broken", "noise", "vibration", 
                          "motor", "pump", "fan", "valve", "bearing", "damage", "failure"]
    if any(eng in low for eng in english_indicators):
        return t  # Already English, return as-is
    
    try:
        from services.ai_platform import execute_prompt

        result = await execute_prompt(
            "chat.translate_record",
            user={"id": "system", "company_id": "default"},
            user_message=t[:500],
            endpoint="ai_helpers.translate_to_english_for_record",
            temperature=0.1,
            max_tokens=100,
        )
        out = (result["content"] or "").strip()
        if out:
            return out
    except Exception as e:
        logger.warning("translate_to_english_for_record fallback: %s", e)
    return t


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

    actions = await db.central_actions.find({"created_by": user_id}, {"_id": 0}).to_list(200)
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
    from services.ai_platform import execute_json_prompt

    try:
        result = await execute_json_prompt(
            "chat.data_query",
            user={"id": "system", "company_id": "default"},
            user_message=message,
            variables={"data_context": data_context},
            endpoint="ai_helpers.answer_data_query",
            model="gpt-4o-mini",
            temperature=0.5,
            default={"answer": "I'm sorry, I couldn't process your question. Please try rephrasing it.", "is_data_query": True},
        )
        parsed = result["parsed"]
        if isinstance(parsed, dict) and parsed:
            return parsed
        return {"answer": "I'm sorry, I couldn't process your question. Please try rephrasing it.", "is_data_query": True}
    except Exception as e:
        logger.error(f"Data query answer failed: {e}")
        return {"answer": "I'm sorry, I couldn't process your question. Please try rephrasing it.", "is_data_query": True}


async def analyze_threat_with_ai(message: str, session_id: str, image_base64: Optional[str] = None) -> dict:
    """Analyze failure description using AI with fallback for AI unavailability."""
    try:
        image_context = ""
        if image_base64:
            from services.ai_platform import execute_multimodal_json_prompt

            image_content = [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                },
                {
                    "type": "text",
                    "text": "Analyze this image of equipment failure:",
                },
            ]

            image_result = await execute_multimodal_json_prompt(
                "chat.image_analysis",
                user={"id": "system", "company_id": "default"},
                user_content=image_content,
                endpoint="ai_helpers.analyze_threat_image",
                model="gpt-4o-mini",
                temperature=0.5,
            )
            image_analysis = (image_result.get("content") or "").strip()
            image_context = f"\n\nImage Analysis: {image_analysis}"

        full_message = message + image_context

        from services.ai_platform import execute_json_prompt

        result = await execute_json_prompt(
            "chat.threat_extraction",
            user={"id": "system", "company_id": "default"},
            user_message=full_message,
            endpoint="ai_helpers.analyze_threat_with_ai",
            model="gpt-4o",
            temperature=0.5,
        )
        parsed = result["parsed"]
        return parsed if isinstance(parsed, dict) and parsed else {}
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



async def analyze_attachment_image(image_base64: str, threat_context: str) -> dict:
    """Analyze an image attachment for an existing observation and return findings + action recommendations."""
    try:
        from services.ai_platform import execute_multimodal_json_prompt

        user_content = [
            {"type": "text", "text": f"Observation context: {threat_context}"},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
        ]
        result = await execute_multimodal_json_prompt(
            "chat.attachment_analysis",
            user={"id": "system", "company_id": "default"},
            user_content=user_content,
            endpoint="ai_helpers.analyze_attachment_image",
            model="gpt-4o",
            temperature=0.3,
            max_tokens=500,
        )
        parsed = result.get("parsed")
        if not parsed or not isinstance(parsed, dict):
            raise ValueError("empty JSON from attachment analysis")
        logger.info(f"Image analysis complete: severity={parsed.get('severity')}, actions={len(parsed.get('recommended_actions', []))}")
        return parsed

    except Exception as e:
        logger.error(f"Image analysis failed: {e}")
        return None


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


async def transcribe_audio_with_ai(
    audio_base64: str,
    *,
    user_id: str = "system",
    company_id: str = "default",
    installation_id: Optional[str] = None,
    installation_name: Optional[str] = None,
    language: Optional[str] = None,
) -> str:
    """Transcribe audio in the original spoken language using OpenAI Whisper.
    
    Supports mixed languages (e.g. Dutch + English technical terms) by NOT forcing translation.
    If `language` is provided (e.g. 'en', 'nl'), Whisper uses it as a hint; otherwise it auto-detects.
    """
    try:
        if "," in audio_base64:
            audio_base64 = audio_base64.split(",", 1)[1]

        audio_data = base64.b64decode(audio_base64)
        suffix = detect_audio_format(audio_data)
        logger.info(
            "Detected audio format: %s, data size: %s bytes, language hint: %s",
            suffix,
            len(audio_data),
            language,
        )

        from services.ai_gateway import transcribe_audio as gateway_transcribe

        return await gateway_transcribe(
            audio_data,
            filename=f"audio{suffix}",
            language=language if language in ("en", "nl") else None,
            user_id=user_id,
            company_id=company_id,
            endpoint="ai_helpers.transcribe_audio",
            installation_id=installation_id,
            installation_name=installation_name,
        )

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
