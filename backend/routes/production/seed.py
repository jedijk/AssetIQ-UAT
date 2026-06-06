"""Production seed data maintenance routes."""
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


@router.delete("/production/seed-data")
async def clear_seed_data(
    current_user: dict = Depends(_settings_write),
):
    """Clear all seeded production sample data. Use this to remove demo data."""
    # Delete seeded form submissions
    result_subs = await db.form_submissions.delete_many({"_seeded": True})
    # Delete seeded production events
    result_events = await db.production_events.delete_many({"_seeded": True})
    return {
        "status": "cleared",
        "submissions_deleted": result_subs.deleted_count,
        "events_deleted": result_events.deleted_count,
    }
