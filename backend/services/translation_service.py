"""
Translation Service - AI-powered translation engine
Uses OpenAI for automatic translation with dictionary validation
"""

import os
import logging
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from openai import AsyncOpenAI

from models.translation import (
    EntityTranslation, TranslationStatus, EntityType, 
    DictionaryTerm, TranslationJob, Language
)

logger = logging.getLogger(__name__)

# Translatable field configurations per entity type
TRANSLATABLE_FIELDS = {
    EntityType.MAINTENANCE_TASK_TEMPLATE: ["name", "description", "procedure_steps"],
    EntityType.MAINTENANCE_STRATEGY: ["description", "strategy_summary"],
    EntityType.FAILURE_MODE_STRATEGY: ["failure_mode_name", "potential_effects"],
    EntityType.FAILURE_MODE: ["name", "description", "category", "effects", "causes", "recommended_actions"],
    EntityType.EQUIPMENT_TYPE: ["name", "description"],
    EntityType.EQUIPMENT_NODE: ["name", "description"],
    EntityType.TASK_TEMPLATE: ["name", "description"],
    EntityType.FORM_TEMPLATE: ["name", "description"],
}


class TranslationService:
    """
    Service for handling translations with AI support
    """
    
    def __init__(self, db):
        self.db = db
        self.api_key = os.environ.get("OPENAI_API_KEY")
        self.model_name = "gpt-4o-mini"  # Fast and cost-effective for translations
        self.client = AsyncOpenAI(api_key=self.api_key) if self.api_key else None
        
    async def get_dictionary(self) -> Dict[str, Dict[str, str]]:
        """
        Load technical dictionary for translation validation
        Returns: {"source_term": {"nl": "translation", "de": "translation"}}
        """
        dictionary = {}
        async for term in self.db.translation_dictionary.find({}):
            source = term.get("source_term", "").lower()
            if source:
                dictionary[source] = term.get("translations", {})
        return dictionary
    
    async def get_active_languages(self) -> List[Language]:
        """Get all active languages"""
        languages = []
        async for lang in self.db.languages.find({"active": True}):
            languages.append(Language(**lang))
        return languages
    
    def apply_dictionary(self, text: str, dictionary: Dict[str, Dict[str, str]], target_language: str) -> str:
        """
        Apply dictionary terms to translated text
        Replaces known technical terms with their approved translations
        """
        result = text
        for source_term, translations in dictionary.items():
            if target_language in translations:
                # Case-insensitive replacement while preserving case pattern
                import re
                pattern = re.compile(re.escape(source_term), re.IGNORECASE)
                result = pattern.sub(translations[target_language], result)
        return result
    
    async def translate_text(
        self,
        text: str,
        source_language: str,
        target_language: str,
        context: str = "industrial maintenance and reliability",
        use_dictionary: bool = True
    ) -> Tuple[str, float]:
        """
        Translate text using AI with dictionary validation
        Returns: (translated_text, confidence_score)
        """
        if not text or not text.strip():
            return "", 1.0
        
        if not self.client:
            logger.error("No API key available for translation")
            raise ValueError("Translation API key not configured")
        
        # Get dictionary for term enforcement
        dictionary = {}
        if use_dictionary:
            dictionary = await self.get_dictionary()
        
        # Build translation prompt with dictionary context
        dictionary_context = ""
        if dictionary:
            relevant_terms = []
            for term, translations in dictionary.items():
                if term.lower() in text.lower() and target_language in translations:
                    relevant_terms.append(f"- '{term}' should be translated as '{translations[target_language]}'")
            if relevant_terms:
                dictionary_context = f"\n\nIMPORTANT: Use these exact translations for technical terms:\n" + "\n".join(relevant_terms)
        
        # Language mapping
        lang_names = {
            "en": "English",
            "nl": "Dutch",
            "de": "German",
            "fr": "French",
            "es": "Spanish",
            "pt": "Portuguese",
            "it": "Italian"
        }
        
        source_lang_name = lang_names.get(source_language, source_language)
        target_lang_name = lang_names.get(target_language, target_language)
        
        system_message = f"""You are a professional technical translator specializing in {context}.
Your task is to translate text from {source_lang_name} to {target_lang_name}.

Guidelines:
1. Maintain technical accuracy and terminology consistency
2. Preserve formatting, line breaks, and structure
3. Keep placeholders, codes, and tags unchanged
4. Use industry-standard terminology for the target language
5. If text contains lists, preserve the list format{dictionary_context}

Respond ONLY with the translated text, nothing else."""
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": text}
                ],
                temperature=0.3,  # Lower temperature for more consistent translations
                max_tokens=2000
            )
            
            translation = response.choices[0].message.content
            
            # Apply dictionary post-processing
            if use_dictionary and dictionary:
                translation = self.apply_dictionary(translation, dictionary, target_language)
            
            # Calculate confidence based on text complexity and dictionary coverage
            confidence = 0.85  # Base confidence for AI translations
            if len(text) < 50:
                confidence += 0.05  # Higher confidence for short text
            if dictionary_context:
                confidence += 0.05  # Higher confidence when dictionary terms were used
            
            return translation.strip(), min(confidence, 0.95)
            
        except Exception as e:
            logger.error(f"Translation error: {e}")
            raise
    
    async def translate_entity(
        self,
        entity_type: EntityType,
        entity_id: str,
        entity_data: Dict[str, Any],
        target_languages: List[str],
        fields: Optional[List[str]] = None,
        created_by: Optional[str] = None
    ) -> List[EntityTranslation]:
        """
        Translate all fields of an entity to target languages
        """
        translations = []
        
        # Determine which fields to translate
        translatable_fields = TRANSLATABLE_FIELDS.get(entity_type, ["name", "description"])
        if fields:
            translatable_fields = [f for f in fields if f in translatable_fields]
        
        for language_code in target_languages:
            for field_name in translatable_fields:
                # Get source value
                source_value = entity_data.get(field_name)
                if not source_value:
                    continue
                
                # Handle list fields (like procedure_steps)
                if isinstance(source_value, list):
                    source_value = "\n".join(str(item) for item in source_value)
                
                try:
                    # Translate the field
                    translated_text, confidence = await self.translate_text(
                        text=str(source_value),
                        source_language="en",
                        target_language=language_code,
                        context="industrial maintenance and reliability"
                    )
                    
                    # Create translation record
                    translation = EntityTranslation(
                        entity_type=entity_type,
                        entity_id=entity_id,
                        language_code=language_code,
                        field_name=field_name,
                        source_value=str(source_value),
                        translation_value=translated_text,
                        status=TranslationStatus.AUTO_GENERATED,
                        ai_generated=True,
                        ai_confidence=confidence,
                        ai_model_used=f"openai/{self.model_name}",
                        created_by=created_by
                    )
                    
                    # Upsert to database
                    await self.db.entity_translations.update_one(
                        {
                            "entity_type": entity_type.value,
                            "entity_id": entity_id,
                            "language_code": language_code,
                            "field_name": field_name
                        },
                        {"$set": translation.model_dump()},
                        upsert=True
                    )
                    
                    translations.append(translation)
                    
                except Exception as e:
                    logger.error(f"Failed to translate {entity_type}/{entity_id}/{field_name} to {language_code}: {e}")
                    continue
        
        return translations
    
    async def get_translations_for_entity(
        self,
        entity_type: EntityType,
        entity_id: str,
        language_code: Optional[str] = None
    ) -> Dict[str, Dict[str, str]]:
        """
        Get all translations for an entity
        Returns: {"nl": {"name": "...", "description": "..."}, "de": {...}}
        """
        query = {
            "entity_type": entity_type.value,
            "entity_id": entity_id
        }
        if language_code:
            query["language_code"] = language_code
        
        result = {}
        async for trans in self.db.entity_translations.find(query):
            lang = trans.get("language_code")
            field = trans.get("field_name")
            value = trans.get("translation_value")
            
            if lang not in result:
                result[lang] = {}
            result[lang][field] = value
        
        return result
    
    async def process_translation_job(
        self,
        job_id: str,
        entity_fetcher: callable
    ) -> TranslationJob:
        """
        Process a batch translation job
        entity_fetcher: async function(entity_id) -> entity_data
        """
        # Get job
        job_data = await self.db.translation_jobs.find_one({"id": job_id})
        if not job_data:
            raise ValueError(f"Job not found: {job_id}")
        
        job = TranslationJob(**job_data)
        
        # Update status to processing
        job.status = "processing"
        job.started_at = datetime.utcnow().isoformat()
        job.total_items = len(job.entity_ids) * len(job.target_languages)
        await self.db.translation_jobs.update_one({"id": job_id}, {"$set": job.model_dump()})
        
        try:
            for entity_id in job.entity_ids:
                try:
                    # Fetch entity data
                    entity_data = await entity_fetcher(entity_id)
                    if not entity_data:
                        job.failed_items += 1
                        job.errors.append({"entity_id": entity_id, "error": "Entity not found"})
                        continue
                    
                    # Translate entity
                    translations = await self.translate_entity(
                        entity_type=job.entity_type,
                        entity_id=entity_id,
                        entity_data=entity_data,
                        target_languages=job.target_languages,
                        fields=job.fields_to_translate if job.fields_to_translate else None,
                        created_by=job.created_by
                    )
                    
                    job.translations_created += len(translations)
                    job.completed_items += len(job.target_languages)
                    
                except Exception as e:
                    job.failed_items += len(job.target_languages)
                    job.errors.append({"entity_id": entity_id, "error": str(e)})
                
                # Update progress
                job.progress = int((job.completed_items + job.failed_items) / job.total_items * 100)
                await self.db.translation_jobs.update_one({"id": job_id}, {"$set": job.model_dump()})
            
            # Mark as completed
            job.status = "completed"
            job.completed_at = datetime.utcnow().isoformat()
            
        except Exception as e:
            job.status = "failed"
            job.errors.append({"error": f"Job failed: {str(e)}"})
        
        await self.db.translation_jobs.update_one({"id": job_id}, {"$set": job.model_dump()})
        return job
    
    async def get_missing_translations(
        self,
        entity_type: Optional[EntityType] = None,
        language_code: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get list of entities missing translations
        """
        # This would need to be implemented based on the specific entity collections
        # For now, return empty list
        return []
    
    async def get_translation_stats(
        self,
        entity_type: Optional[EntityType] = None
    ) -> Dict[str, Any]:
        """
        Get translation coverage statistics
        """
        pipeline = [
            {"$group": {
                "_id": {
                    "entity_type": "$entity_type",
                    "language_code": "$language_code",
                    "status": "$status"
                },
                "count": {"$sum": 1}
            }}
        ]
        
        if entity_type:
            pipeline.insert(0, {"$match": {"entity_type": entity_type.value}})
        
        stats = {}
        async for doc in self.db.entity_translations.aggregate(pipeline):
            et = doc["_id"]["entity_type"]
            lc = doc["_id"]["language_code"]
            status = doc["_id"]["status"]
            
            if et not in stats:
                stats[et] = {}
            if lc not in stats[et]:
                stats[et][lc] = {"total": 0, "by_status": {}}
            
            stats[et][lc]["total"] += doc["count"]
            stats[et][lc]["by_status"][status] = doc["count"]
        
        return stats
