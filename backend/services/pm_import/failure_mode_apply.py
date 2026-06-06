"""PM Import failure mode apply/persist."""
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

    @staticmethod
    def _mark_task_implemented(
        task: Dict[str, Any],
        failure_mode_id: str,
        apply_mode: str,
        replace_action_index: Optional[int] = None,
    ) -> None:
        """Record that a PM Import task was applied to the failure mode library."""
        task["import_status"] = (
            "merged" if apply_mode in ("replaced", "existing") else "applied"
        )
        task["target_failure_mode_id"] = failure_mode_id
        task["apply_mode"] = apply_mode
        task["implemented_at"] = datetime.now(timezone.utc).isoformat()
        if replace_action_index is not None:
            task["replaced_action_index"] = replace_action_index

    async def _apply_task_to_failure_mode(
        self,
        target_failure_mode_id: str,
        action_entry: Dict[str, Any],
        updated_by: str,
        change_reason: str,
        replace_action_index: Optional[int] = None,
        force_add: bool = False,
    ) -> Dict[str, Any]:
        """Replace a similar existing task in a failure mode's recommended_actions,
        otherwise append it. Version history captures the previous state (acts as a
        soft archive of replaced tasks).

        `action_entry` must be a structured dict (description, action_type,
        discipline, estimated_minutes/time, etc.) — see `_build_recommended_action_from_task`.

        If `replace_action_index` is provided (0-based) and valid, that exact slot
        is replaced — this is the path used when the AI Review LLM has already
        chosen a semantically-equivalent action to replace. Otherwise we fall back
        to lexical similarity (`_find_similar_action_index`) for safety.

        Returns {success, message, mode: "replaced"|"added", replaced_index}.
        """
        from bson import ObjectId
        from services.failure_modes_service import FailureModesService

        action_text = (
            action_entry.get("description")
            or action_entry.get("action")
            or action_entry.get("name")
            or ""
        )

        # Look up the failure mode — accept legacy "id" string or Mongo "_id".
        fm_doc = None
        if target_failure_mode_id:
            fm_doc = await self.failure_modes_collection.find_one({"id": target_failure_mode_id})
            if not fm_doc and ObjectId.is_valid(target_failure_mode_id):
                fm_doc = await self.failure_modes_collection.find_one(
                    {"_id": ObjectId(target_failure_mode_id)}
                )

        if not fm_doc:
            return {
                "success": False,
                "message": f"Failure mode {target_failure_mode_id} not found",
                "mode": None,
                "replaced_index": None,
            }

        existing_actions = list(fm_doc.get("recommended_actions") or [])

        # Exact duplicate — refresh type/discipline (and related metadata) on the slot.
        target_norm = self._normalize_action_text(action_text)
        if target_norm:
            for idx, existing in enumerate(existing_actions):
                if self._normalize_action_text(existing) == target_norm:
                    new_actions = list(existing_actions)
                    new_actions[idx] = self._merge_action_metadata(existing, action_entry)
                    return await self._persist_failure_mode_actions(
                        fm_doc,
                        new_actions,
                        updated_by,
                        change_reason,
                        mode="replaced",
                        message="Updated existing task with type and discipline from PM import",
                        match_idx=idx,
                        ratio=1.0,
                        replace_action_index=replace_action_index,
                    )

        if force_add:
            new_actions = existing_actions + [action_entry]
            return await self._persist_failure_mode_actions(
                fm_doc, new_actions, updated_by, change_reason,
                mode="added", match_idx=-1, ratio=0.0, replace_action_index=replace_action_index,
            )

        # Prefer the AI-chosen replacement index if it's in bounds.
        match_idx = -1
        ratio = 0.0
        if (
            replace_action_index is not None
            and isinstance(replace_action_index, int)
            and 0 <= replace_action_index < len(existing_actions)
        ):
            match_idx = replace_action_index
            ratio = 1.0  # AI explicitly chose this slot
        else:
            match_idx, ratio = self._find_similar_action_index(action_text, existing_actions)

        if match_idx >= 0:
            new_actions = list(existing_actions)
            new_actions[match_idx] = self._merge_action_metadata(
                existing_actions[match_idx], action_entry
            )
            mode = "replaced"
            message = (
                "Replaced existing task (AI-selected)"
                if ratio == 1.0 and replace_action_index is not None
                else f"Replaced existing task (similarity {ratio:.0%})"
            )
        else:
            new_actions = existing_actions + [action_entry]
            mode = "added"
            message = "Added as new task"

        return await self._persist_failure_mode_actions(
            fm_doc,
            new_actions,
            updated_by,
            change_reason,
            mode=mode,
            message=message,
            match_idx=match_idx,
            ratio=ratio,
            replace_action_index=replace_action_index,
        )

    async def _persist_failure_mode_actions(
        self,
        fm_doc: Dict[str, Any],
        new_actions: List[Any],
        updated_by: str,
        change_reason: str,
        mode: str,
        message: Optional[str] = None,
        match_idx: int = -1,
        ratio: float = 0.0,
        replace_action_index: Optional[int] = None,
    ) -> Dict[str, Any]:
        from services.failure_modes_service import FailureModesService

        if message is None:
            message = "Added as new task" if mode == "added" else "Updated failure mode task"

        fm_service = FailureModesService(self.db)
        mode_id_str = str(fm_doc["_id"])
        updated = await fm_service.update(
            mode_id_str,
            {"recommended_actions": new_actions},
            updated_by=updated_by,
            change_reason=change_reason,
        )

        if not updated:
            return {
                "success": False,
                "message": "Failed to update failure mode",
                "mode": None,
                "replaced_index": None,
            }

        return {
            "success": True,
            "message": message,
            "mode": mode,
            "replaced_index": match_idx if match_idx >= 0 else None,
            "failure_mode_id": mode_id_str,
        }

    async def _sync_pm_import_graph_edge(
        self,
        task: Dict[str, Any],
        task_id: str,
        failure_mode_id: str,
        apply_mode: str,
    ) -> None:
        from services.pm_import_graph_sync import sync_pm_import_graph_edge

        await sync_pm_import_graph_edge(task, task_id, failure_mode_id, apply_mode)

    async def apply_task_to_failure_mode(
        self,
        session_id: str,
        task_id: str,
        target_failure_mode_id: str,
        placement_mode: str = "add",
        replace_action_index: Optional[int] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Apply a Custom PM Import task to a failure mode (manual, from the import list).
        placement_mode: 'add' appends a new recommended action; 'replace' updates a slot.
        """
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            raise ValueError(f"Session {session_id} not found")

        tasks = session.get("tasks_extracted", [])
        task = next((t for t in tasks if t.get("task_id") == task_id), None)
        if not task:
            raise ValueError(f"Task {task_id} not found in session")

        if task.get("review_status") not in ("accepted", "implemented"):
            return {
                "success": False,
                "message": "Task must be accepted before applying to a failure mode",
                "mode": None,
            }

        action_entry = self._build_recommended_action_from_task(task)
        updated_by = user_id or session.get("created_by") or "PM Import"
        force_add = (placement_mode or "add").lower() == "add"
        replace_idx = None if force_add else replace_action_index

        apply_res = await self._apply_task_to_failure_mode(
            target_failure_mode_id=target_failure_mode_id,
            action_entry=action_entry,
            updated_by=updated_by,
            change_reason=f"PM Import — apply task {task_id} to failure mode",
            replace_action_index=replace_idx,
            force_add=force_add,
        )

        result = {"task_id": task_id, "success": apply_res.get("success", False), **apply_res}

        if apply_res.get("success"):
            self._mark_task_implemented(
                task,
                apply_res.get("failure_mode_id") or target_failure_mode_id,
                apply_res.get("mode") or "added",
                replace_action_index=apply_res.get("replaced_index"),
            )
            if task.get("review_status") == "accepted":
                task["review_status"] = "implemented"
            await self._sync_pm_import_graph_edge(
                task,
                task_id,
                apply_res.get("failure_mode_id") or target_failure_mode_id,
                apply_res.get("mode") or "added",
            )

        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "tasks_extracted": tasks,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

        return result

    async def apply_ai_suggestion(
        self, 
        session_id: str, 
        task_id: str, 
        action: str,
        target_failure_mode_id: Optional[str] = None,
        new_failure_mode_data: Optional[Dict[str, Any]] = None,
        replace_action_index: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Apply an AI suggestion for a task.
        
        Actions:
        - "merge": Merge task into existing failure mode's recommended_actions
          (replaces a similar existing task when one exists, else appends).
        - "new_failure_mode": Create new failure mode with this task
        - "new_task": Add task under existing failure mode (same replace-or-add logic
          as merge).
        - "keep_custom": Mark as custom (stays in session)
        - "reject": Reject suggestion (stays as accepted task)
        """
        from services.failure_modes_service import FailureModesService
        
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        tasks = session.get("tasks_extracted", [])
        task = next((t for t in tasks if t.get("task_id") == task_id), None)
        if not task:
            raise ValueError(f"Task {task_id} not found in session")
        
        suggestions = session.get("ai_review_suggestions", [])
        suggestion = next((s for s in suggestions if s.get("task_id") == task_id), None)
        
        result = {"task_id": task_id, "action": action, "success": False}
        updated_by = session.get("created_by") or "PM Import AI Review"

        # If the caller didn't override, use the AI's stored choice for replacement.
        if replace_action_index is None and suggestion:
            ai_idx = (suggestion.get("recommendation") or {}).get("replace_action_index")
            if isinstance(ai_idx, int):
                replace_action_index = ai_idx

        if action == "merge" and target_failure_mode_id:
            action_entry = self._build_recommended_action_from_task(task)

            if suggestion and (suggestion.get("recommendation") or {}).get("already_exists"):
                apply_res = await self._apply_task_to_failure_mode(
                    target_failure_mode_id=target_failure_mode_id,
                    action_entry=action_entry,
                    updated_by=updated_by,
                    change_reason=f"PM Import AI Review — refresh existing task {task_id}",
                    replace_action_index=replace_action_index,
                )
                result.update(apply_res)
                if apply_res.get("success"):
                    self._mark_task_implemented(
                        task,
                        apply_res.get("failure_mode_id") or target_failure_mode_id,
                        apply_res.get("mode") or "existing",
                        replace_action_index=apply_res.get("replaced_index"),
                    )
                    if task.get("review_status") == "accepted":
                        task["review_status"] = "implemented"
                    await self._sync_pm_import_graph_edge(
                        task,
                        task_id,
                        apply_res.get("failure_mode_id") or target_failure_mode_id,
                        apply_res.get("mode") or "existing",
                    )
                    result["message"] = (
                        apply_res.get("message")
                        or "Updated existing failure mode task with type and discipline"
                    )
            else:
                apply_res = await self._apply_task_to_failure_mode(
                    target_failure_mode_id=target_failure_mode_id,
                    action_entry=action_entry,
                    updated_by=updated_by,
                    change_reason=f"PM Import AI Review — merge task {task_id}",
                    replace_action_index=replace_action_index,
                )
                result.update(apply_res)
                if apply_res["success"]:
                    self._mark_task_implemented(
                        task,
                        apply_res.get("failure_mode_id") or target_failure_mode_id,
                        apply_res.get("mode") or "added",
                        replace_action_index=apply_res.get("replaced_index"),
                    )
                    if task.get("review_status") == "accepted":
                        task["review_status"] = "implemented"
                    await self._sync_pm_import_graph_edge(
                        task,
                        task_id,
                        apply_res.get("failure_mode_id") or target_failure_mode_id,
                        apply_res.get("mode") or "added",
                    )
        
        elif action == "new_failure_mode":
            # Create new failure mode — but prefer merge when a library match exists.
            fm_service = FailureModesService(self.db)
            
            task_description = task.get("task_description") or task.get("original_task") or ""
            equipment_tag = task.get("equipment_tag") or ""
            discipline = task.get("discipline") or "Mechanical"
            action_entry = self._build_recommended_action_from_task(task)
            
            new_fm = new_failure_mode_data or {}
            fm_name = new_fm.get("failure_mode") or f"Custom - {task_description[:50]}"

            # Try existing FM by name first
            existing = await fm_service.find_by_name(fm_name)
            merge_target_id = existing.get("id") if existing else None

            # Fall back to top similar FM from the AI review suggestion
            if not merge_target_id and suggestion:
                similar = suggestion.get("similar_failure_modes") or []
                if similar and similar[0].get("similarity_score", 0) >= 25:
                    merge_target_id = similar[0].get("id")

            if merge_target_id:
                apply_res = await self._apply_task_to_failure_mode(
                    target_failure_mode_id=merge_target_id,
                    action_entry=action_entry,
                    updated_by=updated_by,
                    change_reason=f"PM Import AI Review — merged instead of new FM for task {task_id}",
                    replace_action_index=replace_action_index,
                )
                result.update(apply_res)
                if apply_res["success"]:
                    self._mark_task_implemented(
                        task,
                        apply_res.get("failure_mode_id") or merge_target_id,
                        apply_res.get("mode") or "added",
                        replace_action_index=apply_res.get("replaced_index"),
                    )
                    if task.get("review_status") == "accepted":
                        task["review_status"] = "implemented"
                    await self._sync_pm_import_graph_edge(
                        task,
                        task_id,
                        apply_res.get("failure_mode_id") or merge_target_id,
                        apply_res.get("mode") or "added",
                    )
                    result["message"] = (
                        f"Linked to existing failure mode instead of creating new: {fm_name}"
                    )
            else:
                fm_data = {
                    "failure_mode": fm_name,
                    "equipment": new_fm.get("equipment") or equipment_tag,
                    "category": new_fm.get("category") or discipline,
                    "mechanism": new_fm.get("mechanism") or "To be determined",
                    "severity": new_fm.get("severity", 5),
                    "occurrence": new_fm.get("occurrence", 5),
                    "detectability": new_fm.get("detectability", 5),
                    "recommended_actions": [action_entry],
                    "detection_methods": task.get("detection_methods", []),
                    "failure_mode_type": "customer_specific",
                    "source": "pm_import"
                }
                
                created_fm = await fm_service.create(fm_data, created_by=session.get("created_by", "system"))
                
                if created_fm:
                    result["success"] = True
                    result["message"] = f"New failure mode created: {fm_name}"
                    result["failure_mode_id"] = created_fm.get("id")
                    self._mark_task_implemented(
                        task, created_fm.get("id"), "new_failure_mode"
                    )
                    if task.get("review_status") == "accepted":
                        task["review_status"] = "implemented"
                    await self._sync_pm_import_graph_edge(
                        task,
                        task_id,
                        created_fm.get("id"),
                        "new_failure_mode",
                    )
                else:
                    result["message"] = "Failed to create failure mode"
        
        elif action == "new_task":
            # Add as new task under existing failure mode — uses same replace-or-add
            # logic as "merge" so duplicates don't accumulate.
            if target_failure_mode_id:
                action_entry = self._build_recommended_action_from_task(task)

                apply_res = await self._apply_task_to_failure_mode(
                    target_failure_mode_id=target_failure_mode_id,
                    action_entry=action_entry,
                    updated_by=updated_by,
                    change_reason=f"PM Import AI Review — new task {task_id}",
                    replace_action_index=replace_action_index,
                )
                result.update(apply_res)
                if apply_res["success"]:
                    self._mark_task_implemented(
                        task,
                        apply_res.get("failure_mode_id") or target_failure_mode_id,
                        apply_res.get("mode") or "added",
                        replace_action_index=apply_res.get("replaced_index"),
                    )
                    if task.get("review_status") == "accepted":
                        task["review_status"] = "implemented"
                    await self._sync_pm_import_graph_edge(
                        task,
                        task_id,
                        apply_res.get("failure_mode_id") or target_failure_mode_id,
                        apply_res.get("mode") or "added",
                    )
            else:
                result["message"] = "No target failure mode specified"
        
        elif action == "keep_custom":
            # Mark as custom - stays in session
            task["import_status"] = "custom"
            result["success"] = True
            result["message"] = "Task marked as custom"
        
        elif action == "reject":
            # Reject suggestion - task stays as accepted
            task["import_status"] = "pending"
            result["success"] = True
            result["message"] = "Suggestion rejected, task remains as accepted"
        
        # Update suggestion status
        if suggestion:
            suggestion["status"] = "applied" if result["success"] else "failed"
            suggestion["applied_action"] = action
        
        # Save updates to session
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "tasks_extracted": tasks,
                "ai_review_suggestions": suggestions,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return result
