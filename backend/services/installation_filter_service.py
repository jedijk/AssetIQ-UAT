"""
Installation-based filtering service.
Filters all data based on user's assigned installations.
"""
import logging
from typing import List, Optional, Set

logger = logging.getLogger(__name__)


class InstallationFilterService:
    """Service to handle installation-based data filtering."""
    
    def __init__(self, db):
        self.db = db
    
    async def get_user_installation_ids(self, user: dict) -> List[str]:
        """
        Get the equipment node IDs for installations assigned to the user.
        Returns empty list if no installations assigned (which means no data access).
        """
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
        
        all_ids = set(installation_ids)
        
        # Recursively get all children (without created_by filter - equipment is shared)
        async def get_descendants(parent_ids: List[str]) -> Set[str]:
            if not parent_ids:
                return set()
            
            children = await self.db.equipment_nodes.find(
                {
                    "parent_id": {"$in": parent_ids}
                },
                {"_id": 0, "id": 1}
            ).to_list(5000)
            
            child_ids = [c["id"] for c in children]
            if not child_ids:
                return set()
            
            result = set(child_ids)
            # Recursively get descendants of children
            result.update(await get_descendants(child_ids))
            return result
        
        descendants = await get_descendants(installation_ids)
        all_ids.update(descendants)
        
        return all_ids
    
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
        additional_filters: dict = None
    ) -> dict:
        """
        Build a MongoDB query filter for actions based on assigned installations.
        Actions are filtered by source threats that belong to assigned installations.
        Note: Actions are shared - anyone with installation access can see them.
        """
        if not equipment_ids and not equipment_names and not threat_ids:
            return {"_impossible": True}
        
        base_filter = {
            "$or": []
        }
        
        if threat_ids:
            base_filter["$or"].append({"source_id": {"$in": threat_ids}})
        
        if equipment_ids:
            base_filter["$or"].append({"linked_equipment_id": {"$in": list(equipment_ids)}})
        
        if equipment_names:
            base_filter["$or"].append({"equipment_name": {"$in": list(equipment_names)}})
        
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
    
    def has_installation_access(self, user: dict) -> bool:
        """Check if user has any installations assigned."""
        assigned = user.get("assigned_installations", [])
        return len(assigned) > 0
