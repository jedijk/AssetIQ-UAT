"""SpareIQ data models."""
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class SparePartRequirement(BaseModel):
    spare_part_id: str
    quantity: int = Field(default=1, ge=1, le=9999)

    @field_validator("spare_part_id")
    @classmethod
    def _strip_id(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("spare_part_id is required")
        return cleaned


class SparePartEquipmentLink(BaseModel):
    equipment_id: str
    component_position: Optional[str] = None


class SparePartCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    type_model: str = Field(..., min_length=1, max_length=120)
    manufacturer: Optional[str] = Field(None, max_length=120)
    category_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=4000)
    document_url: Optional[str] = Field(None, max_length=2000)
    equipment_links: List[SparePartEquipmentLink] = Field(default_factory=list)


class SparePartUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    type_model: Optional[str] = Field(None, min_length=1, max_length=120)
    manufacturer: Optional[str] = Field(None, max_length=120)
    category_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=4000)
    document_url: Optional[str] = Field(None, max_length=2000)
    equipment_links: Optional[List[SparePartEquipmentLink]] = None


class SpareCategoryCreate(BaseModel):
    value: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=80)
    sort_order: Optional[int] = None
    is_active: bool = True


class SpareCategoryUpdate(BaseModel):
    label: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
