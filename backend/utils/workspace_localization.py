"""
Localize observation workspace and AI insight payloads for non-English UI languages.
Uses stored entity_translations first, then on-demand AI translation for free text.
Translations are cached in translation_cache collection to avoid repeated API calls.
"""

from __future__ import annotations

import hashlib
import logging
import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from database import db
from models.translation import EntityType
from services.translation_service import TranslationService
from utils.text_language import detect_text_language

logger = logging.getLogger(__name__)

_TRANSLATABLE_LANGS = {"nl", "de"}
_UI_LANGUAGES = {"en", "nl", "de"}


async def _load_entity_fields(
    entity_type: EntityType,
    entity_id: str,
    language: str,
) -> Dict[str, str]:
    if not entity_id or language not in _UI_LANGUAGES:
        return {}
    fields: Dict[str, str] = {}
    async for doc in db.entity_translations.find(
        {
            "entity_type": entity_type.value,
            "entity_id": entity_id,
            "language_code": language,
        },
        {"_id": 0, "field_name": 1, "translation_value": 1},
    ):
        field = doc.get("field_name")
        value = doc.get("translation_value")
        if field and value:
            fields[field] = value
    return fields


async def load_entity_fields_batch(
    entity_type: EntityType,
    entity_ids: List[str],
    language: str,
) -> Dict[str, Dict[str, str]]:
    """Load translation fields for many entities in one query."""
    if not entity_ids or language not in _UI_LANGUAGES:
        return {}
    result: Dict[str, Dict[str, str]] = {}
    async for doc in db.entity_translations.find(
        {
            "entity_type": entity_type.value,
            "entity_id": {"$in": entity_ids},
            "language_code": language,
        },
        {"_id": 0, "entity_id": 1, "field_name": 1, "translation_value": 1},
    ):
        entity_id = doc.get("entity_id")
        field = doc.get("field_name")
        value = doc.get("translation_value")
        if entity_id and field and value:
            result.setdefault(entity_id, {})[field] = value
    return result


def _generate_cache_key(text: str, language: str, context: str) -> str:
    """Generate a unique cache key for the text."""
    content = f"{language}:{context}:{text}"
    return hashlib.sha256(content.encode()).hexdigest()


async def _get_cached_translation(cache_key: str) -> Optional[str]:
    """Retrieve cached translation from database."""
    doc = await db.translation_cache.find_one({"cache_key": cache_key})
    if doc and doc.get("translated_text"):
        return doc["translated_text"]
    return None


async def _store_cached_translation(cache_key: str, original: str, translated: str, language: str, context: str):
    """Store translation in database cache."""
    try:
        await db.translation_cache.update_one(
            {"cache_key": cache_key},
            {
                "$set": {
                    "original_text": original,
                    "translated_text": translated,
                    "language": language,
                    "context": context,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                "$setOnInsert": {
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True
        )
    except Exception as exc:
        logger.warning("Failed to cache translation: %s", exc)


async def translate_cached(
    service: TranslationService,
    text: Optional[str],
    language: str,
    cache: Dict[str, str],
    user_id: Optional[str],
    context: str = "industrial maintenance and reliability",
    source_language: Optional[str] = None,
) -> str:
    raw = (text or "").strip()
    if not raw or language not in _UI_LANGUAGES:
        return text or ""

    src = (source_language or detect_text_language(raw)).lower()[:2]
    if src == language:
        return raw
    
    # Check in-memory cache first
    memory_key = f"{src}:{language}:{raw}"
    if memory_key in cache:
        return cache[memory_key]
    
    # Check database cache
    db_cache_key = _generate_cache_key(raw, language, context)
    db_cached = await _get_cached_translation(db_cache_key)
    if db_cached:
        cache[memory_key] = db_cached
        return db_cached
    
    # Call translation service with retry for rate limits
    max_retries = 2
    retry_delay = 2  # seconds
    
    for attempt in range(max_retries + 1):
        try:
            translated, _ = await service.translate_text(
                raw,
                source_language=src,
                target_language=language,
                context=context,
                user_id=user_id or "system",
            )
            result = (translated or raw).strip() or raw
            
            # Store in database cache if translation was successful
            if result != raw:
                await _store_cached_translation(db_cache_key, raw, result, language, context)
            
            cache[memory_key] = result
            return result
        except Exception as exc:
            error_str = str(exc)
            # Check if it's a rate limit error
            if "429" in error_str or "rate limit" in error_str.lower():
                if attempt < max_retries:
                    logger.info(f"Rate limit hit, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    continue
            logger.warning("workspace localization translate failed: %s", exc)
            break
    
    # Return original text if all retries failed
    cache[memory_key] = raw
    return raw


async def _translate_many(
    service: TranslationService,
    items: List[tuple],
    language: str,
    cache: Dict[str, str],
    user_id: Optional[str],
) -> List[str]:
    """Translate many strings in parallel. Items are (text, context) tuples."""
    if not items:
        return []
    return list(await asyncio.gather(*[
        translate_cached(service, text, language, cache, user_id, context)
        for text, context in items
    ]))


async def localize_workspace_payload(
    payload: Dict[str, Any],
    language: Optional[str],
    *,
    user_id: Optional[str] = None,
    allow_live_translation: bool = False,
) -> Dict[str, Any]:
    """
    Apply translations to workspace text fields in-place and return payload.

    By default only stored entity_translations are applied (fast path).
    Set allow_live_translation=True to fall back to on-demand AI for missing strings.
    """
    lang = (language or "en").lower()[:2]
    if lang not in _UI_LANGUAGES:
        return payload

    service = TranslationService(db) if allow_live_translation else None
    cache: Dict[str, str] = {}

    observation = payload.get("observation") or {}
    failure_mode = payload.get("failure_mode") or {}
    investigation = payload.get("investigation") or {}
    obs_id = observation.get("id")
    fm_key = failure_mode.get("name") or observation.get("failure_mode")
    inv_id = investigation.get("id")

    obs_fields: Dict[str, str] = {}
    fm_fields: Dict[str, str] = {}
    inv_fields: Dict[str, str] = {}
    load_tasks = []
    load_keys = []
    if obs_id:
        load_tasks.append(_load_entity_fields(EntityType.OBSERVATION, obs_id, lang))
        load_keys.append("obs")
    if fm_key:
        load_tasks.append(_load_entity_fields(EntityType.FAILURE_MODE, fm_key, lang))
        load_keys.append("fm")
    if inv_id:
        load_tasks.append(_load_entity_fields(EntityType.INVESTIGATION, inv_id, lang))
        load_keys.append("inv")
    if load_tasks:
        loaded = await asyncio.gather(*load_tasks)
        for key, fields in zip(load_keys, loaded):
            if key == "obs":
                obs_fields = fields
            elif key == "fm":
                fm_fields = fields
            elif key == "inv":
                inv_fields = fields

    obs_translate_items: List[tuple] = []
    obs_translate_targets: List[str] = []
    if obs_fields.get("title"):
        observation["title"] = obs_fields["title"]
    elif observation.get("title"):
        obs_translate_targets.append("title")
        obs_translate_items.append((observation["title"], "industrial equipment observation title"))
    if obs_fields.get("description"):
        observation["description"] = obs_fields["description"]
    elif observation.get("description"):
        obs_translate_targets.append("description")
        obs_translate_items.append((observation["description"], "industrial equipment observation description"))
    if obs_fields.get("user_context"):
        observation["user_context"] = obs_fields["user_context"]
    elif observation.get("user_context"):
        obs_translate_targets.append("user_context")
        obs_translate_items.append((observation["user_context"], "industrial equipment observation description from field operator"))
    if obs_fields.get("name") and not obs_fields.get("title"):
        observation["title"] = obs_fields["name"]
    if allow_live_translation and obs_translate_items:
        translated_obs = await _translate_many(service, obs_translate_items, lang, cache, user_id)
        for target, value in zip(obs_translate_targets, translated_obs):
            observation[target] = value

    if fm_fields.get("name"):
        translated_name = fm_fields["name"]
        failure_mode["name"] = translated_name
        observation["failure_mode"] = translated_name

    ri = payload.get("reliability_intelligence") or {}
    mlc = ri.get("most_likely_cause") or {}
    if mlc.get("name"):
        name = mlc["name"]
        if fm_fields.get("name") and name.lower() == (fm_key or "").lower():
            mlc["name"] = fm_fields["name"]
        elif fm_fields.get("causes") and name in (fm_fields.get("causes") or ""):
            mlc["name"] = fm_fields["causes"]
        elif allow_live_translation:
            mlc["name"] = (await _translate_many(
                service, [(name, "industrial maintenance and reliability")], lang, cache, user_id
            ))[0]
        ri["most_likely_cause"] = mlc

    factors = ri.get("contributing_factors") or []
    factor_items = [
        (factor["factor"], "industrial maintenance and reliability")
        for factor in factors
        if isinstance(factor, dict) and factor.get("factor")
    ]
    if allow_live_translation and factor_items:
        translated_factors = await _translate_many(service, factor_items, lang, cache, user_id)
        idx = 0
        for factor in factors:
            if isinstance(factor, dict) and factor.get("factor"):
                factor["factor"] = translated_factors[idx]
                idx += 1
    ri["contributing_factors"] = factors
    payload["reliability_intelligence"] = ri

    recs = payload.get("recommended_actions") or []
    rec_items: List[tuple] = []
    rec_refs: List[tuple] = []
    for rec in recs:
        if not isinstance(rec, dict):
            continue
        for field, context in (
            ("title", "industrial maintenance and reliability"),
            ("expected_impact", "industrial maintenance and reliability"),
            ("why_recommended", "industrial maintenance and reliability"),
        ):
            if rec.get(field):
                rec_items.append((rec[field], context))
                rec_refs.append((rec, field))
    if allow_live_translation and rec_items:
        translated_recs = await _translate_many(service, rec_items, lang, cache, user_id)
        for (rec, field), value in zip(rec_refs, translated_recs):
            rec[field] = value
    payload["recommended_actions"] = recs

    if inv_fields.get("title"):
        investigation["title"] = inv_fields["title"]
    if inv_fields.get("name") and not inv_fields.get("title"):
        investigation["title"] = inv_fields["name"]

    action_plan = payload.get("action_plan") or []
    action_ids = [
        action.get("id")
        for action in action_plan
        if isinstance(action, dict) and action.get("id") and not str(action.get("id")).startswith("inv-")
    ]
    action_fields_map = await load_entity_fields_batch(EntityType.ACTION, action_ids, lang)

    synthetic_items: List[tuple] = []
    synthetic_refs: List[dict] = []
    for action in action_plan:
        if not isinstance(action, dict):
            continue
        action_id = action.get("id")
        if not action_id or str(action_id).startswith("inv-"):
            if action.get("title"):
                synthetic_items.append((action["title"], "industrial maintenance and reliability"))
                synthetic_refs.append(action)
            continue
        action_fields = action_fields_map.get(action_id, {})
        if action_fields.get("title"):
            action["title"] = action_fields["title"]
        elif action.get("title"):
            synthetic_items.append((action["title"], "industrial maintenance and reliability"))
            synthetic_refs.append(action)
        if action_fields.get("description"):
            action["description"] = action_fields["description"]

    if allow_live_translation and synthetic_items:
        translated_actions = await _translate_many(service, synthetic_items, lang, cache, user_id)
        for action, value in zip(synthetic_refs, translated_actions):
            action["title"] = value

    return payload


async def localize_ai_insights(
    insight: Optional[Dict[str, Any]],
    language: Optional[str],
    *,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Translate AI risk insight narrative fields for non-English UI."""
    if not insight:
        return insight
    lang = (language or "en").lower()[:2]
    if lang not in _UI_LANGUAGES:
        return insight

    service = TranslationService(db)
    cache: Dict[str, str] = {}
    data = dict(insight)

    if data.get("summary"):
        data["summary"] = await translate_cached(
            service, data["summary"], lang, cache, user_id, "AI reliability risk analysis"
        )

    key_insights = data.get("key_insights") or []
    translated_insights: List[Any] = []
    for item in key_insights:
        if isinstance(item, str):
            translated_insights.append(
                await translate_cached(service, item, lang, cache, user_id, "reliability insight")
            )
        elif isinstance(item, dict):
            copy = dict(item)
            for field in ("insight", "title", "description", "text"):
                if copy.get(field):
                    copy[field] = await translate_cached(
                        service, copy[field], lang, cache, user_id, "reliability insight"
                    )
            translated_insights.append(copy)
        else:
            translated_insights.append(item)
    data["key_insights"] = translated_insights

    recommendations = data.get("recommendations") or []
    translated_recs: List[Any] = []
    for rec in recommendations:
        if isinstance(rec, str):
            translated_recs.append(
                await translate_cached(service, rec, lang, cache, user_id, "maintenance recommendation")
            )
        elif isinstance(rec, dict):
            copy = dict(rec)
            for field in ("action", "title", "description", "impact", "expected_impact"):
                if copy.get(field):
                    copy[field] = await translate_cached(
                        service, copy[field], lang, cache, user_id, "maintenance recommendation"
                    )
            translated_recs.append(copy)
        else:
            translated_recs.append(rec)
    data["recommendations"] = translated_recs

    drivers = data.get("risk_drivers") or []
    translated_drivers: List[Any] = []
    for driver in drivers:
        if isinstance(driver, str):
            translated_drivers.append(
                await translate_cached(service, driver, lang, cache, user_id, "risk driver")
            )
        elif isinstance(driver, dict):
            copy = dict(driver)
            for field in ("driver", "title", "description", "text"):
                if copy.get(field):
                    copy[field] = await translate_cached(
                        service, copy[field], lang, cache, user_id, "risk driver"
                    )
            translated_drivers.append(copy)
        else:
            translated_drivers.append(driver)
    data["risk_drivers"] = translated_drivers

    # Translate factors (key risk factors) - these are the detailed risk analysis items
    factors = data.get("factors") or []
    translated_factors: List[Any] = []
    for factor in factors:
        if isinstance(factor, str):
            translated_factors.append(
                await translate_cached(service, factor, lang, cache, user_id, "industrial equipment risk factor analysis")
            )
        elif isinstance(factor, dict):
            copy = dict(factor)
            for field in ("factor", "title", "description", "text", "analysis"):
                if copy.get(field):
                    copy[field] = await translate_cached(
                        service, copy[field], lang, cache, user_id, "industrial equipment risk factor analysis"
                    )
            translated_factors.append(copy)
        else:
            translated_factors.append(factor)
    data["factors"] = translated_factors

    # Also translate factors in dynamic_risk if present
    dyn = data.get("dynamic_risk")
    if isinstance(dyn, dict):
        dyn_factors = dyn.get("factors") or []
        translated_dyn_factors: List[Any] = []
        for factor in dyn_factors:
            if isinstance(factor, str):
                translated_dyn_factors.append(
                    await translate_cached(service, factor, lang, cache, user_id, "industrial equipment risk factor analysis")
                )
            elif isinstance(factor, dict):
                copy = dict(factor)
                for field in ("factor", "title", "description", "text", "analysis"):
                    if copy.get(field):
                        copy[field] = await translate_cached(
                            service, copy[field], lang, cache, user_id, "industrial equipment risk factor analysis"
                        )
                translated_dyn_factors.append(copy)
            else:
                translated_dyn_factors.append(factor)
        dyn["factors"] = translated_dyn_factors
        data["dynamic_risk"] = dyn

    forecasts = data.get("forecasts") or []
    for forecast in forecasts:
        if isinstance(forecast, dict) and forecast.get("description"):
            forecast["description"] = await translate_cached(
                service, forecast["description"], lang, cache, user_id, "risk forecast"
            )
    data["forecasts"] = forecasts

    dyn = data.get("dynamic_risk")
    if isinstance(dyn, dict) and dyn.get("time_to_failure_display"):
        dyn["time_to_failure_display"] = await translate_cached(
            service,
            dyn["time_to_failure_display"],
            lang,
            cache,
            user_id,
            "time to failure estimate",
        )
        data["dynamic_risk"] = dyn

    return data


async def localize_causal_analysis(
    analysis: Optional[Dict[str, Any]],
    language: Optional[str],
    *,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Translate AI causal analysis narrative fields for non-English UI."""
    if not analysis:
        return analysis
    lang = (language or "en").lower()[:2]
    if lang not in _UI_LANGUAGES:
        return analysis

    service = TranslationService(db)
    cache: Dict[str, str] = {}
    data = dict(analysis)

    if data.get("summary"):
        data["summary"] = await translate_cached(
            service, data["summary"], lang, cache, user_id, "causal root cause analysis"
        )

    causes = data.get("probable_causes") or []
    translated_causes: List[Any] = []
    for cause in causes:
        if not isinstance(cause, dict):
            translated_causes.append(cause)
            continue
        copy = dict(cause)
        if copy.get("description"):
            copy["description"] = await translate_cached(
                service, copy["description"], lang, cache, user_id, "probable failure cause"
            )
        evidence = copy.get("evidence") or []
        if evidence:
            copy["evidence"] = [
                await translate_cached(service, item, lang, cache, user_id, "supporting evidence")
                if isinstance(item, str)
                else item
                for item in evidence
            ]
        supporting_data = copy.get("supporting_data") or []
        if supporting_data:
            copy["supporting_data"] = [
                await translate_cached(service, item, lang, cache, user_id, "supporting data")
                if isinstance(item, str)
                else item
                for item in supporting_data
            ]
        mitigations = copy.get("mitigation_actions") or []
        if mitigations:
            translated_mits: List[Any] = []
            for action in mitigations:
                if isinstance(action, str):
                    translated_mits.append(
                        await translate_cached(
                            service, action, lang, cache, user_id, "mitigation action"
                        )
                    )
                elif isinstance(action, dict):
                    act_copy = dict(action)
                    for field in ("action", "title", "description"):
                        if act_copy.get(field):
                            act_copy[field] = await translate_cached(
                                service, act_copy[field], lang, cache, user_id, "mitigation action"
                            )
                    translated_mits.append(act_copy)
                else:
                    translated_mits.append(action)
            copy["mitigation_actions"] = translated_mits
        translated_causes.append(copy)
    data["probable_causes"] = translated_causes

    factors = data.get("contributing_factors") or []
    data["contributing_factors"] = [
        await translate_cached(service, factor, lang, cache, user_id, "contributing factor")
        if isinstance(factor, str)
        else factor
        for factor in factors
    ]

    return data
