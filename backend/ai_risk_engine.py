"""
AI Risk Engine Service - ThreatBase v2
Uses GPT-5.2 for intelligent risk analysis, cause generation, and recommendations
"""

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from emergentintegrations.llm.chat import LlmChat, UserMessage

from ai_risk_models import (
    DynamicRiskScore, RiskTrend, ConfidenceLevel, RiskForecast, RiskInsight,
    ProbableCause, CauseProbability, CausalExplanation,
    FaultTreeNode, FaultTree,
    BowTieBarrier, BowTieModel,
    RecommendedAction, ActionOptimizationResult
)
from services.ai_security_service import (
    sanitize_threat_context, 
    sanitize_equipment_history,
    sanitize_for_ai_prompt
)

logger = logging.getLogger(__name__)


# ============= System Prompts =============

RISK_ANALYSIS_PROMPT = """You are an AI Risk Analyst for industrial equipment. Analyze the given threat and provide a detailed risk assessment.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.

The threat already has a Risk Score calculated using FMEA methodology:
- Risk Score = Likelihood × Detectability × 10
- Scale: 10-250 (Low < 50, Medium 50-99, High 100-149, Critical >= 150)
- Current threat risk score is provided in the context

IMPORTANT: Use the EQUIPMENT HISTORY to inform your analysis:
- Past observations indicate recurring issues or patterns
- Completed actions show maintenance efforts already taken
- Completed tasks indicate preventive work done
- Consider the timeline and frequency of past issues

Given the threat details and equipment history, provide:
1. DO NOT recalculate risk_score - use the provided threat's current risk score
2. Failure Probability (0-100%):
   - Based on failure mode patterns
   - Equipment condition indicators
   - Historical data patterns from equipment history
   - Account for recent maintenance actions completed

3. Time-to-Failure Estimate:
   - Based on degradation patterns
   - Consider past similar failures on this equipment
   - Provide in hours (null if uncertain)

4. Risk Trend:
   - "increasing", "stable", or "decreasing" based on current conditions
   - Factor in recent maintenance actions and their effectiveness

5. Trend Delta:
   - Expected change in risk score over time (positive = worsening, negative = improving)

6. Key Risk Factors (3-5 factors)
   - Include factors from equipment history

7. Forecasts for next 7/14/30 days using the SAME FMEA scale (10-250)
   - Start from the current risk score and project changes
   - Consider effectiveness of recent maintenance

8. Recommendations - IMPORTANT: Each recommendation must be a structured object with:
   - action: The recommended action description
   - action_type: One of "CM" (Corrective Maintenance), "PM" (Preventive Maintenance), or "PDM" (Predictive Maintenance)
   - discipline: One of "Mechanical", "Electrical", "Instrumentation", "Process", "Operations", "Maintenance", "Safety", "Inspection", "Reliability", "Rotating Equipment", "Static Equipment", "Multi-discipline"
   - Avoid recommending actions that have already been completed recently

RESPOND IN THIS EXACT JSON FORMAT:
{
  "risk_score": <use_the_threats_current_score>,
  "failure_probability": 65.0,
  "time_to_failure_hours": 168,
  "time_to_failure_display": "5-7 days",
  "confidence": "medium",
  "trend": "increasing",
  "trend_delta": 10,
  "factors": ["factor1", "factor2", "factor3"],
  "key_insights": ["insight1", "insight2"],
  "recommendations": [
    {"action": "Perform vibration analysis on bearings", "action_type": "PDM", "discipline": "Mechanical"},
    {"action": "Replace worn seals during next shutdown", "action_type": "PM", "discipline": "Mechanical"},
    {"action": "Repair damaged component immediately", "action_type": "CM", "discipline": "Rotating Equipment"}
  ],
  "forecasts": [
    {"days_ahead": 7, "predicted_risk_score": 70, "predicted_probability": 70.0, "confidence": "medium"},
    {"days_ahead": 14, "predicted_risk_score": 80, "predicted_probability": 75.0, "confidence": "low"},
    {"days_ahead": 30, "predicted_risk_score": 95, "predicted_probability": 80.0, "confidence": "low"}
  ]
}"""

CAUSE_ANALYSIS_PROMPT = """You are an AI Causal Analysis Expert for industrial equipment failures. Analyze the threat and identify probable root causes.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.

IMPORTANT: Use the EQUIPMENT HISTORY to inform your analysis:
- Past observations on this equipment may reveal recurring issues or patterns
- Previously identified causes on the same equipment are highly relevant
- Completed maintenance actions indicate what has been tried before
- Consider if past causes have been properly addressed or may recur

For the given threat, identify:
1. Top 3-5 probable causes ranked by likelihood
2. Category for each cause: technical_cause, human_factor, maintenance_issue, design_issue, organizational_factor, external_condition
3. Probability percentage for each cause (total can exceed 100% as causes may combine)
4. Supporting evidence indicators (include evidence from equipment history)
5. Recommended mitigation actions for each cause - IMPORTANT: Each action must be a structured object with:
   - action: The recommended action description
   - action_type: One of "CM" (Corrective Maintenance), "PM" (Preventive Maintenance), or "PDM" (Predictive Maintenance)
   - discipline: One of "Mechanical", "Electrical", "Instrumentation", "Process", "Operations", "Safety", "Rotating Equipment", "Static Equipment", "Piping", "Multi-discipline"
   - Do not recommend actions that were recently completed unless there's evidence they failed

RESPOND IN THIS EXACT JSON FORMAT:
{
  "summary": "Brief summary of the causal analysis",
  "probable_causes": [
    {
      "id": "cause_1",
      "description": "Detailed cause description",
      "category": "technical_cause",
      "probability": 75.0,
      "probability_level": "very_likely",
      "evidence": ["evidence1", "evidence2"],
      "supporting_data": ["data point 1", "data point 2"],
      "mitigation_actions": [
        {"action": "Replace worn bearings", "action_type": "CM", "discipline": "Mechanical"},
        {"action": "Implement vibration monitoring", "action_type": "PDM", "discipline": "Rotating Equipment"}
      ]
    }
  ],
  "contributing_factors": ["factor1", "factor2"],
  "confidence": "medium"
}"""

FAULT_TREE_PROMPT = """You are an AI Reliability Engineer generating fault trees. Create a structured fault tree for the given threat.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.

Build a fault tree with:
1. Top Event: The main failure/threat
2. Intermediate Events: Contributing failure modes
3. Basic Events: Root causes (leaves of the tree)
4. Gate types: "gate_and" (all children must fail) or "gate_or" (any child can cause)

Node types: "top_event", "intermediate", "basic_event", "gate_and", "gate_or"

RESPOND IN THIS EXACT JSON FORMAT:
{
  "top_event": "Description of the main failure",
  "root": {
    "id": "top_1",
    "label": "Main Failure Event",
    "node_type": "top_event",
    "probability": 0.65,
    "children": [
      {
        "id": "gate_1",
        "label": "OR Gate - Any of these causes",
        "node_type": "gate_or",
        "probability": null,
        "children": [
          {
            "id": "int_1",
            "label": "Mechanical Failure",
            "node_type": "intermediate",
            "probability": 0.40,
            "children": [
              {
                "id": "basic_1",
                "label": "Bearing Wear",
                "node_type": "basic_event",
                "probability": 0.30,
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  "total_nodes": 5
}"""

BOW_TIE_PROMPT = """You are an AI Risk Analyst creating bow-tie risk models. Generate a bow-tie diagram for the given threat.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.

Create a bow-tie model with:
1. Hazard: The underlying danger
2. Top Event: The loss of control event
3. Causes: Left side - what can lead to the event
4. Consequences: Right side - what happens if event occurs
5. Preventive Barriers: Between causes and event
6. Mitigative Barriers: Between event and consequences

RESPOND IN THIS EXACT JSON FORMAT:
{
  "hazard": "Description of the underlying hazard",
  "top_event": "The critical event",
  "causes": ["cause1", "cause2", "cause3"],
  "consequences": ["consequence1", "consequence2", "consequence3"],
  "preventive_barriers": [
    {
      "id": "pb_1",
      "description": "Barrier description",
      "barrier_type": "preventive",
      "effectiveness": "high",
      "status": "active"
    }
  ],
  "mitigative_barriers": [
    {
      "id": "mb_1",
      "description": "Barrier description",
      "barrier_type": "mitigative",
      "effectiveness": "medium",
      "status": "active"
    }
  ]
}"""

ACTION_OPTIMIZATION_PROMPT = """You are an AI Action Optimization Expert. Recommend optimal actions to reduce risk for the given threat.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.

For the threat and its causes, recommend:
1. At least 3 actions ranked by ROI (risk reduction per cost)
2. Maintenance type (action_type): 
   - "CM" for Corrective Maintenance (fix after failure)
   - "PM" for Preventive Maintenance (scheduled maintenance to prevent failure)
   - "PDM" for Predictive Maintenance (condition-based monitoring)
3. Discipline: One of "Mechanical", "Electrical", "Instrumentation", "Process", "Operations", "Safety", "Rotating Equipment", "Static Equipment", "Piping", "Multi-discipline"
4. Expected risk reduction percentage
5. Estimated cost in EUR
6. Downtime impact in hours
7. Urgency level: critical, high, medium, low

RESPOND IN THIS EXACT JSON FORMAT:
{
  "recommended_actions": [
    {
      "id": "act_1",
      "description": "Detailed action description",
      "action_type": "PM",
      "discipline": "Mechanical",
      "expected_risk_reduction": 25.0,
      "estimated_cost": 500.0,
      "cost_currency": "EUR",
      "downtime_hours": 4,
      "roi_score": 0.05,
      "urgency": "high",
      "feasibility": "high",
      "linked_cause_id": null
    }
  ],
  "total_potential_risk_reduction": 75.0,
  "optimal_action_sequence": ["act_1", "act_2", "act_3"],
  "analysis_summary": "Summary of the optimization analysis"
}"""


class AIRiskEngine:
    """AI-powered risk analysis engine using GPT-5.2"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
    
    # Token limits for different analysis types
    TOKEN_LIMITS = {
        'risk_analysis': 2000,
        'cause_analysis': 2500,
        'fault_tree': 2000,
        'bow_tie': 2000,
        'action_optimization': 2000
    }
    
    def _create_chat(self, system_prompt: str, session_id: str, analysis_type: str = 'risk_analysis') -> LlmChat:
        """Create a new LLM chat instance with token limits"""
        max_tokens = self.TOKEN_LIMITS.get(analysis_type, 2000)
        return LlmChat(
            api_key=self.api_key,
            session_id=session_id,
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2").with_params(max_tokens=max_tokens)
    
    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from LLM response, handling markdown code blocks"""
        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()
        return json.loads(clean_response)
    
    def _build_threat_context(self, threat: dict, equipment_data: dict = None, historical_threats: list = None, equipment_history: dict = None) -> str:
        """Build context string for AI analysis with sanitized inputs"""
        # Sanitize threat data to prevent prompt injection
        safe_threat = sanitize_threat_context(threat)
        
        context = f"""
THREAT DETAILS:
- Title: {safe_threat.get('title', 'Unknown')}
- Asset: {safe_threat.get('asset', 'Unknown')}
- Equipment Type: {safe_threat.get('equipment_type', 'Unknown')}
- Failure Mode: {safe_threat.get('failure_mode', 'Unknown')}
- Cause (if known): {safe_threat.get('cause', 'Not specified')}
- Impact: {safe_threat.get('impact', 'Unknown')}
- Frequency: {safe_threat.get('frequency', 'Unknown')}
- Current Risk Score: {safe_threat.get('risk_score', 'N/A')}
- Current Risk Level: {safe_threat.get('risk_level', 'N/A')}
- Status: {safe_threat.get('status', 'Open')}
- Location: {safe_threat.get('location', 'Not specified')}
- Equipment Criticality: {safe_threat.get('equipment_criticality', 'Not specified')}
- Created: {safe_threat.get('created_at', 'Unknown')}
"""
        
        if equipment_data:
            # Sanitize equipment data
            safe_equip_type = sanitize_for_ai_prompt(str(equipment_data.get('equipment_type', 'Unknown')), max_length=100)
            safe_discipline = sanitize_for_ai_prompt(str(equipment_data.get('discipline', 'Unknown')), max_length=100)
            criticality = equipment_data.get('criticality', {})
            safe_crit_level = sanitize_for_ai_prompt(str(criticality.get('level', 'Unknown')), max_length=50)
            
            context += f"""
EQUIPMENT INFORMATION:
- Equipment Type: {safe_equip_type}
- Criticality Level: {safe_crit_level}
- Discipline: {safe_discipline}
"""
        
        # Sanitize and add equipment history
        if equipment_history:
            safe_history = sanitize_equipment_history(equipment_history)
            past_obs = safe_history.get("observations", [])
            past_actions = safe_history.get("actions", [])
            past_tasks = safe_history.get("tasks", [])
            
            if past_obs:
                context += "\nEQUIPMENT HISTORY - PAST OBSERVATIONS:\n"
                for i, obs in enumerate(past_obs[:5], 1):
                    context += f"{i}. {obs.get('title', 'Unknown')[:50]} - Failure Mode: {obs.get('failure_mode', 'N/A')}, Risk: {obs.get('risk_score', 'N/A')}, Status: {obs.get('status', 'Unknown')}, Date: {obs.get('created_at', 'Unknown')[:10] if obs.get('created_at') else 'N/A'}\n"
            
            if past_actions:
                context += "\nEQUIPMENT HISTORY - MAINTENANCE ACTIONS:\n"
                for i, action in enumerate(past_actions[:5], 1):
                    context += f"{i}. {action.get('title', 'Unknown')[:50]} - Status: {action.get('status', 'Unknown')}, Priority: {action.get('priority', 'N/A')}, Date: {action.get('created_at', 'Unknown')[:10] if action.get('created_at') else 'N/A'}\n"
            
            if past_tasks:
                context += "\nEQUIPMENT HISTORY - COMPLETED MAINTENANCE TASKS:\n"
                for i, task in enumerate(past_tasks[:5], 1):
                    context += f"{i}. {task.get('name', 'Unknown')[:50]} - Completed: {task.get('completed_at', 'Unknown')[:10] if task.get('completed_at') else 'N/A'}\n"
            
            if not past_obs and not past_actions and not past_tasks:
                context += "\nEQUIPMENT HISTORY: No previous observations, actions, or completed tasks recorded for this equipment.\n"
        
        if historical_threats:
            context += "\nSIMILAR HISTORICAL THREATS (other equipment):\n"
            for i, ht in enumerate(historical_threats[:3], 1):
                # Sanitize historical threat titles
                safe_title = sanitize_for_ai_prompt(str(ht.get('title', 'Unknown')), max_length=100)
                context += f"{i}. {safe_title} - Risk: {ht.get('risk_score', 'N/A')}, Status: {ht.get('status', 'Unknown')}\n"
        
        return context
    
    async def analyze_risk(
        self, 
        threat: dict, 
        equipment_data: dict = None,
        historical_threats: list = None,
        equipment_history: dict = None,
        include_forecast: bool = True
    ) -> RiskInsight:
        """Analyze threat and generate dynamic risk assessment"""
        try:
            session_id = f"risk_analysis_{threat.get('id', 'unknown')}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            chat = self._create_chat(RISK_ANALYSIS_PROMPT, session_id, 'risk_analysis')
            
            context = self._build_threat_context(threat, equipment_data, historical_threats, equipment_history)
            message = UserMessage(text=f"Analyze this threat:\n{context}")
            
            response = await chat.send_message(message)
            data = self._parse_json_response(response)
            
            # Use the threat's actual risk_score for consistency
            threat_risk_score = threat.get("risk_score", 50)
            
            # Build DynamicRiskScore - always use threat's risk score
            dynamic_risk = DynamicRiskScore(
                risk_score=threat_risk_score,  # Use threat's actual score, not AI's
                failure_probability=data.get("failure_probability", 50.0),
                time_to_failure_hours=data.get("time_to_failure_hours"),
                time_to_failure_display=data.get("time_to_failure_display"),
                confidence=ConfidenceLevel(data.get("confidence", "medium")),
                trend=RiskTrend(data.get("trend", "stable")),
                trend_delta=data.get("trend_delta"),
                factors=data.get("factors", []),
                last_updated=datetime.now(timezone.utc).isoformat()
            )
            
            # Build forecasts - ensure they use the same FMEA scale
            forecasts = []
            if include_forecast and "forecasts" in data:
                for fc in data["forecasts"]:
                    # Ensure forecast scores are reasonable relative to current score
                    predicted_score = fc["predicted_risk_score"]
                    # If AI gives a score on 0-100 scale, scale it to FMEA range
                    if predicted_score <= 100 and threat_risk_score > 100:
                        predicted_score = int(threat_risk_score * (1 + (fc.get("days_ahead", 7) * 0.01)))
                    forecasts.append(RiskForecast(
                        days_ahead=fc["days_ahead"],
                        predicted_risk_score=min(250, max(10, predicted_score)),  # Clamp to FMEA range
                        predicted_probability=fc["predicted_probability"],
                        confidence=ConfidenceLevel(fc.get("confidence", "medium"))
                    ))
            
            return RiskInsight(
                threat_id=threat.get("id", "unknown"),
                dynamic_risk=dynamic_risk,
                forecasts=forecasts,
                key_insights=data.get("key_insights", []),
                recommendations=data.get("recommendations", []),
                similar_past_incidents=[]
            )
            
        except Exception as e:
            logger.error(f"Risk analysis failed: {e}")
            # Return a default risk insight on error
            return RiskInsight(
                threat_id=threat.get("id", "unknown"),
                dynamic_risk=DynamicRiskScore(
                    risk_score=threat.get("risk_score", 50),
                    failure_probability=50.0,
                    confidence=ConfidenceLevel.LOW,
                    trend=RiskTrend.STABLE,
                    factors=["Analysis unavailable - using baseline assessment"],
                    last_updated=datetime.now(timezone.utc).isoformat()
                ),
                forecasts=[],
                key_insights=["AI analysis temporarily unavailable"],
                recommendations=threat.get("recommended_actions", [])
            )
    
    def _normalize_probability_level(self, level: str) -> str:
        """Normalize AI-returned probability levels to valid enum values"""
        level_lower = str(level).lower().strip()
        mapping = {
            "very_likely": "very_likely",
            "very likely": "very_likely",
            "high": "very_likely",
            "very high": "very_likely",
            "likely": "likely",
            "probable": "likely",
            "medium_high": "likely",
            "possible": "possible",
            "medium": "possible",
            "moderate": "possible",
            "uncertain": "possible",
            "unlikely": "unlikely",
            "low": "unlikely",
            "improbable": "unlikely",
            "very_unlikely": "unlikely",
            "very unlikely": "unlikely",
        }
        return mapping.get(level_lower, "possible")
    
    def _normalize_confidence_level(self, level: str) -> str:
        """Normalize AI-returned confidence levels to valid enum values"""
        level_lower = str(level).lower().strip()
        mapping = {
            "high": "high",
            "very_high": "high",
            "confident": "high",
            "medium": "medium",
            "moderate": "medium",
            "average": "medium",
            "low": "low",
            "uncertain": "low",
            "very_low": "low",
        }
        return mapping.get(level_lower, "medium")

    async def generate_causes(
        self, 
        threat: dict,
        equipment_data: dict = None,
        equipment_history: dict = None,
        max_causes: int = 5
    ) -> CausalExplanation:
        """Generate probable causes for a threat"""
        try:
            session_id = f"cause_analysis_{threat.get('id', 'unknown')}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            chat = self._create_chat(CAUSE_ANALYSIS_PROMPT, session_id, 'cause_analysis')
            
            context = self._build_threat_context(threat, equipment_data, None, equipment_history)
            message = UserMessage(text=f"Analyze causes for this threat (max {max_causes} causes):\n{context}")
            
            response = await chat.send_message(message)
            data = self._parse_json_response(response)
            
            # Build probable causes with normalized probability levels
            probable_causes = []
            for cause_data in data.get("probable_causes", [])[:max_causes]:
                raw_prob_level = cause_data.get("probability_level", "possible")
                normalized_prob_level = self._normalize_probability_level(raw_prob_level)
                
                probable_causes.append(ProbableCause(
                    id=cause_data.get("id", str(uuid.uuid4())[:8]),
                    description=cause_data["description"],
                    category=cause_data.get("category", "technical_cause"),
                    probability=cause_data.get("probability", 50.0),
                    probability_level=CauseProbability(normalized_prob_level),
                    evidence=cause_data.get("evidence", []),
                    supporting_data=cause_data.get("supporting_data", []),
                    mitigation_actions=cause_data.get("mitigation_actions", [])
                ))
            
            # Normalize confidence level
            raw_confidence = data.get("confidence", "medium")
            normalized_confidence = self._normalize_confidence_level(raw_confidence)
            
            return CausalExplanation(
                threat_id=threat.get("id", "unknown"),
                summary=data.get("summary", "Causal analysis completed"),
                probable_causes=probable_causes,
                contributing_factors=data.get("contributing_factors", []),
                historical_matches=[],
                confidence=ConfidenceLevel(normalized_confidence)
            )
            
        except Exception as e:
            logger.error(f"Cause generation failed: {e}")
            return CausalExplanation(
                threat_id=threat.get("id", "unknown"),
                summary="Unable to complete causal analysis",
                probable_causes=[],
                contributing_factors=[],
                confidence=ConfidenceLevel.LOW
            )
    
    async def generate_fault_tree(
        self, 
        threat: dict,
        max_depth: int = 4
    ) -> FaultTree:
        """Generate a fault tree for the threat"""
        try:
            session_id = f"fault_tree_{threat.get('id', 'unknown')}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            chat = self._create_chat(FAULT_TREE_PROMPT, session_id, 'fault_tree')
            
            context = self._build_threat_context(threat)
            message = UserMessage(text=f"Generate a fault tree (max depth {max_depth}):\n{context}")
            
            response = await chat.send_message(message)
            data = self._parse_json_response(response)
            
            def parse_node(node_data: dict) -> FaultTreeNode:
                return FaultTreeNode(
                    id=node_data.get("id", str(uuid.uuid4())[:8]),
                    label=node_data.get("label", "Unknown"),
                    node_type=node_data.get("node_type", "intermediate"),
                    probability=node_data.get("probability"),
                    children=[parse_node(child) for child in node_data.get("children", [])]
                )
            
            root_node = parse_node(data.get("root", {"id": "root", "label": threat.get("title", "Unknown"), "node_type": "top_event", "children": []}))
            
            return FaultTree(
                threat_id=threat.get("id", "unknown"),
                top_event=data.get("top_event", threat.get("title", "Unknown Failure")),
                root=root_node,
                total_nodes=data.get("total_nodes", 1),
                generated_at=datetime.now(timezone.utc).isoformat()
            )
            
        except Exception as e:
            logger.error(f"Fault tree generation failed: {e}")
            return FaultTree(
                threat_id=threat.get("id", "unknown"),
                top_event=threat.get("title", "Unknown Failure"),
                root=FaultTreeNode(
                    id="root",
                    label=threat.get("title", "Unknown"),
                    node_type="top_event",
                    children=[]
                ),
                total_nodes=1,
                generated_at=datetime.now(timezone.utc).isoformat()
            )
    
    async def generate_bow_tie(self, threat: dict) -> BowTieModel:
        """Generate a bow-tie risk model"""
        try:
            session_id = f"bow_tie_{threat.get('id', 'unknown')}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            chat = self._create_chat(BOW_TIE_PROMPT, session_id, 'bow_tie')
            
            context = self._build_threat_context(threat)
            message = UserMessage(text=f"Generate a bow-tie model:\n{context}")
            
            response = await chat.send_message(message)
            data = self._parse_json_response(response)
            
            preventive_barriers = [
                BowTieBarrier(**barrier) for barrier in data.get("preventive_barriers", [])
            ]
            mitigative_barriers = [
                BowTieBarrier(**barrier) for barrier in data.get("mitigative_barriers", [])
            ]
            
            return BowTieModel(
                threat_id=threat.get("id", "unknown"),
                hazard=data.get("hazard", "Unknown hazard"),
                top_event=data.get("top_event", threat.get("title", "Unknown")),
                causes=data.get("causes", []),
                consequences=data.get("consequences", []),
                preventive_barriers=preventive_barriers,
                mitigative_barriers=mitigative_barriers
            )
            
        except Exception as e:
            logger.error(f"Bow-tie generation failed: {e}")
            return BowTieModel(
                threat_id=threat.get("id", "unknown"),
                hazard="Analysis unavailable",
                top_event=threat.get("title", "Unknown"),
                causes=[],
                consequences=[],
                preventive_barriers=[],
                mitigative_barriers=[]
            )
    
    async def optimize_actions(
        self, 
        threat: dict,
        causes: List[ProbableCause] = None,
        budget_limit: float = None,
        prioritize_by: str = "roi"
    ) -> ActionOptimizationResult:
        """Optimize and recommend actions for risk reduction"""
        try:
            session_id = f"action_opt_{threat.get('id', 'unknown')}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            chat = self._create_chat(ACTION_OPTIMIZATION_PROMPT, session_id, 'action_optimization')
            
            context = self._build_threat_context(threat)
            
            if causes:
                context += "\nIDENTIFIED CAUSES:\n"
                for cause in causes:
                    context += f"- {cause.description} ({cause.probability}% probability)\n"
            
            if budget_limit:
                context += f"\nBUDGET CONSTRAINT: Maximum {budget_limit} EUR\n"
            
            context += f"\nPRIORITIZE BY: {prioritize_by}\n"
            
            message = UserMessage(text=f"Recommend optimized actions:\n{context}")
            
            response = await chat.send_message(message)
            data = self._parse_json_response(response)
            
            recommended_actions = [
                RecommendedAction(**action) for action in data.get("recommended_actions", [])
            ]
            
            return ActionOptimizationResult(
                threat_id=threat.get("id", "unknown"),
                recommended_actions=recommended_actions,
                total_potential_risk_reduction=data.get("total_potential_risk_reduction", 0),
                optimal_action_sequence=data.get("optimal_action_sequence", []),
                analysis_summary=data.get("analysis_summary", "Analysis completed")
            )
            
        except Exception as e:
            logger.error(f"Action optimization failed: {e}")
            return ActionOptimizationResult(
                threat_id=threat.get("id", "unknown"),
                recommended_actions=[],
                total_potential_risk_reduction=0,
                optimal_action_sequence=[],
                analysis_summary="Optimization analysis unavailable"
            )
