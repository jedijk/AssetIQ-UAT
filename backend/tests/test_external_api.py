"""Tests for External Observation API and API key management."""
from __future__ import annotations

import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("DB_NAME", "test")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from services.external_api_key_service import (
    KEY_PREFIX,
    generate_api_key,
    hash_api_key,
    validate_api_key_format,
    _is_ip_allowed,
    authenticate_api_key,
    create_key,
    list_keys,
    revoke_key,
    tenant_user_from_key,
)
from services.external_observation_service import (
    _payload_fingerprint,
    match_equipment,
    find_duplicate,
)


def test_generate_api_key_format():
    raw = generate_api_key()
    assert raw.startswith(KEY_PREFIX)
    assert validate_api_key_format(raw)


def test_hash_api_key_deterministic():
    raw = generate_api_key()
    assert hash_api_key(raw) == hash_api_key(raw)


def test_validate_api_key_format_rejects_empty():
    assert not validate_api_key_format("")
    assert not validate_api_key_format("bad")


def test_ip_allowlist_empty_allows_all():
    assert _is_ip_allowed("203.0.113.1", []) is True


def test_ip_allowlist_blocks_unknown():
    assert _is_ip_allowed("203.0.113.1", ["198.51.100.0/24"]) is False
    assert _is_ip_allowed("198.51.100.10", ["198.51.100.0/24"]) is True


def test_tenant_user_from_key():
    user = tenant_user_from_key({"id": "k1", "tenant_id": "tenant-a"})
    assert user["company_id"] == "tenant-a"
    assert user["external_api_key_id"] == "k1"


def test_payload_fingerprint_stable():
    p1 = {"a": 1, "b": 2}
    p2 = {"b": 2, "a": 1}
    assert _payload_fingerprint(p1) == _payload_fingerprint(p2)


class _FakeKeysCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])
        self.inserted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)
        self.docs.append(doc)

    async def find_one(self, query):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items() if not isinstance(v, dict)):
                return doc
        if "key_hash" in query:
            for doc in self.docs:
                if doc.get("key_hash") == query["key_hash"]:
                    return doc
        return None

    def find(self, query):
        class _Cursor:
            def __init__(self, items):
                self._items = items

            def sort(self, *args, **kwargs):
                return self

            async def to_list(self, limit):
                return self._items[:limit]

        if query.get("key_hash"):
            return _Cursor([d for d in self.docs if d.get("key_hash") == query["key_hash"]])
        tenant_id = query.get("tenant_id")
        return _Cursor([d for d in self.docs if d.get("tenant_id") == tenant_id])

    async def update_one(self, query, update):
        for doc in self.docs:
            if doc.get("id") == query.get("id"):
                if "$set" in update:
                    doc.update(update["$set"])
                return MagicMock(modified_count=1)
        return MagicMock(modified_count=0)

    async def find_one_and_update(self, query, update, return_document=None):
        for doc in self.docs:
            if doc.get("id") == query.get("id"):
                rw = doc.get("rate_window") or {}
                if rw.get("window_id") == query.get("rate_window.window_id"):
                    doc.setdefault("rate_window", {})["count"] = rw.get("count", 0) + 1
                    return doc
        return None


class _FakeDb:
    def __init__(self, keys=None):
        self.external_api_keys = _FakeKeysCollection(keys)

    def __getitem__(self, name):
        if name == "external_api_keys":
            return self.external_api_keys
        raise KeyError(name)


@pytest.mark.asyncio
async def test_create_key_returns_raw_once(monkeypatch):
    fake_db = _FakeDb()
    monkeypatch.setattr("services.external_api_key_service.db", fake_db)
    public, raw = await create_key(
        "tenant-a",
        name="Test Key",
        created_by="user-1",
    )
    assert raw.startswith(KEY_PREFIX)
    assert public["api_key"] == raw
    assert fake_db.external_api_keys.docs[0]["key_hash"] == hash_api_key(raw)
    assert "key_hash" not in public or public.get("key_hash") is None


@pytest.mark.asyncio
async def test_list_keys_tenant_scoped(monkeypatch):
    fake_db = _FakeDb(
        [
            {"id": "1", "tenant_id": "t1", "name": "A", "enabled": True, "scopes": ["observations:create"], "created_at": "2024-01-01"},
            {"id": "2", "tenant_id": "t2", "name": "B", "enabled": True, "scopes": ["observations:create"], "created_at": "2024-01-02"},
        ]
    )
    monkeypatch.setattr("services.external_api_key_service.db", fake_db)
    keys = await list_keys("t1")
    assert len(keys) == 1
    assert keys[0]["name"] == "A"


@pytest.mark.asyncio
async def test_authenticate_api_key_invalid():
    with patch("services.external_api_key_service.db", _FakeDb()):
        with pytest.raises(HTTPException) as exc:
            await authenticate_api_key("aiq_live_invalid", required_scope="observations:create", client_ip=None)
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_authenticate_api_key_valid(monkeypatch):
    raw = generate_api_key()
    doc = {
        "id": "k1",
        "tenant_id": "t1",
        "key_hash": hash_api_key(raw),
        "enabled": True,
        "scopes": ["observations:create"],
        "ip_allowlist": [],
    }
    fake_db = _FakeDb([doc])
    monkeypatch.setattr("services.external_api_key_service.db", fake_db)
    result = await authenticate_api_key(raw, required_scope="observations:create", client_ip="127.0.0.1")
    assert result["id"] == "k1"


@pytest.mark.asyncio
async def test_authenticate_missing_scope(monkeypatch):
    raw = generate_api_key()
    doc = {
        "id": "k1",
        "tenant_id": "t1",
        "key_hash": hash_api_key(raw),
        "enabled": True,
        "scopes": ["other:scope"],
        "ip_allowlist": [],
    }
    monkeypatch.setattr("services.external_api_key_service.db", _FakeDb([doc]))
    with pytest.raises(HTTPException) as exc:
        await authenticate_api_key(raw, required_scope="observations:create", client_ip=None)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_revoke_key(monkeypatch):
    doc = {
        "id": "k1",
        "tenant_id": "t1",
        "name": "Key",
        "enabled": True,
        "scopes": ["observations:create"],
        "created_at": "2024-01-01",
    }
    fake_db = _FakeDb([doc])
    monkeypatch.setattr("services.external_api_key_service.db", fake_db)
    result = await revoke_key("t1", "k1")
    assert result["status"] == "revoked"


@pytest.mark.asyncio
async def test_match_equipment_by_id(monkeypatch):
    equip = {"id": "eq-1", "tag": "P-101", "name": "Pump"}
    mock_db = MagicMock()
    mock_db.equipment_nodes.find_one = AsyncMock(return_value=equip)
    monkeypatch.setattr("services.external_observation_service.db", mock_db)

    user = {"company_id": "t1"}
    eq_id, match = await match_equipment(
        {"equipment_id": "eq-1"},
        user=user,
        source_system="cmms",
    )
    assert eq_id == "eq-1"
    assert match["match_type"] == "assetiq_id"


@pytest.mark.asyncio
async def test_match_equipment_by_tag(monkeypatch):
    equip = {"id": "eq-2", "tag": "P-202", "name": "Motor"}
    mock_db = MagicMock()
    mock_db.equipment_nodes.find_one = AsyncMock(return_value=equip)
    monkeypatch.setattr("services.external_observation_service.db", mock_db)

    user = {"company_id": "t1"}
    eq_id, match = await match_equipment(
        {"equipment_tag": "P-202"},
        user=user,
        source_system="cmms",
    )
    assert eq_id == "eq-2"
    assert match["match_type"] == "tag_exact"


@pytest.mark.asyncio
async def test_authenticate_equipment_read_scope(monkeypatch):
    raw = generate_api_key()
    doc = {
        "id": "k1",
        "tenant_id": "t1",
        "key_hash": hash_api_key(raw),
        "enabled": True,
        "scopes": ["equipment:read"],
        "ip_allowlist": [],
    }
    monkeypatch.setattr("services.external_api_key_service.db", _FakeDb([doc]))
    result = await authenticate_api_key(raw, required_scope="equipment:read", client_ip=None)
    assert result["id"] == "k1"


@pytest.mark.asyncio
async def test_authenticate_equipment_scope_missing(monkeypatch):
    raw = generate_api_key()
    doc = {
        "id": "k1",
        "tenant_id": "t1",
        "key_hash": hash_api_key(raw),
        "enabled": True,
        "scopes": ["observations:create"],
        "ip_allowlist": [],
    }
    monkeypatch.setattr("services.external_api_key_service.db", _FakeDb([doc]))
    with pytest.raises(HTTPException) as exc:
        await authenticate_api_key(raw, required_scope="equipment:read", client_ip=None)
    assert exc.value.status_code == 403


def test_build_equipment_path():
    from services.external_equipment_service import build_equipment_path

    lookup = {
        "inst": {"id": "inst", "name": "Plant A", "parent_id": None},
        "sys": {"id": "sys", "name": "Cooling", "parent_id": "inst"},
        "eq": {"id": "eq", "name": "Pump P-101", "parent_id": "sys"},
    }
    assert build_equipment_path(lookup["eq"], lookup) == "Plant A > Cooling > Pump P-101"


def test_serialize_criticality_totals():
    from services.external_equipment_service import serialize_criticality

    crit = serialize_criticality(
        {
            "safety_impact": 4,
            "production_impact": 3,
            "environmental_impact": 2,
            "reputation_impact": 1,
            "classification": "high",
        }
    )
    assert crit["total_score"] == 10
    assert crit["classification"] == "high"
    assert crit["safety_critical"] is True


def test_serialize_equipment_object_shape():
    from services.external_equipment_service import serialize_equipment_object

    node = {
        "id": "eq-1",
        "name": "Pump",
        "tag": "P-101",
        "level": "equipment",
        "criticality": {"production_impact": 3},
    }
    obj = serialize_equipment_object(
        node,
        equipment_path="Plant > Pump",
        depth=2,
        operational_summary={"open_observation_count": 1, "open_planned_task_count": 0},
        include_metadata=False,
        children=[],
    )
    assert obj["id"] == "eq-1"
    assert obj["equipment_path"] == "Plant > Pump"
    assert obj["operational_summary"]["open_observation_count"] == 1
    assert obj["children"] == []
    assert "metadata" not in obj


@pytest.mark.asyncio
async def test_find_duplicate(monkeypatch):
    payloads = MagicMock()
    payloads.find_one = AsyncMock(
        return_value={"observation_id": "obs-1", "external_reference": "ref-1"}
    )
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=payloads)
    monkeypatch.setattr("services.external_observation_service.db", mock_db)
    dup = await find_duplicate("t1", "cmms", "ref-1")
    assert dup["observation_id"] == "obs-1"
