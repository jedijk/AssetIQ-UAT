"""
Failure Modes Service - MongoDB-backed failure mode operations.

This replaces the static FAILURE_MODES_LIBRARY with persistent MongoDB storage.
Includes versioning support for tracking changes and rollback capability.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple, Set
import asyncio
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from difflib import SequenceMatcher
import logging
import re
import time

from utils.mongo_regex import escape_regex, exact_case_insensitive
from services.ai_gateway import chat as ai_gateway_chat

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
            from utils.mongo_regex import exact_case_insensitive

            query["category"] = exact_case_insensitive(category)
        
        if equipment:
            from utils.mongo_regex import exact_case_insensitive

            query["equipment"] = exact_case_insensitive(equipment)
        
        if min_rpn:
            query["rpn"] = {"$gte": min_rpn}
        
        if equipment_type_id:
            query["equipment_type_ids"] = equipment_type_id
        
        if mechanism:
            from utils.mongo_regex import case_insensitive_contains

            mechanism_match = case_insensitive_contains(mechanism)
            if mechanism_match:
                query["mechanism"] = mechanism_match
        
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
            from utils.mongo_regex import or_search_fields

            search_clause = or_search_fields(
                search,
                "failure_mode",
                "equipment",
                "category",
                "keywords",
                "recommended_actions",
                "mechanism",
            )
            if search_clause:
                query.update(search_clause)
        
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
            "failure_mode": exact_case_insensitive(failure_mode_name)
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
        escaped = [escape_regex(k) for k in keywords if k]
        keyword_or: List[Dict[str, Any]] = [
            {"keywords": {"$in": [k.lower() for k in keywords]}},
        ]
        if escaped:
            keyword_or.append(
                {"failure_mode": {"$regex": "|".join(escaped), "$options": "i"}}
            )
        query = {"$or": keyword_or}
        
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

    def _serialize_similarity_candidate(self, doc: Dict) -> Dict[str, Any]:
        """Lean FM shape for library-wide similarity scan (tolerates partial Mongo docs)."""
        doc_id = doc.get("id") or doc.get("_id")
        severity = int(doc.get("severity") or 1)
        occurrence = int(doc.get("occurrence") or 1)
        detectability = int(doc.get("detectability") or 1)
        rpn = doc.get("rpn")
        if rpn is None:
            rpn = severity * occurrence * detectability
        return {
            "id": str(doc_id),
            "failure_mode": doc.get("failure_mode") or "",
            "category": doc.get("category"),
            "equipment": doc.get("equipment"),
            "mechanism": doc.get("mechanism"),
            "iso14224_mechanism": doc.get("iso14224_mechanism"),
            "rpn": rpn,
            "equipment_type_ids": doc.get("equipment_type_ids") or [],
            "recommended_actions": doc.get("recommended_actions") or [],
            "keywords": doc.get("keywords") or [],
            "potential_effects": doc.get("potential_effects") or [],
            "potential_causes": doc.get("potential_causes") or [],
            "is_validated": bool(doc.get("is_validated", False)),
        }

    # ============== SIMILARITY & MERGE ==============

    _FM_SIM_STOPWORDS = {
        "the", "a", "an", "of", "in", "on", "and", "or", "by", "to", "for",
        "from", "with", "without", "due", "failure", "fault", "issue", "problem",
    }

    _ACTION_SIM_STOPWORDS = {
        "the", "a", "an", "of", "in", "on", "and", "or", "by", "to", "for",
        "from", "with", "at", "per", "every", "each", "all", "check", "inspect",
        "frequency", "monthly", "weekly", "annual", "task", "pm", "action",
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

    # Defaults for library-wide "find similar" (tighter than duplicate-actions scan).
    SIMILAR_FM_JACCARD = 0.45
    SIMILAR_FM_RATIO = 0.72
    SIMILAR_FM_MIN_SCORE = 52.0
    SIMILAR_FM_AI_MIN_CONFIDENCE = 72.0

    @classmethod
    def _fm_names_similar_pair(
        cls,
        fm_a: Dict[str, Any],
        fm_b: Dict[str, Any],
        jaccard_threshold: float,
        ratio_threshold: float,
        *,
        strict_pairing: bool = False,
    ) -> bool:
        name_a = (fm_a.get("failure_mode") or "").strip()
        name_b = (fm_b.get("failure_mode") or "").strip()
        norm_a = cls.normalize_fm_text(name_a)
        norm_b = cls.normalize_fm_text(name_b)
        if norm_a and norm_a == norm_b:
            return True
        jacc = cls._token_jaccard(
            cls._fm_name_tokens(name_a), cls._fm_name_tokens(name_b)
        )
        ratio = (
            SequenceMatcher(None, norm_a, norm_b).ratio() if norm_a and norm_b else 0.0
        )
        if strict_pairing:
            return (ratio >= ratio_threshold and jacc >= jaccard_threshold) or ratio >= 0.86
        return jacc >= jaccard_threshold or ratio >= ratio_threshold

    @classmethod
    def _cluster_by_name_similarity(
        cls,
        fms: List[Dict[str, Any]],
        jaccard_threshold: float = 0.5,
        ratio_threshold: float = 0.8,
        *,
        strict_pairing: bool = False,
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

        for i in range(n):
            for j in range(i + 1, n):
                if cls._fm_names_similar_pair(
                    fms[i],
                    fms[j],
                    jaccard_threshold,
                    ratio_threshold,
                    strict_pairing=strict_pairing,
                ):
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

    def _format_similar_fm_group(
        self,
        cluster: List[Dict[str, Any]],
        reason: str,
        detection_method: str,
        confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        pair_scores = []
        for i in range(len(cluster)):
            for j in range(i + 1, len(cluster)):
                pair_scores.append(self.score_similarity(cluster[i], cluster[j])["score"])
        avg_score = (
            round(sum(pair_scores) / len(pair_scores), 1)
            if pair_scores
            else (confidence or 100.0)
        )
        best = max(cluster, key=self._fm_completeness_score)
        labels = sorted(
            {(fm.get("equipment") or "").strip() for fm in cluster if (fm.get("equipment") or "").strip()}
        )
        return {
            "equipment_type_id": None,
            "library_wide": True,
            "cross_equipment": True,
            "member_ids": [str(fm["id"]) for fm in cluster],
            "member_names": [fm.get("failure_mode") for fm in cluster],
            "equipment_labels": labels,
            "suggested_primary_id": str(best["id"]),
            "suggested_canonical_name": best.get("failure_mode"),
            "avg_similarity_score": avg_score,
            "reason": reason,
            "detection_method": detection_method,
            "ai_confidence": confidence,
        }

    @classmethod
    def _similar_fm_members_coherent(
        cls,
        members: List[Dict[str, Any]],
        *,
        min_score: float = 0,
    ) -> bool:
        """Every pair in a proposed group must look like a plausible duplicate."""
        if len(members) < 2:
            return False
        min_score = min_score or cls.SIMILAR_FM_MIN_SCORE
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                sim = cls.score_similarity(members[i], members[j])
                if sim["score"] < min_score:
                    return False
        return True

    @classmethod
    def _cluster_has_similar_pair(
        cls,
        cluster: List[Dict[str, Any]],
        jaccard_threshold: float,
        ratio_threshold: float,
        *,
        strict_pairing: bool = True,
    ) -> bool:
        for i in range(len(cluster)):
            for j in range(i + 1, len(cluster)):
                if cls._fm_names_similar_pair(
                    cluster[i],
                    cluster[j],
                    jaccard_threshold,
                    ratio_threshold,
                    strict_pairing=strict_pairing,
                ):
                    return True
        return False

    async def _ai_confirm_similar_failure_mode_cluster(
        self,
        cluster: List[Dict[str, Any]],
        *,
        user_id: str = "system",
        company_id: str = "default",
    ) -> List[Dict[str, Any]]:
        """GPT: which failure modes in this cluster are truly the same phenomenon."""
        import json

        if len(cluster) < 2:
            return []
        if len(cluster) > 35:
            cluster = cluster[:35]

        items = [
            {
                "id": str(fm["id"]),
                "failure_mode": (fm.get("failure_mode") or "")[:200],
                "equipment": (fm.get("equipment") or "")[:120],
                "mechanism": (fm.get("mechanism") or fm.get("iso14224_mechanism") or "")[:80],
            }
            for fm in cluster
        ]

        sys_prompt = (
            "You are a reliability engineer reviewing a failure-modes library. "
            "Only group failure modes that are CLEAR duplicates or trivial rewordings of "
            "the SAME failure (e.g. 'Bearing Failure' vs 'Drive Bearing Failure' when both "
            "mean generic bearing failure). Do NOT group related failures that share a "
            "word but differ in phenomenon (e.g. 'Bearing Failure' ≠ 'Bearing Wear', "
            "'Seal Leak' ≠ 'Bearing Failure'). Equipment type is irrelevant. Different "
            "ISO 14224 mechanisms must stay separate (Wear ≠ Seizure ≠ Fatigue). When "
            "unsure, return no group for those ids. Return strict JSON only."
        )
        user_msg = (
            "Candidate failure modes:\n"
            f"{json.dumps(items, indent=2)}\n\n"
            'Return JSON: {"groups": [{"member_ids": ["..."], "canonical_name": "...", '
            '"reason": "<= 20 words", "confidence": 0-100}]}. '
            "Only groups with 2+ ids you are confident are duplicates (confidence ≥ 75). "
            "Each id in at most one group. Omit borderline cases."
        )

        data = None
        try:
            content = await ai_gateway_chat(
                [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_msg},
                ],
                user_id=user_id,
                company_id=company_id,
                endpoint="failure_modes.ai_confirm_similar_cluster",
                model="gpt-4o-mini",
                temperature=0,
                max_tokens=1400,
                response_format={"type": "json_object"},
            )
            data = json.loads(content.strip())
        except json.JSONDecodeError:
            logger.warning("AI similar-FM cluster JSON parse failed")
        if not data:
            return []

        by_id = {str(fm["id"]): fm for fm in cluster}
        groups_out: List[Dict[str, Any]] = []
        used: Set[str] = set()
        for g in data.get("groups") or []:
            if not isinstance(g, dict):
                continue
            member_ids = []
            for raw in g.get("member_ids") or []:
                mid = str(raw).strip()
                if mid in by_id and mid not in used:
                    member_ids.append(mid)
            if len(member_ids) < 2:
                continue
            members = [by_id[mid] for mid in member_ids]
            if not self._similar_fm_members_coherent(members):
                continue
            conf = g.get("confidence")
            try:
                confidence = float(conf) if conf is not None else None
            except (TypeError, ValueError):
                confidence = None
            if confidence is not None and confidence < self.SIMILAR_FM_AI_MIN_CONFIDENCE:
                continue
            used.update(member_ids)
            reason = (g.get("reason") or "AI: same failure phenomenon").strip()[:240]
            canonical = (g.get("canonical_name") or "").strip()
            payload = self._format_similar_fm_group(
                members, reason=reason, detection_method="ai", confidence=confidence
            )
            if canonical:
                payload["suggested_canonical_name"] = canonical[:200]
            groups_out.append(payload)
        return groups_out

    def _library_wide_similar_groups(
        self,
        all_fms: List[Dict[str, Any]],
        min_score: float,
        jaccard_threshold: float,
        ratio_threshold: float,
        seen_keys: Set[frozenset],
        groups_out: List[Dict[str, Any]],
        limit_groups: int,
        run_fuzzy_cluster: bool = True,
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
                fid = str(fm.get("id") or "")
                if not fid or fid in seen_ids:
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
            self._append_group_if_new(
                groups_out,
                seen_keys,
                self._format_similar_fm_group(
                    unique,
                    reason=f"Identical name ({len(unique)} records, any equipment)",
                    detection_method="lexical",
                ),
                limit_groups,
            )

        if not run_fuzzy_cluster:
            return

        # Similar names (e.g. Bearing Failure + Drive Bearing Failure)
        deduped: List[Dict[str, Any]] = []
        seen_ids: Set[str] = set()
        for fm in all_fms:
            fid = str(fm.get("id") or "")
            if not fid or fid in seen_ids:
                continue
            seen_ids.add(fid)
            deduped.append(fm)

        for cluster in self._cluster_by_name_similarity(
            deduped,
            jaccard_threshold=jaccard_threshold,
            ratio_threshold=ratio_threshold,
            strict_pairing=True,
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
            self._append_group_if_new(
                groups_out,
                seen_keys,
                self._format_similar_fm_group(
                    cluster,
                    reason="Similar name in library (equipment type not considered)",
                    detection_method="lexical",
                ),
                limit_groups,
            )

    async def scan_similar_groups(
        self,
        equipment_type_id: Optional[str] = None,
        jaccard_threshold: float = SIMILAR_FM_JACCARD,
        ratio_threshold: float = SIMILAR_FM_RATIO,
        min_score: float = SIMILAR_FM_MIN_SCORE,
        limit_groups: int = 200,
        include_cross_equipment: bool = True,
        only_cross_equipment: bool = False,
        cross_equipment_ratio_threshold: float = 0.88,
        use_ai: bool = True,
        ai_max_clusters: int = 30,
        ai_time_budget_seconds: float = 55.0,
        user_id: str = "system",
        company_id: str = "default",
    ) -> Dict[str, Any]:
        """Batch scan: cluster near-duplicate failure modes across the full library.

        Equipment type is not used. With ``use_ai`` (default), GPT confirms clusters
        using maintenance/failure context (e.g. Bearing Failure = Drive Bearing Failure).
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
            all_fms.append(self._serialize_similarity_candidate(doc))

        groups_out: List[Dict[str, Any]] = []
        seen_group_keys: Set[frozenset] = set()
        fuzzy_ratio = (
            cross_equipment_ratio_threshold
            if only_cross_equipment and cross_equipment_ratio_threshold
            else ratio_threshold
        )
        max_fuzzy_cluster = 1200
        run_fuzzy = len(all_fms) <= max_fuzzy_cluster

        deduped: List[Dict[str, Any]] = []
        seen_ids: Set[str] = set()
        for fm in all_fms:
            fid = str(fm.get("id") or "")
            if not fid or fid in seen_ids:
                continue
            seen_ids.add(fid)
            deduped.append(fm)

        loose_clusters: List[List[Dict[str, Any]]] = []
        by_norm: Dict[str, List[Dict[str, Any]]] = {}
        for fm in deduped:
            norm = self.normalize_fm_text(fm.get("failure_mode"))
            if norm:
                by_norm.setdefault(norm, []).append(fm)

        if run_fuzzy:
            loose_clusters = self._cluster_by_name_similarity(
                deduped,
                jaccard_threshold=jaccard_threshold,
                ratio_threshold=fuzzy_ratio,
                strict_pairing=True,
            )

        seen_cluster_keys: Set[frozenset] = set()
        deduped_clusters: List[List[Dict[str, Any]]] = []

        def _add_cluster(cluster: List[Dict[str, Any]]) -> None:
            unique_fms: List[Dict[str, Any]] = []
            s: Set[str] = set()
            for fm in cluster:
                fid = str(fm.get("id") or "")
                if fid and fid not in s:
                    s.add(fid)
                    unique_fms.append(fm)
            if len(unique_fms) < 2:
                return
            key = frozenset(s)
            if key in seen_cluster_keys:
                return
            seen_cluster_keys.add(key)
            deduped_clusters.append(unique_fms)

        for members in by_norm.values():
            _add_cluster(members)
        for cluster in loose_clusters:
            _add_cluster(cluster)

        ai_clusters_processed = 0
        ai_calls = 0
        ai_errors = 0
        scan_truncated = False
        ai_started = time.monotonic()

        if use_ai and deduped_clusters:
            ai_subtasks: List[List[Dict[str, Any]]] = []
            for unique in deduped_clusters:
                if len(groups_out) >= limit_groups:
                    break
                norms = {
                    self.normalize_fm_text(fm.get("failure_mode")) for fm in unique
                }
                if len(norms) == 1:
                    pair_scores = []
                    for i in range(len(unique)):
                        for j in range(i + 1, len(unique)):
                            pair_scores.append(
                                self.score_similarity(unique[i], unique[j])["score"]
                            )
                    avg_score = (
                        sum(pair_scores) / len(pair_scores) if pair_scores else 100.0
                    )
                    if avg_score >= min_score:
                        self._append_group_if_new(
                            groups_out,
                            seen_group_keys,
                            self._format_similar_fm_group(
                                unique,
                                reason=f"Identical name ({len(unique)} records, any equipment)",
                                detection_method="lexical",
                            ),
                            limit_groups,
                        )
                    continue
                if not self._cluster_has_similar_pair(
                    unique,
                    jaccard_threshold,
                    fuzzy_ratio,
                    strict_pairing=True,
                ):
                    continue
                subs = [unique]
                if len(unique) > 12:
                    subs = self._cluster_by_name_similarity(
                        unique,
                        jaccard_threshold=jaccard_threshold,
                        ratio_threshold=fuzzy_ratio,
                        strict_pairing=True,
                    )
                for sub in subs:
                    if len(sub) >= 2:
                        ai_subtasks.append(sub)

            sem = asyncio.Semaphore(5)

            async def _confirm_sub(sub: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
                async with sem:
                    return await self._ai_confirm_similar_failure_mode_cluster(
                        sub, user_id=user_id, company_id=company_id
                    )

            idx = 0
            while idx < len(ai_subtasks):
                if len(groups_out) >= limit_groups:
                    scan_truncated = True
                    break
                if ai_clusters_processed >= ai_max_clusters:
                    scan_truncated = True
                    break
                if time.monotonic() - ai_started > ai_time_budget_seconds:
                    scan_truncated = True
                    break
                batch = ai_subtasks[idx : idx + 5]
                idx += len(batch)
                results = await asyncio.gather(
                    *[_confirm_sub(sub) for sub in batch],
                    return_exceptions=True,
                )
                for sub, result in zip(batch, results):
                    ai_calls += 1
                    if isinstance(result, Exception):
                        logger.warning("AI similar-FM cluster failed: %s", result)
                        ai_errors += 1
                        continue
                    for g in result:
                        self._append_group_if_new(
                            groups_out, seen_group_keys, g, limit_groups
                        )
                ai_clusters_processed += len(batch)

        if not use_ai or not groups_out:
            self._library_wide_similar_groups(
                all_fms,
                min_score=min_score,
                jaccard_threshold=jaccard_threshold,
                ratio_threshold=fuzzy_ratio,
                seen_keys=seen_group_keys,
                groups_out=groups_out,
                limit_groups=limit_groups,
                run_fuzzy_cluster=run_fuzzy,
            )

        return {
            "scope": "library",
            "scan_method": "ai" if use_ai else "lexical",
            "equipment_type_id": None,
            "groups": groups_out,
            "total_groups": len(groups_out),
            "failure_modes_scanned": len(all_fms),
            "fuzzy_clustering_skipped": not run_fuzzy,
            "ai_clusters_processed": ai_clusters_processed,
            "ai_calls": ai_calls,
            "ai_errors": ai_errors,
            "scan_truncated": scan_truncated,
        }

    @staticmethod
    def _normalize_action_text(value: Any) -> str:
        from services.pm_import_service import PMImportService

        return PMImportService._normalize_action_text(value)

    @staticmethod
    def _action_display_label(action: Any, index: int) -> str:
        if isinstance(action, dict):
            return (
                action.get("description")
                or action.get("action")
                or action.get("name")
                or f"Action {index + 1}"
            )
        if action:
            return str(action)
        return f"Action {index + 1}"

    @classmethod
    def _action_tokens(cls, action: Any) -> Set[str]:
        text = cls._normalize_action_text(action)
        return {t for t in text.split() if t not in cls._ACTION_SIM_STOPWORDS and len(t) > 2}

    @classmethod
    def _action_token_jaccard(cls, a: Any, b: Any) -> float:
        ta, tb = cls._action_tokens(a), cls._action_tokens(b)
        if not ta or not tb:
            return 0.0
        return len(ta & tb) / len(ta | tb)

    ACTION_DUP_JACCARD = 0.48
    ACTION_DUP_RATIO = 0.75
    ACTION_DUP_AI_MIN_CONFIDENCE = 75.0

    @classmethod
    def _actions_similar_pair(
        cls,
        action_a: Any,
        action_b: Any,
        ratio_threshold: float,
        jaccard_threshold: float,
        *,
        strict_pairing: bool = False,
    ) -> bool:
        norm_a = cls._normalize_action_text(action_a)
        norm_b = cls._normalize_action_text(action_b)
        if norm_a and norm_a == norm_b:
            return True
        if not norm_a or not norm_b:
            return False
        ratio = SequenceMatcher(None, norm_a, norm_b).ratio()
        jacc = cls._action_token_jaccard(action_a, action_b)
        if strict_pairing:
            return (ratio >= ratio_threshold and jacc >= jaccard_threshold) or ratio >= 0.88
        return ratio >= ratio_threshold or jacc >= jaccard_threshold

    @classmethod
    def _action_indices_coherent(
        cls,
        actions: List[Any],
        indices: List[int],
        ratio_threshold: float,
        jaccard_threshold: float,
    ) -> bool:
        if len(indices) < 2:
            return False
        for i in range(len(indices)):
            for j in range(i + 1, len(indices)):
                if not cls._actions_similar_pair(
                    actions[indices[i]],
                    actions[indices[j]],
                    ratio_threshold,
                    jaccard_threshold,
                    strict_pairing=True,
                ):
                    return False
        return True

    @classmethod
    def _cluster_duplicate_action_indices(
        cls,
        actions: List[Any],
        ratio_threshold: float = ACTION_DUP_RATIO,
        jaccard_threshold: float = ACTION_DUP_JACCARD,
        *,
        strict_pairing: bool = True,
    ) -> List[List[int]]:
        """Single-link clusters of near-duplicate recommended actions."""
        n = len(actions or [])
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

        for i in range(n):
            for j in range(i + 1, n):
                if cls._actions_similar_pair(
                    actions[i],
                    actions[j],
                    ratio_threshold,
                    jaccard_threshold,
                    strict_pairing=strict_pairing,
                ):
                    union(i, j)

        cluster_map: Dict[int, List[int]] = {}
        for i in range(n):
            cluster_map.setdefault(find(i), []).append(i)
        return [sorted(idxs) for idxs in cluster_map.values() if len(idxs) >= 2]

    def _format_action_group(
        self,
        actions: List[Any],
        indices: List[int],
        reason: str,
        detection_method: str,
        confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        members = []
        pair_ratios: List[float] = []
        for idx in indices:
            action = actions[idx]
            members.append({
                "index": idx,
                "label": self._action_display_label(action, idx),
                "action_type": (
                    action.get("action_type") or action.get("task_type")
                    if isinstance(action, dict)
                    else None
                ),
                "discipline": (
                    action.get("discipline") if isinstance(action, dict) else None
                ),
            })
        for i in range(len(indices)):
            for j in range(i + 1, len(indices)):
                ni = self._normalize_action_text(actions[indices[i]])
                nj = self._normalize_action_text(actions[indices[j]])
                if ni and nj:
                    pair_ratios.append(SequenceMatcher(None, ni, nj).ratio())
        avg_ratio = (
            round(sum(pair_ratios) / len(pair_ratios) * 100, 1)
            if pair_ratios
            else (confidence or 100.0)
        )
        suggestion = self._build_duplicate_group_suggestion(actions, indices)
        return {
            "action_indices": indices,
            "members": members,
            "avg_similarity_score": avg_ratio,
            "reason": reason,
            "detection_method": detection_method,
            "ai_confidence": confidence,
            **suggestion,
        }

    async def _ai_confirm_duplicate_action_cluster(
        self,
        failure_mode_name: str,
        equipment: str,
        actions: List[Any],
        indices: List[int],
        *,
        user_id: str = "system",
        company_id: str = "default",
    ) -> List[Dict[str, Any]]:
        """GPT confirms a small lexical cluster of duplicate actions."""
        import json

        if len(indices) < 2 or len(indices) > 12:
            return []

        payload = []
        for local_idx, action_idx in enumerate(indices):
            action = actions[action_idx]
            payload.append({
                "index": local_idx,
                "action_index": action_idx,
                "description": self._action_display_label(action, action_idx)[:400],
                "action_type": (
                    action.get("action_type") or action.get("task_type")
                    if isinstance(action, dict)
                    else ""
                ),
                "discipline": (
                    action.get("discipline") if isinstance(action, dict) else ""
                ),
            })

        sys_prompt = (
            "You are a maintenance reliability engineer. Only group actions that are "
            "CLEAR duplicates (same maintenance task and scope). DO NOT group inspect "
            "vs replace/repair, lubrication vs overhaul, cleaning vs calibration, or "
            "tasks that differ in action_type/discipline. When unsure, return no groups. "
            "Return strict JSON only."
        )
        user_msg = (
            f"Failure mode: {failure_mode_name}\n"
            f"Equipment: {equipment or '—'}\n\n"
            f"Candidate actions:\n{json.dumps(payload, indent=2)}\n\n"
            'Return JSON: {"groups": [{"member_indices": [0, 1], "keep_index": 0, '
            '"reason": "<= 20 words", "confidence": 0-100}]}. '
            "Only groups with 2+ local indices you are confident are duplicates "
            "(confidence ≥ 75). Each local index in at most one group."
        )

        data = None
        try:
            content = await ai_gateway_chat(
                [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_msg},
                ],
                user_id=user_id,
                company_id=company_id,
                endpoint="failure_modes.ai_confirm_duplicate_actions",
                model="gpt-4o-mini",
                temperature=0,
                max_tokens=800,
                response_format={"type": "json_object"},
            )
            data = json.loads(content.strip())
        except json.JSONDecodeError:
            logger.warning("AI duplicate-actions JSON parse failed for %s", failure_mode_name)
        if not data:
            return []

        local_to_action = {i: indices[i] for i in range(len(indices))}
        groups_out: List[Dict[str, Any]] = []
        used: Set[int] = set()
        for g in data.get("groups") or []:
            if not isinstance(g, dict):
                continue
            raw_indices = g.get("member_indices") or g.get("action_indices") or []
            mapped: List[int] = []
            for raw in raw_indices:
                try:
                    local_i = int(raw)
                except (TypeError, ValueError):
                    continue
                action_i = local_to_action.get(local_i)
                if action_i is not None and action_i not in used:
                    mapped.append(action_i)
            mapped = sorted(set(mapped))
            if len(mapped) < 2:
                continue
            if not self._action_indices_coherent(
                actions,
                mapped,
                self.ACTION_DUP_RATIO,
                self.ACTION_DUP_JACCARD,
            ):
                continue
            conf = g.get("confidence")
            try:
                confidence = float(conf) if conf is not None else None
            except (TypeError, ValueError):
                confidence = None
            if confidence is not None and confidence < self.ACTION_DUP_AI_MIN_CONFIDENCE:
                continue
            keep = g.get("keep_index")
            try:
                keep_local = int(keep) if keep is not None else 0
            except (TypeError, ValueError):
                keep_local = 0
            keep_index = local_to_action.get(keep_local, mapped[0])
            if keep_index not in mapped:
                keep_index = mapped[0]
            used.update(mapped)
            reason = (g.get("reason") or "AI: same maintenance task").strip()[:240]
            group = self._format_action_group(
                actions,
                mapped,
                reason=reason,
                detection_method="ai",
                confidence=confidence,
            )
            group["suggested_keep_index"] = keep_index
            group["suggested_remove_indices"] = [i for i in mapped if i != keep_index]
            groups_out.append(group)
        return groups_out

    @staticmethod
    def _action_completeness_score(action: Any) -> int:
        if not isinstance(action, dict):
            return len(str(action or ""))
        return (
            len(action.get("description") or action.get("action") or action.get("name") or "")
            + (15 if action.get("discipline") else 0)
            + (15 if action.get("action_type") or action.get("task_type") else 0)
            + (10 if action.get("estimated_minutes") else 0)
            + (5 if action.get("frequency") else 0)
            + (5 if action.get("estimated_time") else 0)
        )

    @staticmethod
    def _merge_action_dict(keep: Any, other: Any) -> Dict[str, Any]:
        if isinstance(keep, dict):
            merged: Dict[str, Any] = dict(keep)
        else:
            merged = {"description": str(keep)}
        if isinstance(other, dict):
            for key, val in other.items():
                if val is None or val == "":
                    continue
                if not merged.get(key):
                    merged[key] = val
            action_type = other.get("action_type") or other.get("task_type")
            if action_type:
                merged["action_type"] = action_type
                merged["task_type"] = action_type
            if other.get("discipline"):
                merged["discipline"] = other["discipline"]
        return merged

    def _build_duplicate_group_suggestion(
        self, actions: List[Any], indices: List[int]
    ) -> Dict[str, Any]:
        keep_index = max(indices, key=lambda i: self._action_completeness_score(actions[i]))
        remove_indices = [i for i in indices if i != keep_index]
        merged = actions[keep_index]
        for ri in remove_indices:
            merged = self._merge_action_dict(merged, actions[ri])
        return {
            "suggested_keep_index": keep_index,
            "suggested_remove_indices": remove_indices,
            "merged_action_preview": {
                "label": self._action_display_label(merged, keep_index),
                "action_type": (
                    merged.get("action_type") or merged.get("task_type")
                    if isinstance(merged, dict)
                    else None
                ),
                "discipline": merged.get("discipline") if isinstance(merged, dict) else None,
            },
        }

    async def merge_duplicate_action_groups(
        self,
        failure_mode_id: str,
        groups: List[Dict[str, Any]],
        updated_by: str = "Duplicate action merge",
    ) -> Dict[str, Any]:
        """Apply multiple duplicate-action merges on one failure mode in a single update."""
        if not groups:
            raise ValueError("No merge groups provided")

        doc = await self._resolve_fm_doc(failure_mode_id)
        if not doc:
            raise LookupError(f"Failure mode {failure_mode_id} not found")

        actions = list(doc.get("recommended_actions") or [])
        n = len(actions)
        if n < 2:
            raise ValueError("Failure mode has fewer than 2 actions")

        to_delete: Set[int] = set()
        keep_indices: Set[int] = set()
        merged_groups: List[Dict[str, Any]] = []

        for g in groups:
            try:
                keep = int(g["keep_index"])
            except (TypeError, ValueError, KeyError):
                raise ValueError("Each group requires a numeric keep_index") from None
            if keep < 0 or keep >= n:
                raise ValueError(f"keep_index {keep} out of range (0–{n - 1})")
            if keep in to_delete:
                raise ValueError(
                    f"keep_index {keep} was already removed by another selected group — "
                    "merge groups separately or re-run the scan"
                )
            remove_set: Set[int] = set()
            for raw in g.get("remove_indices") or []:
                try:
                    ri = int(raw)
                except (TypeError, ValueError):
                    continue
                if ri == keep or ri < 0 or ri >= n:
                    continue
                remove_set.add(ri)
            if not remove_set:
                raise ValueError(
                    f"Group at keep_index {keep} has no valid remove indices"
                )
            merged_action = actions[keep]
            for ri in sorted(remove_set):
                merged_action = self._merge_action_dict(merged_action, actions[ri])
                to_delete.add(ri)
            actions[keep] = merged_action
            keep_indices.add(keep)
            to_delete.discard(keep)
            merged_groups.append({
                "keep_index": keep,
                "removed_indices": sorted(remove_set),
            })

        new_actions = [a for i, a in enumerate(actions) if i not in to_delete]
        if len(new_actions) >= n:
            raise ValueError("Merge would not remove any actions")

        mode_id_str = str(doc.get("id") or doc["_id"])
        updated = await self.update(
            mode_id_str,
            {"recommended_actions": new_actions},
            updated_by=updated_by,
            change_reason="Merged duplicate recommended actions",
        )
        if not updated:
            raise RuntimeError("Failed to update failure mode")

        return {
            "success": True,
            "failure_mode_id": mode_id_str,
            "groups_merged": len(merged_groups),
            "merged_groups": merged_groups,
            "actions_before": n,
            "actions_after": len(new_actions),
        }

    async def merge_duplicate_action_group(
        self,
        failure_mode_id: str,
        keep_index: int,
        remove_indices: List[int],
        updated_by: str = "Duplicate action merge",
    ) -> Dict[str, Any]:
        """Merge duplicate recommended actions into one slot; remove the rest."""
        return await self.merge_duplicate_action_groups(
            failure_mode_id,
            groups=[{"keep_index": keep_index, "remove_indices": remove_indices}],
            updated_by=updated_by,
        )

    async def scan_duplicate_actions(
        self,
        failure_mode_id: Optional[str] = None,
        ratio_threshold: float = ACTION_DUP_RATIO,
        jaccard_threshold: float = ACTION_DUP_JACCARD,
        use_ai: bool = True,
        ai_max_failure_modes: int = 50,
        ai_max_clusters_per_fm: int = 3,
        limit_results: int = 500,
        user_id: str = "system",
        company_id: str = "default",
    ) -> Dict[str, Any]:
        """Find duplicate recommended_actions within each failure mode (library-wide scan)."""
        query: Dict[str, Any] = {}
        if failure_mode_id:
            id_query = self._build_id_query(failure_mode_id)
            if id_query:
                query = id_query

        cursor = self.collection.find(
            query,
            {
                "_id": 1,
                "id": 1,
                "failure_mode": 1,
                "equipment": 1,
                "recommended_actions": 1,
            },
        ).sort("failure_mode", 1)

        results: List[Dict[str, Any]] = []
        total_actions_scanned = 0
        failure_modes_scanned = 0
        ai_failure_modes_processed = 0
        ai_errors = 0

        async for doc in cursor:
            failure_modes_scanned += 1
            fm_id = str(doc.get("id") or doc["_id"])
            actions = doc.get("recommended_actions") or []
            if len(actions) < 2:
                continue
            total_actions_scanned += len(actions)

            duplicate_groups: List[Dict[str, Any]] = []
            fm_name = doc.get("failure_mode") or ""
            equipment = doc.get("equipment") or ""

            lexical_clusters = self._cluster_duplicate_action_indices(
                actions,
                ratio_threshold=ratio_threshold,
                jaccard_threshold=jaccard_threshold,
                strict_pairing=True,
            )
            if not lexical_clusters:
                continue

            fm_ai_failed = False
            if use_ai and ai_failure_modes_processed < ai_max_failure_modes:
                ai_failure_modes_processed += 1
                clusters_reviewed = 0
                for indices in lexical_clusters:
                    if clusters_reviewed >= ai_max_clusters_per_fm:
                        break
                    if len(indices) < 2 or len(indices) > 12:
                        continue
                    clusters_reviewed += 1
                    try:
                        confirmed = await self._ai_confirm_duplicate_action_cluster(
                            fm_name,
                            equipment,
                            actions,
                            indices,
                            user_id=user_id,
                            company_id=company_id,
                        )
                        duplicate_groups.extend(confirmed)
                    except Exception as e:
                        logger.warning(
                            "AI duplicate-action cluster failed for %s: %s",
                            fm_name,
                            e,
                        )
                        ai_errors += 1
                        fm_ai_failed = True

            if not duplicate_groups and (not use_ai or fm_ai_failed):
                for indices in lexical_clusters:
                    if not self._action_indices_coherent(
                        actions, indices, ratio_threshold, jaccard_threshold
                    ):
                        continue
                    duplicate_groups.append(
                        self._format_action_group(
                            actions,
                            indices,
                            reason=(
                                "Similar wording (strict lexical match)"
                                if not use_ai
                                else "Similar wording (AI unavailable, strict match)"
                            ),
                            detection_method="lexical",
                        )
                    )

            if duplicate_groups:
                results.append({
                    "failure_mode_id": fm_id,
                    "failure_mode": doc.get("failure_mode") or "",
                    "equipment": doc.get("equipment") or "",
                    "action_count": len(actions),
                    "duplicate_groups": duplicate_groups,
                    "duplicate_group_count": len(duplicate_groups),
                })
                if len(results) >= limit_results:
                    break

        duplicate_action_count = sum(
            len(r.get("duplicate_groups") or []) for r in results
        )
        return {
            "failure_mode_id": failure_mode_id,
            "scan_method": "ai" if use_ai else "lexical",
            "ratio_threshold": ratio_threshold,
            "jaccard_threshold": jaccard_threshold,
            "failure_modes_scanned": failure_modes_scanned,
            "total_actions_scanned": total_actions_scanned,
            "ai_failure_modes_processed": ai_failure_modes_processed,
            "ai_errors": ai_errors,
            "failure_modes_with_duplicates": len(results),
            "duplicate_group_count": duplicate_action_count,
            "results": results,
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
