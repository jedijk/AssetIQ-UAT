"""Tests for mixed-language chat text analysis."""

from utils.text_language import (
    analyze_text_languages,
    detect_language,
    resolve_chat_ui_language,
    ai_language_instruction,
)


def test_detect_english():
    assert detect_language("The pump is leaking oil near the valve") == "en"


def test_detect_dutch():
    assert detect_language("De pomp lekt olie bij de klep en temperatuur is hoog") == "nl"


def test_detect_mixed_en_nl():
    profile = analyze_text_languages(
        "Pump P-101 has a leak, de temperatuur is te hoog en er is vibration"
    )
    assert profile["is_mixed"] is True
    assert "en" in profile["languages"]
    assert "nl" in profile["languages"]


def test_resolve_mixed_uses_fallback_for_ui():
    ui, profile = resolve_chat_ui_language(
        "Pump P-101 has a leak, de temperatuur is te hoog",
        fallback="nl",
    )
    assert profile["is_mixed"] is True
    assert ui == "nl"


def test_resolve_short_command_sticky():
    ui, _ = resolve_chat_ui_language(
        "ja",
        fallback="en",
        sticky="nl",
        short_command=True,
    )
    assert ui == "nl"


def test_ai_language_instruction_mixed():
    hint = ai_language_instruction("Pump leak, de klep is kapot", fallback="en")
    assert "mix" in hint.lower()
