"""Unit tests for visual display device admin (Phase 4c)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

import pytest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from services import visual_display_admin_service as admin_svc
from services.visual_display_token import generate_device_token

MOCK_DBS = {"production": {"name": "assetiq"}, "uat": {"name": "assetiq-UAT"}}


@contextmanager
def patch_admin_db(mock_db, *, db_map=None):
    db_map = db_map or {"assetiq": mock_db, "assetiq-UAT": mock_db}

    def get_db(name):
        return db_map.get(name, mock_db)

    with patch("services.visual_display_admin_service.get_current_db_name", return_value="assetiq"), patch(
        "services.visual_display_admin_service.AVAILABLE_DATABASES", MOCK_DBS
    ), patch("services.visual_display_admin_service.get_database", side_effect=get_db), patch(
        "services.visual_display_admin_service.set_request_db"
    ), patch("services.visual_display_admin_service.db", mock_db
    ), patch(
        "services.visual_display_admin_service.notify_device", new_callable=AsyncMock
    ):
        yield


class FakeDB:
    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        if name not in self._collections:
            col = MagicMock()
            col.insert_one = AsyncMock()
            col.update_one = AsyncMock()
            col.delete_one = AsyncMock()
            col.find_one = AsyncMock(return_value=None)
            find_cursor = MagicMock()
            find_cursor.sort = MagicMock(return_value=find_cursor)
            find_cursor.to_list = AsyncMock(return_value=[])
            col.find = MagicMock(return_value=find_cursor)
            self._collections[name] = col
        return self._collections[name]


@pytest.fixture
def mock_user():
    return {"id": "user-1", "company_id": "co-1", "role": "admin"}


@pytest.fixture
def mock_db():
    return FakeDB()


def _device_doc(**overrides):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": "device_1",
        "screen_name": "Line TV",
        "board_id": "board_1",
        "tenant_id": "co-1",
        "status": "active",
        "token_hash": "abc",
        "screen_width": 1920,
        "screen_height": 1080,
        "paired_at": now,
        "token_issued_at": now,
        "created_at": now,
        "last_seen": now,
    }
    doc.update(overrides)
    return doc


@pytest.mark.asyncio
async def test_get_device_detail(mock_user, mock_db):
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=_device_doc())
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value=None)
    boards.find = MagicMock(
        return_value=MagicMock(
            to_list=AsyncMock(return_value=[{"id": "board_1", "name": "Ops Board", "version": 3}])
        )
    )

    with patch_admin_db(mock_db):
        detail = await admin_svc.get_device_detail("device_1", mock_user)

    assert detail.id == "device_1"
    assert detail.board_name == "Ops Board"
    assert detail.board_version == 3
    assert detail.resolution == "1920x1080"


@pytest.mark.asyncio
async def test_update_device(mock_user, mock_db):
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=_device_doc())
    boards = mock_db["visual_boards"]
    boards.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))

    with patch_admin_db(mock_db):
        detail = await admin_svc.update_device(
            "device_1",
            mock_user,
            screen_name="Updated TV",
            location="Plant B",
        )

    assert detail.screen_name == "Updated TV"
    devices.update_one.assert_awaited()


@pytest.mark.asyncio
async def test_reassign_board_notifies(mock_user, mock_db):
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=_device_doc())
    boards = mock_db["visual_boards"]
    boards.find_one = AsyncMock(return_value={"id": "board_2", "name": "New Board", "version": 5})
    boards.find = MagicMock(
        return_value=MagicMock(
            to_list=AsyncMock(return_value=[{"id": "board_2", "name": "New Board", "version": 5}])
        )
    )

    with patch_admin_db(mock_db), patch(
        "services.visual_display_admin_service.notify_device", new_callable=AsyncMock
    ) as notify:
        await admin_svc.reassign_board("device_1", mock_user, "board_2")

    devices.update_one.assert_awaited()
    notify.assert_awaited_once()
    assert notify.await_args.args[1] == "board_reassigned"


@pytest.mark.asyncio
async def test_disable_device(mock_user, mock_db):
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=_device_doc())
    boards = mock_db["visual_boards"]
    boards.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))

    with patch_admin_db(mock_db), patch(
        "services.visual_display_admin_service.notify_device", new_callable=AsyncMock
    ) as notify:
        await admin_svc.disable_device("device_1", mock_user)

    devices.update_one.assert_awaited()
    update_fields = devices.update_one.await_args.args[1]["$set"]
    assert update_fields["status"] == "disabled"
    notify.assert_awaited_once_with("device_1", "device_disabled", {})


@pytest.mark.asyncio
async def test_rotate_and_accept_token(mock_user, mock_db):
    raw_old, hash_old = generate_device_token()
    device = _device_doc(token_hash=hash_old)
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=device)

    with patch_admin_db(mock_db), patch(
        "services.visual_display_admin_service.notify_device", new_callable=AsyncMock
    ):
        result = await admin_svc.rotate_device_token("device_1", mock_user)

    assert result["rotation_pending"] is True
    update_call = devices.update_one.await_args
    pending = update_call.args[1]["$set"]["pending_delivery_token"]
    assert pending.startswith("dvc_")

    device_with_pending = {
        **device,
        "pending_delivery_token": pending,
        "pending_token_hash": update_call.args[1]["$set"]["pending_token_hash"],
    }

    with patch_admin_db(mock_db), patch(
        "services.visual_display_device_service.lookup_device_by_token",
        new_callable=AsyncMock,
        return_value=device_with_pending,
    ):
        accepted = await admin_svc.accept_token_rotation(raw_old)

    assert accepted["device_token"] == pending
    assert accepted["device_id"] == "device_1"


@pytest.mark.asyncio
async def test_delete_device(mock_user, mock_db):
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=_device_doc())

    with patch_admin_db(mock_db):
        await admin_svc.delete_device("device_1", mock_user)

    devices.delete_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_device_events(mock_user, mock_db):
    devices = mock_db["visual_display_devices"]
    devices.find_one = AsyncMock(return_value=_device_doc())
    events = mock_db["visual_display_events"]
    events.find = MagicMock(
        return_value=MagicMock(
            sort=MagicMock(
                return_value=MagicMock(
                    to_list=AsyncMock(
                        return_value=[
                            {
                                "id": "vde_1",
                                "event": "connected",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "metadata": {},
                            }
                        ]
                    )
                )
            )
        )
    )

    with patch_admin_db(mock_db):
        result = await admin_svc.list_device_events("device_1", mock_user)

    assert result["total"] == 1
    assert result["items"][0]["event"] == "connected"


@pytest.mark.asyncio
async def test_get_device_not_found(mock_user, mock_db):
    with patch_admin_db(mock_db):
        with pytest.raises(HTTPException) as exc:
            await admin_svc.get_device_detail("missing", mock_user)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_list_display_devices_across_databases(mock_user):
    prod_db = FakeDB()
    uat_db = FakeDB()
    prod_devices = prod_db["visual_display_devices"]
    uat_devices = uat_db["visual_display_devices"]
    prod_devices.find = MagicMock(
        return_value=MagicMock(
            sort=MagicMock(
                return_value=MagicMock(
                    to_list=AsyncMock(
                        return_value=[_device_doc(id="device_prod", screen_name="Prod TV")]
                    )
                )
            )
        )
    )
    uat_devices.find = MagicMock(
        return_value=MagicMock(
            sort=MagicMock(
                return_value=MagicMock(
                    to_list=AsyncMock(
                        return_value=[_device_doc(id="device_uat", screen_name="UAT TV")]
                    )
                )
            )
        )
    )
    for boards in (prod_db["visual_boards"], uat_db["visual_boards"]):
        boards.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))

    with patch_admin_db(prod_db, db_map={"assetiq": prod_db, "assetiq-UAT": uat_db}):
        result = await admin_svc.list_display_devices_enhanced(mock_user)

    assert result["total"] == 2
    names = {item["screen_name"] for item in result["items"]}
    assert names == {"Prod TV", "UAT TV"}
