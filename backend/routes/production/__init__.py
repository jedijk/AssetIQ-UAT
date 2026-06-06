"""
Production Dashboard API endpoints.
Aggregates form submission data for the Daily Production Overview (Line 90).
"""
from fastapi import APIRouter

from routes.production.dashboard import router as dashboard_router
from routes.production.submissions import router as submissions_router
from routes.production.seed import router as seed_router

router = APIRouter()
router.include_router(dashboard_router)
router.include_router(submissions_router)
router.include_router(seed_router)

__all__ = ["router"]

