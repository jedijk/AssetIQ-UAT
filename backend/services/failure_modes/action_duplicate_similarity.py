"""Lexical helpers for near-duplicate recommended action detection."""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Set

# Lighter stopword list — drop filler verbs so task substance tokens dominate.
_ACTION_DUP_STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "and", "or", "by", "to", "for",
    "from", "with", "at", "per", "every", "each", "all", "proper", "proactively",
    "frequency", "monthly", "weekly", "annual", "task", "pm", "action",
    "check", "ensure", "verify", "inspect", "listen", "monitor", "measure",
    "rotating", "mechanical", "laboratory", "electrical", "instrumentation",
    "condition",
}

_ACTION_DUP_SYNONYMS = {
    "lubrication": "lube",
    "lubricate": "lube",
    "lube": "lube",
    "grease": "lube",
    "greasing": "lube",
    "oil": "lube",
    "bearings": "bearing",
    "bearing": "bearing",
    "replacement": "replace",
    "replace": "replace",
    "replaced": "replace",
    "replacing": "replace",
    "worn": "wear",
    "wear": "wear",
    "failure": "fail",
    "failed": "fail",
    "temperatures": "temperature",
    "temperature": "temperature",
    "noise": "bearing_pdm",
    "vibration": "bearing_pdm",
    "levels": "bearing_pdm",
}

_LUBE_INTENT = {"lube"}
_BEARING_PDM_INTENT = {"bearing", "bearing_pdm", "temperature"}


def strip_duplicate_action_annotations(text: str) -> str:
    """Remove discipline/equipment bracket tags and frequency suffixes."""
    cleaned = re.sub(r"\(\s*frequency\s*:.*?\)", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[[^\]]*\]", "", cleaned)
    cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _stem_token(token: str) -> str:
    if len(token) > 4 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def duplicate_action_tokens(normalized_text: str) -> Set[str]:
    text = strip_duplicate_action_annotations(normalized_text)
    tokens: Set[str] = set()
    for raw in (text or "").split():
        if raw in _ACTION_DUP_STOPWORDS or len(raw) <= 2:
            continue
        token = _ACTION_DUP_SYNONYMS.get(_stem_token(raw), _stem_token(raw))
        tokens.add(token)
    return tokens


def duplicate_action_jaccard(norm_a: str, norm_b: str) -> float:
    ta, tb = duplicate_action_tokens(norm_a), duplicate_action_tokens(norm_b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _shared_maintenance_intent(norm_a: str, norm_b: str) -> bool:
    """Detect same maintenance scope when wording differs (lube, bearing PDM)."""
    ta, tb = duplicate_action_tokens(norm_a), duplicate_action_tokens(norm_b)
    if ta & _LUBE_INTENT and tb & _LUBE_INTENT:
        return True
    bearing_a = "bearing" in ta
    bearing_b = "bearing" in tb
    pdm_a = bool(ta & {"bearing_pdm", "temperature"})
    pdm_b = bool(tb & {"bearing_pdm", "temperature"})
    if bearing_a and bearing_b and pdm_a and pdm_b:
        return True
    return False


def actions_similar_for_duplicates(
    norm_a: str,
    norm_b: str,
    *,
    general_jaccard: float,
    ratio_threshold: float,
    jaccard_threshold: float,
    strict_pairing: bool = False,
) -> bool:
    clean_a = strip_duplicate_action_annotations(norm_a)
    clean_b = strip_duplicate_action_annotations(norm_b)
    if clean_a and clean_a == clean_b:
        return True
    if not clean_a or not clean_b:
        return False
    if _shared_maintenance_intent(clean_a, clean_b):
        return True
    ratio = SequenceMatcher(None, clean_a, clean_b).ratio()
    dup_jacc = duplicate_action_jaccard(clean_a, clean_b)
    if strict_pairing:
        return (
            (ratio >= ratio_threshold and general_jaccard >= jaccard_threshold)
            or ratio >= 0.88
            or dup_jacc >= 0.42
        )
    return (
        ratio >= ratio_threshold
        or general_jaccard >= jaccard_threshold
        or dup_jacc >= 0.38
    )
