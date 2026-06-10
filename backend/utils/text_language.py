"""Lightweight text language detection for localization."""

from __future__ import annotations

from typing import Optional


def detect_text_language(text: str) -> str:
    """
    Return 'en', 'nl', or 'de' for a snippet of user-authored text.
    Defaults to English when uncertain.
    """
    if not text:
        return "en"
    s = text.strip()
    if len(s) < 4:
        return "en"
    low = f" {s.lower()} "

    nl_markers = (
        " het ", " een ", " niet ", " naar ", " deze ", " wordt ", " graag ",
        " geen ", " ook ", " alleen ", " kunt ", " kunnen ", " moeten ", " wij ",
        " uw ", " bijvoorbeeld ", " melding ", " klep ", " pomp ", " storing ",
        " temperatuur ", " apparatuur ", " lekkage ", " defect ", " werkt niet ",
        " van ", " met ", " voor ", " bij ", " lekt ",
    )
    if any(m in low for m in nl_markers):
        return "nl"

    de_markers = (
        " der ", " die ", " das ", " und ", " ist ", " nicht ", " mit ", " eine ",
        " ein ", " dem ", " den ", " auch ", " aber ", " oder ", " pumpe ", " ventil ",
        " temperatur ", " undicht ", " defekt ", " stoerung ", " störung ", " meldung ",
        " bitte ", " kein ", " keine ", " funktioniert ", " gerät ", " anlage ",
    )
    if any(m in low for m in de_markers):
        return "de"

    en_markers = (
        " the ", " and ", " with ", " that ", " this ", " which ", " sensor ",
        " filter ", " valve ", " high ", " low ", " temperature ", " problem ",
        " issue ", " broken ", " leak ", " full ", " often ", " very ", " bearing ",
    )
    if any(m in low for m in en_markers):
        return "en"

    return "en"


def detect_entity_source_language(entity_data: dict, field_names: Optional[list] = None) -> str:
    """Detect the likely source language from several entity text fields."""
    samples = []
    for field in field_names or ("title", "name", "description"):
        value = entity_data.get(field)
        if value:
            samples.append(str(value))
    if not samples:
        return "en"
    return detect_text_language(" ".join(samples[:3]))
