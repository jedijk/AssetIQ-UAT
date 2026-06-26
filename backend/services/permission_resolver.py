"""
Resolve API permission strings (e.g. ``threats:read``) against UI feature keys
stored in ``db.permissions``, with fallback to static ``rbac_service.ROLES``.
"""
from __future__ import annotations

import logging
import time
from typing import Dict, Optional, Tuple

from database import db
from services.rbac_service import RBACService, ROLE_ALIASES, ROLES

logger = logging.getLogger(__name__)

# API category -> UI permissions matrix feature key
API_TO_UI_FEATURE: Dict[str, str] = {
    "threats": "observations",
    "observations": "observations",
    "actions": "actions",
    "tasks": "tasks",
    "scheduler": "scheduler",
    "forms": "forms",
    "equipment": "equipment",
    "library": "library",
    "spareiq": "spareiq",
    "investigations": "investigations",
    "users": "users",
    "settings": "settings",
    "analytics": "statistics",
    "decision_engine": "reliability_intelligence",
    "vmb": "visual_boards",
}

# Permissions with no UI matrix row — always use static ROLES fallback.
API_ONLY_PERMISSIONS = frozenset({
    "installations:all",
    "analytics:export",
    "vmb:publish",
    "vmb:admin",
    "tenant_management:read",
    "tenant_management:write",
    "tenant_management:admin",
})

_rbac = RBACService.__new__(RBACService)
_cache: Dict[str, Tuple[float, Dict]] = {}
_CACHE_TTL_SECONDS = 60


def _parse_permission(permission: str) -> Tuple[Optional[str], Optional[str]]:
    if ":" not in permission:
        return None, None
    category, action = permission.split(":", 1)
    return category, action


def invalidate_permissions_cache() -> None:
    """Drop cached UI permission documents (call after matrix updates)."""
    _cache.clear()


async def _load_ui_permissions() -> Dict:
    now = time.time()
    cached = _cache.get("role_permissions")
    if cached and now < cached[0]:
        return cached[1]

    from services.permissions_defaults import (
        DEFAULT_PERMISSIONS,
        backfill_permissions,
    )

    stored = await db.permissions.find_one({"type": "role_permissions"})
    if stored:
        permissions = backfill_permissions(stored.get("permissions", DEFAULT_PERMISSIONS))
    else:
        permissions = DEFAULT_PERMISSIONS.copy()

    _cache["role_permissions"] = (now + _CACHE_TTL_SECONDS, permissions)
    return permissions


def _roles_fallback(role: str, permission: str) -> bool:
    resolved = ROLE_ALIASES.get(role, role)
    return _rbac.has_permission(resolved, permission)


async def check_api_permission(role: str, permission: str) -> bool:
    """
    Return True when ``role`` may use the API permission string.

    UI-mapped permissions consult ``db.permissions``; API-only permissions and
    unmapped categories fall back to ``rbac_service.ROLES``.
    """
    if role == "owner":
        return True

    if permission in API_ONLY_PERMISSIONS:
        return _roles_fallback(role, permission)

    category, action = _parse_permission(permission)
    if not category or not action:
        return _roles_fallback(role, permission)

    ui_feature = API_TO_UI_FEATURE.get(category)
    if not ui_feature:
        return _roles_fallback(role, permission)

    if action not in ("read", "write", "delete"):
        return _roles_fallback(role, permission)

    resolved_role = ROLE_ALIASES.get(role, role)
    ui_perms = await _load_ui_permissions()
    role_perms = ui_perms.get(resolved_role)
    if role_perms is None and resolved_role not in ROLES:
        # Custom roles: fall back to viewer defaults when missing from matrix.
        from services.permissions_defaults import DEFAULT_PERMISSIONS

        role_perms = ui_perms.get(resolved_role) or DEFAULT_PERMISSIONS.get("viewer", {})

    if role_perms is None:
        return _roles_fallback(role, permission)

    feature_perms = role_perms.get(ui_feature, {})
    if not isinstance(feature_perms, dict):
        feature_perms = {}
    if feature_perms.get(action, False):
        return True

    return _roles_fallback(role, permission)
