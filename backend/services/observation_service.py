"""
Observation Engine Service - Enhanced observation/threat management with AI suggestions.

Integrates with existing chat-based threat capture and adds:
- Structured observation capture
- AI-powered failure mode suggestions
- EFM linkage and tracking
- Observation trends and analytics
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import re

logger = logging.getLogger(__name__)


class ObservationService:
    """Service for observation/threat management."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.observations = db["observations"]  # New structured observations
        self.threats = db["threats"]  # Existing threats from chat
        self.efms = db["equipment_failure_modes"]
        self.failure_modes = db["failure_modes"]
        self.equipment = db["equipment_nodes"]
    
    # ==================== OBSERVATION CRUD ====================
    
    async def create_observation(
        self,
        data: Dict[str, Any],
        created_by: str,
        source: str = "manual"
    ) -> Dict[str, Any]:
        """Create a structured observation."""
        now = datetime.now(timezone.utc)
        
        # Get equipment info if provided
        equipment_name = None
        if data.get("equipment_id"):
            equip = await self.equipment.find_one({"id": data["equipment_id"]})
            if equip:
                equipment_name = equip.get("name")
        
        # Get failure mode info if provided
        failure_mode_name = None
        if data.get("failure_mode_id"):
            fm = await self.failure_modes.find_one({"_id": ObjectId(data["failure_mode_id"])})
            if fm:
                failure_mode_name = fm.get("failure_mode")
        
        doc = {
            "equipment_id": data.get("equipment_id"),
            "equipment_name": equipment_name,
            "efm_id": data.get("efm_id"),
            "task_id": data.get("task_id"),
            "form_submission_id": data.get("form_submission_id"),
            "failure_mode_id": data.get("failure_mode_id"),
            "failure_mode_name": failure_mode_name,
            "description": data["description"],
            "severity": data.get("severity", "medium"),
            "observation_type": data.get("observation_type", "general"),  # general, failure, near_miss, improvement
            "media_urls": data.get("media_urls", []),
            "measured_values": data.get("measured_values", []),  # [{field, value, unit, status}]
            "location": data.get("location"),
            "tags": data.get("tags", []),
            "source": source,  # manual, chat, form_threshold, automated
            "status": "open",  # open, in_review, action_required, closed
            "suggested_failure_modes": [],  # Populated by AI suggestion
            "linked_action_ids": [],
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        
        result = await self.observations.insert_one(doc)
        doc["_id"] = result.inserted_id
        
        # Update EFM observation count if linked
        if data.get("efm_id"):
            await self._increment_efm_observation_count(data["efm_id"])
        
        return self._serialize_observation(doc)
    
    async def get_observations(
        self,
        equipment_id: Optional[str] = None,
        efm_id: Optional[str] = None,
        failure_mode_id: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        source: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get observations with filters."""
        
        query = {}
        
        if equipment_id:
            query["equipment_id"] = equipment_id
        
        if efm_id:
            query["efm_id"] = efm_id
        
        if failure_mode_id:
            query["failure_mode_id"] = failure_mode_id
        
        if severity:
            query["severity"] = severity
        
        if status:
            query["status"] = status
        
        if source:
            query["source"] = source
        
        if from_date or to_date:
            query["created_at"] = {}
            if from_date:
                query["created_at"]["$gte"] = from_date
            if to_date:
                query["created_at"]["$lte"] = to_date
        
        if search:
            query["$or"] = [
                {"description": {"$regex": search, "$options": "i"}},
                {"equipment_name": {"$regex": search, "$options": "i"}},
                {"failure_mode_name": {"$regex": search, "$options": "i"}},
                {"tags": {"$regex": search, "$options": "i"}},
            ]
        
        cursor = self.observations.find(query).sort("created_at", -1).skip(skip).limit(limit)
        
        observations = []
        async for doc in cursor:
            observations.append(self._serialize_observation(doc))
        
        total = await self.observations.count_documents(query)
        
        return {"total": total, "observations": observations}
    
    async def get_observation_by_id(self, obs_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific observation by _id (ObjectId) or id (string UUID) field."""
        doc = None
        
        # First try to find by ObjectId (_id field)
        if ObjectId.is_valid(obs_id):
            doc = await self.observations.find_one({"_id": ObjectId(obs_id)})
        
        # If not found, try to find by string id field
        if not doc:
            doc = await self.observations.find_one({"id": obs_id})
        
        if doc:
            return self._serialize_observation(doc)
        return None
    
    async def update_observation(
        self,
        obs_id: str,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update an observation."""
        if not ObjectId.is_valid(obs_id):
            return None
        
        update = {"updated_at": datetime.now(timezone.utc)}
        
        allowed_fields = [
            "description", "severity", "observation_type", "status",
            "failure_mode_id", "efm_id", "media_urls", "measured_values",
            "location", "tags"
        ]
        
        for field in allowed_fields:
            if field in data and data[field] is not None:
                update[field] = data[field]
        
        # Update failure mode name if changed
        if data.get("failure_mode_id"):
            fm = await self.failure_modes.find_one({"_id": ObjectId(data["failure_mode_id"])})
            if fm:
                update["failure_mode_name"] = fm.get("failure_mode")
        
        result = await self.observations.find_one_and_update(
            {"_id": ObjectId(obs_id)},
            {"$set": update},
            return_document=True
        )
        
        if result:
            return self._serialize_observation(result)
        return None
    
    async def close_observation(
        self,
        obs_id: str,
        resolution_notes: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Close an observation."""
        if not ObjectId.is_valid(obs_id):
            return None
        
        result = await self.observations.find_one_and_update(
            {"_id": ObjectId(obs_id)},
            {"$set": {
                "status": "closed",
                "resolution_notes": resolution_notes,
                "closed_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }},
            return_document=True
        )
        
        if result:
            return self._serialize_observation(result)
        return None
    
    # ==================== AI FAILURE MODE SUGGESTIONS ====================
    
    async def suggest_failure_modes(
        self,
        description: str,
        equipment_id: Optional[str] = None,
        equipment_type_id: Optional[str] = None,
        max_suggestions: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Suggest matching failure modes based on observation description.
        Uses keyword matching and equipment type filtering.
        """
        suggestions = []
        
        # Extract keywords from description
        keywords = self._extract_keywords(description)
        
        # Build query
        query = {}
        
        # Filter by equipment type if provided
        if equipment_type_id:
            query["equipment_type_ids"] = equipment_type_id
        
        # Text search on keywords
        if keywords:
            query["$or"] = [
                {"failure_mode": {"$regex": "|".join(keywords), "$options": "i"}},
                {"keywords": {"$in": [k.lower() for k in keywords]}},
                {"mechanism": {"$regex": "|".join(keywords), "$options": "i"}},
            ]
        
        # Get potential matches
        cursor = self.failure_modes.find(query).sort("rpn", -1).limit(max_suggestions * 2)
        
        async for fm in cursor:
            # Calculate relevance score
            relevance = self._calculate_relevance(description, fm, keywords)
            
            suggestions.append({
                "id": str(fm["_id"]),
                "legacy_id": fm.get("legacy_id"),
                "failure_mode": fm["failure_mode"],
                "category": fm.get("category"),
                "equipment": fm.get("equipment"),
                "mechanism": fm.get("mechanism"),
                "rpn": fm.get("rpn"),
                "relevance_score": relevance,
                "keywords_matched": [k for k in keywords if k.lower() in fm.get("failure_mode", "").lower() or k.lower() in str(fm.get("keywords", [])).lower()]
            })
        
        # Sort by relevance and return top suggestions
        suggestions.sort(key=lambda x: x["relevance_score"], reverse=True)
        return suggestions[:max_suggestions]
    
    async def link_failure_mode_to_observation(
        self,
        obs_id: str,
        failure_mode_id: str,
        efm_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Link a failure mode to an observation (accept AI suggestion)."""
        if not ObjectId.is_valid(obs_id):
            return None
        
        # Get failure mode details
        fm = await self.failure_modes.find_one({"_id": ObjectId(failure_mode_id)})
        if not fm:
            return None
        
        update = {
            "failure_mode_id": failure_mode_id,
            "failure_mode_name": fm.get("failure_mode"),
            "updated_at": datetime.now(timezone.utc)
        }
        
        if efm_id:
            update["efm_id"] = efm_id
            await self._increment_efm_observation_count(efm_id)
        
        result = await self.observations.find_one_and_update(
            {"_id": ObjectId(obs_id)},
            {"$set": update},
            return_document=True
        )
        
        if result:
            return self._serialize_observation(result)
        return None
    
    # ==================== THREAT INTEGRATION ====================
    
    async def convert_threat_to_observation(
        self,
        threat_id: str
    ) -> Optional[Dict[str, Any]]:
        """Convert an existing threat to the new observation format."""
        threat = await self.threats.find_one({"id": threat_id})
        if not threat:
            return None
        
        # Check if already converted
        existing = await self.observations.find_one({"threat_id": threat_id})
        if existing:
            return self._serialize_observation(existing)
        
        # Convert threat to observation
        obs_doc = {
            "threat_id": threat_id,  # Link back to original threat
            "equipment_id": threat.get("linked_equipment_id"),
            "equipment_name": threat.get("asset"),
            "efm_id": None,
            "failure_mode_id": None,
            "failure_mode_name": threat.get("failure_mode"),
            "description": threat.get("description"),
            "severity": self._map_risk_to_severity(threat.get("risk_score", 50)),
            "observation_type": "failure",
            "media_urls": [threat.get("image_url")] if threat.get("image_url") else [],
            "source": "chat",
            "status": "open" if threat.get("status") != "Closed" else "closed",
            "suggested_failure_modes": [],
            "linked_action_ids": [],
            "created_by": threat.get("created_by"),
            "created_at": datetime.fromisoformat(threat["created_at"]) if isinstance(threat.get("created_at"), str) else threat.get("created_at"),
            "updated_at": datetime.now(timezone.utc),
        }
        
        result = await self.observations.insert_one(obs_doc)
        obs_doc["_id"] = result.inserted_id
        
        # Update threat with observation link
        await self.threats.update_one(
            {"id": threat_id},
            {"$set": {"observation_id": str(result.inserted_id)}}
        )
        
        return self._serialize_observation(obs_doc)
    
    async def get_observations_from_threats(
        self,
        user_id: str,
        include_converted: bool = True,
        skip: int = 0,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get observations combining both sources (observations + threats)."""
        
        # Get structured observations
        obs_cursor = self.observations.find(
            {"created_by": user_id}
        ).sort("created_at", -1).skip(skip).limit(limit)
        
        observations = []
        async for doc in obs_cursor:
            observations.append(self._serialize_observation(doc))
        
        # Get threats not yet converted
        if include_converted:
            converted_threat_ids = await self.observations.distinct(
                "threat_id",
                {"threat_id": {"$exists": True, "$ne": None}}
            )
            
            threat_query = {"created_by": user_id}
            if converted_threat_ids:
                threat_query["id"] = {"$nin": converted_threat_ids}
            
            threats_cursor = self.threats.find(threat_query).sort("created_at", -1).limit(limit)
            
            async for threat in threats_cursor:
                observations.append(self._serialize_threat_as_observation(threat))
        
        # Sort by created_at
        observations.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        return {
            "total": len(observations),
            "observations": observations[:limit]
        }
    
    # ==================== ANALYTICS ====================
    
    async def get_observation_trends(
        self,
        equipment_id: Optional[str] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get observation trends over time."""
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        query = {"created_at": {"$gte": start_date}}
        if equipment_id:
            query["equipment_id"] = equipment_id
        
        # Daily counts
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                },
                "count": {"$sum": 1},
                "critical": {"$sum": {"$cond": [{"$eq": ["$severity", "critical"]}, 1, 0]}},
                "warning": {"$sum": {"$cond": [{"$eq": ["$severity", "warning"]}, 1, 0]}},
            }},
            {"$sort": {"_id": 1}}
        ]
        
        daily_counts = []
        async for doc in self.observations.aggregate(pipeline):
            daily_counts.append({
                "date": doc["_id"],
                "count": doc["count"],
                "critical": doc["critical"],
                "warning": doc["warning"]
            })
        
        # By severity
        severity_pipeline = [
            {"$match": query},
            {"$group": {"_id": "$severity", "count": {"$sum": 1}}}
        ]
        
        by_severity = {}
        async for doc in self.observations.aggregate(severity_pipeline):
            by_severity[doc["_id"] or "unknown"] = doc["count"]
        
        # By failure mode
        fm_pipeline = [
            {"$match": {**query, "failure_mode_name": {"$exists": True, "$ne": None}}},
            {"$group": {"_id": "$failure_mode_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        
        top_failure_modes = []
        async for doc in self.observations.aggregate(fm_pipeline):
            top_failure_modes.append({
                "failure_mode": doc["_id"],
                "count": doc["count"]
            })
        
        # By equipment
        equip_pipeline = [
            {"$match": {**query, "equipment_name": {"$exists": True, "$ne": None}}},
            {"$group": {"_id": "$equipment_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        
        top_equipment = []
        async for doc in self.observations.aggregate(equip_pipeline):
            top_equipment.append({
                "equipment": doc["_id"],
                "count": doc["count"]
            })
        
        total = await self.observations.count_documents(query)
        
        return {
            "period_days": days,
            "total_observations": total,
            "daily_counts": daily_counts,
            "by_severity": by_severity,
            "top_failure_modes": top_failure_modes,
            "top_equipment": top_equipment
        }
    
    async def get_unlinked_observations(
        self,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get observations that don't have a failure mode linked (need AI suggestion)."""
        
        query = {
            "created_by": user_id,
            "failure_mode_id": None,
            "status": {"$ne": "closed"}
        }
        
        cursor = self.observations.find(query).sort("created_at", -1).limit(limit)
        
        results = []
        async for doc in cursor:
            obs = self._serialize_observation(doc)
            # Get AI suggestions
            suggestions = await self.suggest_failure_modes(
                doc.get("description", ""),
                equipment_id=doc.get("equipment_id"),
                max_suggestions=3
            )
            obs["ai_suggestions"] = suggestions
            results.append(obs)
        
        return results
    
    # ==================== HELPERS ====================
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract relevant keywords from text for failure mode matching."""
        # Common failure-related terms
        failure_terms = [
            "leak", "vibration", "temperature", "noise", "wear", "crack",
            "corrosion", "fouling", "blockage", "failure", "damage", "broken",
            "overheating", "cavitation", "erosion", "fatigue", "seal", "bearing",
            "pump", "valve", "motor", "compressor", "exchanger", "vessel",
            "high", "low", "abnormal", "excessive", "unusual"
        ]
        
        # Tokenize and filter
        words = re.findall(r'\b\w+\b', text.lower())
        
        # Keep failure-related terms and longer words
        keywords = []
        for word in words:
            if word in failure_terms or len(word) > 4:
                if word not in ["about", "after", "before", "because", "could", "would", "should", "there", "their", "which", "where", "while"]:
                    keywords.append(word)
        
        return list(set(keywords))[:10]  # Limit to top 10 unique keywords
    
    def _calculate_relevance(
        self,
        description: str,
        failure_mode: Dict,
        keywords: List[str]
    ) -> float:
        """Calculate relevance score for a failure mode match."""
        score = 0.0
        desc_lower = description.lower()
        fm_name = failure_mode.get("failure_mode", "").lower()
        fm_keywords = [k.lower() for k in failure_mode.get("keywords", [])]
        
        # Exact failure mode name match
        if fm_name in desc_lower:
            score += 50
        
        # Keyword matches
        for kw in keywords:
            kw_lower = kw.lower()
            if kw_lower in fm_name:
                score += 20
            if kw_lower in fm_keywords:
                score += 15
            if kw_lower in failure_mode.get("mechanism", "").lower():
                score += 10
        
        # RPN boost (higher RPN = more likely to be significant)
        rpn = failure_mode.get("rpn", 100)
        score += min(rpn / 50, 10)  # Max 10 points from RPN
        
        return min(score, 100)  # Cap at 100
    
    def _map_risk_to_severity(self, risk_score: int) -> str:
        """Map risk score to severity level."""
        if risk_score >= 75:
            return "critical"
        elif risk_score >= 50:
            return "high"
        elif risk_score >= 25:
            return "medium"
        else:
            return "low"
    
    async def _increment_efm_observation_count(self, efm_id: str):
        """Increment observation count on linked EFM."""
        if ObjectId.is_valid(efm_id):
            await self.efms.update_one(
                {"_id": ObjectId(efm_id)},
                {
                    "$inc": {"observations_count": 1},
                    "$set": {"last_observation_at": datetime.now(timezone.utc)}
                }
            )
    
    def _serialize_observation(self, doc: Dict) -> Dict[str, Any]:
        """Serialize observation document."""
        created_at = doc.get("created_at")
        if isinstance(created_at, str):
            created_at_str = created_at
        elif created_at:
            created_at_str = created_at.isoformat()
        else:
            created_at_str = None
            
        return {
            "id": str(doc["_id"]),
            "threat_id": doc.get("threat_id"),
            "equipment_id": doc.get("equipment_id"),
            "equipment_name": doc.get("equipment_name"),
            "efm_id": doc.get("efm_id"),
            "task_id": doc.get("task_id"),
            "form_submission_id": doc.get("form_submission_id"),
            "failure_mode_id": doc.get("failure_mode_id"),
            "failure_mode_name": doc.get("failure_mode_name"),
            "description": doc.get("description"),
            "severity": doc.get("severity", "medium"),
            "observation_type": doc.get("observation_type", "general"),
            "media_urls": doc.get("media_urls", []),
            "measured_values": doc.get("measured_values", []),
            "location": doc.get("location"),
            "tags": doc.get("tags", []),
            "source": doc.get("source", "manual"),
            "status": doc.get("status", "open"),
            "suggested_failure_modes": doc.get("suggested_failure_modes", []),
            "linked_action_ids": doc.get("linked_action_ids", []),
            "resolution_notes": doc.get("resolution_notes"),
            "created_by": doc.get("created_by"),
            "created_at": created_at_str,
            "closed_at": doc.get("closed_at").isoformat() if doc.get("closed_at") else None,
        }
    
    def _serialize_threat_as_observation(self, threat: Dict) -> Dict[str, Any]:
        """Serialize a threat in observation format."""
        created_at = threat.get("created_at")
        if isinstance(created_at, str):
            created_at_str = created_at
        elif created_at:
            created_at_str = created_at.isoformat()
        else:
            created_at_str = None
            
        return {
            "id": f"threat_{threat.get('id')}",
            "threat_id": threat.get("id"),
            "equipment_id": threat.get("linked_equipment_id"),
            "equipment_name": threat.get("asset"),
            "efm_id": None,
            "failure_mode_id": None,
            "failure_mode_name": threat.get("failure_mode"),
            "description": threat.get("description"),
            "severity": self._map_risk_to_severity(threat.get("risk_score", 50)),
            "observation_type": "failure",
            "media_urls": [threat.get("image_url")] if threat.get("image_url") else [],
            "measured_values": [],
            "location": None,
            "tags": [],
            "source": "chat",
            "status": "open" if threat.get("status") != "Closed" else "closed",
            "suggested_failure_modes": [],
            "linked_action_ids": [],
            "resolution_notes": None,
            "created_by": threat.get("created_by"),
            "created_at": created_at_str,
            "closed_at": None,
            "is_legacy_threat": True  # Flag to identify unconverted threats
        }
