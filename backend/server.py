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
    get_valid_parent_level, get_valid_child_levels, is_valid_parent_child,
    EquipmentNodeCreate, EquipmentNodeUpdate, CriticalityAssignment, MoveNodeRequest,
    UnstructuredItemCreate, ParseEquipmentListRequest, AssignToHierarchyRequest,
    detect_equipment_type, EquipmentTypeCreate, EquipmentTypeUpdate
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
    
    # Validate that asset exists in hierarchy
    hierarchy_node = await db.equipment_nodes.find_one({
        "name": asset_name,
        "created_by": current_user["id"]
    })
    
    if not hierarchy_node:
        # Asset not found in hierarchy - ask user to select from hierarchy or add it first
        # Get available equipment from hierarchy to suggest
        equipment_nodes = await db.equipment_nodes.find(
            {"created_by": current_user["id"]},
            {"_id": 0, "name": 1, "level": 1}
        ).to_list(50)
        
        equipment_list = [n["name"] for n in equipment_nodes if n.get("level") in ["equipment_unit", "equipment", "subunit", "maintainable_item"]]
        
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
    
    rank, total = await calculate_rank(threat_data.get("risk_score", 50), current_user["id"])
    
    threat_id = str(uuid.uuid4())
    risk_score_raw = threat_data.get("risk_score", 50)
    risk_score = int(risk_score_raw) if isinstance(risk_score_raw, (int, float)) else 50
    threat_doc = {
        "id": threat_id,
        "title": threat_data.get("title", "Unknown Threat"),
        "asset": threat_data.get("asset", "Unknown"),
        "equipment_type": threat_data.get("equipment_type", "Unknown"),
        "failure_mode": threat_data.get("failure_mode", "Unknown"),
        "cause": threat_data.get("cause"),
        "impact": threat_data.get("impact", "Equipment Damage"),
        "frequency": threat_data.get("frequency", "First Time"),
        "likelihood": threat_data.get("likelihood", "Medium"),
        "detectability": threat_data.get("detectability", "Moderate"),
        "risk_level": threat_data.get("risk_level", "Medium"),
        "risk_score": risk_score,
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
    
    if category:
        results = [fm for fm in results if fm["category"].lower() == category.lower()]
    
    if equipment:
        results = [fm for fm in results if fm["equipment"].lower() == equipment.lower()]
    
    if search:
        results = find_matching_failure_modes(search, limit=100)
    
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
    """Get all equipment hierarchy nodes for the current user."""
    nodes = await db.equipment_nodes.find(
        {"created_by": current_user["id"]},
        {"_id": 0}
    ).to_list(1000)
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
    node_doc = {
        "id": node_id,
        "name": node_data.name,
        "level": node_data.level.value,
        "parent_id": node_data.parent_id,
        "equipment_type_id": node_data.equipment_type_id,
        "description": node_data.description,
        "criticality": None,
        "discipline": None,
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
