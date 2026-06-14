"""Data access layer — routes and services call repositories, not db collections directly."""
from repositories.action_repository import ActionRepository, delete_central_action
from repositories.base import TenantScopedRepository
from repositories.equipment_repository import EquipmentRepository
from repositories.form_repository import FormSubmissionRepository, FormTemplateRepository
from repositories.investigation_repository import InvestigationRepository, delete_investigation_cascade
from repositories.maintenance_repository import MaintenanceProgramRepository, ScheduledTaskRepository
from repositories.observation_document_repository import ObservationRepository
from repositories.production_log_repository import ProductionLogRepository
from repositories.threat_repository import ThreatRepository, delete_threat_cascade
from repositories.user_repository import UserRepository
from repositories.work_item_repository import TaskInstanceRepository, WorkItemProjectionRepository
from repositories.observation_repository import delete_observation_cascade, find_observation_by_id

__all__ = [
    "TenantScopedRepository",
    "ThreatRepository",
    "ActionRepository",
    "InvestigationRepository",
    "ObservationRepository",
    "EquipmentRepository",
    "FormTemplateRepository",
    "FormSubmissionRepository",
    "UserRepository",
    "WorkItemProjectionRepository",
    "TaskInstanceRepository",
    "ProductionLogRepository",
    "MaintenanceProgramRepository",
    "ScheduledTaskRepository",
    "find_observation_by_id",
    "delete_observation_cascade",
    "delete_threat_cascade",
    "delete_investigation_cascade",
    "delete_central_action",
]
