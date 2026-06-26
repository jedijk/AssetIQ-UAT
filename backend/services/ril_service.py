"""
Reliability Intelligence Layer (RIL) Service — thin facade.
"""
from __future__ import annotations

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta

from models.ril import Prediction, StrategyRecommendation
from services.ril_observations import RILObservationsMixin
from services.ril_readings import RILReadingsMixin
from services.ril_alerts import RILAlertsMixin
from services.ril_correlations import RILCorrelationsMixin
from services.ril_cases import RILCasesMixin

logger = logging.getLogger(__name__)


class RILService(
    RILObservationsMixin,
    RILReadingsMixin,
    RILAlertsMixin,
    RILCorrelationsMixin,
    RILCasesMixin,
):
    """Main service class for Reliability Intelligence Layer."""

    def __init__(self, db, tenant_user: Optional[dict] = None):
        self.db = db
        self._tenant_user = tenant_user
        self._collections = {
            'observations': 'ril_observations',
            'readings': 'ril_readings',
            'correlations': 'ril_correlations',
            'alerts': 'ril_alerts',
            'predictions': 'ril_predictions',
            'recommendations': 'ril_recommendations',
            'cases': 'ril_cases',
            'case_counter': 'ril_case_counter'
        }

    async def _find_equipment_node(self, equipment_id: str) -> Optional[dict]:
        from services.tenant_schema import merge_tenant_filter

        return await self.db.equipment_nodes.find_one(
            merge_tenant_filter({"id": equipment_id}, self._tenant_user)
        )

    async def _find_failure_mode(self, failure_mode_id: str) -> Optional[dict]:
        from services.tenant_schema import merge_tenant_filter

        return await self.db.failure_modes.find_one(
            merge_tenant_filter({"id": failure_mode_id}, self._tenant_user)
        )

    async def get_predictions(
        self,
        owner_id: str,
        equipment_id: Optional[str] = None,
        limit: int = 50,
        skip: int = 0
    ) -> Tuple[List[Prediction], int]:
        from services.ril_predictions import get_predictions as _get_predictions

        return await _get_predictions(
            self.db,
            owner_id=owner_id,
            equipment_id=equipment_id,
            limit=limit,
            skip=skip,
            collection=self._collections["predictions"],
        )

    async def generate_prediction(
        self,
        owner_id: str,
        equipment_id: str
    ) -> Optional[Prediction]:
        from services.ril_predictions import generate_equipment_prediction

        return await generate_equipment_prediction(
            self.db,
            owner_id=owner_id,
            equipment_id=equipment_id,
            observations_collection=self._collections["observations"],
            alerts_collection=self._collections["alerts"],
            predictions_collection=self._collections["predictions"],
        )

    async def get_strategy_recommendations(
        self,
        owner_id: str,
        equipment_type_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        skip: int = 0
    ) -> Tuple[List[StrategyRecommendation], int]:
        query = {"owner_id": owner_id}
        if equipment_type_id:
            query["equipment_type_id"] = equipment_type_id
        if status:
            query["status"] = status

        total = await self.db[self._collections['recommendations']].count_documents(query)
        cursor = self.db[self._collections['recommendations']].find(query).sort(
            "created_at", -1
        ).skip(skip).limit(limit)

        recommendations = []
        async for doc in cursor:
            recommendations.append(StrategyRecommendation(**doc))

        return recommendations, total

    async def get_dashboard_stats(self, owner_id: str) -> Dict[str, Any]:
        now = datetime.utcnow()
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        open_cases = await self.db[self._collections['cases']].count_documents({
            "owner_id": owner_id,
            "status": {"$in": ["open", "in_progress", "under_investigation"]}
        })

        p1_cases = await self.db[self._collections['cases']].count_documents({
            "owner_id": owner_id,
            "status": {"$in": ["open", "in_progress"]},
            "priority": "P1"
        })

        p2_cases = await self.db[self._collections['cases']].count_documents({
            "owner_id": owner_id,
            "status": {"$in": ["open", "in_progress"]},
            "priority": "P2"
        })

        observations_7d = await self.db[self._collections['observations']].count_documents({
            "owner_id": owner_id,
            "created_at": {"$gte": seven_days_ago}
        })

        alerts_7d = await self.db[self._collections['alerts']].count_documents({
            "owner_id": owner_id,
            "alert_time": {"$gte": seven_days_ago}
        })

        active_correlations = await self.db[self._collections['correlations']].count_documents({
            "owner_id": owner_id,
            "is_active": True
        })

        pending_recommendations = await self.db[self._collections['recommendations']].count_documents({
            "owner_id": owner_id,
            "status": "pending"
        })

        cases_resolved_30d = await self.db[self._collections['cases']].count_documents({
            "owner_id": owner_id,
            "status": {"$in": ["resolved", "closed"]},
            "resolved_at": {"$gte": thirty_days_ago}
        })

        return {
            "open_cases": open_cases,
            "p1_cases": p1_cases,
            "p2_cases": p2_cases,
            "observations_7d": observations_7d,
            "alerts_7d": alerts_7d,
            "active_correlations": active_correlations,
            "pending_recommendations": pending_recommendations,
            "cases_resolved_30d": cases_resolved_30d
        }

    async def get_equipment_prediction_cached(
        self,
        owner_id: str,
        equipment_id: str,
    ) -> Tuple[Optional[dict], bool]:
        week_ago = datetime.utcnow() - timedelta(days=7)
        doc = await self.db[self._collections["predictions"]].find_one({
            "owner_id": owner_id,
            "equipment_id": equipment_id,
            "calculated_at": {"$gte": week_ago},
        })
        if doc:
            doc.pop("_id", None)
            return doc, True

        prediction = await self.generate_prediction(owner_id, equipment_id)
        if not prediction:
            return None, False
        return prediction.dict(), False

    async def get_equipment_at_risk(
        self,
        owner_id: str,
        *,
        health_threshold: float = 70,
        limit: int = 20,
    ) -> list:
        pipeline = [
            {"$match": {"owner_id": owner_id}},
            {"$sort": {"calculated_at": -1}},
            {"$group": {"_id": "$equipment_id", "latest": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$latest"}},
            {"$match": {"overall_health_score": {"$lt": health_threshold}}},
            {"$sort": {"overall_health_score": 1}},
            {"$limit": limit},
        ]
        at_risk = []
        async for doc in self.db[self._collections["predictions"]].aggregate(pipeline):
            doc.pop("_id", None)
            at_risk.append(doc)
        return at_risk
