"""
Shared API Pydantic models for request/response validation.
"""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any


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
    department: Optional[str] = None
    position: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None


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
    failure_mode_id: Optional[Any] = None  # Can be int or str
    failure_mode_data: Optional[dict] = None
    is_new_failure_mode: Optional[bool] = None
    cause: Optional[str] = None
    impact: str
    frequency: str
    likelihood: str
    detectability: str
    risk_level: str
    risk_score: int
    fmea_score: Optional[int] = None
    fmea_rpn: Optional[int] = None
    criticality_score: Optional[int] = None
    base_risk_score: Optional[int] = None
    rank: int
    total_threats: int
    status: str
    recommended_actions: List[Any]  # Can be strings or structured dicts
    created_by: str
    created_at: str
    occurrence_count: int
    image_url: Optional[str] = None
    location: Optional[str] = None
    linked_equipment_id: Optional[str] = None
    equipment_criticality: Optional[str] = None
    equipment_criticality_data: Optional[dict] = None
    session_id: Optional[str] = None
    attachments: Optional[List[dict]] = None
    # Creator info for dashboard display
    creator_name: Optional[str] = None
    creator_photo: Optional[str] = None
    creator_initials: Optional[str] = None
    creator_position: Optional[str] = None


class ThreatUpdate(BaseModel):
    title: Optional[str] = None
    asset: Optional[str] = None
    equipment_type: Optional[str] = None
    failure_mode: Optional[str] = None
    failure_mode_id: Optional[Any] = None  # Can be int or str
    failure_mode_data: Optional[dict] = None
    cause: Optional[str] = None
    impact: Optional[str] = None
    frequency: Optional[str] = None
    likelihood: Optional[str] = None
    detectability: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    recommended_actions: Optional[List[Any]] = None  # Can be strings or structured dicts
    linked_equipment_id: Optional[str] = None
    is_new_failure_mode: Optional[bool] = None
    fmea_rpn: Optional[int] = None


class ChatResponse(BaseModel):
    message: str
    threat: Optional[ThreatResponse] = None
    follow_up_question: Optional[str] = None
    question_type: Optional[str] = None
    equipment_suggestions: Optional[List[dict]] = None
    failure_mode_suggestions: Optional[List[dict]] = None
    show_new_failure_mode_option: Optional[bool] = None


class VoiceTranscriptionResponse(BaseModel):
    text: str


class CentralActionCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    source_type: str = "manual"
    source_id: Optional[str] = None
    source_name: Optional[str] = None
    priority: str = "medium"
    status: str = "open"
    assignee: Optional[str] = None
    discipline: Optional[str] = None
    due_date: Optional[str] = None


class CentralActionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    discipline: Optional[str] = None
    due_date: Optional[str] = None
    completion_notes: Optional[str] = None
