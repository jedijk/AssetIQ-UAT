"""Tests for multilingual equipment search keyword expansion."""
from utils.equipment_search_i18n import (
    DUTCH_TO_ENGLISH,
    GERMAN_TO_ENGLISH,
    expand_equipment_keywords,
    translation_search_languages,
    translation_search_languages_for_text,
)


def test_expand_dutch_pomp_to_pump():
    expanded = expand_equipment_keywords(["pomp", "lekt"])
    assert "pomp" in expanded
    assert "pump" in expanded


def test_expand_german_pumpe_to_pump():
    expanded = expand_equipment_keywords(["pumpe", "undicht"])
    assert "pumpe" in expanded
    assert "pump" in expanded


def test_expand_deduplicates():
    expanded = expand_equipment_keywords(["motor", "filter"])
    assert expanded.count("motor") == 1
    assert expanded.count("filter") == 1


def test_locale_maps_cover_common_terms():
    assert DUTCH_TO_ENGLISH["klep"] == "valve"
    assert GERMAN_TO_ENGLISH["ventil"] == "valve"


def test_translation_search_languages():
    assert translation_search_languages("nl") == ("nl",)
    assert translation_search_languages("de") == ("de",)
    assert set(translation_search_languages("en")) == {"nl", "de"}


def test_translation_search_languages_for_mixed_text():
    langs = translation_search_languages_for_text(
        "Pump leak, de klep is kapot",
        "en",
    )
    assert "nl" in langs
