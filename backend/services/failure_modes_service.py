"""
Failure Modes Service - MongoDB-backed failure mode operations.

This replaces the static FAILURE_MODES_LIBRARY with persistent MongoDB storage.
Includes versioning support for tracking changes and rollback capability.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple, Set
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from difflib import SequenceMatcher
import logging
import re
import time

logger = logging.getLogger(__name__)

# Simple in-memory cache for failure modes (invalidated on write)
_cache = {
    "all_modes": None,
    "all_modes_timestamp": 0,
    "cache_ttl": 300,  # 5 minutes
}


def _invalidate_cache():
    """Invalidate the failure modes cache."""
    _cache["all_modes"] = None
    _cache["all_modes_timestamp"] = 0


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
        failure_mode_type: Optional[str] = None,
        recently_added_days: Optional[int] = None,
        skip: int = 0,
        limit: int = 500
    ) -> Dict[str, Any]:
        """Get failure modes with optional filters."""
        import asyncio
        from datetime import timedelta
        
        # Check if this is a default query (no filters, first page, default limit)
        # NOTE: limit must equal the default exactly — a larger limit must bypass the
        # cache so users with > 500 failure modes can actually load all of them.
        is_default_query = (
            not category or category.lower() == "all"
        ) and not equipment and not search and not min_rpn and not equipment_type_id and not mechanism and is_validated is None and (
            not failure_mode_type or failure_mode_type.lower() == "all"
        ) and not recently_added_days and skip == 0 and limit == 500
        
        # Use cache for default unfiltered query
        if is_default_query:
            now = time.time()
            if _cache["all_modes"] is not None and (now - _cache["all_modes_timestamp"]) < _cache["cache_ttl"]:
                logger.debug("[FailureModesService] Returning cached failure modes")
                return _cache["all_modes"]
        
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
        
        # Filter by failure mode type (generic vs customer_specific)
        if failure_mode_type and failure_mode_type.lower() not in ["all", "recently_added"]:
            query["failure_mode_type"] = failure_mode_type.lower()
        
        # Filter by recently added (within X days)
        if recently_added_days or (failure_mode_type and failure_mode_type.lower() == "recently_added"):
            days = recently_added_days or 30
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
            query["created_at"] = {"$gte": cutoff_date}
        
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
        
        # Execute count and fetch in PARALLEL for performance
        count_task = self.collection.count_documents(query) if query else self.collection.estimated_document_count()
        fetch_task = self.collection.find(query).sort("rpn", -1).skip(skip).limit(limit).to_list(length=limit)
        
        total, raw_docs = await asyncio.gather(count_task, fetch_task)
        
        failure_modes = [self._serialize(doc) for doc in raw_docs]
        
        result = {
            "total": total,
            "failure_modes": failure_modes
        }
        
        # Cache default query result
        if is_default_query:
            _cache["all_modes"] = result
            _cache["all_modes_timestamp"] = time.time()
            logger.info(f"[FailureModesService] Cached {total} failure modes")
        
        return result
    
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
            "failure_mode_type": data.get("failure_mode_type", "generic"),
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
        
        # Invalidate cache after creation
        _invalidate_cache()
        
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
            "failure_mode_type",
            # New fields for failure mode enhancements
            "process", "potential_effects", "potential_causes", "iso14224_mechanism",
            # AI provenance
            "ai_improved_at",
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
            # Invalidate cache after update
            _invalidate_cache()
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
                "failure_mode_type": doc.get("failure_mode_type", "generic"),
                "process": doc.get("process"),
                "potential_effects": doc.get("potential_effects"),
                "potential_causes": doc.get("potential_causes"),
                "iso14224_mechanism": doc.get("iso14224_mechanism"),
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
        """Rollback a failure mode to a specific version without creating a new version entry."""
        
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
        
        target_version = version_doc.get("version", 1)
        
        # Build rollback update — restore to the target version's state
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
            "failure_mode_type": snapshot.get("failure_mode_type", "generic"),
            "process": snapshot.get("process"),
            "potential_effects": snapshot.get("potential_effects"),
            "potential_causes": snapshot.get("potential_causes"),
            "iso14224_mechanism": snapshot.get("iso14224_mechanism"),
            "is_validated": snapshot.get("is_validated", False),
            "validated_by_name": snapshot.get("validated_by_name"),
            "validated_by_position": snapshot.get("validated_by_position"),
            "validated_at": snapshot.get("validated_at"),
            "updated_at": datetime.now(timezone.utc),
            "version": target_version,
            "rolled_back_from_version": target_version,
            "rolled_back_by": rolled_back_by,
            "rolled_back_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Delete all version entries NEWER than the target version
        await self.versions_collection.delete_many({
            "failure_mode_id": mode_id,
            "version": {"$gt": target_version}
        })
        
        # Perform rollback — set version to the target version
        result = await self.collection.find_one_and_update(
            query,
            {"$set": rollback_fields},
            return_document=True
        )
        
        if result:
            # Invalidate cache after rollback
            _invalidate_cache()
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
            # Invalidate cache after validation
            _invalidate_cache()
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
            # Invalidate cache after unvalidation
            _invalidate_cache()
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
        
        # Invalidate cache after deletion
        if result.deleted_count > 0:
            _invalidate_cache()
        
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
        
        def safe_isoformat(val):
            """Safely convert datetime to ISO string, handling already-string values."""
            if val is None:
                return None
            if isinstance(val, str):
                return val  # Already a string
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return str(val)
        
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
            # ISO 14224 enhanced fields
            "mechanism": doc.get("mechanism", "UNK"),
            "mechanism_description": doc.get("mechanism_description", "Unknown"),
            "potential_effects": doc.get("potential_effects", []),
            "potential_causes": doc.get("potential_causes", []),
            # Legacy fields
            "process": doc.get("process"),
            "iso14224_mechanism": doc.get("iso14224_mechanism"),
            "is_validated": doc.get("is_validated", False),
            "validated_by_name": doc.get("validated_by_name"),
            "validated_by_position": doc.get("validated_by_position"),
            "validated_by_id": doc.get("validated_by_id"),
            "validated_at": safe_isoformat(doc.get("validated_at")),
            "is_custom": doc.get("is_custom", False),
            "is_builtin": doc.get("is_builtin", True),
            "failure_mode_type": doc.get("failure_mode_type", "generic"),
            "version": doc.get("version", 1),
            "rolled_back_from_version": doc.get("rolled_back_from_version"),
            "ai_improved_at": safe_isoformat(doc.get("ai_improved_at")) if not isinstance(doc.get("ai_improved_at"), str) else doc.get("ai_improved_at"),
            "created_at": safe_isoformat(doc.get("created_at")),
            "updated_at": safe_isoformat(doc.get("updated_at")),
        }
        
        return result

    # ============== SIMILARITY & MERGE ==============

    _FM_SIM_STOPWORDS = {
        "the", "a", "an", "of", "in", "on", "and", "or", "by", "to", "for",
        "from", "with", "without", "due", "failure", "fault", "issue", "problem",
    }

    @staticmethod
    def normalize_fm_text(value: Any) -> str:
        """Normalize failure-mode names (and short text) for lexical comparison."""
        if value is None:
            return ""
        text = str(value)
        text = re.sub(r"[^a-z0-9\s]", " ", text.lower())
        return re.sub(r"\s+", " ", text).strip()

    @classmethod
    def _fm_name_tokens(cls, name: str) -> Set[str]:
        raw = cls.normalize_fm_text(name).split()
        return {t for t in raw if t not in cls._FM_SIM_STOPWORDS and len(t) > 2}

    @classmethod
    def _token_jaccard(cls, a: Set[str], b: Set[str]) -> float:
        if not a or not b:
            return 0.0
        return len(a & b) / len(a | b)

    @classmethod
    def score_similarity(cls, fm_a: Dict[str, Any], fm_b: Dict[str, Any]) -> Dict[str, Any]:
        """Score how similar two failure modes are (0–100). Higher = more likely duplicate."""
        if str(fm_a.get("id")) == str(fm_b.get("id")):
            return {"score": 0, "name_ratio": 0.0, "token_jaccard": 0.0, "shared_equipment_types": []}

        name_a = (fm_a.get("failure_mode") or "").strip()
        name_b = (fm_b.get("failure_mode") or "").strip()
        norm_a = cls.normalize_fm_text(name_a)
        norm_b = cls.normalize_fm_text(name_b)

        if norm_a and norm_a == norm_b:
            name_ratio = 1.0
            jacc = 1.0
        else:
            name_ratio = SequenceMatcher(None, norm_a, norm_b).ratio() if norm_a and norm_b else 0.0
            jacc = cls._token_jaccard(cls._fm_name_tokens(name_a), cls._fm_name_tokens(name_b))

        ets_a = {str(t) for t in (fm_a.get("equipment_type_ids") or [])}
        ets_b = {str(t) for t in (fm_b.get("equipment_type_ids") or [])}
        shared_ets = sorted(ets_a & ets_b)

        score = max(name_ratio, jacc) * 70.0
        if norm_a and norm_a == norm_b:
            # Same title on different equipment types (e.g. two "Bearing Failure" rows)
            score += 15.0
        if shared_ets:
            score += 20.0
        if (fm_a.get("category") or "").lower() == (fm_b.get("category") or "").lower() and fm_a.get("category"):
            score += 5.0
        if (fm_a.get("equipment") or "").lower() == (fm_b.get("equipment") or "").lower() and fm_a.get("equipment"):
            score += 5.0

        mech_a = cls.normalize_fm_text(fm_a.get("mechanism") or fm_a.get("iso14224_mechanism") or "")
        mech_b = cls.normalize_fm_text(fm_b.get("mechanism") or fm_b.get("iso14224_mechanism") or "")
        if mech_a and mech_b and mech_a != mech_b:
            # Different ISO mechanisms — penalize (Wear ≠ Seizure)
            mech_ratio = SequenceMatcher(None, mech_a, mech_b).ratio()
            if mech_ratio < 0.65:
                score *= 0.45

        score = min(100.0, round(score, 1))
        return {
            "score": score,
            "name_ratio": round(name_ratio, 3),
            "token_jaccard": round(jacc, 3),
            "shared_equipment_types": shared_ets,
        }

    @classmethod
    def _cluster_by_name_similarity(
        cls,
        fms: List[Dict[str, Any]],
        jaccard_threshold: float = 0.5,
        ratio_threshold: float = 0.8,
    ) -> List[List[Dict[str, Any]]]:
        """Single-link clusters on failure_mode names (same thresholds as AI dedupe pre-filter)."""
        n = len(fms)
        if n < 2:
            return []

        parent = list(range(n))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: int, b: int) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        tokens_cache = [cls._fm_name_tokens(fm.get("failure_mode") or "") for fm in fms]
        for i in range(n):
            for j in range(i + 1, n):
                norm_i = cls.normalize_fm_text(fms[i].get("failure_mode"))
                norm_j = cls.normalize_fm_text(fms[j].get("failure_mode"))
                if norm_i and norm_i == norm_j:
                    union(i, j)
                    continue
                jacc = cls._token_jaccard(tokens_cache[i], tokens_cache[j])
                ratio = SequenceMatcher(None, norm_i, norm_j).ratio() if norm_i and norm_j else 0.0
                if jacc >= jaccard_threshold or ratio >= ratio_threshold:
                    union(i, j)

        cluster_map: Dict[int, List[Dict[str, Any]]] = {}
        for i, fm in enumerate(fms):
            cluster_map.setdefault(find(i), []).append(fm)
        return [c for c in cluster_map.values() if len(c) >= 2]

    @staticmethod
    def _fm_completeness_score(doc: Dict[str, Any]) -> int:
        effects = doc.get("potential_effects") or []
        causes = doc.get("potential_causes") or []
        if isinstance(effects, str):
            effects = [effects]
        if isinstance(causes, str):
            causes = [causes]
        return (
            len(doc.get("recommended_actions") or []) * 3
            + len(doc.get("keywords") or []) * 2
            + len(effects)
            + len(causes)
            + (50 if doc.get("is_validated") else 0)
            + int(doc.get("rpn") or 0)
        )

    async def find_similar(
        self,
        mode_id: str,
        threshold: float = 55.0,
        limit: int = 20,
        require_shared_equipment_type: bool = False,
    ) -> Dict[str, Any]:
        """Find library failure modes similar to the given mode (lexical scoring)."""
        target = await self.get_by_id(mode_id)
        if not target:
            return {"mode_id": mode_id, "candidates": [], "total": 0}

        query: Dict[str, Any] = {}
        if require_shared_equipment_type and target.get("equipment_type_ids"):
            query["equipment_type_ids"] = {"$in": target["equipment_type_ids"]}

        cursor = self.collection.find(query).sort("rpn", -1)
        candidates = []
        target_id = str(target["id"])
        async for doc in cursor:
            serialized = self._serialize(doc)
            if str(serialized["id"]) == target_id:
                continue
            metrics = self.score_similarity(target, serialized)
            if metrics["score"] >= threshold:
                candidates.append({**serialized, **metrics})

        candidates.sort(key=lambda x: (-x["score"], -x.get("rpn", 0)))
        limited = candidates[: max(1, min(limit, 100))]
        return {
            "mode_id": target_id,
            "failure_mode": target.get("failure_mode"),
            "candidates": limited,
            "total": len(limited),
        }

    @staticmethod
    def _group_member_key(member_ids: List[str]) -> frozenset:
        return frozenset(str(x) for x in member_ids)

    def _append_group_if_new(
        self,
        groups_out: List[Dict[str, Any]],
        seen_keys: Set[frozenset],
        payload: Dict[str, Any],
        limit_groups: int,
    ) -> bool:
        """Append group when member set is new. Returns False when limit reached."""
        key = self._group_member_key(payload.get("member_ids") or [])
        if len(key) < 2 or key in seen_keys:
            return len(groups_out) < limit_groups
        seen_keys.add(key)
        groups_out.append(payload)
        return len(groups_out) < limit_groups

    def _library_wide_similar_groups(
        self,
        all_fms: List[Dict[str, Any]],
        min_score: float,
        jaccard_threshold: float,
        ratio_threshold: float,
        seen_keys: Set[frozenset],
        groups_out: List[Dict[str, Any]],
        limit_groups: int,
    ) -> None:
        """Find near-duplicate failure modes across the full library (equipment type ignored)."""
        by_norm: Dict[str, List[Dict[str, Any]]] = {}
        for fm in all_fms:
            norm = self.normalize_fm_text(fm.get("failure_mode"))
            if not norm:
                continue
            by_norm.setdefault(norm, []).append(fm)

        for norm, members in by_norm.items():
            if len(groups_out) >= limit_groups:
                return
            unique: List[Dict[str, Any]] = []
            seen_ids: Set[str] = set()
            for fm in members:
                fid = str(fm["id"])
                if fid in seen_ids:
                    continue
                seen_ids.add(fid)
                unique.append(fm)
            if len(unique) < 2:
                continue
            pair_scores = []
            for i in range(len(unique)):
                for j in range(i + 1, len(unique)):
                    pair_scores.append(self.score_similarity(unique[i], unique[j])["score"])
            avg_score = sum(pair_scores) / len(pair_scores) if pair_scores else 100.0
            if avg_score < min_score:
                continue
            best = max(unique, key=self._fm_completeness_score)
            labels = sorted(
                {(fm.get("equipment") or "").strip() for fm in unique if (fm.get("equipment") or "").strip()}
            )
            self._append_group_if_new(
                groups_out,
                seen_keys,
                {
                    "equipment_type_id": None,
                    "library_wide": True,
                    "cross_equipment": True,
                    "member_ids": [str(fm["id"]) for fm in unique],
                    "member_names": [fm.get("failure_mode") for fm in unique],
                    "equipment_labels": labels,
                    "suggested_primary_id": str(best["id"]),
                    "suggested_canonical_name": best.get("failure_mode"),
                    "avg_similarity_score": round(avg_score, 1),
                    "reason": f"Identical name ({len(unique)} records, any equipment)",
                },
                limit_groups,
            )

        # Similar names across equipment (e.g. Bearing Failure + Drive Bearing Failure)
        deduped: List[Dict[str, Any]] = []
        seen_ids: Set[str] = set()
        for fm in all_fms:
            fid = str(fm["id"])
            if fid in seen_ids:
                continue
            seen_ids.add(fid)
            deduped.append(fm)

        for cluster in self._cluster_by_name_similarity(
            deduped,
            jaccard_threshold=jaccard_threshold,
            ratio_threshold=ratio_threshold,
        ):
            if len(groups_out) >= limit_groups:
                return
            if len(cluster) < 2:
                continue
            norms = {self.normalize_fm_text(fm.get("failure_mode")) for fm in cluster}
            if len(norms) == 1:
                continue  # already covered by exact-name pass
            pair_scores = []
            for i in range(len(cluster)):
                for j in range(i + 1, len(cluster)):
                    pair_scores.append(self.score_similarity(cluster[i], cluster[j])["score"])
            avg_score = sum(pair_scores) / len(pair_scores) if pair_scores else 0.0
            if avg_score < min_score:
                continue
            best = max(cluster, key=self._fm_completeness_score)
            labels = sorted(
                {(fm.get("equipment") or "").strip() for fm in cluster if (fm.get("equipment") or "").strip()}
            )
            self._append_group_if_new(
                groups_out,
                seen_keys,
                {
                    "equipment_type_id": None,
                    "library_wide": True,
                    "cross_equipment": True,
                    "member_ids": [str(fm["id"]) for fm in cluster],
                    "member_names": [fm.get("failure_mode") for fm in cluster],
                    "equipment_labels": labels,
                    "suggested_primary_id": str(best["id"]),
                    "suggested_canonical_name": best.get("failure_mode"),
                    "avg_similarity_score": round(avg_score, 1),
                    "reason": "Similar name in library (equipment type not considered)",
                },
                limit_groups,
            )

    async def scan_similar_groups(
        self,
        equipment_type_id: Optional[str] = None,
        jaccard_threshold: float = 0.5,
        ratio_threshold: float = 0.8,
        min_score: float = 55.0,
        limit_groups: int = 200,
        include_cross_equipment: bool = True,
        only_cross_equipment: bool = False,
        cross_equipment_ratio_threshold: float = 0.88,
    ) -> Dict[str, Any]:
        """Batch scan: cluster near-duplicate failure modes across the full library (no AI).

        Equipment type is not used for grouping. ``equipment_type_id`` is ignored unless
        you need a legacy filtered subset (deprecated).
        """
        query: Dict[str, Any] = {}

        cursor = self.collection.find(
            query,
            {
                "_id": 1,
                "failure_mode": 1,
                "category": 1,
                "equipment": 1,
                "mechanism": 1,
                "iso14224_mechanism": 1,
                "rpn": 1,
                "equipment_type_ids": 1,
                "recommended_actions": 1,
                "keywords": 1,
                "potential_effects": 1,
                "potential_causes": 1,
                "is_validated": 1,
            },
        ).sort("rpn", -1)

        all_fms: List[Dict[str, Any]] = []
        async for doc in cursor:
            all_fms.append(self._serialize(doc))

        groups_out: List[Dict[str, Any]] = []
        seen_group_keys: Set[frozenset] = set()
        fuzzy_ratio = (
            cross_equipment_ratio_threshold
            if only_cross_equipment and cross_equipment_ratio_threshold
            else ratio_threshold
        )
        self._library_wide_similar_groups(
            all_fms,
            min_score=min_score,
            jaccard_threshold=jaccard_threshold,
            ratio_threshold=fuzzy_ratio,
            seen_keys=seen_group_keys,
            groups_out=groups_out,
            limit_groups=limit_groups,
        )

        return {
            "scope": "library",
            "equipment_type_id": None,
            "groups": groups_out,
            "total_groups": len(groups_out),
        }

    async def _resolve_fm_doc(self, mode_id: str) -> Optional[Dict[str, Any]]:
        query = self._build_id_query(mode_id)
        if not query:
            return None
        return await self.collection.find_one(query)

    async def _repoint_failure_mode_references(
        self,
        winner_id: str,
        loser_ids: List[str],
        winner_name: str,
    ) -> Dict[str, int]:
        """Update collections that store failure_mode_id / failure_mode_ids."""
        loser_set = set(loser_ids)
        counts: Dict[str, int] = {}
        now = datetime.now(timezone.utc)

        res = await self.db["equipment_failure_modes"].update_many(
            {"failure_mode_id": {"$in": list(loser_set)}},
            {"$set": {
                "failure_mode_id": winner_id,
                "failure_mode_name": winner_name,
                "updated_at": now,
            }},
        )
        counts["equipment_failure_modes"] = res.modified_count

        res = await self.db["observations"].update_many(
            {"failure_mode_id": {"$in": list(loser_set)}},
            {"$set": {"failure_mode_id": winner_id, "updated_at": now}},
        )
        counts["observations"] = res.modified_count

        collection_names = await self.db.list_collection_names()
        for coll_name in ("task_templates", "maintenance_programs"):
            if coll_name not in collection_names:
                continue
            res = await self.db[coll_name].update_many(
                {"failure_mode_id": {"$in": list(loser_set)}},
                {"$set": {"failure_mode_id": winner_id}},
            )
            counts[coll_name] = res.modified_count

        # failure_mode_ids arrays on task templates / forms
        for coll_name in ("task_templates", "form_templates", "form_definitions"):
            if coll_name not in collection_names:
                continue
            modified = 0
            async for doc in self.db[coll_name].find(
                {"failure_mode_ids": {"$in": list(loser_set)}},
                {"_id": 1, "failure_mode_ids": 1},
            ):
                old_ids = [str(x) for x in (doc.get("failure_mode_ids") or [])]
                new_ids = []
                seen = set()
                for fid in old_ids:
                    mapped = winner_id if fid in loser_set else fid
                    if mapped in seen:
                        continue
                    seen.add(mapped)
                    new_ids.append(mapped)
                if winner_id not in seen:
                    new_ids.append(winner_id)
                await self.db[coll_name].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"failure_mode_ids": new_ids}},
                )
                modified += 1
            counts[f"{coll_name}_arrays"] = modified

        # Embedded strategies on equipment_type_strategies
        strat_modified = 0
        async for strat in self.db["equipment_type_strategies"].find({}):
            fm_strategies = strat.get("failure_mode_strategies") or strat.get("failure_modes") or []
            tasks = strat.get("task_templates") or strat.get("tasks") or []
            changed = False
            new_fm_strategies = []
            seen_fm_ids: Set[str] = set()

            for fm_s in fm_strategies:
                fid = str(fm_s.get("failure_mode_id") or "")
                if fid in loser_set:
                    fm_s = {**fm_s, "failure_mode_id": winner_id, "failure_mode_name": winner_name}
                    fid = winner_id
                    changed = True
                if fid and fid in seen_fm_ids:
                    changed = True
                    continue
                if fid:
                    seen_fm_ids.add(fid)
                new_fm_strategies.append(fm_s)

            new_tasks = []
            for task in tasks:
                t_ids = [str(x) for x in (task.get("failure_mode_ids") or [])]
                if any(t in loser_set for t in t_ids):
                    changed = True
                    merged = []
                    seen_t = set()
                    for t in t_ids:
                        m = winner_id if t in loser_set else t
                        if m not in seen_t:
                            seen_t.add(m)
                            merged.append(m)
                    if winner_id not in seen_t:
                        merged.append(winner_id)
                    task = {**task, "failure_mode_ids": merged}
                new_tasks.append(task)

            if changed:
                update_doc: Dict[str, Any] = {"updated_at": now}
                if fm_strategies:
                    key = "failure_mode_strategies" if strat.get("failure_mode_strategies") is not None else "failure_modes"
                    update_doc[key] = new_fm_strategies
                if tasks:
                    key = "task_templates" if strat.get("task_templates") is not None else "tasks"
                    update_doc[key] = new_tasks
                await self.db["equipment_type_strategies"].update_one(
                    {"_id": strat["_id"]},
                    {"$set": update_doc},
                )
                strat_modified += 1
        counts["equipment_type_strategies"] = strat_modified

        return counts

    async def merge_failure_modes(
        self,
        winner_id: str,
        loser_ids: List[str],
        canonical_name: Optional[str] = None,
        dry_run: bool = False,
        merged_by: Optional[str] = None,
        auto_pick_primary: bool = False,
    ) -> Dict[str, Any]:
        """
        Merge loser failure modes into winner. Backs up losers to fm_merge_log unless dry_run.
        Repoints failure_mode_id references when not dry_run.
        """
        loser_ids = [str(x).strip() for x in loser_ids if str(x).strip()]
        winner_id = str(winner_id).strip()
        if not winner_id or not loser_ids:
            raise ValueError("winner_id and loser_ids are required")
        if winner_id in loser_ids:
            raise ValueError("winner_id cannot also be a loser")

        if auto_pick_primary:
            all_docs = []
            for mid in [winner_id] + loser_ids:
                doc = await self._resolve_fm_doc(mid)
                if doc:
                    all_docs.append(doc)
            if len(all_docs) < 2:
                raise LookupError("Need at least two failure modes to auto-pick primary")
            winner_doc = max(all_docs, key=self._fm_completeness_score)
            winner_id = str(winner_doc["_id"])
            loser_ids = [str(d["_id"]) for d in all_docs if str(d["_id"]) != winner_id]
        else:
            winner_doc = await self._resolve_fm_doc(winner_id)
            if not winner_doc:
                raise LookupError("Winner failure mode not found")

        loser_docs = []
        for lid in loser_ids:
            doc = await self._resolve_fm_doc(lid)
            if doc and doc["_id"] != winner_doc["_id"]:
                loser_docs.append(doc)

        if not loser_docs:
            raise LookupError("No valid loser failure modes found")

        def _dedup(items, key=lambda x: x):
            seen, out = set(), []
            for it in items or []:
                k = key(it)
                if k in seen:
                    continue
                seen.add(k)
                out.append(it)
            return out

        def _action_key(a):
            if isinstance(a, str):
                return self.normalize_fm_text(a)
            if isinstance(a, dict):
                return self.normalize_fm_text(
                    a.get("action") or a.get("description") or ""
                )
            return self.normalize_fm_text(str(a))

        def _str_key(v):
            return self.normalize_fm_text(v) if isinstance(v, str) else self.normalize_fm_text(str(v))

        merged_ets = _dedup(
            list(winner_doc.get("equipment_type_ids") or [])
            + [eid for ld in loser_docs for eid in (ld.get("equipment_type_ids") or [])]
        )
        merged_kw = _dedup(
            list(winner_doc.get("keywords") or [])
            + [k for ld in loser_docs for k in (ld.get("keywords") or [])],
            key=_str_key,
        )
        merged_actions = _dedup(
            list(winner_doc.get("recommended_actions") or [])
            + [a for ld in loser_docs for a in (ld.get("recommended_actions") or [])],
            key=_action_key,
        )
        merged_effects = _dedup(
            list(winner_doc.get("potential_effects") or [])
            + [e for ld in loser_docs for e in (ld.get("potential_effects") or [])],
            key=_str_key,
        )
        merged_causes = _dedup(
            list(winner_doc.get("potential_causes") or [])
            + [c for ld in loser_docs for c in (ld.get("potential_causes") or [])],
            key=_str_key,
        )

        final_name = (canonical_name or "").strip() or winner_doc.get("failure_mode")
        update_fields = {
            "equipment_type_ids": merged_ets,
            "keywords": merged_kw,
            "recommended_actions": merged_actions,
            "potential_effects": merged_effects,
            "potential_causes": merged_causes,
            "updated_at": datetime.now(timezone.utc),
            "version": (winner_doc.get("version") or 1) + 1,
        }
        if canonical_name:
            update_fields["failure_mode"] = canonical_name.strip()

        winner_id_str = str(winner_doc["_id"])
        loser_id_strs = [str(ld["_id"]) for ld in loser_docs]

        preview = {
            "dry_run": dry_run,
            "winner_id": winner_id_str,
            "loser_ids": loser_id_strs,
            "canonical_name": final_name,
            "update_fields": update_fields,
            "losers_to_delete": [
                {"id": lid, "failure_mode": ld.get("failure_mode")} for lid, ld in zip(loser_id_strs, loser_docs)
            ],
        }

        if dry_run:
            return preview

        await self._save_version(
            winner_doc,
            updated_by=merged_by or "merge",
            change_reason="Pre-merge snapshot",
        )

        await self.db["fm_merge_log"].insert_one({
            "merged_at": datetime.now(timezone.utc),
            "merged_by": merged_by,
            "winner_id": winner_id_str,
            "winner_failure_mode": final_name,
            "previous_winner_name": winner_doc.get("failure_mode"),
            "losers": [
                {**{k: v for k, v in ld.items() if k != "_id"}, "_mongo_id": str(ld["_id"])}
                for ld in loser_docs
            ],
        })

        await self.collection.update_one({"_id": winner_doc["_id"]}, {"$set": update_fields})
        deleted = 0
        for ld in loser_docs:
            await self._save_version(ld, updated_by=merged_by or "merge", change_reason="Merged into " + winner_id_str)
            res = await self.collection.delete_one({"_id": ld["_id"]})
            deleted += res.deleted_count

        repoint_counts = await self._repoint_failure_mode_references(
            winner_id_str, loser_id_strs, final_name
        )
        _invalidate_cache()

        return {
            **preview,
            "dry_run": False,
            "deleted_count": deleted,
            "repoint_counts": repoint_counts,
        }


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
