"""
Maintenance Scheduler & Planning Engine package.

Aggregates sub-routers (programs, scheduler, tasks, timeline, dashboard,
technicians, ai_planner) into a single router exposed at
`/api/maintenance-scheduler`.
"""
from fastapi import APIRouter

from . import programs, scheduler, tasks, timeline, dashboard, technicians, ai_planner

router = APIRouter(prefix="/maintenance-scheduler", tags=["Maintenance Scheduler"])

# Each submodule defines its own APIRouter without prefix; include them all.
router.include_router(programs.router)
router.include_router(scheduler.router)
router.include_router(tasks.router)
router.include_router(timeline.router)
router.include_router(dashboard.router)
router.include_router(technicians.router)
router.include_router(ai_planner.router)

__all__ = ["router"]
