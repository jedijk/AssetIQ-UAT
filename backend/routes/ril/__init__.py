"""
Reliability Intelligence Layer (RIL) API Routes
Main router module that combines all RIL sub-routers.
"""

from fastapi import APIRouter

from routes.ril.observations import router as observations_router
from routes.ril.readings import router as readings_router
from routes.ril.alerts import router as alerts_router
from routes.ril.correlations import router as correlations_router
from routes.ril.cases import router as cases_router
from routes.ril.predictions import router as predictions_router
from routes.ril.copilot import router as copilot_router
from routes.ril.dashboard import router as dashboard_router

router = APIRouter(prefix="/ril", tags=["Reliability Intelligence Layer"])

# Include all sub-routers
router.include_router(observations_router)
router.include_router(readings_router)
router.include_router(alerts_router)
router.include_router(correlations_router)
router.include_router(cases_router)
router.include_router(predictions_router)
router.include_router(copilot_router)
router.include_router(dashboard_router)
