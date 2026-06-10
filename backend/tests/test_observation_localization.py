"""Tests for observation text language detection and localization helpers."""
import os
from unittest.mock import MagicMock

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

from utils.observation_localization import localize_observation_record
from utils.text_language import detect_entity_source_language, detect_text_language


def test_detect_text_language_dutch():
    assert detect_text_language("De pomp lekt olie bij de klep") == "nl"


def test_detect_text_language_german():
    assert detect_text_language("Die Pumpe undicht und Temperatur hoch") == "de"


def test_detect_text_language_english():
    assert detect_text_language("The pump is leaking oil near the valve") == "en"


def test_detect_entity_source_language_from_title():
    source = detect_entity_source_language(
        {"title": "Storing aan pomp P-101", "description": ""},
        ["title", "description"],
    )
    assert source == "nl"


@pytest.mark.asyncio
async def test_localize_observation_record_uses_stored_english_translation():
    mock_service = MagicMock()
    mock_service.translate_text = MagicMock()

    result = await localize_observation_record(
        {"id": "obs-1", "title": "Storing aan pomp", "description": "Lekkage"},
        "en",
        stored_fields={"title": "Failure at pump", "description": "Leakage"},
        service=mock_service,
        cache={},
    )

    assert result["title"] == "Failure at pump"
    assert result["description"] == "Leakage"
    mock_service.translate_text.assert_not_called()
