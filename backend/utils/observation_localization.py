"""Localize observation/threat text fields for the active UI language."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from database import db
from models.translation import EntityType
from services.translation_service import TranslationService
from utils.text_language import detect_text_language
from utils.workspace_localization import (
    _load_entity_fields_batch,
    _translate_cached,
)

logger = logging.getLogger(__name__)

UI_LANGUAGES = {"en", "nl", "de"}
_OBSERVATION_TEXT_FIELDS = ("title", "description", "user_context")


async def localize_observation_record(
    observation: Dict[str, Any],
    target_lang: str,
    *,
    stored_fields: Optional[Dict[str, str]] = None,
    service: Optional[TranslationService] = None,
    cache: Optional[Dict[str, str]] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Return a copy of the observation with title/description localized."""
    lang = (target_lang or "en").lower()[:2]
    if lang not in UI_LANGUAGES or not observation:
        return observation

    result = dict(observation)
    fields = stored_fields or {}
    svc = service or TranslationService(db)
    mem_cache = cache if cache is not None else {}

    translate_items: List[tuple] = []
    translate_targets: List[str] = []

    for field in _OBSERVATION_TEXT_FIELDS:
        translated = fields.get(field)
        if field == "title" and not translated:
            translated = fields.get("name")
        if translated:
            result[field] = translated
            continue

        raw = observation.get(field)
        if not raw:
            continue

        source_lang = detect_text_language(str(raw))
        if source_lang == lang:
            continue

        translate_targets.append(field)
        context = (
            "industrial equipment observation title"
            if field == "title"
            else "industrial equipment observation description"
        )
        translate_items.append((str(raw), context, source_lang))

    if translate_items:
        translated_values = await asyncio.gather(*[
            _translate_cached(
                svc,
                text,
                lang,
                mem_cache,
                user_id,
                context,
                source_language=source_lang,
            )
            for text, context, source_lang in translate_items
        ])
        for field, value in zip(translate_targets, translated_values):
            result[field] = value

    return result


async def enrich_observations_for_ui(
    observations: List[Dict[str, Any]],
    target_lang: str,
    *,
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Localize a list of observations/threats for the requested UI language."""
    lang = (target_lang or "en").lower()[:2]
    if lang not in UI_LANGUAGES or not observations:
        return observations

    obs_ids = [obs.get("id") for obs in observations if obs.get("id")]
    stored_by_id = await _load_entity_fields_batch(EntityType.OBSERVATION, obs_ids, lang)

    service = TranslationService(db)
    cache: Dict[str, str] = {}
    localized: List[Dict[str, Any]] = []

    for obs in observations:
        obs_id = obs.get("id")
        stored = stored_by_id.get(obs_id, {}) if obs_id else {}
        localized.append(
            await localize_observation_record(
                obs,
                lang,
                stored_fields=stored,
                service=service,
                cache=cache,
                user_id=user_id,
            )
        )

    return localized
