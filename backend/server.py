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

THREAT_ANALYSIS_SYSTEM_PROMPT = """You are ThreatBase AI, an expert reliability engineering assistant with knowledge of FMEA (Failure Mode and Effects Analysis). Your job is to analyze failure descriptions and extract structured threat information.

You have access to a comprehensive failure mode library covering:
- Rotating Equipment (Pumps, Compressors, Turbines)
- Static Equipment (Vessels, Heat Exchangers)
- Piping Systems (Pipes, Valves)
- Instrumentation (Sensors, Controls, PLCs)
- Electrical Systems (Motors, Transformers, Switchgear)
- Process Issues (Operations, Maintenance)
- Safety Systems
- Environmental Concerns

When a user describes a failure, extract the following information:
1. Title: A concise title for the threat (max 60 chars)
2. Asset: The specific asset affected (e.g., "Pump P-104", "Compressor C-201")
3. Equipment Type: Category of equipment (e.g., "Centrifugal Pump", "Heat Exchanger")
4. Failure Mode: Standard failure mode from FMEA library (e.g., "Seal Failure", "Bearing Failure", "Corrosion")
5. Cause: Root cause if known (optional)
6. Impact: Business impact - one of: "Safety Hazard", "Production Loss", "Equipment Damage", "Environmental"
7. Frequency: How often this occurs - one of: "First Time", "Rare", "Occasional", "Frequent"
8. Likelihood: Probability of recurrence - one of: "Very Low", "Low", "Medium", "High", "Very High"
9. Detectability: How detectable is the failure - one of: "Easy", "Moderate", "Difficult", "Very Difficult"
10. Location: Physical location/area if mentioned
11. Recommended Actions: 2-4 specific actionable recommendations based on industry best practices

## IMPORTANT: ASK CLARIFYING QUESTIONS
Before creating a threat, check if the following critical information is missing:

**MUST ASK if missing:**
- Asset ID/Name (e.g., "Which specific equipment? Can you provide the tag number like P-101?")
- Failure description (e.g., "What exactly is happening? Leak, noise, vibration?")

**SHOULD ASK if missing (pick the most relevant one):**
- Location: "Where is this equipment located? (Area/Unit/Building)"
- Photo: "Do you have a photo of the damage? It helps with assessment."
- Frequency: "Is this the first time, or has this happened before?"
- Impact severity: "Is this affecting production or safety right now?"
- When it started: "When did you first notice this issue?"

Only ask ONE question at a time. Prioritize the most critical missing information.

Calculate risk score (1-100) based on FMEA methodology:
- Severity (1-10): Safety=10, Production=8, Equipment=6, Environmental=9
- Occurrence (1-10): First=2, Rare=3, Occasional=5, Frequent=8
- Detection (1-10): Easy=3, Moderate=5, Difficult=7, Very Difficult=9
- Risk Score = (Severity * Occurrence * Detection) / 10, capped at 100

Risk Level based on score:
- Critical: >= 70
- High: >= 50
- Medium: >= 30
- Low: < 30

RESPOND IN JSON FORMAT ONLY:
{
  "complete": true/false,
  "follow_up_question": "question if complete is false - be specific and helpful",
  "question_type": "asset|location|photo|frequency|impact|details",
  "threat": {
    "title": "...",
    "asset": "...",
    "equipment_type": "...",
    "failure_mode": "...",
    "cause": "...",
    "impact": "...",
    "frequency": "...",
    "likelihood": "...",
    "detectability": "...",
    "location": "...",
    "risk_score": number,
    "risk_level": "Critical/High/Medium/Low",
    "recommended_actions": ["action1", "action2", "action3"]
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
    
    # Store AI response
    response_text = f"I've logged this threat: **{threat_doc['title']}**\n\nRisk Level: {threat_doc['risk_level']} (Score: {threat_doc['risk_score']})\nRank: #{updated_threat['rank']} of {updated_threat['total_threats']} active threats"
    
    ai_response = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "role": "assistant",
        "content": response_text,
        "threat_id": threat_id,
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
