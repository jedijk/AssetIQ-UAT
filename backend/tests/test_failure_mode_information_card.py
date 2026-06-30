"""Tests for failure mode information card hashing and generation."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("DB_NAME", "test")

from services.failure_mode_information_card import (
    compute_input_hash,
    get_likelihood_label,
    get_or_generate_card,
    get_risk_level,
    normalize_failure_mode_for_hash,
)

SAMPLE_FM = {
    "id": "abc123",
    "failure_mode": "Bearing Failure",
    "category": "Rotating",
    "process": "Compression",
    "iso14224_mechanism": "BRD",
    "equipment_type_ids": ["centrifugal_pump", "motor"],
    "severity": 7,
    "occurrence": 5,
    "detectability": 4,
    "rpn": 140,
    "potential_effects": ["Loss of flow", "Vibration"],
    "potential_causes": ["Lubrication loss", "Misalignment"],
    "keywords": ["bearing", "vibration"],
    "recommended_actions": [
        {"description": "Vibration monitoring", "action_type": "PDM", "discipline": "Rotating"},
        {"description": "Replace bearing", "action_type": "CM", "discipline": "Rotating"},
    ],
    "is_validated": True,
    "updated_at": "2026-01-01T00:00:00Z",
    "validated_by_name": "Engineer",
}


def test_normalize_failure_mode_for_hash_is_deterministic():
    a = normalize_failure_mode_for_hash(SAMPLE_FM, "en")
    b = normalize_failure_mode_for_hash(dict(SAMPLE_FM), "en")
    assert a == b


def test_normalize_ignores_timestamps_and_users():
    fm_copy = dict(SAMPLE_FM)
    fm_copy["updated_at"] = "2099-12-31T00:00:00Z"
    fm_copy["validated_by_name"] = "Someone Else"
    assert normalize_failure_mode_for_hash(SAMPLE_FM, "en") == normalize_failure_mode_for_hash(
        fm_copy, "en"
    )


def test_normalize_sorts_arrays_and_actions():
    fm = dict(SAMPLE_FM)
    fm["keywords"] = ["vibration", "bearing"]
    fm["equipment_type_ids"] = ["motor", "centrifugal_pump"]
    fm["recommended_actions"] = [
        {"description": "Replace bearing", "action_type": "CM"},
        {"description": "Vibration monitoring", "action_type": "PDM"},
    ]
    normalized = normalize_failure_mode_for_hash(fm, "en")
    assert normalized["keywords"] == ["bearing", "vibration"]
    assert normalized["equipment_types"] == ["centrifugal_pump", "motor"]
    assert normalized["recommended_actions"][0]["action"] == "replace bearing"


def test_compute_input_hash_stable():
    h1 = compute_input_hash(SAMPLE_FM, "en")
    h2 = compute_input_hash(SAMPLE_FM, "en")
    assert h1 == h2
    assert len(h1) == 64


def test_compute_input_hash_changes_with_language():
    assert compute_input_hash(SAMPLE_FM, "en") != compute_input_hash(SAMPLE_FM, "nl")


@pytest.mark.parametrize(
    "rpn,expected",
    [
        (1, "Low"),
        (80, "Low"),
        (81, "Medium"),
        (160, "Medium"),
        (161, "Elevated"),
        (240, "Elevated"),
        (241, "High"),
        (400, "High"),
        (401, "Critical"),
        (1000, "Critical"),
    ],
)
def test_get_risk_level_bands(rpn, expected):
    assert get_risk_level(rpn) == expected


@pytest.mark.parametrize(
    "occurrence,expected",
    [
        (1, "Rare"),
        (2, "Rare"),
        (3, "Unlikely"),
        (4, "Unlikely"),
        (5, "Possible"),
        (6, "Possible"),
        (7, "Likely"),
        (8, "Likely"),
        (9, "Frequent"),
        (10, "Frequent"),
    ],
)
def test_get_likelihood_label_bands(occurrence, expected):
    assert get_likelihood_label(occurrence) == expected


SAMPLE_CARD = {
    "header": {
        "title": "Failure Mode Information Card",
        "failure_mode_name": "Bearing Failure",
        "discipline": "Rotating",
        "process": "Compression",
        "iso14224_reference": "BRD",
        "validation_status": "Validated",
        "last_updated": "2026-01-01",
    },
    "risk_summary": {
        "rpn": 140,
        "severity": 7,
        "occurrence": 5,
        "detection": 4,
        "overall_risk_level": "Medium",
    },
    "failure_mode_overview": ["Overview paragraph."],
    "technical_description": "Technical description.",
    "scoring_justification": {
        "severity": "Severity 7 means...",
        "occurrence": "Occurrence 5 means...",
        "detection": "Detection 4 means...",
    },
    "likelihood": {"label": "Possible", "explanation": "Moderate occurrence."},
    "potential_effects": {
        "process_effects": ["Loss of flow"],
        "equipment_effects": ["Bearing damage"],
        "business_effects": ["Production loss"],
        "safety_considerations": [],
        "environmental_considerations": [],
    },
    "potential_causes": {
        "process": [],
        "maintenance": ["Lubrication loss"],
        "design": [],
        "operational": [],
        "human_factors": [],
    },
    "applicable_equipment": ["Centrifugal Pump"],
    "recommended_actions": [
        {
            "action_name": "Vibration monitoring",
            "maintenance_strategy": "PdM",
            "discipline": "Rotating",
            "justification": "Early detection.",
            "risk_component": "Detection",
            "control_type": "Primary Control",
        }
    ],
    "key_reliability_indicator": {
        "indicator": "Vibration",
        "description": "Trend bearing defect frequencies.",
    },
    "risk_reduction_logic": "Monitoring improves detectability.",
    "standards_alignment": {
        "summary": "Aligned with internationally recognized reliability engineering practices.",
        "standards": [],
    },
    "footer": {
        "tagline_lines": ["Evidence-Based Reliability"],
        "powered_by": "Powered by AssetIQ",
    },
}


@pytest.mark.asyncio
async def test_get_or_generate_card_reuses_matching_hash():
    mock_collection = MagicMock()
    mock_collection.find_one = AsyncMock(
        return_value={
            "card_json": SAMPLE_CARD,
            "input_hash": compute_input_hash(SAMPLE_FM, "en"),
            "version": 1,
            "language": "en",
            "created_at": "2026-01-01T00:00:00Z",
        }
    )

    with patch(
        "services.failure_mode_information_card.get_failure_mode_by_id",
        new_callable=AsyncMock,
        return_value=SAMPLE_FM,
    ), patch(
        "services.failure_mode_information_card.db",
        {"failure_mode_information_cards": mock_collection},
    ):
        result = await get_or_generate_card("abc123", {"id": "u1", "company_id": "c1"})

    assert result["reused"] is True
    assert result["card"] == SAMPLE_CARD
    mock_collection.find_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_or_generate_card_generates_when_missing():
    mock_collection = MagicMock()
    mock_collection.find_one = AsyncMock(return_value=None)
    mock_collection.update_many = AsyncMock()
    mock_collection.insert_one = AsyncMock()

    with patch(
        "services.failure_mode_information_card.get_failure_mode_by_id",
        new_callable=AsyncMock,
        return_value=SAMPLE_FM,
    ), patch(
        "services.failure_mode_information_card.db",
        {"failure_mode_information_cards": mock_collection},
    ), patch(
        "services.failure_mode_information_card._fm_json",
        new_callable=AsyncMock,
        return_value=SAMPLE_CARD,
    ):
        result = await get_or_generate_card("abc123", {"id": "u1", "company_id": "c1"})

    assert result["reused"] is False
    assert result["card"] == SAMPLE_CARD
    mock_collection.insert_one.assert_awaited_once()
