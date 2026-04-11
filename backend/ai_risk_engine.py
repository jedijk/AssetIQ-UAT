"""
AI Risk Engine Service - ThreatBase v2
Uses GPT-4o for intelligent risk analysis, cause generation, and recommendations
"""

import os
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from openai import OpenAI

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

def get_openai_client() -> OpenAI:
    """Get OpenAI client with API key from environment."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured in environment")
    return OpenAI(api_key=api_key)


# ============= System Prompts =============

RISK_ANALYSIS_PROMPT = """You are an expert AI Risk Analyst specializing in industrial equipment reliability, maintenance engineering, and failure analysis. Your role is to provide COMPREHENSIVE, DETAILED, and ACTIONABLE risk assessments that go beyond surface-level observations.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.

The threat already has a Risk Score calculated using FMEA methodology:
- Risk Score = Likelihood × Detectability × 10
- Scale: 10-250 (Low < 50, Medium 50-99, High 100-149, Critical >= 150)
- Current threat risk score is provided in the context

CRITICAL ANALYSIS REQUIREMENTS - Your analysis must be RICH and DETAILED:

1. LEVERAGE ALL AVAILABLE DATA:
   - FIELD NOTES: Analyze observer's on-site observations in depth - these contain critical firsthand details
   - ATTACHMENTS: Reference any photos/documents as evidence supporting your analysis
   - EQUIPMENT HISTORY: Look for patterns, recurring failures, escalating issues, or previously attempted fixes
   - Consider seasonal factors, operational cycles, and maintenance intervals
   - Apply failure physics and degradation mechanisms specific to the equipment type

2. PROVIDE SPECIFIC TECHNICAL ANALYSIS:
   - Reference specific failure mechanisms (fatigue, corrosion, erosion, cavitation, etc.)
   - Consider material properties and environmental factors
   - Analyze component interactions and cascade failure potential
   - Reference industry standards (API, ISO, ASME) where applicable

3. GENERATE RICH KEY FACTORS (6-8 detailed factors):
   - Each factor should be a complete paragraph with technical depth
   - Explain the mechanism, not just the symptom
   - Include quantitative estimates where possible
   - Reference specific observations from field notes or history

4. GENERATE ACTIONABLE INSIGHTS (4-6 insights):
   - Each insight should provide strategic value, not just restate the problem
   - Include root cause hypotheses with supporting evidence
   - Identify reliability improvement opportunities
   - Highlight patterns that indicate systemic issues

5. DETAILED RECOMMENDATIONS (4-6 specific actions):
   - Each recommendation must include clear scope and expected outcome
   - Specify inspection methods, testing parameters, or replacement specifications
   - Include prerequisite conditions or safety considerations
   - Prioritize based on risk reduction potential

Given the threat details, provide your COMPREHENSIVE assessment:

1. DO NOT recalculate risk_score - use the provided threat's current risk score

2. Failure Probability (0-100%):
   - Analyze failure mode physics and degradation mechanisms
   - Consider equipment condition indicators from field notes
   - Factor in environmental stressors and operational demands
   - Provide detailed reasoning

3. Time-to-Failure Estimate:
   - Based on degradation rate analysis and condition assessment
   - Consider similar equipment failure histories
   - Account for operating conditions and load factors
   - Provide realistic range with confidence level

4. Risk Trend: "increasing", "stable", or "decreasing" with justification

5. Trend Delta: Expected change in risk score (positive = worsening)

6. Key Risk Factors (6-8 comprehensive factors):
   - "Equipment degradation pattern: [Detailed explanation of the specific degradation mechanism observed, including rate of progression based on field notes and history]"
   - "Failure physics analysis: [Technical explanation of how this failure mode develops, reference specific mechanisms]"
   - "Historical pattern significance: [Analysis of past incidents and what they indicate about current risk]"
   - Include operational, environmental, and maintenance-related factors

7. Key Insights (4-6 strategic insights):
   - Provide actionable intelligence, not just observations
   - Include reliability engineering perspective
   - Identify systemic issues or improvement opportunities
   - Reference specific evidence from the data provided

8. Forecasts for 7/14/30 days using FMEA scale (10-250)

9. Recommendations with full context:
   - action: Detailed description with specific parameters/specifications
   - action_type: "CM" (Corrective), "PM" (Preventive), or "PDM" (Predictive)
   - discipline: Appropriate technical discipline
   - Include inspection criteria, acceptance limits, or test parameters where relevant

RESPOND IN THIS EXACT JSON FORMAT:
{
  "risk_score": <use_the_threats_current_score>,
  "failure_probability": 65.0,
  "time_to_failure_hours": 168,
  "time_to_failure_display": "5-7 days (confidence: medium)",
  "confidence": "medium",
  "trend": "increasing",
  "trend_delta": 10,
  "factors": [
    "Equipment degradation analysis: The bearing assembly shows progressive wear patterns consistent with inadequate lubrication intervals. Based on the field notes indicating elevated temperatures (reported 15°C above normal), the bearing is likely experiencing boundary lubrication conditions where metal-to-metal contact occurs during load transitions. This accelerates wear rate by approximately 3-5x normal, suggesting remaining bearing life of 200-400 operating hours without intervention.",
    "Vibration signature correlation: Historical data shows a 40% increase in overall vibration levels over the past 3 months, with the characteristic 2x running speed component indicating misalignment-induced bearing stress. This pattern typically precedes catastrophic failure by 4-8 weeks in similar rotating equipment.",
    "Maintenance effectiveness gap: Previous lubrication task completed 45 days ago used standard mineral oil, however operating temperatures suggest synthetic lubricant would be more appropriate for this duty cycle. The recurrence of elevated temperatures indicates the root cause has not been addressed.",
    "Environmental stress factors: The equipment operates in a humid environment near cooling tower, exposing it to moisture ingress risk. Seals should be inspected for integrity as moisture contamination accelerates bearing degradation.",
    "Operational loading analysis: Production records indicate this unit frequently operates at 115% of rated capacity during peak periods, increasing bearing loads beyond design limits and accelerating fatigue damage accumulation.",
    "Cascade failure potential: This bearing supports a critical shaft connecting to the main process pump. Bearing failure would result in shaft deflection, potentially damaging mechanical seals and causing process fluid leakage."
  ],
  "key_insights": [
    "Root cause hypothesis: The combination of elevated operating temperatures, increased vibration, and inadequate lubrication grade points to a systematic maintenance gap rather than a random component failure. Addressing only the bearing without upgrading lubrication practices will likely result in repeat failure within 6-12 months.",
    "Reliability improvement opportunity: Implementing condition-based monitoring (vibration + temperature trending) on this equipment class could detect similar issues 4-6 weeks earlier, reducing unplanned downtime risk by 60%.",
    "Pattern analysis: This is the third bearing-related issue on rotating equipment in this area in 12 months, suggesting a common cause such as environmental factors, maintenance practices, or operating procedures that should be investigated.",
    "Cost-benefit consideration: Proactive bearing replacement during next planned outage (estimated cost €2,500) versus emergency failure response (estimated €15,000 including production loss) represents a 6:1 return on preventive action."
  ],
  "recommendations": [
    {"action": "Replace bearing assembly with upgraded SKF Explorer series bearing rated for higher operating temperatures. Include shaft inspection for wear marks or scoring. Acceptance criteria: shaft runout < 0.05mm, no visible wear on journal surface.", "action_type": "CM", "discipline": "Rotating Equipment"},
    {"action": "Upgrade lubrication to synthetic ISO VG 68 oil with EP additives suitable for temperatures up to 120°C. Establish new lubrication interval of 30 days based on operating conditions.", "action_type": "PM", "discipline": "Mechanical"},
    {"action": "Install wireless vibration and temperature sensors for continuous monitoring. Configure alerts at: vibration > 7mm/s overall, temperature > 75°C bearing housing.", "action_type": "PDM", "discipline": "Instrumentation"},
    {"action": "Inspect and replace shaft seals if moisture ingress detected. Use upgraded seal material (Viton) suitable for humid environment exposure.", "action_type": "PM", "discipline": "Mechanical"}
  ],
  "forecasts": [
    {"days_ahead": 7, "predicted_risk_score": 120, "predicted_probability": 70.0, "confidence": "medium"},
    {"days_ahead": 14, "predicted_risk_score": 145, "predicted_probability": 80.0, "confidence": "low"},
    {"days_ahead": 30, "predicted_risk_score": 180, "predicted_probability": 90.0, "confidence": "low"}
  ]
}"""

CAUSE_ANALYSIS_PROMPT = """You are an AI Causal Analysis Expert for industrial equipment failures. Analyze the threat and identify probable root causes.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.

IMPORTANT: Use ALL available information to inform your analysis:
- FIELD NOTES: Observer's firsthand account with additional context - these often contain crucial details about the condition observed
- ATTACHMENTS: Photos and documents that provide visual evidence of the failure or condition
- EQUIPMENT HISTORY: Past observations on this equipment may reveal recurring issues or patterns
- Previously identified causes on the same equipment are highly relevant
- Completed maintenance actions indicate what has been tried before
- Consider if past causes have been properly addressed or may recur

For the given threat, identify:
1. Top 3-5 probable causes ranked by likelihood
2. Category for each cause: technical_cause, human_factor, maintenance_issue, design_issue, organizational_factor, external_condition
3. Probability percentage for each cause (total can exceed 100% as causes may combine)
4. Supporting evidence indicators (include evidence from field notes, attachments, and equipment history)
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
        'risk_analysis': 6000,
        'cause_analysis': 5000,
        'fault_tree': 3000,
        'bow_tie': 3000,
        'action_optimization': 4000
    }
    
    def _call_openai(self, system_prompt: str, user_message: str, analysis_type: str = 'risk_analysis') -> str:
        """Make a chat completion call to OpenAI"""
        max_tokens = self.TOKEN_LIMITS.get(analysis_type, 3000)
        # Use lower temperature for more focused, detailed analysis
        temperature = 0.3 if analysis_type == 'risk_analysis' else 0.4
        try:
            logger.info(f"Calling OpenAI with model gpt-4o, max_tokens={max_tokens}")
            client = get_openai_client()
            response = client.chat.completions.create(
                model="gpt-4o",  # Use gpt-4o instead of gpt-5.2
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                max_completion_tokens=max_tokens,
                temperature=temperature
            )
            content = response.choices[0].message.content
            logger.info(f"OpenAI response received, length: {len(content) if content else 0}")
            return content
        except Exception as e:
            logger.error(f"OpenAI API error: {str(e)}")
            raise
    
    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from LLM response, handling markdown code blocks"""
        if response is None:
            logger.error("Response is None")
            return {}
        clean_response = response.strip()
        logger.info(f"Parsing response (first 200 chars): {clean_response[:200]}")
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()
        try:
            return json.loads(clean_response)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}. Response: {clean_response[:500]}")
            return {}
    
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
        
        # Add field notes/user context if available (CRITICAL - observer's firsthand account)
        user_context = threat.get('user_context')
        if user_context:
            safe_context = sanitize_for_ai_prompt(str(user_context), max_length=2000)
            context += f"""
FIELD NOTES (Observer's Additional Context - IMPORTANT):
{safe_context}
"""
        
        # Add image evidence if available
        image_url = threat.get('image_url')
        if image_url:
            context += "\nPHOTO EVIDENCE: Observer has attached a photo documenting the condition. Consider visual evidence in your assessment.\n"
        
        # Add attachment descriptions if available (pictures, documents)
        attachments = threat.get('attachments', [])
        if attachments:
            context += "\nATTACHMENTS/EVIDENCE:"
            for i, attachment in enumerate(attachments[:10], 1):  # Limit to 10 attachments
                att_type = attachment.get('type', 'unknown')
                att_name = sanitize_for_ai_prompt(str(attachment.get('name', 'Unnamed')), max_length=100)
                att_description = attachment.get('description', '')
                if att_description:
                    att_description = sanitize_for_ai_prompt(str(att_description), max_length=200)
                
                if att_type == 'image':
                    context += f"\n{i}. [IMAGE] {att_name}"
                    if att_description:
                        context += f" - {att_description}"
                    context += " (Visual evidence provided by observer)"
                elif att_type == 'document':
                    context += f"\n{i}. [DOCUMENT] {att_name}"
                    if att_description:
                        context += f" - {att_description}"
                else:
                    context += f"\n{i}. [{att_type.upper()}] {att_name}"
                    if att_description:
                        context += f" - {att_description}"
        
        # Add existing recommended actions if any
        existing_actions = threat.get('recommended_actions', [])
        if existing_actions:
            context += "\nPREVIOUSLY RECOMMENDED ACTIONS (from initial assessment):"
            for i, action in enumerate(existing_actions[:5], 1):
                if isinstance(action, dict):
                    action_text = action.get('action', str(action))
                else:
                    action_text = str(action)
                safe_action = sanitize_for_ai_prompt(action_text, max_length=200)
                context += f"\n{i}. {safe_action}"
        
        if equipment_data:
            # Sanitize equipment data
            safe_equip_name = sanitize_for_ai_prompt(str(equipment_data.get('name', 'Unknown')), max_length=100)
            safe_equip_type = sanitize_for_ai_prompt(str(equipment_data.get('equipment_type', 'Unknown')), max_length=100)
            safe_discipline = sanitize_for_ai_prompt(str(equipment_data.get('discipline', 'Unknown')), max_length=100)
            safe_description = sanitize_for_ai_prompt(str(equipment_data.get('description', '')), max_length=500)
            criticality = equipment_data.get('criticality', {})
            safe_crit_level = sanitize_for_ai_prompt(str(criticality.get('level', 'Unknown')), max_length=50)
            
            context += f"""
EQUIPMENT INFORMATION:
- Equipment Name: {safe_equip_name}
- Equipment Type: {safe_equip_type}
- Criticality Level: {safe_crit_level}
- Discipline: {safe_discipline}"""
            if safe_description:
                context += f"\n- Description: {safe_description}"
            
            # Add criticality details if available
            if criticality:
                if criticality.get('production_loss_per_day'):
                    context += f"\n- Production Loss/Day: €{criticality.get('production_loss_per_day')}"
                if criticality.get('downtime_days'):
                    context += f"\n- Expected Downtime: {criticality.get('downtime_days')} days"
                if criticality.get('safety_impact'):
                    context += f"\n- Safety Impact: {criticality.get('safety_impact')}/5"
            context += "\n"
        
        # Sanitize and add equipment history
        if equipment_history:
            safe_history = sanitize_equipment_history(equipment_history)
            past_obs = safe_history.get("observations", [])
            past_actions = safe_history.get("actions", [])
            past_tasks = safe_history.get("tasks", [])
            
            if past_obs:
                context += "\nEQUIPMENT HISTORY - PAST OBSERVATIONS (Critical for pattern analysis):\n"
                for i, obs in enumerate(past_obs[:8], 1):
                    obs_title = obs.get('title', 'Unknown')[:60]
                    obs_failure = obs.get('failure_mode', 'N/A')
                    obs_risk = obs.get('risk_score', 'N/A')
                    obs_status = obs.get('status', 'Unknown')
                    obs_date = obs.get('created_at', 'Unknown')[:10] if obs.get('created_at') else 'N/A'
                    context += f"{i}. [{obs_date}] {obs_title} - Failure Mode: {obs_failure}, Risk Score: {obs_risk}, Status: {obs_status}\n"
                    
                    # Include user_context (field notes) from past observations - VERY IMPORTANT
                    past_user_context = obs.get('user_context')
                    if past_user_context:
                        safe_past_context = sanitize_for_ai_prompt(str(past_user_context), max_length=300)
                        context += f"   Field Notes: {safe_past_context}\n"
                    
                    # Include cause if documented
                    past_cause = obs.get('cause')
                    if past_cause:
                        safe_cause = sanitize_for_ai_prompt(str(past_cause), max_length=150)
                        context += f"   Identified Cause: {safe_cause}\n"
            
            if past_actions:
                context += "\nEQUIPMENT HISTORY - MAINTENANCE ACTIONS:\n"
                for i, action in enumerate(past_actions[:8], 1):
                    action_title = action.get('title', 'Unknown')[:60]
                    action_type = action.get('action_type', 'N/A')
                    action_status = action.get('status', 'Unknown')
                    action_priority = action.get('priority', 'N/A')
                    action_date = action.get('created_at', 'Unknown')[:10] if action.get('created_at') else 'N/A'
                    context += f"{i}. [{action_date}] {action_title} - Type: {action_type}, Status: {action_status}, Priority: {action_priority}\n"
                    
                    # Include action description if available
                    action_desc = action.get('description')
                    if action_desc:
                        safe_desc = sanitize_for_ai_prompt(str(action_desc), max_length=200)
                        context += f"   Details: {safe_desc}\n"
            
            if past_tasks:
                context += "\nEQUIPMENT HISTORY - COMPLETED MAINTENANCE TASKS:\n"
                for i, task in enumerate(past_tasks[:8], 1):
                    task_name = task.get('name', 'Unknown')[:60]
                    task_type = task.get('task_type', 'N/A')
                    completed_at = task.get('completed_at', 'Unknown')[:10] if task.get('completed_at') else 'N/A'
                    context += f"{i}. [{completed_at}] {task_name} - Type: {task_type}\n"
                    
                    # Include task notes if available
                    task_notes = task.get('notes') or task.get('completion_notes')
                    if task_notes:
                        safe_notes = sanitize_for_ai_prompt(str(task_notes), max_length=200)
                        context += f"   Completion Notes: {safe_notes}\n"
            
            if not past_obs and not past_actions and not past_tasks:
                context += "\nEQUIPMENT HISTORY: No previous observations, actions, or completed tasks recorded for this equipment. This is either new equipment or first recorded issue.\n"
        
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
            context = self._build_threat_context(threat, equipment_data, historical_threats, equipment_history)
            
            response = self._call_openai(RISK_ANALYSIS_PROMPT, f"Analyze this threat:\n{context}", 'risk_analysis')
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
            context = self._build_threat_context(threat, equipment_data, None, equipment_history)
            
            response = self._call_openai(CAUSE_ANALYSIS_PROMPT, f"Analyze causes for this threat (max {max_causes} causes):\n{context}", 'cause_analysis')
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
            context = self._build_threat_context(threat)
            
            response = self._call_openai(FAULT_TREE_PROMPT, f"Generate a fault tree (max depth {max_depth}):\n{context}", 'fault_tree')
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
            context = self._build_threat_context(threat)
            
            response = self._call_openai(BOW_TIE_PROMPT, f"Generate a bow-tie model:\n{context}", 'bow_tie')
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
            context = self._build_threat_context(threat)
            
            if causes:
                context += "\nIDENTIFIED CAUSES:\n"
                for cause in causes:
                    context += f"- {cause.description} ({cause.probability}% probability)\n"
            
            if budget_limit:
                context += f"\nBUDGET CONSTRAINT: Maximum {budget_limit} EUR\n"
            
            context += f"\nPRIORITIZE BY: {prioritize_by}\n"
            
            response = self._call_openai(ACTION_OPTIMIZATION_PROMPT, f"Recommend optimized actions:\n{context}", 'action_optimization')
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
