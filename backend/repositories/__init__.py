"""Data access layer — routes and services call repositories, not db collections directly."""
from repositories.action_repository import ActionRepository, delete_central_action
from repositories.base import TenantScopedRepository
from repositories.investigation_repository import InvestigationRepository, delete_investigation_cascade
from repositories.observation_repository import delete_observation_cascade, find_observation_by_id
from repositories.threat_repository import ThreatRepository, delete_threat_cascade

__all__ = [
    "TenantScopedRepository",
    "ThreatRepository",
    "ActionRepository",
    "InvestigationRepository",
    "find_observation_by_id",
    "delete_observation_cascade",
    "delete_threat_cascade",
    "delete_investigation_cascade",
    "delete_central_action",
]
