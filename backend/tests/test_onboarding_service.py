"""Tests for onboarding progress calculation and validation."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from services.onboarding_constants import PHASE_WEIGHTS
from services.onboarding_service import (
    _compute_overall_progress,
    _compute_readiness_scores,
    _enrich_validation,
    _estimate_time_remaining,
    ask_coach,
    validate_phase,
)


def _phase_result(score: int, status: str = "passed") -> dict:
    return {"score": score, "status": status, "checks": []}


def _query_body(query: dict) -> dict:
    """Unwrap merge_tenant_filter $and shape for test mocks."""
    if isinstance(query.get("$and"), list) and query["$and"]:
        return query["$and"][0]
    return query


def test_compute_overall_progress_weighted():
    results = {phase: _phase_result(100) for phase in PHASE_WEIGHTS}
    assert _compute_overall_progress(results) == 100.0

    results = {phase: _phase_result(0) for phase in PHASE_WEIGHTS}
    assert _compute_overall_progress(results) == 0.0

    results = {phase: _phase_result(50) for phase in PHASE_WEIGHTS}
    assert _compute_overall_progress(results) == 50.0


def test_compute_readiness_scores():
    results = {
        "company": _phase_result(80),
        "users": _phase_result(100),
        "equipment": _phase_result(90),
        "failure_modes": _phase_result(70),
        "maintenance_strategy": _phase_result(60),
        "criticality": _phase_result(50),
        "forms": _phase_result(40),
        "spare_parts": _phase_result(30),
        "go_live": _phase_result(75),
    }
    scores = _compute_readiness_scores(results)
    assert scores["reliability"] == round(70 * 0.5 + 50 * 0.3 + 90 * 0.2)
    assert scores["maintenance"] == round(60 * 0.7 + 70 * 0.3)
    assert scores["data_quality"] > 0
    assert scores["go_live"] == 75


def test_estimate_time_remaining_decreases_with_progress():
    from services.onboarding_constants import PHASE_ORDER

    empty = {phase: _phase_result(0) for phase in PHASE_ORDER}
    full = {phase: _phase_result(100) for phase in PHASE_ORDER}
    assert _estimate_time_remaining(full) == 0
    assert _estimate_time_remaining(empty) > 0


@pytest.mark.asyncio
async def test_validate_sites_requires_installation():
    mock_db = MagicMock()
    mock_db.equipment_nodes.count_documents = AsyncMock(return_value=0)

    with patch("services.onboarding_validation.db", mock_db):
        result = await validate_phase("tenant-1", "sites", persist=False)

    assert result["phase"] == "sites"
    assert result["score"] == 0
    assert result["status"] == "action_required"


@pytest.mark.asyncio
async def test_validate_sites_passes_with_site():
    mock_db = MagicMock()
    mock_db.equipment_nodes.count_documents = AsyncMock(return_value=2)

    with patch("services.onboarding_validation.db", mock_db):
        result = await validate_phase("tenant-1", "sites", persist=False)

    assert result["score"] == 100
    assert result["status"] == "passed"


@pytest.mark.asyncio
async def test_validate_external_api_passes_when_skipped():
    mock_db = MagicMock()
    mock_db.external_api_keys.count_documents = AsyncMock(return_value=0)

    with patch("services.onboarding_validation.db", mock_db):
        result = await validate_phase("tenant-1", "external_api", persist=False)

    assert result["score"] == 100
    assert result["status"] == "passed"
    api_keys_check = next(c for c in result["checks"] if c["code"] == "api_keys")
    assert api_keys_check["status"] == "passed"
    assert api_keys_check["detail"]["skipped"] is True
    assert api_keys_check["detail"]["active_keys"] == 0


@pytest.mark.asyncio
async def test_validate_external_api_stub_connection_check():
    mock_db = MagicMock()
    mock_db.external_api_keys.count_documents = AsyncMock(return_value=1)

    with patch("services.onboarding_validation.db", mock_db):
        result = await validate_phase("tenant-1", "external_api", persist=False)

    assert result["score"] == 80
    codes = [c["code"] for c in result["checks"]]
    assert "connection_test" in codes


@pytest.mark.asyncio
async def test_go_live_blocks_when_mandatory_phase_fails():
    async def fake_validate(tenant_id, phase_id, *, persist=True):
        if phase_id == "equipment":
            return _phase_result(0, "action_required")
        return _phase_result(100, "passed")

    with patch("services.onboarding_service.validate_phase", side_effect=fake_validate):
        with patch("services.onboarding_service._run_all_validations") as mock_all:
            mock_all.return_value = {
                "company": _phase_result(100),
                "sites": _phase_result(100),
                "equipment": _phase_result(0, "action_required"),
                "users": _phase_result(100),
                "criticality": _phase_result(100),
                "failure_modes": _phase_result(100),
                "maintenance_strategy": _phase_result(100),
                "spare_parts": _phase_result(100),
                "forms": _phase_result(100),
                "visual_boards": _phase_result(100),
                "external_api": _phase_result(100),
            }
            from services.onboarding_validation import _validate_go_live

            result = await _validate_go_live("t1", mock_all.return_value)

    assert result["status"] == "action_required"
    assert result["score"] == 0


@pytest.mark.asyncio
async def test_go_live_not_blocked_by_optional_external_api():
    from services.onboarding_validation import _validate_go_live

    phase_results = {phase: _phase_result(100, "passed") for phase in [
        "company", "sites", "equipment", "users", "criticality",
        "failure_modes", "maintenance_strategy", "spare_parts",
        "forms", "visual_boards", "external_api",
    ]}
    phase_results["external_api"] = _phase_result(0, "action_required")

    result = await _validate_go_live("t1", phase_results)

    assert result["status"] != "action_required"
    blocking = next(c for c in result["checks"] if c["code"] == "mandatory_phases")
    assert "external_api" not in blocking["detail"]["blocking_phases"]


@pytest.mark.asyncio
async def test_validate_company_logo_passes_when_configured():
    mock_db = MagicMock()

    with patch("services.onboarding_validation.db", mock_db):
        with patch(
            "services.onboarding_validation._resolve_tenant_doc",
            new_callable=AsyncMock,
            return_value={
                "tenant_id": "Tyromer",
                "name": "Tyromer",
                "default_language": "en",
                "default_timezone": "UTC",
                "logo_path": "tenants/Tyromer/company-logo.png",
            },
        ):
            result = await validate_phase("Tyromer", "company", persist=False)

    logo_check = next(c for c in result["checks"] if c["code"] == "company_logo")
    assert logo_check["status"] == "passed"


@pytest.mark.asyncio
async def test_update_company_profile_sets_tenant_fields():
    mock_db = MagicMock()
    mock_db.tenants.update_one = AsyncMock()

    tenant_doc = {
        "tenant_id": "Tyromer",
        "name": "Old Name",
        "default_language": "en",
        "default_timezone": "UTC",
    }

    with patch("services.onboarding_service.db", mock_db):
        with patch(
            "services.onboarding_service._ensure_tenant_doc",
            new_callable=AsyncMock,
            side_effect=[tenant_doc, {**tenant_doc, "name": "Tyromer Inc"}],
        ):
            from services.onboarding_service import update_company_profile

            result = await update_company_profile(
                {"id": "u1", "role": "admin", "company_id": "Tyromer"},
                {"name": "Tyromer Inc"},
            )

    assert result["name"] == "Tyromer Inc"
    mock_db.tenants.update_one.assert_awaited_once()


def test_enrich_validation_adds_score_explanation_and_tally():
    result = _enrich_validation(
        {
            "phase": "company",
            "score": 75,
            "status": "warning",
            "checks": [
                {"code": "a", "status": "passed", "message": "ok", "detail": {}},
                {"code": "b", "status": "passed", "message": "ok", "detail": {}},
                {"code": "c", "status": "warning", "message": "warn", "detail": {}},
                {"code": "d", "status": "action_required", "message": "fix", "detail": {}},
            ],
        }
    )
    assert result["check_tally"]["passed"] == 2
    assert result["check_tally"]["warning"] == 1
    assert "75%" in result["score_explanation"]


def test_readiness_breakdown_exposes_weighted_components():
    results = {phase: _phase_result(50) for phase in PHASE_WEIGHTS}
    scores = _compute_readiness_scores(results)
    assert "breakdown" in scores
    assert scores["breakdown"]["overall"]["components"]
    assert scores["breakdown"]["reliability"]["formula"]


@pytest.mark.asyncio
async def test_validate_criticality_only_counts_subunits_and_maintainable_items():
    class MockCursor:
        def __init__(self, items):
            self._items = items

        async def to_list(self, length=None):
            return self._items

    in_scope = [
        {"level": "subunit", "criticality": {"production_impact": 3}},
        {"level": "subunit", "criticality": None},
        {"level": "maintainable_item", "criticality": {"safety_impact": 2}},
    ]

    mock_db = MagicMock()

    def mock_find(query, projection):
        level = query.get("level")
        if isinstance(query.get("$and"), list):
            for clause in query["$and"]:
                if clause.get("level") == "installation":
                    level = "installation"
                    break
        if level == "installation" or (query.get("level") == "installation"):
            return MockCursor([{"id": "site-1", "name": "Plant A"}])
        body = _query_body(query)
        if isinstance(body.get("level"), dict) and "$in" in body["level"]:
            return MockCursor(in_scope)
        return MockCursor([])

    mock_db.equipment_nodes.find = MagicMock(side_effect=mock_find)
    mock_db.equipment_nodes.count_documents = AsyncMock(return_value=0)
    mock_db.equipment_nodes.distinct = AsyncMock(side_effect=lambda field, query=None: {
        "installation_id": ["site-1"],
        "id": ["site-1", "eq-1"],
    }.get(field, []))

    async def risk_count(query):
        values = set()
        if query.get("installation_id", {}).get("$in"):
            values.update(query["installation_id"]["$in"])
        if query.get("$or"):
            for clause in query["$or"]:
                values.update(clause.get("installation_id", {}).get("$in", []))
        return 1 if "site-1" in values or "Plant A" in values else 0

    async def definitions_count(query):
        if query.get("$and"):
            equipment_clause = query["$and"][0]
            values = set()
            if equipment_clause.get("equipment_id", {}).get("$in"):
                values.update(equipment_clause["equipment_id"]["$in"])
            if equipment_clause.get("$or"):
                for clause in equipment_clause["$or"]:
                    values.update(clause.get("equipment_id", {}).get("$in", []))
            return 1 if values.intersection({"site-1", "Plant A", "eq-1"}) else 0
        return 0

    mock_db.risk_settings.count_documents = AsyncMock(side_effect=risk_count)
    mock_db.definitions.count_documents = AsyncMock(side_effect=definitions_count)

    with patch("services.onboarding_validation.db", mock_db):
        with patch("services.onboarding_criticality_scope.db", mock_db):
            from services.onboarding_validation import _validate_criticality

            result = await _validate_criticality("Tyromer")

    coverage_check = next(c for c in result["checks"] if c["code"] == "assessment_coverage")
    assert coverage_check["detail"]["in_scope_total"] == 3
    assert coverage_check["detail"]["assessed_count"] == 2
    assert coverage_check["detail"]["coverage_percent"] == 67
    scope_check = next(c for c in result["checks"] if c["code"] == "assessment_scope")
    assert scope_check["detail"]["subunit_total"] == 2
    assert scope_check["detail"]["maintainable_total"] == 1
    risk_check = next(c for c in result["checks"] if c["code"] == "risk_settings")
    assert risk_check["status"] == "passed"
    assert risk_check["detail"]["customized_count"] == 1
    defs_check = next(c for c in result["checks"] if c["code"] == "criticality_definitions")
    assert defs_check["status"] == "passed"
    assert defs_check["detail"]["customized_count"] == 1


@pytest.mark.asyncio
async def test_validate_failure_modes_uses_equipment_type_coverage():
    class MockAggregateCursor:
        def __init__(self, items):
            self._items = items

        def to_list(self, length=None):
            return _async_return(self._items)

    async def _async_return(value):
        return value

    types_in_use = ["type-a", "type-b", "type-c"]
    types_with_fm = [{"_id": "type-a"}, {"_id": "type-b"}]

    mock_db = MagicMock()
    mock_db.equipment_nodes.distinct = AsyncMock(return_value=types_in_use)

    async def count_documents(query):
        body = _query_body(query)
        if body.get("failure_mode_type") == "customer_specific":
            return 4
        if body.get("equipment_type_ids"):
            return 8
        equipment_type_filter = body.get("equipment_type_id")
        if isinstance(equipment_type_filter, dict) and "$in" in equipment_type_filter:
            in_list = set(equipment_type_filter["$in"])
            if in_list == set(types_in_use):
                return 6
            if in_list == {"type-a", "type-b"}:
                return 4
        return 0

    mock_db.failure_modes.count_documents = AsyncMock(side_effect=count_documents)
    mock_db.failure_modes.aggregate = MagicMock(return_value=MockAggregateCursor(types_with_fm))
    mock_db.equipment_nodes.count_documents = AsyncMock(side_effect=count_documents)

    with patch("services.onboarding_validation.db", mock_db):
        from services.onboarding_validation import _validate_failure_modes

        result = await _validate_failure_modes("Tyromer")

    type_check = next(c for c in result["checks"] if c["code"] == "type_coverage")
    assert type_check["detail"]["types_in_use"] == 3
    assert type_check["detail"]["types_with_failure_modes"] == 2
    assert type_check["detail"]["type_coverage_percent"] == 67
    assert type_check["detail"]["asset_coverage_percent"] == 67
    assert type_check["detail"]["equipment_with_type"] == 6
    assert type_check["detail"]["equipment_with_failure_modes"] == 4
    assert result["score"] == min(100, 50 + 67 // 2)


@pytest.mark.asyncio
async def test_validate_spare_parts_uses_equipment_links():
    class MockAggregateCursor:
        def __init__(self, items):
            self._items = items

        def to_list(self, length=None):
            return _async_return(self._items)

    async def _async_return(value):
        return value

    linked_equipment_ids = ["eq-1", "eq-2", "eq-3", "eq-4"]

    mock_db = MagicMock()

    async def spare_count_documents(query):
        body = _query_body(query)
        if body.get("equipment_links"):
            return 3
        return 5

    mock_db.spare_parts.count_documents = AsyncMock(side_effect=spare_count_documents)
    mock_db.spare_parts.aggregate = MagicMock(
        return_value=MockAggregateCursor([{"_id": eid} for eid in linked_equipment_ids])
    )

    async def equipment_count_documents(query):
        body = _query_body(query)
        level_filter = body.get("level")
        if isinstance(level_filter, dict) and "$in" in level_filter:
            if body.get("id", {}).get("$in"):
                return 4
            return 10
        return 0

    mock_db.equipment_nodes.count_documents = AsyncMock(side_effect=equipment_count_documents)

    with patch("services.onboarding_validation.db", mock_db):
        from services.onboarding_validation import _validate_spare_parts

        result = await _validate_spare_parts("Tyromer")

    linked_check = next(c for c in result["checks"] if c["code"] == "spare_parts_linked")
    assert linked_check["detail"]["linked_count"] == 3
    assert linked_check["detail"]["linked_equipment_count"] == 4
    assert linked_check["detail"]["equipment_in_scope"] == 10
    assert linked_check["detail"]["equipment_with_spares"] == 4
    assert linked_check["detail"]["equipment_coverage_percent"] == 40
    assert "3 spare part(s) linked to equipment (40% equipment coverage)" == linked_check["message"]
    assert result["equipment_coverage_percent"] == 40
    assert result["score"] == 76

    spare_count_calls = [
        call.args[0]
        for call in mock_db.spare_parts.count_documents.await_args_list
    ]
    assert not any("equipment_id" in query and "equipment_links" not in query for query in spare_count_calls)


@pytest.mark.asyncio
async def test_ask_coach_uses_onboarding_endpoint_not_observation_chat():
    with patch("services.ai_platform.execute_prompt", new_callable=AsyncMock) as mock_prompt:
        mock_prompt.return_value = {"content": "Failure modes describe how equipment can fail."}
        with patch("services.onboarding_service.validate_phase", new_callable=AsyncMock) as mock_validate:
            mock_validate.return_value = {"status": "warning", "score": 50}
            result = await ask_coach(
                {"id": "u1", "role": "admin", "tenant_id": "Tyromer"},
                "failure_modes",
                "What are failure modes?",
            )

    assert "Failure modes" in result["message"]
    assert result["phase_id"] == "failure_modes"
    mock_prompt.assert_called_once()
