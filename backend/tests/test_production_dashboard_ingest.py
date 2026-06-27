"""Unit tests for production dashboard ingest merge."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from services.production_dashboard_scope import ProductionDashboardScope


def _minimal_scope(**overrides):
    base = dict(
        current_user={"id": "u1", "company_id": "Tyromer", "role": "owner"},
        now=datetime.now(timezone.utc),
        shift_keys=["morning", "afternoon", "night"],
        shift_param="morning,afternoon,night",
        range_start=datetime(2026, 6, 27, 6, 0, tzinfo=timezone.utc),
        range_end=datetime(2026, 6, 28, 6, 0, tzinfo=timezone.utc),
        target_date=datetime(2026, 6, 27, tzinfo=timezone.utc),
        is_range=False,
        filter_windows=[
            (
                datetime(2026, 6, 27, 6, 0, tzinfo=timezone.utc),
                datetime(2026, 6, 27, 14, 0, tzinfo=timezone.utc),
            )
        ],
        shift_label="Morning, Afternoon, Night",
        shift_hours="06:00 - 22:00",
        cal_env_start=datetime(2026, 6, 27, 6, 0, tzinfo=timezone.utc),
        cal_env_end=datetime(2026, 6, 28, 6, 0, tzinfo=timezone.utc),
        line90_subtree_asset_tokens=set(),
        equipment_ids=[],
        query={},
        all_subs=[],
    )
    base.update(overrides)
    return ProductionDashboardScope(**base)


def _empty_form_data():
    return {
        "submissions": [],
        "extruder_subs": [],
        "big_bag_subs": [],
        "screen_change_subs": [],
        "magnet_subs": [],
        "end_of_shift_subs": [],
        "waste_reporting_subs": [],
        "production_log": [],
        "total_feed": 0,
        "viscosity_values": [],
        "big_bag_entries": [],
        "information_entries": [],
        "end_of_shift_entries": [],
        "waste_reporting_entries": [],
        "viscosity_series": [],
        "lot_info": "",
        "actions": [],
        "insights": [],
    }


@pytest.mark.asyncio
async def test_merge_production_dashboard_ingest_uses_scope_dates():
    from services.production_dashboard_ingest import merge_production_dashboard_ingest

    scope = _minimal_scope()
    with patch("services.production_dashboard_ingest.db") as mock_db:
        mock_db.production_logs.aggregate.return_value.to_list = AsyncMock(return_value=[])
        payload = await merge_production_dashboard_ingest(scope, _empty_form_data())

    assert payload["date"] == "2026-06-27"
    assert payload["from_date"] == "2026-06-27"
    assert payload["to_date"] == "2026-06-28"
    assert payload["shift"] == "morning,afternoon,night"
