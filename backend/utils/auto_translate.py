"""
Auto-Translation Utility
Provides background translation functions for all entity types
"""

import logging
from typing import Dict, List, Optional, Any
from database import db
from services.translation_service import TranslationService
from models.translation import EntityType

logger = logging.getLogger(__name__)

# Default target languages for auto-translation
DEFAULT_TARGET_LANGUAGES = ["nl", "de"]


async def auto_translate_entity(
    entity_type: EntityType,
    entity_id: str,
    entity_data: Dict[str, Any],
    target_languages: List[str] = None,
    created_by: str = None
):
    """
    Generic background task to auto-translate any entity to Dutch and German.
    
    Args:
        entity_type: The EntityType enum value
        entity_id: The entity's ID
        entity_data: Dict with field names and values to translate
        target_languages: List of language codes (default: ["nl", "de"])
        created_by: User ID who triggered the translation
    """
    if target_languages is None:
        target_languages = DEFAULT_TARGET_LANGUAGES
    
    try:
        translation_service = TranslationService(db)
        
        await translation_service.translate_entity(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_data=entity_data,
            target_languages=target_languages,
            created_by=created_by
        )
        logger.info(f"Auto-translated {entity_type.value} {entity_id} to {', '.join(target_languages)}")
    except Exception as e:
        logger.error(f"Failed to auto-translate {entity_type.value} {entity_id}: {e}")


# ============= Entity-Specific Translation Helpers =============

async def translate_equipment_node(node_id: str, node_data: dict, created_by: str = None):
    """Translate equipment hierarchy node"""
    data_for_translation = {
        "name": node_data.get("name", ""),
        "description": node_data.get("description", ""),
    }
    await auto_translate_entity(
        EntityType.EQUIPMENT_NODE,
        node_id,
        data_for_translation,
        created_by=created_by
    )


async def translate_equipment_type(type_id: str, type_data: dict, created_by: str = None):
    """Translate equipment type"""
    data_for_translation = {
        "name": type_data.get("name", ""),
        "description": type_data.get("description", ""),
    }
    await auto_translate_entity(
        EntityType.EQUIPMENT_TYPE,
        type_id,
        data_for_translation,
        created_by=created_by
    )


async def translate_failure_mode(fm_id: str, fm_data: dict, created_by: str = None):
    """Translate failure mode"""
    data_for_translation = {
        "name": fm_data.get("failure_mode", fm_data.get("name", "")),
        "description": fm_data.get("description", ""),
        "effects": fm_data.get("potential_effects", ""),
        "causes": fm_data.get("potential_causes", ""),
        "recommended_actions": ", ".join(fm_data.get("recommended_actions", [])) if isinstance(fm_data.get("recommended_actions"), list) else fm_data.get("recommended_actions", ""),
    }
    await auto_translate_entity(
        EntityType.FAILURE_MODE,
        fm_id,
        data_for_translation,
        created_by=created_by
    )


async def translate_observation(obs_id: str, obs_data: dict, created_by: str = None):
    """Translate observation/threat"""
    data_for_translation = {
        "name": obs_data.get("title", obs_data.get("name", "")),
        "title": obs_data.get("title", obs_data.get("name", "")),
        "description": obs_data.get("description", ""),
    }
    await auto_translate_entity(
        EntityType.OBSERVATION,
        obs_id,
        data_for_translation,
        created_by=created_by
    )


async def translate_investigation(inv_id: str, inv_data: dict, created_by: str = None):
    """Translate investigation"""
    data_for_translation = {
        "name": inv_data.get("title", inv_data.get("name", "")),
        "description": inv_data.get("description", ""),
        "title": inv_data.get("title", ""),
    }
    await auto_translate_entity(
        EntityType.INVESTIGATION,
        inv_id,
        data_for_translation,
        created_by=created_by
    )


async def translate_task_template(template_id: str, template_data: dict, created_by: str = None):
    """Translate task template"""
    data_for_translation = {
        "name": template_data.get("name", ""),
        "description": template_data.get("description", ""),
    }
    await auto_translate_entity(
        EntityType.TASK_TEMPLATE,
        template_id,
        data_for_translation,
        created_by=created_by
    )


async def translate_maintenance_task(task_id: str, task_data: dict, created_by: str = None):
    """Translate maintenance task template"""
    # Handle procedure_steps which may be a list
    procedure_steps = task_data.get("procedure_steps", [])
    if isinstance(procedure_steps, list):
        procedure_steps = "\n".join(procedure_steps)
    
    data_for_translation = {
        "name": task_data.get("name", ""),
        "description": task_data.get("description", ""),
        "procedure_steps": procedure_steps,
    }
    await auto_translate_entity(
        EntityType.MAINTENANCE_TASK_TEMPLATE,
        task_id,
        data_for_translation,
        created_by=created_by
    )


async def translate_form_template(form_id: str, form_data: dict, created_by: str = None):
    """Translate form template"""
    data_for_translation = {
        "name": form_data.get("name", ""),
        "description": form_data.get("description", ""),
    }
    await auto_translate_entity(
        EntityType.FORM_TEMPLATE,
        form_id,
        data_for_translation,
        created_by=created_by
    )
