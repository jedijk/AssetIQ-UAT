#!/usr/bin/env python3
"""One-shot refactor: split pm_import_service, production routes, failure_modes_service."""
from __future__ import annotations

import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines(keepends=True)


def write_file(path: Path, header: str, body_lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = header + "".join(body_lines)
    path.write_text(content, encoding="utf-8")


def extract_class_methods(lines: list[str], start: int, end: int) -> list[str]:
    """Extract lines [start, end) (1-based inclusive start, exclusive end)."""
    return lines[start - 1 : end - 1]


def extract_ranges(lines: list[str], ranges: list[tuple[int, int]]) -> list[str]:
    """Extract multiple 1-based [start, end) ranges."""
    out: list[str] = []
    for start, end in ranges:
        out.extend(extract_class_methods(lines, start, end))
    return out


def mixin_header(module_doc: str, extra_imports: str = "") -> str:
    return textwrap.dedent(
        f'''\
        """{module_doc}"""
        from __future__ import annotations

        import os
        import io
        import re
        import json
        import base64
        import logging
        import uuid
        from datetime import datetime, timezone
        from typing import Optional, List, Dict, Any, Tuple

        from motor.motor_asyncio import AsyncIOMotorDatabase

        from services.pm_import_constants import (
            PM_IMPORT_DISPLAY_STATUSES,
            ACTION_TYPES,
            ACTION_TYPE_KEYWORDS,
            DISCIPLINE_KEYWORDS,
            DURATION_PATTERNS,
            FREQUENCY_PATTERNS,
            TAG_REGEX,
            TASK_CLASSIFICATION_RULES,
            TASK_TYPE_DEFAULTS,
            TASK_TYPES,
            _sanitize_for_json,
            normalize_pm_import_display_status,
        )
        {extra_imports}
        logger = logging.getLogger(__name__)


        class PMImportMixin:
            """Mixin — use only via PMImportService."""

        '''
    ).replace(
        "class PMImportMixin:\n            \"\"\"Mixin — use only via PMImportService.\"\"\"\n\n",
        "class PMImportMixin:\n    \"\"\"Mixin — use only via PMImportService.\"\"\"\n\n",
    )


def mixin_body(method_lines: list[str]) -> list[str]:
    """Methods already use one class indent (4 spaces); append as-is under mixin."""
    return method_lines


def refactor_pm_import() -> None:
    src = ROOT / "services" / "pm_import_service.py"
    lines = read_lines(src)
    pkg = ROOT / "services" / "pm_import"

    sections: list[tuple[str, str, list[tuple[int, int]]]] = [
        (
            "session.py",
            "PM Import session lifecycle and task review.",
            [(48, 219), (439, 533), (2458, 2468)],
        ),
        ("import_library.py", "PM Import library linking.", [(533, 813)]),
        ("file_parsing.py", "PM Import file parsing (Excel, PDF, image/OCR).", [(815, 1519)]),
        ("task_analysis.py", "PM Import task classification and AI enrichment.", [(1519, 2135)]),
        ("equipment_matching.py", "PM Import equipment hierarchy matching.", [(220, 438), (2135, 2458)]),
        ("ai_review.py", "PM Import AI review and recommendation helpers.", [(2471, 3370)]),
        ("failure_mode_apply.py", "PM Import failure mode apply/persist.", [(3370, 3876)]),
    ]

    for filename, doc, ranges in sections:
        method_lines = extract_ranges(lines, ranges)
        body = mixin_body(method_lines)
        header = mixin_header(doc)
        write_file(pkg / filename, header, body)

    facade = textwrap.dedent(
        '''\
        """
        PM Intelligence Import Service - Converts maintenance plans to failure mode intelligence.

        Thin facade delegating to focused modules under services.pm_import/.
        """
        from __future__ import annotations

        import logging
        from typing import Optional, List, Dict, Any

        from motor.motor_asyncio import AsyncIOMotorDatabase

        from services.pm_import_constants import normalize_pm_import_display_status
        from services.pm_import.session import PMImportMixin as _SessionMixin
        from services.pm_import.import_library import PMImportMixin as _ImportLibraryMixin
        from services.pm_import.file_parsing import PMImportMixin as _FileParsingMixin
        from services.pm_import.task_analysis import PMImportMixin as _TaskAnalysisMixin
        from services.pm_import.equipment_matching import PMImportMixin as _EquipmentMatchingMixin
        from services.pm_import.ai_review import PMImportMixin as _AIReviewMixin
        from services.pm_import.failure_mode_apply import PMImportMixin as _FailureModeApplyMixin

        logger = logging.getLogger(__name__)

        __all__ = ["PMImportService", "normalize_pm_import_display_status"]


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

        '''
    )
    write_file(ROOT / "services" / "pm_import_service.py", facade, [])
    write_file(
        pkg / "__init__.py",
        '"""PM Import service modules."""\n',
        [],
    )


def refactor_production() -> None:
    src = ROOT / "routes" / "production.py"
    lines = read_lines(src)
    pkg = ROOT / "routes" / "production"

    helpers_header = textwrap.dedent(
        '''\
        """Shared helpers for production dashboard routes."""
        from fastapi import HTTPException
        from datetime import datetime, timezone, timedelta
        from typing import Any, List, Optional, Tuple
        import logging
        import re

        from database import db

        logger = logging.getLogger(__name__)

        '''
    )
    helper_lines = extract_class_methods(lines, 24, 549)
    write_file(pkg / "helpers.py", helpers_header, helper_lines)

    route_imports = textwrap.dedent(
        '''\
        from fastapi import APIRouter, Depends, Query, HTTPException
        from datetime import datetime, timezone, timedelta
        from typing import Any, List, Optional, Tuple
        import logging
        import os
        import re
        import uuid

        from bson import ObjectId
        from database import db
        from auth import get_current_user, require_permission
        from routes.production.helpers import (
            _require_owner_or_admin,
            _require_owner,
            _serialize_datetime,
            _sort_key_dt,
            _in_range,
            _information_template_name_matches,
            _waste_reporting_template_name_matches,
            _format_waste_type_label,
            _extract_waste_reporting_fields,
            _sum_waste_reporting_kg,
            _in_any_time_window,
            _normalize_shift_keys,
            _shift_windows_for_day,
            _envelope_windows,
            _calendar_day_in_envelope,
            _naive_shift_windows,
            extract_field,
            extract_numeric,
            parse_submitted_at,
            _information_entry_display_time,
            _submission_is_information_form,
            _production_date_raw_for_big_bag,
            _unwrap_form_value,
            _submission_prefill_by_field_id,
            _information_text_from_submission,
            _parse_sample_datetime,
            _extract_date_time_field_raw,
        )

        logger = logging.getLogger(__name__)
        router = APIRouter(tags=["Production Dashboard"])

        _forms_write = require_permission("forms:write")
        _settings_write = require_permission("settings:write")


        '''
    )

    dashboard_body = extract_class_methods(lines, 550, 1701)
    write_file(
        pkg / "dashboard.py",
        '"""Production dashboard, events, and AI analysis routes."""\n' + route_imports,
        dashboard_body,
    )

    submissions_body = extract_class_methods(lines, 1702, 2343)
    write_file(
        pkg / "submissions.py",
        '"""Production submission updates, pins, and viscosity routes."""\n' + route_imports,
        submissions_body,
    )

    seed_body = extract_class_methods(lines, 2344, 2358)
    write_file(
        pkg / "seed.py",
        '"""Production seed data maintenance routes."""\n' + route_imports,
        seed_body,
    )

    # ai-insights + machine-analysis belong in dashboard
    ai_body = extract_class_methods(lines, 2360, 2737)
    with open(pkg / "dashboard.py", "a", encoding="utf-8") as f:
        f.write("".join(ai_body))

    init_py = textwrap.dedent(
        '''\
        """
        Production Dashboard API endpoints.
        Aggregates form submission data for the Daily Production Overview (Line 90).
        """
        from fastapi import APIRouter

        from routes.production.dashboard import router as dashboard_router
        from routes.production.submissions import router as submissions_router
        from routes.production.seed import router as seed_router

        router = APIRouter()
        router.include_router(dashboard_router)
        router.include_router(submissions_router)
        router.include_router(seed_router)

        __all__ = ["router"]

        '''
    )
    write_file(pkg / "__init__.py", init_py, [])


def fm_mixin_header(module_doc: str) -> str:
    return textwrap.dedent(
        f'''\
        """{module_doc}"""
        from __future__ import annotations

        from datetime import datetime, timezone
        from typing import Optional, List, Dict, Any, Tuple, Set
        import asyncio
        from bson import ObjectId
        from motor.motor_asyncio import AsyncIOMotorDatabase
        from difflib import SequenceMatcher
        import logging
        import re
        import time

        from utils.mongo_regex import escape_regex, exact_case_insensitive
        from services.ai_gateway import chat as ai_gateway_chat
        from services.failure_modes.cache import _cache, _invalidate_cache

        logger = logging.getLogger(__name__)


        class FailureModesMixin:
            """Mixin — use only via FailureModesService."""

        '''
    ).replace(
        "class FailureModesMixin:\n            \"\"\"Mixin — use only via FailureModesService.\"\"\"\n\n",
        "class FailureModesMixin:\n    \"\"\"Mixin — use only via FailureModesService.\"\"\"\n\n",
    )


def refactor_failure_modes() -> None:
    src = ROOT / "services" / "failure_modes_service.py"
    lines = read_lines(src)
    pkg = ROOT / "services" / "failure_modes"

    cache_py = textwrap.dedent(
        '''\
        """Failure modes in-memory cache."""
        _cache = {
            "all_modes": None,
            "all_modes_timestamp": 0,
            "cache_ttl": 300,
        }


        def _invalidate_cache() -> None:
            _cache["all_modes"] = None
            _cache["all_modes_timestamp"] = 0

        '''
    )
    write_file(pkg / "cache.py", cache_py, [])

    sections: list[tuple[str, str, int, int]] = [
        ("crud.py", "Failure mode CRUD and serialization.", 47, 714),
        ("library_queries.py", "Failure mode library search and similarity scanning.", 716, 1419),
        ("actions_sync.py", "Failure mode recommended actions sync and merge.", 1420, 2285),
    ]

    for filename, doc, start, end in sections:
        method_lines = extract_class_methods(lines, start, end)
        body = mixin_body(method_lines)
        header = fm_mixin_header(doc)
        write_file(pkg / filename, header, body)

    utils_tail = extract_class_methods(lines, 2286, 2319)
    facade = textwrap.dedent(
        '''\
        """
        Failure Modes Service - MongoDB-backed failure mode operations.

        Thin facade delegating to focused modules under services.failure_modes/.
        """
        from __future__ import annotations

        from typing import Optional, List, Dict, Any

        from motor.motor_asyncio import AsyncIOMotorDatabase

        from services.failure_modes.cache import _invalidate_cache
        from services.failure_modes.crud import FailureModesMixin as _CrudMixin
        from services.failure_modes.library_queries import FailureModesMixin as _LibraryQueriesMixin
        from services.failure_modes.actions_sync import FailureModesMixin as _ActionsSyncMixin

        __all__ = [
            "FailureModesService",
            "find_matching_failure_modes_db",
            "get_failure_mode_for_threat_db",
            "_invalidate_cache",
        ]


        class FailureModesService(_CrudMixin, _LibraryQueriesMixin, _ActionsSyncMixin):
            """Service class for failure mode operations using MongoDB."""

            def __init__(self, db: AsyncIOMotorDatabase):
                self.db = db
                self.collection = db["failure_modes"]
                self.versions_collection = db["failure_mode_versions"]


        '''
    ) + "".join(utils_tail)
    write_file(ROOT / "services" / "failure_modes_service.py", facade, [])
    write_file(pkg / "__init__.py", '"""Failure modes service modules."""\n', [])


def main() -> None:
    refactor_pm_import()
    refactor_production()
    refactor_failure_modes()
    print("Refactor complete.")


if __name__ == "__main__":
    main()
