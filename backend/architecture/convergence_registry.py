"""
Wave 3 — Architecture convergence registry.

Single source of truth for GREEN / YELLOW / RED classification and CI allowlists.
"""
from __future__ import annotations

from enum import Enum
from typing import FrozenSet, Tuple

BACKEND_ROOT = "backend"


class ConvergenceStatus(str, Enum):
    GREEN = "green"   # Route → Service → Repository; events via outbox
    YELLOW = "yellow"  # Partial (service exists but route still touches db / mixed patterns)
    RED = "red"       # Legacy: route db access, inline side effects, live aggregations


# Routes that follow target architecture (no direct db.* in route module).
GREEN_ROUTES: FrozenSet[str] = frozenset({
    "routes/observations.py",
    "routes/actions.py",
    "routes/stats.py",
    "routes/executive_dashboard.py",
    "routes/threats.py",
    "routes/investigations.py",
    "routes/my_tasks.py",
    "routes/production/dashboard.py",
    "routes/ril/dashboard.py",
    "routes/observation_workspace.py",
    "routes/forms.py",
    "routes/production_logs.py",
    "routes/production/submissions.py",
    "routes/equipment/equipment_nodes.py",
    "routes/equipment/equipment_history.py",
    "routes/equipment/equipment_types.py",
    "routes/equipment/equipment_utils.py",
    "routes/equipment/equipment_files.py",
    "routes/equipment/equipment_criticality.py",
    "routes/equipment/equipment_operations.py",
    "routes/equipment/equipment_import.py",
    "routes/insights.py",
    "routes/ai_routes.py",
    "routes/ai_extract.py",
    "routes/ai_fm_suggestions.py",
    "routes/maintenance_scheduler/dashboard.py",
    "routes/maintenance_scheduler/timeline.py",
    "routes/maintenance_scheduler/tasks.py",
    "routes/maintenance_scheduler/technicians.py",
    "routes/maintenance_scheduler/programs.py",
    "routes/maintenance_scheduler/ai_planner.py",
})

# Routes mid-migration (service layer present; db import or logic remains).
YELLOW_ROUTES: FrozenSet[str] = frozenset({
})

# All route modules that currently import ``database.db`` (grandfathered until migrated).
# CI fails if a NEW route file imports db without being listed here.
ROUTE_DB_IMPORT_ALLOWLIST: FrozenSet[str] = frozenset({
    "routes/admin.py",
    "routes/analytics.py",
    "routes/audit_log.py",
    "routes/auth.py",
    "routes/auth_oidc.py",
    "routes/chat.py",
    "routes/decision_engine_routes.py",
    "routes/definitions.py",
    "routes/disciplines.py",
    "routes/efms.py",
    "routes/failure_modes_routes.py",
    "routes/gdpr.py",
    "routes/granulometry.py",
    "routes/intelligence_map.py",
    "routes/labels.py",
    "routes/maintenance.py",
    "routes/maintenance_program.py",
    "routes/maintenance_strategy_v2/propagation.py",
    "routes/maintenance_strategy_v2/routes.py",
    "routes/maintenance_strategy_v2/strategy_helpers.py",
    "routes/permissions.py",
    "routes/pm_import.py",
    "routes/process_import.py",
    "routes/production/seed.py",
    "routes/qr_codes.py",
    "routes/reports.py",
    "routes/ril/alerts.py",
    "routes/ril/cases.py",
    "routes/ril/copilot.py",
    "routes/ril/correlations.py",
    "routes/ril/observations.py",
    "routes/ril/predictions.py",
    "routes/ril/readings.py",
    "routes/risk_settings.py",
    "routes/system.py",
    "routes/task_generation_admin.py",
    "routes/tasks.py",
    "routes/translations.py",
    "routes/user_stats.py",
    "routes/users.py",
})

# Repository coverage by primary collection.
REPOSITORY_COLLECTIONS: Tuple[str, ...] = (
    "threats",
    "observations",
    "central_actions",
    "investigations",
    "equipment_nodes",
    "form_templates",
    "form_submissions",
    "users",
    "work_item_projections",
    "production_logs",
    "maintenance_programs_v2",
    "scheduled_tasks",
    "task_instances",
)

# Frontend files allowed to use raw fetch (media blobs, offline, chunk recovery).
FRONTEND_RAW_FETCH_ALLOWLIST: FrozenSet[str] = frozenset({
    "src/lib/chunkRecovery.js",
    "src/lib/offlineQueue.js",
    "src/services/offlineStorage.js",
    "src/hooks/useOfflineSync.js",
    "src/lib/apiConfig.js",
    "src/lib/documentFetch.js",
    "src/components/forms/PhotoDataCaptureField.jsx",
})

MAX_ROUTE_LOC = 300
MAX_FRONTEND_PAGE_LOC = 500
MAX_FRONTEND_COMPONENT_LOC = 300
