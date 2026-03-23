"""
Equipment Failure Mode (EFM) Service - Instance-level failure modes per equipment.

This implements the EFM layer from the functional spec:
- Auto-generated when equipment is created/linked to an equipment type
- Per-asset likelihood/detectability overrides
- Active/inactive flags for each failure mode
- Links equipment to specific failure modes from the library

Schema:
{
    "_id": ObjectId,
    "equipment_id": str,          # Reference to equipment hierarchy node
    "equipment_name": str,        # Denormalized for quick lookup
    "equipment_type_id": str,     # Equipment type (e.g., "pump_centrifugal")
    "failure_mode_id": str,       # Reference to failure_modes collection
    "failure_mode_name": str,     # Denormalized
    "likelihood": int,            # 1-10 (can override template)
    "detectability": int,         # 1-10 (can override template)
    "severity": int,              # 1-10 (usually inherited, rarely overridden)
    "is_active": bool,            # Whether this EFM is active for this equipment
    "is_override": bool,          # True if values differ from template
    "override_reason": str,       # Why values were overridden
    "template_likelihood": int,   # Original value from failure mode library
    "template_detectability": int,
    "template_severity": int,
    "observations_count": int,    # Number of observations linked to this EFM
    "last_observation_at": datetime,
    "created_at": datetime,
    "updated_at": datetime,
}
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


class EFMService:
    """Service for Equipment Failure Mode operations."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["equipment_failure_modes"]
        self.equipment_collection = db["equipment_hierarchy"]
        self.failure_modes_collection = db["failure_modes"]
    
    # ============== AUTO-GENERATION ==============
    
    async def generate_efms_for_equipment(
        self,
        equipment_id: str,
        equipment_name: str,
        equipment_type_id: str
    ) -> List[Dict[str, Any]]:
        """
        Auto-generate EFMs for an equipment based on its equipment type.
        Called when equipment is created or equipment_type is changed.
        """
        
        # Get all failure modes linked to this equipment type
        failure_modes = await self.failure_modes_collection.find({
            "equipment_type_ids": equipment_type_id
        }).to_list(500)
        
        if not failure_modes:
            logger.info(f"No failure modes found for equipment type: {equipment_type_id}")
            return []
        
        # Check which EFMs already exist for this equipment
        existing = await self.collection.find({
            "equipment_id": equipment_id
        }, {"failure_mode_id": 1}).to_list(500)
        existing_fm_ids = {e["failure_mode_id"] for e in existing}
        
        # Create new EFMs for failure modes not yet linked
        now = datetime.now(timezone.utc)
        new_efms = []
        
        for fm in failure_modes:
            fm_id = str(fm["_id"])
            if fm_id in existing_fm_ids:
                continue  # Already exists
            
            efm = {
                "equipment_id": equipment_id,
                "equipment_name": equipment_name,
                "equipment_type_id": equipment_type_id,
                "failure_mode_id": fm_id,
                "failure_mode_name": fm["failure_mode"],
                "failure_mode_legacy_id": fm.get("legacy_id"),
                "category": fm.get("category"),
                # Initial values from template
                "likelihood": fm["occurrence"],
                "detectability": fm["detectability"],
                "severity": fm["severity"],
                # Template values for reference
                "template_likelihood": fm["occurrence"],
                "template_detectability": fm["detectability"],
                "template_severity": fm["severity"],
                # Flags
                "is_active": True,
                "is_override": False,
                "override_reason": None,
                # Stats
                "observations_count": 0,
                "last_observation_at": None,
                # Metadata
                "created_at": now,
                "updated_at": now,
            }
            new_efms.append(efm)
        
        if new_efms:
            result = await self.collection.insert_many(new_efms)
            logger.info(f"Generated {len(result.inserted_ids)} EFMs for equipment {equipment_id}")
            
            # Add _id to each efm for return
            for i, efm in enumerate(new_efms):
                efm["_id"] = result.inserted_ids[i]
        
        return [self._serialize(efm) for efm in new_efms]
    
    async def sync_efms_for_equipment(
        self,
        equipment_id: str,
        equipment_name: str,
        new_equipment_type_id: str,
        old_equipment_type_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sync EFMs when equipment type changes.
        - Deactivates EFMs no longer relevant
        - Generates new EFMs for new equipment type
        """
        result = {
            "deactivated": 0,
            "generated": 0,
            "reactivated": 0
        }
        
        # If equipment type changed, handle the transition
        if old_equipment_type_id and old_equipment_type_id != new_equipment_type_id:
            # Deactivate EFMs from old equipment type (don't delete - keep history)
            deactivate_result = await self.collection.update_many(
                {
                    "equipment_id": equipment_id,
                    "equipment_type_id": old_equipment_type_id
                },
                {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
            )
            result["deactivated"] = deactivate_result.modified_count
        
        # Check if any existing EFMs for the new type can be reactivated
        reactivate_result = await self.collection.update_many(
            {
                "equipment_id": equipment_id,
                "equipment_type_id": new_equipment_type_id,
                "is_active": False
            },
            {"$set": {"is_active": True, "updated_at": datetime.now(timezone.utc)}}
        )
        result["reactivated"] = reactivate_result.modified_count
        
        # Generate new EFMs for the new equipment type
        new_efms = await self.generate_efms_for_equipment(
            equipment_id, equipment_name, new_equipment_type_id
        )
        result["generated"] = len(new_efms)
        
        return result
    
    # ============== READ OPERATIONS ==============
    
    async def get_efms_for_equipment(
        self,
        equipment_id: str,
        active_only: bool = True,
        category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all EFMs for a specific equipment."""
        
        query = {"equipment_id": equipment_id}
        if active_only:
            query["is_active"] = True
        if category:
            query["category"] = category
        
        cursor = self.collection.find(query).sort([
            ("severity", -1),
            ("likelihood", -1)
        ])
        
        results = []
        async for doc in cursor:
            results.append(self._serialize(doc))
        
        return results
    
    async def get_efm_by_id(self, efm_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific EFM by ID."""
        
        if not ObjectId.is_valid(efm_id):
            return None
        
        doc = await self.collection.find_one({"_id": ObjectId(efm_id)})
        if doc:
            return self._serialize(doc)
        return None
    
    async def get_high_risk_efms(
        self,
        equipment_id: Optional[str] = None,
        min_rpn: int = 150
    ) -> List[Dict[str, Any]]:
        """Get EFMs with high RPN values."""
        
        # Build aggregation pipeline to calculate RPN
        pipeline = [
            {"$match": {"is_active": True}},
            {"$addFields": {
                "rpn": {"$multiply": ["$severity", "$likelihood", "$detectability"]}
            }},
            {"$match": {"rpn": {"$gte": min_rpn}}},
            {"$sort": {"rpn": -1}},
            {"$limit": 100}
        ]
        
        if equipment_id:
            pipeline[0]["$match"]["equipment_id"] = equipment_id
        
        results = []
        async for doc in self.collection.aggregate(pipeline):
            results.append(self._serialize(doc))
        
        return results
    
    async def get_efm_summary_for_equipment(self, equipment_id: str) -> Dict[str, Any]:
        """Get summary statistics for an equipment's EFMs."""
        
        pipeline = [
            {"$match": {"equipment_id": equipment_id, "is_active": True}},
            {"$addFields": {
                "rpn": {"$multiply": ["$severity", "$likelihood", "$detectability"]}
            }},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "with_overrides": {"$sum": {"$cond": ["$is_override", 1, 0]}},
                "avg_rpn": {"$avg": "$rpn"},
                "max_rpn": {"$max": "$rpn"},
                "total_observations": {"$sum": "$observations_count"},
                "categories": {"$addToSet": "$category"}
            }}
        ]
        
        result = await self.collection.aggregate(pipeline).to_list(1)
        
        if result:
            return {
                "total_efms": result[0]["total"],
                "with_overrides": result[0]["with_overrides"],
                "avg_rpn": round(result[0]["avg_rpn"], 1) if result[0]["avg_rpn"] else 0,
                "max_rpn": result[0]["max_rpn"] or 0,
                "total_observations": result[0]["total_observations"],
                "categories": result[0]["categories"]
            }
        
        return {
            "total_efms": 0,
            "with_overrides": 0,
            "avg_rpn": 0,
            "max_rpn": 0,
            "total_observations": 0,
            "categories": []
        }
    
    # ============== WRITE OPERATIONS ==============
    
    async def update_efm(
        self,
        efm_id: str,
        likelihood: Optional[int] = None,
        detectability: Optional[int] = None,
        severity: Optional[int] = None,
        is_active: Optional[bool] = None,
        override_reason: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Update an EFM's values (override from template)."""
        
        if not ObjectId.is_valid(efm_id):
            return None
        
        # Get current EFM
        existing = await self.collection.find_one({"_id": ObjectId(efm_id)})
        if not existing:
            return None
        
        update = {"updated_at": datetime.now(timezone.utc)}
        
        # Check if values differ from template
        new_likelihood = likelihood if likelihood is not None else existing["likelihood"]
        new_detectability = detectability if detectability is not None else existing["detectability"]
        new_severity = severity if severity is not None else existing["severity"]
        
        is_override = (
            new_likelihood != existing["template_likelihood"] or
            new_detectability != existing["template_detectability"] or
            new_severity != existing["template_severity"]
        )
        
        if likelihood is not None:
            update["likelihood"] = likelihood
        if detectability is not None:
            update["detectability"] = detectability
        if severity is not None:
            update["severity"] = severity
        if is_active is not None:
            update["is_active"] = is_active
        if override_reason is not None:
            update["override_reason"] = override_reason
        
        update["is_override"] = is_override
        
        result = await self.collection.find_one_and_update(
            {"_id": ObjectId(efm_id)},
            {"$set": update},
            return_document=True
        )
        
        if result:
            return self._serialize(result)
        return None
    
    async def reset_efm_to_template(self, efm_id: str) -> Optional[Dict[str, Any]]:
        """Reset an EFM's values back to the template defaults."""
        
        if not ObjectId.is_valid(efm_id):
            return None
        
        existing = await self.collection.find_one({"_id": ObjectId(efm_id)})
        if not existing:
            return None
        
        result = await self.collection.find_one_and_update(
            {"_id": ObjectId(efm_id)},
            {"$set": {
                "likelihood": existing["template_likelihood"],
                "detectability": existing["template_detectability"],
                "severity": existing["template_severity"],
                "is_override": False,
                "override_reason": None,
                "updated_at": datetime.now(timezone.utc)
            }},
            return_document=True
        )
        
        if result:
            return self._serialize(result)
        return None
    
    async def increment_observation_count(
        self,
        efm_id: str
    ) -> bool:
        """Increment observation count when an observation is linked."""
        
        if not ObjectId.is_valid(efm_id):
            return False
        
        result = await self.collection.update_one(
            {"_id": ObjectId(efm_id)},
            {
                "$inc": {"observations_count": 1},
                "$set": {"last_observation_at": datetime.now(timezone.utc)}
            }
        )
        
        return result.modified_count > 0
    
    async def delete_efms_for_equipment(self, equipment_id: str) -> int:
        """Delete all EFMs for an equipment (when equipment is deleted)."""
        
        result = await self.collection.delete_many({"equipment_id": equipment_id})
        return result.deleted_count
    
    # ============== BULK OPERATIONS ==============
    
    async def propagate_template_change(
        self,
        failure_mode_id: str,
        new_severity: Optional[int] = None,
        new_occurrence: Optional[int] = None,
        new_detectability: Optional[int] = None
    ) -> int:
        """
        Update template values in EFMs when the source failure mode changes.
        Only updates non-overridden EFMs.
        """
        
        update = {"updated_at": datetime.now(timezone.utc)}
        
        if new_severity is not None:
            update["template_severity"] = new_severity
        if new_occurrence is not None:
            update["template_likelihood"] = new_occurrence
        if new_detectability is not None:
            update["template_detectability"] = new_detectability
        
        # Update template values in all EFMs
        await self.collection.update_many(
            {"failure_mode_id": failure_mode_id},
            {"$set": update}
        )
        
        # Also update actual values for non-overridden EFMs
        actual_update = {"updated_at": datetime.now(timezone.utc)}
        if new_severity is not None:
            actual_update["severity"] = new_severity
        if new_occurrence is not None:
            actual_update["likelihood"] = new_occurrence
        if new_detectability is not None:
            actual_update["detectability"] = new_detectability
        
        result = await self.collection.update_many(
            {"failure_mode_id": failure_mode_id, "is_override": False},
            {"$set": actual_update}
        )
        
        return result.modified_count
    
    # ============== RISK CALCULATIONS ==============
    
    async def calculate_equipment_risk(self, equipment_id: str) -> Dict[str, Any]:
        """
        Calculate aggregated risk metrics for an equipment based on its EFMs.
        """
        
        pipeline = [
            {"$match": {"equipment_id": equipment_id, "is_active": True}},
            {"$addFields": {
                "rpn": {"$multiply": ["$severity", "$likelihood", "$detectability"]}
            }},
            {"$group": {
                "_id": None,
                "max_rpn": {"$max": "$rpn"},
                "avg_rpn": {"$avg": "$rpn"},
                "total_efms": {"$sum": 1},
                "high_risk_count": {
                    "$sum": {"$cond": [{"$gte": ["$rpn", 200]}, 1, 0]}
                },
                "medium_risk_count": {
                    "$sum": {"$cond": [
                        {"$and": [{"$gte": ["$rpn", 100]}, {"$lt": ["$rpn", 200]}]},
                        1, 0
                    ]}
                }
            }}
        ]
        
        result = await self.collection.aggregate(pipeline).to_list(1)
        
        if result:
            r = result[0]
            return {
                "equipment_id": equipment_id,
                "max_rpn": r["max_rpn"] or 0,
                "avg_rpn": round(r["avg_rpn"], 1) if r["avg_rpn"] else 0,
                "total_efms": r["total_efms"],
                "high_risk_count": r["high_risk_count"],
                "medium_risk_count": r["medium_risk_count"],
                "risk_level": self._get_risk_level(r["max_rpn"] or 0)
            }
        
        return {
            "equipment_id": equipment_id,
            "max_rpn": 0,
            "avg_rpn": 0,
            "total_efms": 0,
            "high_risk_count": 0,
            "medium_risk_count": 0,
            "risk_level": "low"
        }
    
    def _get_risk_level(self, rpn: int) -> str:
        """Determine risk level from RPN."""
        if rpn >= 200:
            return "critical"
        elif rpn >= 150:
            return "high"
        elif rpn >= 100:
            return "medium"
        else:
            return "low"
    
    # ============== HELPERS ==============
    
    def _serialize(self, doc: Dict) -> Dict[str, Any]:
        """Convert MongoDB document to API response format."""
        
        rpn = doc.get("severity", 1) * doc.get("likelihood", 1) * doc.get("detectability", 1)
        
        return {
            "id": str(doc["_id"]),
            "equipment_id": doc["equipment_id"],
            "equipment_name": doc.get("equipment_name"),
            "equipment_type_id": doc.get("equipment_type_id"),
            "failure_mode_id": doc["failure_mode_id"],
            "failure_mode_name": doc.get("failure_mode_name"),
            "failure_mode_legacy_id": doc.get("failure_mode_legacy_id"),
            "category": doc.get("category"),
            "likelihood": doc.get("likelihood", 5),
            "detectability": doc.get("detectability", 5),
            "severity": doc.get("severity", 5),
            "rpn": rpn,
            "template_likelihood": doc.get("template_likelihood"),
            "template_detectability": doc.get("template_detectability"),
            "template_severity": doc.get("template_severity"),
            "is_active": doc.get("is_active", True),
            "is_override": doc.get("is_override", False),
            "override_reason": doc.get("override_reason"),
            "observations_count": doc.get("observations_count", 0),
            "last_observation_at": doc.get("last_observation_at").isoformat() if doc.get("last_observation_at") else None,
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
            "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None,
            "risk_level": self._get_risk_level(rpn)
        }
