"""
Route module registry. Import all routers here.
"""
from routes.auth import router as auth_router
from routes.chat import router as chat_router
from routes.threats import router as threats_router
from routes.stats import router as stats_router
from routes.failure_modes_routes import router as failure_modes_router
from routes.equipment import router as equipment_router
from routes.efms import router as efms_router
from routes.tasks import router as tasks_router
from routes.forms import router as forms_router
from routes.observations import router as observations_router
from routes.decision_engine_routes import router as decision_engine_router
from routes.investigations import router as investigations_router
from routes.actions import router as actions_router
from routes.ai_routes import router as ai_routes_router
from routes.maintenance import router as maintenance_router
from routes.analytics import router as analytics_router

all_routers = [
    auth_router,
    chat_router,
    threats_router,
    stats_router,
    failure_modes_router,
    equipment_router,
    efms_router,
    tasks_router,
    forms_router,
    observations_router,
    decision_engine_router,
    investigations_router,
    actions_router,
    ai_routes_router,
    maintenance_router,
    analytics_router,
]
