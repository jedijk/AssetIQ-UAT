"""
Reliability Copilot Service
Natural language interface for the Reliability Intelligence Layer.

Supports queries like:
- "Why is P-104 high risk?"
- "What changed this week?"
- "Show all evidence for HX-201"
- "Which assets need attention today?"
- "What failures are predicted this month?"
"""

import logging
import os
import json
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from models.ril import CopilotQueryRequest

logger = logging.getLogger(__name__)


class ReliabilityCopilotService:
    """
    AI-powered natural language interface for reliability intelligence.
    Uses OpenAI GPT-4o for understanding queries and generating responses.
    """
    
    def __init__(self, db, ril_service):
        self.db = db
        self.ril_service = ril_service
        self._openai_client = None
    
    def _get_openai_client(self):
        """Get or create OpenAI client"""
        if self._openai_client is None:
            try:
                from emergentintegrations.llm.openai import get_openai_client
                api_key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("OPENAI_API_KEY")
                if api_key:
                    self._openai_client = get_openai_client(api_key)
                else:
                    logger.warning("No OpenAI API key found for Reliability Copilot")
            except ImportError:
                logger.warning("emergentintegrations not available, trying direct OpenAI")
                try:
                    from openai import OpenAI
                    api_key = os.environ.get("OPENAI_API_KEY")
                    if api_key:
                        self._openai_client = OpenAI(api_key=api_key)
                except ImportError:
                    logger.error("OpenAI library not available")
        return self._openai_client
    
    async def process_query(
        self,
        owner_id: str,
        request: CopilotQueryRequest
    ) -> Dict[str, Any]:
        """
        Process a natural language query about reliability.
        
        Returns structured response with:
        - answer: Natural language answer
        - data: Supporting data (cases, observations, predictions, etc.)
        - actions: Suggested follow-up actions
        - visualization_type: Suggested visualization (if any)
        """
        query = request.query.lower().strip()
        equipment_id = request.equipment_id
        context = request.context or {}
        
        # Classify the query intent
        intent = await self._classify_intent(query)
        
        # Gather relevant data based on intent
        data = await self._gather_data(owner_id, intent, query, equipment_id)
        
        # Generate AI response
        response = await self._generate_response(owner_id, query, intent, data, context)
        
        return response
    
    async def _classify_intent(self, query: str) -> str:
        """Classify the intent of the query"""
        query_lower = query.lower()
        
        # Risk-related queries
        if any(word in query_lower for word in ["risk", "high risk", "critical", "danger"]):
            return "risk_analysis"
        
        # Change/trend queries
        if any(word in query_lower for word in ["changed", "change", "trend", "week", "today", "recent"]):
            return "changes_summary"
        
        # Evidence/detail queries
        if any(word in query_lower for word in ["evidence", "show", "details", "all about"]):
            return "equipment_details"
        
        # Attention/priority queries
        if any(word in query_lower for word in ["attention", "need", "urgent", "priority", "focus"]):
            return "attention_required"
        
        # Prediction queries
        if any(word in query_lower for word in ["predict", "failure", "forecast", "expect", "month"]):
            return "predictions"
        
        # Case queries
        if any(word in query_lower for word in ["case", "cases", "open", "status"]):
            return "cases_summary"
        
        # Alert queries
        if any(word in query_lower for word in ["alert", "alarm", "warning"]):
            return "alerts_summary"
        
        # Default to general summary
        return "general_summary"
    
    async def _gather_data(
        self,
        owner_id: str,
        intent: str,
        query: str,
        equipment_id: Optional[str]
    ) -> Dict[str, Any]:
        """Gather relevant data based on intent"""
        data = {}
        
        # Try to extract equipment tag from query if not provided
        if not equipment_id:
            equipment_id = await self._extract_equipment_from_query(owner_id, query)
        
        if intent == "risk_analysis":
            if equipment_id:
                # Get specific equipment risk info
                equipment = await self.db.equipment_nodes.find_one({"id": equipment_id})
                data["equipment"] = equipment
                
                # Get observations
                observations, _ = await self.ril_service.get_observations(
                    owner_id, equipment_id=equipment_id, limit=10
                )
                data["observations"] = [o.dict() for o in observations]
                
                # Get cases
                cases, _ = await self.ril_service.get_reliability_cases(
                    owner_id, equipment_id=equipment_id, limit=5
                )
                data["cases"] = [c.dict() for c in cases]
                
                # Get predictions
                predictions, _ = await self.ril_service.get_predictions(
                    owner_id, equipment_id=equipment_id, limit=5
                )
                data["predictions"] = [p.dict() for p in predictions]
            else:
                # Get high-risk cases across all equipment
                cases, _ = await self.ril_service.get_reliability_cases(
                    owner_id, limit=10
                )
                data["cases"] = [c.dict() for c in cases]
        
        elif intent == "changes_summary":
            seven_days_ago = datetime.utcnow() - timedelta(days=7)
            
            # Recent observations
            observations, _ = await self.ril_service.get_observations(
                owner_id, from_date=seven_days_ago, limit=20
            )
            data["recent_observations"] = [o.dict() for o in observations]
            
            # Recent alerts
            alerts, _ = await self.ril_service.get_alerts(
                owner_id, from_date=seven_days_ago, limit=20
            )
            data["recent_alerts"] = [a.dict() for a in alerts]
            
            # Dashboard stats
            stats = await self.ril_service.get_dashboard_stats(owner_id)
            data["stats"] = stats
        
        elif intent == "equipment_details":
            if equipment_id:
                equipment = await self.db.equipment_nodes.find_one({"id": equipment_id})
                data["equipment"] = equipment
                
                # All related data
                observations, _ = await self.ril_service.get_observations(
                    owner_id, equipment_id=equipment_id, limit=50
                )
                data["observations"] = [o.dict() for o in observations]
                
                alerts, _ = await self.ril_service.get_alerts(
                    owner_id, equipment_id=equipment_id, limit=50
                )
                data["alerts"] = [a.dict() for a in alerts]
                
                cases, _ = await self.ril_service.get_reliability_cases(
                    owner_id, equipment_id=equipment_id, limit=20
                )
                data["cases"] = [c.dict() for c in cases]
                
                predictions, _ = await self.ril_service.get_predictions(
                    owner_id, equipment_id=equipment_id, limit=10
                )
                data["predictions"] = [p.dict() for p in predictions]
        
        elif intent == "attention_required":
            # High priority cases
            from models.ril import AlertPriority, CaseStatus
            
            cases, _ = await self.ril_service.get_reliability_cases(
                owner_id, status=CaseStatus.OPEN, limit=20
            )
            # Sort by priority (P1 first)
            priority_order = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}
            sorted_cases = sorted(cases, key=lambda c: priority_order.get(c.priority.value, 4))
            data["priority_cases"] = [c.dict() for c in sorted_cases[:10]]
            
            # Recent critical alerts
            alerts, _ = await self.ril_service.get_alerts(
                owner_id, priority=AlertPriority.P1_CRITICAL, limit=10
            )
            data["critical_alerts"] = [a.dict() for a in alerts]
        
        elif intent == "predictions":
            predictions, _ = await self.ril_service.get_predictions(
                owner_id, equipment_id=equipment_id, limit=20
            )
            data["predictions"] = [p.dict() for p in predictions]
            
            # Get equipment at risk
            at_risk = [p for p in predictions if p.overall_health_score < 70]
            data["equipment_at_risk"] = len(at_risk)
        
        elif intent == "cases_summary":
            cases, total = await self.ril_service.get_reliability_cases(
                owner_id, limit=20
            )
            data["cases"] = [c.dict() for c in cases]
            data["total_cases"] = total
            
            # Stats by status
            stats = await self.ril_service.get_dashboard_stats(owner_id)
            data["stats"] = stats
        
        elif intent == "alerts_summary":
            alerts, total = await self.ril_service.get_alerts(owner_id, limit=30)
            data["alerts"] = [a.dict() for a in alerts]
            data["total_alerts"] = total
        
        else:  # general_summary
            stats = await self.ril_service.get_dashboard_stats(owner_id)
            data["stats"] = stats
            
            # Top observations
            observations, _ = await self.ril_service.get_observations(
                owner_id, limit=5
            )
            data["recent_observations"] = [o.dict() for o in observations]
            
            # Open cases
            cases, _ = await self.ril_service.get_reliability_cases(
                owner_id, limit=5
            )
            data["open_cases"] = [c.dict() for c in cases]
        
        return data
    
    async def _extract_equipment_from_query(
        self,
        owner_id: str,
        query: str
    ) -> Optional[str]:
        """Try to extract equipment reference from query"""
        # Common patterns: P-104, HX-201, etc.
        import re
        
        # Look for tag patterns
        tag_patterns = [
            r'\b([A-Z]{1,3}-\d{2,4}[A-Z]?)\b',  # P-104, HX-201
            r'\b(\d{1,2}[A-Z]-\d{4})\b',  # 1T-2001
        ]
        
        for pattern in tag_patterns:
            matches = re.findall(pattern, query.upper())
            if matches:
                tag = matches[0]
                # Search for equipment with this tag
                equipment = await self.db.equipment_nodes.find_one({
                    "owner_id": owner_id,
                    "$or": [
                        {"tag": tag},
                        {"name": {"$regex": tag, "$options": "i"}}
                    ]
                })
                if equipment:
                    return equipment.get("id")
        
        return None
    
    async def _generate_response(
        self,
        owner_id: str,
        query: str,
        intent: str,
        data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate AI response based on gathered data"""
        client = self._get_openai_client()
        
        # Build system prompt
        system_prompt = """You are the Reliability Copilot, an AI assistant for industrial reliability engineers.
You help analyze equipment health, identify risks, explain failure patterns, and provide actionable recommendations.

Your responses should be:
- Concise and actionable
- Focused on reliability and maintenance
- Based on the provided data
- Include specific numbers and equipment references when available

Format your response with:
1. A direct answer to the question
2. Key supporting data points
3. Recommended actions (if applicable)

Use markdown formatting for clarity."""

        # Build user prompt with data context
        data_summary = self._summarize_data_for_prompt(data, intent)
        
        user_prompt = f"""Query: {query}

Intent Classification: {intent}

Available Data:
{data_summary}

Please provide a helpful response to the query based on the available data."""

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=1000
            )
            
            answer = response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Error generating copilot response: {e}")
            answer = self._generate_fallback_response(intent, data)
        
        # Determine suggested actions
        actions = self._get_suggested_actions(intent, data)
        
        # Determine visualization type
        viz_type = self._get_visualization_type(intent)
        
        return {
            "answer": answer,
            "data": data,
            "intent": intent,
            "actions": actions,
            "visualization_type": viz_type,
            "processed_at": datetime.utcnow().isoformat()
        }
    
    def _summarize_data_for_prompt(self, data: Dict[str, Any], intent: str) -> str:
        """Create a concise summary of data for the AI prompt"""
        lines = []
        
        if "stats" in data:
            stats = data["stats"]
            lines.append("Dashboard Stats:")
            lines.append(f"  - Open cases: {stats.get('open_cases', 0)}")
            lines.append(f"  - P1 Critical: {stats.get('p1_cases', 0)}")
            lines.append(f"  - P2 High: {stats.get('p2_cases', 0)}")
            lines.append(f"  - Observations (7d): {stats.get('observations_7d', 0)}")
            lines.append(f"  - Alerts (7d): {stats.get('alerts_7d', 0)}")
        
        if "equipment" in data and data["equipment"]:
            eq = data["equipment"]
            lines.append(f"\nEquipment: {eq.get('name')} (Tag: {eq.get('tag', 'N/A')})")
            if eq.get("criticality"):
                crit = eq["criticality"]
                lines.append(f"  Criticality: Safety={crit.get('safety_impact')}, Production={crit.get('production_impact')}")
        
        if "cases" in data:
            cases = data["cases"][:5]  # Top 5
            if cases:
                lines.append(f"\nReliability Cases ({len(data['cases'])} total):")
                for c in cases:
                    lines.append(f"  - {c.get('case_number')}: {c.get('title')} ({c.get('status')}, {c.get('priority')})")
        
        if "observations" in data:
            obs = data["observations"][:5]
            if obs:
                lines.append(f"\nRecent Observations ({len(data['observations'])} total):")
                for o in obs:
                    lines.append(f"  - {o.get('title')} ({o.get('severity')}, {o.get('source')})")
        
        if "alerts" in data:
            alerts = data["alerts"][:5]
            if alerts:
                lines.append(f"\nAlerts ({len(data['alerts'])} total):")
                for a in alerts:
                    lines.append(f"  - {a.get('title')} ({a.get('alert_type')})")
        
        if "predictions" in data:
            preds = data["predictions"][:3]
            if preds:
                lines.append("\nPredictions:")
                for p in preds:
                    lines.append(f"  - Equipment: {p.get('equipment_name')}, Health Score: {p.get('overall_health_score', 'N/A')}")
                    if p.get("predictions"):
                        for fp in p["predictions"][:2]:
                            lines.append(f"    • {fp.get('failure_mode')}: {fp.get('probability', 0)*100:.0f}% probability")
        
        return "\n".join(lines) if lines else "No relevant data available."
    
    def _generate_fallback_response(self, intent: str, data: Dict[str, Any]) -> str:
        """Generate a fallback response when AI is unavailable"""
        if intent == "general_summary":
            stats = data.get("stats", {})
            return f"""Here's your reliability summary:
            
- **Open Cases:** {stats.get('open_cases', 0)} (P1: {stats.get('p1_cases', 0)}, P2: {stats.get('p2_cases', 0)})
- **This Week:** {stats.get('observations_7d', 0)} observations, {stats.get('alerts_7d', 0)} alerts
- **Active Correlations:** {stats.get('active_correlations', 0)}
- **Pending Recommendations:** {stats.get('pending_recommendations', 0)}

Review the open cases to prioritize your reliability activities."""
        
        elif intent == "attention_required":
            cases = data.get("priority_cases", [])
            if cases:
                return f"""**{len(cases)} cases require attention:**

Top priorities:
""" + "\n".join([f"- {c.get('case_number')}: {c.get('title')} ({c.get('priority')})" for c in cases[:5]])
            return "No urgent cases currently require immediate attention."
        
        return "I found the relevant data. Please review the details below."
    
    def _get_suggested_actions(self, intent: str, data: Dict[str, Any]) -> List[str]:
        """Get suggested follow-up actions based on intent and data"""
        actions = []
        
        if intent == "risk_analysis":
            actions.append("Review equipment criticality settings")
            actions.append("Check recent maintenance history")
            if data.get("cases"):
                actions.append("Investigate open reliability cases")
        
        elif intent == "attention_required":
            if data.get("priority_cases"):
                actions.append("Assign resources to P1/P2 cases")
            if data.get("critical_alerts"):
                actions.append("Acknowledge and investigate critical alerts")
        
        elif intent == "predictions":
            actions.append("Schedule predictive maintenance for at-risk equipment")
            actions.append("Review and update maintenance strategies")
        
        elif intent == "changes_summary":
            actions.append("Review new observations for potential issues")
            actions.append("Check alert patterns for emerging problems")
        
        # Default actions
        if not actions:
            actions = [
                "Review dashboard for updates",
                "Check open reliability cases"
            ]
        
        return actions
    
    def _get_visualization_type(self, intent: str) -> Optional[str]:
        """Determine appropriate visualization for the response"""
        viz_map = {
            "risk_analysis": "risk_matrix",
            "changes_summary": "timeline",
            "predictions": "health_chart",
            "cases_summary": "case_board",
            "alerts_summary": "alert_list",
            "attention_required": "priority_matrix"
        }
        return viz_map.get(intent)
