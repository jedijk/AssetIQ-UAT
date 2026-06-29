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
import json
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from models.ril import CopilotQueryRequest

logger = logging.getLogger(__name__)

# Formal copilot tool registry — extend by adding entries and handler methods.
COPILOT_TOOL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "get_reliability_chain": {
        "description": "Graph-backed reliability chain for one equipment asset",
        "handler": "_tool_get_reliability_chain",
    },
    "get_open_signals": {
        "description": "Open observations, PM overdue, and graph fingerprint for equipment",
        "handler": "_tool_get_open_signals",
    },
}


class ReliabilityCopilotService:
    """
    AI-powered natural language interface for reliability intelligence.
    Uses ai_gateway for query understanding (fallback) and response generation.
    """
    
    def __init__(self, db, ril_service):
        self.db = db
        self.ril_service = ril_service
    
    async def process_query(
        self,
        owner_id: str,
        request: CopilotQueryRequest,
        current_user: Optional[dict] = None,
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
        data = await self._gather_data(
            owner_id, intent, query, equipment_id, current_user=current_user
        )
        resolved_equipment_id = (
            equipment_id
            or data.get("resolved_equipment_id")
            or (data.get("equipment") or {}).get("id")
        )

        # Copilot tools for equipment-scoped queries
        eq_id = resolved_equipment_id
        if eq_id:
            if intent in ("risk_analysis", "equipment_details", "changes_summary", "general_summary"):
                chain = await self._invoke_copilot_tool(
                    "get_reliability_chain", eq_id, current_user=current_user
                )
                if chain:
                    data["reliability_chain"] = chain
            if intent in ("risk_analysis", "attention_required", "equipment_details"):
                signals = await self._invoke_copilot_tool(
                    "get_open_signals", eq_id, current_user=current_user
                )
                if signals:
                    data["open_signals"] = signals

        # Phase 4 — shared evidence pack for grounded AI context
        evidence_pack = None
        risk_paths: List[Dict[str, Any]] = []
        eq_id = resolved_equipment_id
        try:
            from services.ai_evidence_pack import build_evidence_pack

            evidence_pack = await build_evidence_pack(
                user=current_user,
                equipment_id=eq_id,
                intent=intent,
                include_fleet=intent in ("general_summary", "attention_required", "cases_summary"),
                database=self.db,
            )
            data["evidence_pack"] = evidence_pack
            data["reliability_context_summary"] = evidence_pack.get("prompt_summary")
            risk_paths = evidence_pack.get("graph_edges") or []
            data["risk_path_entries"] = [
                {
                    "edge_id": e.get("edge_id"),
                    "relation": e.get("relation"),
                    "source": e.get("source"),
                    "target": e.get("target"),
                }
                for e in risk_paths
            ]
            if evidence_pack.get("open_signals"):
                data["open_signals"] = evidence_pack["open_signals"]
        except Exception as exc:
            logger.warning("Evidence pack assembly failed: %s", exc)
        
        # Generate AI response
        response = await self._generate_response(
            owner_id, query, intent, data, context, current_user=current_user,
            risk_path_entries=risk_paths,
            evidence_pack=evidence_pack,
        )
        
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

        # Equipment health / condition queries
        if any(word in query_lower for word in ["health", "condition", "how is", "status of"]):
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
        
        # Unmatched queries: optional ai_gateway intent classification
        try:
            from services.ai_platform import execute_prompt

            result = await execute_prompt(
                "ril.copilot_intent_classifier",
                user={"id": "ril-copilot", "company_id": "default"},
                user_message=query,
                endpoint="ril.copilot.classify_intent",
                model="gpt-4o-mini",
                temperature=0,
                max_tokens=32,
            )
            slug = (result["content"] or "").strip().lower().replace(" ", "_")
            allowed = {
                "risk_analysis", "changes_summary", "equipment_details",
                "attention_required", "predictions", "cases_summary",
                "alerts_summary", "general_summary",
            }
            if slug in allowed:
                return slug
        except Exception as exc:
            logger.debug("ai_gateway intent fallback skipped: %s", exc)

        return "general_summary"
    
    async def _gather_data(
        self,
        owner_id: str,
        intent: str,
        query: str,
        equipment_id: Optional[str],
        *,
        current_user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Gather relevant data based on intent"""
        data: Dict[str, Any] = {}
        
        # Try to extract equipment tag from query if not provided
        if not equipment_id:
            equipment_id = await self._extract_equipment_from_query(
                owner_id, query, current_user=current_user
            )

        if equipment_id:
            from services.tenant_schema import merge_tenant_filter

            equipment = await self.db.equipment_nodes.find_one(
                merge_tenant_filter({"id": equipment_id}, current_user),
                {"_id": 0},
            )
            if equipment:
                data["equipment"] = equipment
                data["resolved_equipment_id"] = equipment_id
            else:
                equipment_id = None
        
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
        query: str,
        *,
        current_user: Optional[dict] = None,
    ) -> Optional[str]:
        """Try to extract equipment reference from query text."""
        from services.equipment_search_service import resolve_equipment_id_from_query

        resolved = await resolve_equipment_id_from_query(
            self.db, query, user=current_user
        )
        if resolved:
            return resolved

        # Legacy owner_id exact tag match (single-segment tags)
        import re
        from utils.mongo_regex import case_insensitive_contains

        tag_patterns = [
            r'\b([A-Z]{1,3}-\d{2,4}[A-Z]?)\b',
            r'\b(\d{1,2}[A-Z]-\d{4})\b',
        ]
        for pattern in tag_patterns:
            matches = re.findall(pattern, query.upper())
            if not matches:
                continue
            tag = matches[0]
            tag_match = case_insensitive_contains(tag)
            tag_clauses = [{"tag": tag}]
            if tag_match:
                tag_clauses.append({"name": tag_match})
            equipment = await self.db.equipment_nodes.find_one({
                "owner_id": owner_id,
                "$or": tag_clauses,
            })
            if equipment:
                return equipment.get("id")

        return None
    
    async def _invoke_copilot_tool(
        self,
        tool_name: str,
        equipment_id: str,
        *,
        current_user: Optional[dict] = None,
        **kwargs: Any,
    ) -> Optional[Any]:
        """Dispatch a registered copilot tool by name."""
        entry = COPILOT_TOOL_REGISTRY.get(tool_name)
        if not entry:
            logger.warning("Unknown copilot tool: %s", tool_name)
            return None
        handler = getattr(self, entry["handler"], None)
        if not handler:
            return None
        return await handler(equipment_id, current_user=current_user, **kwargs)

    async def _tool_get_reliability_chain(
        self,
        equipment_id: str,
        *,
        current_user: Optional[dict] = None,
        depth: int = 5,
        limit: int = 120,
    ) -> Optional[Dict[str, Any]]:
        """Copilot tool — fetch graph-backed reliability chain for one asset."""
        try:
            from services.reliability_graph_query import GraphTraversalService

            svc = GraphTraversalService(self.db)
            chain = await svc.get_chain(
                equipment_id,
                depth=depth,
                user=current_user,
                edge_limit=limit,
            )
            return chain
        except Exception as exc:
            logger.warning("get_reliability_chain tool failed: %s", exc)
            return None

    async def _tool_get_open_signals(
        self,
        equipment_id: str,
        *,
        current_user: Optional[dict] = None,
    ) -> Optional[Dict[str, Any]]:
        """Copilot tool — open work signals and compact reliability state."""
        try:
            from services.equipment_reliability_state_service import build_equipment_reliability_state
            from services.ril_service_factory import ril_owner_id
            from services.tenant_schema import merge_tenant_filter
            from services.work_signal_projection import project_list_item

            owner_id = ril_owner_id(current_user) if current_user else equipment_id
            state = await build_equipment_reliability_state(
                equipment_id, owner_id, user=current_user
            )
            open_query = merge_tenant_filter(
                {
                    "status": {"$nin": ["Closed", "closed", "Mitigated", "mitigated"]},
                    "$or": [
                        {"linked_equipment_id": equipment_id},
                        {"equipment_id": equipment_id},
                    ],
                },
                current_user,
            )
            threat_docs = await self.db.threats.find(
                open_query,
                {
                    "_id": 0,
                    "id": 1,
                    "title": 1,
                    "status": 1,
                    "risk_score": 1,
                    "risk_level": 1,
                    "linked_equipment_id": 1,
                    "asset": 1,
                    "created_at": 1,
                },
            ).sort("risk_score", -1).limit(10).to_list(10)

            return {
                "state": state,
                "open_observation_count": state.get("open_observation_count"),
                "exposure_score": (state.get("exposure") or {}).get("score"),
                "open_work_signals": [project_list_item(doc) for doc in threat_docs],
            }
        except Exception as exc:
            logger.warning("get_open_signals tool failed: %s", exc)
            return None
    
    async def _generate_response(
        self,
        owner_id: str,
        query: str,
        intent: str,
        data: Dict[str, Any],
        context: Dict[str, Any],
        current_user: Optional[dict] = None,
        risk_path_entries: Optional[List[Dict[str, Any]]] = None,
        evidence_pack: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate AI response based on gathered data"""
        from services.ai_citation import format_citations_for_prompt
        from services.ai_gateway import user_context

        uid, cid = user_context(current_user)
        if uid == "anonymous":
            uid = str(owner_id)

        citations = (evidence_pack or {}).get("citations") or []
        citation_block = format_citations_for_prompt(citations)

        # Build user prompt with data context
        data_summary = self._summarize_data_for_prompt(data, intent)
        evidence_summary = (evidence_pack or {}).get("prompt_summary") or ""
        path_lines = ""
        entries = risk_path_entries or data.get("risk_path_entries") or []
        if entries and not evidence_summary:
            path_lines = "\nGraph path edge IDs (cite as [cite:<id>]):\n"
            for entry in entries[:12]:
                path_lines += (
                    f"- {entry.get('edge_id')}: {entry.get('source')} "
                    f"-[{entry.get('relation')}]-> {entry.get('target')}\n"
                )
        
        user_prompt = f"""Query: {query}

Intent Classification: {intent}

Available Data:
{data_summary}
"""
        if evidence_summary:
            user_prompt += f"\nEvidence Pack:\n{evidence_summary}\n"
        if citation_block:
            user_prompt += f"\n{citation_block}\n"
        user_prompt += f"{path_lines}\nPlease provide a helpful response to the query based on the available data."

        try:
            from services.ai_platform import execute_prompt

            actor = current_user or {"id": uid, "company_id": cid}
            result = await execute_prompt(
                "ril.copilot_assistant",
                user=actor,
                user_message=user_prompt,
                endpoint="ril.copilot.query",
                model="gpt-4o",
                temperature=0.3,
                max_tokens=1000,
            )
            answer = result["content"]
        except Exception as e:
            logger.error(f"Error generating copilot response: {e}")
            answer = self._generate_fallback_response(intent, data)
        
        # Determine suggested actions
        actions = self._get_suggested_actions(intent, data)
        
        # Determine visualization type
        viz_type = self._get_visualization_type(intent)
        
        response = {
            "summary": answer,
            "answer": answer,
            "data": data,
            "intent": intent,
            "recommendations": actions,
            "actions": actions,
            "visualization_type": viz_type,
            "cited_paths": [
                {
                    "edge_id": e.get("edge_id"),
                    "relation": e.get("relation"),
                    "source": e.get("source"),
                    "target": e.get("target"),
                }
                for e in (entries or [])
                if e.get("edge_id")
            ],
            "processed_at": datetime.utcnow().isoformat()
        }
        from services.ai_platform import finalize_recommendation_response

        return finalize_recommendation_response(
            response,
            citations=citations,
            evidence=evidence_pack,
        )
    
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

        if data.get("reliability_context_summary"):
            lines.append("\nReliability graph context:")
            lines.append(data["reliability_context_summary"])

        twin = data.get("twin_snapshot") or {}
        if twin.get("delta"):
            d = twin["delta"]
            lines.append(
                f"\nTwin week-over-week: health {d.get('health_score'):+.1f}, "
                f"threats {d.get('open_threat_count'):+d}, overdue_pm {d.get('overdue_pm_count'):+d}"
            )
        elif twin.get("latest"):
            snap = twin["latest"]
            lines.append(
                f"\nTwin snapshot: health={snap.get('health_score')}, "
                f"threats={snap.get('open_threat_count')}, overdue_pm={snap.get('overdue_pm_count')}"
            )
        
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
