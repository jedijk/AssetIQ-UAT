"""
Process Intelligence Import Service - Converts process diagrams to ISO 14224 asset hierarchy.

This service handles session management and delegates vision parsing to process_import_vision.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from services.process_import_vision import ProcessImportVisionMixin

logger = logging.getLogger(__name__)


class ProcessImportService(ProcessImportVisionMixin):
    """Service class for Process Import operations."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.sessions_collection = db["process_import_sessions"]
        self.equipment_collection = db["equipment_hierarchy"]

    async def _ai_user_context(self, session_id: Optional[str] = None) -> Tuple[str, str]:
        uid = "system"
        if session_id:
            session = await self.sessions_collection.find_one(
                {"session_id": session_id}, {"created_by": 1}
            )
            if session and session.get("created_by"):
                uid = str(session["created_by"])
        return uid, "default"
    
    async def create_session_placeholder(
        self,
        file_name: str,
        file_type: str,
        created_by: str,
        options: Dict[str, Any] = None
    ) -> str:
        """Create a session placeholder for background processing."""
        
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        options = options or {}
        
        session = {
            "session_id": session_id,
            "file_name": file_name,
            "file_type": file_type,
            "status": "processing",
            "progress": 0,
            "progress_message": "Initializing...",
            "hierarchy_items": [],
            "exceptions": [],
            "stats": {
                "total_items": 0,
                "plants": 0,
                "systems": 0,
                "equipment": 0,
                "subunits": 0,
                "maintainable_items": 0,
                "low_confidence": 0,
                "exceptions": 0
            },
            "options": {
                "generate_subunits": options.get("generate_subunits", True),
                "generate_maintainable_items": options.get("generate_maintainable_items", False),
                "estimate_criticality": options.get("estimate_criticality", True),
            },
            "created_by": created_by,
            "created_at": now,
            "updated_at": now
        }
        
        await self.sessions_collection.insert_one(session)
        return session_id
    
    async def process_session(
        self,
        session_id: str,
        file_name: str,
        file_type: str,
        file_content: bytes,
        options: Dict[str, Any] = None
    ) -> None:
        """Process a session (called as background task)."""
        
        options = options or {}
        
        try:
            # Process the file
            hierarchy_items, exceptions = await self._process_file(
                session_id, file_name, file_type, file_content, options
            )
            
            # Calculate stats
            stats = self._calculate_stats(hierarchy_items, exceptions)
            
            await self.sessions_collection.update_one(
                {"session_id": session_id},
                {"$set": {
                    "status": "ready_for_review",
                    "progress": 100,
                    "progress_message": "Processing complete",
                    "hierarchy_items": hierarchy_items,
                    "exceptions": exceptions,
                    "stats": stats,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            logger.info(f"Process Import session {session_id} completed with {len(hierarchy_items)} items")
            
        except Exception as e:
            logger.error(f"Error processing session {session_id}: {e}", exc_info=True)
            await self.sessions_collection.update_one(
                {"session_id": session_id},
                {"$set": {
                    "status": "error",
                    "error_message": str(e),
                    "progress_message": f"Error: {str(e)[:200]}",
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a session by ID."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if session:
            session["_id"] = str(session["_id"])
        return session
    
    async def update_item(
        self,
        session_id: str,
        item_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a specific hierarchy item."""
        
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        items = session.get("hierarchy_items", [])
        for item in items:
            if item.get("item_id") == item_id:
                item.update(updates)
                # Only set to "edited" if review_status wasn't explicitly updated
                if "review_status" not in updates:
                    item["review_status"] = "edited"
                break
        
        stats = self._calculate_stats(items, session.get("exceptions", []))
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "hierarchy_items": items,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"items": items, "stats": stats}
    
    async def delete_item(self, session_id: str, item_id: str) -> Optional[Dict[str, Any]]:
        """Delete a hierarchy item."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        items = [i for i in session.get("hierarchy_items", []) if i.get("item_id") != item_id]
        
        # Also remove children
        deleted_ids = {item_id}
        changed = True
        while changed:
            changed = False
            new_items = []
            for item in items:
                if item.get("parent_id") in deleted_ids:
                    deleted_ids.add(item["item_id"])
                    changed = True
                else:
                    new_items.append(item)
            items = new_items
        
        stats = self._calculate_stats(items, session.get("exceptions", []))
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "hierarchy_items": items,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"items": items, "stats": stats}
    
    async def add_item(
        self,
        session_id: str,
        item_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Add a new hierarchy item manually."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        items = session.get("hierarchy_items", [])
        
        new_item = {
            "item_id": str(uuid.uuid4()),
            "tag": item_data.get("tag", ""),
            "name": item_data.get("name", ""),
            "level": item_data.get("level", "Equipment Unit"),
            "equipment_type": item_data.get("equipment_type", ""),
            "description": item_data.get("description", ""),
            "parent_id": item_data.get("parent_id"),
            "criticality": item_data.get("criticality", {
                "safety": 0, "production": 0, "environmental": 0, "reputation": 0
            }),
            "confidence": 100,  # Manual entries are 100% confidence
            "review_status": "accepted",
            "source": "manual",
            "ai_reasoning": "Manually added by user"
        }
        
        items.append(new_item)
        stats = self._calculate_stats(items, session.get("exceptions", []))
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "hierarchy_items": items,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"item": new_item, "items": items, "stats": stats}
    
    async def import_to_assetiq(
        self,
        session_id: str,
        installation_id: str,
        created_by: str
    ) -> Dict[str, Any]:
        """Import hierarchy items to AssetIQ equipment hierarchy."""
        
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            raise ValueError("Session not found")
        
        items = session.get("hierarchy_items", [])
        now = datetime.now(timezone.utc)
        
        created_count = 0
        updated_count = 0
        skipped_count = 0
        
        # Map item_id to created equipment_id
        id_map = {}
        
        # Sort items by level to ensure parents are created first
        level_order = {
            "Plant/Unit": 0,
            "Section/System": 1,
            "Equipment Unit": 2,
            "Subunit": 3,
            "Maintainable Item": 4
        }
        
        sorted_items = sorted(items, key=lambda x: level_order.get(x.get("level"), 5))
        
        for item in sorted_items:
            if item.get("review_status") == "rejected":
                skipped_count += 1
                continue
            
            # Map level to backend format
            level_map = {
                "Plant/Unit": "plant_unit",
                "Section/System": "section_system",
                "Equipment Unit": "equipment_unit",
                "Subunit": "subunit",
                "Maintainable Item": "maintainable_item"
            }
            
            # Determine parent_id
            parent_id = None
            if item.get("parent_id"):
                parent_id = id_map.get(item["parent_id"])
            if not parent_id and item.get("level") != "Plant/Unit":
                parent_id = installation_id
            
            # Build equipment record
            equipment_data = {
                "id": str(uuid.uuid4()),
                "tag": item.get("tag", ""),
                "name": item.get("name", ""),
                "level": level_map.get(item.get("level"), "equipment_unit"),
                "equipment_type": item.get("equipment_type", ""),
                "description": item.get("description", ""),
                "parent_id": parent_id,
                "criticality": {
                    "safety": item.get("criticality", {}).get("safety", 0),
                    "production": item.get("criticality", {}).get("production", 0),
                    "environmental": item.get("criticality", {}).get("environmental", 0),
                    "reputation": item.get("criticality", {}).get("reputation", 0),
                },
                "created_at": now,
                "updated_at": now,
                "created_by": created_by,
                "source": "process_import",
                "import_session_id": session_id
            }
            
            # Check if tag already exists
            existing = await self.equipment_collection.find_one({
                "tag": item.get("tag"),
                "parent_id": parent_id
            })
            
            if existing:
                # Update existing
                await self.equipment_collection.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "name": equipment_data["name"],
                        "equipment_type": equipment_data["equipment_type"],
                        "description": equipment_data["description"],
                        "criticality": equipment_data["criticality"],
                        "updated_at": now
                    }}
                )
                id_map[item["item_id"]] = str(existing["_id"])
                updated_count += 1
            else:
                # Create new
                await self.equipment_collection.insert_one(equipment_data)
                id_map[item["item_id"]] = equipment_data["id"]
                created_count += 1
        
        # Update session status
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "imported",
                "import_result": {
                    "created_count": created_count,
                    "updated_count": updated_count,
                    "skipped_count": skipped_count,
                    "installation_id": installation_id,
                    "imported_at": now.isoformat(),
                    "imported_by": created_by
                },
                "updated_at": now
            }}
        )
        
        return {
            "success": True,
            "created_count": created_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count
        }
    
