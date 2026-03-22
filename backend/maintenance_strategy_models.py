"""
Maintenance Strategy Models for ThreatBase
Translates FMEA data into proactive and reactive maintenance strategies
"""

from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class CriticalityLevel(str, Enum):
    SAFETY_CRITICAL = "safety_critical"
    PRODUCTION_CRITICAL = "production_critical"
    MEDIUM = "medium"
    LOW = "low"


class MaintenanceFrequency(str, Enum):
    CONTINUOUS = "continuous"
    HOURLY = "hourly"
    SHIFT = "shift"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUAL = "semi_annual"
    ANNUAL = "annual"


class DetectionSystemType(str, Enum):
    VIBRATION = "vibration"
    TEMPERATURE = "temperature"
    PRESSURE = "pressure"
    FLOW = "flow"
    LEVEL = "level"
    ACOUSTIC = "acoustic"
    OIL_ANALYSIS = "oil_analysis"
    THERMOGRAPHY = "thermography"
    ULTRASONIC = "ultrasonic"
    VISUAL = "visual"
    ELECTRICAL = "electrical"
    PROCESS = "process"


class MaintenanceType(str, Enum):
    PREVENTIVE = "preventive"
    PREDICTIVE = "predictive"
    CONDITION_BASED = "condition_based"
    CORRECTIVE = "corrective"
    EMERGENCY = "emergency"


# ============= Operator Rounds =============

class OperatorCheckItem(BaseModel):
    """Single check item in operator round"""
    id: str
    description: str
    check_type: str = "visual"  # visual, measurement, functional
    acceptable_range: Optional[str] = None
    unit: Optional[str] = None
    failure_modes_addressed: List[str] = []  # Links to failure mode names


class OperatorRound(BaseModel):
    """Operator round definition"""
    id: str
    name: str
    frequency: MaintenanceFrequency
    duration_minutes: int = 15
    checklist: List[OperatorCheckItem] = []
    skills_required: List[str] = []
    ppe_required: List[str] = []


# ============= Detection Systems =============

class DetectionSystem(BaseModel):
    """Detection/monitoring system"""
    id: str
    name: str
    system_type: DetectionSystemType
    description: str
    monitoring_interval: MaintenanceFrequency
    alarm_thresholds: Optional[dict] = None  # {warning: value, critical: value}
    failure_modes_detected: List[str] = []  # Links to failure mode names
    installation_cost_eur: Optional[float] = None
    recommended_for_criticality: List[CriticalityLevel] = []


# ============= Scheduled Maintenance =============

class MaintenanceTask(BaseModel):
    """Scheduled maintenance task"""
    id: str
    name: str
    description: str
    maintenance_type: MaintenanceType
    interval: MaintenanceFrequency
    duration_hours: float = 2.0
    skills_required: List[str] = []
    tools_required: List[str] = []
    spare_parts: List[str] = []
    failure_modes_addressed: List[str] = []
    estimated_cost_eur: Optional[float] = None


# ============= Reactive Strategies =============

class CorrectiveAction(BaseModel):
    """Corrective action for reactive maintenance"""
    id: str
    trigger_condition: str
    action_description: str
    response_time_hours: float
    priority: str = "medium"  # low, medium, high, critical
    failure_modes: List[str] = []
    escalation_path: Optional[str] = None


class EmergencyProcedure(BaseModel):
    """Emergency procedure for critical failures"""
    id: str
    condition: str
    immediate_actions: List[str]
    notification_list: List[str] = []
    safety_precautions: List[str] = []
    recovery_steps: List[str] = []
    estimated_downtime_hours: Optional[float] = None


# ============= Spare Parts =============

class SparePart(BaseModel):
    """Spare part recommendation"""
    id: str
    part_name: str
    part_number: Optional[str] = None
    quantity_recommended: int = 1
    criticality: str = "medium"  # low, medium, high, critical
    lead_time_days: Optional[int] = None
    estimated_cost_eur: Optional[float] = None
    failure_modes_addressed: List[str] = []


# ============= Failure Mode Mapping =============

class FailureModeMapping(BaseModel):
    """Maps a failure mode to specific maintenance strategies"""
    failure_mode_id: Optional[int] = None
    failure_mode_name: str
    equipment_type: str
    detection_methods: List[str] = []  # IDs of detection systems
    operator_checks: List[str] = []  # IDs of operator check items
    preventive_tasks: List[str] = []  # IDs of maintenance tasks
    recommended_interval: Optional[MaintenanceFrequency] = None
    risk_if_unaddressed: str = "medium"  # low, medium, high, critical


# ============= Main Strategy Model =============

class MaintenanceStrategy(BaseModel):
    """Complete maintenance strategy for an equipment type at a criticality level"""
    id: str
    equipment_type_id: str
    equipment_type_name: str
    criticality_level: CriticalityLevel
    strategy_version: str = "1.0"
    description: Optional[str] = None
    
    # Proactive strategies
    operator_rounds: List[OperatorRound] = []
    detection_systems: List[DetectionSystem] = []
    scheduled_maintenance: List[MaintenanceTask] = []
    
    # Reactive strategies
    corrective_actions: List[CorrectiveAction] = []
    emergency_procedures: List[EmergencyProcedure] = []
    
    # Supporting data
    spare_parts: List[SparePart] = []
    failure_mode_mappings: List[FailureModeMapping] = []
    
    # Metadata
    total_annual_cost_estimate_eur: Optional[float] = None
    expected_availability_percent: Optional[float] = None
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    created_by: Optional[str] = None
    auto_generated: bool = False


# ============= API Models =============

class MaintenanceStrategyCreate(BaseModel):
    """Create a new maintenance strategy"""
    equipment_type_id: str
    equipment_type_name: str
    criticality_level: CriticalityLevel
    description: Optional[str] = None


class MaintenanceStrategyUpdate(BaseModel):
    """Update an existing maintenance strategy"""
    description: Optional[str] = None
    strategy_version: Optional[str] = None
    operator_rounds: Optional[List[OperatorRound]] = None
    detection_systems: Optional[List[DetectionSystem]] = None
    scheduled_maintenance: Optional[List[MaintenanceTask]] = None
    corrective_actions: Optional[List[CorrectiveAction]] = None
    emergency_procedures: Optional[List[EmergencyProcedure]] = None
    spare_parts: Optional[List[SparePart]] = None
    failure_mode_mappings: Optional[List[FailureModeMapping]] = None


class GenerateStrategyRequest(BaseModel):
    """Request to auto-generate a maintenance strategy"""
    equipment_type_id: str
    equipment_type_name: str
    criticality_level: CriticalityLevel = CriticalityLevel.MEDIUM
    include_costs: bool = True
