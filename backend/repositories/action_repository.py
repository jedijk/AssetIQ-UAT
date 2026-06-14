"""Central action persistence — tenant-scoped repository."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from bson import ObjectId

from database import db
from repositories.base import TenantScopedRepository, flexible_id_query


class ActionRepository(TenantScopedRepository):
    collection_name = "central_actions"

    async def find_by_id(
        self,
        action_id: str,
        *,
        user: Optional[dict] = None,
        include_mongo_id: bool = False,
    ) -> Optional[dict]:
        projection = None if include_mongo_id else {"_id": 0}
        action = await self.find_one({"id": action_id}, user=user, projection=projection)
        if action:
            return action
        try:
            oid_query = flexible_id_query(action_id)
            if "_id" in oid_query:
                return await self.find_one(oid_query, user=user, projection=projection)
            return await self.find_one(
                {"_id": ObjectId(action_id)},
                user=user,
                projection=projection,
            )
        except Exception:
            return None

    async def find_by_source(
        self,
        source_type: str,
        source_id: str,
        *,
        user: Optional[dict] = None,
        limit: int = 100,
    ) -> List[dict]:
        return await self.find_many(
            {"source_type": source_type, "source_id": source_id},
            user=user,
            limit=limit,
        )

    async def list_actions(
        self,
        query: Dict[str, Any],
        *,
        user: Optional[dict] = None,
        limit: int = 1000,
        sort=None,
    ) -> List[dict]:
        filt = self.scoped_filter(query, user)
        cursor = self.collection.find(filt, {"_id": 0})
        if sort:
            cursor = cursor.sort(sort)
        return await cursor.limit(limit).to_list(limit)

    async def aggregate_stats(
        self,
        base_query: Dict[str, Any],
        *,
        user: Optional[dict] = None,
        now_iso: str,
    ) -> Dict[str, int]:
        filt = self.scoped_filter(base_query, user)
        pipeline = [
            {"$match": filt},
            {
                "$facet": {
                    "total": [{"$count": "count"}],
                    "open": [{"$match": {"status": "open"}}, {"$count": "count"}],
                    "in_progress": [{"$match": {"status": "in_progress"}}, {"$count": "count"}],
                    "completed": [{"$match": {"status": "completed"}}, {"$count": "count"}],
                    "overdue": [
                        {
                            "$match": {
                                "status": {"$in": ["open", "in_progress"]},
                                "due_date": {"$lt": now_iso, "$ne": None},
                            }
                        },
                        {"$count": "count"},
                    ],
                }
            },
        ]
        result = await self.collection.aggregate(pipeline).to_list(1)
        if not result:
            return {"total": 0, "open": 0, "in_progress": 0, "completed": 0, "overdue": 0}
        facets = result[0]
        return {
            "total": facets["total"][0]["count"] if facets["total"] else 0,
            "open": facets["open"][0]["count"] if facets["open"] else 0,
            "in_progress": facets["in_progress"][0]["count"] if facets["in_progress"] else 0,
            "completed": facets["completed"][0]["count"] if facets["completed"] else 0,
            "overdue": facets["overdue"][0]["count"] if facets["overdue"] else 0,
        }

    async def count_open_for_source(
        self,
        source_type: str,
        source_id: str,
        *,
        user: Optional[dict] = None,
    ) -> int:
        return await self.count(
            {
                "source_type": source_type,
                "source_id": source_id,
                "status": {"$ne": "completed"},
            },
            user=user,
        )

    async def count_for_source(
        self,
        source_type: str,
        source_id: str,
        *,
        user: Optional[dict] = None,
    ) -> int:
        return await self.count(
            {"source_type": source_type, "source_id": source_id},
            user=user,
        )

    def delete_filter(self, action_id: str, user: dict) -> Dict[str, Any]:
        base: Dict[str, Any] = {"id": action_id}
        if user.get("role") not in ("owner", "admin"):
            base["created_by"] = user.get("id")
        return self.scoped_filter(base, user)

    async def delete_by_id(self, action_id: str, *, user: dict) -> bool:
        filt = self.delete_filter(action_id, user)
        result = await self.collection.delete_one(filt)
        return result.deleted_count > 0

    async def update_mongo_doc(self, mongo_id, update: Dict[str, Any]) -> None:
        await self.collection.update_one({"_id": mongo_id}, update)

    async def find_by_mongo_id(
        self,
        mongo_id,
        *,
        projection: Optional[Dict[str, Any]] = None,
    ) -> Optional[dict]:
        return await self.collection.find_one({"_id": mongo_id}, projection or {"_id": 0})


async def delete_central_action(*, action_id: str, user: dict) -> None:
    """Delete a central action with tenant scope and role checks."""
    if not user:
        raise ValueError("user_required")

    repo = ActionRepository(db)
    action = await repo.find_by_id(action_id, user=user)
    if not action:
        raise ValueError("not_found")

    deleted = await repo.delete_by_id(action_id, user=user)
    if not deleted:
        raise ValueError("forbidden")
