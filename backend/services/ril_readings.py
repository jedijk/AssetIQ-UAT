"""RIL readings operations — extracted from ril_service."""
from __future__ import annotations

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta

from models.ril import Reading, Alert, CreateReadingRequest

logger = logging.getLogger(__name__)


class RILReadingsMixin:
    """Mixin — use only via RILService."""

    
    async def ingest_reading(
        self,
        owner_id: str,
        request: CreateReadingRequest
    ) -> Reading:
        """
        Ingest a single reading from an external system.
        Automatically checks against thresholds and creates alerts if needed.
        """
        reading = Reading(
            owner_id=owner_id,
            source=request.source,
            source_system=request.source_system,
            source_tag=request.source_tag,
            equipment_id=request.equipment_id,
            equipment_tag=request.equipment_tag,
            value=request.value,
            unit=request.unit,
            quality=request.quality,
            timestamp=request.timestamp,
            low_limit=request.low_limit,
            high_limit=request.high_limit,
            low_low_limit=request.low_low_limit,
            high_high_limit=request.high_high_limit,
            is_alarm=request.is_alarm,
            alarm_type=request.alarm_type,
            metadata=request.metadata
        )
        
        # Check if reading exceeds thresholds
        if not request.is_alarm:
            reading.is_alarm, reading.alarm_type = self._check_thresholds(
                request.value,
                request.low_limit,
                request.high_limit,
                request.low_low_limit,
                request.high_high_limit
            )
        
        await self.db[self._collections['readings']].insert_one(reading.dict())
        
        # If alarm, create an alert
        if reading.is_alarm:
            await self._create_reading_alert(owner_id, reading)
        
        return reading
    
    async def ingest_readings_bulk(
        self,
        owner_id: str,
        readings: List[CreateReadingRequest]
    ) -> Dict[str, int]:
        """Ingest multiple readings at once"""
        inserted = 0
        alerts_created = 0
        
        for req in readings:
            try:
                reading = await self.ingest_reading(owner_id, req)
                inserted += 1
                if reading.is_alarm:
                    alerts_created += 1
            except Exception as e:
                logger.error(f"Failed to ingest reading: {e}")
        
        return {
            "inserted": inserted,
            "alerts_created": alerts_created,
            "failed": len(readings) - inserted
        }
    
    def _check_thresholds(
        self,
        value: float,
        low: Optional[float],
        high: Optional[float],
        low_low: Optional[float],
        high_high: Optional[float]
    ) -> Tuple[bool, Optional[str]]:
        """Check if value exceeds thresholds"""
        if high_high is not None and value >= high_high:
            return True, "HighHigh"
        if low_low is not None and value <= low_low:
            return True, "LowLow"
        if high is not None and value >= high:
            return True, "High"
        if low is not None and value <= low:
            return True, "Low"
        return False, None
    
    async def _create_reading_alert(self, owner_id: str, reading: Reading):
        """Create an alert from a reading that exceeded thresholds"""
        threshold = None
        if reading.alarm_type in ["High", "HighHigh"]:
            threshold = reading.high_high_limit if reading.alarm_type == "HighHigh" else reading.high_limit
        elif reading.alarm_type in ["Low", "LowLow"]:
            threshold = reading.low_low_limit if reading.alarm_type == "LowLow" else reading.low_limit
        
        alert = Alert(
            owner_id=owner_id,
            source=reading.source,
            source_system=reading.source_system,
            equipment_id=reading.equipment_id,
            equipment_tag=reading.equipment_tag,
            title=f"{reading.alarm_type} alarm: {reading.source_tag}",
            description=f"Value {reading.value} {reading.unit} exceeded {reading.alarm_type} threshold",
            alert_type=f"{reading.alarm_type.lower()}_alarm",
            alert_time=reading.timestamp,
            reading_value=reading.value,
            reading_unit=reading.unit,
            threshold_value=threshold
        )
        
        # Auto-triage the alert
        triage = await self.triage_alert(owner_id, alert)
        alert.triage_result = triage
        alert.is_triaged = True
        
        await self.db[self._collections['alerts']].insert_one(alert.dict())
    

    async def list_readings(
        self,
        owner_id: str,
        *,
        equipment_id=None,
        source_system=None,
        source_tag=None,
        from_date=None,
        to_date=None,
        alarms_only: bool = False,
        limit: int = 100,
        skip: int = 0,
    ):
        query = {"owner_id": owner_id}
        if equipment_id:
            query["equipment_id"] = equipment_id
        if source_system:
            query["source_system"] = source_system
        if source_tag:
            query["source_tag"] = source_tag
        if alarms_only:
            query["is_alarm"] = True
        if from_date:
            query["timestamp"] = {"$gte": from_date}
        if to_date:
            query.setdefault("timestamp", {})["$lte"] = to_date

        total = await self.db[self._collections["readings"]].count_documents(query)
        cursor = self.db[self._collections["readings"]].find(query).sort(
            "timestamp", -1,
        ).skip(skip).limit(limit)

        readings_out = []
        async for doc in cursor:
            doc.pop("_id", None)
            readings_out.append(doc)
        return readings_out, total
