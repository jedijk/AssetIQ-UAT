"""Tests for Visual Management Board widget data scoping."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.installation_filter_service import InstallationFilterService
from services.visual_board_helpers import VMB_DISPLAY_USER_ID, is_vmb_display_user
from services.visual_board_service import tenant_display_user


def test_is_vmb_display_user():
    assert is_vmb_display_user(tenant_display_user("co-1"))
    assert is_vmb_display_user({"id": VMB_DISPLAY_USER_ID})
    assert not is_vmb_display_user({"id": "user-1", "company_id": "co-1"})
    assert not is_vmb_display_user(None)


def test_tenant_display_user_carries_tenant_and_flag():
    user = tenant_display_user("co-tyromer")
    assert user["id"] == VMB_DISPLAY_USER_ID
    assert user["company_id"] == "co-tyromer"
    assert user.get("vmb_display") is True


@pytest.mark.asyncio
async def test_display_user_gets_all_installations():
    """VMB kiosk user must not be blocked by missing assigned_installations."""
    fake_db = MagicMock()
    find_cursor = MagicMock()
    find_cursor.to_list = AsyncMock(
        return_value=[{"id": "inst-1"}, {"id": "inst-2"}]
    )
    fake_db.equipment_nodes.find = MagicMock(return_value=find_cursor)

    svc = InstallationFilterService(fake_db)
    display_user = tenant_display_user("co-1")
    ids = await svc.get_user_installation_ids(display_user)

    assert ids == ["inst-1", "inst-2"]
    fake_db.equipment_nodes.find.assert_called_once()
    query = fake_db.equipment_nodes.find.call_args[0][0]
    assert "$and" in query
    level_part = next(part for part in query["$and"] if part.get("level") == "installation")
    assert level_part["level"] == "installation"


@pytest.mark.asyncio
async def test_regular_viewer_without_installations_gets_none():
    fake_db = MagicMock()
    svc = InstallationFilterService(fake_db)
    viewer = {"id": "user-1", "role": "viewer", "company_id": "co-1"}
    ids = await svc.get_user_installation_ids(viewer)
    assert ids == []
    fake_db.equipment_nodes.find.assert_not_called()


@pytest.mark.asyncio
async def test_display_user_has_installation_access():
    fake_db = MagicMock()
    svc = InstallationFilterService(fake_db)
    assert svc.has_installation_access(tenant_display_user("co-1")) is True
    assert svc.has_installation_access({"id": "user-1", "role": "viewer"}) is False
