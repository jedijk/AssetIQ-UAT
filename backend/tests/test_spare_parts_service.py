"""SpareIQ unit tests."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from services.permissions_defaults import backfill_permissions
from services.spare_parts_import_service import _map_headers, build_import_template_bytes
from services.spare_parts_service import (
    _build_linked_equipment_preview,
    _build_list_query,
    _iter_equipment_link_dicts,
    _normalize_key,
)


def test_duplicate_key_normalizes_description_and_type_model():
    assert _normalize_key("Bearing Block", "PCJ30-N") == "bearing block::pcj30-n"
    assert _normalize_key("  Bearing   Block ", " PCJ30-N ") == "bearing block::pcj30-n"


def test_import_header_mapping():
    headers = ["Equipment", "Spare Part Description", "Type / Model", "Manufacturer"]
    mapped = _map_headers(headers)
    assert mapped["equipment"] == 0
    assert mapped["description"] == 1
    assert mapped["type_model"] == 2
    assert mapped["manufacturer"] == 3


def test_import_template_generates_xlsx():
    content = build_import_template_bytes()
    assert content[:2] == b"PK"


def test_action_consumes_spare_parts_for_replacement_title():
    from services.spare_part_requirements_service import (
        action_consumes_spare_parts,
        task_consumes_spare_parts,
    )

    assert task_consumes_spare_parts({"task_title": "Replace bearing block"})
    assert not task_consumes_spare_parts({"task_title": "Inspect lubrication points"})
    assert task_consumes_spare_parts({"task_title": "Inspect", "spare_part_requirements": [{"spare_part_id": "p1", "quantity": 2}]})
    assert action_consumes_spare_parts({"action_type": "CM", "title": "Replace seal"})
    assert not action_consumes_spare_parts({"action_type": "PM", "title": "Monthly inspection"})


def test_backfill_permissions_normalizes_spareiq_feature_dict():
    stored = {
        "admin": {
            "spareiq": "read",
            "equipment": {"read": True, "write": True, "delete": False},
        }
    }
    result = backfill_permissions(stored)
    assert result["admin"]["spareiq"]["read"] is True
    assert result["admin"]["spareiq"]["write"] is True


def test_build_linked_equipment_preview_prefers_tag():
    equipment_map = {
        "eq-1": {"id": "eq-1", "tag": "P-101", "name": "Feed Pump"},
        "eq-2": {"id": "eq-2", "name": "Compressor"},
    }
    preview = _build_linked_equipment_preview(
        [
            {"equipment_id": "eq-1", "component_position": "Drive end"},
            {"equipment_id": "eq-2"},
        ],
        equipment_map,
    )
    assert preview[0]["equipment_tag"] == "P-101"
    assert preview[0]["equipment_name"] == "Feed Pump"
    assert preview[1]["equipment_tag"] is None
    assert preview[1]["equipment_name"] == "Compressor"


def test_iter_equipment_link_dicts_handles_malformed_values():
    assert _iter_equipment_link_dicts(None) == []
    assert _iter_equipment_link_dicts("bad") == []
    assert _iter_equipment_link_dicts(["eq-1"]) == [{"equipment_id": "eq-1"}]
    assert _iter_equipment_link_dicts([
        {"equipment_id": "eq-1", "component_position": "Drive end"},
        "eq-2",
    ]) == [
        {"equipment_id": "eq-1", "component_position": "Drive end"},
        {"equipment_id": "eq-2"},
    ]


def test_build_list_query_combines_search_with_tenant_filter(monkeypatch):
    import services.tenant_schema as tenant_schema

    monkeypatch.setattr(tenant_schema, "TENANT_STRICT_MODE", False)
    user = {"company_id": "Tyromer"}
    query = _build_list_query(user, equipment_id="eq-1", search="bearing")
    assert "$and" in query
    filter_parts = query["$and"][0].get("$and", [query["$and"][0]])
    assert any("equipment_links.equipment_id" in part for part in filter_parts)
    assert any("$or" in part for part in filter_parts)
    tenant_part = query["$and"][1]
    assert "$or" in tenant_part

