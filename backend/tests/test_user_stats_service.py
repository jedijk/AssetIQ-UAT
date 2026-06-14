"""Tests for user statistics service."""
import os
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.user_stats_service import UserStatsService, EXCLUDED_USER_STATS_ROLES


@pytest.fixture
def service():
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=MagicMock())
    return UserStatsService(mock_db)


def test_build_event_match_stage_excludes_owner_by_default(service):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2026, 1, 31, tzinfo=timezone.utc)

    match = service.build_event_match_stage(start, end)

    assert match["timestamp"] == {"$gte": start, "$lte": end}
    assert match["user_role"] == {"$nin": list(EXCLUDED_USER_STATS_ROLES)}


def test_build_event_match_stage_ignores_owner_role_filter(service):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2026, 1, 31, tzinfo=timezone.utc)

    match = service.build_event_match_stage(start, end, user_role_filter="owner")

    assert match["user_role"] == {"$nin": list(EXCLUDED_USER_STATS_ROLES)}


def test_build_event_match_stage_applies_allowed_role_filter(service):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2026, 1, 31, tzinfo=timezone.utc)

    match = service.build_event_match_stage(start, end, user_role_filter="admin")

    assert match["user_role"] == "admin"


def test_stats_users_query_excludes_owner(service):
    assert service.stats_users_query() == {"role": {"$nin": list(EXCLUDED_USER_STATS_ROLES)}}
