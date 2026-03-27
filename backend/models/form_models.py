"""
Form Designer Models - Pydantic models for form templates and field definitions.

Based on the functional spec:
- Form Templates: Reusable form definitions with versioning
- Form Fields: Typed fields with thresholds and failure indicators
- Field Types: Numeric, Text, Dropdown, Boolean, Range, File
"""

from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
from enum import Enum


class FieldType(str, Enum):
    """Supported field types."""
    NUMERIC = "numeric"          # Number with optional unit
    TEXT = "text"                # Free text
    TEXTAREA = "textarea"        # Multi-line text
    DROPDOWN = "dropdown"        # Single select from options
    MULTI_SELECT = "multi_select"  # Multiple select
    BOOLEAN = "boolean"          # Yes/No checkbox
    RANGE = "range"              # Slider with min/max
    DATE = "date"                # Date picker
    DATETIME = "datetime"        # Date + time picker
    FILE = "file"                # File upload
    IMAGE = "image"              # Image upload
    SIGNATURE = "signature"      # Digital signature


class ThresholdLevel(str, Enum):
    """Threshold severity levels."""
    NORMAL = "normal"
    WARNING = "warning"
    CRITICAL = "critical"


class FailureIndicatorType(str, Enum):
    """How field value indicates failure."""
    NONE = "none"                # No failure indication
    ABOVE_THRESHOLD = "above"    # Failure when value > threshold
    BELOW_THRESHOLD = "below"    # Failure when value < threshold
    OUTSIDE_RANGE = "outside"    # Failure when outside normal range
    EQUALS = "equals"            # Failure when equals specific value
    NOT_EQUALS = "not_equals"    # Failure when doesn't equal value


# ============= FORM FIELD MODELS =============

class NumericThreshold(BaseModel):
    """Thresholds for numeric fields."""
    warning_low: Optional[float] = None
    warning_high: Optional[float] = None
    critical_low: Optional[float] = None
    critical_high: Optional[float] = None


class DropdownOption(BaseModel):
    """Option for dropdown/multi-select fields."""
    value: str
    label: str
    is_failure: bool = False  # Does selecting this indicate failure?
    severity: Optional[ThresholdLevel] = None


class FormFieldDefinition(BaseModel):
    """Definition of a form field."""
    id: str = Field(..., description="Unique field ID within the form")
    label: str
    field_type: FieldType
    required: bool = False
    description: Optional[str] = None
    placeholder: Optional[str] = None
    
    # Numeric field options
    unit: Optional[str] = None  # e.g., "°C", "bar", "mm"
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    decimal_places: Optional[int] = None
    thresholds: Optional[NumericThreshold] = None
    
    # Dropdown/Multi-select options
    options: Optional[List[DropdownOption]] = None
    
    # Range field options
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    range_step: Optional[float] = None
    
    # File/Image options
    allowed_extensions: Optional[List[str]] = None
    max_file_size_mb: Optional[float] = None
    
    # Failure indicator configuration
    failure_indicator_type: FailureIndicatorType = FailureIndicatorType.NONE
    failure_mode_id: Optional[str] = None  # Link to specific failure mode
    auto_create_observation: bool = False  # Auto-create observation on threshold breach
    
    # Conditional visibility
    visible_when: Optional[Dict[str, Any]] = None  # {"field_id": "value"}
    
    # Default value
    default_value: Optional[Any] = None
    
    # Ordering
    order: int = 0


class FormFieldUpdate(BaseModel):
    """Update a form field."""
    label: Optional[str] = None
    field_type: Optional[FieldType] = None
    required: Optional[bool] = None
    description: Optional[str] = None
    placeholder: Optional[str] = None
    unit: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    decimal_places: Optional[int] = None
    thresholds: Optional[NumericThreshold] = None
    options: Optional[List[DropdownOption]] = None
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    range_step: Optional[float] = None
    allowed_extensions: Optional[List[str]] = None
    max_file_size_mb: Optional[float] = None
    failure_indicator_type: Optional[FailureIndicatorType] = None
    failure_mode_id: Optional[str] = None
    auto_create_observation: Optional[bool] = None
    visible_when: Optional[Dict[str, Any]] = None
    default_value: Optional[Any] = None
    order: Optional[int] = None


# ============= FORM TEMPLATE MODELS =============

class FormTemplateCreate(BaseModel):
    """Create a new form template."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    discipline: Optional[str] = None  # operations, maintenance, lab, inspection
    
    # Linkages
    failure_mode_ids: List[str] = Field(default_factory=list)
    equipment_type_ids: List[str] = Field(default_factory=list)
    
    # Fields
    fields: List[FormFieldDefinition] = Field(default_factory=list)
    
    # Reference Documents (for AI-powered search during execution)
    documents: List[Dict[str, Any]] = Field(default_factory=list)  # [{name, url, type, description}]
    
    # Settings
    allow_partial_submission: bool = False
    require_signature: bool = False
    
    # Tagging
    tags: List[str] = Field(default_factory=list)


class FormTemplateUpdate(BaseModel):
    """Update a form template (creates new version)."""
    name: Optional[str] = None
    description: Optional[str] = None
    discipline: Optional[str] = None
    failure_mode_ids: Optional[List[str]] = None
    equipment_type_ids: Optional[List[str]] = None
    fields: Optional[List[FormFieldDefinition]] = None
    documents: Optional[List[Dict[str, Any]]] = None  # Reference documents
    allow_partial_submission: Optional[bool] = None
    require_signature: Optional[bool] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ============= FORM SUBMISSION MODELS =============

class FieldValue(BaseModel):
    """A single field value in a submission."""
    field_id: str
    value: Any
    threshold_status: Optional[ThresholdLevel] = None  # Calculated on submission
    is_failure_indicator: bool = False  # Calculated on submission


class FormSubmission(BaseModel):
    """Submit form data."""
    form_template_id: str
    task_instance_id: Optional[str] = None
    equipment_id: Optional[str] = None
    efm_id: Optional[str] = None
    
    values: List[FieldValue]
    
    notes: Optional[str] = None
    signature_data: Optional[str] = None  # Base64 signature if required


class FormSubmissionUpdate(BaseModel):
    """Update a form submission (if allowed)."""
    values: Optional[List[FieldValue]] = None
    notes: Optional[str] = None
    signature_data: Optional[str] = None
