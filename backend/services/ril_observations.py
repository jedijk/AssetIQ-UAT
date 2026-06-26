"""RIL observations operations — extracted from ril_service."""
from __future__ import annotations

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta

from models.ril import (
    RILObservation,
    ObservationSource,
    ObservationSeverity,
    CreateObservationRequest,
)

logger = logging.getLogger(__name__)


class RILObservationsMixin:
    """Mixin — use only via RILService."""

    
    async def create_observation(
        self,
        owner_id: str,
        request: CreateObservationRequest
    ) -> RILObservation:
        """
        Create a unified observation from any source.
        Automatically enriches with equipment details and calculates risk score.
        """
        # Resolve equipment details if ID provided
        equipment_name = None
        equipment_tag = None
        if request.equipment_id:
            equipment = await self._find_equipment_node(request.equipment_id)
            if equipment:
                equipment_name = equipment.get("name")
                equipment_tag = equipment.get("tag") or equipment.get("name")
        
        # Get failure mode name if ID provided
        failure_mode_name = None
        if request.failure_mode_id:
            fm = await self._find_failure_mode(request.failure_mode_id)
            if fm:
                failure_mode_name = fm.get("failure_mode")
        
        # Calculate risk score based on severity and equipment criticality
        risk_score = await self._calculate_observation_risk_score(
            request.equipment_id,
            request.severity,
            request.confidence
        )
        
        observation = RILObservation(
            owner_id=owner_id,
            source=request.source,
            source_system=request.source_system,
            source_id=request.source_id,
            equipment_id=request.equipment_id,
            equipment_tag=equipment_tag or request.equipment_tag,
            equipment_name=equipment_name,
            failure_mode_id=request.failure_mode_id,
            failure_mode_name=failure_mode_name,
            title=request.title,
            description=request.description,
            severity=request.severity,
            confidence=request.confidence,
            readings=request.readings,
            risk_score=risk_score,
            observed_at=request.observed_at or datetime.utcnow(),
            tags=request.tags,
            metadata=request.metadata
        )
        
        await self.db[self._collections['observations']].insert_one(observation.dict())
        
        # Trigger correlation check in background
        # (In production, this would be a background task)
        
        return observation
    
    async def get_observations(
        self,
        owner_id: str,
        equipment_id: Optional[str] = None,
        source: Optional[ObservationSource] = None,
        severity: Optional[ObservationSeverity] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        limit: int = 100,
        skip: int = 0
    ) -> Tuple[List[RILObservation], int]:
        """Get observations with filtering"""
        query = {"owner_id": owner_id}
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        if source:
            query["source"] = source.value
        if severity:
            query["severity"] = severity.value
        if from_date:
            query["observed_at"] = {"$gte": from_date}
        if to_date:
            query.setdefault("observed_at", {})["$lte"] = to_date
        
        total = await self.db[self._collections['observations']].count_documents(query)
        cursor = self.db[self._collections['observations']].find(query).sort(
            "observed_at", -1
        ).skip(skip).limit(limit)
        
        observations = []
        async for doc in cursor:
            observations.append(RILObservation(**doc))
        
        return observations, total
    
    async def _calculate_observation_risk_score(
        self,
        equipment_id: Optional[str],
        severity: ObservationSeverity,
        confidence: float
    ) -> float:
        """Calculate risk score for an observation"""
        # Base severity scores
        severity_scores = {
            ObservationSeverity.CRITICAL: 100,
            ObservationSeverity.HIGH: 75,
            ObservationSeverity.MEDIUM: 50,
            ObservationSeverity.LOW: 25,
            ObservationSeverity.INFO: 10
        }
        
        base_score = severity_scores.get(severity, 50)
        
        # Multiply by equipment criticality if available
        criticality_multiplier = 1.0
        if equipment_id:
            equipment = await self._find_equipment_node(equipment_id)
            if equipment and equipment.get("criticality"):
                crit = equipment["criticality"]
                # Calculate from impact scores
                safety = crit.get("safety_impact", 1)
                production = crit.get("production_impact", 1)
                environmental = crit.get("environmental_impact", 1)
                max_impact = max(safety, production, environmental)
                criticality_multiplier = 0.5 + (max_impact / 5) * 1.5  # Range 0.5-2.0
        
        # Apply confidence and criticality
        risk_score = base_score * criticality_multiplier * confidence
        
        return min(risk_score, 1000)  # Cap at 1000
    

    async def get_observation_doc(self, owner_id: str, observation_id: str):
        doc = await self.db[self._collections["observations"]].find_one({
            "owner_id": owner_id,
            "id": observation_id,
        })
        if doc:
            doc.pop("_id", None)
        return doc
