"""Unit tests for production dashboard forms builder."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.production_dashboard_scope import ProductionDashboardScope


def _minimal_scope(**overrides):
    base = dict(
        current_user={"id": "u1", "company_id": "Tyromer", "role": "owner"},
        now=datetime.now(timezone.utc),
        shift_keys=["morning", "afternoon", "night"],
        shift_param="morning,afternoon,night",
        range_start=datetime(2026, 6, 28, 6, 0, tzinfo=timezone.utc),
        range_end=datetime(2026, 6, 29, 6, 0, tzinfo=timezone.utc),
        target_date=datetime(2026, 6, 28, tzinfo=timezone.utc),
        is_range=False,
        filter_windows=[
            (
                datetime(2026, 6, 28, 6, 0, tzinfo=timezone.utc),
                datetime(2026, 6, 28, 14, 0, tzinfo=timezone.utc),
            )
        ],
        shift_label="Morning, Afternoon, Night",
        shift_hours="06:00 - 22:00",
        cal_env_start=datetime(2026, 6, 28, 6, 0, tzinfo=timezone.utc),
        cal_env_end=datetime(2026, 6, 29, 6, 0, tzinfo=timezone.utc),
        line90_subtree_asset_tokens=set(),
        equipment_ids=[],
        query={},
        all_subs=[],
    )
    base.update(overrides)
    return ProductionDashboardScope(**base)


@pytest.mark.asyncio
async def test_build_production_dashboard_forms_single_day_actions_query():
    from services.production_dashboard_forms import build_production_dashboard_forms

    scope = _minimal_scope()
    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[])

    pinned_cursor = MagicMock()
    pinned_cursor.sort.return_value = pinned_cursor
    pinned_cursor.to_list = AsyncMock(return_value=[])

    with patch("services.production_dashboard_forms.db") as mock_db:
        mock_db.production_events.find.return_value = mock_cursor
        mock_db.form_submissions.find.return_value = pinned_cursor
        payload = await build_production_dashboard_forms(scope)

    mock_db.production_events.find.assert_called_once()
    assert "2026-06-28" in str(mock_db.production_events.find.call_args[0][0])
    assert payload["actions"] == []
    assert payload["submissions"] == []


@pytest.mark.asyncio
async def test_build_production_dashboard_forms_waste_reporting_entries():
    from services.production_dashboard_forms import build_production_dashboard_forms

    waste_sub = {
        "id": "waste-1",
        "form_template_name": "Waste Reporting",
        "submitted_at": "2026-06-28T08:30:00+00:00",
        "submitted_by_name": "Operator",
        "values": [
            {"field_label": "Date & Time", "value": "2026-06-28T08:30:00"},
            {"field_label": "Waste type", "value": "production_waste"},
            {"field_label": "Weight (kg)", "value": 12.5},
        ],
    }
    scope = _minimal_scope(all_subs=[waste_sub])
    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[])

    pinned_cursor = MagicMock()
    pinned_cursor.sort.return_value = pinned_cursor
    pinned_cursor.to_list = AsyncMock(return_value=[])

    with patch("services.production_dashboard_forms.db") as mock_db:
        mock_db.production_events.find.return_value = mock_cursor
        mock_db.form_submissions.find.return_value = pinned_cursor
        payload = await build_production_dashboard_forms(scope)

    assert len(payload["waste_reporting_entries"]) == 1
    assert payload["waste_reporting_entries"][0]["weight_kg"] == 12.5
