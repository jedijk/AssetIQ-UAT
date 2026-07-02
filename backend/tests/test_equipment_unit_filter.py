"""Tests for optional equipment-unit request header filtering."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.equipment_unit_filter import (
    EQUIPMENT_UNIT_FILTER_HEADER,
    apply_equipment_unit_filter_to_user,
    read_equipment_unit_filter_ids,
)


class _FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


def test_read_equipment_unit_filter_ids_parses_csv():
    req = _FakeRequest({EQUIPMENT_UNIT_FILTER_HEADER: "unit-a, unit-b"})
    assert read_equipment_unit_filter_ids(req) == ["unit-a", "unit-b"]


def test_apply_equipment_unit_filter_to_user_attaches_ids():
    user = {"id": "u1", "role": "admin"}
    req = _FakeRequest({EQUIPMENT_UNIT_FILTER_HEADER: "unit-a"})
    result = apply_equipment_unit_filter_to_user(user, req)
    assert result["_equipment_unit_filter_ids"] == ["unit-a"]


@pytest.mark.asyncio
async def test_get_scoped_equipment_ids_intersects_unit_filter():
    from services.installation_filter_service import InstallationFilterService

    service = InstallationFilterService(MagicMock())
    user = {
        "id": "u1",
        "role": "owner",
        "_equipment_unit_filter_ids": ["unit-1"],
    }

    async def fake_installation_ids(_user):
        return ["install-1"]

    async def fake_all_ids(ids, user_id=None, user=None):
        if ids == ["install-1"]:
            return {"install-1", "unit-1", "equip-a", "equip-b"}
        if ids == ["unit-1"]:
            return {"unit-1", "equip-a"}
        return set()

    with patch.object(service, "get_user_installation_ids", side_effect=fake_installation_ids):
        with patch.object(service, "get_all_equipment_ids_for_installations", side_effect=fake_all_ids):
            scoped = await service.get_scoped_equipment_ids(user)

    assert scoped == {"unit-1", "equip-a"}


@pytest.mark.asyncio
async def test_get_scoped_equipment_ids_ignores_stale_unit_filter():
    from services.installation_filter_service import InstallationFilterService

    service = InstallationFilterService(MagicMock())
    user = {
        "id": "u1",
        "role": "owner",
        "_equipment_unit_filter_ids": ["stale-prod-unit-id"],
    }

    async def fake_installation_ids(_user):
        return ["install-1"]

    async def fake_all_ids(ids, user_id=None, user=None):
        if ids == ["install-1"]:
            return {"install-1", "unit-1", "equip-a"}
        if ids == ["stale-prod-unit-id"]:
            return set()
        return set()

    with patch.object(service, "get_user_installation_ids", side_effect=fake_installation_ids):
        with patch.object(service, "get_all_equipment_ids_for_installations", side_effect=fake_all_ids):
            scoped = await service.get_scoped_equipment_ids(user)

    assert scoped == {"install-1", "unit-1", "equip-a"}
