"""
User Statistics Service - Event tracking and analytics.

Provides:
- Event ingestion and storage
- Session management (15-min inactivity timeout)
- Pre-aggregated daily statistics
- Real-time metrics calculation
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)

# Session timeout in minutes
SESSION_TIMEOUT_MINUTES = 15


class UserStatsService:
    """Service for user statistics and event tracking."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.events = db["user_events"]
        self.daily_stats = db["user_stats_daily"]
        self.users = db["users"]
    
    # ==================== EVENT TRACKING ====================
    
    async def track_event(
        self,
        user_id: str,
        user_name: str,
        user_role: str,
        session_id: str,
        module: str,
        page: Optional[str] = None,
        action: Optional[str] = None,
        event_type: str = "page_view",
        duration: Optional[int] = None,
        device_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Track a user event."""
        
        event = {
            "user_id": user_id,
            "user_name": user_name,
            "user_role": user_role,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc),
            "module": module,
            "page": page,
            "action": action,
            "event_type": event_type,
            "duration": duration,
            "device_type": device_type or "desktop",  # Default to desktop if not provided
            "metadata": metadata or {}
        }
        
        result = await self.events.insert_one(event)
        
        return {
            "success": True,
            "event_id": str(result.inserted_id)
        }
    
    async def track_batch_events(
        self,
        events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Track multiple events at once (for offline sync)."""
        
        if not events:
            return {"success": True, "count": 0}
        
        # Add timestamps if missing
        for event in events:
            if "timestamp" not in event:
                event["timestamp"] = datetime.now(timezone.utc)
            elif isinstance(event["timestamp"], str):
                event["timestamp"] = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))
        
        result = await self.events.insert_many(events)
        
        return {
            "success": True,
            "count": len(result.inserted_ids)
        }
    
    # ==================== STATISTICS RETRIEVAL ====================
    
    async def get_user_statistics(
        self,
        start_date: datetime,
        end_date: datetime,
        user_role_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get comprehensive user statistics for a date range."""
        
        # Base match for date range
        match_stage = {
            "timestamp": {"$gte": start_date, "$lte": end_date}
        }
        
        if user_role_filter:
            match_stage["user_role"] = user_role_filter
        
        # Get KPI metrics
        kpis = await self._get_kpi_metrics(match_stage)
        
        # Get module usage
        module_usage = await self._get_module_usage(match_stage)
        
        # Get user activity
        user_activity = await self._get_user_activity(match_stage)
        
        # Get action usage (feature tracking)
        action_usage = await self._get_action_usage(match_stage)
        
        # Get device usage (desktop vs mobile)
        device_usage = await self._get_device_usage(match_stage)
        
        # Get daily trends
        daily_trends = await self._get_daily_trends(match_stage, start_date, end_date)
        
        # Determine most/least used modules
        most_used = module_usage[0]["module"] if module_usage else None
        least_used = module_usage[-1]["module"] if module_usage else None
        
        # Get total user count
        total_users = await self.users.count_documents({})

        return {
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
            
            # KPI Summary
            "total_users": total_users,
            "active_users": kpis.get("active_users", 0),
            "total_sessions": kpis.get("total_sessions", 0),
            "total_views": kpis.get("total_views", 0),
            "avg_session_duration": kpis.get("avg_session_duration", 0),
            "most_used_module": most_used,
            "least_used_module": least_used,
            
            # Device breakdown
            "device_usage": device_usage,
            
            # Tables
            "module_usage": module_usage,
            "user_activity": user_activity,
            "action_usage": action_usage,
            
            # Trends
            "daily_active_users": daily_trends.get("daily_active_users", []),
            "daily_views": daily_trends.get("daily_views", []),
            "module_usage_over_time": daily_trends.get("module_usage_over_time", [])
        }
    
    async def _get_kpi_metrics(self, match_stage: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate KPI metrics."""
        
        pipeline = [
            {"$match": match_stage},
            {"$group": {
                "_id": None,
                "active_users": {"$addToSet": "$user_name"},
                "total_sessions": {"$addToSet": "$session_id"},
                "total_views": {"$sum": {"$cond": [{"$eq": ["$event_type", "page_view"]}, 1, 0]}},
                "total_duration": {"$sum": {"$ifNull": ["$duration", 0]}},
                "duration_count": {"$sum": {"$cond": [{"$gt": ["$duration", 0]}, 1, 0]}}
            }}
        ]
        
        result = await self.events.aggregate(pipeline).to_list(1)
        
        if not result:
            return {
                "active_users": 0,
                "total_sessions": 0,
                "total_views": 0,
                "avg_session_duration": 0
            }
        
        r = result[0]
        active_users = len(r.get("active_users", []))
        total_sessions = len(r.get("total_sessions", []))
        total_views = r.get("total_views", 0)
        total_duration = r.get("total_duration", 0)
        duration_count = r.get("duration_count", 0)
        
        avg_duration = total_duration / duration_count if duration_count > 0 else 0
        
        return {
            "active_users": active_users,
            "total_sessions": total_sessions,
            "total_views": total_views,
            "avg_session_duration": round(avg_duration, 1)
        }
    
    async def _get_module_usage(self, match_stage: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get module usage statistics."""
        
        pipeline = [
            {"$match": {**match_stage, "event_type": "page_view"}},
            {"$group": {
                "_id": "$module",
                "views": {"$sum": 1},
                "unique_users": {"$addToSet": "$user_name"},
                "total_duration": {"$sum": {"$ifNull": ["$duration", 0]}},
                "duration_count": {"$sum": {"$cond": [{"$gt": ["$duration", 0]}, 1, 0]}}
            }},
            {"$sort": {"views": -1}}
        ]
        
        results = []
        total_views = 0
        
        async for doc in self.events.aggregate(pipeline):
            total_views += doc["views"]
            results.append(doc)
        
        # Calculate percentages and format
        formatted = []
        for doc in results:
            unique_users = len(doc.get("unique_users", []))
            duration_count = doc.get("duration_count", 0)
            total_duration = doc.get("total_duration", 0)
            avg_time = total_duration / duration_count if duration_count > 0 else 0
            
            formatted.append({
                "module": doc["_id"],
                "views": doc["views"],
                "unique_users": unique_users,
                "percentage": round((doc["views"] / total_views * 100) if total_views > 0 else 0, 1),
                "avg_time_spent": round(avg_time, 1)
            })
        
        return formatted
    
    async def _get_user_activity(self, match_stage: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get user activity statistics combining tracked events and actual data."""
        
        # Get all users first for name resolution
        all_users = await self.users.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}).to_list(200)
        
        # Get tracked event data per user — group by user_name since user_id may be null
        # Build a name→user mapping for lookup
        name_to_user = {}
        for u in all_users:
            name = u.get("name", "").strip().lower()
            if name:
                name_to_user[name] = u
        
        pipeline = [
            {"$match": match_stage},
            {"$group": {
                "_id": "$user_name",
                "last_active": {"$max": "$timestamp"},
                "sessions": {"$addToSet": "$session_id"},
                "module_counts": {"$push": "$module"}
            }},
            {"$sort": {"last_active": -1}},
            {"$limit": 50}
        ]
        
        tracked_by_name = {}
        async for doc in self.events.aggregate(pipeline):
            uname = doc["_id"]
            if not uname:
                continue
            module_counts = {}
            for m in doc.get("module_counts", []):
                if m:
                    module_counts[m] = module_counts.get(m, 0) + 1
            most_used = max(module_counts, key=module_counts.get) if module_counts else None
            tracked_by_name[uname.strip().lower()] = {
                "last_active": doc.get("last_active"),
                "sessions": len(doc.get("sessions", [])),
                "most_used_module": most_used,
            }

        def parse_dt(val):
            if val is None:
                return None
            if isinstance(val, datetime):
                return val.replace(tzinfo=timezone.utc) if val.tzinfo is None else val
            if isinstance(val, str):
                try:
                    p = datetime.fromisoformat(val.replace("Z", "+00:00"))
                    return p.replace(tzinfo=timezone.utc) if p.tzinfo is None else p
                except (ValueError, TypeError):
                    return None
            return None

        results = []
        user_ids = [u["id"] for u in all_users if u.get("id")]

        # Batch: aggregate counts and latest dates per user from all collections at once
        async def agg_by_user(collection, user_field="created_by", date_field="created_at"):
            pipe = [
                {"$match": {user_field: {"$in": user_ids}}},
                {"$group": {"_id": f"${user_field}", "count": {"$sum": 1}, "latest": {"$max": f"${date_field}"}}}
            ]
            out = {}
            async for d in self.db[collection].aggregate(pipe):
                out[d["_id"]] = {"count": d["count"], "latest": d.get("latest")}
            return out

        threats_m = await agg_by_user("threats")
        actions_m = await agg_by_user("actions")
        ca_m = await agg_by_user("central_actions")
        forms_m = await agg_by_user("form_submissions", "submitted_by", "submitted_at")

        for user in all_users:
            uid = user.get("id")
            if not uid:
                continue
            
            t = threats_m.get(uid, {})
            a = actions_m.get(uid, {})
            ca = ca_m.get(uid, {})
            f = forms_m.get(uid, {})
            total_actions = t.get("count", 0) + a.get("count", 0) + ca.get("count", 0) + f.get("count", 0)

            # Find last active across all sources
            last_active = None
            for dt_val in [t.get("latest"), a.get("latest"), ca.get("latest"), f.get("latest")]:
                dt = parse_dt(dt_val)
                if dt and (not last_active or dt > last_active):
                    last_active = dt

            tracked = tracked_by_name.get((user.get("name") or "").strip().lower(), {})
            tracked_last = parse_dt(tracked.get("last_active"))
            if tracked_last and (not last_active or tracked_last > last_active):
                last_active = tracked_last

            biz_modules = []
            if t.get("count"):
                biz_modules.append(("Observations", t["count"]))
            if a.get("count", 0) + ca.get("count", 0):
                biz_modules.append(("Actions", a.get("count", 0) + ca.get("count", 0)))
            if f.get("count"):
                biz_modules.append(("Forms", f["count"]))

            most_used = tracked.get("most_used_module")
            if not most_used and biz_modules:
                most_used = max(biz_modules, key=lambda x: x[1])[0]
            if not most_used:
                most_used = "Dashboard"

            results.append({
                "user_id": uid,
                "user_name": user.get("name") or user.get("email", "Unknown"),
                "email": user.get("email", ""),
                "role": user.get("role", "user"),
                "last_active": last_active.isoformat() if last_active else None,
                "sessions": tracked.get("sessions", 0),
                "actions": total_actions,
                "most_used_module": most_used,
            })
        
        results.sort(key=lambda x: x["actions"], reverse=True)
        return results
    
    async def _get_action_usage(self, match_stage: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get action/feature usage statistics."""
        
        pipeline = [
            {"$match": {**match_stage, "action": {"$exists": True, "$ne": None}}},
            {"$group": {
                "_id": "$action",
                "total_count": {"$sum": 1},
                "unique_users": {"$addToSet": "$user_name"}
            }},
            {"$sort": {"total_count": -1}},
            {"$limit": 20}
        ]
        
        results = []
        async for doc in self.events.aggregate(pipeline):
            results.append({
                "action_name": doc["_id"],
                "total_count": doc["total_count"],
                "unique_users": len(doc.get("unique_users", []))
            })
        
        return results
    
    async def _get_device_usage(self, match_stage: Dict[str, Any]) -> Dict[str, Any]:
        """Get device type usage statistics (desktop vs mobile vs tablet)."""
        
        pipeline = [
            {"$match": match_stage},
            {"$group": {
                "_id": {"$ifNull": ["$device_type", "desktop"]},
                "views": {"$sum": 1},
                "unique_users": {"$addToSet": "$user_name"},
                "sessions": {"$addToSet": "$session_id"}
            }},
            {"$sort": {"views": -1}}
        ]
        
        results = []
        total_views = 0
        
        async for doc in self.events.aggregate(pipeline):
            total_views += doc["views"]
            results.append({
                "device": doc["_id"],
                "views": doc["views"],
                "unique_users": len(doc.get("unique_users", [])),
                "sessions": len(doc.get("sessions", []))
            })
        
        # Calculate percentages
        for r in results:
            r["percentage"] = round((r["views"] / total_views * 100) if total_views > 0 else 0, 1)
        
        # Return as breakdown dict for easy frontend consumption
        device_breakdown = {
            "desktop": {"views": 0, "unique_users": 0, "sessions": 0, "percentage": 0},
            "mobile": {"views": 0, "unique_users": 0, "sessions": 0, "percentage": 0},
            "tablet": {"views": 0, "unique_users": 0, "sessions": 0, "percentage": 0}
        }
        
        for r in results:
            device = r["device"].lower() if r["device"] else "desktop"
            if device in device_breakdown:
                device_breakdown[device] = {
                    "views": r["views"],
                    "unique_users": r["unique_users"],
                    "sessions": r["sessions"],
                    "percentage": r["percentage"]
                }
        
        return {
            "breakdown": device_breakdown,
            "raw": results,
            "total_views": total_views
        }
    
    async def _get_daily_trends(
        self,
        match_stage: Dict[str, Any],
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """Get daily trend data for charts."""
        
        # Daily active users
        dau_pipeline = [
            {"$match": match_stage},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "active_users": {"$addToSet": "$user_name"}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        daily_active_users = []
        async for doc in self.events.aggregate(dau_pipeline):
            daily_active_users.append({
                "date": doc["_id"],
                "count": len(doc.get("active_users", []))
            })
        
        # Daily views
        views_pipeline = [
            {"$match": {**match_stage, "event_type": "page_view"}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "views": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        daily_views = []
        async for doc in self.events.aggregate(views_pipeline):
            daily_views.append({
                "date": doc["_id"],
                "views": doc["views"]
            })
        
        # Module usage over time (for area chart)
        module_time_pipeline = [
            {"$match": {**match_stage, "event_type": "page_view"}},
            {"$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                    "module": "$module"
                },
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id.date": 1}}
        ]
        
        module_usage_over_time = {}
        async for doc in self.events.aggregate(module_time_pipeline):
            date = doc["_id"]["date"]
            module = doc["_id"]["module"]
            if date not in module_usage_over_time:
                module_usage_over_time[date] = {"date": date}
            module_usage_over_time[date][module] = doc["count"]
        
        return {
            "daily_active_users": daily_active_users,
            "daily_views": daily_views,
            "module_usage_over_time": list(module_usage_over_time.values())
        }
    
    # ==================== AGGREGATION (for cron job) ====================
    
    async def aggregate_daily_stats(self, date: datetime) -> Dict[str, Any]:
        """
        Aggregate statistics for a specific day.
        Called by scheduled job to pre-compute daily stats.
        """
        
        start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)
        
        # Get full stats for the day
        stats = await self.get_user_statistics(start_of_day, end_of_day)
        
        # Store aggregated stats
        daily_doc = {
            "date": start_of_day,
            **stats,
            "aggregated_at": datetime.now(timezone.utc)
        }
        
        # Upsert to avoid duplicates
        await self.daily_stats.update_one(
            {"date": start_of_day},
            {"$set": daily_doc},
            upsert=True
        )
        
        return daily_doc
    
    # ==================== SESSION MANAGEMENT ====================
    
    async def get_active_sessions(self) -> List[Dict[str, Any]]:
        """Get currently active sessions (within timeout window)."""
        
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=SESSION_TIMEOUT_MINUTES)
        
        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {"$group": {
                "_id": "$session_id",
                "user_id": {"$first": "$user_id"},
                "user_name": {"$first": "$user_name"},
                "last_activity": {"$max": "$timestamp"},
                "events_count": {"$sum": 1}
            }},
            {"$sort": {"last_activity": -1}}
        ]
        
        sessions = []
        async for doc in self.events.aggregate(pipeline):
            sessions.append({
                "session_id": doc["_id"],
                "user_id": doc["user_id"],
                "user_name": doc.get("user_name", "Unknown"),
                "last_activity": doc["last_activity"].isoformat(),
                "events_count": doc["events_count"]
            })
        
        return sessions
