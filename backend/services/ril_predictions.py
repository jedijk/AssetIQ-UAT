"""RIL predictive failure engine — extracted from ril_service."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from models.ril import FailurePrediction, Prediction, PredictionConfidence

logger = logging.getLogger(__name__)

PREDICTIONS_COLLECTION = "ril_predictions"


async def get_predictions(
    db,
    *,
    owner_id: str,
    equipment_id: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    collection: str = PREDICTIONS_COLLECTION,
) -> Tuple[List[Prediction], int]:
    """List stored predictions for an owner."""
    query = {"owner_id": owner_id}
    if equipment_id:
        query["equipment_id"] = equipment_id

    coll = db[collection]
    total = await coll.count_documents(query)
    cursor = coll.find(query).sort("calculated_at", -1).skip(skip).limit(limit)

    predictions = []
    async for doc in cursor:
        predictions.append(Prediction(**doc))
    return predictions, total


async def generate_equipment_prediction(
    db,
    *,
    owner_id: str,
    equipment_id: str,
    observations_collection: str = "ril_observations",
    alerts_collection: str = "ril_alerts",
    predictions_collection: str = PREDICTIONS_COLLECTION,
) -> Optional[Prediction]:
    """Rule-based prediction engine (v1.2 — writes graph edge when hint present)."""
    equipment = await db.equipment_nodes.find_one({"id": equipment_id})
    if not equipment:
        return None

    ninety_days_ago = datetime.utcnow() - timedelta(days=90)

    observation_count = await db[observations_collection].count_documents({
        "owner_id": owner_id,
        "equipment_id": equipment_id,
        "observed_at": {"$gte": ninety_days_ago},
    })
    alert_count = await db[alerts_collection].count_documents({
        "owner_id": owner_id,
        "equipment_id": equipment_id,
        "alert_time": {"$gte": ninety_days_ago},
    })
    graph_edge_count = await db.reliability_edges.count_documents({
        "$or": [
            {"source_id": equipment_id, "source_type": "equipment"},
            {"target_id": equipment_id, "target_type": "equipment"},
        ],
        "status": {"$ne": "retired"},
    })

    failure_predictions: List[FailurePrediction] = []
    equipment_type_id = equipment.get("equipment_type_id")

    if equipment_type_id:
        async for fm in db.failure_modes.find({"equipment_type_ids": equipment_type_id}):
            base_probability = 0.1
            probability = base_probability + (observation_count * 0.02) + (alert_count * 0.05)
            probability = min(probability, 0.95)

            if observation_count + alert_count > 10:
                confidence = PredictionConfidence.HIGH
            elif observation_count + alert_count > 5:
                confidence = PredictionConfidence.MEDIUM
            else:
                confidence = PredictionConfidence.LOW

            rul_days = int(90 * (1 - probability)) if probability > 0.3 else None
            failure_predictions.append(
                FailurePrediction(
                    failure_mode=fm.get("failure_mode"),
                    failure_mode_id=fm.get("id"),
                    probability=probability,
                    confidence=confidence,
                    remaining_useful_life_days=rul_days,
                    estimated_failure_date=datetime.utcnow() + timedelta(days=rul_days) if rul_days else None,
                    recommended_actions=fm.get("recommended_actions", [])[:3],
                    input_factors={
                        "observations_90d": observation_count,
                        "alerts_90d": alert_count,
                    },
                )
            )

    if failure_predictions:
        max_prob = max(fp.probability for fp in failure_predictions)
        health_score = 100 * (1 - max_prob)
    else:
        health_score = 85

    prediction = Prediction(
        owner_id=owner_id,
        equipment_id=equipment_id,
        equipment_tag=equipment.get("tag") or equipment.get("name"),
        equipment_name=equipment.get("name"),
        equipment_type_id=equipment_type_id,
        predictions=failure_predictions[:10],
        overall_health_score=health_score,
        observation_count=observation_count,
        reading_count=0,
        maintenance_history_count=0,
        days_of_data=90,
        valid_until=datetime.utcnow() + timedelta(days=7),
        model_version="1.2",
        model_type="rule_based_v1",
    )

    doc = prediction.dict()
    doc["schema_version"] = 2
    doc["equipment_id"] = equipment_id
    graph_edge_hint: Dict[str, Any] = {
        "active_edge_count": graph_edge_count,
        "equipment_id": equipment_id,
    }
    doc["graph_edge_hint"] = graph_edge_hint

    coll = db[predictions_collection]
    existing = await coll.find_one(
        {"owner_id": owner_id, "equipment_id": equipment_id},
        {"_id": 0, "version": 1, "history": 1},
    )
    next_version = int((existing or {}).get("version") or 0) + 1
    doc["version"] = next_version
    history_entry = {
        "version": next_version,
        "calculated_at": doc.get("calculated_at"),
        "overall_health_score": doc.get("overall_health_score"),
        "observation_count": doc.get("observation_count"),
        "model_version": doc.get("model_version"),
        "equipment_id": equipment_id,
        "graph_edge_count": graph_edge_count,
    }
    await coll.update_one(
        {"owner_id": owner_id, "equipment_id": equipment_id},
        {"$set": doc, "$push": {"history": {"$each": [history_entry], "$slice": -20}}},
        upsert=True,
    )

    if graph_edge_hint.get("active_edge_count", 0) > 0:
        try:
            from services.reliability_graph import dispatch_graph_sync

            await dispatch_graph_sync(
                "sync_prediction_edges",
                f"prediction_{equipment_id}_v{next_version}",
                equipment_id=equipment_id,
                graph_edge_hint=graph_edge_hint,
                tenant_id=equipment.get("tenant_id"),
                owner_id=owner_id,
                prediction_version=next_version,
            )
        except Exception as exc:
            logger.warning("Prediction graph sync failed for %s: %s", equipment_id, exc)

    return prediction
