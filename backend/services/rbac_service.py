"""
RBAC Service - Role-Based Access Control.

Implements 6 User Roles:
1. Owner: Super admin - sees all installations, full access
2. Admin: Full access, can manage users and roles
3. Reliability Engineer: Full access to analysis, limited settings
4. Maintenance: Task management, observations, limited analysis
5. Operations: View threats, create observations, limited editing
6. Viewer: Read-only access across the platform
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)

# Role definitions with permissions
ROLES = {
    "owner": {
        "name": "Owner",
        "description": "Super admin with access to all installations and full control",
        "permissions": [
            "users:read", "users:write", "users:delete",
            "threats:read", "threats:write", "threats:delete",
            "equipment:read", "equipment:write", "equipment:delete",
            "library:read", "library:write", "library:delete",
            "investigations:read", "investigations:write", "investigations:delete",
            "actions:read", "actions:write", "actions:delete",
            "tasks:read", "tasks:write", "tasks:delete",
            "forms:read", "forms:write", "forms:delete",
            "observations:read", "observations:write", "observations:delete",
            "decision_engine:read", "decision_engine:write",
            "analytics:read", "analytics:export",
            "settings:read", "settings:write",
            "installations:all"  # Special permission to see all installations
        ]
    },
    "admin": {
        "name": "Admin",
        "description": "Full access to all features including user management",
        "permissions": [
            "users:read", "users:write", "users:delete",
            "threats:read", "threats:write", "threats:delete",
            "equipment:read", "equipment:write", "equipment:delete",
            "library:read", "library:write", "library:delete",
            "investigations:read", "investigations:write", "investigations:delete",
            "actions:read", "actions:write", "actions:delete",
            "tasks:read", "tasks:write", "tasks:delete",
            "forms:read", "forms:write", "forms:delete",
            "observations:read", "observations:write", "observations:delete",
            "decision_engine:read", "decision_engine:write",
            "analytics:read", "analytics:export",
            "settings:read", "settings:write"
        ]
    },
    "reliability_engineer": {
        "name": "Reliability Engineer",
        "description": "Full analysis access, can manage library and investigations",
        "permissions": [
            "threats:read", "threats:write", "threats:delete",
            "equipment:read", "equipment:write",
            "library:read", "library:write",
            "investigations:read", "investigations:write", "investigations:delete",
            "actions:read", "actions:write",
            "tasks:read", "tasks:write",
            "forms:read", "forms:write",
            "observations:read", "observations:write", "observations:delete",
            "decision_engine:read", "decision_engine:write",
            "analytics:read", "analytics:export",
            "settings:read"
        ]
    },
    "maintenance": {
        "name": "Maintenance",
        "description": "Task management and observations focus",
        "permissions": [
            "threats:read",
            "equipment:read",
            "library:read",
            "investigations:read",
            "actions:read", "actions:write",
            "tasks:read", "tasks:write",
            "forms:read", "forms:write",
            "observations:read", "observations:write",
            "decision_engine:read",
            "analytics:read"
        ]
    },
    "operations": {
        "name": "Operations",
        "description": "Report threats and create observations",
        "permissions": [
            "threats:read", "threats:write",
            "equipment:read",
            "library:read",
            "investigations:read",
            "actions:read",
            "tasks:read",
            "forms:read", "forms:write",
            "observations:read", "observations:write",
            "analytics:read"
        ]
    },
    "viewer": {
        "name": "Viewer",
        "description": "Read-only access across the platform",
        "permissions": [
            "threats:read",
            "equipment:read",
            "library:read",
            "investigations:read",
            "actions:read",
            "tasks:read",
            "forms:read",
            "observations:read",
            "analytics:read"
        ]
    }
}


class RBACService:
    """Service for Role-Based Access Control operations."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.users = db["users"]
    
    def get_roles(self) -> Dict[str, Any]:
        """Get all available roles and their permissions."""
        return ROLES
    
    def get_role_permissions(self, role: str) -> List[str]:
        """Get permissions for a specific role."""
        role_def = ROLES.get(role)
        if role_def:
            return role_def["permissions"]
        return []
    
    def has_permission(self, user_role: str, permission: str) -> bool:
        """Check if a role has a specific permission."""
        permissions = self.get_role_permissions(user_role)
        
        # Check exact match or wildcard
        if permission in permissions:
            return True
        
        # Check category wildcard (e.g., "threats:*")
        category = permission.split(":")[0] if ":" in permission else permission
        if f"{category}:*" in permissions:
            return True
        
        return False
    
    async def get_users(
        self,
        search: Optional[str] = None,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get users with filtering."""
        query = {}
        
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}}
            ]
        
        if role:
            query["role"] = role
        
        if is_active is not None:
            query["is_active"] = is_active
        
        cursor = self.users.find(query, {"password_hash": 0}).sort("name", 1).skip(skip).limit(limit)
        users = []
        
        async for user in cursor:
            users.append(self._serialize_user(user))
        
        total = await self.users.count_documents(query)
        
        return {
            "users": users,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get a user by ID."""
        try:
            # Try both 'id' and 'user_id' fields for compatibility
            user = await self.users.find_one(
                {"$or": [{"id": user_id}, {"user_id": user_id}]},
                {"password_hash": 0}
            )
            if user:
                return self._serialize_user(user)
        except Exception as e:
            logger.error(f"Error getting user: {e}")
        return None
    
    async def update_user_role(
        self,
        user_id: str,
        new_role: str,
        updated_by: str
    ) -> Optional[Dict[str, Any]]:
        """Update a user's role."""
        if new_role not in ROLES:
            raise ValueError(f"Invalid role: {new_role}")
        
        # Try both 'id' and 'user_id' fields for compatibility
        result = await self.users.update_one(
            {"$or": [{"id": user_id}, {"user_id": user_id}]},
            {
                "$set": {
                    "role": new_role,
                    "role_updated_at": datetime.now(timezone.utc),
                    "role_updated_by": updated_by
                }
            }
        )
        
        if result.modified_count > 0:
            return await self.get_user(user_id)
        return None
    
    async def update_user_status(
        self,
        user_id: str,
        is_active: bool,
        updated_by: str
    ) -> Optional[Dict[str, Any]]:
        """Activate or deactivate a user."""
        # Try both 'id' and 'user_id' fields for compatibility
        result = await self.users.update_one(
            {"$or": [{"id": user_id}, {"user_id": user_id}]},
            {
                "$set": {
                    "is_active": is_active,
                    "status_updated_at": datetime.now(timezone.utc),
                    "status_updated_by": updated_by
                }
            }
        )
        
        if result.modified_count > 0:
            return await self.get_user(user_id)
        return None
    
    async def update_user_profile(
        self,
        user_id: str,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update user profile (name, department, position)."""
        allowed_fields = ["name", "department", "position", "phone", "default_simple_mode"]
        update_data = {k: v for k, v in data.items() if k in allowed_fields}
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        if update_data:
            # Try both 'id' and 'user_id' fields for compatibility
            result = await self.users.update_one(
                {"$or": [{"id": user_id}, {"user_id": user_id}]},
                {"$set": update_data}
            )
            
            if result.modified_count > 0:
                return await self.get_user(user_id)
        
        return await self.get_user(user_id)
    
    async def get_role_distribution(self) -> Dict[str, int]:
        """Get count of users per role."""
        pipeline = [
            {"$group": {"_id": "$role", "count": {"$sum": 1}}}
        ]
        
        distribution = {}
        async for doc in self.users.aggregate(pipeline):
            role = doc["_id"] or "viewer"  # Default to viewer if no role
            distribution[role] = doc["count"]
        
        return distribution
    
    async def ensure_user_has_role(self, user_id: str) -> None:
        """Ensure user has a role assigned (default: viewer)."""
        user = await self.users.find_one({"user_id": user_id})
        if user and not user.get("role"):
            await self.users.update_one(
                {"user_id": user_id},
                {"$set": {"role": "viewer", "is_active": True}}
            )
    
    def _serialize_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize user document for API response."""
        role = user.get("role", "viewer")
        role_info = ROLES.get(role, ROLES["viewer"])
        
        # Handle date fields that might already be strings or datetime objects
        def serialize_date(val):
            if val is None:
                return None
            if isinstance(val, str):
                return val
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return str(val)
        
        # Get user ID - could be 'user_id', 'id', or stringified '_id'
        user_id = user.get("user_id") or user.get("id") or (str(user["_id"]) if "_id" in user else None)
        
        return {
            "id": user_id,
            "email": user.get("email"),
            "name": user.get("name"),
            "role": role,
            "role_name": role_info["name"],
            "role_description": role_info["description"],
            "permissions": role_info["permissions"],
            "is_active": user.get("is_active", True),
            "department": user.get("department"),
            "position": user.get("position"),
            "phone": user.get("phone"),
            "assigned_installations": user.get("assigned_installations", []),
            "created_at": serialize_date(user.get("created_at")),
            "last_login": serialize_date(user.get("last_login")),
            "role_updated_at": serialize_date(user.get("role_updated_at")),
            "role_updated_by": user.get("role_updated_by")
        }
