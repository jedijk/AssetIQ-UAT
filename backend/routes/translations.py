"""
Translation & Localization API Routes
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from database import db
from auth import get_current_user
from models.translation import (
    Language, DictionaryTerm, EntityTranslation, TranslationJob,
    EntityType, TranslationStatus,
    CreateLanguageRequest, UpdateLanguageRequest,
    CreateDictionaryTermRequest, UpdateDictionaryTermRequest,
    GenerateTranslationsRequest, UpdateTranslationRequest,
    BulkUpdateTranslationStatusRequest, SetUserLanguageRequest,
    UserLanguagePreference
)
from services.translation_service import TranslationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translations", tags=["Translations"])


# ============= Language Management =============

@router.get("/languages")
async def get_languages(
    active_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all supported languages
    """
    query = {"active": True} if active_only else {}
    languages = []
    async for lang in db.languages.find(query).sort("name", 1):
        lang.pop("_id", None)
        languages.append(lang)
    return {"languages": languages}


@router.post("/languages")
async def create_language(
    request: CreateLanguageRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Add a new supported language
    """
    # Check if language already exists
    existing = await db.languages.find_one({"code": request.code})
    if existing:
        raise HTTPException(status_code=400, detail="Language already exists")
    
    # If setting as default, unset other defaults
    if request.is_default:
        await db.languages.update_many({}, {"$set": {"is_default": False}})
    
    language = Language(
        code=request.code,
        name=request.name,
        native_name=request.native_name,
        active=request.active,
        is_default=request.is_default,
        ai_translation_enabled=request.ai_translation_enabled
    )
    
    await db.languages.insert_one(language.model_dump())
    return {"success": True, "language": language.model_dump()}


@router.patch("/languages/{code}")
async def update_language(
    code: str,
    request: UpdateLanguageRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update language settings
    """
    existing = await db.languages.find_one({"code": code})
    if not existing:
        raise HTTPException(status_code=404, detail="Language not found")
    
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    
    # If setting as default, unset other defaults
    if updates.get("is_default"):
        await db.languages.update_many({"code": {"$ne": code}}, {"$set": {"is_default": False}})
    
    updates["updated_at"] = datetime.utcnow().isoformat()
    await db.languages.update_one({"code": code}, {"$set": updates})
    
    updated = await db.languages.find_one({"code": code})
    updated.pop("_id", None)
    return {"success": True, "language": updated}


@router.post("/languages/seed")
async def seed_default_languages(
    current_user: dict = Depends(get_current_user)
):
    """
    Seed default languages (EN, NL, DE)
    """
    default_languages = [
        Language(code="en", name="English", native_name="English", active=True, is_default=True),
        Language(code="nl", name="Dutch", native_name="Nederlands", active=True),
        Language(code="de", name="German", native_name="Deutsch", active=True),
    ]
    
    created = 0
    for lang in default_languages:
        existing = await db.languages.find_one({"code": lang.code})
        if not existing:
            await db.languages.insert_one(lang.model_dump())
            created += 1
    
    return {"success": True, "created": created, "message": f"Seeded {created} languages"}


# ============= Technical Dictionary =============

@router.get("/dictionary")
async def get_dictionary(
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get technical dictionary terms
    """
    query = {}
    if category:
        query["category"] = category
    if search:
        query["source_term"] = {"$regex": search, "$options": "i"}
    
    terms = []
    async for term in db.translation_dictionary.find(query).sort("source_term", 1):
        term.pop("_id", None)
        terms.append(term)
    
    return {"terms": terms, "total": len(terms)}


@router.post("/dictionary")
async def create_dictionary_term(
    request: CreateDictionaryTermRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Add a new dictionary term
    """
    # Check if term already exists
    existing = await db.translation_dictionary.find_one(
        {"source_term": {"$regex": f"^{request.source_term}$", "$options": "i"}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Term already exists")
    
    term = DictionaryTerm(
        source_term=request.source_term,
        category=request.category,
        translations=request.translations,
        context=request.context,
        example_usage=request.example_usage,
        is_protected=request.is_protected,
        created_by=current_user.get("id")
    )
    
    await db.translation_dictionary.insert_one(term.model_dump())
    return {"success": True, "term": term.model_dump()}


@router.patch("/dictionary/{term_id}")
async def update_dictionary_term(
    term_id: str,
    request: UpdateDictionaryTermRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a dictionary term
    """
    existing = await db.translation_dictionary.find_one({"id": term_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Term not found")
    
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.utcnow().isoformat()
    
    await db.translation_dictionary.update_one({"id": term_id}, {"$set": updates})
    
    updated = await db.translation_dictionary.find_one({"id": term_id})
    updated.pop("_id", None)
    return {"success": True, "term": updated}


@router.delete("/dictionary/{term_id}")
async def delete_dictionary_term(
    term_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a dictionary term
    """
    result = await db.translation_dictionary.delete_one({"id": term_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Term not found")
    return {"success": True}


@router.post("/dictionary/seed")
async def seed_default_dictionary(
    current_user: dict = Depends(get_current_user)
):
    """
    Seed default technical dictionary terms
    """
    default_terms = [
        # Mechanical terms
        {"source_term": "Bearing", "category": "mechanical", "translations": {"nl": "Lager", "de": "Lager"}},
        {"source_term": "Seal", "category": "mechanical", "translations": {"nl": "Afdichting", "de": "Dichtung"}},
        {"source_term": "Pump", "category": "mechanical", "translations": {"nl": "Pomp", "de": "Pumpe"}},
        {"source_term": "Gearbox", "category": "mechanical", "translations": {"nl": "Tandwielkast", "de": "Getriebe"}},
        {"source_term": "Motor", "category": "electrical", "translations": {"nl": "Motor", "de": "Motor"}},
        {"source_term": "Coupling", "category": "mechanical", "translations": {"nl": "Koppeling", "de": "Kupplung"}},
        {"source_term": "Shaft", "category": "mechanical", "translations": {"nl": "As", "de": "Welle"}},
        {"source_term": "Impeller", "category": "mechanical", "translations": {"nl": "Waaier", "de": "Laufrad"}},
        {"source_term": "Valve", "category": "mechanical", "translations": {"nl": "Klep", "de": "Ventil"}},
        {"source_term": "Filter", "category": "mechanical", "translations": {"nl": "Filter", "de": "Filter"}},
        
        # Maintenance terms
        {"source_term": "Inspection", "category": "maintenance", "translations": {"nl": "Inspectie", "de": "Inspektion"}},
        {"source_term": "Lubrication", "category": "maintenance", "translations": {"nl": "Smering", "de": "Schmierung"}},
        {"source_term": "Overhaul", "category": "maintenance", "translations": {"nl": "Revisie", "de": "Überholung"}},
        {"source_term": "Replacement", "category": "maintenance", "translations": {"nl": "Vervanging", "de": "Austausch"}},
        {"source_term": "Calibration", "category": "maintenance", "translations": {"nl": "Kalibratie", "de": "Kalibrierung"}},
        {"source_term": "Alignment", "category": "maintenance", "translations": {"nl": "Uitlijning", "de": "Ausrichtung"}},
        {"source_term": "Preventive Maintenance", "category": "maintenance", "translations": {"nl": "Preventief Onderhoud", "de": "Vorbeugende Wartung"}},
        {"source_term": "Corrective Maintenance", "category": "maintenance", "translations": {"nl": "Correctief Onderhoud", "de": "Korrektive Wartung"}},
        {"source_term": "Condition Monitoring", "category": "maintenance", "translations": {"nl": "Conditiebewaking", "de": "Zustandsüberwachung"}},
        
        # Failure terms
        {"source_term": "Failure Mode", "category": "reliability", "translations": {"nl": "Faalmodus", "de": "Ausfallart"}},
        {"source_term": "Root Cause", "category": "reliability", "translations": {"nl": "Grondoorzaak", "de": "Grundursache"}},
        {"source_term": "Wear", "category": "reliability", "translations": {"nl": "Slijtage", "de": "Verschleiß"}},
        {"source_term": "Corrosion", "category": "reliability", "translations": {"nl": "Corrosie", "de": "Korrosion"}},
        {"source_term": "Vibration", "category": "reliability", "translations": {"nl": "Trillingen", "de": "Vibration"}},
        {"source_term": "Leakage", "category": "reliability", "translations": {"nl": "Lekkage", "de": "Leckage"}},
        {"source_term": "Overheating", "category": "reliability", "translations": {"nl": "Oververhitting", "de": "Überhitzung"}},
    ]
    
    created = 0
    for term_data in default_terms:
        existing = await db.translation_dictionary.find_one(
            {"source_term": {"$regex": f"^{term_data['source_term']}$", "$options": "i"}}
        )
        if not existing:
            term = DictionaryTerm(
                source_term=term_data["source_term"],
                category=term_data.get("category"),
                translations=term_data.get("translations", {}),
                is_protected=True
            )
            await db.translation_dictionary.insert_one(term.model_dump())
            created += 1
    
    return {"success": True, "created": created, "message": f"Seeded {created} dictionary terms"}


@router.post("/dictionary/validate")
async def validate_dictionary(
    language_code: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Validate stored entity translations against the technical dictionary.
    For each protected dictionary term with a known translation in `language_code`,
    flag entity translations that LIKELY leaked the English source term
    (untranslated technical term) OR used a divergent term.

    Returns a list of issues: { entity_type, entity_id, field_name,
    translation_value, expected_term, source_term, issue_type }
    """
    issues: List[Dict[str, Any]] = []
    terms_checked = 0
    
    # Build dictionary index for the requested language
    cursor = db.translation_dictionary.find({})
    terms = []
    async for term in cursor:
        translations = term.get("translations") or {}
        if language_code in translations and translations[language_code]:
            terms.append({
                "source": term["source_term"],
                "target": translations[language_code],
                "category": term.get("category"),
                "is_protected": bool(term.get("is_protected", False)),
            })
    terms_checked = len(terms)
    
    if not terms:
        return {"issues": [], "terms_checked": 0, "message": "No dictionary terms with target translations"}
    
    # Walk through all entity translations for the requested language and check
    cursor = db.entity_translations.find(
        {"language_code": language_code},
        {"_id": 0, "entity_type": 1, "entity_id": 1, "field_name": 1, "translation_value": 1},
    )
    async for doc in cursor:
        value = (doc.get("translation_value") or "").strip()
        if not value:
            continue
        value_lower = value.lower()
        for term in terms:
            src = term["source"]
            tgt = term["target"]
            if not src or not tgt:
                continue
            src_lower = src.lower()
            tgt_lower = tgt.lower()
            # If source and target are equal (e.g. "Filter" -> "Filter"), skip
            if src_lower == tgt_lower:
                continue
            # Issue 1: target language value still contains the English source term
            # (likely untranslated leak), and DOES NOT contain the target translation
            if src_lower in value_lower and tgt_lower not in value_lower:
                issues.append({
                    "entity_type": doc.get("entity_type"),
                    "entity_id": doc.get("entity_id"),
                    "field_name": doc.get("field_name"),
                    "translation_value": value,
                    "source_term": src,
                    "expected_term": tgt,
                    "category": term.get("category"),
                    "issue_type": "untranslated_term",
                    "is_protected": term["is_protected"],
                })
    
    return {"issues": issues, "terms_checked": terms_checked, "total_issues": len(issues)}


# ============= Entity Translations =============

@router.get("/entities/{entity_type}/{entity_id}")
async def get_entity_translations(
    entity_type: EntityType,
    entity_id: str,
    language_code: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get translations for a specific entity
    """
    service = TranslationService(db)
    translations = await service.get_translations_for_entity(
        entity_type=entity_type,
        entity_id=entity_id,
        language_code=language_code
    )
    return {"entity_id": entity_id, "entity_type": entity_type, "translations": translations}


@router.get("/batch/{entity_type}")
async def get_batch_translations(
    entity_type: EntityType,
    language_code: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Return ALL translations for the given entity_type and language in one shot.
    Result shape: { entity_id: { field_name: translated_value, ... }, ... }
    This avoids hundreds of parallel HTTP requests when a list page needs
    translations for many rows.
    """
    result: Dict[str, Dict[str, str]] = {}
    cursor = db.entity_translations.find(
        {"entity_type": entity_type.value, "language_code": language_code},
        {"_id": 0, "entity_id": 1, "field_name": 1, "translation_value": 1},
    )
    async for doc in cursor:
        eid = doc.get("entity_id")
        field = doc.get("field_name")
        value = doc.get("translation_value")
        if not eid or not field:
            continue
        result.setdefault(eid, {})[field] = value
    return {"entity_type": entity_type, "language_code": language_code, "translations": result, "count": len(result)}


@router.post("/generate")
async def generate_translations(
    request: GenerateTranslationsRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate AI translations for entities
    """
    # Create translation job
    job = TranslationJob(
        entity_type=request.entity_type,
        entity_ids=request.entity_ids,
        target_languages=request.target_languages,
        fields_to_translate=request.fields or [],
        created_by=current_user.get("id")
    )
    
    await db.translation_jobs.insert_one(job.model_dump())
    
    service = TranslationService(db)
    entity_type = request.entity_type
    
    async def fetch_entity(entity_id: str) -> Dict[str, Any]:
        """Fetch entity data based on type"""
        if entity_type == EntityType.MAINTENANCE_TASK_TEMPLATE:
            # Find task template in any strategy
            async for strategy in db.equipment_type_strategies.find({}):
                for task in strategy.get("task_templates", []):
                    if task.get("id") == entity_id:
                        return task
            return None
        elif entity_type == EntityType.FAILURE_MODE:
            # Failure mode translations are keyed by failure_mode NAME
            fm = await db.failure_modes.find_one({"failure_mode": entity_id})
            if not fm:
                fm = await db.failure_modes.find_one({"id": entity_id})
            if not fm and entity_id.isdigit():
                fm = await db.failure_modes.find_one({"legacy_id": int(entity_id)})
            if fm:
                # Normalize fields for translation
                actions = fm.get("recommended_actions", [])
                if isinstance(actions, list):
                    # Handle both str and dict shapes (some FMs store structured actions)
                    actions_str = ", ".join(
                        a if isinstance(a, str) else (a.get("title") or a.get("action") or a.get("name") or "")
                        for a in actions
                    )
                else:
                    actions_str = actions or ""
                return {
                    "name": fm.get("failure_mode") or fm.get("name", ""),
                    "description": fm.get("description", ""),
                    "effects": fm.get("potential_effects", ""),
                    "causes": fm.get("potential_causes", ""),
                    "recommended_actions": actions_str,
                }
            return None
        elif entity_type == EntityType.EQUIPMENT_TYPE:
            et = await db.equipment_types.find_one({"id": entity_id})
            if not et:
                et = await db.custom_equipment_types.find_one({"id": entity_id})
            if not et:
                # Fallback to built-in iso14224 EQUIPMENT_TYPES static list
                try:
                    from iso14224_models import EQUIPMENT_TYPES as _BUILTIN_EQ_TYPES
                    et = next((x for x in _BUILTIN_EQ_TYPES if x.get("id") == entity_id), None)
                except Exception:
                    et = None
            return et
        elif entity_type == EntityType.OBSERVATION:
            obs = await db.threats.find_one({"id": entity_id})
            if not obs:
                obs = await db.observations.find_one({"id": entity_id})
            if obs:
                return {
                    "title": obs.get("title") or obs.get("name") or (obs.get("description", "")[:120]),
                    "name": obs.get("title") or obs.get("name") or (obs.get("description", "")[:120]),
                    "description": obs.get("description", "") or "",
                }
            return None
        elif entity_type == EntityType.INVESTIGATION:
            inv = await db.investigations.find_one({"id": entity_id})
            if inv:
                return {
                    "title": inv.get("title", ""),
                    "name": inv.get("title", ""),
                    "description": inv.get("description", "") or "",
                }
            return None
        elif entity_type == EntityType.EQUIPMENT_NODE:
            return await db.equipment_nodes.find_one({"id": entity_id})
        elif entity_type == EntityType.FORM_TEMPLATE:
            return await db.form_templates.find_one({"id": entity_id})
        return None
    
    # For small jobs, process synchronously
    if len(request.entity_ids) <= 5:
        job = await service.process_translation_job(job.id, fetch_entity)
        job_data = job.model_dump()
        job_data.pop("_id", None) if "_id" in job_data else None
        return {"success": True, "job": job_data}
    
    # For larger jobs, process in background (non-blocking)
    background_tasks.add_task(service.process_translation_job, job.id, fetch_entity)
    return {"success": True, "job_id": job.id, "status": "queued", "total": len(request.entity_ids)}


@router.post("/generate-all/{entity_type}")
async def generate_all_translations(
    entity_type: EntityType,
    background_tasks: BackgroundTasks,
    target_languages: List[str] = ["nl", "de"],
    only_missing: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """
    Bulk-translate ALL existing entities of a given type to the target languages.
    Useful for legacy data that was created before auto-translation was enabled.
    """
    # Collect entity IDs from the appropriate source collection
    entity_ids: List[str] = []
    
    if entity_type == EntityType.FAILURE_MODE:
        # Use failure_mode NAME as the canonical entity_id (matches existing storage scheme)
        async for fm in db.failure_modes.find({}, {"failure_mode": 1, "_id": 0}):
            name = fm.get("failure_mode")
            if name:
                entity_ids.append(name)
    elif entity_type == EntityType.EQUIPMENT_TYPE:
        # Include built-in iso14224 types
        try:
            from iso14224_models import EQUIPMENT_TYPES as _BUILTIN_EQ_TYPES
            for et in _BUILTIN_EQ_TYPES:
                if et.get("id"):
                    entity_ids.append(et["id"])
        except Exception:
            pass
        async for et in db.custom_equipment_types.find({}, {"id": 1, "_id": 0}):
            if et.get("id"):
                entity_ids.append(et["id"])
        async for et in db.equipment_types.find({}, {"id": 1, "_id": 0}):
            if et.get("id"):
                entity_ids.append(et["id"])
        # Deduplicate
        entity_ids = list(dict.fromkeys(entity_ids))
    elif entity_type == EntityType.EQUIPMENT_NODE:
        async for n in db.equipment_nodes.find({}, {"id": 1, "_id": 0}):
            if n.get("id"):
                entity_ids.append(n["id"])
    elif entity_type == EntityType.OBSERVATION:
        async for o in db.threats.find({}, {"id": 1, "_id": 0}):
            if o.get("id"):
                entity_ids.append(o["id"])
    elif entity_type == EntityType.INVESTIGATION:
        async for i in db.investigations.find({}, {"id": 1, "_id": 0}):
            if i.get("id"):
                entity_ids.append(i["id"])
    elif entity_type == EntityType.MAINTENANCE_TASK_TEMPLATE:
        async for strategy in db.equipment_type_strategies.find({}):
            for task in strategy.get("task_templates", []):
                if task.get("id"):
                    entity_ids.append(task["id"])
    elif entity_type == EntityType.FORM_TEMPLATE:
        async for ft in db.form_templates.find({}, {"id": 1, "_id": 0}):
            if ft.get("id"):
                entity_ids.append(ft["id"])
    else:
        raise HTTPException(status_code=400, detail=f"Bulk translation not supported for entity_type {entity_type}")
    
    # Optionally filter out IDs that already have ANY translation in all target languages
    if only_missing and entity_ids:
        already_translated_ids: set = set()
        pipeline = [
            {"$match": {
                "entity_type": entity_type.value,
                "entity_id": {"$in": entity_ids},
                "language_code": {"$in": target_languages},
            }},
            {"$group": {
                "_id": "$entity_id",
                "langs": {"$addToSet": "$language_code"},
            }},
        ]
        async for doc in db.entity_translations.aggregate(pipeline):
            if set(target_languages).issubset(set(doc.get("langs", []))):
                already_translated_ids.add(doc["_id"])
        entity_ids = [eid for eid in entity_ids if eid not in already_translated_ids]
    
    if not entity_ids:
        return {"success": True, "message": "Nothing to translate – everything is up to date", "total": 0}
    
    # Re-use the standard /generate endpoint logic
    req = GenerateTranslationsRequest(
        entity_type=entity_type,
        entity_ids=entity_ids,
        target_languages=target_languages,
    )
    return await generate_translations(req, background_tasks, current_user)



@router.get("/jobs")
async def get_translation_jobs(
    status: Optional[str] = None,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """
    Get translation jobs
    """
    query = {}
    if status:
        query["status"] = status
    
    jobs = []
    async for job in db.translation_jobs.find(query).sort("created_at", -1).limit(limit):
        job.pop("_id", None)
        jobs.append(job)
    
    return {"jobs": jobs}


@router.get("/jobs/{job_id}")
async def get_translation_job(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a specific translation job
    """
    job = await db.translation_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.pop("_id", None)
    return {"job": job}


@router.patch("/entities/{translation_id}")
async def update_translation(
    translation_id: str,
    request: UpdateTranslationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update a translation
    """
    existing = await db.entity_translations.find_one({"id": translation_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Translation not found")
    
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.utcnow().isoformat()
    updates["updated_by"] = current_user.get("id")
    
    # Track review if status is changing to approved
    if request.status == TranslationStatus.APPROVED:
        updates["reviewed_by"] = current_user.get("id")
        updates["reviewed_at"] = datetime.utcnow().isoformat()
    
    await db.entity_translations.update_one({"id": translation_id}, {"$set": updates})
    
    updated = await db.entity_translations.find_one({"id": translation_id})
    updated.pop("_id", None)
    return {"success": True, "translation": updated}


@router.post("/bulk-status")
async def bulk_update_status(
    request: BulkUpdateTranslationStatusRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Bulk update translation statuses
    """
    updates = {
        "status": request.status.value,
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": current_user.get("id")
    }
    
    if request.status == TranslationStatus.APPROVED:
        updates["reviewed_by"] = current_user.get("id")
        updates["reviewed_at"] = datetime.utcnow().isoformat()
    
    result = await db.entity_translations.update_many(
        {"id": {"$in": request.translation_ids}},
        {"$set": updates}
    )
    
    return {"success": True, "updated": result.modified_count}


# ============= Statistics =============

@router.get("/stats")
async def get_translation_stats(
    entity_type: Optional[EntityType] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get translation coverage statistics
    """
    service = TranslationService(db)
    stats = await service.get_translation_stats(entity_type)
    
    # Get language list
    languages = []
    async for lang in db.languages.find({"active": True}):
        languages.append({"code": lang["code"], "name": lang["name"]})
    
    return {"stats": stats, "languages": languages}


@router.get("/coverage")
async def get_translation_coverage(
    current_user: dict = Depends(get_current_user)
):
    """
    Get translation coverage broken down per (entity_type, language_code).
    Returns:
      coverage: { <entity_type>: { total: N, by_language: { nl: M, de: K, ... }, languages: ["nl","de"] } }
    """
    # Pull active target languages dynamically (skip 'en')
    target_langs: List[str] = []
    async for lang in db.languages.find({"active": True}):
        code = lang.get("code")
        if code and code != "en":
            target_langs.append(code)
    if not target_langs:
        target_langs = ["nl", "de"]

    coverage: Dict[str, Dict[str, Any]] = {}

    # Per-language unique-entity_id counts
    pipeline = [
        {"$group": {
            "_id": {
                "entity_type": "$entity_type",
                "entity_id": "$entity_id",
                "language_code": "$language_code",
            }
        }},
        {"$group": {
            "_id": {
                "entity_type": "$_id.entity_type",
                "language_code": "$_id.language_code",
            },
            "count": {"$sum": 1}
        }}
    ]
    async for doc in db.entity_translations.aggregate(pipeline):
        et = doc["_id"]["entity_type"]
        lang = doc["_id"]["language_code"]
        if et not in coverage:
            coverage[et] = {"total": 0, "by_language": {lc: 0 for lc in target_langs}, "languages": target_langs}
        coverage[et]["by_language"][lang] = doc["count"]

    # Helper that ensures the entity_type bucket exists
    def _ensure(et: str):
        if et not in coverage:
            coverage[et] = {"total": 0, "by_language": {lc: 0 for lc in target_langs}, "languages": target_langs}
        else:
            for lc in target_langs:
                coverage[et]["by_language"].setdefault(lc, 0)
            coverage[et]["languages"] = target_langs

    # Totals per entity type
    fm_count = await db.failure_modes.count_documents({})
    _ensure("failure_mode")
    coverage["failure_mode"]["total"] = fm_count

    et_count = await db.custom_equipment_types.count_documents({})
    _ensure("equipment_type")
    coverage["equipment_type"]["total"] = et_count

    task_count = 0
    async for strategy in db.equipment_type_strategies.find({}):
        task_count += len(strategy.get("task_templates", []))
    _ensure("maintenance_task_template")
    coverage["maintenance_task_template"]["total"] = task_count

    node_count = await db.equipment_nodes.count_documents({})
    _ensure("equipment_node")
    coverage["equipment_node"]["total"] = node_count

    obs_count = await db.threats.count_documents({})
    _ensure("observation")
    coverage["observation"]["total"] = obs_count

    inv_count = await db.investigations.count_documents({})
    _ensure("investigation")
    coverage["investigation"]["total"] = inv_count

    form_count = await db.form_templates.count_documents({})
    _ensure("form_template")
    coverage["form_template"]["total"] = form_count

    # Cap by_language[L] at total so we never exceed 100% (e.g. stale orphan translations)
    for et in coverage:
        total = coverage[et]["total"] or 0
        for lc in list(coverage[et]["by_language"].keys()):
            coverage[et]["by_language"][lc] = min(coverage[et]["by_language"][lc], total)
        # Backwards-compatible 'translated' field = sum across all target languages
        coverage[et]["translated"] = sum(coverage[et]["by_language"].values())

    return {"coverage": coverage, "target_languages": target_langs}


# ============= User Language Preference =============

@router.get("/user/preference")
async def get_user_language_preference(
    current_user: dict = Depends(get_current_user)
):
    """
    Get current user's language preference
    """
    pref = await db.user_language_preferences.find_one({"user_id": current_user.get("id")})
    if pref:
        pref.pop("_id", None)
        return {"preference": pref}
    
    # Default preference
    return {"preference": {"user_id": current_user.get("id"), "preferred_language": "en"}}


@router.post("/user/preference")
async def set_user_language_preference(
    request: SetUserLanguageRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Set current user's language preference
    """
    user_id = current_user.get("id")
    
    preference = UserLanguagePreference(
        user_id=user_id,
        preferred_language=request.preferred_language,
        secondary_language=request.secondary_language
    )
    
    await db.user_language_preferences.update_one(
        {"user_id": user_id},
        {"$set": preference.model_dump()},
        upsert=True
    )
    
    # Also update user record
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"preferred_language": request.preferred_language}}
    )
    
    return {"success": True, "preference": preference.model_dump()}


# ============= Translate Single Text (Utility) =============

@router.post("/translate-text")
async def translate_single_text(
    text: str,
    target_language: str,
    source_language: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """
    Translate a single piece of text (utility endpoint)
    """
    service = TranslationService(db)
    translated, confidence = await service.translate_text(
        text=text,
        source_language=source_language,
        target_language=target_language
    )
    
    return {
        "original": text,
        "translated": translated,
        "source_language": source_language,
        "target_language": target_language,
        "confidence": confidence
    }
