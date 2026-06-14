"""Data access layer — routes and services call repositories, not db collections directly."""
from repositories.base import TenantScopedRepository
from repositories.observation_repository import delete_observation_cascade, find_observation_by_id
from repositories.threat_repository import ThreatRepository

__all__ = [
    "TenantScopedRepository",
    "ThreatRepository",
    "find_observation_by_id",
    "delete_observation_cascade",
]
