"""Shared RBAC dependencies for RIL routes."""
from auth import require_permission

_ril_read = require_permission("decision_engine:read")
_ril_write = require_permission("decision_engine:write")
