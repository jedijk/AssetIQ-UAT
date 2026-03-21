"""
AI Risk Engine - Data Models for ThreatBase v2
Dynamic risk scoring, failure prediction, and causal intelligence
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime


class RiskTrend(str, Enum):
    INCREASING = "increasing"
    STABLE = "stable"
    DECREASING = "decreasing"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class CauseProbability(str, Enum):
    VERY_LIKELY = "very_likely"
    LIKELY = "likely"
    POSSIBLE = "possible"
    UNLIKELY = "unlikely"


# ============= AI Risk Engine Models =============

class DynamicRiskScore(BaseModel):
    """Dynamic risk score with AI-computed metrics"""
    risk_score: int = Field(ge=0, le=100, description="AI-calculated risk score 0-100")
    failure_probability: float = Field(ge=0, le=100, description="Failure probability percentage")
    time_to_failure_hours: Optional[int] = Field(None, description="Estimated hours to failure")
    time_to_failure_display: Optional[str] = Field(None, description="Human-readable time estimate")
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM
    trend: RiskTrend = RiskTrend.STABLE
    trend_delta: Optional[int] = Field(None, description="Score change from previous analysis")
    factors: List[str] = Field(default_factory=list, description="Key risk factors identified")
    last_updated: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class RiskForecast(BaseModel):
    """Risk forecast for future time periods"""
    days_ahead: int
    predicted_risk_score: int
    predicted_probability: float
    confidence: ConfidenceLevel


class RiskInsight(BaseModel):
    """AI-generated insight about a threat"""
    threat_id: str
    dynamic_risk: DynamicRiskScore
    forecasts: List[RiskForecast] = Field(default_factory=list)
    key_insights: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    similar_past_incidents: List[Dict[str, Any]] = Field(default_factory=list)


# ============= Causal Intelligence Models =============

class ProbableCause(BaseModel):
    """AI-identified probable cause"""
    id: str
    description: str
    category: str  # technical, human_factor, maintenance, design, organizational, external
    probability: float = Field(ge=0, le=100, description="Probability this is the cause")
    probability_level: CauseProbability
    evidence: List[str] = Field(default_factory=list)
    supporting_data: List[str] = Field(default_factory=list)
    mitigation_actions: List[str] = Field(default_factory=list)


class CausalExplanation(BaseModel):
    """AI explanation for 'Why is this happening?'"""
    threat_id: str
    summary: str
    probable_causes: List[ProbableCause]
    contributing_factors: List[str] = Field(default_factory=list)
    historical_matches: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM


class FaultTreeNode(BaseModel):
    """Node in a fault tree"""
    id: str
    label: str
    node_type: str  # "top_event", "intermediate", "basic_event", "gate_and", "gate_or"
    probability: Optional[float] = None
    children: List["FaultTreeNode"] = Field(default_factory=list)


class FaultTree(BaseModel):
    """Auto-generated fault tree structure"""
    threat_id: str
    top_event: str
    root: FaultTreeNode
    total_nodes: int
    generated_at: str


class BowTieBarrier(BaseModel):
    """Barrier in bow-tie model"""
    id: str
    description: str
    barrier_type: str  # "preventive" or "mitigative"
    effectiveness: str  # "high", "medium", "low"
    status: str  # "active", "degraded", "failed"


class BowTieModel(BaseModel):
    """Bow-tie risk model"""
    threat_id: str
    hazard: str
    top_event: str
    causes: List[str]
    consequences: List[str]
    preventive_barriers: List[BowTieBarrier]
    mitigative_barriers: List[BowTieBarrier]


# ============= Action Optimization Models =============

class RecommendedAction(BaseModel):
    """AI-recommended action with ROI analysis"""
    id: str
    description: str
    action_type: str  # "immediate", "short_term", "long_term", "preventive"
    expected_risk_reduction: float = Field(ge=0, le=100, description="Expected % risk reduction")
    estimated_cost: Optional[float] = None
    cost_currency: str = "EUR"
    downtime_hours: Optional[int] = None
    roi_score: Optional[float] = Field(None, description="Risk reduction per EUR spent")
    urgency: str = "medium"  # critical, high, medium, low
    feasibility: str = "high"  # high, medium, low
    linked_cause_id: Optional[str] = None


class ActionOptimizationResult(BaseModel):
    """AI action optimization result"""
    threat_id: str
    recommended_actions: List[RecommendedAction]
    total_potential_risk_reduction: float
    optimal_action_sequence: List[str]  # Action IDs in optimal order
    analysis_summary: str


# ============= Request Models =============

class AnalyzeRiskRequest(BaseModel):
    """Request for AI risk analysis"""
    include_forecast: bool = True
    forecast_days: int = Field(default=7, ge=1, le=30)
    include_similar_incidents: bool = True


class GenerateCausesRequest(BaseModel):
    """Request for AI cause generation"""
    max_causes: int = Field(default=5, ge=1, le=10)
    include_evidence: bool = True
    include_mitigations: bool = True


class GenerateFaultTreeRequest(BaseModel):
    """Request for fault tree generation"""
    max_depth: int = Field(default=4, ge=2, le=6)
    include_probabilities: bool = True


class OptimizeActionsRequest(BaseModel):
    """Request for action optimization"""
    budget_limit: Optional[float] = None
    max_downtime_hours: Optional[int] = None
    prioritize_by: str = "roi"  # "roi", "risk_reduction", "urgency", "cost"


# Enable forward reference resolution
FaultTreeNode.model_rebuild()
