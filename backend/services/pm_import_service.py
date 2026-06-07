"""
PM Intelligence Import Service - Converts maintenance plans to failure mode intelligence.

Thin facade delegating to focused modules under services.pm_import/.
"""
from __future__ import annotations

import logging
from typing import Optional, List, Dict, Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.pm_import_constants import normalize_pm_import_display_status, is_pm_import_review_accepted
from services.pm_import.session import PMImportMixin as _SessionMixin
from services.pm_import.import_library import PMImportMixin as _ImportLibraryMixin
from services.pm_import.file_parsing import PMImportMixin as _FileParsingMixin
from services.pm_import.task_analysis import PMImportMixin as _TaskAnalysisMixin
from services.pm_import.equipment_matching import PMImportMixin as _EquipmentMatchingMixin
from services.pm_import.ai_review import PMImportMixin as _AIReviewMixin
from services.pm_import.failure_mode_apply import PMImportMixin as _FailureModeApplyMixin

logger = logging.getLogger(__name__)

__all__ = ["PMImportService", "normalize_pm_import_display_status", "is_pm_import_review_accepted"]


class PMImportService(
    _SessionMixin,
    _ImportLibraryMixin,
    _FileParsingMixin,
    _TaskAnalysisMixin,
    _EquipmentMatchingMixin,
    _AIReviewMixin,
    _FailureModeApplyMixin,
):
    """Service class for PM Import operations."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.sessions_collection = db["pm_import_sessions"]
        self.failure_modes_collection = db["failure_modes"]

