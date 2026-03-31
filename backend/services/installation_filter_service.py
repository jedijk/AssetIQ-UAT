"""
Installation-based filtering service.
Filters all data based on user's assigned installations.
Owner role bypasses all installation filtering.
"""
import logging
from typing import List, Optional, Set
from functools import lru_cache
import asyncio

logger = logging.getLogger(__name__)

# Simple in-memory cache for installation equipment mappings
_equipment_cache = {}
_cache_ttl = 300  # 5 minutes


class InstallationFilterService:
    """Service to handle installation-based data filtering."""
    
    def __init__(self, db):
        self.db = db
    
    def is_owner(self, user: dict) -> bool:
        """Check if user has owner role (bypasses all installation filtering)."""
        return user.get("role") == "owner"
    
    async def get_user_installation_ids(self, user: dict) -> List[str]:
        """
        Get the equipment node IDs for installations assigned to the user.
        Returns empty list if no installations assigned (which means no data access).
        Owner role gets ALL installations.
        """
        try:
            # Owner bypasses filtering - gets all installations
            if self.is_owner(user):
                all_installations = await self.db.equipment_nodes.find(
                    {"level": "installation"},
                    {"_id": 0, "id": 1}
                ).to_list(500)
                return [node["id"] for node in all_installations]
            
            assigned_installations = user.get("assigned_installations", [])
            
            if not assigned_installations:
                return []
            
            # Find installation nodes matching the assigned names
            installation_nodes = await self.db.equipment_nodes.find(
                {
                    "level": "installation",
                    "name": {"$in": assigned_installations}
                },
                {"_id": 0, "id": 1, "name": 1}
            ).to_list(100)
            
            return [node["id"] for node in installation_nodes]
        except Exception as e:
            logger.error(f"Error getting user installation IDs: {e}")
            return []
    
    async def get_all_installation_names(self) -> List[str]:
        """Get all installation names (for owner role display)."""
        try:
            installations = await self.db.equipment_nodes.find(
                {"level": "installation"},
                {"_id": 0, "name": 1}
            ).to_list(500)
            return [inst["name"] for inst in installations]
        except Exception as e:
            logger.error(f"Error getting installation names: {e}")
            return []
    
    async def get_all_equipment_ids_for_installations(
        self, 
        installation_ids: List[str],
        user_id: str = None  # user_id is no longer used for filtering
    ) -> Set[str]:
        """
        Get ALL equipment node IDs (at all levels) that belong to the given installations.
        This includes the installation itself and all descendants.
        Equipment is shared - anyone with installation access can see all equipment under it.
        """
        if not installation_ids:
            return set()
        
        try:
            all_ids = set(installation_ids)
            
            # Recursively get all children (without created_by filter - equipment is shared)
            # Use iteration instead of recursion to prevent stack overflow
            parents_to_process = list(installation_ids)
            processed = set()
            
            while parents_to_process:
                # Process in batches to avoid memory issues
                batch = parents_to_process[:100]
                parents_to_process = parents_to_process[100:]
                
                # Skip already processed
                batch = [p for p in batch if p not in processed]
                if not batch:
                    continue
                
                processed.update(batch)
                
                children = await self.db.equipment_nodes.find(
                    {"parent_id": {"$in": batch}},
                    {"_id": 0, "id": 1}
                ).to_list(5000)
                
                for c in children:
                    child_id = c["id"]
                    if child_id not in all_ids:
                        all_ids.add(child_id)
                        parents_to_process.append(child_id)
            
            return all_ids
        except Exception as e:
            logger.error(f"Error getting equipment IDs for installations: {e}")
            return set(installation_ids)  # Return at least the installation IDs
    
    async def get_equipment_names_for_installations(
        self,
        installation_ids: List[str],
        user_id: str = None  # user_id no longer used
    ) -> Set[str]:
        """
        Get all equipment names that belong to the given installations.
        Used for filtering threats/observations by asset name.
        Equipment is shared - no user filtering.
        """
        if not installation_ids:
            return set()
        
        all_equipment_ids = await self.get_all_equipment_ids_for_installations(
            installation_ids, user_id
        )
        
        if not all_equipment_ids:
            return set()
        
        equipment_nodes = await self.db.equipment_nodes.find(
            {"id": {"$in": list(all_equipment_ids)}},
            {"_id": 0, "name": 1}
        ).to_list(5000)
        
        return {node["name"] for node in equipment_nodes}
    
    def build_threat_filter(
        self,
        user_id: str,
        equipment_ids: Set[str],
        equipment_names: Set[str],
        additional_filters: dict = None
    ) -> dict:
        """
        Build a MongoDB query filter for threats based on assigned installations.
        Threats are filtered by:
        - linked_equipment_id in equipment_ids, OR
        - asset name in equipment_names
        Note: Threats are shared - anyone with installation access can see them.
        """
        if not equipment_ids and not equipment_names:
            # No installations assigned - return impossible filter (no results)
            return {"_impossible": True}
        
        base_filter = {
            "$or": []
        }
        
        if equipment_ids:
            base_filter["$or"].append({"linked_equipment_id": {"$in": list(equipment_ids)}})
        
        if equipment_names:
            base_filter["$or"].append({"asset": {"$in": list(equipment_names)}})
        
        # If no $or conditions, return impossible filter
        if not base_filter["$or"]:
            return {"_impossible": True}
        
        # Add additional filters
        if additional_filters:
            for key, value in additional_filters.items():
                if key not in ["$or"]:
                    base_filter[key] = value
        
        return base_filter
    
    def build_action_filter(
        self,
        user_id: str,
        equipment_ids: Set[str],
        equipment_names: Set[str],
        threat_ids: List[str] = None,
        investigation_ids: List[str] = None,
        additional_filters: dict = None
    ) -> dict:
        """
        Build a MongoDB query filter for actions based on assigned installations.
        Actions are filtered by source threats or investigations that belong to assigned installations.
        Note: Actions are shared - anyone with installation access can see them.
        """
        if not equipment_ids and not equipment_names and not threat_ids and not investigation_ids:
            return {"_impossible": True}
        
        base_filter = {
            "$or": []
        }
        
        if threat_ids:
            base_filter["$or"].append({"source_id": {"$in": threat_ids}, "source_type": "threat"})
        
        if investigation_ids:
            base_filter["$or"].append({"source_id": {"$in": investigation_ids}, "source_type": "investigation"})
        
        if equipment_ids:
            base_filter["$or"].append({"linked_equipment_id": {"$in": list(equipment_ids)}})
        
        if equipment_names:
            base_filter["$or"].append({"equipment_name": {"$in": list(equipment_names)}})
        
        # Also include AI recommendations linked to threats
        if threat_ids:
            base_filter["$or"].append({"source_id": {"$in": threat_ids}, "source_type": "ai_recommendation"})
        
        if not base_filter["$or"]:
            return {"_impossible": True}
        
        if additional_filters:
            for key, value in additional_filters.items():
                if key not in ["$or"]:
                    base_filter[key] = value
        
        return base_filter
    
    async def get_filtered_threat_ids(
        self,
        user_id: str,
        equipment_ids: Set[str],
        equipment_names: Set[str]
    ) -> List[str]:
        """Get all threat IDs that belong to the user's assigned installations."""
        query_filter = self.build_threat_filter(
            user_id, equipment_ids, equipment_names
        )
        
        if query_filter.get("_impossible"):
            return []
        
        threats = await self.db.threats.find(
            query_filter,
            {"_id": 0, "id": 1}
        ).to_list(5000)
        
        return [t["id"] for t in threats]
    
    async def get_filtered_investigation_ids(
        self,
        user_id: str,
        equipment_ids: Set[str],
        equipment_names: Set[str]
    ) -> List[str]:
        """Get all investigation IDs that belong to the user's assigned installations."""
        # For now, return all investigations since they don't have direct equipment linking
        # The filtering happens through threats that are linked to investigations
        investigations = await self.db.investigations.find(
            {},
            {"_id": 0, "id": 1}
        ).to_list(5000)
        
        return [inv["id"] for inv in investigations]
    
    def has_installation_access(self, user: dict) -> bool:
        """Check if user has any installations assigned or is owner."""
        # Owner always has access to all
        if self.is_owner(user):
            return True
        assigned = user.get("assigned_installations", [])
        return len(assigned) > 0
