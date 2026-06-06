"""
Maintenance Scheduler & Planning Engine Models
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from enum import Enum
import uuid


class TaskStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DEFERRED = "deferred"
    CANCELLED = "cancelled"


class TaskPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class CriticalityLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# ============= Equipment Maintenance Program =============

class EquipmentMaintenanceProgram(BaseModel):
    """
    Active maintenance program record for equipment.
    Created when a maintenance strategy is applied to equipment.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Equipment reference
    equipment_id: str
    equipment_name: str
    equipment_tag: Optional[str] = None
    equipment_type_id: str
    equipment_type_name: str
    
    # Task details from strategy
    task_template_id: str
    task_name: str
    task_description: Optional[str] = None
    task_type: str  # preventive, predictive, inspection, etc.
    
    # Scheduling parameters
    frequency: str  # daily, weekly, monthly, quarterly, etc.
    frequency_days: int  # Converted to days for scheduling
    criticality: CriticalityLevel = CriticalityLevel.LOW
    estimated_duration_hours: float = 1.0
    
    # Scheduling state
    next_due_date: Optional[str] = None
    last_completion_date: Optional[str] = None
    last_scheduled_date: Optional[str] = None
    
    # Strategy traceability
    strategy_id: str
    strategy_version: str
    failure_mode_id: Optional[str] = None
    failure_mode_name: Optional[str] = None
    
    # Discipline/Skills
    discipline: Optional[str] = None
    skills_required: List[str] = []
    
    # Status
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============= Scheduled Task =============

class ScheduledTask(BaseModel):
    """
    Generated maintenance work from the scheduler engine.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Equipment reference
    equipment_id: str
    equipment_name: str
    equipment_tag: Optional[str] = None
    
    # Task details
    task_name: str
    task_description: Optional[str] = None
    task_type: str
    
    # Scheduling
    due_date: str  # When task must be completed
    planned_date: Optional[str] = None  # When task is planned to be done
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.DRAFT
    
    # Assignment
    assigned_technician_id: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    estimated_hours: float = 1.0
    actual_hours: Optional[float] = None
    
    # Traceability
    maintenance_program_id: str
    strategy_id: str
    strategy_version: str
    failure_mode_id: Optional[str] = None
    failure_mode_name: Optional[str] = None
    task_source: Optional[str] = None
    pm_import_task_id: Optional[str] = None
    
    # Execution
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    findings: Optional[str] = None
    notes: Optional[str] = None
    
    # AI reasoning (if AI scheduled)
    ai_scheduled: bool = False
    ai_reasoning: Optional[str] = None
    ai_priority_reasoning: Optional[str] = None
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============= Technician Capacity =============

class TechnicianCapacity(BaseModel):
    """
    Technician availability and weekly capacity.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Technician info
    user_id: str
    name: str
    email: Optional[str] = None
    
    # Capacity
    weekly_available_hours: float = 40.0
    daily_available_hours: float = 8.0
    
    # Skills/Disciplines
    disciplines: List[str] = []
    skills: List[str] = []
    
    # Status
    is_active: bool = True
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============= Maintenance History =============

class MaintenanceHistory(BaseModel):
    """
    Historical record of completed maintenance.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Equipment
    equipment_id: str
    equipment_name: str
    equipment_tag: Optional[str] = None
    
    # Task
    task_name: str
    task_type: str
    scheduled_task_id: str
    maintenance_program_id: str
    
    # Execution
    completion_date: str
    technician_id: Optional[str] = None
    technician_name: Optional[str] = None
    actual_hours: float
    
    # Findings
    findings: Optional[str] = None
    observations: Optional[str] = None
    failure_observed: bool = False
    
    # Traceability
    strategy_id: str
    strategy_version: str
    failure_mode_id: Optional[str] = None
    
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============= Request/Response Models =============

class ApplyStrategyRequest(BaseModel):
    """Request to apply maintenance strategy to equipment"""
    equipment_ids: List[str]  # List of equipment IDs to apply strategy to
    run_async: bool = False  # Queue as background job (recommended for large batches)


class RunSchedulerRequest(BaseModel):
    """Request to run the scheduler engine"""
    equipment_type_id: Optional[str] = None  # If specified, only schedule for this type
    planning_horizon_days: Optional[int] = None  # Override default planning horizon


class CleanupOrphansRequest(BaseModel):
    """Request to remove scheduled tasks/programs with no backing strategy."""
    equipment_type_id: Optional[str] = None


class UpdateTaskStatusRequest(BaseModel):
    """Request to update a scheduled task"""
    status: Optional[TaskStatus] = None
    assigned_technician_id: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    planned_date: Optional[str] = None
    priority: Optional[TaskPriority] = None
    findings: Optional[str] = None
    notes: Optional[str] = None
    actual_hours: Optional[float] = None


class CompleteTaskRequest(BaseModel):
    """Request to complete a task"""
    actual_hours: float
    findings: Optional[str] = None
    observations: Optional[str] = None
    failure_observed: bool = False


class AIScheduleRequest(BaseModel):
    """Request for AI to generate schedule"""
    start_date: str
    end_date: str
    technician_ids: Optional[List[str]] = None  # If specified, only use these technicians


class DeferTaskRequest(BaseModel):
    """Request to defer a task"""
    new_due_date: str
    reason: str
