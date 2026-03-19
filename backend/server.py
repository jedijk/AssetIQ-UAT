from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import base64
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from failure_modes import (
    FAILURE_MODES_LIBRARY, 
    find_matching_failure_modes, 
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
    status: Optional[str] = None

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

Your job is to collect ONLY the essential information to create a threat record, then complete it.

## KEEP IT SIMPLE - Only 2 Required Fields:
1. **Asset**: The equipment tag/name (e.g., "Pump P-101", "Compressor C-201")
2. **Failure Description**: What's wrong (e.g., "leaking seal", "abnormal vibration", "overheating")

## Response Rules:
- If ASSET is missing: Ask "Which equipment is affected? (e.g., Pump P-101)"
- If FAILURE is missing: Ask "What's the problem? (leak, vibration, noise, etc.)"
- If BOTH are provided: Mark as COMPLETE and generate the threat
- NEVER ask more than one question
- NEVER ask about photos, location, frequency unless user volunteers it
- Use your expertise to infer equipment type, failure mode, and risk from the description

## Auto-fill these from your expertise:
- Equipment Type: Infer from asset name (P-xxx = Pump, C-xxx = Compressor, HX-xxx = Heat Exchanger)
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
    
    # Analyze with AI
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
        # Asset not found in hierarchy - ask user to select from hierarchy or add it first
        equipment_list = [n["name"] for n in all_equipment_nodes if n.get("level") in ["equipment_unit", "equipment", "subunit", "maintainable_item"]]
        
        if equipment_list:
            suggestion = f"\n\nAvailable equipment: {', '.join(equipment_list[:10])}"
            if len(equipment_list) > 10:
                suggestion += f"... and {len(equipment_list) - 10} more"
        else:
            suggestion = "\n\n⚠️ No equipment found in hierarchy. Please add equipment in the Equipment Manager first."
        
        error_msg = f"'{asset_name}' is not in your equipment hierarchy. Please use an equipment name from your hierarchy.{suggestion}"
        
        ai_response = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "role": "assistant",
            "content": error_msg,
            "question_type": "asset",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.chat_messages.insert_one(ai_response)
        
        return ChatResponse(
            message=error_msg,
            follow_up_question="Which equipment from your hierarchy is affected?",
            question_type="asset"
        )
    
    # Get equipment criticality from hierarchy node
    equipment_criticality = hierarchy_node.get("criticality", {})
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
        "equipment_type": threat_data.get("equipment_type", "Unknown"),
        "equipment_criticality": criticality_level,  # Store equipment criticality
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
    if update_data:
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
    equipment_type_id: Optional[str] = None  # Link to equipment type


class FailureModeUpdate(BaseModel):
    category: Optional[str] = None
    equipment: Optional[str] = None
    failure_mode: Optional[str] = None
    keywords: Optional[List[str]] = None
    severity: Optional[int] = Field(None, ge=1, le=10)
    occurrence: Optional[int] = Field(None, ge=1, le=10)
    detectability: Optional[int] = Field(None, ge=1, le=10)
    recommended_actions: Optional[List[str]] = None
    equipment_type_id: Optional[str] = None


def auto_link_equipment_type(equipment_name: str) -> Optional[str]:
    """Auto-detect equipment type based on equipment name."""
    equipment_lower = equipment_name.lower()
    
    # Map common equipment names to equipment type IDs
    equipment_mapping = {
        "pump": "centrifugal_pump",
        "compressor": "centrifugal_compressor", 
        "turbine": "gas_turbine",
        "motor": "electric_motor",
        "vessel": "pressure_vessel",
        "heat exchanger": "shell_tube_heat_exchanger",
        "exchanger": "shell_tube_heat_exchanger",
        "pipe": "piping",
        "valve": "valve",
        "control valve": "control_valve",
        "sensor": "sensor",
        "transmitter": "transmitter",
        "generator": "generator",
        "transformer": "transformer",
        "filter": "filter",
        "tank": "storage_tank",
        "boiler": "boiler",
        "furnace": "fired_heater",
        "heater": "fired_heater",
        "cooler": "air_cooler",
        "fan": "fan",
        "blower": "fan",
    }
    
    for keyword, type_id in equipment_mapping.items():
        if keyword in equipment_lower:
            return type_id
    return None


@api_router.post("/failure-modes")
async def create_failure_mode(
    data: FailureModeCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new failure mode."""
    # Generate new ID
    max_id = max((fm["id"] for fm in FAILURE_MODES_LIBRARY), default=0)
    new_id = max_id + 1
    
    # Auto-link equipment type if not provided
    equipment_type_id = data.equipment_type_id or auto_link_equipment_type(data.equipment)
    
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
        "equipment_type_id": equipment_type_id,
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
            # Update fields
            if data.category is not None:
                fm["category"] = data.category
            if data.equipment is not None:
                fm["equipment"] = data.equipment
                # Auto-link if equipment changed and no explicit type provided
                if data.equipment_type_id is None:
                    auto_type = auto_link_equipment_type(data.equipment)
                    if auto_type:
                        fm["equipment_type_id"] = auto_type
            if data.failure_mode is not None:
                fm["failure_mode"] = data.failure_mode
            if data.keywords is not None:
                fm["keywords"] = data.keywords
            if data.severity is not None:
                fm["severity"] = data.severity
            if data.occurrence is not None:
                fm["occurrence"] = data.occurrence
            if data.detectability is not None:
                fm["detectability"] = data.detectability
            if data.recommended_actions is not None:
                fm["recommended_actions"] = data.recommended_actions
            if data.equipment_type_id is not None:
                fm["equipment_type_id"] = data.equipment_type_id
            
            # Recalculate RPN
            fm["rpn"] = fm["severity"] * fm["occurrence"] * fm["detectability"]
            
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
    """Assign criticality to an equipment node."""
    node = await db.equipment_nodes.find_one(
        {"id": node_id, "created_by": current_user["id"]}
    )
    if not node:
        raise HTTPException(status_code=404, detail="Equipment node not found")
    
    # Find profile
    profile = next((p for p in CRITICALITY_PROFILES if p["id"] == assignment.profile_id), None)
    if not profile:
        raise HTTPException(status_code=400, detail="Criticality profile not found")
    
    # Merge defaults with custom values
    criticality_data = {
        "profile_id": assignment.profile_id,
        "level": profile["level"],
        "color": profile["color"],
        "fatality_risk": assignment.fatality_risk or profile["defaults"]["fatality_risk"],
        "production_loss_per_day": assignment.production_loss_per_day or profile["defaults"]["production_loss_per_day"],
        "failure_probability": assignment.failure_probability or profile["defaults"]["failure_probability"],
        "downtime_days": assignment.downtime_days or profile["defaults"]["downtime_days"],
        "environmental_impact": assignment.environmental_impact or 0
    }
    
    # Calculate risk score
    risk_score = (
        criticality_data["fatality_risk"] * 1000 +
        (criticality_data["production_loss_per_day"] * criticality_data["downtime_days"]) / 10000 +
        criticality_data["failure_probability"] * 100
    )
    criticality_data["risk_score"] = round(risk_score, 2)
    
    await db.equipment_nodes.update_one(
        {"id": node_id},
        {"$set": {
            "criticality": criticality_data,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.equipment_nodes.find_one({"id": node_id}, {"_id": 0})
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
        "asset_name": data.asset_name,
        "subsystem": data.subsystem,
        "component": data.component,
        "failure_mode": data.failure_mode,
        "degradation_mechanism": data.degradation_mechanism,
        "evidence": data.evidence,
        "failure_mode_id": data.failure_mode_id,
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
        "owner": data.owner,
        "priority": data.priority.value,
        "due_date": data.due_date,
        "status": ActionStatus.OPEN.value,
        "linked_cause_id": data.linked_cause_id,
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

@api_router.post("/threats/{threat_id}/investigate")
async def create_investigation_from_threat(
    threat_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new investigation from an existing threat."""
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
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.investigations.insert_one(inv_doc)
    inv_doc.pop("_id", None)
    
    # Create initial failure identification from threat data
    if threat.get("failure_mode"):
        failure_doc = {
            "id": str(uuid.uuid4()),
            "investigation_id": inv_id,
            "asset_name": threat.get("asset", "Unknown"),
            "subsystem": None,
            "component": threat.get("equipment_type", "Unknown"),
            "failure_mode": threat.get("failure_mode"),
            "degradation_mechanism": threat.get("cause"),
            "evidence": f"From threat report: {threat.get('title')}",
            "failure_mode_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.failure_identifications.insert_one(failure_doc)
    
    return {"investigation": inv_doc, "message": "Investigation created from threat"}


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
