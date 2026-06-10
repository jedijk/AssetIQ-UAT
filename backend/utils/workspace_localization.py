"""
Localize observation workspace and AI insight payloads for non-English UI languages.
Uses stored entity_translations first, then on-demand AI translation for free text.
Translations are cached in translation_cache collection to avoid repeated API calls.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from database import db
from models.translation import EntityType
from services.translation_service import TranslationService

logger = logging.getLogger(__name__)

_TRANSLATABLE_LANGS = {"nl", "de"}


async def _load_entity_fields(
    entity_type: EntityType,
    entity_id: str,
    language: str,
) -> Dict[str, str]:
    if not entity_id or language not in _TRANSLATABLE_LANGS:
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


async def _translate_cached(
    service: TranslationService,
    text: Optional[str],
    language: str,
    cache: Dict[str, str],
    user_id: Optional[str],
    context: str = "industrial maintenance and reliability",
) -> str:
    raw = (text or "").strip()
    if not raw or language not in _TRANSLATABLE_LANGS:
        return text or ""
    
    # Check in-memory cache first
    memory_key = f"{language}:{raw}"
    if memory_key in cache:
        return cache[memory_key]
    
    # Check database cache
    db_cache_key = _generate_cache_key(raw, language, context)
    db_cached = await _get_cached_translation(db_cache_key)
    if db_cached:
        cache[memory_key] = db_cached
        return db_cached
    
    # Call translation service with retry for rate limits
    import asyncio
    max_retries = 2
    retry_delay = 2  # seconds
    
    for attempt in range(max_retries + 1):
        try:
            translated, _ = await service.translate_text(
                raw,
                source_language="en",
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


async def localize_workspace_payload(
    payload: Dict[str, Any],
    language: Optional[str],
    *,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply translations to workspace text fields in-place and return payload."""
    lang = (language or "en").lower()[:2]
    if lang not in _TRANSLATABLE_LANGS:
        return payload

    service = TranslationService(db)
    cache: Dict[str, str] = {}

    observation = payload.get("observation") or {}
    obs_id = observation.get("id")
    if obs_id:
        obs_fields = await _load_entity_fields(EntityType.OBSERVATION, obs_id, lang)
        if obs_fields.get("title"):
            observation["title"] = obs_fields["title"]
        elif observation.get("title"):
            # No stored translation - translate on-the-fly via AI
            observation["title"] = await _translate_cached(
                service, observation["title"], lang, cache, user_id,
                context="industrial equipment observation title"
            )
        if obs_fields.get("description"):
            observation["description"] = obs_fields["description"]
        elif observation.get("description"):
            # No stored translation - translate on-the-fly via AI
            observation["description"] = await _translate_cached(
                service, observation["description"], lang, cache, user_id,
                context="industrial equipment observation description"
            )
        # Translate user_context (the description text shown in green box)
        if obs_fields.get("user_context"):
            observation["user_context"] = obs_fields["user_context"]
        elif observation.get("user_context"):
            # No stored translation - translate on-the-fly via AI
            observation["user_context"] = await _translate_cached(
                service, observation["user_context"], lang, cache, user_id,
                context="industrial equipment observation description from field operator"
            )
        if obs_fields.get("name") and not obs_fields.get("title"):
            observation["title"] = obs_fields["name"]

    failure_mode = payload.get("failure_mode") or {}
    fm_key = failure_mode.get("name") or observation.get("failure_mode")
    fm_fields: Dict[str, str] = {}
    if fm_key:
        fm_fields = await _load_entity_fields(EntityType.FAILURE_MODE, fm_key, lang)
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
        else:
            mlc["name"] = await _translate_cached(service, name, lang, cache, user_id)
        ri["most_likely_cause"] = mlc

    factors = ri.get("contributing_factors") or []
    for factor in factors:
        if isinstance(factor, dict) and factor.get("factor"):
            factor["factor"] = await _translate_cached(
                service, factor["factor"], lang, cache, user_id
            )
    ri["contributing_factors"] = factors
    payload["reliability_intelligence"] = ri

    recs = payload.get("recommended_actions") or []
    for rec in recs:
        if not isinstance(rec, dict):
            continue
        if rec.get("title"):
            rec["title"] = await _translate_cached(service, rec["title"], lang, cache, user_id)
        if rec.get("expected_impact"):
            rec["expected_impact"] = await _translate_cached(
                service, rec["expected_impact"], lang, cache, user_id
            )
        if rec.get("why_recommended"):
            rec["why_recommended"] = await _translate_cached(
                service, rec["why_recommended"], lang, cache, user_id
            )
    payload["recommended_actions"] = recs

    investigation = payload.get("investigation") or {}
    if investigation.get("id"):
        inv_fields = await _load_entity_fields(
            EntityType.INVESTIGATION, investigation["id"], lang
        )
        if inv_fields.get("title"):
            investigation["title"] = inv_fields["title"]
        if inv_fields.get("name") and not inv_fields.get("title"):
            investigation["title"] = inv_fields["name"]

    action_plan = payload.get("action_plan") or []
    for action in action_plan:
        if not isinstance(action, dict):
            continue
        action_id = action.get("id")
        if not action_id or str(action_id).startswith("inv-"):
            if action.get("title"):
                action["title"] = await _translate_cached(
                    service, action["title"], lang, cache, user_id
                )
            continue
        action_fields = await _load_entity_fields(EntityType.ACTION, action_id, lang)
        if action_fields.get("title"):
            action["title"] = action_fields["title"]
        elif action.get("title"):
            action["title"] = await _translate_cached(
                service, action["title"], lang, cache, user_id
            )
        if action_fields.get("description"):
            action["description"] = action_fields["description"]

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
    if lang not in _TRANSLATABLE_LANGS:
        return insight

    service = TranslationService(db)
    cache: Dict[str, str] = {}
    data = dict(insight)

    if data.get("summary"):
        data["summary"] = await _translate_cached(
            service, data["summary"], lang, cache, user_id, "AI reliability risk analysis"
        )

    key_insights = data.get("key_insights") or []
    translated_insights: List[Any] = []
    for item in key_insights:
        if isinstance(item, str):
            translated_insights.append(
                await _translate_cached(service, item, lang, cache, user_id, "reliability insight")
            )
        elif isinstance(item, dict):
            copy = dict(item)
            for field in ("insight", "title", "description", "text"):
                if copy.get(field):
                    copy[field] = await _translate_cached(
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
                await _translate_cached(service, rec, lang, cache, user_id, "maintenance recommendation")
            )
        elif isinstance(rec, dict):
            copy = dict(rec)
            for field in ("action", "title", "description", "impact", "expected_impact"):
                if copy.get(field):
                    copy[field] = await _translate_cached(
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
                await _translate_cached(service, driver, lang, cache, user_id, "risk driver")
            )
        elif isinstance(driver, dict):
            copy = dict(driver)
            for field in ("driver", "title", "description", "text"):
                if copy.get(field):
                    copy[field] = await _translate_cached(
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
                await _translate_cached(service, factor, lang, cache, user_id, "industrial equipment risk factor analysis")
            )
        elif isinstance(factor, dict):
            copy = dict(factor)
            for field in ("factor", "title", "description", "text", "analysis"):
                if copy.get(field):
                    copy[field] = await _translate_cached(
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
                    await _translate_cached(service, factor, lang, cache, user_id, "industrial equipment risk factor analysis")
                )
            elif isinstance(factor, dict):
                copy = dict(factor)
                for field in ("factor", "title", "description", "text", "analysis"):
                    if copy.get(field):
                        copy[field] = await _translate_cached(
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
            forecast["description"] = await _translate_cached(
                service, forecast["description"], lang, cache, user_id, "risk forecast"
            )
    data["forecasts"] = forecasts

    dyn = data.get("dynamic_risk")
    if isinstance(dyn, dict) and dyn.get("time_to_failure_display"):
        dyn["time_to_failure_display"] = await _translate_cached(
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
    if lang not in _TRANSLATABLE_LANGS:
        return analysis

    service = TranslationService(db)
    cache: Dict[str, str] = {}
    data = dict(analysis)

    if data.get("summary"):
        data["summary"] = await _translate_cached(
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
            copy["description"] = await _translate_cached(
                service, copy["description"], lang, cache, user_id, "probable failure cause"
            )
        evidence = copy.get("evidence") or []
        if evidence:
            copy["evidence"] = [
                await _translate_cached(service, item, lang, cache, user_id, "supporting evidence")
                if isinstance(item, str)
                else item
                for item in evidence
            ]
        mitigations = copy.get("mitigation_actions") or []
        if mitigations:
            translated_mits: List[Any] = []
            for action in mitigations:
                if isinstance(action, str):
                    translated_mits.append(
                        await _translate_cached(
                            service, action, lang, cache, user_id, "mitigation action"
                        )
                    )
                elif isinstance(action, dict):
                    act_copy = dict(action)
                    for field in ("action", "title", "description"):
                        if act_copy.get(field):
                            act_copy[field] = await _translate_cached(
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
        await _translate_cached(service, factor, lang, cache, user_id, "contributing factor")
        if isinstance(factor, str)
        else factor
        for factor in factors
    ]

    return data
