"""
User Statistics Routes - Event tracking and analytics endpoints.

Based on functional spec:
- Admin: Full access
- Manager: Read-only access limited to their team
- Operator: No access
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone, timedelta
import logging
from database import db
from auth import get_current_user
from services.user_stats_service import UserStatsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user-stats", tags=["User Statistics"])

# Initialize service
user_stats_service = UserStatsService(db)


# ============= REQUEST MODELS =============

class TrackEventRequest(BaseModel):
    session_id: str = Field(..., description="Client-generated session ID")
    module: str = Field(..., description="Module name")
    page: Optional[str] = Field(None, description="Page within module")
    action: Optional[str] = Field(None, description="Action performed")
    event_type: str = Field(default="page_view")
    duration: Optional[int] = Field(None, description="Time spent in seconds")
    device_type: Optional[str] = Field(None, description="Device type: desktop, mobile, or tablet")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class TrackBatchRequest(BaseModel):
    events: List[Dict[str, Any]]


# ============= EVENT TRACKING ENDPOINTS =============

@router.post("/track")
async def track_event(
    request: TrackEventRequest,
    current_user: dict = Depends(get_current_user)
):
    """Track a single user event."""
    
    result = await user_stats_service.track_event(
        user_id=current_user.get("user_id"),
        user_name=current_user.get("name", "Unknown"),
        user_role=current_user.get("role", "user"),
        session_id=request.session_id,
        module=request.module,
        page=request.page,
        action=request.action,
        event_type=request.event_type,
        duration=request.duration,
        device_type=request.device_type,
        metadata=request.metadata
    )
    
    return result


@router.post("/track/batch")
async def track_batch_events(
    request: TrackBatchRequest,
    current_user: dict = Depends(get_current_user)
):
    """Track multiple events at once (for offline sync)."""
    
    # Add user info to all events
    events = []
    for event in request.events:
        event["user_id"] = current_user.get("user_id")
        event["user_name"] = current_user.get("name", "Unknown")
        event["user_role"] = current_user.get("role", "user")
        events.append(event)
    
    result = await user_stats_service.track_batch_events(events)
    return result


# ============= STATISTICS ENDPOINTS =============

@router.get("/overview")
async def get_statistics_overview(
    period: str = Query("30", description="Period in days: today, 7, 30, or custom"),
    start_date: Optional[str] = Query(None, description="Custom start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="Custom end date (ISO format)"),
    role_filter: Optional[str] = Query(None, description="Filter by user role"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get comprehensive user statistics overview.
    
    Access:
    - Admin: Full access to all users
    - Manager: Limited to their team (not implemented in MVP)
    - Operator: No access (returns 403)
    """
    
    user_role = current_user.get("role", "user")
    
    # Access control
    if user_role == "operator":
        raise HTTPException(
            status_code=403,
            detail="Operators do not have access to user statistics"
        )
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    
    if start_date and end_date:
        # Custom date range
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
    elif period == "today":
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now
    elif period == "7":
        start_dt = now - timedelta(days=7)
        end_dt = now
    else:  # Default to 30 days
        start_dt = now - timedelta(days=30)
        end_dt = now
    
    # Get statistics
    stats = await user_stats_service.get_user_statistics(
        start_date=start_dt,
        end_date=end_dt,
        user_role_filter=role_filter
    )
    
    return stats


@router.get("/kpis")
async def get_kpi_summary(
    period: str = Query("30", description="Period in days"),
    current_user: dict = Depends(get_current_user)
):
    """Get just the KPI metrics for quick display."""
    
    user_role = current_user.get("role", "user")
    
    if user_role == "operator":
        raise HTTPException(
            status_code=403,
            detail="Operators do not have access to user statistics"
        )
    
    now = datetime.now(timezone.utc)
    
    if period == "today":
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "7":
        start_dt = now - timedelta(days=7)
    else:
        start_dt = now - timedelta(days=30)
    
    match_stage = {
        "timestamp": {"$gte": start_dt, "$lte": now}
    }
    
    kpis = await user_stats_service._get_kpi_metrics(match_stage)
    
    # Get module usage for most/least used
    module_usage = await user_stats_service._get_module_usage(match_stage)
    
    return {
        **kpis,
        "most_used_module": module_usage[0]["module"] if module_usage else None,
        "least_used_module": module_usage[-1]["module"] if module_usage else None,
        "period": period
    }


@router.get("/modules")
async def get_module_usage(
    period: str = Query("30"),
    current_user: dict = Depends(get_current_user)
):
    """Get module usage breakdown."""
    
    user_role = current_user.get("role", "user")
    
    if user_role == "operator":
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=int(period) if period.isdigit() else 30)
    
    match_stage = {
        "timestamp": {"$gte": start_dt, "$lte": now}
    }
    
    return await user_stats_service._get_module_usage(match_stage)


@router.get("/users")
async def get_user_activity(
    period: str = Query("30"),
    role_filter: Optional[str] = Query(None),
    activity_filter: Optional[str] = Query(None, description="active, low_activity, inactive"),
    current_user: dict = Depends(get_current_user)
):
    """Get user activity breakdown."""
    
    user_role = current_user.get("role", "user")
    
    if user_role == "operator":
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=int(period) if period.isdigit() else 30)
    
    match_stage = {
        "timestamp": {"$gte": start_dt, "$lte": now}
    }
    
    if role_filter:
        match_stage["user_role"] = role_filter
    
    users = await user_stats_service._get_user_activity(match_stage)
    
    # Apply activity filter if specified
    if activity_filter:
        if activity_filter == "active":
            # More than 10 sessions or 20 actions
            users = [u for u in users if u["sessions"] > 10 or u["actions"] > 20]
        elif activity_filter == "low_activity":
            # Less than 5 sessions and less than 10 actions
            users = [u for u in users if u["sessions"] < 5 and u["actions"] < 10]
        elif activity_filter == "inactive":
            # Last active more than 7 days ago
            cutoff = (now - timedelta(days=7)).isoformat()
            users = [u for u in users if u.get("last_active") and u["last_active"] < cutoff]
    
    return users


@router.get("/actions")
async def get_action_usage(
    period: str = Query("30"),
    current_user: dict = Depends(get_current_user)
):
    """Get action/feature usage statistics."""
    
    user_role = current_user.get("role", "user")
    
    if user_role == "operator":
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=int(period) if period.isdigit() else 30)
    
    match_stage = {
        "timestamp": {"$gte": start_dt, "$lte": now}
    }
    
    return await user_stats_service._get_action_usage(match_stage)


@router.get("/devices")
async def get_device_usage(
    period: str = Query("30"),
    current_user: dict = Depends(get_current_user)
):
    """Get device type usage statistics (desktop vs mobile vs tablet)."""
    
    user_role = current_user.get("role", "user")
    
    if user_role == "operator":
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=int(period) if period.isdigit() else 30)
    
    match_stage = {
        "timestamp": {"$gte": start_dt, "$lte": now}
    }
    
    return await user_stats_service._get_device_usage(match_stage)


@router.get("/trends")
async def get_usage_trends(
    period: str = Query("30"),
    current_user: dict = Depends(get_current_user)
):
    """Get daily usage trends for charts."""
    
    user_role = current_user.get("role", "user")
    
    if user_role == "operator":
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(days=int(period) if period.isdigit() else 30)
    
    match_stage = {
        "timestamp": {"$gte": start_dt, "$lte": now}
    }
    
    return await user_stats_service._get_daily_trends(match_stage, start_dt, now)


@router.get("/sessions/active")
async def get_active_sessions(
    current_user: dict = Depends(get_current_user)
):
    """Get currently active sessions."""
    
    user_role = current_user.get("role", "user")
    
    if user_role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return await user_stats_service.get_active_sessions()


# ============= ADMIN ENDPOINTS =============

@router.post("/aggregate/{date}")
async def trigger_daily_aggregation(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Manually trigger daily stats aggregation.
    Admin only.
    """
    
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        date_dt = datetime.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format (use YYYY-MM-DD)")
    
    result = await user_stats_service.aggregate_daily_stats(date_dt)
    
    return {
        "success": True,
        "message": f"Aggregated stats for {date}",
        "stats": result
    }
