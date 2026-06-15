"""
Reliability Intelligence Layer (RIL) Service
Provides core functionality for:
- Unified Observation Intelligence
- Multi-Source Correlation
- Intelligent Alert Triage
- Predictive Failure Engine
- Reliability Copilot
- Strategy Optimization
"""

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from models.ril import (
    RILObservation, Reading, Correlation, Alert, Prediction,
    StrategyRecommendation, ReliabilityCase, RiskAssessment,
    Evidence, CorrelationResult, TriageResult, FailurePrediction,
    ObservationSource, ObservationSeverity, AlertPriority, CaseStatus,
    CorrelationType, PredictionConfidence, RecommendationType,
    CreateObservationRequest, CreateReadingRequest, CreateAlertRequest,
    CreateReliabilityCaseRequest, UpdateReliabilityCaseRequest
)
import uuid
import os
import json

logger = logging.getLogger(__name__)


class RILService:
    """
    Main service class for Reliability Intelligence Layer
    """
    
    def __init__(self, db):
        self.db = db
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
    
    # ============= Observation Intelligence =============
    
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
            equipment = await self.db.equipment_nodes.find_one({"id": request.equipment_id})
            if equipment:
                equipment_name = equipment.get("name")
                equipment_tag = equipment.get("tag") or equipment.get("name")
        
        # Get failure mode name if ID provided
        failure_mode_name = None
        if request.failure_mode_id:
            fm = await self.db.failure_modes.find_one({"id": request.failure_mode_id})
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
            equipment = await self.db.equipment_nodes.find_one({"id": equipment_id})
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
    
    # ============= Reading Ingestion =============
    
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
    
    # ============= Alert Triage =============
    
    async def create_alert(
        self,
        owner_id: str,
        request: CreateAlertRequest
    ) -> Alert:
        """Create and triage an alert"""
        # Resolve equipment details
        equipment_name = None
        if request.equipment_id:
            equipment = await self.db.equipment_nodes.find_one({"id": request.equipment_id})
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
            equipment = await self.db.equipment_nodes.find_one({"id": alert.equipment_id})
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
    
    # ============= Correlation Engine =============
    
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
    
    # ============= Reliability Cases =============
    
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
            equipment = await self.db.equipment_nodes.find_one({"id": request.equipment_id})
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
            equipment = await self.db.equipment_nodes.find_one({"id": case.equipment_id})
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
    
    # ============= Predictions =============
    
    async def get_predictions(
        self,
        owner_id: str,
        equipment_id: Optional[str] = None,
        limit: int = 50,
        skip: int = 0
    ) -> Tuple[List[Prediction], int]:
        """Get predictive insights"""
        query = {"owner_id": owner_id}
        if equipment_id:
            query["equipment_id"] = equipment_id
        
        total = await self.db[self._collections['predictions']].count_documents(query)
        cursor = self.db[self._collections['predictions']].find(query).sort(
            "calculated_at", -1
        ).skip(skip).limit(limit)
        
        predictions = []
        async for doc in cursor:
            predictions.append(Prediction(**doc))
        
        return predictions, total
    
    async def generate_prediction(
        self,
        owner_id: str,
        equipment_id: str
    ) -> Optional[Prediction]:
        """
        Generate a prediction for equipment based on available data.
        This is a simplified rule-based prediction engine.
        In production, this would use ML models.
        """
        # Get equipment details
        equipment = await self.db.equipment_nodes.find_one({"id": equipment_id})
        if not equipment:
            return None
        
        # Count observations for this equipment (last 90 days)
        ninety_days_ago = datetime.utcnow() - timedelta(days=90)
        
        observation_count = await self.db[self._collections['observations']].count_documents({
            "owner_id": owner_id,
            "equipment_id": equipment_id,
            "observed_at": {"$gte": ninety_days_ago}
        })
        
        # Count alerts
        alert_count = await self.db[self._collections['alerts']].count_documents({
            "owner_id": owner_id,
            "equipment_id": equipment_id,
            "alert_time": {"$gte": ninety_days_ago}
        })
        
        # Get failure modes for this equipment type
        failure_predictions = []
        equipment_type_id = equipment.get("equipment_type_id")
        
        if equipment_type_id:
            async for fm in self.db.failure_modes.find({"equipment_type_ids": equipment_type_id}):
                # Simplified probability calculation
                base_probability = 0.1
                
                # Increase probability based on observations
                probability = base_probability + (observation_count * 0.02) + (alert_count * 0.05)
                probability = min(probability, 0.95)
                
                # Determine confidence
                if observation_count + alert_count > 10:
                    confidence = PredictionConfidence.HIGH
                elif observation_count + alert_count > 5:
                    confidence = PredictionConfidence.MEDIUM
                else:
                    confidence = PredictionConfidence.LOW
                
                # Calculate RUL (Remaining Useful Life)
                rul_days = int(90 * (1 - probability)) if probability > 0.3 else None
                
                failure_predictions.append(FailurePrediction(
                    failure_mode=fm.get("failure_mode"),
                    failure_mode_id=fm.get("id"),
                    probability=probability,
                    confidence=confidence,
                    remaining_useful_life_days=rul_days,
                    estimated_failure_date=datetime.utcnow() + timedelta(days=rul_days) if rul_days else None,
                    recommended_actions=fm.get("recommended_actions", [])[:3],
                    input_factors={
                        "observations_90d": observation_count,
                        "alerts_90d": alert_count
                    }
                ))
        
        # Calculate overall health score
        if failure_predictions:
            max_prob = max(fp.probability for fp in failure_predictions)
            health_score = 100 * (1 - max_prob)
        else:
            health_score = 85  # Default healthy
        
        prediction = Prediction(
            owner_id=owner_id,
            equipment_id=equipment_id,
            equipment_tag=equipment.get("tag") or equipment.get("name"),
            equipment_name=equipment.get("name"),
            equipment_type_id=equipment_type_id,
            predictions=failure_predictions[:10],  # Top 10
            overall_health_score=health_score,
            observation_count=observation_count,
            reading_count=0,  # Would come from readings collection
            maintenance_history_count=0,  # Would come from maintenance history
            days_of_data=90,
            valid_until=datetime.utcnow() + timedelta(days=7)
        )
        
        # Save prediction
        await self.db[self._collections['predictions']].insert_one(prediction.dict())
        
        return prediction
    
    # ============= Strategy Recommendations =============
    
    async def get_strategy_recommendations(
        self,
        owner_id: str,
        equipment_type_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        skip: int = 0
    ) -> Tuple[List[StrategyRecommendation], int]:
        """Get strategy optimization recommendations"""
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
    
    # ============= Dashboard Stats =============
    
    async def get_dashboard_stats(self, owner_id: str) -> Dict[str, Any]:
        """Get RIL dashboard statistics"""
        now = datetime.utcnow()
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)
        
        # Open cases by priority
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
        
        # Observations this week
        observations_7d = await self.db[self._collections['observations']].count_documents({
            "owner_id": owner_id,
            "created_at": {"$gte": seven_days_ago}
        })
        
        # Alerts this week
        alerts_7d = await self.db[self._collections['alerts']].count_documents({
            "owner_id": owner_id,
            "alert_time": {"$gte": seven_days_ago}
        })
        
        # Active correlations
        active_correlations = await self.db[self._collections['correlations']].count_documents({
            "owner_id": owner_id,
            "is_active": True
        })
        
        # Pending recommendations
        pending_recommendations = await self.db[self._collections['recommendations']].count_documents({
            "owner_id": owner_id,
            "status": "pending"
        })
        
        # Cases resolved this month
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

    # ============= Route-layer helpers (Wave 19) =============

    async def get_observation_doc(self, owner_id: str, observation_id: str) -> Optional[dict]:
        doc = await self.db[self._collections["observations"]].find_one({
            "owner_id": owner_id,
            "id": observation_id,
        })
        if doc:
            doc.pop("_id", None)
        return doc

    async def list_readings(
        self,
        owner_id: str,
        *,
        equipment_id: Optional[str] = None,
        source_system: Optional[str] = None,
        source_tag: Optional[str] = None,
        from_date=None,
        to_date=None,
        alarms_only: bool = False,
        limit: int = 100,
        skip: int = 0,
    ) -> Tuple[List[dict], int]:
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

        readings = []
        async for doc in cursor:
            doc.pop("_id", None)
            readings.append(doc)
        return readings, total

    async def get_alert_doc(self, owner_id: str, alert_id: str) -> Optional[dict]:
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
        status: Optional[str] = None,
        assigned_to: Optional[str] = None,
    ) -> Optional[dict]:
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

    async def get_correlation_detail(self, owner_id: str, correlation_id: str) -> Optional[dict]:
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

    async def get_case_detail(self, owner_id: str, case_id: str) -> Optional[dict]:
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
            equipment = await self.db.equipment_nodes.find_one({"id": case.equipment_id})
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
