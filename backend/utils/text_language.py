"""Text language detection and mixed-language handling for chat and localization."""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# Common function words per language (lowercase). Used for scoring, not hard rules.
_LANG_WORDS: Dict[str, set] = {
    "nl": {
        "de", "het", "een", "van", "en", "dat", "niet", "op", "zijn", "voor", "met",
        "aan", "er", "ook", "maar", "als", "nog", "wel", "geen", "moet", "wordt",
        "naar", "bij", "dit", "wat", "meer", "uit", "over", "zo", "dan", "hun",
        "werd", "heeft", "hoe", "nee", "ja", "kapot", "stuk", "lek", "pomp", "klep",
        "sensor", "storing", "onderhoud", "controleer", "draait", "temperatuur",
        "apparatuur", "lekkage", "defect", "melding", "graag", "deze", "alleen",
    },
    "de": {
        "der", "die", "das", "und", "ist", "nicht", "mit", "eine", "ein", "dem",
        "den", "auch", "aber", "oder", "für", "auf", "aus", "bei", "wie", "noch",
        "wird", "kann", "nach", "zum", "zur", "bitte", "kein", "keine", "pumpe",
        "ventil", "sensor", "defekt", "undicht", "temperatur", "anlage", "gerät",
        "stoerung", "störung", "meldung", "funktioniert",
    },
    "en": {
        "the", "and", "with", "that", "this", "which", "from", "have", "has",
        "was", "were", "been", "being", "problem", "issue", "broken", "leak",
        "temperature", "sensor", "filter", "valve", "pump", "motor", "bearing",
        "high", "low", "very", "full", "often", "noise", "vibration", "failed",
    },
}

_MARKER_BOOST = {
    "nl": (
        " het ", " een ", " niet ", " naar ", " deze ", " wordt ", " graag ",
        " geen ", " ook ", " alleen ", " kunt ", " kunnen ", " moeten ", " wij ",
        " uw ", " bijvoorbeeld ", " melding ", " klep ", " pomp ", " storing ",
        " temperatuur ", " apparatuur ", " lekkage ", " defect ", " werkt niet ",
    ),
    "de": (
        " der ", " die ", " das ", " und ", " ist ", " nicht ", " mit ", " eine ",
        " ein ", " dem ", " den ", " auch ", " aber ", " oder ", " pumpe ", " ventil ",
        " temperatur ", " undicht ", " defekt ", " stoerung ", " störung ", " meldung ",
        " bitte ", " kein ", " keine ", " funktioniert ", " gerät ", " anlage ",
    ),
    "en": (
        " the ", " and ", " with ", " that ", " this ", " which ", " sensor ",
        " filter ", " valve ", " high ", " low ", " temperature ", " problem ",
        " issue ", " broken ", " leak ", " full ", " often ", " very ", " bearing ",
    ),
}

_SUPPORTED = frozenset({"en", "nl", "de"})
_STRONG_SCORE = 2


def _tokenize(text: str) -> set:
    return set(re.findall(r"[a-zA-ZÀ-ÿ']+", (text or "").lower()))


def _marker_score(text: str, lang: str) -> int:
    low = f" {(text or '').lower()} "
    return sum(1 for m in _MARKER_BOOST.get(lang, ()) if m in low)


def language_scores(text: str) -> Dict[str, int]:
    """Score en/nl/de signal strength for a text snippet."""
    words = _tokenize(text)
    scores = {lang: len(words & wordset) for lang, wordset in _LANG_WORDS.items()}
    for lang in _SUPPORTED:
        scores[lang] += _marker_score(text, lang)
    return scores


def analyze_text_languages(text: str) -> Dict[str, object]:
    """
    Analyze language usage in text.

    Returns primary language, active languages, and whether the text looks mixed.
    """
    scores = language_scores(text)
    active = [lang for lang in _SUPPORTED if scores.get(lang, 0) >= 1]
    strong = [lang for lang in _SUPPORTED if scores.get(lang, 0) >= _STRONG_SCORE]
    primary = max(_SUPPORTED, key=lambda lang: scores.get(lang, 0))
    if scores.get(primary, 0) < 1:
        primary = "en"
    is_mixed = len(strong) >= 2
    languages: List[str] = sorted(active, key=lambda lang: -scores.get(lang, 0))
    return {
        "scores": scores,
        "primary": primary,
        "languages": languages,
        "is_mixed": is_mixed,
    }


def detect_language(text: str) -> str:
    """Return the dominant language code (en, nl, de). Defaults to en."""
    return str(analyze_text_languages(text).get("primary") or "en")


def detect_text_language(text: str) -> str:
    """Backward-compatible alias used by observation localization."""
    return detect_language(text)


def resolve_chat_ui_language(
    text: str,
    *,
    explicit: Optional[str] = None,
    fallback: str = "en",
    sticky: Optional[str] = None,
    short_command: bool = False,
) -> Tuple[str, Dict[str, object]]:
    """
    Pick assistant UI language for chat prompts.

    Mixed-language operator text keeps UI chrome in fallback/sticky language while
    AI summaries preserve the user's language mix.
    """
    profile = analyze_text_languages(text)
    fb = (fallback or "en").lower()[:2]
    if fb not in _SUPPORTED:
        fb = "en"

    if short_command and sticky and sticky.lower()[:2] in _SUPPORTED:
        return sticky.lower()[:2], profile

    exp = (explicit or "").lower()[:2]
    if exp in _SUPPORTED and not profile.get("is_mixed"):
        if profile["scores"].get(exp, 0) >= 1 or profile["scores"].get(profile["primary"], 0) < _STRONG_SCORE:
            return exp, profile

    if profile.get("is_mixed"):
        return fb, profile

    primary = profile.get("primary") or "en"
    if profile["scores"].get(primary, 0) >= _STRONG_SCORE:
        return str(primary), profile

    return fb, profile


def ai_language_instruction(text: str, fallback: str = "en") -> str:
    """System prompt fragment: match operator language, including mixed entry."""
    profile = analyze_text_languages(text)
    names = {"en": "English", "nl": "Dutch", "de": "German"}
    if profile.get("is_mixed"):
        langs = profile.get("languages") or []
        label = " and ".join(names.get(lang, lang) for lang in langs[:3]) or names.get(fallback, "English")
        return (
            f"The operator wrote in a mix of {label}. Mirror their language mix in your output "
            "(mixed sentences are fine). Preserve equipment tags, codes, and technical terms exactly."
        )
    primary = str(profile.get("primary") or fallback or "en")
    return (
        f"Write in {names.get(primary, 'English')}. "
        "Preserve equipment tags, codes, and technical terms exactly."
    )


def detect_entity_source_language(entity_data: dict, field_names: Optional[list] = None) -> str:
    """Detect the likely source language from several entity text fields."""
    samples = []
    for field in field_names or ("title", "name", "description"):
        value = entity_data.get(field)
        if value:
            samples.append(str(value))
    if not samples:
        return "en"
    return detect_language(" ".join(samples[:3]))
