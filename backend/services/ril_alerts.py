"""RIL alerts operations — extracted from ril_service."""
from __future__ import annotations

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta

from models.ril import Alert, TriageResult, AlertPriority, CreateAlertRequest

logger = logging.getLogger(__name__)


class RILAlertsMixin:
    """Mixin — use only via RILService."""

    
    async def create_alert(
        self,
        owner_id: str,
        request: CreateAlertRequest
    ) -> Alert:
        """Create and triage an alert"""
        # Resolve equipment details
        equipment_name = None
        if request.equipment_id:
            equipment = await self._find_equipment_node(request.equipment_id)
            if equipment:
                equipment_name = equipment.get("name")
        
        alert = Alert(
            owner_id=owner_id,
            source=request.source,
            source_system=request.source_system,
            source_alert_id=request.source_alert_id,
            equipment_id=request.equipment_id,
            equipment_tag=request.equipment_tag,
            equipment_name=equipment_name,
            title=request.title,
            description=request.description,
            alert_type=request.alert_type,
            alert_time=request.alert_time,
            reading_value=request.reading_value,
            reading_unit=request.reading_unit,
            threshold_value=request.threshold_value,
            metadata=request.metadata
        )
        
        # Auto-triage
        triage = await self.triage_alert(owner_id, alert)
        alert.triage_result = triage
        alert.is_triaged = True
        
        await self.db[self._collections['alerts']].insert_one(alert.dict())
        
        return alert
    
    async def triage_alert(self, owner_id: str, alert: Alert) -> TriageResult:
        """
        Intelligent Alert Triage
        Automatically classify and prioritize incoming alerts.
        """
        evaluation_factors = {}
        
        # 1. Check asset criticality
        criticality_score = 2  # Default medium
        if alert.equipment_id:
            equipment = await self._find_equipment_node(alert.equipment_id)
            if equipment and equipment.get("criticality"):
                crit = equipment["criticality"]
                safety = crit.get("safety_impact", 1)
                production = crit.get("production_impact", 1)
                environmental = crit.get("environmental_impact", 1)
                criticality_score = max(safety, production, environmental)
                evaluation_factors["asset_criticality"] = {
                    "safety": safety,
                    "production": production,
                    "environmental": environmental,
                    "max_score": criticality_score
                }
        
        # 2. Check alert type severity
        alert_type_scores = {
            "highhigh_alarm": 5,
            "lowlow_alarm": 5,
            "high_alarm": 3,
            "low_alarm": 3,
            "vibration_high": 4,
            "temperature_high": 4,
            "condition_alert": 3,
        }
        alert_severity = alert_type_scores.get(alert.alert_type.lower(), 2)
        evaluation_factors["alert_type_severity"] = alert_severity
        
        # 3. Check historical behavior (recent similar alerts)
        recent_similar = await self.db[self._collections['alerts']].count_documents({
            "owner_id": owner_id,
            "equipment_id": alert.equipment_id,
            "alert_type": alert.alert_type,
            "alert_time": {"$gte": datetime.utcnow() - timedelta(days=7)}
        })
        evaluation_factors["recent_similar_alerts"] = recent_similar
        frequency_factor = min(recent_similar / 5, 1.0)  # Normalize
        
        # 4. Calculate priority
        total_score = (criticality_score * 2 + alert_severity + frequency_factor * 2) / 3
        
        if total_score >= 4:
            priority = AlertPriority.P1_CRITICAL
            response_hours = 4
        elif total_score >= 3:
            priority = AlertPriority.P2_HIGH
            response_hours = 24
        elif total_score >= 2:
            priority = AlertPriority.P3_MEDIUM
            response_hours = 72
        else:
            priority = AlertPriority.P4_LOW
            response_hours = 168  # 1 week
        
        # 5. Determine recommended owner
        owner_role = "technician"
        if priority in [AlertPriority.P1_CRITICAL, AlertPriority.P2_HIGH]:
            owner_role = "reliability_engineer"
        
        # 6. Generate suggested actions
        suggested_actions = []
        if alert.alert_type in ["highhigh_alarm", "lowlow_alarm"]:
            suggested_actions.append("Immediately verify equipment status")
            suggested_actions.append("Check for related alarms")
        if criticality_score >= 4:
            suggested_actions.append("Notify operations supervisor")
        suggested_actions.append("Review recent maintenance history")
        suggested_actions.append("Document findings")
        
        reasoning = (
            f"Priority {priority.value} based on: "
            f"Asset criticality ({criticality_score}/5), "
            f"Alert severity ({alert_severity}/5), "
            f"Recent similar alerts ({recent_similar} in 7 days). "
            f"Total score: {total_score:.1f}"
        )
        
        return TriageResult(
            priority=priority,
            response_time_hours=response_hours,
            recommended_owner_role=owner_role,
            suggested_actions=suggested_actions,
            reasoning=reasoning,
            evaluation_factors=evaluation_factors
        )
    
    async def get_alerts(
        self,
        owner_id: str,
        equipment_id: Optional[str] = None,
        priority: Optional[AlertPriority] = None,
        status: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        limit: int = 100,
        skip: int = 0
    ) -> Tuple[List[Alert], int]:
        """Get alerts with filtering"""
        query = {"owner_id": owner_id}
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        if priority:
            query["triage_result.priority"] = priority.value
        if status:
            query["status"] = status
        if from_date:
            query["alert_time"] = {"$gte": from_date}
        if to_date:
            query.setdefault("alert_time", {})["$lte"] = to_date
        
        total = await self.db[self._collections['alerts']].count_documents(query)
        cursor = self.db[self._collections['alerts']].find(query).sort(
            "alert_time", -1
        ).skip(skip).limit(limit)
        
        alerts = []
        async for doc in cursor:
            alerts.append(Alert(**doc))
        
        return alerts, total
    

    async def get_alert_doc(self, owner_id: str, alert_id: str):
        doc = await self.db[self._collections["alerts"]].find_one({
            "owner_id": owner_id,
            "id": alert_id,
        })
        if doc:
            doc.pop("_id", None)
        return doc

    async def update_alert_status(
        self,
        owner_id: str,
        alert_id: str,
        *,
        status=None,
        assigned_to=None,
    ):
        updates = {"updated_at": datetime.utcnow()}
        if status:
            updates["status"] = status
            if status == "acknowledged":
                updates["acknowledged_at"] = datetime.utcnow()
            elif status == "resolved":
                updates["resolved_at"] = datetime.utcnow()
        if assigned_to:
            updates["assigned_to"] = assigned_to

        result = await self.db[self._collections["alerts"]].update_one(
            {"owner_id": owner_id, "id": alert_id},
            {"$set": updates},
        )
        if result.matched_count == 0:
            return None
        return await self.get_alert_doc(owner_id, alert_id)
