"""
Shared dependencies and utilities for API routes
"""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
import os
import jwt
import logging

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', '')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'threatbase')]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'default_secret_key')
JWT_ALGORITHM = "HS256"

# LLM Config
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Security
security = HTTPBearer()

# Logger
logger = logging.getLogger(__name__)


# ============= SHARED MODELS =============

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: str


class TokenResponse(BaseModel):
    token: str
    user: UserResponse


# ============= AUTH DEPENDENCY =============

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Validate JWT token and return current user"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ============= UTILITY FUNCTIONS =============

def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    if "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


def serialize_docs(docs):
    """Convert list of MongoDB documents"""
    return [serialize_doc(doc) for doc in docs]
