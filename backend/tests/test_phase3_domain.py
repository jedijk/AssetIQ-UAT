"""Phase 3: canonical equipment types and hierarchy filter helpers."""
import re

from services.equipment_hierarchy_filters import _path_descendant_clause


def test_path_descendant_clause_uses_full_path_and_legacy_parent_path():
    clause = _path_descendant_clause("/Plant A/Unit 1")
    or_keys = {list(part.keys())[0] for part in clause["$or"]}
    assert "full_path" in or_keys
    assert "parent_path" in or_keys


def test_path_descendant_clause_escapes_regex_specials():
    clause = _path_descendant_clause("/Plant (A)")
    regex = clause["$or"][0]["full_path"]["$regex"]
    assert re.escape("/Plant (A)") in regex


def test_v1_strategy_path_regex_does_not_match_v2():
    v1 = re.match(r"^/api/maintenance-strategies(/|$)", "/api/maintenance-strategies/generate")
    v2 = re.match(r"^/api/maintenance-strategies(/|$)", "/api/maintenance-strategies-v2/foo")
    assert v1 is not None
    assert v2 is None
