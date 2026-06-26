"""
Threat service — Wave 5/6 convergence.

Installation-scoped reads and CRUD via ThreatRepository.
"""
from __future__ import annotations

from services.threat_crud import (
    delete_threat,
    get_threat_detail,
    list_threats,
    list_top_threats,
    recalculate_all_threat_scores,
    update_threat,
)
from services.threat_helpers import (
    _find_threat_scoped,
    assert_threat_installation_scope,
    get_failure_mode_by_name_or_id,
    normalize_threat_list_items,
)
from services.threat_links import (
    improve_threat_description,
    link_threat_to_equipment,
    link_threat_to_failure_mode,
)
from services.threat_service_investigation import create_investigation_from_threat, get_threat_timeline

__all__ = [
    "_find_threat_scoped",
    "assert_threat_installation_scope",
    "create_investigation_from_threat",
    "delete_threat",
    "get_failure_mode_by_name_or_id",
    "get_threat_detail",
    "get_threat_timeline",
    "improve_threat_description",
    "link_threat_to_equipment",
    "link_threat_to_failure_mode",
    "list_threats",
    "list_top_threats",
    "normalize_threat_list_items",
    "recalculate_all_threat_scores",
    "update_threat",
]
