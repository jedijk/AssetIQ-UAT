"""RIL cases operations — extracted from ril_service."""
from __future__ import annotations

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta

from models.ril import (
    ReliabilityCase,
    RiskAssessment,
    AlertPriority,
    CaseStatus,
    CreateReliabilityCaseRequest,
    UpdateReliabilityCaseRequest,
)

logger = logging.getLogger(__name__)


class RILCasesMixin:
    """Mixin — use only via RILService."""

    
    async def _get_next_case_number(self, owner_id: str) -> str:
        """Generate next case number"""
        year = datetime.utcnow().year
        
        result = await self.db[self._collections['case_counter']].find_one_and_update(
            {"owner_id": owner_id, "year": year},
            {"$inc": {"sequence": 1}},
            upsert=True,
            return_document=True
        )
        
        seq = result.get("sequence", 1)
        return f"RC-{year}-{seq:04d}"
    
    async def create_reliability_case(
        self,
        owner_id: str,
        request: CreateReliabilityCaseRequest
    ) -> ReliabilityCase:
        """Create a new reliability case"""
        # Generate case number
        case_number = await self._get_next_case_number(owner_id)
        
        # Resolve equipment details
        equipment_name = None
        equipment_tag = None
        equipment_type_id = None
        
        if request.equipment_id:
            equipment = await self._find_equipment_node(request.equipment_id)
            if equipment:
                equipment_name = equipment.get("name")
                equipment_tag = equipment.get("tag") or equipment.get("name")
                equipment_type_id = equipment.get("equipment_type_id")
        
        case = ReliabilityCase(
            owner_id=owner_id,
            case_number=case_number,
            equipment_id=request.equipment_id,
            equipment_tag=equipment_tag or request.equipment_tag,
            equipment_name=equipment_name,
            equipment_type_id=equipment_type_id,
            title=request.title,
            description=request.description,
            priority=request.priority,
            observation_ids=request.observation_ids,
            alert_ids=request.alert_ids,
            tags=request.tags,
            status_history=[{
                "status": CaseStatus.OPEN.value,
                "changed_at": datetime.utcnow().isoformat(),
                "changed_by": owner_id,
                "notes": "Case created"
            }]
        )
        
        # Calculate initial risk assessment
        case.risk_assessment = await self._calculate_case_risk(owner_id, case)
        
        await self.db[self._collections['cases']].insert_one(case.dict())
        
        # Update linked observations and alerts
        if request.observation_ids:
            await self.db[self._collections['observations']].update_many(
                {"id": {"$in": request.observation_ids}},
                {"$set": {"reliability_case_id": case.id}}
            )
        
        if request.alert_ids:
            await self.db[self._collections['alerts']].update_many(
                {"id": {"$in": request.alert_ids}},
                {"$set": {"reliability_case_id": case.id}}
            )
        
        return case
    
    async def _calculate_case_risk(
        self,
        owner_id: str,
        case: ReliabilityCase
    ) -> RiskAssessment:
        """Calculate risk assessment for a reliability case"""
        # Get equipment criticality
        safety = 1
        production = 1
        environmental = 1
        reputation = 1
        
        if case.equipment_id:
            equipment = await self._find_equipment_node(case.equipment_id)
            if equipment and equipment.get("criticality"):
                crit = equipment["criticality"]
                safety = crit.get("safety_impact", 1)
                production = crit.get("production_impact", 1)
                environmental = crit.get("environmental_impact", 1)
                reputation = crit.get("reputation_impact", 1)
        
        # Calculate probability based on observations
        observation_count = len(case.observation_ids)
        alert_count = len(case.alert_ids)
        
        # More events = higher probability
        probability = min(0.3 + (observation_count * 0.1) + (alert_count * 0.15), 0.95)
        
        # Priority affects probability
        priority_factors = {
            AlertPriority.P1_CRITICAL: 0.2,
            AlertPriority.P2_HIGH: 0.1,
            AlertPriority.P3_MEDIUM: 0,
            AlertPriority.P4_LOW: -0.1
        }
        probability += priority_factors.get(case.priority, 0)
        probability = max(0.1, min(probability, 0.95))
        
        # Calculate risk score (simplified RPN-like calculation)
        max_impact = max(safety, production, environmental, reputation)
        risk_score = max_impact * probability * 100 * (1 + (observation_count + alert_count) * 0.1)
        
        return RiskAssessment(
            risk_score=min(risk_score, 1000),
            safety_impact=safety,
            production_impact=production,
            environmental_impact=environmental,
            reputation_impact=reputation,
            probability=probability,
            notes=f"Based on {observation_count} observations and {alert_count} alerts"
        )
    
    async def get_reliability_case(
        self,
        owner_id: str,
        case_id: str
    ) -> Optional[ReliabilityCase]:
        """Get a single reliability case"""
        doc = await self.db[self._collections['cases']].find_one({
            "owner_id": owner_id,
            "id": case_id
        })
        
        if doc:
            return ReliabilityCase(**doc)
        return None
    
    async def get_reliability_cases(
        self,
        owner_id: str,
        equipment_id: Optional[str] = None,
        status: Optional[CaseStatus] = None,
        priority: Optional[AlertPriority] = None,
        limit: int = 50,
        skip: int = 0
    ) -> Tuple[List[ReliabilityCase], int]:
        """Get reliability cases with filtering"""
        query = {"owner_id": owner_id}
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        if status:
            query["status"] = status.value
        if priority:
            query["priority"] = priority.value
        
        total = await self.db[self._collections['cases']].count_documents(query)
        cursor = self.db[self._collections['cases']].find(query).sort(
            "created_at", -1
        ).skip(skip).limit(limit)
        
        cases = []
        async for doc in cursor:
            cases.append(ReliabilityCase(**doc))
        
        return cases, total
    
    async def update_reliability_case(
        self,
        owner_id: str,
        case_id: str,
        request: UpdateReliabilityCaseRequest,
        user_id: str
    ) -> Optional[ReliabilityCase]:
        """Update a reliability case"""
        case = await self.get_reliability_case(owner_id, case_id)
        if not case:
            return None
        
        updates = {"updated_at": datetime.utcnow()}
        
        if request.title is not None:
            updates["title"] = request.title
        if request.description is not None:
            updates["description"] = request.description
        if request.priority is not None:
            updates["priority"] = request.priority.value
        if request.assigned_to is not None:
            updates["assigned_to"] = request.assigned_to
            updates["assigned_at"] = datetime.utcnow()
            # Get assignee name
            user = await self.db.users.find_one({"id": request.assigned_to})
            if user:
                updates["assigned_to_name"] = user.get("name") or user.get("email")
        if request.resolution_summary is not None:
            updates["resolution_summary"] = request.resolution_summary
        if request.root_cause is not None:
            updates["root_cause"] = request.root_cause
        if request.corrective_actions is not None:
            updates["corrective_actions"] = request.corrective_actions
        if request.preventive_actions is not None:
            updates["preventive_actions"] = request.preventive_actions
        if request.tags is not None:
            updates["tags"] = request.tags
        
        # Handle status change
        if request.status is not None and request.status.value != case.status.value:
            updates["status"] = request.status.value
            
            # Add to status history
            status_entry = {
                "status": request.status.value,
                "changed_at": datetime.utcnow().isoformat(),
                "changed_by": user_id
            }
            
            if request.status == CaseStatus.RESOLVED:
                updates["resolved_at"] = datetime.utcnow()
            elif request.status == CaseStatus.CLOSED:
                updates["closed_at"] = datetime.utcnow()
            
            await self.db[self._collections['cases']].update_one(
                {"id": case_id},
                {"$push": {"status_history": status_entry}}
            )
        
        await self.db[self._collections['cases']].update_one(
            {"id": case_id},
            {"$set": updates}
        )
        
        return await self.get_reliability_case(owner_id, case_id)
    

    async def get_case_detail(self, owner_id: str, case_id: str):
        case = await self.get_reliability_case(owner_id, case_id)
        if not case:
            return None

        observations = []
        if case.observation_ids:
            async for obs in self.db[self._collections["observations"]].find(
                {"id": {"$in": case.observation_ids}},
            ):
                obs.pop("_id", None)
                observations.append(obs)

        alerts = []
        if case.alert_ids:
            async for alert in self.db[self._collections["alerts"]].find(
                {"id": {"$in": case.alert_ids}},
            ):
                alert.pop("_id", None)
                alerts.append(alert)

        equipment = None
        if case.equipment_id:
            equipment = await self._find_equipment_node(case.equipment_id)
            if equipment:
                equipment.pop("_id", None)

        return {
            "case": case.dict(),
            "observations": observations,
            "alerts": alerts,
            "equipment": equipment,
        }

    async def link_observation_to_case(
        self,
        owner_id: str,
        case_id: str,
        observation_id: str,
    ) -> bool:
        result = await self.db[self._collections["cases"]].update_one(
            {"owner_id": owner_id, "id": case_id},
            {
                "$addToSet": {"observation_ids": observation_id},
                "$set": {"updated_at": datetime.utcnow()},
            },
        )
        if result.matched_count == 0:
            return False
        await self.db[self._collections["observations"]].update_one(
            {"id": observation_id},
            {"$set": {"reliability_case_id": case_id}},
        )
        return True

    async def link_alert_to_case(
        self,
        owner_id: str,
        case_id: str,
        alert_id: str,
    ) -> bool:
        result = await self.db[self._collections["cases"]].update_one(
            {"owner_id": owner_id, "id": case_id},
            {
                "$addToSet": {"alert_ids": alert_id},
                "$set": {"updated_at": datetime.utcnow()},
            },
        )
        if result.matched_count == 0:
            return False
        await self.db[self._collections["alerts"]].update_one(
            {"id": alert_id},
            {"$set": {"reliability_case_id": case_id}},
        )
        return True

    async def link_investigation_to_case(
        self,
        owner_id: str,
        case_id: str,
        investigation_id: str,
    ) -> bool:
        result = await self.db[self._collections["cases"]].update_one(
            {"owner_id": owner_id, "id": case_id},
            {
                "$set": {
                    "investigation_id": investigation_id,
                    "updated_at": datetime.utcnow(),
                },
            },
        )
        return result.matched_count > 0
