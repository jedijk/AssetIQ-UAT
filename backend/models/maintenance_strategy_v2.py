"""
Maintenance Strategy Module v2 - ISO 14224 Aligned
Based on Functional Specification: Equipment Type Level Strategy Management

Core Design Principle:
- Maintenance Strategies are defined at Equipment Type Level, NOT individual equipment
- Equipment assets only define: Criticality, Operating context, Optional overrides
- System automatically generates maintenance tasks and frequencies
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


# ============= Enums =============

class CriticalityLevel(str, Enum):
    """Criticality levels for equipment assets"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class MaintenanceStrategyType(str, Enum):
    """Supported maintenance strategy types"""
    REACTIVE = "reactive"
    PREVENTIVE = "preventive"
    PREDICTIVE = "predictive"
    CONDITION_BASED = "condition_based"
    RELIABILITY_CENTERED = "reliability_centered"
    RISK_BASED = "risk_based"


class TaskFrequency(str, Enum):
    """Standard maintenance task frequencies"""
    NOT_REQUIRED = "not_required"
    CONTINUOUS = "continuous"
    HOURLY = "hourly"
    SHIFT = "shift"
    DAILY = "daily"
    WEEKLY = "weekly"
    BI_WEEKLY = "bi_weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUAL = "semi_annual"
    ANNUAL = "annual"
    BIENNIAL = "biennial"  # Every 2 years
    ON_CONDITION = "on_condition"


class TaskActivationState(str, Enum):
    """Task activation states at equipment level"""
    ACTIVE = "active"
    DISABLED = "disabled"
    INHERITED = "inherited"
    OVERRIDDEN = "overridden"
    LOCAL = "local"


class DetectionMethod(str, Enum):
    """Detection methods for failure modes"""
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
    OPERATOR_ROUNDS = "operator_rounds"


# ============= Criticality Frequency Matrix =============

class CriticalityFrequency(BaseModel):
    """Frequency for each criticality level"""
    low: TaskFrequency = TaskFrequency.QUARTERLY
    medium: TaskFrequency = TaskFrequency.MONTHLY
    high: TaskFrequency = TaskFrequency.WEEKLY


# ============= Maintenance Task Template =============

class MaintenanceTaskTemplate(BaseModel):
    """Task template within a maintenance strategy"""
    id: str = Field(default_factory=lambda: f"task_{datetime.now().strftime('%Y%m%d%H%M%S%f')}")
    name: str
    description: Optional[str] = None
    task_type: MaintenanceStrategyType = MaintenanceStrategyType.PREVENTIVE
    
    # Criticality-based frequencies
    frequency_matrix: CriticalityFrequency = Field(default_factory=CriticalityFrequency)
    
    # Task details
    duration_hours: float = 1.0
    skills_required: List[str] = []
    tools_required: List[str] = []
    spare_parts: List[str] = []
    discipline: Optional[str] = None
    
    # Detection methods this task uses
    detection_methods: List[DetectionMethod] = []
    
    # Which failure modes this task addresses
    failure_mode_ids: List[str] = []
    
    # Procedure/instructions
    procedure_steps: List[str] = []
    
    # Cost estimates
    estimated_cost_eur: Optional[float] = None
    
    # Metadata
    is_mandatory: bool = True
    source: str = "template"  # template, ai_generated, manual


# ============= Failure Mode Strategy Assignment =============

class FailureModeStrategy(BaseModel):
    """Strategy assignment for a specific failure mode"""
    failure_mode_id: str
    failure_mode_name: str
    
    # Potential effects of the failure mode (from FMEA library)
    potential_effects: List[str] = []
    
    # Strategy configuration
    strategy_type: MaintenanceStrategyType = MaintenanceStrategyType.PREVENTIVE
    detection_methods: List[DetectionMethod] = []
    
    # Linked maintenance tasks (references to task template IDs)
    task_ids: List[str] = []
    
    # Criticality frequency override (if different from task defaults)
    frequency_override: Optional[CriticalityFrequency] = None
    
    # Risk assessment - RPN (Risk Priority Number)
    severity: int = 5  # 1-10 scale
    occurrence: int = 5  # 1-10 scale  
    detectability: int = 5  # 1-10 scale
    rpn: int = 125  # severity * occurrence * detectability (1-1000)
    risk_if_unaddressed: str = "medium"  # low, medium, high, critical
    
    # Confidence score for AI-generated strategies
    confidence_score: Optional[float] = None
    
    # Enabled/disabled at equipment type level
    enabled: bool = True


# ============= Equipment Type Strategy Template =============

class EquipmentTypeStrategy(BaseModel):
    """Complete maintenance strategy template for an equipment type"""
    id: str = Field(default_factory=lambda: f"strategy_{datetime.now().strftime('%Y%m%d%H%M%S%f')}")
    
    # Equipment type reference
    equipment_type_id: str
    equipment_type_name: str
    
    # Version control
    version: str = "1.0"
    version_history: List[Dict[str, Any]] = []
    
    # Strategy overview
    description: Optional[str] = None
    strategy_summary: Optional[str] = None
    
    # Core components
    failure_mode_strategies: List[FailureModeStrategy] = []
    task_templates: List[MaintenanceTaskTemplate] = []
    
    # Default criticality frequencies (can be overridden per task)
    default_frequency_matrix: CriticalityFrequency = Field(default_factory=CriticalityFrequency)
    
    # Statistics (auto-calculated)
    total_failure_modes: int = 0
    total_tasks: int = 0
    coverage_score: Optional[float] = None  # % of failure modes with strategies
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    created_by: Optional[str] = None
    auto_generated: bool = False
    
    # Status
    status: str = "draft"  # draft, active, archived


# ============= Generated Task (for equipment instance) =============

class GeneratedTask(BaseModel):
    """Generated maintenance task for a specific equipment asset"""
    id: str = Field(default_factory=lambda: f"gen_task_{datetime.now().strftime('%Y%m%d%H%M%S%f')}")
    
    # Source references
    equipment_id: str
    equipment_name: str
    equipment_type_id: str
    strategy_id: str
    strategy_version: str
    task_template_id: str
    failure_mode_ids: List[str] = []
    
    # Task details (copied/derived from template)
    name: str
    description: Optional[str] = None
    task_type: MaintenanceStrategyType
    frequency: TaskFrequency
    
    # Asset-specific criticality
    asset_criticality: CriticalityLevel
    
    # Activation state
    activation_state: TaskActivationState = TaskActivationState.INHERITED
    
    # Override tracking
    is_overridden: bool = False
    override_reason: Optional[str] = None
    original_frequency: Optional[TaskFrequency] = None
    
    # Task details
    duration_hours: float = 1.0
    skills_required: List[str] = []
    discipline: Optional[str] = None
    
    # Scheduling
    next_due_date: Optional[str] = None
    last_executed_date: Optional[str] = None
    
    # Metadata
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    sync_status: str = "current"  # current, update_available, outdated, customized


# ============= Equipment Strategy Instance =============

class EquipmentStrategyInstance(BaseModel):
    """Strategy instance for a specific equipment asset"""
    id: str = Field(default_factory=lambda: f"eq_strategy_{datetime.now().strftime('%Y%m%d%H%M%S%f')}")
    
    # Equipment reference
    equipment_id: str
    equipment_name: str
    equipment_type_id: str
    
    # Asset-specific settings
    criticality: CriticalityLevel = CriticalityLevel.MEDIUM
    operating_context: Optional[str] = None
    
    # Strategy source
    strategy_id: str
    strategy_version: str
    
    # Generated tasks
    generated_tasks: List[GeneratedTask] = []
    
    # Failure mode controls (enable/disable specific FMs)
    disabled_failure_modes: List[str] = []  # FM IDs
    disabled_fm_reasons: Dict[str, str] = {}  # FM ID -> reason
    
    # Local tasks (additional tasks not from template)
    local_tasks: List[MaintenanceTaskTemplate] = []
    
    # Task overrides
    task_overrides: Dict[str, Dict[str, Any]] = {}  # task_id -> {frequency, etc.}
    
    # Sync status
    sync_status: str = "current"  # current, update_available, outdated, customized, conflict
    last_synced_at: Optional[str] = None
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============= API Request/Response Models =============

class CreateEquipmentTypeStrategyRequest(BaseModel):
    """Request to create a new equipment type strategy"""
    equipment_type_id: str
    equipment_type_name: str
    description: Optional[str] = None
    auto_generate: bool = True  # Use AI to generate strategy from failure modes


class UpdateEquipmentTypeStrategyRequest(BaseModel):
    """Request to update an equipment type strategy"""
    description: Optional[str] = None
    failure_mode_strategies: Optional[List[FailureModeStrategy]] = None
    task_templates: Optional[List[MaintenanceTaskTemplate]] = None
    default_frequency_matrix: Optional[CriticalityFrequency] = None
    status: Optional[str] = None


class GenerateTasksRequest(BaseModel):
    """Request to generate tasks for an equipment asset"""
    equipment_id: str
    equipment_name: str
    criticality: CriticalityLevel = CriticalityLevel.MEDIUM
    operating_context: Optional[str] = None
    disabled_failure_modes: List[str] = []


class UpdateFailureModeStrategyRequest(BaseModel):
    """Request to update a failure mode's strategy"""
    strategy_type: Optional[MaintenanceStrategyType] = None
    detection_methods: Optional[List[DetectionMethod]] = None
    task_ids: Optional[List[str]] = None
    frequency_override: Optional[CriticalityFrequency] = None
    enabled: Optional[bool] = None


class AddTaskTemplateRequest(BaseModel):
    """Request to add a new task template"""
    name: str
    description: Optional[str] = None
    task_type: MaintenanceStrategyType = MaintenanceStrategyType.PREVENTIVE
    frequency_matrix: Optional[CriticalityFrequency] = None
    duration_hours: float = 1.0
    skills_required: List[str] = []
    discipline: Optional[str] = None
    detection_methods: List[DetectionMethod] = []
    failure_mode_ids: List[str] = []
    procedure_steps: List[str] = []


class RegenerateStrategyRequest(BaseModel):
    """Request to regenerate strategy (after failure mode changes)"""
    preserve_overrides: bool = True
    preview_only: bool = False
