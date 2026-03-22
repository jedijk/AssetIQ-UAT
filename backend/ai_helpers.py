"""
AI Helper functions and prompts for threat analysis, chat, and data queries
"""
import os
import json
import base64
import logging
import tempfile
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from routes.deps import db

logger = logging.getLogger(__name__)
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# ============= SYSTEM PROMPTS =============

THREAT_ANALYSIS_SYSTEM_PROMPT = """You are ThreatBase AI, helping reliability engineers capture equipment failures.

Your job is to extract information from what the user writes and create a threat record.

## CRITICAL: EXTRACT BEFORE ASKING
Before asking ANY question, carefully analyze the user's message for:
- Equipment names (P-101, Pump 1, compressor, motor, etc.)
- Problems/symptoms (leaking, vibrating, noisy, hot, broken, failing, etc.)
- Locations (Area A, Unit 2, Building 3, etc.)

## Required Information (only 2 fields):
1. **Asset**: Equipment tag or name - EXTRACT from message if mentioned in ANY form
2. **Failure**: What's wrong - EXTRACT any problem description from the message

## Response Rules:
- If the message contains BOTH an equipment reference AND a problem description: Mark COMPLETE
- If ONLY the asset is unclear: Ask "Which equipment is affected?"
- If ONLY the failure is unclear: Ask "What's the problem?"
- NEVER ask for information already in the message
- NEVER ask multiple questions
- Use common sense to interpret informal descriptions

## Auto-fill from your expertise:
- Equipment Type: Infer from asset name (P-xxx = Pump, C-xxx = Compressor, etc.)
- Failure Mode: Standard FMEA failure mode based on description
- Risk Level: Based on failure type and equipment criticality
- Recommended Actions: 2-3 practical actions

## Risk Scoring (FMEA):
- Severity: Safety=10, Production=8, Equipment=6
- Occurrence: First=2, Rare=4, Occasional=6, Frequent=8
- Detection: Easy=3, Moderate=5, Difficult=7
- Score = (S * O * D) / 10, max 100
- Critical: >=70, High: >=50, Medium: >=30, Low: <30

RESPOND IN JSON ONLY:
{
  "complete": true/false,
  "follow_up_question": "single question if complete=false",
  "question_type": "asset|failure",
  "extracted_asset": "what you found in message or null",
  "extracted_failure": "what you found in message or null",
  "threat": {
    "title": "concise title",
    "asset": "equipment tag",
    "equipment_type": "type",
    "failure_mode": "standard failure mode",
    "cause": "root cause if known",
    "impact": "Safety Hazard|Production Loss|Equipment Damage|Environmental",
    "frequency": "First Time|Rare|Occasional|Frequent",
    "likelihood": "Low|Medium|High",
    "detectability": "Easy|Moderate|Difficult",
    "location": "location if mentioned",
    "risk_score": number,
    "risk_level": "Critical|High|Medium|Low",
    "recommended_actions": ["action1", "action2"]
  }
}"""

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
    """Classify if the user is asking a data query or reporting a threat"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{session_id}_classifier",
            system_message=QUERY_CLASSIFIER_PROMPT
        ).with_model("openai", "gpt-5.2")
        
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
    """Gather relevant data context for answering data queries"""
    context_parts = []
    
    # Get threats summary
    threats = await db.threats.find({"created_by": user_id}, {"_id": 0}).to_list(500)
    
    if threats:
        status_counts = {}
        risk_counts = {}
        equipment_type_counts = {}
        
        for t in threats:
            status = t.get("status", "Unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
            risk = t.get("risk_level", "Unknown")
            risk_counts[risk] = risk_counts.get(risk, 0) + 1
            eq_type = t.get("equipment_type", "Unknown")
            equipment_type_counts[eq_type] = equipment_type_counts.get(eq_type, 0) + 1
        
        context_parts.append(f"""
THREATS DATA:
- Total threats: {len(threats)}
- By Status: {json.dumps(status_counts)}
- By Risk Level: {json.dumps(risk_counts)}
- By Equipment Type: {json.dumps(equipment_type_counts)}
""")
    else:
        context_parts.append("THREATS DATA: No threats registered yet.")
    
    # Get actions summary
    actions = await db.actions.find({"created_by": user_id}, {"_id": 0}).to_list(200)
    if actions:
        action_status_counts = {}
        for a in actions:
            status = a.get("status", "Unknown")
            action_status_counts[status] = action_status_counts.get(status, 0) + 1
        context_parts.append(f"\nACTIONS DATA:\n- Total actions: {len(actions)}\n- By Status: {json.dumps(action_status_counts)}")
    
    # Get equipment summary
    equipment = await db.equipment_nodes.find({"created_by": user_id}, {"_id": 0}).to_list(500)
    if equipment:
        level_counts = {}
        for e in equipment:
            level = e.get("level", "Unknown")
            level_counts[level] = level_counts.get(level, 0) + 1
        context_parts.append(f"\nEQUIPMENT DATA:\n- Total equipment nodes: {len(equipment)}\n- By Hierarchy Level: {json.dumps(level_counts)}")
    
    return "\n".join(context_parts)


async def answer_data_query(message: str, session_id: str, data_context: str) -> dict:
    """Answer a data query using the provided context"""
    try:
        prompt = DATA_QUERY_SYSTEM_PROMPT.format(data_context=data_context)
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{session_id}_data",
            system_message=prompt
        ).with_model("openai", "gpt-5.2")
        
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
        return {"answer": "I'm sorry, I couldn't process your question.", "is_data_query": True}


async def analyze_threat_with_ai(message: str, session_id: str, image_base64: Optional[str] = None) -> dict:
    """Analyze failure description using GPT-5.2"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=THREAT_ANALYSIS_SYSTEM_PROMPT
        ).with_model("openai", "gpt-5.2")
        
        image_context = ""
        if image_base64:
            image_chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"{session_id}_image",
                system_message=IMAGE_ANALYSIS_SYSTEM_PROMPT
            ).with_model("openai", "gpt-5.2")
            
            image_content = ImageContent(image_base64=image_base64)
            image_message = UserMessage(text="Analyze this image of equipment failure:", image_contents=[image_content])
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
        logger.error(f"AI analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


async def transcribe_audio_with_ai(audio_base64: str) -> str:
    """Transcribe audio using OpenAI Whisper"""
    try:
        import httpx
        
        audio_data = base64.b64decode(audio_base64)
        
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name
        
        async with httpx.AsyncClient() as client:
            with open(temp_path, "rb") as audio_file:
                response = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {EMERGENT_LLM_KEY}"},
                    files={"file": ("audio.webm", audio_file, "audio/webm")},
                    data={"model": "whisper-1"}
                )
                if response.status_code == 200:
                    result = response.json()
                    return result.get("text", "")
                else:
                    logger.error(f"Whisper API error: {response.text}")
                    raise HTTPException(status_code=500, detail="Transcription failed")
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if 'temp_path' in locals():
            os.unlink(temp_path)
