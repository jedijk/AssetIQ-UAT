"""
Stats routes — orchestration only (Wave 4 convergence).
"""
from fastapi import APIRouter, Depends
from typing import Optional
import logging

from auth import require_permission
from services.stats_service import get_reliability_scores, get_threat_summary_stats

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Stats"])

_tasks_read = require_permission("tasks:read")
_observations_read = require_permission("observations:read")


@router.get("/stats")
async def get_stats(current_user: dict = Depends(_tasks_read)):
    return await get_threat_summary_stats(current_user)


@router.get("/reliability-scores")
async def get_reliability_scores_route(
    node_id: Optional[str] = None,
    level: Optional[str] = None,
    current_user: dict = Depends(_observations_read),
):
    """
    Calculate reliability performance scores across 6 dimensions:
    criticality, incidents, investigations, maintenance, reactions, threats.
    """
    return await get_reliability_scores(current_user, node_id=node_id, level=level)


@router.get("/")
async def root():
    return {"message": "ThreatBase API", "version": "3.0.0"}
