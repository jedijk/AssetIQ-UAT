"""
Task Management Models - Pydantic models for task templates, plans, and instances.

Based on the functional spec:
- Task Templates: Reusable task definitions linked to equipment types/failure modes
- Task Plans: Frequency configuration for specific equipment
- Task Instances: Scheduled task occurrences
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class TaskDiscipline(str, Enum):
    """Discipline responsible for task execution."""
    OPERATIONS = "operations"
    MAINTENANCE = "maintenance"
    LAB = "lab"
    LABORATORY = "laboratory"
    INSPECTION = "inspection"
    ENGINEERING = "engineering"


class FrequencyType(str, Enum):
    """How task frequency is determined."""
    TIME_BASED = "time_based"       # Fixed intervals (days, weeks, months)
    USAGE_BASED = "usage_based"     # Based on operating hours/cycles
    CONDITION_BASED = "condition_based"  # Triggered by thresholds/observations


class FrequencyUnit(str, Enum):
    """Time units for time-based frequency."""
    HOURS = "hours"
    DAYS = "days"
    WEEKS = "weeks"
    MONTHS = "months"
    YEARS = "years"


class MitigationStrategy(str, Enum):
    """Types of mitigation strategies."""
    PREVENTIVE = "preventive"
    PREDICTIVE = "predictive"
    DETECTIVE = "detective"
    CORRECTIVE = "corrective"


class TaskStatus(str, Enum):
    """Status of a task instance."""
    PLANNED = "planned"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    DEFERRED = "deferred"


class TaskPriority(str, Enum):
    """Priority levels for tasks."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# ============= TASK TEMPLATE MODELS =============

class TaskTemplateCreate(BaseModel):
    """Create a new task template."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    discipline: TaskDiscipline
    mitigation_strategy: MitigationStrategy
    
    # Linkages
    equipment_type_ids: List[str] = Field(default_factory=list)
    failure_mode_ids: List[str] = Field(default_factory=list)
    
    # Default frequency settings
    frequency_type: FrequencyType = FrequencyType.TIME_BASED
    default_interval: int = 30  # Default interval value
    default_unit: FrequencyUnit = FrequencyUnit.DAYS
    
    # Estimated duration
    estimated_duration_minutes: Optional[int] = None
    
    # Instructions and safety
    procedure_steps: List[str] = Field(default_factory=list)
    safety_requirements: List[str] = Field(default_factory=list)
    tools_required: List[str] = Field(default_factory=list)
    spare_parts: List[str] = Field(default_factory=list)
    
    # Form template link (for Phase 3)
    form_template_id: Optional[str] = None
    
    # Tagging
    tags: List[str] = Field(default_factory=list)


class TaskTemplateUpdate(BaseModel):
    """Update a task template."""
    name: Optional[str] = None
    description: Optional[str] = None
    discipline: Optional[TaskDiscipline] = None
    mitigation_strategy: Optional[MitigationStrategy] = None
    equipment_type_ids: Optional[List[str]] = None
    failure_mode_ids: Optional[List[str]] = None
    frequency_type: Optional[FrequencyType] = None
    default_interval: Optional[int] = None
    default_unit: Optional[FrequencyUnit] = None
    estimated_duration_minutes: Optional[int] = None
    procedure_steps: Optional[List[str]] = None
    safety_requirements: Optional[List[str]] = None
    tools_required: Optional[List[str]] = None
    spare_parts: Optional[List[str]] = None
    form_template_id: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ============= TASK PLAN MODELS =============

class TaskPlanCreate(BaseModel):
    """Create a task plan for specific equipment."""
    equipment_id: str
    task_template_id: str
    efm_id: Optional[str] = None  # Optional link to specific EFM
    form_template_id: Optional[str] = None  # Optional link to form template
    
    # Override template frequency
    frequency_type: Optional[FrequencyType] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[FrequencyUnit] = None
    
    # Condition-based triggers
    trigger_condition: Optional[str] = None  # e.g., "temperature > 80"
    
    # Assignment
    assigned_team: Optional[str] = None
    assigned_user_id: Optional[str] = None
    
    # Start date for scheduling
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    
    notes: Optional[str] = None


class TaskPlanUpdate(BaseModel):
    """Update a task plan."""
    frequency_type: Optional[FrequencyType] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[FrequencyUnit] = None
    trigger_condition: Optional[str] = None
    assigned_team: Optional[str] = None
    assigned_user_id: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    form_template_id: Optional[str] = None  # Optional link to form template


# ============= TASK INSTANCE MODELS =============

class TaskInstanceCreate(BaseModel):
    """Create a task instance (usually auto-generated)."""
    task_plan_id: str
    scheduled_date: datetime
    due_date: datetime
    priority: TaskPriority = TaskPriority.MEDIUM
    assigned_team: Optional[str] = None
    assigned_user_id: Optional[str] = None
    notes: Optional[str] = None


class TaskInstanceUpdate(BaseModel):
    """Update a task instance."""
    scheduled_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assigned_team: Optional[str] = None
    assigned_user_id: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    completion_notes: Optional[str] = None
    notes: Optional[str] = None


class TaskExecutionSubmit(BaseModel):
    """Submit task execution results."""
    completion_notes: Optional[str] = None
    actual_duration_minutes: Optional[int] = None
    issues_found: List[str] = Field(default_factory=list)
    follow_up_required: bool = False
    follow_up_notes: Optional[str] = None
    # Form data for dynamic forms
    form_data: Optional[dict] = None
    # Observation creation fields (when Issue = YES)
    create_observation: bool = False
    issue_severity: Optional[str] = None  # low, medium, high
