from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Header, Response, Body
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import base64
import requests
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from failure_modes import (
    FAILURE_MODES_LIBRARY, 
    find_matching_failure_modes,
    find_failure_modes_flexible,
    get_failure_modes_by_category,
    get_all_categories,
    get_all_equipment_types
)
from iso14224_models import (
    ISOLevel, ISO_LEVEL_ORDER, EQUIPMENT_TYPES, CRITICALITY_PROFILES, Discipline,
    get_valid_parent_level, get_valid_child_levels, is_valid_parent_child, normalize_level,
    EquipmentNodeCreate, EquipmentNodeUpdate, CriticalityAssignment, MoveNodeRequest,
    UnstructuredItemCreate, ParseEquipmentListRequest, AssignToHierarchyRequest,
    detect_equipment_type, EquipmentTypeCreate, EquipmentTypeUpdate
)
from investigation_models import (
    InvestigationCreate, InvestigationUpdate, InvestigationStatus,
    TimelineEventCreate, TimelineEventUpdate, EventCategory, ConfidenceLevel,
    FailureIdentificationCreate, FailureIdentificationUpdate,
    CauseNodeCreate, CauseNodeUpdate, CauseCategory,
    ActionItemCreate, ActionItemUpdate, ActionPriority, ActionStatus,
    EvidenceCreate
)
from maintenance_strategy_models import (
    MaintenanceStrategy, CriticalityLevel, MaintenanceFrequency,
    MaintenanceStrategyCreate, MaintenanceStrategyUpdate, GenerateStrategyRequest,
    GenerateAllStrategiesRequest
)
from maintenance_strategy_generator import MaintenanceStrategyGenerator

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'default_secret_key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# LLM Config
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Object Storage Config
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "reliabilityos"
storage_key = None

def init_storage():
    """Initialize storage and get session key."""
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        logger.warning("EMERGENT_LLM_KEY not set, storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized successfully")
        return storage_key
    except Exception as e:
        logger.error(f"Failed to initialize storage: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload file to object storage."""
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    """Download file from object storage."""
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
    "doc": "application/msword", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "json": "application/json", "csv": "text/csv", "txt": "text/plain"
}

# Create the main app
app = FastAPI(title="ThreatBase API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============= MODELS =============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: str

class TokenResponse(BaseModel):
    token: str
    user: UserResponse

class ChatMessageCreate(BaseModel):
    content: str
    image_base64: Optional[str] = None

class ThreatResponse(BaseModel):
    id: str
    title: str
    asset: str
    equipment_type: str
    failure_mode: str
    cause: Optional[str] = None
    impact: str
    frequency: str
    likelihood: str
    detectability: str
    risk_level: str
    risk_score: int
    rank: int
    total_threats: int
    status: str
    recommended_actions: List[str]
    created_by: str
    created_at: str
    occurrence_count: int
    image_url: Optional[str] = None
    location: Optional[str] = None

class ThreatUpdate(BaseModel):
    title: Optional[str] = None
    asset: Optional[str] = None
    equipment_type: Optional[str] = None
    failure_mode: Optional[str] = None
    cause: Optional[str] = None
    impact: Optional[str] = None
    frequency: Optional[str] = None
    likelihood: Optional[str] = None
    detectability: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    recommended_actions: Optional[List[str]] = None

class ChatResponse(BaseModel):
    message: str
    threat: Optional[ThreatResponse] = None
    follow_up_question: Optional[str] = None
    question_type: Optional[str] = None  # asset, location, photo, frequency, impact, details

class VoiceTranscriptionResponse(BaseModel):
    text: str

# ============= AUTH HELPERS =============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============= AI HELPERS =============

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
- Use common sense to interpret informal descriptions (e.g., "pump is acting up" = pump with operational issues)

## Examples of extraction:
- "P-101 is leaking" → Asset: P-101, Failure: leaking → COMPLETE
- "grinding noise from main pump" → Asset: main pump, Failure: grinding noise → COMPLETE  
- "the compressor in unit 3 overheats" → Asset: compressor (unit 3), Failure: overheating → COMPLETE
- 'Reporting issue for equipment "Production Unit A": vibration detected' → Asset: Production Unit A, Failure: vibration → COMPLETE
- 'Reporting issue for equipment "Pump P-101": seal leak' → Asset: Pump P-101, Failure: seal leak → COMPLETE
- "something wrong with equipment" → Need to ask which equipment AND what's wrong
- "pump has issues" → Asset: pump, but failure unclear → Ask what's wrong

## IMPORTANT: Equipment Name Extraction
- If message contains 'Reporting issue for equipment "X"', extract X exactly as the asset name
- If message contains 'Issue with X:', extract X exactly as the asset name
- Preserve the full equipment name including any prefixes or suffixes

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
  "entities": ["equipment_type", "status", "priority", "time_period"] // what they're asking about
}"""


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
        
        # Parse JSON response
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
    threats = await db.threats.find(
        {"created_by": user_id},
        {"_id": 0}
    ).to_list(500)
    
    if threats:
        # Count by status
        status_counts = {}
        risk_counts = {}
        equipment_type_counts = {}
        failure_mode_counts = {}
        asset_counts = {}
        
        for t in threats:
            status = t.get("status", "Unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
            
            risk = t.get("risk_level", "Unknown")
            risk_counts[risk] = risk_counts.get(risk, 0) + 1
            
            eq_type = t.get("equipment_type", "Unknown")
            equipment_type_counts[eq_type] = equipment_type_counts.get(eq_type, 0) + 1
            
            failure = t.get("failure_mode", "Unknown")
            failure_mode_counts[failure] = failure_mode_counts.get(failure, 0) + 1
            
            asset = t.get("asset", "Unknown")
            asset_counts[asset] = asset_counts.get(asset, 0) + 1
        
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
    
    # Get actions summary
    actions = await db.actions.find(
        {"created_by": user_id},
        {"_id": 0}
    ).to_list(200)
    
    if actions:
        action_status_counts = {}
        action_priority_counts = {}
        
        for a in actions:
            status = a.get("status", "Unknown")
            action_status_counts[status] = action_status_counts.get(status, 0) + 1
            
            priority = a.get("priority", "Unknown")
            action_priority_counts[priority] = action_priority_counts.get(priority, 0) + 1
        
        context_parts.append(f"""

ACTIONS DATA:
- Total actions: {len(actions)}
- By Status: {json.dumps(action_status_counts)}
- By Priority: {json.dumps(action_priority_counts)}
""")
    else:
        context_parts.append("\nACTIONS DATA: No actions registered yet.")
    
    # Get equipment summary
    equipment = await db.equipment_nodes.find(
        {"created_by": user_id},
        {"_id": 0}
    ).to_list(500)
    
    if equipment:
        level_counts = {}
        for e in equipment:
            level = e.get("level", "Unknown")
            level_counts[level] = level_counts.get(level, 0) + 1
        
        context_parts.append(f"""

EQUIPMENT DATA:
- Total equipment nodes: {len(equipment)}
- By Hierarchy Level: {json.dumps(level_counts)}
""")
    else:
        context_parts.append("\nEQUIPMENT DATA: No equipment registered yet.")
    
    # Get investigations summary
    investigations = await db.investigations.find(
        {"created_by": user_id},
        {"_id": 0}
    ).to_list(100)
    
    if investigations:
        inv_status_counts = {}
        for inv in investigations:
            status = inv.get("status", "Unknown")
            inv_status_counts[status] = inv_status_counts.get(status, 0) + 1
        
        context_parts.append(f"""

INVESTIGATIONS DATA:
- Total investigations: {len(investigations)}
- By Status: {json.dumps(inv_status_counts)}
""")
    else:
        context_parts.append("\nINVESTIGATIONS DATA: No investigations yet.")
    
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
        
        # Parse JSON response
        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()
        
        return json.loads(clean_response)
    except Exception as e:
        logger.error(f"Data query answer failed: {e}")
        return {
            "answer": "I'm sorry, I couldn't process your question. Please try rephrasing it.",
            "is_data_query": True
        }

async def analyze_threat_with_ai(message: str, session_id: str, image_base64: Optional[str] = None) -> dict:
    """Analyze failure description using GPT-5.2"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=THREAT_ANALYSIS_SYSTEM_PROMPT
        ).with_model("openai", "gpt-5.2")
        
        # If image provided, first analyze it
        image_context = ""
        if image_base64:
            image_chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"{session_id}_image",
                system_message=IMAGE_ANALYSIS_SYSTEM_PROMPT
            ).with_model("openai", "gpt-5.2")
            
            image_content = ImageContent(image_base64=image_base64)
            image_message = UserMessage(
                text="Analyze this image of equipment failure:",
                image_contents=[image_content]
            )
            image_analysis = await image_chat.send_message(image_message)
            image_context = f"\n\nImage Analysis: {image_analysis}"
        
        full_message = message + image_context
        user_message = UserMessage(text=full_message)
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        import json
        # Clean response - remove markdown code blocks if present
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
    """Transcribe audio using OpenAI Whisper via emergentintegrations"""
    try:
        import tempfile
        import aiofiles
        
        # Decode base64 audio
        audio_data = base64.b64decode(audio_base64)
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name
        
        # Use OpenAI Whisper API directly
        import httpx
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

async def calculate_rank(risk_score: int, user_id: str) -> tuple:
    """Calculate threat rank based on risk score"""
    total = await db.threats.count_documents({"created_by": user_id, "status": {"$ne": "Closed"}})
    higher = await db.threats.count_documents({
        "created_by": user_id,
        "status": {"$ne": "Closed"},
        "risk_score": {"$gt": risk_score}
    })
    return higher + 1, total + 1

async def update_all_ranks(user_id: str):
    """Recalculate ranks for all open threats"""
    threats = await db.threats.find(
        {"created_by": user_id, "status": {"$ne": "Closed"}},
        {"_id": 0}
    ).sort("risk_score", -1).to_list(1000)
    
    total = len(threats)
    for idx, threat in enumerate(threats):
        await db.threats.update_one(
            {"id": threat["id"]},
            {"$set": {"rank": idx + 1, "total_threats": total}}
        )


async def recalculate_threat_scores_for_asset(asset_name: str, user_id: str, new_criticality: dict = None):
    """
    Recalculate risk scores for all threats linked to a specific asset when criticality changes.
    Uses the 4-dimension criticality model (safety, production, environmental, reputation).
    """
    # Find all threats for this asset
    threats = await db.threats.find(
        {"asset": asset_name, "created_by": user_id}
    ).to_list(1000)
    
    if not threats:
        return 0
    
    # Get criticality multiplier from 4-dimension model
    if new_criticality:
        # Calculate multiplier based on max dimension impact
        max_impact = max(
            new_criticality.get("safety_impact", 0) or 0,
            new_criticality.get("production_impact", 0) or 0,
            new_criticality.get("environmental_impact", 0) or 0,
            new_criticality.get("reputation_impact", 0) or 0
        )
        
        # Map max impact (1-5) to multiplier (1.0-1.5)
        if max_impact >= 5:
            criticality_multiplier = 1.5
            criticality_level = "safety_critical"
        elif max_impact >= 4:
            criticality_multiplier = 1.4
            criticality_level = "production_critical"
        elif max_impact >= 3:
            criticality_multiplier = 1.2
            criticality_level = "medium"
        elif max_impact >= 2:
            criticality_multiplier = 1.1
            criticality_level = "low"
        else:
            criticality_multiplier = 1.0
            criticality_level = "low"
    else:
        criticality_multiplier = 1.0
        criticality_level = "low"
    
    updated_count = 0
    for threat in threats:
        # Get base risk score (or calculate from FMEA if stored failure mode matches)
        base_risk_score = threat.get("base_risk_score", threat.get("risk_score", 50))
        
        # Look up FMEA scores if failure mode is linked
        failure_mode_name = threat.get("failure_mode")
        if failure_mode_name and failure_mode_name != "Unknown":
            # Search for matching failure mode in library
            fm_match = None
            for fm in FAILURE_MODES_LIBRARY:
                if fm["failure_mode"].lower() == failure_mode_name.lower():
                    fm_match = fm
                    break
            
            if fm_match:
                # Calculate RPN-based score: (S × O × D) / 10, capped at 100
                rpn_score = (fm_match["severity"] * fm_match["occurrence"] * fm_match["detectability"]) / 10
                base_risk_score = min(100, int(rpn_score))
        
        # Apply criticality multiplier
        adjusted_risk_score = min(100, int(base_risk_score * criticality_multiplier))
        
        # Determine risk level
        if adjusted_risk_score >= 70:
            risk_level = "Critical"
        elif adjusted_risk_score >= 50:
            risk_level = "High"
        elif adjusted_risk_score >= 30:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        # Update threat
        await db.threats.update_one(
            {"id": threat["id"]},
            {"$set": {
                "risk_score": adjusted_risk_score,
                "base_risk_score": base_risk_score,
                "risk_level": risk_level,
                "equipment_criticality": criticality_level
            }}
        )
        updated_count += 1
    
    # Update all ranks after score changes
    await update_all_ranks(user_id)
    
    return updated_count


async def recalculate_threat_scores_for_failure_mode(failure_mode_name: str, new_severity: int, new_occurrence: int, new_detectability: int):
    """
    Recalculate risk scores for all threats linked to a specific failure mode when FMEA scores change.
    """
    # Find all threats with this failure mode
    threats = await db.threats.find(
        {"failure_mode": {"$regex": f"^{failure_mode_name}$", "$options": "i"}}
    ).to_list(1000)
    
    if not threats:
        return 0
    
    # Calculate new base risk score from FMEA: (S × O × D) / 10
    new_base_score = min(100, int((new_severity * new_occurrence * new_detectability) / 10))
    
    CRITICALITY_MULTIPLIERS = {
        "safety_critical": 1.5,
        "production_critical": 1.4,
        "medium": 1.2,
        "low": 1.0
    }
    
    updated_count = 0
    users_updated = set()
    
    for threat in threats:
        # Get criticality multiplier
        criticality_level = threat.get("equipment_criticality", "low")
        multiplier = CRITICALITY_MULTIPLIERS.get(criticality_level, 1.0)
        
        # Calculate adjusted score
        adjusted_risk_score = min(100, int(new_base_score * multiplier))
        
        # Determine risk level
        if adjusted_risk_score >= 70:
            risk_level = "Critical"
        elif adjusted_risk_score >= 50:
            risk_level = "High"
        elif adjusted_risk_score >= 30:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        # Update threat
        await db.threats.update_one(
            {"id": threat["id"]},
            {"$set": {
                "risk_score": adjusted_risk_score,
                "base_risk_score": new_base_score,
                "risk_level": risk_level
            }}
        )
        updated_count += 1
        users_updated.add(threat.get("created_by"))
    
    # Update ranks for all affected users
    for user_id in users_updated:
        if user_id:
            await update_all_ranks(user_id)
    
    return updated_count

# ============= AUTH ENDPOINTS =============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "password_hash": hash_password(user_data.password),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    return TokenResponse(
        token=token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            name=user_data.name,
            created_at=user_doc["created_at"]
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user["id"])
    return TokenResponse(
        token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        created_at=current_user["created_at"]
    )

# ============= CHAT ENDPOINTS =============

@api_router.post("/chat/send", response_model=ChatResponse)
async def send_chat_message(
    message: ChatMessageCreate,
    current_user: dict = Depends(get_current_user)
):
    session_id = f"user_{current_user['id']}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    
    # Store user message
    chat_msg = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "role": "user",
        "content": message.content,
        "has_image": message.image_base64 is not None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(chat_msg)
    
    # First, classify the user's intent (data query vs threat report)
    # Skip classification if there's an image (likely a threat report)
    if not message.image_base64:
        intent = await classify_user_intent(message.content, session_id)
        
        if intent.get("is_data_query", False) and intent.get("confidence", 0) > 0.6:
            # Handle as a data query
            data_context = await get_data_context(current_user["id"], intent.get("entities"))
            query_response = await answer_data_query(message.content, session_id, data_context)
            
            answer = query_response.get("answer", "I couldn't find the information you're looking for.")
            
            # Store AI response
            ai_response = {
                "id": str(uuid.uuid4()),
                "user_id": current_user["id"],
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
    
    # Get recent conversation context for follow-up questions
    recent_messages = await db.chat_messages.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    # Build context from recent messages
    context = ""
    if len(recent_messages) > 1:
        context = "\n\nPrevious conversation context:\n"
        for msg in reversed(recent_messages[1:6]):  # Last 5 messages excluding current
            role = "User" if msg["role"] == "user" else "Assistant"
            context += f"{role}: {msg['content'][:200]}\n"
    
    # Analyze with AI for threat reporting
    analysis = await analyze_threat_with_ai(
        message.content + context, 
        session_id, 
        message.image_base64
    )
    
    if not analysis.get("complete", False):
        # Need more info - return follow-up question
        question = analysis.get("follow_up_question", "Could you provide more details about the failure?")
        question_type = analysis.get("question_type", "details")
        
        # Add helpful prompts based on question type
        if question_type == "photo":
            question += "\n\n💡 Tip: Use the camera button to attach a photo."
        elif question_type == "location":
            question += "\n\n💡 Tip: Include area, unit, or building name."
        
        ai_response = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "role": "assistant",
            "content": question,
            "question_type": question_type,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.chat_messages.insert_one(ai_response)
        
        return ChatResponse(
            message=question,
            follow_up_question=analysis.get("follow_up_question"),
            question_type=question_type
        )
    
    # Create threat
    threat_data = analysis.get("threat", {})
    asset_name = threat_data.get("asset", "Unknown")
    
    # Get all equipment nodes for this user (including criticality)
    all_equipment_nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0, "name": 1, "level": 1, "id": 1, "criticality": 1}
    ).to_list(200)
    
    # Try to resolve partial tag name to full equipment name
    hierarchy_node = None
    resolved_asset_name = asset_name
    
    # First try exact match
    for node in all_equipment_nodes:
        if node["name"].lower() == asset_name.lower():
            hierarchy_node = node
            resolved_asset_name = node["name"]
            break
    
    # If no exact match, try partial match (tag number like P-101, C-201, HX-301)
    if not hierarchy_node:
        asset_lower = asset_name.lower()
        matches = []
        
        for node in all_equipment_nodes:
            node_name_lower = node["name"].lower()
            # Check if asset name is contained in node name or vice versa
            if asset_lower in node_name_lower or node_name_lower in asset_lower:
                matches.append(node)
            # Check for tag pattern match (e.g., "P-101" matches "Cooling Water Pump P-101")
            elif any(part.lower() == asset_lower for part in node["name"].split()):
                matches.append(node)
            # Check if tag number appears anywhere in the name
            elif asset_lower.replace(" ", "").replace("-", "") in node_name_lower.replace(" ", "").replace("-", ""):
                matches.append(node)
        
        if len(matches) == 1:
            # Single match found - use it
            hierarchy_node = matches[0]
            resolved_asset_name = matches[0]["name"]
        elif len(matches) > 1:
            # Multiple matches - pick equipment-level nodes first, or the shortest name
            equipment_matches = [m for m in matches if m.get("level") in ["equipment_unit", "equipment", "subunit", "maintainable_item"]]
            if equipment_matches:
                matches = equipment_matches
            # Sort by name length and pick shortest (most specific match)
            matches.sort(key=lambda x: len(x["name"]))
            hierarchy_node = matches[0]
            resolved_asset_name = matches[0]["name"]
    
    if not hierarchy_node:
        # Asset not found in hierarchy - create threat anyway but flag it
        # This allows users to report threats quickly without rigid hierarchy matching
        resolved_asset_name = asset_name
        hierarchy_node = {}  # Empty dict, threat created without hierarchy link
    
    # Get equipment criticality from hierarchy node
    equipment_criticality = hierarchy_node.get("criticality", {}) if hierarchy_node else {}
    criticality_level = equipment_criticality.get("level") if equipment_criticality else None
    
    # Criticality multipliers for risk score adjustment
    CRITICALITY_MULTIPLIERS = {
        "safety_critical": 1.5,      # 50% increase
        "production_critical": 1.3,  # 30% increase
        "medium": 1.1,               # 10% increase
        "low": 1.0                   # No adjustment
    }
    
    rank, total = await calculate_rank(threat_data.get("risk_score", 50), current_user["id"])
    
    threat_id = str(uuid.uuid4())
    risk_score_raw = threat_data.get("risk_score", 50)
    base_risk_score = int(risk_score_raw) if isinstance(risk_score_raw, (int, float)) else 50
    
    # Adjust risk score based on equipment criticality
    criticality_multiplier = CRITICALITY_MULTIPLIERS.get(criticality_level, 1.0)
    adjusted_risk_score = min(100, int(base_risk_score * criticality_multiplier))
    
    # Determine risk level based on adjusted score
    if adjusted_risk_score >= 70:
        adjusted_risk_level = "Critical"
    elif adjusted_risk_score >= 50:
        adjusted_risk_level = "High"
    elif adjusted_risk_score >= 30:
        adjusted_risk_level = "Medium"
    else:
        adjusted_risk_level = "Low"
    
    threat_doc = {
        "id": threat_id,
        "title": threat_data.get("title", "Unknown Threat"),
        "asset": resolved_asset_name,  # Use resolved full name from hierarchy
        "linked_equipment_id": hierarchy_node.get("id") if hierarchy_node else None,  # Link to equipment node
        "equipment_type": threat_data.get("equipment_type", "Unknown"),
        "equipment_criticality": criticality_level,  # Store equipment criticality
        "equipment_criticality_data": {
            "safety_impact": equipment_criticality.get("safety_impact", 0),
            "production_impact": equipment_criticality.get("production_impact", 0),
            "environmental_impact": equipment_criticality.get("environmental_impact", 0),
            "reputation_impact": equipment_criticality.get("reputation_impact", 0),
            "level": criticality_level,
            "multiplier": criticality_multiplier
        } if equipment_criticality else None,
        "failure_mode": threat_data.get("failure_mode", "Unknown"),
        "cause": threat_data.get("cause"),
        "impact": threat_data.get("impact", "Equipment Damage"),
        "frequency": threat_data.get("frequency", "First Time"),
        "likelihood": threat_data.get("likelihood", "Medium"),
        "detectability": threat_data.get("detectability", "Moderate"),
        "risk_level": adjusted_risk_level,  # Use adjusted risk level
        "risk_score": adjusted_risk_score,  # Use adjusted risk score
        "base_risk_score": base_risk_score,  # Store original score for reference
        "rank": rank,
        "total_threats": total,
        "status": "Open",
        "recommended_actions": threat_data.get("recommended_actions", []),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "occurrence_count": 1,
        "image_url": None,
        "location": threat_data.get("location")
    }
    await db.threats.insert_one(threat_doc)
    
    # Update ranks for all threats
    await update_all_ranks(current_user["id"])
    
    # Get updated threat
    updated_threat = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    # Ensure risk_score is int
    if isinstance(updated_threat.get("risk_score"), float):
        updated_threat["risk_score"] = int(updated_threat["risk_score"])
    
    # Store AI response with threat summary details
    response_text = "Threat recorded successfully."
    
    ai_response = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "role": "assistant",
        "content": response_text,
        "threat_id": threat_id,
        "threat_title": updated_threat["title"],
        "threat_asset": updated_threat["asset"],
        "threat_equipment_type": updated_threat["equipment_type"],
        "threat_equipment_criticality": updated_threat.get("equipment_criticality"),
        "threat_failure_mode": updated_threat["failure_mode"],
        "threat_risk_level": updated_threat["risk_level"],
        "threat_risk_score": updated_threat["risk_score"],
        "threat_rank": updated_threat["rank"],
        "threat_location": updated_threat.get("location"),
        "threat_summary": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(ai_response)
    
    return ChatResponse(
        message=response_text,
        threat=ThreatResponse(**updated_threat)
    )

@api_router.get("/chat/history")
async def get_chat_history(
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    messages = await db.chat_messages.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(messages))

# ============= VOICE ENDPOINT =============

@api_router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(
    audio_base64: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    text = await transcribe_audio_with_ai(audio_base64)
    return VoiceTranscriptionResponse(text=text)

# ============= THREAT ENDPOINTS =============

@api_router.get("/threats", response_model=List[ThreatResponse])
async def get_threats(
    status: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    query = {"created_by": current_user["id"]}
    if status:
        query["status"] = status
    
    threats = await db.threats.find(query, {"_id": 0}).sort("rank", 1).limit(limit).to_list(limit)
    # Ensure risk_score is int
    for t in threats:
        if isinstance(t.get("risk_score"), float):
            t["risk_score"] = int(t["risk_score"])
    return threats

@api_router.get("/threats/top", response_model=List[ThreatResponse])
async def get_top_threats(
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    threats = await db.threats.find(
        {"created_by": current_user["id"], "status": {"$ne": "Closed"}},
        {"_id": 0}
    ).sort("risk_score", -1).limit(limit).to_list(limit)
    # Ensure risk_score is int
    for t in threats:
        if isinstance(t.get("risk_score"), float):
            t["risk_score"] = int(t["risk_score"])
    return threats


@api_router.post("/threats/recalculate-scores")
async def recalculate_all_threat_scores(
    current_user: dict = Depends(get_current_user)
):
    """
    Recalculate risk scores for all threats based on current criticality and FMEA data.
    This performs a full resync of all threat scores.
    """
    # Get all threats for this user
    threats = await db.threats.find({"created_by": current_user["id"]}).to_list(1000)
    
    if not threats:
        return {"message": "No threats found", "updated_count": 0}
    
    # Get all equipment nodes (they're stored flat in MongoDB, not nested)
    equipment_nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1, "criticality": 1}
    ).to_list(1000)
    
    # Build asset name -> (node_id, criticality) lookup
    # Use lowercase for case-insensitive matching
    asset_data = {}
    for node in equipment_nodes:
        name_lower = node["name"].lower()
        asset_data[name_lower] = {
            "id": node["id"],
            "name": node["name"],
            "criticality": node.get("criticality")
        }
    
    logger.info(f"Found {len(asset_data)} equipment nodes for matching")
    
    CRITICALITY_MULTIPLIERS = {
        "safety_critical": 1.5,
        "production_critical": 1.4,
        "medium": 1.2,
        "low": 1.0
    }
    
    updated_count = 0
    linked_count = 0
    
    for threat in threats:
        # Get base score from FMEA if failure mode is linked
        failure_mode_name = threat.get("failure_mode")
        base_risk_score = threat.get("base_risk_score", threat.get("risk_score", 50))
        
        if failure_mode_name and failure_mode_name != "Unknown":
            for fm in FAILURE_MODES_LIBRARY:
                if fm["failure_mode"].lower() == failure_mode_name.lower():
                    # Calculate RPN-based score
                    rpn_score = (fm["severity"] * fm["occurrence"] * fm["detectability"]) / 10
                    base_risk_score = min(100, int(rpn_score))
                    break
        
        # Get criticality data from asset (case-insensitive match)
        asset_name = threat.get("asset", "")
        asset_name_lower = asset_name.lower() if asset_name else ""
        
        linked_equipment_id = threat.get("linked_equipment_id")  # Preserve existing link
        criticality_level = "low"
        criticality_multiplier = 1.0
        criticality_data = None
        
        # Look up equipment by name
        if asset_name_lower and asset_name_lower in asset_data:
            node_info = asset_data[asset_name_lower]
            linked_equipment_id = node_info["id"]
            linked_count += 1
            crit = node_info.get("criticality")
            if crit:
                criticality_level = crit.get("level", "low")
                criticality_multiplier = CRITICALITY_MULTIPLIERS.get(criticality_level, 1.0)
                criticality_data = {
                    "safety_impact": crit.get("safety_impact", 0),
                    "production_impact": crit.get("production_impact", 0),
                    "environmental_impact": crit.get("environmental_impact", 0),
                    "reputation_impact": crit.get("reputation_impact", 0),
                    "level": criticality_level,
                    "multiplier": criticality_multiplier
                }
        
        # Calculate adjusted score
        adjusted_risk_score = min(100, int(base_risk_score * criticality_multiplier))
        
        # Determine risk level
        if adjusted_risk_score >= 70:
            risk_level = "Critical"
        elif adjusted_risk_score >= 50:
            risk_level = "High"
        elif adjusted_risk_score >= 30:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        # Update threat with full criticality data
        update_fields = {
            "risk_score": adjusted_risk_score,
            "base_risk_score": base_risk_score,
            "risk_level": risk_level,
            "equipment_criticality": criticality_level
        }
        if linked_equipment_id:
            update_fields["linked_equipment_id"] = linked_equipment_id
        if criticality_data:
            update_fields["equipment_criticality_data"] = criticality_data
        
        await db.threats.update_one({"id": threat["id"]}, {"$set": update_fields})
        updated_count += 1
    
    logger.info(f"Updated {updated_count} threats, linked {linked_count} to equipment")
    
    # Update all ranks
    await update_all_ranks(current_user["id"])
    
    return {
        "message": f"Successfully recalculated {updated_count} threat scores",
        "updated_count": updated_count
    }

@api_router.get("/threats/{threat_id}", response_model=ThreatResponse)
async def get_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    # Ensure risk_score is int
    if isinstance(threat.get("risk_score"), float):
        threat["risk_score"] = int(threat["risk_score"])
    return threat

@api_router.patch("/threats/{threat_id}", response_model=ThreatResponse)
async def update_threat(
    threat_id: str,
    update: ThreatUpdate,
    current_user: dict = Depends(get_current_user)
):
    threat = await db.threats.find_one({"id": threat_id, "created_by": current_user["id"]})
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    # Recalculate risk if relevant fields changed
    risk_fields = ["likelihood", "detectability", "impact", "frequency"]
    if any(f in update_data for f in risk_fields):
        # Get current values and override with updates
        likelihood = update_data.get("likelihood", threat.get("likelihood", "Possible"))
        detectability = update_data.get("detectability", threat.get("detectability", "Moderate"))
        
        # Calculate new risk score
        likelihood_scores = {"Rare": 1, "Unlikely": 2, "Possible": 3, "Likely": 4, "Almost Certain": 5}
        detectability_scores = {"Easy": 1, "Moderate": 2, "Difficult": 3, "Very Difficult": 4, "Almost Impossible": 5}
        
        l_score = likelihood_scores.get(likelihood, 3)
        d_score = detectability_scores.get(detectability, 2)
        risk_score = l_score * d_score * 10  # Scale to 10-250
        
        # Determine risk level
        if risk_score >= 150:
            risk_level = "Critical"
        elif risk_score >= 100:
            risk_level = "High"
        elif risk_score >= 50:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        
        update_data["risk_score"] = risk_score
        update_data["risk_level"] = risk_level
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.threats.update_one({"id": threat_id}, {"$set": update_data})
        
        # Recalculate ranks if status changed
        if "status" in update_data:
            await update_all_ranks(current_user["id"])
    
    updated = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    # Ensure risk_score is int
    if isinstance(updated.get("risk_score"), float):
        updated["risk_score"] = int(updated["risk_score"])
    return updated

@api_router.delete("/threats/{threat_id}")
async def delete_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    result = await db.threats.delete_one({"id": threat_id, "created_by": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    await update_all_ranks(current_user["id"])
    return {"message": "Threat deleted"}


@api_router.post("/threats/{threat_id}/link-equipment")
async def link_threat_to_equipment(
    threat_id: str,
    equipment_node_id: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """
    Link a threat to an equipment node and apply its criticality to the threat score.
    This updates the threat's asset field and recalculates the risk score.
    """
    # Get the threat
    threat = await db.threats.find_one({"id": threat_id, "created_by": current_user["id"]})
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Get the equipment node
    node = await db.equipment_nodes.find_one({"id": equipment_node_id, "created_by": current_user["id"]})
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Get criticality data from the node
    criticality = node.get("criticality")
    
    # Calculate multiplier from 4-dimension criticality
    CRITICALITY_MULTIPLIERS = {
        "safety_critical": 1.5,
        "production_critical": 1.4,
        "medium": 1.2,
        "low": 1.0
    }
    
    criticality_level = "low"
    criticality_multiplier = 1.0
    criticality_data = None
    
    if criticality:
        criticality_level = criticality.get("level", "low")
        criticality_multiplier = CRITICALITY_MULTIPLIERS.get(criticality_level, 1.0)
        criticality_data = {
            "safety_impact": criticality.get("safety_impact", 0),
            "production_impact": criticality.get("production_impact", 0),
            "environmental_impact": criticality.get("environmental_impact", 0),
            "reputation_impact": criticality.get("reputation_impact", 0),
            "level": criticality_level,
            "multiplier": criticality_multiplier
        }
    
    # Get base risk score (from FMEA if linked, otherwise current score)
    base_risk_score = threat.get("base_risk_score", threat.get("risk_score", 50))
    
    # Check if threat has linked failure mode
    failure_mode_name = threat.get("failure_mode")
    if failure_mode_name and failure_mode_name != "Unknown":
        for fm in FAILURE_MODES_LIBRARY:
            if fm["failure_mode"].lower() == failure_mode_name.lower():
                # Calculate RPN-based score
                rpn_score = (fm["severity"] * fm["occurrence"] * fm["detectability"]) / 10
                base_risk_score = min(100, int(rpn_score))
                break
    
    # Calculate adjusted score
    adjusted_risk_score = min(100, int(base_risk_score * criticality_multiplier))
    
    # Determine risk level
    if adjusted_risk_score >= 70:
        risk_level = "Critical"
    elif adjusted_risk_score >= 50:
        risk_level = "High"
    elif adjusted_risk_score >= 30:
        risk_level = "Medium"
    else:
        risk_level = "Low"
    
    # Update threat with new asset link and recalculated score
    update_data = {
        "asset": node["name"],
        "linked_equipment_id": equipment_node_id,
        "equipment_criticality": criticality_level,
        "equipment_criticality_data": criticality_data,
        "base_risk_score": base_risk_score,
        "risk_score": adjusted_risk_score,
        "risk_level": risk_level,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.threats.update_one({"id": threat_id}, {"$set": update_data})
    
    # Update ranks
    await update_all_ranks(current_user["id"])
    
    updated_threat = await db.threats.find_one({"id": threat_id}, {"_id": 0})
    
    return {
        "message": f"Threat linked to {node['name']}",
        "threat": updated_threat,
        "score_calculation": {
            "base_score": base_risk_score,
            "criticality_multiplier": criticality_multiplier,
            "criticality_level": criticality_level,
            "final_score": adjusted_risk_score,
            "risk_level": risk_level
        }
    }

# ============= STATS ENDPOINT =============

@api_router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    total = await db.threats.count_documents({"created_by": user_id})
    open_count = await db.threats.count_documents({"created_by": user_id, "status": "Open"})
    critical = await db.threats.count_documents({"created_by": user_id, "risk_level": "Critical", "status": {"$ne": "Closed"}})
    high = await db.threats.count_documents({"created_by": user_id, "risk_level": "High", "status": {"$ne": "Closed"}})
    
    return {
        "total_threats": total,
        "open_threats": open_count,
        "critical_count": critical,
        "high_count": high
    }

# ============= RELIABILITY PERFORMANCE SCORES =============

@api_router.get("/reliability-scores")
async def get_reliability_scores(
    node_id: Optional[str] = None,
    level: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate reliability performance scores across 6 dimensions:
    1. Criticality - Equipment hierarchy completeness and criticality assignments
    2. Incidents - Incident records and positive validation
    3. Investigations - Cross-asset analysis coverage
    4. Maintenance - Active maintenance plans and spares
    5. Reactions - Clear reaction plans (resources, support, downtime)
    6. Threats - Unmitigated threat management
    
    Returns scores per equipment and aggregated by hierarchy level.
    """
    user_id = current_user["id"]
    
    # Get all hierarchy nodes (from equipment_nodes collection)
    nodes = await db.equipment_nodes.find({"created_by": user_id}, {"_id": 0}).to_list(1000)
    
    # Get all threats
    threats = await db.threats.find({"created_by": user_id}).to_list(1000)
    
    # Get all investigations
    investigations = await db.investigations.find({"created_by": user_id}).to_list(1000)
    
    # Get all actions
    actions = await db.actions.find({"created_by": user_id}).to_list(1000)
    
    # Get maintenance strategies
    strategies = await db.maintenance_strategies.find({}).to_list(1000)
    
    # Get equipment types
    equipment_types = await db.equipment_types.find({}).to_list(1000)
    eq_type_ids = {et["id"] for et in equipment_types}
    
    # Calculate scores for each equipment node
    def calculate_node_scores(node):
        node_id = node["id"]
        node_name = node.get("name", "")
        node_level = node.get("level", "")
        equipment_type = node.get("equipment_type")
        criticality = node.get("criticality")
        
        # 1. Criticality Score (0-100)
        # - Has criticality assigned: +50
        # - Has equipment type assigned: +30
        # - Has description: +20
        criticality_score = 0
        if criticality:
            criticality_score += 50
        if equipment_type:
            criticality_score += 30
        if node.get("description"):
            criticality_score += 20
        
        # 2. Incidents Score (0-100)
        # Based on threats recorded for this asset
        node_threats = [t for t in threats if t.get("asset_name", "").lower() == node_name.lower()]
        closed_threats = [t for t in node_threats if t.get("status") == "Closed"]
        
        if len(node_threats) > 0:
            incidents_score = min(100, 50 + (len(closed_threats) / len(node_threats)) * 50)
        else:
            # No incidents could be good (no failures) or bad (no monitoring)
            incidents_score = 60  # Neutral baseline
        
        # 3. Investigations Score (0-100)
        # Cross-asset analysis coverage
        node_investigations = [inv for inv in investigations 
                              if node_name.lower() in (inv.get("description", "") + inv.get("title", "")).lower()]
        completed_investigations = [inv for inv in node_investigations if inv.get("status") == "completed"]
        
        if len(node_investigations) > 0:
            investigations_score = min(100, 40 + (len(completed_investigations) / len(node_investigations)) * 60)
        else:
            investigations_score = 50  # Neutral baseline
        
        # 4. Maintenance Score (0-100)
        # Based on maintenance strategies for the equipment type
        maintenance_score = 0
        if equipment_type and equipment_type in eq_type_ids:
            type_strategies = [s for s in strategies if s.get("equipment_type_id") == equipment_type]
            if len(type_strategies) > 0:
                strategy = type_strategies[0]
                content = strategy.get("strategies_by_criticality", {})
                # Check if strategy has all required components
                if content:
                    maintenance_score = 70  # Has strategy
                    # Bonus for completeness
                    for crit_level, crit_content in content.items():
                        if crit_content.get("operator_rounds"):
                            maintenance_score += 5
                        if crit_content.get("detection_systems"):
                            maintenance_score += 5
                        if crit_content.get("maintenance_tasks"):
                            maintenance_score += 5
                        if crit_content.get("spare_parts"):
                            maintenance_score += 5
                    maintenance_score = min(100, maintenance_score)
            else:
                maintenance_score = 30  # Equipment type exists but no strategy
        else:
            maintenance_score = 20  # No equipment type assigned
        
        # 5. Reactions Score (0-100)
        # Based on action plans and their completion
        node_actions = [a for a in actions if node_name.lower() in (a.get("description", "") + a.get("source", "")).lower()]
        completed_actions = [a for a in node_actions if a.get("status") == "completed"]
        
        if len(node_actions) > 0:
            reactions_score = min(100, 40 + (len(completed_actions) / len(node_actions)) * 60)
        else:
            reactions_score = 50  # Neutral baseline
        
        # 6. Threats Score (0-100)
        # Inverse of unmitigated threats (fewer open threats = higher score)
        open_threats = [t for t in node_threats if t.get("status") == "Open"]
        critical_threats = [t for t in open_threats if t.get("risk_level") in ["Critical", "High"]]
        
        threats_score = 100
        threats_score -= len(open_threats) * 10
        threats_score -= len(critical_threats) * 15  # Extra penalty for critical
        threats_score = max(0, threats_score)
        
        return {
            "node_id": node_id,
            "node_name": node_name,
            "node_level": node_level,
            "parent_id": node.get("parent_id"),
            "equipment_type": equipment_type,
            "criticality": criticality,
            "scores": {
                "criticality": criticality_score,
                "incidents": round(incidents_score),
                "investigations": round(investigations_score),
                "maintenance": round(maintenance_score),
                "reactions": round(reactions_score),
                "threats": round(threats_score),
            },
            "overall_score": round(
                (criticality_score + incidents_score + investigations_score + 
                 maintenance_score + reactions_score + threats_score) / 6
            ),
        }
    
    # Calculate scores for all nodes
    all_scores = [calculate_node_scores(node) for node in nodes]
    
    # Build hierarchy map
    children_map = {}
    for score in all_scores:
        parent_id = score.get("parent_id")
        if parent_id:
            if parent_id not in children_map:
                children_map[parent_id] = []
            children_map[parent_id].append(score)
    
    # Function to aggregate scores up the hierarchy
    def aggregate_children_scores(node_score):
        node_id = node_score["node_id"]
        children = children_map.get(node_id, [])
        
        if not children:
            return node_score
        
        # First, ensure all children are aggregated
        aggregated_children = [aggregate_children_scores(child) for child in children]
        
        # Calculate aggregated score including self and children
        all_entities = [node_score] + aggregated_children
        
        aggregated = {
            "criticality": sum(e["scores"]["criticality"] for e in all_entities) / len(all_entities),
            "incidents": sum(e["scores"]["incidents"] for e in all_entities) / len(all_entities),
            "investigations": sum(e["scores"]["investigations"] for e in all_entities) / len(all_entities),
            "maintenance": sum(e["scores"]["maintenance"] for e in all_entities) / len(all_entities),
            "reactions": sum(e["scores"]["reactions"] for e in all_entities) / len(all_entities),
            "threats": sum(e["scores"]["threats"] for e in all_entities) / len(all_entities),
        }
        
        node_score["aggregated_scores"] = {k: round(v) for k, v in aggregated.items()}
        node_score["aggregated_overall"] = round(sum(aggregated.values()) / 6)
        node_score["child_count"] = len(aggregated_children)
        
        return node_score
    
    # Find root nodes and aggregate
    root_nodes = [s for s in all_scores if not s.get("parent_id")]
    for root in root_nodes:
        aggregate_children_scores(root)
    
    # Calculate global aggregated scores
    if all_scores:
        global_scores = {
            "criticality": sum(s["scores"]["criticality"] for s in all_scores) / len(all_scores),
            "incidents": sum(s["scores"]["incidents"] for s in all_scores) / len(all_scores),
            "investigations": sum(s["scores"]["investigations"] for s in all_scores) / len(all_scores),
            "maintenance": sum(s["scores"]["maintenance"] for s in all_scores) / len(all_scores),
            "reactions": sum(s["scores"]["reactions"] for s in all_scores) / len(all_scores),
            "threats": sum(s["scores"]["threats"] for s in all_scores) / len(all_scores),
        }
        global_scores = {k: round(v) for k, v in global_scores.items()}
        global_overall = round(sum(global_scores.values()) / 6)
    else:
        global_scores = {
            "criticality": 0, "incidents": 0, "investigations": 0,
            "maintenance": 0, "reactions": 0, "threats": 0
        }
        global_overall = 0
    
    # Filter by node_id if specified
    if node_id:
        matching = [s for s in all_scores if s["node_id"] == node_id]
        if matching:
            return {
                "node": matching[0],
                "global_scores": global_scores,
                "global_overall": global_overall,
            }
        else:
            raise HTTPException(status_code=404, detail="Node not found")
    
    # Group by level if specified
    if level:
        level_nodes = [s for s in all_scores if s["node_level"] == level]
        level_avg = {}
        if level_nodes:
            level_avg = {
                "criticality": round(sum(n["scores"]["criticality"] for n in level_nodes) / len(level_nodes)),
                "incidents": round(sum(n["scores"]["incidents"] for n in level_nodes) / len(level_nodes)),
                "investigations": round(sum(n["scores"]["investigations"] for n in level_nodes) / len(level_nodes)),
                "maintenance": round(sum(n["scores"]["maintenance"] for n in level_nodes) / len(level_nodes)),
                "reactions": round(sum(n["scores"]["reactions"] for n in level_nodes) / len(level_nodes)),
                "threats": round(sum(n["scores"]["threats"] for n in level_nodes) / len(level_nodes)),
            }
        return {
            "level": level,
            "nodes": level_nodes,
            "level_average_scores": level_avg,
            "level_count": len(level_nodes),
            "global_scores": global_scores,
            "global_overall": global_overall,
        }
    
    # Return all data
    return {
        "nodes": all_scores,
        "global_scores": global_scores,
        "global_overall": global_overall,
        "total_equipment": len(nodes),
        "summary": {
            "with_criticality": len([n for n in nodes if n.get("criticality")]),
            "with_equipment_type": len([n for n in nodes if n.get("equipment_type")]),
            "total_threats": len(threats),
            "open_threats": len([t for t in threats if t.get("status") == "Open"]),
            "total_investigations": len(investigations),
            "total_actions": len(actions),
        }
    }

# ============= ROOT ENDPOINT =============

@api_router.get("/")
async def root():
    return {"message": "ThreatBase API", "version": "1.0.0"}

# ============= FAILURE MODES LIBRARY ENDPOINTS =============

@api_router.get("/failure-modes")
async def get_failure_modes(
    category: Optional[str] = None,
    equipment: Optional[str] = None,
    search: Optional[str] = None,
    min_rpn: Optional[int] = None
):
    """Get failure modes from the library with optional filters."""
    results = FAILURE_MODES_LIBRARY.copy()
    
    # Apply search filter first (searches across keywords, equipment, failure_mode, category)
    if search:
        search_lower = search.lower()
        filtered = []
        for fm in results:
            # Check if search term appears in any searchable field
            if (search_lower in fm["failure_mode"].lower() or
                search_lower in fm["equipment"].lower() or
                search_lower in fm["category"].lower() or
                any(search_lower in kw.lower() for kw in fm["keywords"]) or
                any(search_lower in action.lower() for action in fm["recommended_actions"])):
                filtered.append(fm)
        results = filtered
    
    # Then apply category filter
    if category and category.lower() != "all":
        results = [fm for fm in results if fm["category"].lower() == category.lower()]
    
    if equipment:
        results = [fm for fm in results if fm["equipment"].lower() == equipment.lower()]
    
    if min_rpn:
        results = [fm for fm in results if fm["rpn"] >= min_rpn]
    
    # Sort by RPN descending
    results.sort(key=lambda x: -x["rpn"])
    
    return {
        "total": len(results),
        "failure_modes": results
    }

@api_router.get("/failure-modes/categories")
async def get_categories():
    """Get all unique categories."""
    return {"categories": get_all_categories()}

@api_router.get("/failure-modes/equipment-types")
async def get_equipment_types():
    """Get all unique equipment types."""
    return {"equipment_types": get_all_equipment_types()}

@api_router.get("/failure-modes/high-risk")
async def get_high_risk_modes(threshold: int = 250):
    """Get failure modes with RPN above threshold."""
    high_risk = [fm for fm in FAILURE_MODES_LIBRARY if fm["rpn"] >= threshold]
    high_risk.sort(key=lambda x: -x["rpn"])
    return {
        "threshold": threshold,
        "total": len(high_risk),
        "failure_modes": high_risk
    }

@api_router.get("/failure-modes/{mode_id}")
async def get_failure_mode_by_id(mode_id: int):
    """Get a specific failure mode by ID."""
    for fm in FAILURE_MODES_LIBRARY:
        if fm["id"] == mode_id:
            return fm
    raise HTTPException(status_code=404, detail="Failure mode not found")


# Failure Mode CRUD Models
class FailureModeCreate(BaseModel):
    category: str
    equipment: str
    failure_mode: str
    keywords: List[str] = []
    severity: int = Field(ge=1, le=10)
    occurrence: int = Field(ge=1, le=10)
    detectability: int = Field(ge=1, le=10)
    recommended_actions: List[str] = []
    equipment_type_ids: List[str] = []  # Link to multiple equipment types


class FailureModeUpdate(BaseModel):
    category: Optional[str] = None
    equipment: Optional[str] = None
    failure_mode: Optional[str] = None
    keywords: Optional[List[str]] = None
    severity: Optional[int] = Field(None, ge=1, le=10)
    occurrence: Optional[int] = Field(None, ge=1, le=10)
    detectability: Optional[int] = Field(None, ge=1, le=10)
    recommended_actions: Optional[List[str]] = None
    equipment_type_ids: Optional[List[str]] = None


def auto_link_equipment_types(equipment_name: str) -> List[str]:
    """Auto-detect equipment types based on equipment name. Returns list of matching type IDs."""
    equipment_lower = equipment_name.lower()
    
    # Map common equipment names to equipment type IDs
    equipment_mapping = {
        "pump": ["pump_centrifugal", "pump_reciprocating"],
        "centrifugal pump": ["pump_centrifugal"],
        "reciprocating pump": ["pump_reciprocating"],
        "compressor": ["compressor_centrifugal", "compressor_reciprocating"],
        "centrifugal compressor": ["compressor_centrifugal"],
        "reciprocating compressor": ["compressor_reciprocating"], 
        "turbine": ["turbine_gas", "turbine_steam"],
        "gas turbine": ["turbine_gas"],
        "steam turbine": ["turbine_steam"],
        "motor": ["motor_electric"],
        "vessel": ["vessel_pressure", "vessel_storage"],
        "pressure vessel": ["vessel_pressure"],
        "storage tank": ["vessel_storage"],
        "tank": ["vessel_storage"],
        "heat exchanger": ["heat_exchanger"],
        "exchanger": ["heat_exchanger"],
        "pipe": ["pipe"],
        "piping": ["pipe"],
        "valve": ["valve_control", "valve_safety", "valve_manual"],
        "control valve": ["valve_control"],
        "safety valve": ["valve_safety"],
        "manual valve": ["valve_manual"],
        "sensor": ["sensor_pressure", "sensor_temperature", "sensor_flow"],
        "pressure sensor": ["sensor_pressure"],
        "temperature sensor": ["sensor_temperature"],
        "flow sensor": ["sensor_flow"],
        "transmitter": ["sensor_pressure", "sensor_temperature", "sensor_flow"],
        "plc": ["plc"],
        "controller": ["plc"],
        "generator": ["turbine_gas", "turbine_steam"],
        "transformer": ["transformer"],
        "switchgear": ["switchgear"],
        "extruder": ["extruder"],
        "filter": ["pipe"],
        "boiler": ["heat_exchanger"],
        "furnace": ["heat_exchanger"],
        "heater": ["heat_exchanger"],
        "cooler": ["heat_exchanger"],
        "fan": ["motor_electric"],
        "blower": ["compressor_centrifugal"],
    }
    
    for keyword, type_ids in equipment_mapping.items():
        if keyword in equipment_lower:
            return type_ids
    return []


@api_router.post("/failure-modes")
async def create_failure_mode(
    data: FailureModeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new failure mode."""
    # Generate new ID
    max_id = max((fm["id"] for fm in FAILURE_MODES_LIBRARY), default=0)
    new_id = max_id + 1
    
    # Auto-link equipment types if not provided
    equipment_type_ids = data.equipment_type_ids if data.equipment_type_ids else auto_link_equipment_types(data.equipment)
    
    new_fm = {
        "id": new_id,
        "category": data.category,
        "equipment": data.equipment,
        "failure_mode": data.failure_mode,
        "keywords": data.keywords,
        "severity": data.severity,
        "occurrence": data.occurrence,
        "detectability": data.detectability,
        "rpn": data.severity * data.occurrence * data.detectability,
        "recommended_actions": data.recommended_actions,
        "equipment_type_ids": equipment_type_ids,
        "is_custom": True,
        "created_by": current_user["id"]
    }
    
    FAILURE_MODES_LIBRARY.append(new_fm)
    return new_fm


@api_router.patch("/failure-modes/{mode_id}")
async def update_failure_mode(
    mode_id: int,
    data: FailureModeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a failure mode."""
    for i, fm in enumerate(FAILURE_MODES_LIBRARY):
        if fm["id"] == mode_id:
            # Track if FMEA scores changed
            fmea_changed = False
            old_failure_mode_name = fm["failure_mode"]
            
            # Update fields
            if data.category is not None:
                fm["category"] = data.category
            if data.equipment is not None:
                fm["equipment"] = data.equipment
                # Auto-link if equipment changed and no explicit types provided
                if data.equipment_type_ids is None:
                    auto_types = auto_link_equipment_types(data.equipment)
                    if auto_types:
                        fm["equipment_type_ids"] = auto_types
            if data.failure_mode is not None:
                fm["failure_mode"] = data.failure_mode
            if data.keywords is not None:
                fm["keywords"] = data.keywords
            if data.severity is not None:
                fmea_changed = True
                fm["severity"] = data.severity
            if data.occurrence is not None:
                fmea_changed = True
                fm["occurrence"] = data.occurrence
            if data.detectability is not None:
                fmea_changed = True
                fm["detectability"] = data.detectability
            if data.recommended_actions is not None:
                fm["recommended_actions"] = data.recommended_actions
            if data.equipment_type_ids is not None:
                fm["equipment_type_ids"] = data.equipment_type_ids
            
            # Recalculate RPN
            fm["rpn"] = fm["severity"] * fm["occurrence"] * fm["detectability"]
            
            # If FMEA scores changed, recalculate all linked threat scores
            if fmea_changed:
                updated_threats = await recalculate_threat_scores_for_failure_mode(
                    old_failure_mode_name,
                    fm["severity"],
                    fm["occurrence"],
                    fm["detectability"]
                )
                logger.info(f"Updated {updated_threats} threat scores after FMEA change for '{old_failure_mode_name}'")
                fm["threats_updated"] = updated_threats
            
            return fm
    
    raise HTTPException(status_code=404, detail="Failure mode not found")


@api_router.delete("/failure-modes/{mode_id}")
async def delete_failure_mode(
    mode_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Delete a custom failure mode."""
    for i, fm in enumerate(FAILURE_MODES_LIBRARY):
        if fm["id"] == mode_id:
            if not fm.get("is_custom"):
                raise HTTPException(status_code=400, detail="Cannot delete built-in failure modes")
            FAILURE_MODES_LIBRARY.pop(i)
            return {"message": "Failure mode deleted"}
    
    raise HTTPException(status_code=404, detail="Failure mode not found")


# ============= ISO 14224 EQUIPMENT HIERARCHY ENDPOINTS =============

@api_router.get("/equipment-hierarchy/types")
async def get_iso_equipment_types(
    current_user: dict = Depends(get_current_user)
):
    """Get all equipment types - merged from defaults and user-custom types."""
    # Get user's custom equipment types
    custom_types = await db.custom_equipment_types.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(100)
    
    # Merge: custom types override defaults by ID
    custom_ids = {t["id"] for t in custom_types}
    merged_types = [t for t in EQUIPMENT_TYPES if t["id"] not in custom_ids] + custom_types
    
    return {"equipment_types": merged_types}

@api_router.post("/equipment-hierarchy/types")
async def create_equipment_type(
    type_data: EquipmentTypeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a custom equipment type."""
    # Check if ID already exists for this user
    existing = await db.custom_equipment_types.find_one(
        {"id": type_data.id, "created_by": current_user["id"]}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Equipment type ID already exists")
    
    type_doc = {
        "id": type_data.id,
        "name": type_data.name,
        "iso_class": type_data.iso_class,
        "discipline": type_data.discipline,
        "icon": type_data.icon,
        "is_custom": True,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.custom_equipment_types.insert_one(type_doc)
    type_doc.pop("_id", None)
    return type_doc

@api_router.patch("/equipment-hierarchy/types/{type_id}")
async def update_equipment_type(
    type_id: str,
    update: EquipmentTypeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a custom equipment type."""
    # Check if it's a custom type
    existing = await db.custom_equipment_types.find_one(
        {"id": type_id, "created_by": current_user["id"]}
    )
    
    if not existing:
        # It might be a default type - create a custom override
        default_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
        if not default_type:
            raise HTTPException(status_code=404, detail="Equipment type not found")
        
        # Create custom override
        type_doc = {
            **default_type,
            "is_custom": True,
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        update_data = {k: v for k, v in update.model_dump().items() if v is not None}
        type_doc.update(update_data)
        
        await db.custom_equipment_types.insert_one(type_doc)
        type_doc.pop("_id", None)
        return type_doc
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.custom_equipment_types.update_one(
            {"id": type_id, "created_by": current_user["id"]},
            {"$set": update_data}
        )
    
    updated = await db.custom_equipment_types.find_one(
        {"id": type_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    return updated

@api_router.delete("/equipment-hierarchy/types/{type_id}")
async def delete_equipment_type(
    type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a custom equipment type."""
    result = await db.custom_equipment_types.delete_one(
        {"id": type_id, "created_by": current_user["id"]}
    )
    if result.deleted_count == 0:
        # Check if it's a default type
        default_type = next((t for t in EQUIPMENT_TYPES if t["id"] == type_id), None)
        if default_type:
            raise HTTPException(status_code=400, detail="Cannot delete default equipment types")
        raise HTTPException(status_code=404, detail="Equipment type not found")
    return {"message": "Equipment type deleted"}

@api_router.get("/equipment-hierarchy/disciplines")
async def get_disciplines():
    """Get all disciplines."""
    return {"disciplines": [d.value for d in Discipline]}

@api_router.get("/equipment-hierarchy/criticality-profiles")
async def get_criticality_profiles():
    """Get all criticality profiles."""
    return {"profiles": CRITICALITY_PROFILES}

@api_router.get("/equipment-hierarchy/iso-levels")
async def get_iso_levels():
    """Get ISO 14224 hierarchy levels with labels."""
    from iso14224_models import ISO_LEVEL_LABELS
    return {
        "levels": [level.value for level in ISO_LEVEL_ORDER],
        "labels": {level.value: ISO_LEVEL_LABELS.get(level, level.value) for level in ISO_LEVEL_ORDER},
        "hierarchy": {
            level.value: {
                "label": ISO_LEVEL_LABELS.get(level, level.value),
                "parent": get_valid_parent_level(level).value if get_valid_parent_level(level) else None,
                "children": [c.value for c in get_valid_child_levels(level)]
            }
            for level in ISO_LEVEL_ORDER
        }
    }

@api_router.get("/equipment-hierarchy/nodes")
async def get_equipment_nodes(
    current_user: dict = Depends(get_current_user)
):
    """Get all equipment hierarchy nodes for the current user, sorted by sort_order."""
    nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(1000)
    return {"nodes": nodes}

@api_router.get("/equipment-hierarchy/nodes/{node_id}")
async def get_equipment_node(
    node_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific equipment node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    return node

@api_router.post("/equipment-hierarchy/nodes")
async def create_equipment_node(
    node_data: EquipmentNodeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new equipment hierarchy node with ISO 14224 validation."""
    # Check for duplicate name under the same parent
    existing = await db.equipment_nodes.find_one({
        "name": node_data.name,
        "parent_id": node_data.parent_id,
        "created_by": current_user["id"]
    })
    if existing:
        parent_info = f"under parent '{node_data.parent_id}'" if node_data.parent_id else "at root level"
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{node_data.name}' already exists {parent_info}"
        )
    
    # Validate parent-child relationship if parent specified
    if node_data.parent_id:
        parent = await db.equipment_nodes.find_one(
            {"id": node_data.parent_id, "created_by": current_user["id"]},
            {"_id": 0}
        )
        if not parent:
            raise HTTPException(status_code=400, detail="Parent node not found")
        
        parent_level = ISOLevel(parent["level"])
        if not is_valid_parent_child(parent_level, node_data.level):
            valid_children = get_valid_child_levels(parent_level)
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid parent-child relationship. {parent_level.value} can only have {[c.value for c in valid_children]} as children"
            )
    else:
        # Root nodes must be installations
        if node_data.level != ISOLevel.INSTALLATION:
            raise HTTPException(
                status_code=400, 
                detail="Root nodes must be of level 'installation'"
            )
    
    node_id = str(uuid.uuid4())
    
    # Calculate sort_order - get max sort_order for siblings and add 1
    max_sort = await db.equipment_nodes.find_one(
        {"parent_id": node_data.parent_id, "created_by": current_user["id"]},
        sort=[("sort_order", -1)],
        projection={"sort_order": 1}
    )
    next_sort_order = (max_sort.get("sort_order", 0) if max_sort else 0) + 1
    
    node_doc = {
        "id": node_id,
        "name": node_data.name,
        "level": node_data.level.value,
        "parent_id": node_data.parent_id,
        "equipment_type_id": node_data.equipment_type_id,
        "description": node_data.description,
        "criticality": None,
        "discipline": None,
        "sort_order": next_sort_order,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.equipment_nodes.insert_one(node_doc)
    
    # Remove MongoDB's _id before returning
    node_doc.pop("_id", None)
    return node_doc

@api_router.patch("/equipment-hierarchy/nodes/{node_id}")
async def update_equipment_node(
    node_id: str,
    update: EquipmentNodeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an equipment hierarchy node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Validate new parent if changing parent
    if update.parent_id is not None and update.parent_id != node.get("parent_id"):
        if update.parent_id:
            new_parent = await db.equipment_nodes.find_one(
                {"id": update.parent_id, "created_by": current_user["id"]},
                {"_id": 0}
            )
            if not new_parent:
                raise HTTPException(status_code=400, detail="New parent node not found")
            
            parent_level = ISOLevel(new_parent["level"])
            child_level = ISOLevel(node["level"])
            if not is_valid_parent_child(parent_level, child_level):
                raise HTTPException(
                    status_code=400, 
                    detail="Invalid parent-child relationship per ISO 14224"
                )
            
            # Check for circular references
            current_parent = update.parent_id
            while current_parent:
                if current_parent == node_id:
                    raise HTTPException(status_code=400, detail="Circular reference detected")
                parent_node = await db.equipment_nodes.find_one({"id": current_parent})
                current_parent = parent_node.get("parent_id") if parent_node else None
        else:
            # Removing parent - node must be installation level
            if node["level"] != ISOLevel.INSTALLATION.value:
                raise HTTPException(
                    status_code=400, 
                    detail="Only installations can be root nodes"
                )
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.equipment_nodes.update_one(
            {"id": node_id},
            {"$set": update_data}
        )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated

@api_router.delete("/equipment-hierarchy/nodes/{node_id}")
async def delete_equipment_node(
    node_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an equipment node and optionally its children."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Get all children recursively
    async def get_children_ids(parent_id):
        children = await db.equipment_nodes.find(
            {"parent_id": parent_id, "created_by": current_user["id"]},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        all_ids = [c["id"] for c in children]
        for child in children:
            all_ids.extend(await get_children_ids(child["id"]))
        return all_ids
    
    children_ids = await get_children_ids(node_id)
    all_ids = [node_id] + children_ids
    
    result = await db.equipment_nodes.delete_many(
        {"id": {"$in": all_ids}, "created_by": current_user["id"]}
    )
    
    return {"message": f"Deleted {result.deleted_count} nodes", "deleted_ids": all_ids}


class ChangeLevelRequest(BaseModel):
    new_level: ISOLevel
    new_parent_id: Optional[str] = None  # Required when demoting, optional when promoting


@api_router.post("/equipment-hierarchy/nodes/{node_id}/change-level")
async def change_node_level(
    node_id: str,
    request: ChangeLevelRequest,
    current_user: dict = Depends(get_current_user)
):
    """Change the hierarchy level of a node (promote or demote)."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    current_level = normalize_level(ISOLevel(node["level"]))
    new_level = normalize_level(request.new_level)
    
    current_idx = ISO_LEVEL_ORDER.index(current_level)
    new_idx = ISO_LEVEL_ORDER.index(new_level)
    
    # Validate level change
    if new_idx == current_idx:
        raise HTTPException(status_code=400, detail="Node is already at this level")
    
    is_promoting = new_idx < current_idx  # Moving up in hierarchy
    is_demoting = new_idx > current_idx   # Moving down in hierarchy
    
    # Get current parent
    current_parent = None
    if node.get("parent_id"):
        current_parent = await db.equipment_nodes.find_one(
            {"id": node["parent_id"], "created_by": current_user["id"]}
        )
    
    if is_promoting:
        # When promoting, the node becomes a sibling of its current parent
        # The new parent is the grandparent (parent of current parent)
        if not current_parent:
            raise HTTPException(status_code=400, detail="Cannot promote a root node")
        
        new_parent_id = current_parent.get("parent_id")  # Grandparent (can be None for installation)
        
        # Validate the new level is correct for the new parent
        if new_parent_id:
            grandparent = await db.equipment_nodes.find_one(
                {"id": new_parent_id, "created_by": current_user["id"]}
            )
            if grandparent:
                grandparent_level = normalize_level(ISOLevel(grandparent["level"]))
                if not is_valid_parent_child(grandparent_level, new_level):
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Cannot promote to {new_level.value}. Invalid parent-child relationship."
                    )
        else:
            # Promoting to root level - must be installation
            if new_level != ISOLevel.INSTALLATION:
                raise HTTPException(status_code=400, detail="Only installations can be root nodes")
        
    else:  # is_demoting
        # When demoting, user must specify a new parent
        if not request.new_parent_id:
            raise HTTPException(status_code=400, detail="Must specify new_parent_id when demoting")
        
        new_parent = await db.equipment_nodes.find_one(
            {"id": request.new_parent_id, "created_by": current_user["id"]}
        )
        if not new_parent:
            raise HTTPException(status_code=400, detail="New parent node not found")
        
        parent_level = normalize_level(ISOLevel(new_parent["level"]))
        if not is_valid_parent_child(parent_level, new_level):
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot demote to {new_level.value} under {parent_level.value}"
            )
        
        new_parent_id = request.new_parent_id
    
    # Check for duplicate name at new location
    existing = await db.equipment_nodes.find_one({
        "name": node["name"],
        "parent_id": new_parent_id,
        "created_by": current_user["id"],
        "id": {"$ne": node_id}
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{node['name']}' already exists at the target location"
        )
    
    # Update the node
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "level": new_level.value,
            "parent_id": new_parent_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If promoting, also need to update children's parent to maintain hierarchy
    # Children of this node stay as children
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    action = "promoted" if is_promoting else "demoted"
    return {
        "message": f"Node {action} to {new_level.value}",
        "node": updated
    }


class ReorderRequest(BaseModel):
    direction: str  # "up" or "down"


@api_router.post("/equipment-hierarchy/nodes/{node_id}/reorder")
async def reorder_equipment_node(
    node_id: str,
    request: ReorderRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder a node among its siblings (move up or down in the list)."""
    if request.direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")
    
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    current_sort = node.get("sort_order", 0)
    
    # Get all siblings (same parent)
    siblings = await db.equipment_nodes.find(
        {"parent_id": node["parent_id"], "created_by": current_user["id"]},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(1000)
    
    if len(siblings) <= 1:
        raise HTTPException(status_code=400, detail="No siblings to reorder with")
    
    # Find current index
    current_idx = next((i for i, s in enumerate(siblings) if s["id"] == node_id), -1)
    if current_idx == -1:
        raise HTTPException(status_code=400, detail="Node not found in siblings")
    
    # Calculate target index
    if request.direction == "up":
        if current_idx == 0:
            raise HTTPException(status_code=400, detail="Already at the top")
        target_idx = current_idx - 1
    else:  # down
        if current_idx == len(siblings) - 1:
            raise HTTPException(status_code=400, detail="Already at the bottom")
        target_idx = current_idx + 1
    
    # Swap sort_order values
    target_node = siblings[target_idx]
    target_sort = target_node.get("sort_order", target_idx)
    
    # Update both nodes
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {"sort_order": target_sort, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.equipment_nodes.update_one(
        {"id": target_node["id"]},
        {"$set": {"sort_order": current_sort, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": f"Node moved {request.direction}", "new_sort_order": target_sort}


class ReorderToPositionRequest(BaseModel):
    target_node_id: str  # The node to position relative to
    position: str  # "before" or "after"
    new_parent_id: Optional[str] = None  # If moving to a different parent


@api_router.post("/equipment-hierarchy/nodes/{node_id}/reorder-to")
async def reorder_node_to_position(
    node_id: str,
    request: ReorderToPositionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reorder a node to a specific position relative to another node via drag-and-drop."""
    if request.position not in ["before", "after"]:
        raise HTTPException(status_code=400, detail="Position must be 'before' or 'after'")
    
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    target = await db.equipment_nodes.find_one(
        {"id": request.target_node_id, "created_by": current_user["id"]}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Target node not found")
    
    # Determine the new parent - use target's parent if not specified
    new_parent_id = request.new_parent_id if request.new_parent_id is not None else target.get("parent_id")
    
    # If moving to a different parent, validate the level relationship
    if new_parent_id != node.get("parent_id"):
        if new_parent_id:
            new_parent = await db.equipment_nodes.find_one(
                {"id": new_parent_id, "created_by": current_user["id"]}
            )
            if not new_parent:
                raise HTTPException(status_code=400, detail="New parent not found")
            
            parent_level = ISOLevel(new_parent["level"])
            child_level = ISOLevel(node["level"])
            if not is_valid_parent_child(parent_level, child_level):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot place {child_level.value} under {parent_level.value}"
                )
        else:
            # Moving to root level - must be installation
            if node["level"] != "installation":
                raise HTTPException(status_code=400, detail="Only installations can be at root level")
    
    # Get all siblings at the target location (same parent as target)
    siblings = await db.equipment_nodes.find(
        {"parent_id": new_parent_id, "created_by": current_user["id"]},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(1000)
    
    # Remove the dragged node from siblings if it's in the same parent
    siblings = [s for s in siblings if s["id"] != node_id]
    
    # Find target's position
    target_idx = next((i for i, s in enumerate(siblings) if s["id"] == request.target_node_id), -1)
    
    if target_idx == -1:
        # Target not in siblings (was the dragged node itself), just append
        insert_idx = len(siblings)
    elif request.position == "before":
        insert_idx = target_idx
    else:  # after
        insert_idx = target_idx + 1
    
    # Reassign sort_order for all siblings
    for i, sibling in enumerate(siblings):
        new_sort = i if i < insert_idx else i + 1
        if sibling.get("sort_order", 0) != new_sort:
            await db.equipment_nodes.update_one(
                {"id": sibling["id"]},
                {"$set": {"sort_order": new_sort, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
    
    # Update the moved node with new sort_order and possibly new parent
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "sort_order": insert_idx,
            "parent_id": new_parent_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return {
        "message": f"Node moved {request.position} target",
        "node": updated
    }


@api_router.post("/equipment-hierarchy/nodes/{node_id}/move")
async def move_equipment_node(
    node_id: str,
    move_request: MoveNodeRequest,
    current_user: dict = Depends(get_current_user)
):
    """Move a node to a new parent with ISO 14224 validation."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    new_parent = await db.equipment_nodes.find_one(
        {"id": move_request.new_parent_id, "created_by": current_user["id"]}
    )
    if not new_parent:
        raise HTTPException(status_code=400, detail="New parent node not found")
    
    # Check for duplicate name under the new parent
    existing = await db.equipment_nodes.find_one({
        "name": node["name"],
        "parent_id": move_request.new_parent_id,
        "created_by": current_user["id"],
        "id": {"$ne": node_id}  # Exclude the node itself
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{node['name']}' already exists under the target parent"
        )
    
    # Validate the move per ISO 14224
    parent_level = ISOLevel(new_parent["level"])
    child_level = ISOLevel(node["level"])
    
    if not is_valid_parent_child(parent_level, child_level):
        valid_children = get_valid_child_levels(parent_level)
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot move {child_level.value} under {parent_level.value}. Valid children: {[c.value for c in valid_children]}"
        )
    
    # Update the node
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "parent_id": move_request.new_parent_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated

@api_router.post("/equipment-hierarchy/nodes/{node_id}/criticality")
async def assign_criticality(
    node_id: str,
    assignment: CriticalityAssignment,
    current_user: dict = Depends(get_current_user)
):
    """Assign criticality to an equipment node using 4-dimension model (Safety, Production, Environmental, Reputation)."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Check if all 4 dimensions are None/0 - if so, clear criticality
    has_any_dimension = (
        (assignment.safety_impact and assignment.safety_impact > 0) or
        (assignment.production_impact and assignment.production_impact > 0) or
        (assignment.environmental_impact and assignment.environmental_impact > 0) or
        (assignment.reputation_impact and assignment.reputation_impact > 0)
    )
    
    if not has_any_dimension:
        await db.equipment_nodes.update_one(
            {"id": node_id},
            {"$set": {
                "criticality": None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
        return updated
    
    # Build 4-dimension criticality data
    safety = assignment.safety_impact or 0
    production = assignment.production_impact or 0
    environmental = assignment.environmental_impact or 0
    reputation = assignment.reputation_impact or 0
    
    # Calculate overall criticality level based on max dimension
    max_impact = max(safety, production, environmental, reputation)
    
    # Determine legacy level for backwards compatibility
    if safety >= 4 or max_impact == 5:
        level = "safety_critical"
        color = "#EF4444"  # Red
    elif production >= 4 or max_impact >= 4:
        level = "production_critical"
        color = "#F97316"  # Orange
    elif max_impact >= 3:
        level = "medium"
        color = "#EAB308"  # Yellow
    else:
        level = "low"
        color = "#22C55E"  # Green
    
    criticality_data = {
        # 4-dimension model
        "safety_impact": safety,
        "production_impact": production,
        "environmental_impact": environmental,
        "reputation_impact": reputation,
        # Derived values for backwards compatibility
        "level": level,
        "color": color,
        "max_impact": max_impact,
        # Legacy fields preserved
        "profile_id": assignment.profile_id,
        "fatality_risk": assignment.fatality_risk or 0,
        "production_loss_per_day": assignment.production_loss_per_day or 0,
        "failure_probability": assignment.failure_probability or 0,
        "downtime_days": assignment.downtime_days or 0,
    }
    
    # Calculate risk score weighted by dimensions
    risk_score = (
        (safety * 25) +  # Safety has highest weight
        (production * 20) +
        (environmental * 15) +
        (reputation * 10)
    )
    criticality_data["risk_score"] = round(risk_score, 2)
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "criticality": criticality_data,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Recalculate risk scores for all threats linked to this asset
    asset_name = node.get("name")
    if asset_name:
        updated_threats = await recalculate_threat_scores_for_asset(
            asset_name, 
            current_user["id"], 
            criticality_data
        )
        logger.info(f"Updated {updated_threats} threat scores after criticality change for {asset_name}")
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    # Include count of updated threats in response
    updated["threats_updated"] = updated_threats if asset_name else 0
    return updated

@api_router.post("/equipment-hierarchy/nodes/{node_id}/discipline")
async def assign_discipline(
    node_id: str,
    discipline: str,
    current_user: dict = Depends(get_current_user)
):
    """Assign discipline to an equipment node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Validate discipline
    try:
        Discipline(discipline)  # Validate discipline enum
    except ValueError:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid discipline. Valid options: {[d.value for d in Discipline]}"
        )
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "discipline": discipline,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
    return updated

@api_router.get("/equipment-hierarchy/stats")
async def get_hierarchy_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get statistics about the equipment hierarchy."""
    user_id = current_user["id"]
    
    total_nodes = await db.equipment_nodes.count_documents({"created_by": user_id})
    
    # Count by level
    level_counts = {}
    for level in ISO_LEVEL_ORDER:
        count = await db.equipment_nodes.count_documents(
            {"created_by": user_id, "level": level.value}
        )
        level_counts[level.value] = count
    
    # Count by criticality
    criticality_counts = {
        "safety_critical": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality.level": "safety_critical"}
        ),
        "production_critical": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality.level": "production_critical"}
        ),
        "medium": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality.level": "medium"}
        ),
        "low": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality.level": "low"}
        ),
        "unassigned": await db.equipment_nodes.count_documents(
            {"created_by": user_id, "criticality": None}
        )
    }
    
    return {
        "total_nodes": total_nodes,
        "by_level": level_counts,
        "by_criticality": criticality_counts
    }

# ============= UNSTRUCTURED ITEMS ENDPOINTS =============

@api_router.get("/equipment-hierarchy/unstructured")
async def get_unstructured_items(
    current_user: dict = Depends(get_current_user)
):
    """Get all unstructured (unassigned) equipment items."""
    items = await db.unstructured_items.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(1000)
    return {"items": items}

@api_router.post("/equipment-hierarchy/unstructured")
async def create_unstructured_item(
    item_data: UnstructuredItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a single unstructured equipment item."""
    # Detect equipment type if not provided
    detected = detect_equipment_type(item_data.name)
    
    item_id = str(uuid.uuid4())
    item_doc = {
        "id": item_id,
        "name": item_data.name,
        "detected_type_id": item_data.detected_type_id or (detected["id"] if detected else None),
        "detected_type_name": detected["name"] if detected else None,
        "detected_discipline": item_data.detected_discipline or (detected["discipline"] if detected else None),
        "detected_icon": detected["icon"] if detected else None,
        "source": item_data.source or "manual",
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.unstructured_items.insert_one(item_doc)
    item_doc.pop("_id", None)
    return item_doc

@api_router.post("/equipment-hierarchy/parse-list")
async def parse_equipment_list(
    request: ParseEquipmentListRequest,
    current_user: dict = Depends(get_current_user)
):
    """Parse a text list and create unstructured items with auto-detection."""
    import re
    
    content = request.content.strip()
    
    # Split by common delimiters: newlines, commas, semicolons, tabs
    items = re.split(r'[\n\r,;\t]+', content)
    
    # Clean and deduplicate
    seen = set()
    unique_items = []
    for item in items:
        cleaned = item.strip()
        # Remove common list prefixes like "1.", "- ", "• ", etc.
        cleaned = re.sub(r'^[\d]+[.\)]\s*', '', cleaned)
        cleaned = re.sub(r'^[-•*]\s*', '', cleaned)
        cleaned = cleaned.strip()
        
        if cleaned and len(cleaned) > 1 and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            unique_items.append(cleaned)
    
    # Create unstructured items
    created_items = []
    for name in unique_items:
        detected = detect_equipment_type(name)
        
        item_id = str(uuid.uuid4())
        item_doc = {
            "id": item_id,
            "name": name,
            "detected_type_id": detected["id"] if detected else None,
            "detected_type_name": detected["name"] if detected else None,
            "detected_discipline": detected["discipline"] if detected else None,
            "detected_icon": detected["icon"] if detected else None,
            "source": request.source,
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.unstructured_items.insert_one(item_doc)
        item_doc.pop("_id", None)
        created_items.append(item_doc)
    
    return {
        "parsed_count": len(created_items),
        "items": created_items
    }

@api_router.post("/equipment-hierarchy/parse-file")
async def parse_equipment_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Parse an uploaded file (Excel, PDF, CSV, TXT) and extract equipment items."""
    import io
    
    filename = file.filename.lower()
    content = await file.read()
    
    extracted_items = []
    
    try:
        if filename.endswith('.csv') or filename.endswith('.txt'):
            # Plain text or CSV
            text_content = content.decode('utf-8', errors='ignore')
            items = text_content.strip().split('\n')
            extracted_items = [item.strip() for item in items if item.strip()]
            
        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            # Excel file
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content), header=None)
            # Get all non-empty cells from first column (or all columns)
            for col in df.columns:
                for val in df[col].dropna():
                    if isinstance(val, str) and val.strip():
                        extracted_items.append(val.strip())
                    elif not pd.isna(val):
                        extracted_items.append(str(val).strip())
                        
        elif filename.endswith('.pdf'):
            # PDF file - use PyPDF2 or pdfplumber
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            lines = text.split('\n')
                            extracted_items.extend([l.strip() for l in lines if l.strip()])
            except ImportError:
                # Fallback to PyPDF2
                import PyPDF2
                reader = PyPDF2.PdfReader(io.BytesIO(content))
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        lines = text.split('\n')
                        extracted_items.extend([l.strip() for l in lines if l.strip()])
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use .txt, .csv, .xlsx, .xls, or .pdf")
    
    except Exception as e:
        logger.error(f"File parsing error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
    
    # Clean and deduplicate
    import re
    seen = set()
    unique_items = []
    for item in extracted_items:
        cleaned = item.strip()
        cleaned = re.sub(r'^[\d]+[.\)]\s*', '', cleaned)
        cleaned = re.sub(r'^[-•*]\s*', '', cleaned)
        cleaned = cleaned.strip()
        
        if cleaned and len(cleaned) > 1 and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            unique_items.append(cleaned)
    
    # Create unstructured items
    created_items = []
    for name in unique_items[:100]:  # Limit to 100 items per file
        detected = detect_equipment_type(name)
        
        item_id = str(uuid.uuid4())
        item_doc = {
            "id": item_id,
            "name": name,
            "detected_type_id": detected["id"] if detected else None,
            "detected_type_name": detected["name"] if detected else None,
            "detected_discipline": detected["discipline"] if detected else None,
            "detected_icon": detected["icon"] if detected else None,
            "source": "file",
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.unstructured_items.insert_one(item_doc)
        item_doc.pop("_id", None)
        created_items.append(item_doc)
    
    return {
        "filename": file.filename,
        "parsed_count": len(created_items),
        "items": created_items
    }

@api_router.post("/equipment-hierarchy/unstructured/{item_id}/assign")
async def assign_unstructured_to_hierarchy(
    item_id: str,
    assignment: AssignToHierarchyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Move an unstructured item into the ISO hierarchy."""
    # Get the unstructured item
    item = await db.unstructured_items.find_one(
        {"id": item_id, "created_by": current_user["id"]}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Unstructured item not found")
    
    # Check for duplicate name under the same parent
    existing = await db.equipment_nodes.find_one({
        "name": item["name"],
        "parent_id": assignment.parent_id,
        "created_by": current_user["id"]
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"A node with name '{item['name']}' already exists under this parent"
        )
    
    # Validate parent exists
    parent = await db.equipment_nodes.find_one(
        {"id": assignment.parent_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not parent:
        raise HTTPException(status_code=400, detail="Parent node not found")
    
    # Validate ISO level relationship
    try:
        target_level = ISOLevel(assignment.level)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid ISO level: {assignment.level}")
    
    parent_level = ISOLevel(parent["level"])
    if not is_valid_parent_child(parent_level, target_level):
        valid_children = get_valid_child_levels(parent_level)
        raise HTTPException(
            status_code=400,
            detail=f"Cannot add {target_level.value} under {parent_level.value}. Valid: {[c.value for c in valid_children]}"
        )
    
    # Create the equipment node
    node_id = str(uuid.uuid4())
    node_doc = {
        "id": node_id,
        "name": item["name"],
        "level": target_level.value,
        "parent_id": assignment.parent_id,
        "equipment_type_id": item.get("detected_type_id"),
        "description": f"Imported from unstructured list (source: {item.get('source', 'unknown')})",
        "criticality": None,
        "discipline": item.get("detected_discipline"),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.equipment_nodes.insert_one(node_doc)
    node_doc.pop("_id", None)
    
    # Delete the unstructured item
    await db.unstructured_items.delete_one({"id": item_id})
    
    return node_doc

@api_router.delete("/equipment-hierarchy/unstructured/{item_id}")
async def delete_unstructured_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an unstructured item."""
    result = await db.unstructured_items.delete_one(
        {"id": item_id, "created_by": current_user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}

@api_router.delete("/equipment-hierarchy/unstructured")
async def clear_unstructured_items(
    current_user: dict = Depends(get_current_user)
):
    """Delete all unstructured items for the current user."""
    result = await db.unstructured_items.delete_many(
        {"created_by": current_user["id"]}
    )
    return {"message": f"Deleted {result.deleted_count} items"}

# Include router and middleware
# ============= CAUSAL INVESTIGATION ENDPOINTS =============

async def generate_case_number(user_id: str) -> str:
    """Generate a unique case number for investigation."""
    count = await db.investigations.count_documents({"created_by": user_id})
    year = datetime.now(timezone.utc).strftime("%Y")
    return f"INV-{year}-{count + 1:04d}"


async def generate_action_number(investigation_id: str) -> str:
    """Generate a unique action number."""
    count = await db.action_items.count_documents({"investigation_id": investigation_id})
    return f"ACT-{count + 1:03d}"


@api_router.post("/investigations")
async def create_investigation(
    data: InvestigationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new investigation case."""
    inv_id = str(uuid.uuid4())
    case_number = await generate_case_number(current_user["id"])
    
    inv_doc = {
        "id": inv_id,
        "case_number": case_number,
        "title": data.title,
        "description": data.description,
        "asset_id": data.asset_id,
        "asset_name": data.asset_name,
        "location": data.location,
        "incident_date": data.incident_date,
        "investigation_leader": data.investigation_leader or current_user["name"],
        "team_members": data.team_members,
        "threat_id": data.threat_id,
        "status": InvestigationStatus.DRAFT.value,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.investigations.insert_one(inv_doc)
    inv_doc.pop("_id", None)
    return inv_doc


@api_router.get("/investigations")
async def get_investigations(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all investigations for the current user."""
    query = {"created_by": current_user["id"]}
    if status:
        query["status"] = status
    
    investigations = await db.investigations.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"investigations": investigations}


@api_router.get("/investigations/{inv_id}")
async def get_investigation(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific investigation with all related data."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Get related data
    events = await db.timeline_events.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).sort("event_time", 1).to_list(500)
    
    failures = await db.failure_identifications.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).to_list(100)
    
    causes = await db.cause_nodes.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).to_list(500)
    
    actions = await db.action_items.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    evidence = await db.evidence_items.find(
        {"investigation_id": inv_id}, {"_id": 0}
    ).to_list(100)
    
    return {
        "investigation": inv,
        "timeline_events": events,
        "failure_identifications": failures,
        "cause_nodes": causes,
        "action_items": actions,
        "evidence": evidence
    }


@api_router.patch("/investigations/{inv_id}")
async def update_investigation(
    inv_id: str,
    update: InvestigationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "status" in update_data and isinstance(update_data["status"], InvestigationStatus):
        update_data["status"] = update_data["status"].value
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.investigations.update_one({"id": inv_id}, {"$set": update_data})
    
    updated = await db.investigations.find_one({"id": inv_id}, {"_id": 0})
    return updated


@api_router.delete("/investigations/{inv_id}")
async def delete_investigation(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an investigation and all related data."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Delete all related data
    await db.timeline_events.delete_many({"investigation_id": inv_id})
    await db.failure_identifications.delete_many({"investigation_id": inv_id})
    await db.cause_nodes.delete_many({"investigation_id": inv_id})
    await db.action_items.delete_many({"investigation_id": inv_id})
    await db.evidence_items.delete_many({"investigation_id": inv_id})
    await db.investigations.delete_one({"id": inv_id})
    
    return {"message": "Investigation deleted"}


# ============= TIMELINE EVENTS =============

@api_router.post("/investigations/{inv_id}/events")
async def create_timeline_event(
    inv_id: str,
    data: TimelineEventCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a timeline event to an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    event_id = str(uuid.uuid4())
    event_doc = {
        "id": event_id,
        "investigation_id": inv_id,
        "event_time": data.event_time,
        "description": data.description,
        "category": data.category.value,
        "evidence_source": data.evidence_source,
        "confidence": data.confidence.value,
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.timeline_events.insert_one(event_doc)
    event_doc.pop("_id", None)
    return event_doc


@api_router.patch("/investigations/{inv_id}/events/{event_id}")
async def update_timeline_event(
    inv_id: str,
    event_id: str,
    update: TimelineEventUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a timeline event."""
    event = await db.timeline_events.find_one({"id": event_id, "investigation_id": inv_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "category" in update_data and isinstance(update_data["category"], EventCategory):
        update_data["category"] = update_data["category"].value
    if "confidence" in update_data and isinstance(update_data["confidence"], ConfidenceLevel):
        update_data["confidence"] = update_data["confidence"].value
    
    if update_data:
        await db.timeline_events.update_one({"id": event_id}, {"$set": update_data})
    
    updated = await db.timeline_events.find_one({"id": event_id}, {"_id": 0})
    return updated


@api_router.delete("/investigations/{inv_id}/events/{event_id}")
async def delete_timeline_event(
    inv_id: str,
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a timeline event."""
    result = await db.timeline_events.delete_one({"id": event_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}


# ============= FAILURE IDENTIFICATIONS =============

@api_router.post("/investigations/{inv_id}/failures")
async def create_failure_identification(
    inv_id: str,
    data: FailureIdentificationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a failure identification to an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    failure_id = str(uuid.uuid4())
    failure_doc = {
        "id": failure_id,
        "investigation_id": inv_id,
        "asset_name": data.asset_name or "",
        "subsystem": data.subsystem or "",
        "component": data.component or "",
        "failure_mode": data.failure_mode or "",
        "degradation_mechanism": data.degradation_mechanism or "",
        "evidence": data.evidence or "",
        "failure_mode_id": data.failure_mode_id,
        "comment": data.comment or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.failure_identifications.insert_one(failure_doc)
    failure_doc.pop("_id", None)
    return failure_doc


@api_router.patch("/investigations/{inv_id}/failures/{failure_id}")
async def update_failure_identification(
    inv_id: str,
    failure_id: str,
    update: FailureIdentificationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a failure identification."""
    failure = await db.failure_identifications.find_one({"id": failure_id, "investigation_id": inv_id})
    if not failure:
        raise HTTPException(status_code=404, detail="Failure identification not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.failure_identifications.update_one({"id": failure_id}, {"$set": update_data})
    
    updated = await db.failure_identifications.find_one({"id": failure_id}, {"_id": 0})
    return updated


@api_router.delete("/investigations/{inv_id}/failures/{failure_id}")
async def delete_failure_identification(
    inv_id: str,
    failure_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a failure identification."""
    result = await db.failure_identifications.delete_one({"id": failure_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Failure identification not found")
    return {"message": "Failure identification deleted"}


# ============= CAUSE NODES (CAUSAL TREE) =============

@api_router.post("/investigations/{inv_id}/causes")
async def create_cause_node(
    inv_id: str,
    data: CauseNodeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a cause node to the causal tree."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Validate parent exists if specified
    if data.parent_id:
        parent = await db.cause_nodes.find_one({"id": data.parent_id, "investigation_id": inv_id})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent cause node not found")
    
    cause_id = str(uuid.uuid4())
    cause_doc = {
        "id": cause_id,
        "investigation_id": inv_id,
        "description": data.description,
        "category": data.category.value,
        "parent_id": data.parent_id,
        "is_root_cause": data.is_root_cause,
        "evidence": data.evidence,
        "linked_event_id": data.linked_event_id,
        "linked_failure_id": data.linked_failure_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.cause_nodes.insert_one(cause_doc)
    cause_doc.pop("_id", None)
    return cause_doc


@api_router.patch("/investigations/{inv_id}/causes/{cause_id}")
async def update_cause_node(
    inv_id: str,
    cause_id: str,
    update: CauseNodeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a cause node."""
    cause = await db.cause_nodes.find_one({"id": cause_id, "investigation_id": inv_id})
    if not cause:
        raise HTTPException(status_code=404, detail="Cause node not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "category" in update_data and isinstance(update_data["category"], CauseCategory):
        update_data["category"] = update_data["category"].value
    
    if update_data:
        await db.cause_nodes.update_one({"id": cause_id}, {"$set": update_data})
    
    updated = await db.cause_nodes.find_one({"id": cause_id}, {"_id": 0})
    return updated


@api_router.delete("/investigations/{inv_id}/causes/{cause_id}")
async def delete_cause_node(
    inv_id: str,
    cause_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a cause node and its children."""
    # Get all children recursively
    async def get_children_ids(parent_id):
        children = await db.cause_nodes.find(
            {"parent_id": parent_id, "investigation_id": inv_id},
            {"_id": 0, "id": 1}
        ).to_list(100)
        all_ids = [c["id"] for c in children]
        for child in children:
            all_ids.extend(await get_children_ids(child["id"]))
        return all_ids
    
    children_ids = await get_children_ids(cause_id)
    all_ids = [cause_id] + children_ids
    
    result = await db.cause_nodes.delete_many({"id": {"$in": all_ids}})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cause node not found")
    
    return {"message": f"Deleted {result.deleted_count} cause nodes"}


# ============= ACTION ITEMS =============

@api_router.post("/investigations/{inv_id}/actions")
async def create_action_item(
    inv_id: str,
    data: ActionItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add an action item to an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    action_id = str(uuid.uuid4())
    action_number = await generate_action_number(inv_id)
    
    action_doc = {
        "id": action_id,
        "investigation_id": inv_id,
        "action_number": action_number,
        "description": data.description,
        "owner": data.owner or "",
        "priority": data.priority.value if hasattr(data.priority, 'value') else data.priority,
        "due_date": data.due_date or "",
        "status": ActionStatus.OPEN.value,
        "linked_cause_id": data.linked_cause_id,
        "comment": data.comment or "",
        "completion_notes": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.action_items.insert_one(action_doc)
    action_doc.pop("_id", None)
    return action_doc


@api_router.patch("/investigations/{inv_id}/actions/{action_id}")
async def update_action_item(
    inv_id: str,
    action_id: str,
    update: ActionItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an action item."""
    action = await db.action_items.find_one({"id": action_id, "investigation_id": inv_id})
    if not action:
        raise HTTPException(status_code=404, detail="Action item not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "priority" in update_data and isinstance(update_data["priority"], ActionPriority):
        update_data["priority"] = update_data["priority"].value
    if "status" in update_data and isinstance(update_data["status"], ActionStatus):
        update_data["status"] = update_data["status"].value
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.action_items.update_one({"id": action_id}, {"$set": update_data})
    
    updated = await db.action_items.find_one({"id": action_id}, {"_id": 0})
    return updated


@api_router.delete("/investigations/{inv_id}/actions/{action_id}")
async def delete_action_item(
    inv_id: str,
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an action item."""
    result = await db.action_items.delete_one({"id": action_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action item not found")
    return {"message": "Action item deleted"}


# ============= EVIDENCE =============

@api_router.post("/investigations/{inv_id}/evidence")
async def add_evidence(
    inv_id: str,
    data: EvidenceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add evidence to an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    evidence_id = str(uuid.uuid4())
    evidence_doc = {
        "id": evidence_id,
        "investigation_id": inv_id,
        "name": data.name,
        "evidence_type": data.evidence_type,
        "description": data.description,
        "file_url": data.file_url,
        "linked_event_id": data.linked_event_id,
        "linked_cause_id": data.linked_cause_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.evidence_items.insert_one(evidence_doc)
    evidence_doc.pop("_id", None)
    return evidence_doc


@api_router.delete("/investigations/{inv_id}/evidence/{evidence_id}")
async def delete_evidence(
    inv_id: str,
    evidence_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete evidence."""
    result = await db.evidence_items.delete_one({"id": evidence_id, "investigation_id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return {"message": "Evidence deleted"}


@api_router.post("/investigations/{inv_id}/upload")
async def upload_investigation_file(
    inv_id: str,
    file: UploadFile = File(...),
    description: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Upload a file to an investigation."""
    # Verify investigation exists
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Get file extension and content type
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    
    # Determine evidence type based on file extension
    image_exts = ["jpg", "jpeg", "png", "gif", "webp"]
    doc_exts = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv"]
    if ext in image_exts:
        evidence_type = "photo"
    elif ext in doc_exts:
        evidence_type = "document"
    else:
        evidence_type = "file"
    
    # Read file data
    file_data = await file.read()
    file_size = len(file_data)
    
    # Check file size (max 10MB)
    if file_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
    
    # Generate storage path
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/investigations/{inv_id}/{file_id}.{ext}"
    
    try:
        # Upload to object storage
        result = put_object(storage_path, file_data, content_type)
        
        # Create evidence record
        evidence_doc = {
            "id": file_id,
            "investigation_id": inv_id,
            "name": file.filename,
            "evidence_type": evidence_type,
            "description": description,
            "storage_path": result["path"],
            "content_type": content_type,
            "file_size": file_size,
            "original_filename": file.filename,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.evidence_items.insert_one(evidence_doc)
        evidence_doc.pop("_id", None)
        
        return evidence_doc
        
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@api_router.get("/files/{path:path}")
async def download_file(
    path: str,
    authorization: str = Header(None),
    auth: str = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Download a file from storage."""
    # Find file record
    record = await db.evidence_items.find_one({"storage_path": path, "is_deleted": {"$ne": True}})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        data, content_type = get_object(path)
        return Response(
            content=data, 
            media_type=record.get("content_type", content_type),
            headers={
                "Content-Disposition": f'inline; filename="{record.get("original_filename", "download")}"'
            }
        )
    except Exception as e:
        logger.error(f"File download failed: {e}")
        raise HTTPException(status_code=500, detail="File download failed")


# ============= CENTRALIZED ACTIONS MANAGEMENT =============

class CentralActionCreate(BaseModel):
    """Model for creating a centralized action."""
    title: str
    description: str
    source_type: str  # 'threat' or 'investigation'
    source_id: str
    source_name: str  # threat title or investigation title for reference
    priority: str = "medium"
    assignee: Optional[str] = None
    discipline: Optional[str] = None
    due_date: Optional[str] = None


class CentralActionUpdate(BaseModel):
    """Model for updating a centralized action."""
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    discipline: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    completion_notes: Optional[str] = None


@api_router.get("/actions")
async def get_all_actions(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee: Optional[str] = None,
    source_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all centralized actions with optional filters."""
    query = {"created_by": current_user["id"]}
    
    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        query["priority"] = priority
    if assignee:
        query["assignee"] = {"$regex": assignee, "$options": "i"}
    if source_type and source_type != "all":
        query["source_type"] = source_type
    
    actions = await db.central_actions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get stats
    total = await db.central_actions.count_documents({"created_by": current_user["id"]})
    open_count = await db.central_actions.count_documents({"created_by": current_user["id"], "status": "open"})
    in_progress_count = await db.central_actions.count_documents({"created_by": current_user["id"], "status": "in_progress"})
    completed_count = await db.central_actions.count_documents({"created_by": current_user["id"], "status": "completed"})
    overdue_count = await db.central_actions.count_documents({
        "created_by": current_user["id"],
        "status": {"$in": ["open", "in_progress"]},
        "due_date": {"$lt": datetime.now(timezone.utc).isoformat(), "$ne": None}
    })
    
    return {
        "actions": actions,
        "stats": {
            "total": total,
            "open": open_count,
            "in_progress": in_progress_count,
            "completed": completed_count,
            "overdue": overdue_count
        }
    }


@api_router.post("/actions")
async def create_central_action(
    data: CentralActionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new centralized action (promote from threat or investigation)."""
    action_id = str(uuid.uuid4())
    
    # Generate action number
    count = await db.central_actions.count_documents({"created_by": current_user["id"]})
    action_number = f"ACT-{count + 1:04d}"
    
    action_doc = {
        "id": action_id,
        "action_number": action_number,
        "title": data.title,
        "description": data.description,
        "source_type": data.source_type,
        "source_id": data.source_id,
        "source_name": data.source_name,
        "priority": data.priority,
        "assignee": data.assignee,
        "discipline": data.discipline,
        "due_date": data.due_date,
        "status": "open",
        "completion_notes": None,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.central_actions.insert_one(action_doc)
    action_doc.pop("_id", None)
    return action_doc


@api_router.get("/actions/{action_id}")
async def get_central_action(
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific centralized action."""
    action = await db.central_actions.find_one(
        {"id": action_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@api_router.patch("/actions/{action_id}")
async def update_central_action(
    action_id: str,
    data: CentralActionUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a centralized action."""
    action = await db.central_actions.find_one(
        {"id": action_id, "created_by": current_user["id"]}
    )
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.central_actions.update_one(
        {"id": action_id},
        {"$set": update_data}
    )
    
    updated = await db.central_actions.find_one({"id": action_id}, {"_id": 0})
    return updated


@api_router.delete("/actions/{action_id}")
async def delete_central_action(
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a centralized action."""
    result = await db.central_actions.delete_one(
        {"id": action_id, "created_by": current_user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"message": "Action deleted"}


# ============= INVESTIGATION STATS =============

@api_router.get("/investigations/{inv_id}/stats")
async def get_investigation_stats(
    inv_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get statistics for an investigation."""
    inv = await db.investigations.find_one(
        {"id": inv_id, "created_by": current_user["id"]}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    events_count = await db.timeline_events.count_documents({"investigation_id": inv_id})
    failures_count = await db.failure_identifications.count_documents({"investigation_id": inv_id})
    causes_count = await db.cause_nodes.count_documents({"investigation_id": inv_id})
    root_causes_count = await db.cause_nodes.count_documents({"investigation_id": inv_id, "is_root_cause": True})
    actions_count = await db.action_items.count_documents({"investigation_id": inv_id})
    open_actions = await db.action_items.count_documents({"investigation_id": inv_id, "status": {"$in": ["open", "in_progress"]}})
    evidence_count = await db.evidence_items.count_documents({"investigation_id": inv_id})
    
    return {
        "timeline_events": events_count,
        "failure_identifications": failures_count,
        "total_causes": causes_count,
        "root_causes": root_causes_count,
        "total_actions": actions_count,
        "open_actions": open_actions,
        "evidence_items": evidence_count
    }


# ============= CREATE INVESTIGATION FROM THREAT =============

# Common causes by failure mode category
FAILURE_MODE_CAUSES = {
    "Seal Failure": ["Mechanical wear", "Improper installation", "Material incompatibility", "Excessive vibration", "Thermal cycling"],
    "Bearing Failure": ["Inadequate lubrication", "Contamination", "Misalignment", "Overloading", "Fatigue"],
    "Cavitation": ["Low suction pressure", "High fluid temperature", "Blocked suction line", "Incorrect pump sizing"],
    "Misalignment": ["Foundation settlement", "Thermal expansion", "Improper installation", "Coupling wear"],
    "Corrosion": ["Chemical attack", "Galvanic action", "Erosion-corrosion", "Microbiological activity", "Oxygen ingress"],
    "Internal Corrosion": ["Inadequate corrosion allowance", "Chemical incompatibility", "High temperature", "Stagnant conditions"],
    "External Corrosion": ["Coating failure", "Insulation damage", "Environmental exposure", "CUI"],
    "CUI": ["Damaged insulation", "Water ingress", "Inadequate sealing", "Temperature cycling"],
    "Fouling": ["Inadequate treatment", "Poor design", "Low velocity", "Chemical precipitation"],
    "Leak": ["Seal failure", "Corrosion", "Mechanical damage", "Thermal stress", "Vibration fatigue"],
    "Valve Stuck": ["Corrosion buildup", "Debris", "Inadequate lubrication", "Actuator failure"],
    "Sensor Drift": ["Age degradation", "Environmental exposure", "Calibration error", "Electrical interference"],
    "Motor Burnout": ["Overloading", "Poor ventilation", "Voltage imbalance", "Bearing failure", "Insulation breakdown"],
    "Overpressure": ["Relief valve failure", "Blocked outlet", "Runaway reaction", "Control system failure"],
    "default": ["Equipment degradation", "Maintenance gap", "Operating condition deviation", "Design limitation"]
}


@api_router.post("/threats/{threat_id}/investigate")
async def create_investigation_from_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new investigation from an existing threat with auto-generated timeline and causal diagram."""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Check if investigation already exists for this threat
    existing = await db.investigations.find_one({"threat_id": threat_id})
    if existing:
        return {"investigation": existing, "message": "Investigation already exists for this threat"}
    
    inv_id = str(uuid.uuid4())
    case_number = await generate_case_number(current_user["id"])
    now = datetime.now(timezone.utc).isoformat()
    
    inv_doc = {
        "id": inv_id,
        "case_number": case_number,
        "title": f"Investigation: {threat['title']}",
        "description": f"Investigation initiated from threat report.\n\nAsset: {threat['asset']}\nFailure Mode: {threat['failure_mode']}\nRisk Level: {threat['risk_level']}\nRisk Score: {threat['risk_score']}",
        "asset_id": None,
        "asset_name": threat.get("asset"),
        "location": threat.get("location"),
        "incident_date": threat.get("created_at"),
        "investigation_leader": current_user["name"],
        "team_members": [],
        "threat_id": threat_id,
        "status": InvestigationStatus.DRAFT.value,
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now
    }
    
    await db.investigations.insert_one(inv_doc)
    inv_doc.pop("_id", None)
    
    # ========== AUTO-CREATE TIMELINE EVENTS ==========
    timeline_events = []
    
    # 1. Initial threat report event
    timeline_events.append({
        "id": str(uuid.uuid4()),
        "investigation_id": inv_id,
        "timestamp": threat.get("created_at", now),
        "description": f"Threat reported: {threat['title']}",
        "category": "discovery",
        "source": "Threat Report System",
        "confidence": "high",
        "created_at": now
    })
    
    # 2. Asset information event
    if threat.get("asset"):
        timeline_events.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "timestamp": threat.get("created_at", now),
            "description": f"Affected asset identified: {threat['asset']} ({threat.get('equipment_type', 'Unknown type')})",
            "category": "observation",
            "source": "Threat Report",
            "confidence": "high",
            "created_at": now
        })
    
    # 3. Failure mode observation
    if threat.get("failure_mode"):
        timeline_events.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "timestamp": threat.get("created_at", now),
            "description": f"Observed failure mode: {threat['failure_mode']}",
            "category": "observation",
            "source": "Threat Report",
            "confidence": "medium",
            "created_at": now
        })
    
    # 4. Root cause hypothesis (if available)
    if threat.get("cause"):
        timeline_events.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "timestamp": now,
            "description": f"Initial hypothesis: {threat['cause']}",
            "category": "analysis",
            "source": "AI Analysis",
            "confidence": "medium",
            "created_at": now
        })
    
    # Insert all timeline events
    if timeline_events:
        await db.timeline_events.insert_many(timeline_events)
    
    # ========== AUTO-CREATE FAILURE IDENTIFICATION ==========
    failure_doc = None
    matching_fm = None
    if threat.get("failure_mode"):
        # Try to find matching failure mode from library
        failure_mode_text = threat["failure_mode"].lower()
        for fm in FAILURE_MODES_LIBRARY:
            if fm["failure_mode"].lower() in failure_mode_text or failure_mode_text in fm["failure_mode"].lower():
                matching_fm = fm
                break
            # Also check keywords
            for kw in fm.get("keywords", []):
                if kw.lower() in failure_mode_text:
                    matching_fm = fm
                    break
            if matching_fm:
                break
        
        failure_doc = {
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "asset_name": threat.get("asset", "Unknown"),
            "subsystem": None,
            "component": threat.get("equipment_type", "Unknown"),
            "failure_mode": threat.get("failure_mode"),
            "degradation_mechanism": threat.get("cause"),
            "evidence": f"From threat report: {threat.get('title')}",
            "failure_mode_id": matching_fm["id"] if matching_fm else None,
            "created_at": now
        }
        await db.failure_identifications.insert_one(failure_doc)
    
    # ========== AUTO-CREATE DRAFT CAUSAL DIAGRAM ==========
    cause_nodes = []
    
    # Root node (the failure/problem)
    root_cause_id = str(uuid.uuid4())
    cause_nodes.append({
        "id": root_cause_id,
        "investigation_id": inv_id,
        "description": f"Problem: {threat['title']}",
        "category": "problem",
        "parent_id": None,
        "is_root_cause": False,
        "verification_status": "unverified",
        "created_at": now
    })
    
    # Immediate cause node (failure mode)
    immediate_cause_id = str(uuid.uuid4())
    cause_nodes.append({
        "id": immediate_cause_id,
        "investigation_id": inv_id,
        "description": f"Failure Mode: {threat.get('failure_mode', 'Unknown')}",
        "category": "immediate",
        "parent_id": root_cause_id,
        "is_root_cause": False,
        "verification_status": "unverified",
        "created_at": now
    })
    
    # Get potential root causes based on failure mode
    failure_mode_key = None
    failure_mode_text = threat.get("failure_mode", "").lower()
    for key in FAILURE_MODE_CAUSES.keys():
        if key.lower() in failure_mode_text or failure_mode_text in key.lower():
            failure_mode_key = key
            break
    
    potential_causes = FAILURE_MODE_CAUSES.get(failure_mode_key, FAILURE_MODE_CAUSES["default"])
    
    # Add potential root causes as child nodes
    for i, cause in enumerate(potential_causes[:4]):  # Limit to 4 potential causes
        cause_nodes.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "description": f"Potential Cause {i+1}: {cause}",
            "category": "contributing",
            "parent_id": immediate_cause_id,
            "is_root_cause": False,
            "verification_status": "unverified",
            "created_at": now
        })
    
    # If we have a hypothesis from the threat, add it as a likely root cause
    if threat.get("cause"):
        cause_nodes.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "description": f"Hypothesis: {threat['cause']}",
            "category": "root",
            "parent_id": immediate_cause_id,
            "is_root_cause": True,
            "verification_status": "unverified",
            "created_at": now
        })
    
    # Insert all cause nodes
    if cause_nodes:
        await db.cause_nodes.insert_many(cause_nodes)
    
    # ========== AUTO-CREATE RECOMMENDED ACTIONS ==========
    action_items = []
    
    # Get recommended actions from matching failure mode or threat
    recommended_actions = []
    if matching_fm and matching_fm.get("recommended_actions"):
        recommended_actions = matching_fm["recommended_actions"]
    elif threat.get("recommended_actions"):
        recommended_actions = threat["recommended_actions"]
    
    for i, action in enumerate(recommended_actions[:5]):  # Limit to 5 actions
        action_number = f"ACT-{case_number}-{str(i+1).zfill(3)}"
        action_items.append({
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "action_number": action_number,
            "description": action,
            "action_type": "corrective",
            "priority": "medium" if i > 1 else "high",
            "owner": current_user["name"],
            "due_date": None,
            "status": "open",
            "completion_date": None,
            "verification_method": None,
            "created_at": now
        })
    
    if action_items:
        await db.action_items.insert_many(action_items)
    
    return {
        "investigation": inv_doc, 
        "message": "Investigation created from threat with auto-generated timeline and causal diagram",
        "auto_generated": {
            "timeline_events": len(timeline_events),
            "failure_identifications": 1 if failure_doc else 0,
            "cause_nodes": len(cause_nodes),
            "action_items": len(action_items)
        }
    }


# ============= AI RISK ENGINE ENDPOINTS =============

from ai_risk_engine import AIRiskEngine
from ai_risk_models import (
    AnalyzeRiskRequest, GenerateCausesRequest, GenerateFaultTreeRequest, OptimizeActionsRequest
)

# Initialize AI Risk Engine
ai_engine = AIRiskEngine(api_key=EMERGENT_LLM_KEY)


@api_router.post("/ai/analyze-risk/{threat_id}")
async def analyze_threat_risk(
    threat_id: str,
    request: AnalyzeRiskRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """AI-powered dynamic risk analysis for a threat"""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Get equipment data if available
    equipment_data = None
    if threat.get("asset"):
        equipment_node = await db.equipment_nodes.find_one(
            {"name": threat["asset"], "created_by": current_user["id"]},
            {"_id": 0}
        )
        if equipment_node:
            equipment_data = equipment_node
    
    # Get similar historical threats
    historical_threats = []
    if request and request.include_similar_incidents:
        similar = await db.threats.find(
            {
                "created_by": current_user["id"],
                "id": {"$ne": threat_id},
                "$or": [
                    {"equipment_type": threat.get("equipment_type")},
                    {"failure_mode": threat.get("failure_mode")}
                ]
            },
            {"_id": 0}
        ).limit(5).to_list(5)
        historical_threats = similar
    
    include_forecast = request.include_forecast if request else True
    
    result = await ai_engine.analyze_risk(
        threat=threat,
        equipment_data=equipment_data,
        historical_threats=historical_threats,
        include_forecast=include_forecast
    )
    
    # Store the AI insights for the threat
    await db.ai_risk_insights.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "dynamic_risk": result.dynamic_risk.model_dump(),
            "forecasts": [f.model_dump() for f in result.forecasts],
            "key_insights": result.key_insights,
            "recommendations": result.recommendations,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@api_router.get("/ai/risk-insights/{threat_id}")
async def get_risk_insights(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached AI risk insights for a threat"""
    insight = await db.ai_risk_insights.find_one(
        {"threat_id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not insight:
        raise HTTPException(status_code=404, detail="No AI insights available for this threat. Run analysis first.")
    return insight


@api_router.get("/ai/top-risks")
async def get_ai_top_risks(
    limit: int = 5,
    current_user: dict = Depends(get_current_user)
):
    """Get AI-curated top risks based on dynamic scoring"""
    # Get threats with AI insights
    insights = await db.ai_risk_insights.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).sort("dynamic_risk.risk_score", -1).limit(limit).to_list(limit)
    
    # Enrich with threat data
    result = []
    for insight in insights:
        threat = await db.threats.find_one(
            {"id": insight["threat_id"]},
            {"_id": 0}
        )
        if threat:
            result.append({
                "threat": threat,
                "ai_insight": insight
            })
    
    # If not enough AI-analyzed threats, include top threats by regular score
    if len(result) < limit:
        analyzed_ids = [r["threat"]["id"] for r in result]
        additional = await db.threats.find(
            {
                "created_by": current_user["id"],
                "id": {"$nin": analyzed_ids},
                "status": {"$ne": "Closed"}
            },
            {"_id": 0}
        ).sort("risk_score", -1).limit(limit - len(result)).to_list(limit - len(result))
        
        for threat in additional:
            result.append({
                "threat": threat,
                "ai_insight": None
            })
    
    return {"top_risks": result}


@api_router.post("/ai/generate-causes/{threat_id}")
async def generate_threat_causes(
    threat_id: str,
    request: GenerateCausesRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """AI-powered causal analysis - generates probable causes"""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    equipment_data = None
    if threat.get("asset"):
        equipment_node = await db.equipment_nodes.find_one(
            {"name": threat["asset"], "created_by": current_user["id"]},
            {"_id": 0}
        )
        if equipment_node:
            equipment_data = equipment_node
    
    max_causes = request.max_causes if request else 5
    
    result = await ai_engine.generate_causes(
        threat=threat,
        equipment_data=equipment_data,
        max_causes=max_causes
    )
    
    # Store the causal analysis
    await db.ai_causal_analysis.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "summary": result.summary,
            "probable_causes": [c.model_dump() for c in result.probable_causes],
            "contributing_factors": result.contributing_factors,
            "confidence": result.confidence.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@api_router.get("/ai/causal-analysis/{threat_id}")
async def get_causal_analysis(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached causal analysis for a threat"""
    analysis = await db.ai_causal_analysis.find_one(
        {"threat_id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not analysis:
        raise HTTPException(status_code=404, detail="No causal analysis available. Generate one first.")
    return analysis


@api_router.post("/ai/explain/{threat_id}")
async def explain_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """'Why is this happening?' - AI explains the threat with evidence"""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Check if we have cached causal analysis
    existing = await db.ai_causal_analysis.find_one(
        {"threat_id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    
    if existing:
        return {
            "threat_id": threat_id,
            "summary": existing.get("summary", ""),
            "probable_causes": existing.get("probable_causes", []),
            "contributing_factors": existing.get("contributing_factors", []),
            "confidence": existing.get("confidence", "medium"),
            "cached": True
        }
    
    # Generate new analysis
    result = await ai_engine.generate_causes(threat=threat, max_causes=5)
    
    # Store it
    await db.ai_causal_analysis.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "summary": result.summary,
            "probable_causes": [c.model_dump() for c in result.probable_causes],
            "contributing_factors": result.contributing_factors,
            "confidence": result.confidence.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return {
        "threat_id": threat_id,
        "summary": result.summary,
        "probable_causes": [c.model_dump() for c in result.probable_causes],
        "contributing_factors": result.contributing_factors,
        "confidence": result.confidence.value,
        "cached": False
    }


@api_router.post("/ai/fault-tree/{threat_id}")
async def generate_fault_tree(
    threat_id: str,
    request: GenerateFaultTreeRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate a fault tree diagram for the threat"""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    max_depth = request.max_depth if request else 4
    
    result = await ai_engine.generate_fault_tree(
        threat=threat,
        max_depth=max_depth
    )
    
    # Store the fault tree
    await db.ai_fault_trees.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "top_event": result.top_event,
            "root": result.root.model_dump(),
            "total_nodes": result.total_nodes,
            "generated_at": result.generated_at,
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@api_router.get("/ai/fault-tree/{threat_id}")
async def get_fault_tree(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached fault tree for a threat"""
    tree = await db.ai_fault_trees.find_one(
        {"threat_id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not tree:
        raise HTTPException(status_code=404, detail="No fault tree available. Generate one first.")
    return tree


@api_router.post("/ai/bow-tie/{threat_id}")
async def generate_bow_tie(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate a bow-tie risk model for the threat"""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    result = await ai_engine.generate_bow_tie(threat=threat)
    
    # Store the bow-tie model
    await db.ai_bow_ties.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "hazard": result.hazard,
            "top_event": result.top_event,
            "causes": result.causes,
            "consequences": result.consequences,
            "preventive_barriers": [b.model_dump() for b in result.preventive_barriers],
            "mitigative_barriers": [b.model_dump() for b in result.mitigative_barriers],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@api_router.get("/ai/bow-tie/{threat_id}")
async def get_bow_tie(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached bow-tie model for a threat"""
    bow_tie = await db.ai_bow_ties.find_one(
        {"threat_id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not bow_tie:
        raise HTTPException(status_code=404, detail="No bow-tie model available. Generate one first.")
    return bow_tie


@api_router.post("/ai/optimize-actions/{threat_id}")
async def optimize_threat_actions(
    threat_id: str,
    request: OptimizeActionsRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """AI-powered action optimization with ROI analysis"""
    threat = await db.threats.find_one(
        {"id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    
    # Get existing causal analysis if available
    causes = None
    causal_analysis = await db.ai_causal_analysis.find_one(
        {"threat_id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if causal_analysis:
        from ai_risk_models import ProbableCause, CauseProbability
        causes = [
            ProbableCause(
                id=c.get("id", ""),
                description=c.get("description", ""),
                category=c.get("category", "technical_cause"),
                probability=c.get("probability", 50.0),
                probability_level=CauseProbability(c.get("probability_level", "possible")),
                evidence=c.get("evidence", []),
                supporting_data=c.get("supporting_data", []),
                mitigation_actions=c.get("mitigation_actions", [])
            )
            for c in causal_analysis.get("probable_causes", [])
        ]
    
    budget_limit = request.budget_limit if request else None
    prioritize_by = request.prioritize_by if request else "roi"
    
    result = await ai_engine.optimize_actions(
        threat=threat,
        causes=causes,
        budget_limit=budget_limit,
        prioritize_by=prioritize_by
    )
    
    # Store the optimization result
    await db.ai_action_optimization.update_one(
        {"threat_id": threat_id},
        {"$set": {
            "threat_id": threat_id,
            "recommended_actions": [a.model_dump() for a in result.recommended_actions],
            "total_potential_risk_reduction": result.total_potential_risk_reduction,
            "optimal_action_sequence": result.optimal_action_sequence,
            "analysis_summary": result.analysis_summary,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }},
        upsert=True
    )
    
    return result.model_dump()


@api_router.get("/ai/action-optimization/{threat_id}")
async def get_action_optimization(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get cached action optimization for a threat"""
    optimization = await db.ai_action_optimization.find_one(
        {"threat_id": threat_id, "created_by": current_user["id"]},
        {"_id": 0}
    )
    if not optimization:
        raise HTTPException(status_code=404, detail="No action optimization available. Generate one first.")
    return optimization


# ============= MAINTENANCE STRATEGY ENDPOINTS =============

@api_router.get("/maintenance-strategies")
async def list_maintenance_strategies(
    equipment_type_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all maintenance strategies, optionally filtered"""
    query = {}
    if equipment_type_id:
        query["equipment_type_id"] = equipment_type_id
    
    strategies = await db.maintenance_strategies.find(query, {"_id": 0}).to_list(1000)
    
    # Apply search filter if provided
    if search:
        search_lower = search.lower()
        strategies = [
            s for s in strategies
            if search_lower in s.get("equipment_type_name", "").lower()
            or search_lower in s.get("description", "").lower()
            or any(search_lower in sp.get("part_name", "").lower() for sp in s.get("spare_parts", []))
            or any(search_lower in fm.get("failure_mode_name", "").lower() for fm in s.get("failure_mode_mappings", []))
        ]
    
    return {"strategies": strategies, "total": len(strategies)}


@api_router.get("/maintenance-strategies/{strategy_id}")
async def get_maintenance_strategy(
    strategy_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific maintenance strategy by ID"""
    strategy = await db.maintenance_strategies.find_one({"id": strategy_id}, {"_id": 0})
    if not strategy:
        raise HTTPException(status_code=404, detail="Maintenance strategy not found")
    return strategy


@api_router.get("/maintenance-strategies/by-equipment-type/{equipment_type_id}")
async def get_strategies_by_equipment_type(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get maintenance strategy for an equipment type"""
    strategy = await db.maintenance_strategies.find_one(
        {"equipment_type_id": equipment_type_id}, 
        {"_id": 0}
    )
    return {"equipment_type_id": equipment_type_id, "strategy": strategy}


@api_router.post("/maintenance-strategies/generate")
async def generate_maintenance_strategy(
    request: GenerateStrategyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Auto-generate a maintenance strategy for ALL criticality levels from FMEA data"""
    # Check if strategy already exists for this equipment type
    existing = await db.maintenance_strategies.find_one({
        "equipment_type_id": request.equipment_type_id
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Strategy already exists for {request.equipment_type_name}. Delete it first to regenerate."
        )
    
    # Get failure modes for this equipment type - use flexible matching
    failure_modes = [
        fm for fm in FAILURE_MODES_LIBRARY 
        if fm.get("equipment", "").lower() == request.equipment_type_name.lower()
        or request.equipment_type_name.lower() in fm.get("equipment", "").lower()
        or fm.get("equipment", "").lower() in request.equipment_type_name.lower()
        or (fm.get("equipment_type_ids") and request.equipment_type_id in fm.get("equipment_type_ids", []))
    ]
    
    # If no specific failure modes found, try flexible matching
    if not failure_modes:
        failure_modes = find_failure_modes_flexible(
            request.equipment_type_name, 
            equipment_type=request.equipment_type_name,
            limit=15
        )
    
    # Generate strategy using AI
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI API key not configured")
    
    try:
        generator = MaintenanceStrategyGenerator(api_key)
        strategy = await generator.generate_strategy(
            equipment_type_id=request.equipment_type_id,
            equipment_type_name=request.equipment_type_name,
            failure_modes=failure_modes,
            user_id=current_user.get("user_id", "unknown")
        )
        
        # Check if strategy generation returned a default (fallback) strategy due to error
        if strategy.description and "AI generation failed" in strategy.description:
            error_msg = strategy.description
            if "Budget has been exceeded" in error_msg or "budget" in error_msg.lower():
                raise HTTPException(
                    status_code=402, 
                    detail="LLM budget exceeded. Please add balance to your Universal Key (Profile → Universal Key → Add Balance)."
                )
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Save to database
        strategy_dict = strategy.model_dump()
        await db.maintenance_strategies.insert_one(strategy_dict)
        
        # Remove MongoDB _id before returning
        if "_id" in strategy_dict:
            del strategy_dict["_id"]
        
        return strategy_dict
        
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        if "Budget has been exceeded" in error_str or "budget" in error_str.lower():
            raise HTTPException(
                status_code=402, 
                detail="LLM budget exceeded. Please add balance to your Universal Key (Profile → Universal Key → Add Balance)."
            )
        raise HTTPException(status_code=500, detail=f"Strategy generation failed: {error_str[:200]}")


@api_router.post("/maintenance-strategies/generate-all")
async def generate_all_maintenance_strategies(
    request: GenerateAllStrategiesRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate maintenance strategies for ALL equipment types"""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI API key not configured")
    
    generator = MaintenanceStrategyGenerator(api_key)
    
    # Get all equipment types (EQUIPMENT_TYPES is already a list)
    equipment_types = EQUIPMENT_TYPES
    
    results = {"generated": [], "skipped": [], "failed": []}
    
    for eq_type in equipment_types:
        eq_id = eq_type.get("id", "")
        eq_name = eq_type.get("name", "")
        
        # Check if strategy already exists
        existing = await db.maintenance_strategies.find_one({"equipment_type_id": eq_id})
        if existing:
            results["skipped"].append({"id": eq_id, "name": eq_name, "reason": "Already exists"})
            continue
        
        try:
            # Get failure modes for this equipment type - use flexible matching
            failure_modes = [
                fm for fm in FAILURE_MODES_LIBRARY 
                if fm.get("equipment", "").lower() == eq_name.lower()
                or eq_name.lower() in fm.get("equipment", "").lower()
                or fm.get("equipment", "").lower() in eq_name.lower()
                or (fm.get("equipment_type_ids") and eq_id in fm.get("equipment_type_ids", []))
            ]
            
            # If no specific failure modes found, try flexible matching
            if not failure_modes:
                failure_modes = find_failure_modes_flexible(
                    eq_name, 
                    equipment_type=eq_name,
                    limit=10
                )
            
            strategy = await generator.generate_strategy(
                equipment_type_id=eq_id,
                equipment_type_name=eq_name,
                failure_modes=failure_modes,
                user_id=current_user.get("user_id", "unknown")
            )
            
            strategy_dict = strategy.model_dump()
            
            # Check if strategy generation returned a default (fallback) strategy due to error
            if strategy.description and "AI generation failed" in strategy.description:
                error_msg = strategy.description
                if "Budget has been exceeded" in error_msg or "budget" in error_msg.lower():
                    # Stop processing all - budget is exceeded
                    results["failed"].append({
                        "id": eq_id, 
                        "name": eq_name, 
                        "error": "LLM budget exceeded - add balance to Universal Key"
                    })
                    # Return early with budget exceeded message
                    return {
                        "total_equipment_types": len(equipment_types),
                        "generated": len(results["generated"]),
                        "skipped": len(results["skipped"]),
                        "failed": len(results["failed"]),
                        "details": results,
                        "error": "LLM budget exceeded. Please add balance to your Universal Key (Profile → Universal Key → Add Balance)."
                    }
                results["failed"].append({"id": eq_id, "name": eq_name, "error": error_msg[:100]})
                continue
            
            await db.maintenance_strategies.insert_one(strategy_dict)
            
            results["generated"].append({"id": eq_id, "name": eq_name})
            
        except Exception as e:
            error_str = str(e)
            if "Budget has been exceeded" in error_str or "budget" in error_str.lower():
                results["failed"].append({
                    "id": eq_id, 
                    "name": eq_name, 
                    "error": "LLM budget exceeded"
                })
                return {
                    "total_equipment_types": len(equipment_types),
                    "generated": len(results["generated"]),
                    "skipped": len(results["skipped"]),
                    "failed": len(results["failed"]),
                    "details": results,
                    "error": "LLM budget exceeded. Please add balance to your Universal Key (Profile → Universal Key → Add Balance)."
                }
            results["failed"].append({"id": eq_id, "name": eq_name, "error": error_str[:100]})
    
    return {
        "total_equipment_types": len(equipment_types),
        "generated": len(results["generated"]),
        "skipped": len(results["skipped"]),
        "failed": len(results["failed"]),
        "details": results
    }


@api_router.post("/maintenance-strategies")
async def create_maintenance_strategy(
    data: MaintenanceStrategyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new maintenance strategy manually"""
    # Check if strategy already exists
    existing = await db.maintenance_strategies.find_one({
        "equipment_type_id": data.equipment_type_id
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Strategy already exists for this equipment type"
        )
    
    strategy = MaintenanceStrategy(
        id=str(uuid.uuid4()),
        equipment_type_id=data.equipment_type_id,
        equipment_type_name=data.equipment_type_name,
        description=data.description,
        created_by=current_user.get("user_id"),
        auto_generated=False
    )
    
    strategy_dict = strategy.model_dump()
    await db.maintenance_strategies.insert_one(strategy_dict)
    
    # Remove MongoDB _id before returning
    if "_id" in strategy_dict:
        del strategy_dict["_id"]
    
    return strategy_dict


@api_router.patch("/maintenance-strategies/{strategy_id}")
async def update_maintenance_strategy(
    strategy_id: str,
    data: MaintenanceStrategyUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing maintenance strategy"""
    strategy = await db.maintenance_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Maintenance strategy not found")
    
    update_data = {}
    
    # Handle strategies_by_criticality updates
    if data.strategies_by_criticality is not None:
        update_data["strategies_by_criticality"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in data.strategies_by_criticality]
    
    # Handle spare_parts updates
    if data.spare_parts is not None:
        update_data["spare_parts"] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in data.spare_parts]
    
    # Handle failure_mode_mappings updates
    if data.failure_mode_mappings is not None:
        update_data["failure_mode_mappings"] = [m.model_dump() if hasattr(m, 'model_dump') else m for m in data.failure_mode_mappings]
    
    # Handle other fields
    if data.description is not None:
        update_data["description"] = data.description
    if data.strategy_version is not None:
        update_data["strategy_version"] = data.strategy_version
    
    if update_data:
        # Auto-increment version on significant changes
        if any(k in update_data for k in ['strategies_by_criticality', 'spare_parts', 'failure_mode_mappings']):
            current_version = strategy.get("strategy_version", "1.0")
            try:
                major, minor = map(int, current_version.split("."))
                update_data["strategy_version"] = f"{major}.{minor + 1}"
            except ValueError:
                update_data["strategy_version"] = "1.1"
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.maintenance_strategies.update_one(
            {"id": strategy_id},
            {"$set": update_data}
        )
    
    updated_strategy = await db.maintenance_strategies.find_one({"id": strategy_id}, {"_id": 0})
    return updated_strategy


@api_router.delete("/maintenance-strategies/{strategy_id}")
async def delete_maintenance_strategy(
    strategy_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a maintenance strategy"""
    result = await db.maintenance_strategies.delete_one({"id": strategy_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Maintenance strategy not found")
    return {"message": "Maintenance strategy deleted", "id": strategy_id}


@api_router.post("/maintenance-strategies/{strategy_id}/increment-version")
async def increment_strategy_version(
    strategy_id: str,
    major: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Increment the strategy version number"""
    strategy = await db.maintenance_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Maintenance strategy not found")
    
    current_version = strategy.get("strategy_version", "1.0")
    major_v, minor_v = map(int, current_version.split("."))
    
    if major:
        new_version = f"{major_v + 1}.0"
    else:
        new_version = f"{major_v}.{minor_v + 1}"
    
    await db.maintenance_strategies.update_one(
        {"id": strategy_id},
        {"$set": {
            "strategy_version": new_version,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"id": strategy_id, "new_version": new_version}

# Document download endpoint
@api_router.get("/download/documentation")
async def download_documentation():
    """Download the ReliabilityOS Architecture & Cost Documentation"""
    file_path = Path(__file__).parent.parent / "ReliabilityOS_Architecture_Cost_Documentation.docx"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Documentation file not found")
    return FileResponse(
        path=str(file_path),
        filename="ReliabilityOS_Architecture_Cost_Documentation.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

@api_router.get("/download/functional-spec")
async def download_functional_spec():
    """Download the ReliabilityOS Functional Specification Document"""
    file_path = Path(__file__).parent.parent / "ReliabilityOS_Functional_Specification.docx"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Functional specification file not found")
    return FileResponse(
        path=str(file_path),
        filename="ReliabilityOS_Functional_Specification.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

