"""RIL correlations operations — extracted from ril_service."""
from __future__ import annotations

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta

from models.ril import Correlation, CorrelationResult, CorrelationType

logger = logging.getLogger(__name__)


class RILCorrelationsMixin:
    """Mixin — use only via RILService."""

    
    async def find_correlations(
        self,
        owner_id: str,
        equipment_id: Optional[str] = None,
        time_window_hours: int = 24
    ) -> List[Correlation]:
        """
        Find correlations between observations, alerts, and readings
        within a time window.
        """
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=time_window_hours)
        
        base_query = {
            "owner_id": owner_id,
            "$or": [
                {"observed_at": {"$gte": start_time, "$lte": end_time}},
                {"alert_time": {"$gte": start_time, "$lte": end_time}},
                {"timestamp": {"$gte": start_time, "$lte": end_time}}
            ]
        }
        
        if equipment_id:
            base_query["equipment_id"] = equipment_id
        
        # Gather observations
        observations = []
        async for doc in self.db[self._collections['observations']].find({
            "owner_id": owner_id,
            "observed_at": {"$gte": start_time, "$lte": end_time},
            **({"equipment_id": equipment_id} if equipment_id else {})
        }):
            observations.append(doc)
        
        # Gather alerts
        alerts = []
        async for doc in self.db[self._collections['alerts']].find({
            "owner_id": owner_id,
            "alert_time": {"$gte": start_time, "$lte": end_time},
            **({"equipment_id": equipment_id} if equipment_id else {})
        }):
            alerts.append(doc)
        
        # Group by equipment
        equipment_events = {}
        
        for obs in observations:
            eq_id = obs.get("equipment_id") or "unknown"
            equipment_events.setdefault(eq_id, {"observations": [], "alerts": []})
            equipment_events[eq_id]["observations"].append(obs)
        
        for alert in alerts:
            eq_id = alert.get("equipment_id") or "unknown"
            equipment_events.setdefault(eq_id, {"observations": [], "alerts": []})
            equipment_events[eq_id]["alerts"].append(alert)
        
        # Create correlations for equipment with multiple events
        correlations = []
        for eq_id, events in equipment_events.items():
            if len(events["observations"]) + len(events["alerts"]) >= 2:
                # Calculate correlation score based on event density and types
                obs_count = len(events["observations"])
                alert_count = len(events["alerts"])
                
                # Higher score for mixed event types
                type_diversity_bonus = 0.2 if obs_count > 0 and alert_count > 0 else 0
                
                # Base correlation score
                event_count = obs_count + alert_count
                correlation_score = min(0.5 + (event_count * 0.1) + type_diversity_bonus, 1.0)
                
                correlation = Correlation(
                    owner_id=owner_id,
                    observation_ids=[o["id"] for o in events["observations"]],
                    alert_ids=[a["id"] for a in events["alerts"]],
                    equipment_ids=[eq_id] if eq_id != "unknown" else [],
                    correlation_result=CorrelationResult(
                        correlation_score=correlation_score,
                        confidence_score=0.7,
                        correlation_type=CorrelationType.TEMPORAL,
                        corroborating_evidence=[],
                        suggested_root_causes=[],
                        reasoning=f"Found {obs_count} observations and {alert_count} alerts within {time_window_hours}h window"
                    ),
                    start_time=start_time,
                    end_time=end_time
                )
                
                # Save correlation
                await self.db[self._collections['correlations']].insert_one(correlation.dict())
                correlations.append(correlation)
        
        return correlations
    
    async def get_correlations(
        self,
        owner_id: str,
        equipment_id: Optional[str] = None,
        limit: int = 50,
        skip: int = 0
    ) -> Tuple[List[Correlation], int]:
        """Get stored correlations"""
        query = {"owner_id": owner_id, "is_active": True}
        if equipment_id:
            query["equipment_ids"] = equipment_id
        
        total = await self.db[self._collections['correlations']].count_documents(query)
        cursor = self.db[self._collections['correlations']].find(query).sort(
            "created_at", -1
        ).skip(skip).limit(limit)
        
        correlations = []
        async for doc in cursor:
            correlations.append(Correlation(**doc))
        
        return correlations, total
    

    async def get_correlation_detail(self, owner_id: str, correlation_id: str):
        doc = await self.db[self._collections["correlations"]].find_one({
            "owner_id": owner_id,
            "id": correlation_id,
        })
        if not doc:
            return None
        doc.pop("_id", None)

        observations = []
        if doc.get("observation_ids"):
            async for obs in self.db[self._collections["observations"]].find(
                {"id": {"$in": doc["observation_ids"]}},
            ):
                obs.pop("_id", None)
                observations.append(obs)

        alerts = []
        if doc.get("alert_ids"):
            async for alert in self.db[self._collections["alerts"]].find(
                {"id": {"$in": doc["alert_ids"]}},
            ):
                alert.pop("_id", None)
                alerts.append(alert)

        return {"correlation": doc, "observations": observations, "alerts": alerts}
