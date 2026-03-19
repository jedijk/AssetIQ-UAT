"""
Causal Investigation Tool - Data Models
Based on ISO-style structured investigation methodology
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime


class EventCategory(str, Enum):
    OPERATIONAL = "operational_event"
    ALARM = "alarm"
    MAINTENANCE = "maintenance_action"
    HUMAN_DECISION = "human_decision"
    SYSTEM_RESPONSE = "system_response"
    ENVIRONMENTAL = "environmental_condition"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNCERTAIN = "uncertain"


class CauseCategory(str, Enum):
    TECHNICAL = "technical_cause"
    HUMAN_FACTOR = "human_factor"
    MAINTENANCE_ISSUE = "maintenance_issue"
    DESIGN_ISSUE = "design_issue"
    ORGANIZATIONAL = "organizational_factor"
    EXTERNAL = "external_condition"


class ActionPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ActionStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CLOSED = "closed"


class InvestigationStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    COMPLETED = "completed"
    CLOSED = "closed"


# ============= Request/Response Models =============

class InvestigationCreate(BaseModel):
    title: str
    description: str
    asset_id: Optional[str] = None
    asset_name: Optional[str] = None
    location: Optional[str] = None
    incident_date: Optional[str] = None
    investigation_leader: Optional[str] = None
    team_members: List[str] = Field(default_factory=list)
    threat_id: Optional[str] = None  # Link to originating threat


class InvestigationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    asset_id: Optional[str] = None
    asset_name: Optional[str] = None
    location: Optional[str] = None
    incident_date: Optional[str] = None
    investigation_leader: Optional[str] = None
    team_members: Optional[List[str]] = None
    status: Optional[InvestigationStatus] = None


class TimelineEventCreate(BaseModel):
    investigation_id: str
    event_time: str
    description: str
    category: EventCategory
    evidence_source: Optional[str] = None
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM
    notes: Optional[str] = None


class TimelineEventUpdate(BaseModel):
    event_time: Optional[str] = None
    description: Optional[str] = None
    category: Optional[EventCategory] = None
    evidence_source: Optional[str] = None
    confidence: Optional[ConfidenceLevel] = None
    notes: Optional[str] = None


class FailureIdentificationCreate(BaseModel):
    investigation_id: str
    asset_name: str
    subsystem: Optional[str] = None
    component: str
    failure_mode: str
    degradation_mechanism: Optional[str] = None
    evidence: Optional[str] = None
    failure_mode_id: Optional[int] = None  # Link to failure modes library


class FailureIdentificationUpdate(BaseModel):
    asset_name: Optional[str] = None
    subsystem: Optional[str] = None
    component: Optional[str] = None
    failure_mode: Optional[str] = None
    degradation_mechanism: Optional[str] = None
    evidence: Optional[str] = None


class CauseNodeCreate(BaseModel):
    investigation_id: str
    description: str
    category: CauseCategory
    parent_id: Optional[str] = None  # For building the causal tree
    is_root_cause: bool = False
    evidence: Optional[str] = None
    linked_event_id: Optional[str] = None  # Link to timeline event
    linked_failure_id: Optional[str] = None  # Link to failure identification


class CauseNodeUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[CauseCategory] = None
    parent_id: Optional[str] = None
    is_root_cause: Optional[bool] = None
    evidence: Optional[str] = None


class ActionItemCreate(BaseModel):
    investigation_id: str
    description: str
    owner: Optional[str] = None
    priority: ActionPriority = ActionPriority.MEDIUM
    due_date: Optional[str] = None
    linked_cause_id: Optional[str] = None  # Link to root cause


class ActionItemUpdate(BaseModel):
    description: Optional[str] = None
    owner: Optional[str] = None
    priority: Optional[ActionPriority] = None
    due_date: Optional[str] = None
    status: Optional[ActionStatus] = None
    completion_notes: Optional[str] = None


class EvidenceCreate(BaseModel):
    investigation_id: str
    name: str
    evidence_type: str  # document, photo, log, report
    description: Optional[str] = None
    file_url: Optional[str] = None
    linked_event_id: Optional[str] = None
    linked_cause_id: Optional[str] = None


# ============= Response Models =============

class InvestigationResponse(BaseModel):
    id: str
    case_number: str
    title: str
    description: str
    asset_id: Optional[str] = None
    asset_name: Optional[str] = None
    location: Optional[str] = None
    incident_date: Optional[str] = None
    investigation_leader: Optional[str] = None
    team_members: List[str]
    threat_id: Optional[str] = None
    status: str
    created_by: str
    created_at: str
    updated_at: str


class TimelineEventResponse(BaseModel):
    id: str
    investigation_id: str
    event_time: str
    description: str
    category: str
    evidence_source: Optional[str] = None
    confidence: str
    notes: Optional[str] = None
    created_at: str


class FailureIdentificationResponse(BaseModel):
    id: str
    investigation_id: str
    asset_name: str
    subsystem: Optional[str] = None
    component: str
    failure_mode: str
    degradation_mechanism: Optional[str] = None
    evidence: Optional[str] = None
    failure_mode_id: Optional[int] = None
    created_at: str


class CauseNodeResponse(BaseModel):
    id: str
    investigation_id: str
    description: str
    category: str
    parent_id: Optional[str] = None
    is_root_cause: bool
    evidence: Optional[str] = None
    linked_event_id: Optional[str] = None
    linked_failure_id: Optional[str] = None
    created_at: str


class ActionItemResponse(BaseModel):
    id: str
    investigation_id: str
    action_number: str
    description: str
    owner: Optional[str] = None
    priority: str
    due_date: Optional[str] = None
    status: str
    linked_cause_id: Optional[str] = None
    completion_notes: Optional[str] = None
    created_at: str
    updated_at: str
