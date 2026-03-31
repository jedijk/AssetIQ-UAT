"""
AI Usage Tracking Service
Tracks token consumption per installation for admin monitoring.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class AIUsageTracker:
    """Service to track and query AI token usage per installation."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["ai_usage"]
    
    async def log_usage(
        self,
        installation_id: str,
        installation_name: str,
        user_id: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        feature: str,  # e.g., "image_analysis", "risk_analysis", "maintenance_strategy", "voice_transcription"
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Log an AI API usage event.
        
        Args:
            installation_id: ID of the installation (equipment hierarchy root)
            installation_name: Name of the installation
            user_id: User who triggered the AI call
            model: Model name (e.g., "gpt-5.2", "whisper-1")
            prompt_tokens: Number of prompt/input tokens
            completion_tokens: Number of completion/output tokens
            feature: Which feature used the AI
            metadata: Additional metadata
        
        Returns:
            The logged usage record
        """
        total_tokens = prompt_tokens + completion_tokens
        
        record = {
            "installation_id": installation_id,
            "installation_name": installation_name,
            "user_id": user_id,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "feature": feature,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
        
        await self.collection.insert_one(record)
        logger.info(f"AI usage logged: {total_tokens} tokens for {feature} in {installation_name}")
        
        return {k: v for k, v in record.items() if k != "_id"}
    
    async def get_usage_by_installation(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        installation_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get aggregated AI usage grouped by installation.
        
        Args:
            start_date: Start date (YYYY-MM-DD), default 30 days ago
            end_date: End date (YYYY-MM-DD), default today
            installation_id: Optional filter by specific installation
        
        Returns:
            List of usage summaries per installation
        """
        # Default date range: last 30 days
        if not end_date:
            end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        
        match_stage = {
            "date": {"$gte": start_date, "$lte": end_date}
        }
        
        if installation_id:
            match_stage["installation_id"] = installation_id
        
        pipeline = [
            {"$match": match_stage},
            {
                "$group": {
                    "_id": {
                        "installation_id": "$installation_id",
                        "installation_name": "$installation_name"
                    },
                    "total_tokens": {"$sum": "$total_tokens"},
                    "prompt_tokens": {"$sum": "$prompt_tokens"},
                    "completion_tokens": {"$sum": "$completion_tokens"},
                    "request_count": {"$sum": 1},
                    "models_used": {"$addToSet": "$model"},
                    "features_used": {"$addToSet": "$feature"},
                    "last_used": {"$max": "$timestamp"}
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "installation_id": "$_id.installation_id",
                    "installation_name": "$_id.installation_name",
                    "total_tokens": 1,
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "request_count": 1,
                    "models_used": 1,
                    "features_used": 1,
                    "last_used": 1
                }
            },
            {"$sort": {"total_tokens": -1}}
        ]
        
        results = await self.collection.aggregate(pipeline).to_list(100)
        return results
    
    async def get_usage_by_date(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        installation_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get daily AI usage breakdown.
        
        Returns:
            List of daily usage summaries
        """
        if not end_date:
            end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        
        match_stage = {
            "date": {"$gte": start_date, "$lte": end_date}
        }
        
        if installation_id:
            match_stage["installation_id"] = installation_id
        
        pipeline = [
            {"$match": match_stage},
            {
                "$group": {
                    "_id": "$date",
                    "total_tokens": {"$sum": "$total_tokens"},
                    "prompt_tokens": {"$sum": "$prompt_tokens"},
                    "completion_tokens": {"$sum": "$completion_tokens"},
                    "request_count": {"$sum": 1}
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "date": "$_id",
                    "total_tokens": 1,
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "request_count": 1
                }
            },
            {"$sort": {"date": -1}}
        ]
        
        results = await self.collection.aggregate(pipeline).to_list(100)
        return results
    
    async def get_usage_summary(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get overall usage summary.
        
        Returns:
            Summary with totals and breakdowns
        """
        if not end_date:
            end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        
        match_stage = {
            "date": {"$gte": start_date, "$lte": end_date}
        }
        
        pipeline = [
            {"$match": match_stage},
            {
                "$group": {
                    "_id": None,
                    "total_tokens": {"$sum": "$total_tokens"},
                    "prompt_tokens": {"$sum": "$prompt_tokens"},
                    "completion_tokens": {"$sum": "$completion_tokens"},
                    "request_count": {"$sum": 1},
                    "unique_installations": {"$addToSet": "$installation_id"},
                    "models_used": {"$addToSet": "$model"},
                    "features_used": {"$addToSet": "$feature"}
                }
            }
        ]
        
        results = await self.collection.aggregate(pipeline).to_list(1)
        
        if not results:
            return {
                "total_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "request_count": 0,
                "unique_installations": 0,
                "models_used": [],
                "features_used": [],
                "date_range": {"start": start_date, "end": end_date}
            }
        
        result = results[0]
        return {
            "total_tokens": result.get("total_tokens", 0),
            "prompt_tokens": result.get("prompt_tokens", 0),
            "completion_tokens": result.get("completion_tokens", 0),
            "request_count": result.get("request_count", 0),
            "unique_installations": len(result.get("unique_installations", [])),
            "models_used": result.get("models_used", []),
            "features_used": result.get("features_used", []),
            "date_range": {"start": start_date, "end": end_date}
        }


# Singleton instance (initialized in database.py)
ai_usage_tracker: Optional[AIUsageTracker] = None


def get_ai_usage_tracker() -> AIUsageTracker:
    """Get the AI usage tracker instance."""
    if ai_usage_tracker is None:
        raise RuntimeError("AI usage tracker not initialized")
    return ai_usage_tracker
