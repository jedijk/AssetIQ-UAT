"""Default UI permission matrix and backfill helpers (shared by routes and services)."""
from typing import Dict

# Default permissions for each role
DEFAULT_PERMISSIONS = {
    "owner": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": True},
        "tasks": {"read": True, "write": True, "delete": True},
        "scheduler": {"read": True, "write": True, "delete": True},
        "forms": {"read": True, "write": True, "delete": True},
        "equipment": {"read": True, "write": True, "delete": True},
        "library": {"read": True, "write": True, "delete": True},
        "library_ai_tools": {"read": True, "write": True, "delete": True},
        "reliability_intelligence": {"read": True, "write": True, "delete": True},
        "dashboard_operational": {"read": True, "write": True, "delete": True},
        "supervisor_command_center": {"read": True, "write": True, "delete": True},
        "dashboard_production": {"read": True, "write": True, "delete": True},
        "dashboard_executive": {"read": True, "write": True, "delete": True},
        "dashboard_builder": {"read": True, "write": True, "delete": True},
        "chat": {"read": True, "write": True, "delete": True},
        "statistics": {"read": True, "write": True, "delete": True},
        "feedback": {"read": True, "write": True, "delete": True},
        "users": {"read": True, "write": True, "delete": True},
        "settings": {"read": True, "write": True, "delete": True},
    },
    "admin": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": True},
        "tasks": {"read": True, "write": True, "delete": True},
        "scheduler": {"read": True, "write": True, "delete": True},
        "forms": {"read": True, "write": True, "delete": True},
        "equipment": {"read": True, "write": True, "delete": False},
        "library": {"read": True, "write": True, "delete": True},
        "library_ai_tools": {"read": True, "write": True, "delete": False},
        "reliability_intelligence": {"read": True, "write": True, "delete": False},
        "dashboard_operational": {"read": True, "write": False, "delete": False},
        "supervisor_command_center": {"read": True, "write": False, "delete": False},
        "dashboard_production": {"read": True, "write": False, "delete": False},
        "dashboard_executive": {"read": False, "write": False, "delete": False},
        "dashboard_builder": {"read": False, "write": False, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": True, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": True},
        "users": {"read": True, "write": True, "delete": False},
        "settings": {"read": True, "write": False, "delete": False},
    },
    "reliability_engineer": {
        "observations": {"read": True, "write": True, "delete": True},
        "investigations": {"read": True, "write": True, "delete": True},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "scheduler": {"read": True, "write": True, "delete": False},
        "forms": {"read": True, "write": True, "delete": False},
        "equipment": {"read": True, "write": True, "delete": False},
        "library": {"read": True, "write": True, "delete": False},
        "library_ai_tools": {"read": False, "write": False, "delete": False},
        "reliability_intelligence": {"read": True, "write": True, "delete": False},
        "dashboard_operational": {"read": True, "write": False, "delete": False},
        "supervisor_command_center": {"read": True, "write": False, "delete": False},
        "dashboard_production": {"read": True, "write": False, "delete": False},
        "dashboard_executive": {"read": False, "write": False, "delete": False},
        "dashboard_builder": {"read": False, "write": False, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": True, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": True, "write": False, "delete": False},
        "settings": {"read": True, "write": False, "delete": False},
    },
    "maintenance": {
        "observations": {"read": True, "write": True, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "scheduler": {"read": True, "write": False, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "library_ai_tools": {"read": False, "write": False, "delete": False},
        "reliability_intelligence": {"read": True, "write": False, "delete": False},
        "dashboard_operational": {"read": True, "write": False, "delete": False},
        "supervisor_command_center": {"read": True, "write": False, "delete": False},
        "dashboard_production": {"read": True, "write": False, "delete": False},
        "dashboard_executive": {"read": False, "write": False, "delete": False},
        "dashboard_builder": {"read": False, "write": False, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": False, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
    "operations": {
        "observations": {"read": True, "write": True, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": True, "delete": False},
        "tasks": {"read": True, "write": True, "delete": False},
        "scheduler": {"read": True, "write": False, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "library_ai_tools": {"read": False, "write": False, "delete": False},
        "reliability_intelligence": {"read": True, "write": False, "delete": False},
        "dashboard_operational": {"read": True, "write": False, "delete": False},
        "supervisor_command_center": {"read": True, "write": False, "delete": False},
        "dashboard_production": {"read": True, "write": False, "delete": False},
        "dashboard_executive": {"read": False, "write": False, "delete": False},
        "dashboard_builder": {"read": False, "write": False, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": False, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
    "viewer": {
        "observations": {"read": True, "write": False, "delete": False},
        "investigations": {"read": True, "write": False, "delete": False},
        "actions": {"read": True, "write": False, "delete": False},
        "tasks": {"read": True, "write": False, "delete": False},
        "scheduler": {"read": True, "write": False, "delete": False},
        "forms": {"read": True, "write": False, "delete": False},
        "equipment": {"read": True, "write": False, "delete": False},
        "library": {"read": True, "write": False, "delete": False},
        "library_ai_tools": {"read": False, "write": False, "delete": False},
        "reliability_intelligence": {"read": True, "write": False, "delete": False},
        "dashboard_operational": {"read": True, "write": False, "delete": False},
        "supervisor_command_center": {"read": True, "write": False, "delete": False},
        "dashboard_production": {"read": True, "write": False, "delete": False},
        "dashboard_executive": {"read": False, "write": False, "delete": False},
        "dashboard_builder": {"read": False, "write": False, "delete": False},
        "chat": {"read": True, "write": True, "delete": False},
        "statistics": {"read": False, "write": False, "delete": False},
        "feedback": {"read": True, "write": True, "delete": False},
        "users": {"read": False, "write": False, "delete": False},
        "settings": {"read": False, "write": False, "delete": False},
    },
}

# Legacy UI role aliases — keep in sync with rbac_service.ROLE_ALIASES
DEFAULT_PERMISSIONS["manager"] = DEFAULT_PERMISSIONS["admin"]
DEFAULT_PERMISSIONS["operator"] = DEFAULT_PERMISSIONS["operations"]

# Feature labels for UI — keep names aligned with nav / page titles in the frontend.
FEATURES = {
    "observations": {
        "name": "Observations",
        "description": "Observations page and threat management"
    },
    "investigations": {
        "name": "Causal Engine",
        "description": "Causal Engine investigations and root-cause analysis"
    },
    "actions": {
        "name": "Actions",
        "description": "Actions page and corrective/preventive work"
    },
    "tasks": {
        "name": "My Tasks",
        "description": "My Tasks execution queue and work items"
    },
    "dashboard_operational": {
        "name": "Ops Dashboard",
        "description": "Operational risk overview dashboard tab"
    },
    "supervisor_command_center": {
        "name": "Supervisor Command Center",
        "description": "Daily shift-start screen with prioritized operational queue and drill-down links"
    },
    "dashboard_production": {
        "name": "Production Dashboard",
        "description": "Production metrics and monitoring dashboard tab"
    },
    "dashboard_executive": {
        "name": "Executive Dashboard",
        "description": "Executive summary and KPI dashboard tab"
    },
    "dashboard_builder": {
        "name": "Dashboard Builder",
        "description": "Smart dashboard builder tab for custom layouts"
    },
    "scheduler": {
        "name": "Execution",
        "description": "Execution planner and task scheduling"
    },
    "forms": {
        "name": "Reports",
        "description": "Reports and form submissions"
    },
    "equipment": {
        "name": "Equipment Manager",
        "description": "Equipment Manager and definitions"
    },
    "library": {
        "name": "Strategy",
        "description": "Strategy library for failure modes and maintenance programs"
    },
    "library_ai_tools": {
        "name": "Strategy — AI Tools",
        "description": "AI tools inside Strategy: suggest failure modes, bulk improve, review disciplines, find similar, suggest equipment types, and the not-improved filter"
    },
    "reliability_intelligence": {
        "name": "Reliability Intelligence",
        "description": "Reliability Intelligence dashboard tab and case management"
    },
    "chat": {
        "name": "AI Chat",
        "description": "AI assistant sidebar for reliability questions"
    },
    "statistics": {
        "name": "User Statistics",
        "description": "User Statistics settings page"
    },
    "feedback": {
        "name": "Feedback",
        "description": "Feedback page and suggestions"
    },
    "users": {
        "name": "User Management",
        "description": "User Management settings page"
    },
    "settings": {
        "name": "Settings",
        "description": "Settings pages and system configuration"
    },
}


def backfill_permissions(stored_perms: Dict) -> Dict:
    """Ensure stored role permissions include every feature key in FEATURES."""
    if not isinstance(stored_perms, dict):
        return DEFAULT_PERMISSIONS.copy()
    result: Dict = {}
    for role_name, role_perms in stored_perms.items():
        merged = dict(role_perms or {})
        if "insights" in merged and "reliability_intelligence" not in merged:
            merged["reliability_intelligence"] = dict(merged["insights"])
        merged.pop("insights", None)
        if "dashboard_production" not in merged and "tasks" in merged:
            tasks_read = bool(merged["tasks"].get("read"))
            merged["dashboard_production"] = {
                "read": tasks_read,
                "write": bool(merged["tasks"].get("write")) and tasks_read,
                "delete": False,
            }
        if "supervisor_command_center" not in merged and "dashboard_operational" in merged:
            merged["supervisor_command_center"] = dict(merged["dashboard_operational"])
        defaults_for_role = DEFAULT_PERMISSIONS.get(role_name) or DEFAULT_PERMISSIONS["viewer"]
        for feature_key in FEATURES.keys():
            if feature_key not in merged:
                merged[feature_key] = dict(defaults_for_role.get(feature_key, {"read": False, "write": False, "delete": False}))
        result[role_name] = merged
    return result


# Back-compat alias for routes layer
_backfill_permissions = backfill_permissions
