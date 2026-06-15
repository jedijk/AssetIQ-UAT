"""Shared RIL service factory for route modules."""
from typing import Optional, Tuple

from database import db
from services.ril_copilot_service import ReliabilityCopilotService
from services.ril_service import RILService


def ril_owner_id(user: dict) -> str:
    return user.get("owner_id") or user.get("id")


def get_ril_service(user: Optional[dict] = None) -> RILService:
    return RILService(db, tenant_user=user)


def get_copilot_services(user: Optional[dict] = None) -> Tuple[RILService, ReliabilityCopilotService]:
    ril_service = get_ril_service(user)
    return ril_service, ReliabilityCopilotService(db, ril_service)
