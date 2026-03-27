"""
User Statistics Models - Event tracking and aggregation models.

Based on the functional spec:
- Event tracking with user_id, session_id, timestamp, module, page, action, duration
- Session logic (15-min inactivity timeout)
- Daily aggregation for performance
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ModuleType(str, Enum):
    """Modules in the application"""
    DASHBOARD = "Dashboard"
    OBSERVATIONS = "Observations"
    MY_TASKS = "My Tasks"
    CAUSAL_ENGINE = "Causal Engine"
    ACTIONS = "Actions"
    LIBRARY = "Library"
    EQUIPMENT_MANAGER = "Equipment Manager"
    TASK_PLANNER = "Task Planner"
    FORMS = "Forms"
    DECISION_ENGINE = "Decision Engine"
    SETTINGS = "Settings"
    USER_STATISTICS = "User Statistics"


class EventType(str, Enum):
    """Types of trackable events"""
    PAGE_VIEW = "page_view"
    MODULE_OPEN = "module_open"
    ACTION_EXECUTED = "action_executed"
    FORM_SUBMITTED = "form_submitted"
    TASK_COMPLETED = "task_completed"
    ERROR_OCCURRED = "error_occurred"
    SESSION_START = "session_start"
    SESSION_END = "session_end"


class TrackEventRequest(BaseModel):
    """Request model for tracking an event"""
    session_id: str = Field(..., description="Client-generated session ID")
    module: str = Field(..., description="Module name (e.g., Dashboard, Tasks)")
    page: Optional[str] = Field(None, description="Specific page within module")
    action: Optional[str] = Field(None, description="Action performed (e.g., Create Task)")
    event_type: str = Field(default="page_view", description="Type of event")
    duration: Optional[int] = Field(None, description="Time spent in seconds")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional event data")


class UserEvent(BaseModel):
    """User event document structure"""
    user_id: str
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    session_id: str
    timestamp: datetime
    module: str
    page: Optional[str] = None
    action: Optional[str] = None
    event_type: str = "page_view"
    duration: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class DailyStats(BaseModel):
    """Pre-aggregated daily statistics"""
    date: datetime
    active_users: int
    total_sessions: int
    total_views: int
    total_actions: int
    avg_session_duration: float
    module_views: Dict[str, int]
    action_counts: Dict[str, int]
    user_activity: List[Dict[str, Any]]


class ModuleUsageItem(BaseModel):
    """Module usage data for table display"""
    module: str
    views: int
    unique_users: int
    percentage: float
    avg_time_spent: float


class UserActivityItem(BaseModel):
    """User activity data for table display"""
    user_id: str
    user_name: str
    role: str
    last_active: datetime
    sessions: int
    actions: int
    most_used_module: str


class ActionUsageItem(BaseModel):
    """Action usage data for table display"""
    action_name: str
    total_count: int
    unique_users: int


class UserStatsResponse(BaseModel):
    """Response model for user statistics overview"""
    period_start: datetime
    period_end: datetime
    
    # KPI Summary
    active_users: int
    total_sessions: int
    total_views: int
    avg_session_duration: float
    most_used_module: Optional[str]
    least_used_module: Optional[str]
    
    # Module usage
    module_usage: List[ModuleUsageItem]
    
    # User activity
    user_activity: List[UserActivityItem]
    
    # Feature usage (actions)
    action_usage: List[ActionUsageItem]
    
    # Trends
    daily_active_users: List[Dict[str, Any]]
    daily_views: List[Dict[str, Any]]
