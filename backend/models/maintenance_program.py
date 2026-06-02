"""
Maintenance Program Module Models
Based on AssetIQ Functional Specification

The Maintenance Program provides a single executable maintenance program for each equipment item.
It consolidates maintenance activities from multiple sources into one unified program.

Key Concepts:
- One Maintenance Program per equipment item
- Tasks from multiple sources: Strategy, Customer Imported, Equipment Specific, AI Generated, Manual
- Full version control and audit trail
- Single source of truth for scheduling
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
import uuid


# ============= Enums =============

class ProgramStatus(str, Enum):
    """Maintenance Program statuses"""
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    SUPERSEDED = "superseded"


class ApprovalStatus(str, Enum):
    """Approval status for program changes"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class TaskSource(str, Enum):
    """Origin source for maintenance tasks"""
    STRATEGY_GENERATED = "strategy_generated"
    CUSTOMER_IMPORTED = "customer_imported"
    EQUIPMENT_SPECIFIC = "equipment_specific"
    AI_GENERATED = "ai_generated"
    MANUAL = "manual"


class TaskCategory(str, Enum):
    """Categories of maintenance tasks"""
    INSPECTION = "inspection"
    CONDITION_MONITORING = "condition_monitoring"
    PREVENTIVE_MAINTENANCE = "preventive_maintenance"
    FUNCTIONAL_TEST = "functional_test"
    LUBRICATION = "lubrication"
    CALIBRATION = "calibration"
    CLEANING = "cleaning"
    SAFETY_VERIFICATION = "safety_verification"
    REGULATORY_COMPLIANCE = "regulatory_compliance"
    CORRECTIVE = "corrective"
    PREDICTIVE = "predictive"


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
    BIENNIAL = "biennial"
    ON_CONDITION = "on_condition"


class SkillRequirement(str, Enum):
    """Skill levels required for tasks"""
    OPERATOR = "operator"
    TECHNICIAN = "technician"
    SPECIALIST = "specialist"
    ENGINEER = "engineer"
    CONTRACTOR = "contractor"


class TaskPriority(str, Enum):
    """Task priority levels"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# ============= Task Traceability =============

class TaskTraceability(BaseModel):
    """Traceability information linking task to its origin"""
    # Strategy traceability (for strategy-generated tasks)
    strategy_id: Optional[str] = None
    strategy_version: Optional[str] = None
    task_template_id: Optional[str] = None
    failure_mode_id: Optional[str] = None
    failure_mode_name: Optional[str] = None
    
    # Import traceability (for customer-imported tasks)
    import_session_id: Optional[str] = None
    import_source_file: Optional[str] = None
    import_row_reference: Optional[str] = None
    
    # AI traceability (for AI-generated tasks)
    ai_model: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_reasoning: Optional[str] = None
    
    # Override tracking
    original_task_id: Optional[str] = None
    override_reason: Optional[str] = None
    overridden_at: Optional[str] = None
    overridden_by: Optional[str] = None


# ============= Maintenance Program Task =============

class MaintenanceProgramTask(BaseModel):
    """Individual task within a Maintenance Program"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Task identification
    task_title: str
    task_description: Optional[str] = None
    task_code: Optional[str] = None  # External reference code
    
    # Scheduling
    frequency: TaskFrequency = TaskFrequency.MONTHLY
    frequency_days: int = 30  # Converted to days for scheduling
    estimated_duration_hours: float = 1.0
    
    # Classification
    task_category: TaskCategory = TaskCategory.PREVENTIVE_MAINTENANCE
    task_source: TaskSource = TaskSource.MANUAL
    priority: TaskPriority = TaskPriority.MEDIUM
    
    # Requirements
    skill_requirement: SkillRequirement = SkillRequirement.TECHNICIAN
    discipline: Optional[str] = None
    skills_required: List[str] = []
    tools_required: List[str] = []
    spare_parts: List[str] = []
    
    # Procedure/Instructions
    procedure_steps: List[str] = []
    acceptance_criteria: List[str] = []
    safety_precautions: List[str] = []
    
    # Traceability
    traceability: TaskTraceability = Field(default_factory=TaskTraceability)
    
    # Status
    is_active: bool = True
    is_mandatory: bool = True
    is_overridden: bool = False
    
    # Scheduling state
    next_due_date: Optional[str] = None
    last_execution_date: Optional[str] = None
    last_review_date: Optional[str] = None
    
    # Estimated costs
    estimated_labor_cost: Optional[float] = None
    estimated_material_cost: Optional[float] = None
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    created_by: Optional[str] = None


# ============= Program Version Entry =============

class ProgramVersionEntry(BaseModel):
    """Version history entry for a Maintenance Program"""
    version: str
    changed_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    changed_by: Optional[str] = None
    change_type: str  # created, task_added, task_modified, task_removed, regenerated, imported, ai_updated
    change_summary: str
    tasks_added: int = 0
    tasks_modified: int = 0
    tasks_removed: int = 0
    previous_version: Optional[str] = None


# ============= Maintenance Program =============

class MaintenanceProgram(BaseModel):
    """
    Complete Maintenance Program for a specific equipment item.
    Each equipment has one active Maintenance Program.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Program identification
    program_name: str
    program_code: Optional[str] = None  # External reference code
    
    # Equipment reference
    equipment_id: str
    equipment_name: str
    equipment_tag: Optional[str] = None
    equipment_type_id: Optional[str] = None
    equipment_type_name: Optional[str] = None
    
    # Criticality (from equipment)
    criticality_level: Optional[str] = None  # low, medium, high
    criticality_score: Optional[float] = None
    
    # Version control
    version: str = "1.0"
    version_history: List[ProgramVersionEntry] = []
    
    # Status
    status: ProgramStatus = ProgramStatus.DRAFT
    approval_status: ApprovalStatus = ApprovalStatus.PENDING
    
    # Tasks
    tasks: List[MaintenanceProgramTask] = []
    
    # Statistics (auto-calculated)
    total_tasks: int = 0
    active_tasks: int = 0
    strategy_tasks: int = 0
    imported_tasks: int = 0
    ai_tasks: int = 0
    manual_tasks: int = 0
    
    # Task categories breakdown
    inspection_tasks: int = 0
    preventive_tasks: int = 0
    predictive_tasks: int = 0
    
    # Strategy reference
    source_strategy_id: Optional[str] = None
    source_strategy_version: Optional[str] = None
    last_strategy_sync: Optional[str] = None
    
    # Import tracking
    last_import_session_id: Optional[str] = None
    last_import_date: Optional[str] = None
    
    # AI tracking
    last_ai_analysis_date: Optional[str] = None
    ai_recommendations_pending: int = 0
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    generated_date: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None


# ============= API Request/Response Models =============

class CreateMaintenanceProgramRequest(BaseModel):
    """Request to create/initialize a maintenance program for equipment"""
    equipment_id: str
    generate_from_strategy: bool = True  # Auto-generate tasks from equipment type strategy
    include_ai_recommendations: bool = False  # Generate AI recommendations


class AddTaskRequest(BaseModel):
    """Request to add a manual task to a maintenance program"""
    task_title: str
    task_description: Optional[str] = None
    frequency: TaskFrequency = TaskFrequency.MONTHLY
    estimated_duration_hours: float = 1.0
    task_category: TaskCategory = TaskCategory.PREVENTIVE_MAINTENANCE
    priority: TaskPriority = TaskPriority.MEDIUM
    skill_requirement: SkillRequirement = SkillRequirement.TECHNICIAN
    discipline: Optional[str] = None
    procedure_steps: List[str] = []
    acceptance_criteria: List[str] = []
    tools_required: List[str] = []
    spare_parts: List[str] = []


class UpdateTaskRequest(BaseModel):
    """Request to update/override a task in a maintenance program"""
    task_title: Optional[str] = None
    task_description: Optional[str] = None
    frequency: Optional[TaskFrequency] = None
    estimated_duration_hours: Optional[float] = None
    task_category: Optional[TaskCategory] = None
    priority: Optional[TaskPriority] = None
    skill_requirement: Optional[SkillRequirement] = None
    discipline: Optional[str] = None
    procedure_steps: Optional[List[str]] = None
    acceptance_criteria: Optional[List[str]] = None
    is_active: Optional[bool] = None
    is_mandatory: Optional[bool] = None
    override_reason: Optional[str] = None


class RegenerateProgramRequest(BaseModel):
    """Request to regenerate a maintenance program from strategy"""
    preserve_overrides: bool = True  # Keep manual overrides
    preserve_manual_tasks: bool = True  # Keep manually added tasks
    preserve_imported_tasks: bool = True  # Keep imported tasks
    preview_only: bool = False  # Only show what would change


class ImportTasksRequest(BaseModel):
    """Request to import tasks from a PM Import session"""
    import_session_id: str
    task_ids: Optional[List[str]] = None  # Specific tasks to import, or all if None


class AIRecommendationRequest(BaseModel):
    """Request to generate AI maintenance recommendations"""
    include_failure_history: bool = True  # Analyze failure history
    include_industry_standards: bool = True  # Reference ISO 14224 standards
    max_recommendations: int = 10


class ProgramChangePreview(BaseModel):
    """Preview of changes that would occur during regeneration"""
    tasks_to_add: List[Dict[str, Any]] = []
    tasks_to_update: List[Dict[str, Any]] = []
    tasks_to_remove: List[Dict[str, Any]] = []
    preserved_overrides: List[Dict[str, Any]] = []
    preserved_manual_tasks: List[Dict[str, Any]] = []


class ApprovalRequest(BaseModel):
    """Request to approve/reject a maintenance program"""
    approval_status: ApprovalStatus
    comments: Optional[str] = None


# ============= Frequency Conversion Utilities =============

FREQUENCY_DAYS_MAP = {
    TaskFrequency.NOT_REQUIRED: 0,
    TaskFrequency.CONTINUOUS: 1,
    TaskFrequency.HOURLY: 1,
    TaskFrequency.SHIFT: 1,
    TaskFrequency.DAILY: 1,
    TaskFrequency.WEEKLY: 7,
    TaskFrequency.BI_WEEKLY: 14,
    TaskFrequency.MONTHLY: 30,
    TaskFrequency.QUARTERLY: 90,
    TaskFrequency.SEMI_ANNUAL: 180,
    TaskFrequency.ANNUAL: 365,
    TaskFrequency.BIENNIAL: 730,
    TaskFrequency.ON_CONDITION: 0,
}


def frequency_to_days(frequency: str) -> int:
    """Convert frequency string to days"""
    try:
        freq = TaskFrequency(frequency)
        return FREQUENCY_DAYS_MAP.get(freq, 30)
    except ValueError:
        return 30  # Default to monthly
