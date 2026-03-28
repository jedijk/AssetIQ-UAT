"""
Failure Modes Service - MongoDB-backed failure mode operations.

This replaces the static FAILURE_MODES_LIBRARY with persistent MongoDB storage.
Includes versioning support for tracking changes and rollback capability.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


class FailureModesService:
    """Service class for failure mode operations using MongoDB."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["failure_modes"]
        self.versions_collection = db["failure_mode_versions"]
    
    # ============== READ OPERATIONS ==============
    
    async def get_all(
        self,
        category: Optional[str] = None,
        equipment: Optional[str] = None,
        search: Optional[str] = None,
        min_rpn: Optional[int] = None,
        equipment_type_id: Optional[str] = None,
        mechanism: Optional[str] = None,
        is_validated: Optional[bool] = None,
        skip: int = 0,
        limit: int = 500
    ) -> Dict[str, Any]:
        """Get failure modes with optional filters."""
        
        # Build query
        query = {}
        
        if category and category.lower() != "all":
            query["category"] = {"$regex": f"^{category}$", "$options": "i"}
        
        if equipment:
            query["equipment"] = {"$regex": f"^{equipment}$", "$options": "i"}
        
        if min_rpn:
            query["rpn"] = {"$gte": min_rpn}
        
        if equipment_type_id:
            query["equipment_type_ids"] = equipment_type_id
        
        if mechanism:
            query["mechanism"] = {"$regex": mechanism, "$options": "i"}
        
        if is_validated is not None:
            query["is_validated"] = is_validated
        
        # Text search across multiple fields
        if search:
            search_regex = {"$regex": search, "$options": "i"}
            query["$or"] = [
                {"failure_mode": search_regex},
                {"equipment": search_regex},
                {"category": search_regex},
                {"keywords": search_regex},
                {"recommended_actions": search_regex},
                {"mechanism": search_regex},
            ]
        
        # Execute query
        cursor = self.collection.find(query).sort("rpn", -1).skip(skip).limit(limit)
        
        failure_modes = []
        async for doc in cursor:
            failure_modes.append(self._serialize(doc))
        
        total = await self.collection.count_documents(query)
        
        return {
            "total": total,
            "failure_modes": failure_modes
        }
    
    async def get_by_id(self, mode_id: str) -> Optional[Dict[str, Any]]:
        """Get a failure mode by MongoDB _id or legacy_id."""
        
        # Try ObjectId first
        if ObjectId.is_valid(mode_id):
            doc = await self.collection.find_one({"_id": ObjectId(mode_id)})
            if doc:
                return self._serialize(doc)
        
        # Try legacy_id (integer)
        try:
            legacy_id = int(mode_id)
            doc = await self.collection.find_one({"legacy_id": legacy_id})
            if doc:
                return self._serialize(doc)
        except ValueError:
            pass
        
        return None
    
    async def get_by_legacy_id(self, legacy_id: int) -> Optional[Dict[str, Any]]:
        """Get a failure mode by its original legacy ID."""
        doc = await self.collection.find_one({"legacy_id": legacy_id})
        if doc:
            return self._serialize(doc)
        return None
    
    async def get_by_name(self, failure_mode_name: str) -> Optional[Dict[str, Any]]:
        """Get a failure mode by exact name match (case-insensitive)."""
        doc = await self.collection.find_one({
            "failure_mode": {"$regex": f"^{failure_mode_name}$", "$options": "i"}
        })
        if doc:
            return self._serialize(doc)
        return None
    
    # Alias for find_by_name for semantic clarity
    async def find_by_name(self, failure_mode_name: str) -> Optional[Dict[str, Any]]:
        """Alias for get_by_name - checks if a failure mode with this name exists."""
        return await self.get_by_name(failure_mode_name)
    
    async def search_by_keywords(self, keywords: List[str]) -> List[Dict[str, Any]]:
        """Find failure modes matching any of the provided keywords."""
        query = {
            "$or": [
                {"keywords": {"$in": [k.lower() for k in keywords]}},
                {"failure_mode": {"$regex": "|".join(keywords), "$options": "i"}},
            ]
        }
        
        cursor = self.collection.find(query).sort("rpn", -1)
        results = []
        async for doc in cursor:
            results.append(self._serialize(doc))
        return results
    
    async def get_categories(self) -> List[str]:
        """Get all unique categories."""
        categories = await self.collection.distinct("category")
        return sorted(categories)
    
    async def get_equipment_types(self) -> List[str]:
        """Get all unique equipment type IDs."""
        # Aggregate to unwind and get distinct values
        pipeline = [
            {"$unwind": "$equipment_type_ids"},
            {"$group": {"_id": "$equipment_type_ids"}},
            {"$sort": {"_id": 1}}
        ]
        
        types = []
        async for doc in self.collection.aggregate(pipeline):
            if doc["_id"]:
                types.append(doc["_id"])
        return types
    
    async def get_mechanisms(self) -> List[str]:
        """Get all unique ISO 14224 mechanisms."""
        mechanisms = await self.collection.distinct("mechanism")
        return sorted([m for m in mechanisms if m])
    
    async def get_high_risk(self, threshold: int = 150) -> List[Dict[str, Any]]:
        """Get failure modes with RPN above threshold."""
        cursor = self.collection.find({"rpn": {"$gte": threshold}}).sort("rpn", -1)
        
        results = []
        async for doc in cursor:
            fm = self._serialize(doc)
            fm["likelihood_score"] = min(100, fm["rpn"] // 10)
            results.append(fm)
        return results
    
    async def get_by_equipment_type(self, equipment_type_id: str) -> List[Dict[str, Any]]:
        """Get all failure modes linked to a specific equipment type."""
        cursor = self.collection.find({"equipment_type_ids": equipment_type_id}).sort("rpn", -1)
        
        results = []
        async for doc in cursor:
            results.append(self._serialize(doc))
        return results
    
    # ============== WRITE OPERATIONS ==============
    
    async def create(self, data: Dict[str, Any], created_by: Optional[str] = None) -> Dict[str, Any]:
        """Create a new failure mode."""
        now = datetime.now(timezone.utc)
        
        # Calculate RPN
        rpn = data["severity"] * data["occurrence"] * data["detectability"]
        
        # Get next legacy_id
        max_doc = await self.collection.find_one(sort=[("legacy_id", -1)])
        next_legacy_id = (max_doc.get("legacy_id", 0) if max_doc else 0) + 1
        
        doc = {
            "legacy_id": next_legacy_id,
            "category": data["category"],
            "equipment": data["equipment"],
            "failure_mode": data["failure_mode"],
            "keywords": data.get("keywords", []),
            "severity": data["severity"],
            "occurrence": data["occurrence"],
            "detectability": data["detectability"],
            "rpn": rpn,
            "recommended_actions": data.get("recommended_actions", []),
            "equipment_type_ids": data.get("equipment_type_ids", []),
            "mechanism": data.get("mechanism", "UNK - Unknown"),
            # New fields for failure mode enhancements
            "process": data.get("process"),
            "potential_effects": data.get("potential_effects"),
            "potential_causes": data.get("potential_causes"),
            "iso14224_mechanism": data.get("iso14224_mechanism"),
            "is_validated": False,
            "validated_by_name": None,
            "validated_by_position": None,
            "validated_at": None,
            "is_custom": True,
            "is_builtin": False,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        
        return self._serialize(doc)
    
    async def update(self, mode_id: str, data: Dict[str, Any], updated_by: Optional[str] = None, change_reason: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Update a failure mode with version history. Returns updated doc or None if not found."""
        
        # Find the document first
        query = self._build_id_query(mode_id)
        if not query:
            return None
        
        existing = await self.collection.find_one(query)
        if not existing:
            return None
        
        # Save current state as a version before updating
        await self._save_version(existing, updated_by, change_reason)
        
        # Build update
        update_fields = {"updated_at": datetime.now(timezone.utc)}
        
        # Track version number
        current_version = existing.get("version", 1)
        update_fields["version"] = current_version + 1
        
        # Update allowed fields
        allowed_fields = [
            "category", "equipment", "failure_mode", "keywords",
            "severity", "occurrence", "detectability",
            "recommended_actions", "equipment_type_ids", "mechanism",
            # New fields for failure mode enhancements
            "process", "potential_effects", "potential_causes", "iso14224_mechanism"
        ]
        
        for field in allowed_fields:
            if field in data and data[field] is not None:
                update_fields[field] = data[field]
        
        # Recalculate RPN if FMEA scores changed
        severity = data.get("severity", existing["severity"])
        occurrence = data.get("occurrence", existing["occurrence"])
        detectability = data.get("detectability", existing["detectability"])
        update_fields["rpn"] = severity * occurrence * detectability
        
        # Check if FMEA scores changed (for propagation)
        fmea_changed = (
            data.get("severity") is not None or
            data.get("occurrence") is not None or
            data.get("detectability") is not None
        )
        
        # Perform update
        result = await self.collection.find_one_and_update(
            query,
            {"$set": update_fields},
            return_document=True
        )
        
        if result:
            serialized = self._serialize(result)
            serialized["fmea_changed"] = fmea_changed
            serialized["old_failure_mode_name"] = existing["failure_mode"]
            return serialized
        
        return None
    
    async def _save_version(self, doc: Dict[str, Any], updated_by: Optional[str] = None, change_reason: Optional[str] = None) -> None:
        """Save a version snapshot of the failure mode."""
        
        # Get the failure mode ID (could be ObjectId or legacy_id)
        fm_id = str(doc["_id"])
        
        # Build version document
        version_doc = {
            "failure_mode_id": fm_id,
            "version": doc.get("version", 1),
            "snapshot": {
                "category": doc.get("category"),
                "equipment": doc.get("equipment"),
                "failure_mode": doc.get("failure_mode"),
                "keywords": doc.get("keywords", []),
                "severity": doc.get("severity"),
                "occurrence": doc.get("occurrence"),
                "detectability": doc.get("detectability"),
                "rpn": doc.get("rpn"),
                "recommended_actions": doc.get("recommended_actions", []),
                "equipment_type_ids": doc.get("equipment_type_ids", []),
                "mechanism": doc.get("mechanism"),
                "is_validated": doc.get("is_validated", False),
                "validated_by_name": doc.get("validated_by_name"),
                "validated_by_position": doc.get("validated_by_position"),
                "validated_by_id": doc.get("validated_by_id"),
                "validated_at": doc.get("validated_at"),
            },
            "updated_by": updated_by,
            "change_reason": change_reason,
            "created_at": datetime.now(timezone.utc),
        }
        
        await self.versions_collection.insert_one(version_doc)
    
    async def get_versions(self, mode_id: str) -> List[Dict[str, Any]]:
        """Get version history for a failure mode."""
        
        # Get current document to find the correct ID format
        query = self._build_id_query(mode_id)
        if not query:
            return []
        
        existing = await self.collection.find_one(query)
        if not existing:
            return []
        
        fm_id = str(existing["_id"])
        
        # Fetch all versions sorted by version number descending
        cursor = self.versions_collection.find(
            {"failure_mode_id": fm_id}
        ).sort("version", -1)
        
        versions = []
        async for doc in cursor:
            versions.append({
                "id": str(doc["_id"]),
                "version": doc["version"],
                "snapshot": doc["snapshot"],
                "updated_by": doc.get("updated_by"),
                "change_reason": doc.get("change_reason"),
                "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
            })
        
        return versions
    
    async def rollback_to_version(self, mode_id: str, version_id: str, rolled_back_by: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Rollback a failure mode to a specific version."""
        
        # Find the version
        if not ObjectId.is_valid(version_id):
            return None
        
        version_doc = await self.versions_collection.find_one({"_id": ObjectId(version_id)})
        if not version_doc:
            return None
        
        snapshot = version_doc.get("snapshot", {})
        if not snapshot:
            return None
        
        # Find the current document
        query = self._build_id_query(mode_id)
        if not query:
            return None
        
        existing = await self.collection.find_one(query)
        if not existing:
            return None
        
        # Save current state before rollback
        await self._save_version(
            existing, 
            rolled_back_by, 
            f"Before rollback to version {version_doc.get('version', '?')}"
        )
        
        # Build rollback update
        rollback_fields = {
            "category": snapshot.get("category"),
            "equipment": snapshot.get("equipment"),
            "failure_mode": snapshot.get("failure_mode"),
            "keywords": snapshot.get("keywords", []),
            "severity": snapshot.get("severity"),
            "occurrence": snapshot.get("occurrence"),
            "detectability": snapshot.get("detectability"),
            "rpn": snapshot.get("rpn"),
            "recommended_actions": snapshot.get("recommended_actions", []),
            "equipment_type_ids": snapshot.get("equipment_type_ids", []),
            "mechanism": snapshot.get("mechanism"),
            "updated_at": datetime.now(timezone.utc),
            "version": existing.get("version", 1) + 1,
            "rolled_back_from_version": version_doc.get("version"),
        }
        
        # Perform rollback
        result = await self.collection.find_one_and_update(
            query,
            {"$set": rollback_fields},
            return_document=True
        )
        
        if result:
            return self._serialize(result)
        
        return None
    
    async def validate(
        self,
        mode_id: str,
        validated_by_name: str,
        validated_by_position: str,
        validated_by_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """Mark a failure mode as validated."""
        
        query = self._build_id_query(mode_id)
        if not query:
            return None
        
        update = {
            "$set": {
                "is_validated": True,
                "validated_by_name": validated_by_name,
                "validated_by_position": validated_by_position,
                "validated_by_id": validated_by_id,
                "validated_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        }
        
        result = await self.collection.find_one_and_update(
            query, update, return_document=True
        )
        
        if result:
            return self._serialize(result)
        return None
    
    async def unvalidate(self, mode_id: str) -> Optional[Dict[str, Any]]:
        """Remove validation from a failure mode."""
        
        query = self._build_id_query(mode_id)
        if not query:
            return None
        
        update = {
            "$set": {
                "is_validated": False,
                "validated_by_name": None,
                "validated_by_position": None,
                "validated_at": None,
                "updated_at": datetime.now(timezone.utc),
            }
        }
        
        result = await self.collection.find_one_and_update(
            query, update, return_document=True
        )
        
        if result:
            return self._serialize(result)
        return None
    
    async def delete(self, mode_id: str) -> bool:
        """Delete a failure mode. Any failure mode can be deleted."""
        
        query = self._build_id_query(mode_id)
        if not query:
            return False
        
        # Check if exists
        existing = await self.collection.find_one(query)
        if not existing:
            return False
        
        # Save version before deleting (for potential recovery via undo)
        await self._save_version(existing, updated_by="System", change_reason="Deleted")
        
        result = await self.collection.delete_one(query)
        return result.deleted_count > 0
    
    # ============== HELPER METHODS ==============
    
    def _build_id_query(self, mode_id: str) -> Optional[Dict]:
        """Build a query dict for finding by _id or legacy_id."""
        
        # Try ObjectId
        if ObjectId.is_valid(mode_id):
            return {"_id": ObjectId(mode_id)}
        
        # Try legacy_id
        try:
            return {"legacy_id": int(mode_id)}
        except ValueError:
            return None
    
    def _serialize(self, doc: Dict) -> Dict[str, Any]:
        """Convert MongoDB document to API response format."""
        
        result = {
            "id": str(doc["_id"]),
            "legacy_id": doc.get("legacy_id"),
            "category": doc["category"],
            "equipment": doc["equipment"],
            "failure_mode": doc["failure_mode"],
            "keywords": doc.get("keywords", []),
            "severity": doc["severity"],
            "occurrence": doc["occurrence"],
            "detectability": doc["detectability"],
            "rpn": doc["rpn"],
            "recommended_actions": doc.get("recommended_actions", []),
            "equipment_type_ids": doc.get("equipment_type_ids", []),
            "mechanism": doc.get("mechanism", "UNK - Unknown"),
            # New fields for failure mode enhancements
            "process": doc.get("process"),
            "potential_effects": doc.get("potential_effects"),
            "potential_causes": doc.get("potential_causes"),
            "iso14224_mechanism": doc.get("iso14224_mechanism"),
            "is_validated": doc.get("is_validated", False),
            "validated_by_name": doc.get("validated_by_name"),
            "validated_by_position": doc.get("validated_by_position"),
            "validated_by_id": doc.get("validated_by_id"),
            "validated_at": doc.get("validated_at").isoformat() if doc.get("validated_at") else None,
            "is_custom": doc.get("is_custom", False),
            "is_builtin": doc.get("is_builtin", True),
            "version": doc.get("version", 1),
            "rolled_back_from_version": doc.get("rolled_back_from_version"),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
            "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None,
        }
        
        return result


# ============== UTILITY FUNCTIONS (for backward compatibility) ==============

async def find_matching_failure_modes_db(db: AsyncIOMotorDatabase, text: str) -> List[Dict]:
    """
    Find failure modes matching text (for AI/chat integration).
    Searches keywords, failure mode names, and equipment.
    """
    service = FailureModesService(db)
    
    # Extract potential keywords from text
    words = text.lower().split()
    
    # Search by keywords
    results = await service.search_by_keywords(words)
    
    if not results:
        # Fallback to general search
        response = await service.get_all(search=text, limit=5)
        results = response["failure_modes"]
    
    return results[:5]  # Return top 5 matches


async def get_failure_mode_for_threat_db(
    db: AsyncIOMotorDatabase,
    failure_mode_name: str
) -> Optional[Dict]:
    """
    Get failure mode data for linking to a threat.
    Used during threat creation/linking.
    """
    service = FailureModesService(db)
    return await service.get_by_name(failure_mode_name)
