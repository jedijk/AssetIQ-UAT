"""
Routes package for ReliabilityOS API
"""
from .auth import router as auth_router
from .threats import router as threats_router
from .equipment import router as equipment_router
from .investigations import router as investigations_router
from .actions import router as actions_router
from .stats import router as stats_router

__all__ = [
    "auth_router",
    "threats_router", 
    "equipment_router",
    "investigations_router",
    "actions_router",
    "stats_router"
]
