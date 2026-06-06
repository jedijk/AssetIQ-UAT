"""PM Import session lifecycle and task review."""
from __future__ import annotations

import os
import io
import re
import json
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.pm_import_constants import (
    PM_IMPORT_DISPLAY_STATUSES,
    ACTION_TYPES,
    ACTION_TYPE_KEYWORDS,
    DISCIPLINE_KEYWORDS,
    DURATION_PATTERNS,
    FREQUENCY_PATTERNS,
    TAG_REGEX,
    TASK_CLASSIFICATION_RULES,
    TASK_TYPE_DEFAULTS,
    TASK_TYPES,
    _sanitize_for_json,
    normalize_pm_import_display_status,
)

logger = logging.getLogger(__name__)


class PMImportMixin:
    """Mixin — use only via PMImportService."""

    async def _ai_user_context(self, session_id: Optional[str] = None) -> Tuple[str, str]:
        """Resolve user/company for AI cost attribution from import session."""
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
        created_by: str
    ) -> str:
        """Create a session placeholder for background processing. Returns session_id."""
        
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        session = {
            "session_id": session_id,
            "file_name": file_name,
            "file_type": file_type,
            "status": "processing",
            "progress": 0,
            "progress_message": "Initializing...",
            "tasks_extracted": [],
            "stats": {
                "total_tasks": 0,
                "failure_modes_identified": 0,
                "existing_matches": 0,
                "new_proposed": 0,
                "low_confidence_items": 0,
                "manual_review_required": 0
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
        file_content: bytes
    ) -> None:
        """Process a PM import session (called as background task)."""
        
        try:
            tasks = await self._process_file(
                session_id, file_name, file_type, file_content
            )
            
            # Update session with results
            stats = self._calculate_stats(tasks)
            
            await self.sessions_collection.update_one(
                {"session_id": session_id},
                {"$set": {
                    "status": "ready_for_review",
                    "progress": 100,
                    "progress_message": "Processing complete",
                    "tasks_extracted": tasks,
                    "stats": stats,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            logger.info(f"PM Import session {session_id} completed with {len(tasks)} tasks")
            
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
    
    async def create_session(
        self,
        file_name: str,
        file_type: str,
        file_content: bytes,
        created_by: str
    ) -> Dict[str, Any]:
        """Create a new PM import session and start processing (legacy sync method)."""
        
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        session = {
            "session_id": session_id,
            "file_name": file_name,
            "file_type": file_type,
            "status": "processing",
            "progress": 0,
            "progress_message": "Initializing...",
            "tasks_extracted": [],
            "stats": {
                "total_tasks": 0,
                "failure_modes_identified": 0,
                "existing_matches": 0,
                "new_proposed": 0,
                "low_confidence_items": 0,
                "manual_review_required": 0
            },
            "created_by": created_by,
            "created_at": now,
            "updated_at": now
        }
        
        await self.sessions_collection.insert_one(session)
        
        # Process the file
        try:
            tasks = await self._process_file(
                session_id, file_name, file_type, file_content
            )
            
            # Update session with results
            stats = self._calculate_stats(tasks)
            
            await self.sessions_collection.update_one(
                {"session_id": session_id},
                {"$set": {
                    "status": "ready_for_review",
                    "progress": 100,
                    "progress_message": "Processing complete",
                    "tasks_extracted": tasks,
                    "stats": stats,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            
            session["status"] = "ready_for_review"
            session["progress"] = 100
            session["tasks_extracted"] = tasks
            session["stats"] = stats
            
        except Exception as e:
            logger.error(f"Error processing file: {e}", exc_info=True)
            await self.sessions_collection.update_one(
                {"session_id": session_id},
                {"$set": {
                    "status": "error",
                    "error_message": str(e),
                    "progress_message": f"Error: {str(e)[:200]}",
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            session["status"] = "error"
            session["error_message"] = str(e)
        
        return session
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a PM import session by ID."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if session:
            session["_id"] = str(session["_id"])
        return session
    async def update_task(
        self,
        session_id: str,
        task_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a specific task in a session."""
        
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        tasks = session.get("tasks_extracted", [])
        for task in tasks:
            if task.get("task_id") == task_id:
                task.update(updates)
                # Only set to "edited" if review_status is not explicitly being updated
                if "review_status" not in updates:
                    task["review_status"] = "edited"
                break
        
        # Recalculate stats
        stats = self._calculate_stats(tasks)
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "tasks_extracted": tasks,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"tasks": tasks, "stats": stats}
    
    async def accept_task(self, session_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        """Mark a task as accepted for import."""
        return await self.update_task(session_id, task_id, {"review_status": "accepted"})
    
    async def reject_task(self, session_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        """Mark a task as rejected (won't be imported)."""
        return await self.update_task(session_id, task_id, {"review_status": "rejected"})
    
    async def delete_task(self, session_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        """Remove a task from a session entirely."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        tasks = session.get("tasks_extracted", [])
        new_tasks = [t for t in tasks if t.get("task_id") != task_id]
        if len(new_tasks) == len(tasks):
            return None
        
        stats = self._calculate_stats(new_tasks)
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "tasks_extracted": new_tasks,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"tasks": new_tasks, "stats": stats}
    
    async def accept_all_high_confidence(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Accept all tasks with confidence >= 70."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        tasks = session.get("tasks_extracted", [])
        accepted_count = 0
        
        for task in tasks:
            if task.get("confidence_score", 0) >= 70 and task.get("review_status") == "pending":
                task["review_status"] = "accepted"
                accepted_count += 1
        
        stats = self._calculate_stats(tasks)
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "tasks_extracted": tasks,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"accepted_count": accepted_count, "tasks": tasks, "stats": stats}
    
    async def _update_progress(self, session_id: str, progress: int, message: str):
        """Update session progress."""
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "progress": progress,
                "progress_message": message,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
