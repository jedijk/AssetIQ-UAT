"""Keyword and entity-translation helpers for multilingual equipment hierarchy search."""

from __future__ import annotations

from typing import Any, Dict, List, Set, Tuple

from models.translation import EntityType
from utils.mongo_regex import case_insensitive_contains

# Dutch equipment terms → English search terms (stored DB values are usually English).
DUTCH_TO_ENGLISH: Dict[str, str] = {
    "moter": "motor",
    "pomp": "pump",
    "compressor": "compressor",
    "ventilator": "fan",
    "ventiel": "valve",
    "klep": "valve",
    "motor": "motor",
    "kraan": "crane",
    "hijskraan": "crane",
    "lager": "bearing",
    "koppeling": "coupling",
    "as": "shaft",
    "tandwiel": "gear",
    "versnellingsbak": "gearbox",
    "reductor": "gearbox",
    "aandrijving": "drive",
    "transportband": "conveyor",
    "oven": "furnace",
    "ketel": "boiler",
    "warmtewisselaar": "heat exchanger",
    "koeler": "cooler",
    "filter": "filter",
    "cilinder": "cylinder",
    "zuiger": "piston",
    "schroef": "screw",
    "bout": "bolt",
    "pakking": "gasket",
    "afdichting": "seal",
    "sensor": "sensor",
    "schakelaar": "switch",
    "transformator": "transformer",
    "generator": "generator",
    "elektromotor": "electric motor",
}

# German equipment terms → English search terms.
GERMAN_TO_ENGLISH: Dict[str, str] = {
    "pumpe": "pump",
    "motor": "motor",
    "ventil": "valve",
    "ventilator": "fan",
    "kompressor": "compressor",
    "filter": "filter",
    "lager": "bearing",
    "kupplung": "coupling",
    "welle": "shaft",
    "zahnrad": "gear",
    "getriebe": "gearbox",
    "antrieb": "drive",
    "förderband": "conveyor",
    "foerderband": "conveyor",
    "ofen": "furnace",
    "kessel": "boiler",
    "wärmetauscher": "heat exchanger",
    "waermetauscher": "heat exchanger",
    "kühler": "cooler",
    "kuehler": "cooler",
    "zylinder": "cylinder",
    "kolben": "piston",
    "schraube": "screw",
    "bolzen": "bolt",
    "dichtung": "seal",
    "dichtungsring": "gasket",
    "packung": "gasket",
    "sensor": "sensor",
    "schalter": "switch",
    "transformator": "transformer",
    "generator": "generator",
    "elektromotor": "electric motor",
    "kran": "crane",
    "rohr": "pipe",
    "leitung": "pipe",
    "behälter": "vessel",
    "behaelter": "vessel",
    "rührer": "agitator",
    "ruehrer": "agitator",
    "mischer": "mixer",
}

_LOCALE_MAPS = (DUTCH_TO_ENGLISH, GERMAN_TO_ENGLISH)
_TRANSLATION_LANGS = ("nl", "de")
_SCORING_FIELDS = ("name", "description", "equipment_type", "equipment_type_name")


def expand_equipment_keywords(keywords: List[str]) -> List[str]:
    """Add English equivalents for Dutch/German equipment keywords."""
    expanded: List[str] = []
    seen: Set[str] = set()
    for kw in keywords:
        if kw not in seen:
            expanded.append(kw)
            seen.add(kw)
        kw_lower = kw.lower()
        for locale_map in _LOCALE_MAPS:
            translated = locale_map.get(kw_lower)
            if translated and translated not in seen:
                expanded.append(translated)
                seen.add(translated)
    return expanded


def translation_search_languages(ui_language: str | None) -> Tuple[str, ...]:
    """Languages to query in entity_translations for equipment search."""
    ul = (ui_language or "en").lower()[:2]
    if ul == "nl":
        return ("nl",)
    if ul == "de":
        return ("de",)
    return _TRANSLATION_LANGS


def translation_search_languages_for_text(
    search_text: str,
    ui_language: str | None,
) -> Tuple[str, ...]:
    """Include translation lookups for every language present in mixed operator text."""
    from utils.text_language import language_scores

    ul = (ui_language or "en").lower()[:2]
    scores = language_scores(search_text or "")
    langs: set = set()
    if ul in _TRANSLATION_LANGS:
        langs.add(ul)
    for code in _TRANSLATION_LANGS:
        if scores.get(code, 0) >= 1:
            langs.add(code)
    if langs:
        return tuple(sorted(langs))
    return translation_search_languages(ui_language)


async def find_entity_ids_by_translation(
    db,
    keywords: List[str],
    language_codes: Tuple[str, ...] | List[str],
) -> Tuple[Set[str], Set[str]]:
    """Return (equipment_node_ids, equipment_type_ids) matching translated text."""
    langs = [code for code in language_codes if code in _TRANSLATION_LANGS]
    if not keywords or not langs:
        return set(), set()

    node_or: List[Dict[str, Any]] = []
    type_or: List[Dict[str, Any]] = []
    for kw in keywords:
        match = case_insensitive_contains(kw)
        if not match:
            continue
        node_or.append({"translation_value": match})
        type_or.append({"translation_value": match})

    node_ids: Set[str] = set()
    type_ids: Set[str] = set()

    if node_or:
        async for doc in db.entity_translations.find(
            {
                "entity_type": EntityType.EQUIPMENT_NODE.value,
                "language_code": {"$in": langs},
                "$or": node_or,
            },
            {"_id": 0, "entity_id": 1},
        ):
            entity_id = doc.get("entity_id")
            if entity_id:
                node_ids.add(entity_id)

    if type_or:
        async for doc in db.entity_translations.find(
            {
                "entity_type": EntityType.EQUIPMENT_TYPE.value,
                "language_code": {"$in": langs},
                "$or": type_or,
            },
            {"_id": 0, "entity_id": 1},
        ):
            entity_id = doc.get("entity_id")
            if entity_id:
                type_ids.add(entity_id)

    return node_ids, type_ids


async def load_equipment_translation_fields(
    db,
    entity_ids: List[str],
    language_codes: Tuple[str, ...] | List[str],
) -> Dict[str, Dict[str, Dict[str, str]]]:
    """
    Load translated fields keyed by language then entity_id.
    Returns {lang: {entity_id: {field_name: value}}}.
    """
    langs = [code for code in language_codes if code in _TRANSLATION_LANGS]
    if not entity_ids or not langs:
        return {}

    by_lang: Dict[str, Dict[str, Dict[str, str]]] = {lang: {} for lang in langs}
    async for doc in db.entity_translations.find(
        {
            "entity_type": EntityType.EQUIPMENT_NODE.value,
            "entity_id": {"$in": entity_ids},
            "language_code": {"$in": langs},
        },
        {"_id": 0, "entity_id": 1, "language_code": 1, "field_name": 1, "translation_value": 1},
    ):
        entity_id = doc.get("entity_id")
        lang = doc.get("language_code")
        field = doc.get("field_name")
        value = doc.get("translation_value")
        if entity_id and lang in by_lang and field in _SCORING_FIELDS and value:
            by_lang[lang].setdefault(entity_id, {})[field] = value
    return by_lang


def score_keyword_against_translations(
    keywords: List[str],
    translations_by_lang: Dict[str, Dict[str, Dict[str, str]]],
    entity_id: str,
) -> int:
    """Score keyword hits against stored NL/DE equipment_node translations."""
    score = 0
    for lang_map in translations_by_lang.values():
        fields = lang_map.get(entity_id, {})
        if not fields:
            continue
        name = (fields.get("name") or "").lower()
        desc = (fields.get("description") or "").lower()
        eq_type = (fields.get("equipment_type") or fields.get("equipment_type_name") or "").lower()
        for kw in keywords:
            if kw in name:
                score += 10
            if kw in eq_type:
                score += 5
            if kw in desc:
                score += 3
    return score
