"""
Reliability Intelligence Layer (RIL) Models
Based on AssetIQ Functional Specification

Core Objects:
- ReliabilityCase: Single container for reliability issues
- RILObservation: Unified observation from all sources
- Reading: Sensor/process data stream
- Correlation: Multi-source event correlation
- Alert: Incoming alert with triage information
- Prediction: Predictive failure insights
- StrategyRecommendation: Strategy optimization suggestions
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
import uuid


# ============= Enums =============

class ObservationSource(str, Enum):
    """Sources of observations"""
    MANUAL = "manual"
    OPERATOR_ROUNDS = "operator_rounds"
    VISION_AI = "vision_ai"
    INVESTIGATION = "investigation"
    PM_IMPORT = "pm_import"
    EXTERNAL_SYSTEM = "external_system"
    HISTORIAN_ALERT = "historian_alert"
    CONDITION_MONITORING = "condition_monitoring"
    SCADA = "scada"
    DCS = "dcs"
    VIBRATION_SYSTEM = "vibration_system"
    THERMAL_MONITORING = "thermal_monitoring"
    OIL_ANALYSIS = "oil_analysis"
    ULTRASONIC = "ultrasonic"
    CORROSION_MONITORING = "corrosion_monitoring"


class ObservationSeverity(str, Enum):
    """Severity levels for observations"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class AlertPriority(str, Enum):
    """Alert priority levels"""
    P1_CRITICAL = "P1"
    P2_HIGH = "P2"
    P3_MEDIUM = "P3"
    P4_LOW = "P4"


class CaseStatus(str, Enum):
    """Reliability case status"""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    UNDER_INVESTIGATION = "under_investigation"
    AWAITING_PARTS = "awaiting_parts"
    SCHEDULED = "scheduled"
    RESOLVED = "resolved"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class CorrelationType(str, Enum):
    """Types of event correlations"""
    TEMPORAL = "temporal"  # Events close in time
    CAUSAL = "causal"  # One event caused another
    SYMPTOM = "symptom"  # Multiple symptoms of same root cause
    PATTERN = "pattern"  # Matches known failure pattern
    FLEET = "fleet"  # Similar issue across fleet


class PredictionConfidence(str, Enum):
    """Confidence levels for predictions"""
    VERY_HIGH = "very_high"  # >90%
    HIGH = "high"  # 70-90%
    MEDIUM = "medium"  # 50-70%
    LOW = "low"  # 30-50%
    VERY_LOW = "very_low"  # <30%


class RecommendationType(str, Enum):
    """Types of strategy recommendations"""
    INCREASE_FREQUENCY = "increase_frequency"
    DECREASE_FREQUENCY = "decrease_frequency"
    ADD_INSPECTION = "add_inspection"
    ADD_CONDITION_MONITORING = "add_condition_monitoring"
    RETIRE_TASK = "retire_task"
    ADD_FAILURE_MODE = "add_failure_mode"
    UPDATE_DETECTION_METHOD = "update_detection_method"


# ============= Sub-Models =============

class RiskAssessment(BaseModel):
    """Risk assessment for a reliability case"""
    risk_score: float = Field(0, ge=0, le=1000, description="Overall risk score")
    safety_impact: int = Field(1, ge=1, le=5)
    production_impact: int = Field(1, ge=1, le=5)
    environmental_impact: int = Field(1, ge=1, le=5)
    reputation_impact: int = Field(1, ge=1, le=5)
    probability: float = Field(0.5, ge=0, le=1, description="Probability of occurrence")
    calculated_at: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None


class Evidence(BaseModel):
    """Evidence item for a reliability case"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # observation, reading, image, document, investigation
    source: str
    timestamp: datetime
    description: str
    data: Optional[Dict[str, Any]] = None
    confidence: float = Field(0.8, ge=0, le=1)
    file_url: Optional[str] = None


class CorrelationResult(BaseModel):
    """Result of correlation analysis"""
    correlation_score: float = Field(ge=0, le=1)
    confidence_score: float = Field(ge=0, le=1)
    correlation_type: CorrelationType
    corroborating_evidence: List[str] = []  # Evidence IDs
    suggested_root_causes: List[str] = []
    contradictions: List[str] = []
    reasoning: Optional[str] = None


class TriageResult(BaseModel):
    """Result of alert triage"""
    priority: AlertPriority
    response_time_hours: Optional[int] = None
    recommended_owner_role: Optional[str] = None  # e.g., "reliability_engineer", "technician"
    recommended_owner_id: Optional[str] = None
    suggested_actions: List[str] = []
    reasoning: str
    evaluation_factors: Dict[str, Any] = {}


class FailurePrediction(BaseModel):
    """Failure prediction details"""
    failure_mode: str
    failure_mode_id: Optional[str] = None
    probability: float = Field(ge=0, le=1)
    confidence: PredictionConfidence
    remaining_useful_life_days: Optional[int] = None
    estimated_failure_date: Optional[datetime] = None
    recommended_actions: List[str] = []
    model_version: Optional[str] = None
    input_factors: Dict[str, Any] = {}


# ============= Main Models =============

class RILObservation(BaseModel):
    """
    Unified Observation Model
    Aggregates observations from all sources into a common model.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    
    # Source tracking
    source: ObservationSource
    source_system: Optional[str] = None  # e.g., "PI Historian", "Emerson AMS"
    source_id: Optional[str] = None  # Original ID in source system
    
    # Equipment reference
    equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    equipment_name: Optional[str] = None
    
    # Failure mode reference
    failure_mode_id: Optional[str] = None
    failure_mode_name: Optional[str] = None
    
    # Observation details
    title: str
    description: Optional[str] = None
    severity: ObservationSeverity = ObservationSeverity.MEDIUM
    confidence: float = Field(0.8, ge=0, le=1, description="Confidence in observation accuracy")
    
    # Evidence and data
    evidence: List[Evidence] = []
    readings: Dict[str, Any] = {}  # Key-value pairs of reading data
    images: List[str] = []  # File URLs
    
    # Risk scoring
    risk_score: float = Field(0, ge=0, le=1000)
    
    # Correlation
    correlation_id: Optional[str] = None  # Link to correlation if part of one
    related_observation_ids: List[str] = []
    
    # Reliability case reference
    reliability_case_id: Optional[str] = None
    
    # Timestamps
    observed_at: datetime = Field(default_factory=datetime.utcnow)
    reported_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Metadata
    tags: List[str] = []
    metadata: Dict[str, Any] = {}


class Reading(BaseModel):
    """
    Sensor/Process Data Reading
    For continuous data streams from external systems.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    
    # Source
    source: ObservationSource
    source_system: str
    source_tag: str  # Tag name in source system (e.g., "PI tag", "OPC tag")
    
    # Equipment reference
    equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    
    # Reading data
    value: float
    unit: str
    quality: Optional[str] = None  # Good, Bad, Uncertain
    
    # Thresholds
    low_limit: Optional[float] = None
    high_limit: Optional[float] = None
    low_low_limit: Optional[float] = None
    high_high_limit: Optional[float] = None
    
    # Alerts
    is_alarm: bool = False
    alarm_type: Optional[str] = None  # High, HighHigh, Low, LowLow, Rate
    
    # Timestamps
    timestamp: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Metadata
    metadata: Dict[str, Any] = {}


class Correlation(BaseModel):
    """
    Multi-Source Event Correlation
    Links related observations, alerts, and readings.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    
    # Correlated items
    observation_ids: List[str] = []
    reading_ids: List[str] = []
    alert_ids: List[str] = []
    
    # Equipment scope
    equipment_ids: List[str] = []
    equipment_tags: List[str] = []
    
    # Correlation analysis
    correlation_result: CorrelationResult
    
    # Time window
    start_time: datetime
    end_time: datetime
    
    # Status
    is_active: bool = True
    reliability_case_id: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # AI analysis
    ai_analysis: Optional[str] = None
    ai_confidence: Optional[float] = None


class Alert(BaseModel):
    """
    Incoming Alert with Triage Information
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    
    # Source
    source: ObservationSource
    source_system: str
    source_alert_id: Optional[str] = None
    
    # Equipment reference
    equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    equipment_name: Optional[str] = None
    
    # Alert details
    title: str
    description: Optional[str] = None
    alert_type: str  # e.g., "vibration_high", "temperature_alarm", "condition_alert"
    
    # Triage
    triage_result: Optional[TriageResult] = None
    is_triaged: bool = False
    
    # Status
    status: str = "new"  # new, acknowledged, assigned, resolved, dismissed
    assigned_to: Optional[str] = None
    
    # Reliability case reference
    reliability_case_id: Optional[str] = None
    
    # Timestamps
    alert_time: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    
    # Related data
    reading_value: Optional[float] = None
    reading_unit: Optional[str] = None
    threshold_value: Optional[float] = None
    
    # Metadata
    metadata: Dict[str, Any] = {}


class Prediction(BaseModel):
    """
    Predictive Failure Insight
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    
    # Equipment reference
    equipment_id: str
    equipment_tag: Optional[str] = None
    equipment_name: Optional[str] = None
    equipment_type_id: Optional[str] = None
    
    # Prediction details
    predictions: List[FailurePrediction] = []
    overall_health_score: float = Field(100, ge=0, le=100)
    
    # Input data summary
    observation_count: int = 0
    reading_count: int = 0
    maintenance_history_count: int = 0
    days_of_data: int = 0
    
    # Fleet comparison
    fleet_percentile: Optional[float] = None  # Position in fleet (0-100)
    fleet_comparison_count: Optional[int] = None
    
    # Reliability case reference
    reliability_case_id: Optional[str] = None
    
    # Timestamps
    calculated_at: datetime = Field(default_factory=datetime.utcnow)
    valid_until: datetime = Field(default_factory=datetime.utcnow)
    
    # Model info
    model_version: str = "1.0"
    model_type: str = "rule_based"  # rule_based, ml, hybrid


class StrategyRecommendation(BaseModel):
    """
    Strategy Optimization Recommendation
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    
    # Target
    equipment_type_id: Optional[str] = None
    equipment_type_name: Optional[str] = None
    failure_mode_id: Optional[str] = None
    failure_mode_name: Optional[str] = None
    task_template_id: Optional[str] = None
    task_template_name: Optional[str] = None
    
    # Recommendation
    recommendation_type: RecommendationType
    title: str
    description: str
    reasoning: str
    
    # Details
    current_value: Optional[str] = None
    recommended_value: Optional[str] = None
    impact_estimate: Optional[str] = None
    
    # Supporting data
    supporting_observations: List[str] = []  # Observation IDs
    supporting_investigations: List[str] = []  # Investigation IDs
    supporting_failures: List[str] = []  # Historical failure IDs
    
    # Status
    status: str = "pending"  # pending, accepted, rejected, implemented
    accepted_by: Optional[str] = None
    accepted_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # AI analysis
    confidence: float = Field(0.8, ge=0, le=1)


class ReliabilityCase(BaseModel):
    """
    Reliability Case - Core Object
    Single container for reliability issues.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    
    # Case identification
    case_number: str  # Human-readable case number (e.g., "RC-2026-0001")
    
    # Equipment reference
    equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    equipment_name: Optional[str] = None
    equipment_type_id: Optional[str] = None
    
    # Case details
    title: str
    description: Optional[str] = None
    status: CaseStatus = CaseStatus.OPEN
    
    # Priority (from triage)
    priority: AlertPriority = AlertPriority.P3_MEDIUM
    
    # Risk assessment
    risk_assessment: Optional[RiskAssessment] = None
    
    # Linked items
    observation_ids: List[str] = []
    alert_ids: List[str] = []
    correlation_ids: List[str] = []
    prediction_ids: List[str] = []
    action_ids: List[str] = []  # AssetIQ Action IDs
    investigation_id: Optional[str] = None  # AssetIQ Investigation ID
    
    # Evidence collection
    evidence: List[Evidence] = []
    
    # Resolution
    resolution_summary: Optional[str] = None
    root_cause: Optional[str] = None
    corrective_actions: List[str] = []
    preventive_actions: List[str] = []
    
    # Assignment
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    assigned_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    
    # History
    status_history: List[Dict[str, Any]] = []
    
    # Tags and metadata
    tags: List[str] = []
    metadata: Dict[str, Any] = {}


# ============= API Request/Response Models =============

class CreateObservationRequest(BaseModel):
    """Request to create a RIL observation"""
    source: ObservationSource
    source_system: Optional[str] = None
    source_id: Optional[str] = None
    equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    failure_mode_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    severity: ObservationSeverity = ObservationSeverity.MEDIUM
    confidence: float = 0.8
    readings: Dict[str, Any] = {}
    observed_at: Optional[datetime] = None
    tags: List[str] = []
    metadata: Dict[str, Any] = {}


class CreateReadingRequest(BaseModel):
    """Request to ingest a reading"""
    source: ObservationSource
    source_system: str
    source_tag: str
    equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    value: float
    unit: str
    quality: Optional[str] = None
    timestamp: datetime
    low_limit: Optional[float] = None
    high_limit: Optional[float] = None
    low_low_limit: Optional[float] = None
    high_high_limit: Optional[float] = None
    is_alarm: bool = False
    alarm_type: Optional[str] = None
    metadata: Dict[str, Any] = {}


class BulkReadingsRequest(BaseModel):
    """Request to ingest multiple readings at once"""
    readings: List[CreateReadingRequest]


class CreateAlertRequest(BaseModel):
    """Request to create an alert"""
    source: ObservationSource
    source_system: str
    source_alert_id: Optional[str] = None
    equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    title: str
    description: Optional[str] = None
    alert_type: str
    alert_time: datetime
    reading_value: Optional[float] = None
    reading_unit: Optional[str] = None
    threshold_value: Optional[float] = None
    metadata: Dict[str, Any] = {}


class CreateReliabilityCaseRequest(BaseModel):
    """Request to create a reliability case"""
    equipment_id: Optional[str] = None
    equipment_tag: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: AlertPriority = AlertPriority.P3_MEDIUM
    observation_ids: List[str] = []
    alert_ids: List[str] = []
    tags: List[str] = []


class UpdateReliabilityCaseRequest(BaseModel):
    """Request to update a reliability case"""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[CaseStatus] = None
    priority: Optional[AlertPriority] = None
    assigned_to: Optional[str] = None
    resolution_summary: Optional[str] = None
    root_cause: Optional[str] = None
    corrective_actions: Optional[List[str]] = None
    preventive_actions: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class CopilotQueryRequest(BaseModel):
    """Request for Reliability Copilot natural language query"""
    query: str
    equipment_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
