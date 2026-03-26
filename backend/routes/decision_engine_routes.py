"""
Decision Engine routes.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from database import db, decision_engine
from auth import get_current_user


class RuleUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    auto_execute: Optional[bool] = None
    config: Optional[dict] = None


router = APIRouter(tags=["Decision Engine"])

@router.get("/decision-engine/dashboard")
async def get_decision_dashboard(
    current_user: dict = Depends(get_current_user)
):
    """Get decision engine dashboard stats."""
    return await decision_engine.get_decision_dashboard()

@router.get("/decision-engine/rules")
async def get_decision_rules(
    enabled_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get all decision rules."""
    rules = await decision_engine.get_rules(enabled_only=enabled_only)
    return {"rules": rules}

@router.patch("/decision-engine/rules/{rule_id}")
async def update_decision_rule(
    rule_id: str,
    data: RuleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a decision rule configuration."""
    result = await decision_engine.update_rule(rule_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found")
    return result

@router.post("/decision-engine/evaluate")
async def evaluate_all_rules(
    current_user: dict = Depends(get_current_user)
):
    """Evaluate all enabled rules and generate suggestions."""
    return await decision_engine.evaluate_all_rules(current_user["id"])

@router.get("/decision-engine/suggestions")
async def get_decision_suggestions(
    status: Optional[str] = None,
    rule_id: Optional[str] = None,
    priority: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get decision suggestions."""
    return await decision_engine.get_suggestions(
        status=status,
        rule_id=rule_id,
        priority=priority,
        skip=skip,
        limit=limit
    )

@router.post("/decision-engine/suggestions/{suggestion_id}/approve")
async def approve_suggestion(
    suggestion_id: str,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Approve a decision suggestion."""
    result = await decision_engine.approve_suggestion(
        suggestion_id,
        approved_by=current_user["id"],
        notes=notes
    )
    if not result:
        raise HTTPException(status_code=404, detail="Suggestion not found or already processed")
    return result

@router.post("/decision-engine/suggestions/{suggestion_id}/reject")
async def reject_suggestion(
    suggestion_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Reject a decision suggestion."""
    result = await decision_engine.reject_suggestion(
        suggestion_id,
        rejected_by=current_user["id"],
        reason=reason
    )
    if not result:
        raise HTTPException(status_code=404, detail="Suggestion not found or already processed")
    return result

@router.post("/decision-engine/suggestions/{suggestion_id}/execute")
async def execute_suggestion(
    suggestion_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Execute an approved suggestion."""
    try:
        return await decision_engine.execute_suggestion(
            suggestion_id,
            executed_by=current_user["id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============= UNSTRUCTURED ITEMS ENDPOINTS =============


