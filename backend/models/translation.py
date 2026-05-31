"""
Translation & Localization Framework Models
Based on AssetIQ Functional Specification: Multi-Language Translation & Localization

Supports:
- Generic translatable entity framework
- Language management
- AI-powered translations
- Technical dictionary
- Translation versioning and workflow
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


# ============= Enums =============

class TranslationStatus(str, Enum):
    """Translation status workflow states"""
    DRAFT = "draft"
    PENDING = "pending"
    AUTO_GENERATED = "auto_generated"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    PUBLISHED = "published"
    OBSOLETE = "obsolete"


class EntityType(str, Enum):
    """Supported entity types for translation"""
    # Maintenance Library
    MAINTENANCE_TASK_TEMPLATE = "maintenance_task_template"
    MAINTENANCE_STRATEGY = "maintenance_strategy"
    FAILURE_MODE_STRATEGY = "failure_mode_strategy"
    
    # Reliability Library
    FAILURE_MODE = "failure_mode"
    FAILURE_MECHANISM = "failure_mechanism"
    FAILURE_CAUSE = "failure_cause"
    FAILURE_EFFECT = "failure_effect"
    
    # Asset Hierarchy
    EQUIPMENT_TYPE = "equipment_type"
    EQUIPMENT_NODE = "equipment_node"
    INSTALLATION = "installation"
    
    # Operations
    TASK_TEMPLATE = "task_template"
    FORM_TEMPLATE = "form_template"
    
    # System UI
    UI_TEXT = "ui_text"


# ============= Language Model =============

class Language(BaseModel):
    """Supported language configuration"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str  # ISO 639-1 code (en, nl, de)
    name: str  # English name
    native_name: str  # Native name
    active: bool = True
    is_default: bool = False
    
    # AI translation support
    ai_translation_enabled: bool = True
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============= Technical Dictionary =============

class DictionaryTerm(BaseModel):
    """Technical term in the translation dictionary"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Source term
    source_term: str  # English term (source of truth)
    source_language: str = "en"
    
    # Category for organization
    category: Optional[str] = None  # e.g., "mechanical", "electrical", "maintenance"
    
    # Translations per language
    translations: Dict[str, str] = {}  # {"nl": "Lager", "de": "Lager"}
    
    # Usage context
    context: Optional[str] = None  # Additional context for translators
    example_usage: Optional[str] = None
    
    # Metadata
    is_protected: bool = False  # Protected terms cannot be auto-translated differently
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    created_by: Optional[str] = None


# ============= Entity Translation =============

class EntityTranslation(BaseModel):
    """Translation for a specific entity field"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Entity reference
    entity_type: EntityType
    entity_id: str
    entity_version: int = 1  # Version of the entity when translated
    
    # Translation target
    language_code: str
    field_name: str  # Which field is being translated (name, description, etc.)
    
    # Translation content
    source_value: str  # Original value (for reference)
    translation_value: str
    
    # Status & workflow
    status: TranslationStatus = TranslationStatus.DRAFT
    
    # AI generation info
    ai_generated: bool = False
    ai_confidence: Optional[float] = None  # 0.0-1.0
    ai_model_used: Optional[str] = None
    
    # Review workflow
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_notes: Optional[str] = None
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


# ============= Translation Job =============

class TranslationJob(BaseModel):
    """Batch translation job for AI processing"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Job scope
    entity_type: EntityType
    entity_ids: List[str] = []  # Entities to translate
    target_languages: List[str] = []  # Language codes
    fields_to_translate: List[str] = []  # Field names
    
    # Status
    status: str = "pending"  # pending, processing, completed, failed
    progress: int = 0  # 0-100
    total_items: int = 0
    completed_items: int = 0
    failed_items: int = 0
    
    # Results
    translations_created: int = 0
    errors: List[Dict[str, Any]] = []
    
    # Metadata
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_by: Optional[str] = None


# ============= Translation Stats =============

class TranslationStats(BaseModel):
    """Translation coverage statistics"""
    entity_type: EntityType
    language_code: str
    
    # Counts
    total_entities: int = 0
    total_fields: int = 0
    translated_fields: int = 0
    
    # Status breakdown
    draft_count: int = 0
    pending_count: int = 0
    auto_generated_count: int = 0
    approved_count: int = 0
    published_count: int = 0
    
    # Coverage
    coverage_percentage: float = 0.0


# ============= User Language Preference =============

class UserLanguagePreference(BaseModel):
    """User's language preference"""
    user_id: str
    preferred_language: str = "en"
    secondary_language: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============= API Request/Response Models =============

class CreateLanguageRequest(BaseModel):
    """Request to create/enable a language"""
    code: str
    name: str
    native_name: str
    active: bool = True
    is_default: bool = False
    ai_translation_enabled: bool = True


class UpdateLanguageRequest(BaseModel):
    """Request to update language settings"""
    name: Optional[str] = None
    native_name: Optional[str] = None
    active: Optional[bool] = None
    is_default: Optional[bool] = None
    ai_translation_enabled: Optional[bool] = None


class CreateDictionaryTermRequest(BaseModel):
    """Request to add a dictionary term"""
    source_term: str
    category: Optional[str] = None
    translations: Dict[str, str] = {}
    context: Optional[str] = None
    example_usage: Optional[str] = None
    is_protected: bool = False


class UpdateDictionaryTermRequest(BaseModel):
    """Request to update a dictionary term"""
    category: Optional[str] = None
    translations: Optional[Dict[str, str]] = None
    context: Optional[str] = None
    example_usage: Optional[str] = None
    is_protected: Optional[bool] = None


class GenerateTranslationsRequest(BaseModel):
    """Request to generate AI translations"""
    entity_type: EntityType
    entity_ids: List[str]  # Entity IDs to translate
    target_languages: List[str]  # Language codes (e.g., ["nl", "de"])
    fields: Optional[List[str]] = None  # Specific fields, or all if None
    use_dictionary: bool = True  # Apply dictionary terms


class UpdateTranslationRequest(BaseModel):
    """Request to update a translation"""
    translation_value: Optional[str] = None
    status: Optional[TranslationStatus] = None
    review_notes: Optional[str] = None


class BulkUpdateTranslationStatusRequest(BaseModel):
    """Request to bulk update translation statuses"""
    translation_ids: List[str]
    status: TranslationStatus


class SetUserLanguageRequest(BaseModel):
    """Request to set user language preference"""
    preferred_language: str
    secondary_language: Optional[str] = None
