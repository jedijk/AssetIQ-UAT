"""
Bounded context dependency rules — enforceable import boundaries.

Used by tests/test_architecture_boundaries.py and CI architecture checks.
"""
from __future__ import annotations

from typing import Dict, FrozenSet, List, Tuple

# services/* must never import routes/*
FORBIDDEN_SERVICE_IMPORT_PREFIXES = (
    "routes.",
)

# Known layer violations being migrated (empty when clean).
ALLOWLIST_SERVICE_ROUTE_IMPORTS: FrozenSet[Tuple[str, str]] = frozenset()

# Cross-domain service imports that violate bounded contexts.
FORBIDDEN_CROSS_DOMAIN_IMPORTS: Dict[str, FrozenSet[str]] = {
    # Threats domain must not write equipment collections directly.
    "services/threat_score_service.py": frozenset({"services/maintenance_program_service.py"}),
    # Investigations must use action services, not central_actions db directly in routes.
}

# Modules that may only be imported by platform / worker layers for side-effectful work.
WORKER_ONLY_MODULES = frozenset({
    "workers.event_outbox_processor",
    "workers.graph_projection_handler",
})

# Route → route imports outside package boundaries (discouraged).
ALLOWED_ROUTE_CROSS_IMPORTS: FrozenSet[Tuple[str, str]] = frozenset({
    ("routes/permissions.py", "routes/auth.py"),
    ("routes/users.py", "routes/auth.py"),
})


def is_forbidden_service_import(module_path: str, imported: str) -> bool:
    normalized = module_path.replace("\\", "/")
    if not normalized.startswith("services/"):
        return False
    for prefix in FORBIDDEN_SERVICE_IMPORT_PREFIXES:
        if imported.startswith(prefix):
            pair = (normalized, imported)
            if pair in ALLOWLIST_SERVICE_ROUTE_IMPORTS:
                return False
            return True
    return False
