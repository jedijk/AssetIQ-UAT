"""
Risk Calculation Settings Models.

Per-installation configuration for how risk scores are calculated.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class RiskCalculationSettings(BaseModel):
    """Settings for risk score calculation per installation."""
    # Weightage between criticality and FMEA/business risk (must sum to 1.0)
    criticality_weight: float = Field(default=0.75, ge=0, le=1, description="Weight for equipment criticality (0-1)")
    fmea_weight: float = Field(default=0.25, ge=0, le=1, description="Weight for FMEA/failure mode score (0-1)")
    
    # Risk level thresholds
    critical_threshold: int = Field(default=70, ge=0, le=100, description="Score >= this is Critical")
    high_threshold: int = Field(default=50, ge=0, le=100, description="Score >= this is High")
    medium_threshold: int = Field(default=30, ge=0, le=100, description="Score >= this is Medium")
    # Below medium_threshold is Low


class RiskSettingsUpdate(BaseModel):
    """Update risk calculation settings for an installation."""
    criticality_weight: Optional[float] = Field(default=None, ge=0, le=1)
    fmea_weight: Optional[float] = Field(default=None, ge=0, le=1)
    critical_threshold: Optional[int] = Field(default=None, ge=0, le=100)
    high_threshold: Optional[int] = Field(default=None, ge=0, le=100)
    medium_threshold: Optional[int] = Field(default=None, ge=0, le=100)


class RiskSettingsResponse(BaseModel):
    """Response model for risk settings."""
    installation_id: str
    installation_name: str
    criticality_weight: float
    fmea_weight: float
    critical_threshold: int
    high_threshold: int
    medium_threshold: int
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


# Default settings
DEFAULT_RISK_SETTINGS = {
    "criticality_weight": 0.75,
    "fmea_weight": 0.25,
    "critical_threshold": 70,
    "high_threshold": 50,
    "medium_threshold": 30
}
