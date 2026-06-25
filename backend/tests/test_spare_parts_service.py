"""SpareIQ unit tests."""
from services.spare_parts_import_service import _map_headers, build_import_template_bytes
from services.spare_parts_service import _normalize_key


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


def test_task_consumes_spare_parts_for_replacement_title():
    from services.spare_part_requirements_service import (
        action_consumes_spare_parts,
        task_consumes_spare_parts,
    )

    assert task_consumes_spare_parts({"task_title": "Replace bearing block"})
    assert not task_consumes_spare_parts({"task_title": "Inspect lubrication points"})
    assert task_consumes_spare_parts({"task_title": "Inspect", "spare_part_requirements": [{"spare_part_id": "p1", "quantity": 2}]})
    assert action_consumes_spare_parts({"action_type": "CM", "title": "Replace seal"})
    assert not action_consumes_spare_parts({"action_type": "PM", "title": "Monthly inspection"})

