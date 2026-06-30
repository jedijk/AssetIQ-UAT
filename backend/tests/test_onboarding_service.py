"""Tests for onboarding progress calculation and validation."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from unittest.mock import AsyncMock, MagicMock, patch

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

    with patch("services.onboarding_service.db", mock_db):
        result = await validate_phase("tenant-1", "sites", persist=False)

    assert result["phase"] == "sites"
    assert result["score"] == 0
    assert result["status"] == "action_required"


@pytest.mark.asyncio
async def test_validate_sites_passes_with_site():
    mock_db = MagicMock()
    mock_db.equipment_nodes.count_documents = AsyncMock(return_value=2)

    with patch("services.onboarding_service.db", mock_db):
        result = await validate_phase("tenant-1", "sites", persist=False)

    assert result["score"] == 100
    assert result["status"] == "passed"


@pytest.mark.asyncio
async def test_validate_external_api_stub_connection_check():
    mock_db = MagicMock()
    mock_db.external_api_keys.count_documents = AsyncMock(return_value=1)

    with patch("services.onboarding_service.db", mock_db):
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
            from services.onboarding_service import _validate_go_live

            result = await _validate_go_live("t1", mock_all.return_value)

    assert result["status"] == "action_required"
    assert result["score"] == 0


@pytest.mark.asyncio
async def test_validate_company_logo_passes_when_configured():
    mock_db = MagicMock()

    with patch("services.onboarding_service.db", mock_db):
        with patch(
            "services.onboarding_service._resolve_tenant_doc",
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
