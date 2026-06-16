"""Lexical helpers for near-duplicate recommended action detection."""
from __future__ import annotations

from difflib import SequenceMatcher
from typing import Set

# Lighter stopword list than general action matching — keep maintenance verbs.
_ACTION_DUP_STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "and", "or", "by", "to", "for",
    "from", "with", "at", "per", "every", "each", "all", "proper",
    "frequency", "monthly", "weekly", "annual", "task", "pm", "action",
}

_ACTION_DUP_SYNONYMS = {
    "lubrication": "lube",
    "lubricate": "lube",
    "lube": "lube",
    "grease": "lube",
    "greasing": "lube",
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
}


def _stem_token(token: str) -> str:
    if len(token) > 4 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def duplicate_action_tokens(normalized_text: str) -> Set[str]:
    tokens: Set[str] = set()
    for raw in (normalized_text or "").split():
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


def actions_similar_for_duplicates(
    norm_a: str,
    norm_b: str,
    *,
    general_jaccard: float,
    ratio_threshold: float,
    jaccard_threshold: float,
    strict_pairing: bool = False,
) -> bool:
    if norm_a and norm_a == norm_b:
        return True
    if not norm_a or not norm_b:
        return False
    ratio = SequenceMatcher(None, norm_a, norm_b).ratio()
    dup_jacc = duplicate_action_jaccard(norm_a, norm_b)
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
