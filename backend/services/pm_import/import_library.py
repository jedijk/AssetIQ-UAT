"""PM Import library linking."""
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
    is_pm_import_task_active,
)

logger = logging.getLogger(__name__)


class PMImportMixin:
    """Mixin — use only via PMImportService."""

    async def import_to_library(
        self,
        session_id: str,
        created_by: str
    ) -> Dict[str, Any]:
        """Import accepted tasks to the Failure Mode Library.
        
        Three scenarios:
        A) existing_match: Auto-link as preventive control to existing failure mode
        B) selected_match_id set: User selected from multiple matches - link to selected
        C) approved_new_fm set: User approved new failure mode - create it
        
        Tasks without proper mapping (no existing match, no user selection, no approval) are skipped.
        """
        
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            raise ValueError("Session not found")
        
        tasks = session.get("tasks_extracted", [])
        now = datetime.now(timezone.utc)
        
        imported_count = 0
        linked_count = 0
        new_count = 0
        skipped_count = 0
        low_confidence_imported = 0
        
        # Track detailed results for UI display
        linked_details = []  # Tasks linked to existing failure modes
        created_details = []  # New failure modes created
        skipped_details = []  # Skipped tasks
        
        from services.failure_modes_service import FailureModesService
        fm_service = FailureModesService(self.db)
        
        for task in tasks:
            # Skip rejected tasks
            if task.get("review_status") == "rejected":
                skipped_count += 1
                skipped_details.append({
                    "task": task.get("original_task", "")[:100],
                    "reason": "Rejected by user"
                })
                continue

            if not is_pm_import_task_active(task):
                skipped_count += 1
                skipped_details.append({
                    "task": task.get("original_task", "")[:100],
                    "reason": "Task disabled",
                })
                continue
            
            # Skip tasks not accepted/edited
            if task.get("review_status") not in ["accepted", "edited"]:
                continue
            
            confidence = task.get("confidence_score", 0)
            if confidence < 70:
                low_confidence_imported += 1
            
            library_match = task.get("library_match", {})
            match_status = library_match.get("status", "")
            
            # SCENARIO B (priority): User selected/overrode a match — always wins
            if task.get("selected_match_id"):
                matched_id = task["selected_match_id"]
                result = await self._link_task_to_failure_mode(
                    task, matched_id, fm_service, session.get("file_name"), now
                )
                if result:
                    linked_count += 1
                    imported_count += 1
                    linked_details.append(result)
                continue
            
            # SCENARIO A: Existing high-confidence match - auto link
            if match_status == "existing_match" and library_match.get("matched_id"):
                matched_id = library_match["matched_id"]
                result = await self._link_task_to_failure_mode(
                    task, matched_id, fm_service, session.get("file_name"), now
                )
                if result:
                    linked_count += 1
                    imported_count += 1
                    linked_details.append(result)
                continue
            
            # SCENARIO C: User approved new failure mode creation
            if task.get("approved_new_fm"):
                approved_fm = task["approved_new_fm"]
                fm_name = approved_fm.get("failure_mode") or approved_fm.get("name")
                
                if not fm_name:
                    skipped_count += 1
                    skipped_details.append({
                        "task": task.get("original_task", "")[:100],
                        "reason": "No failure mode name in approval"
                    })
                    continue
                
                # Check if already exists
                existing = await fm_service.find_by_name(fm_name)
                if existing:
                    # Link to existing instead
                    result = await self._link_task_to_failure_mode(
                        task, str(existing.get("_id")), fm_service, session.get("file_name"), now
                    )
                    if result:
                        linked_count += 1
                        imported_count += 1
                        linked_details.append(result)
                    continue
                
                # Create the approved new failure mode
                action_type, discipline = self._resolve_task_type_and_discipline(task)
                estimated_time = task.get("estimated_time") or ""
                action_entry = self._build_recommended_action_from_task(task, source="PM Import")
                action_entry["imported_from"] = session.get("file_name")
                action_entry["imported_at"] = now.isoformat()
                
                new_fm_data = {
                    "category": approved_fm.get("category") or self._determine_category(task),
                    "equipment": approved_fm.get("equipment") or task.get("component") or "General Equipment",
                    "failure_mode": fm_name,
                    "keywords": self._extract_keywords(task),
                    "severity": approved_fm.get("severity", 5),
                    "occurrence": approved_fm.get("occurrence", 5),
                    "detectability": approved_fm.get("detectability", 5),
                    "recommended_actions": [action_entry],
                    "failure_mode_type": "customer_specific",
                    "source": "pm_import",
                    "potential_causes": task.get("failure_mechanisms", []),
                    "process": task.get("task_type")
                }
                
                try:
                    created_fm = await fm_service.create(new_fm_data, created_by=created_by)
                    new_count += 1
                    imported_count += 1
                    created_details.append({
                        "task": task.get("original_task", "")[:100],
                        "task_type": task.get("task_type", ""),
                        "action_type": action_type,
                        "discipline": discipline,
                        "estimated_time": estimated_time,
                        "component": task.get("component", ""),
                        "frequency": task.get("frequency", ""),
                        "failure_modes_created": [{
                            "failure_mode_id": created_fm.get("id"),
                            "failure_mode_name": fm_name,
                            "equipment": new_fm_data["equipment"],
                            "category": new_fm_data["category"]
                        }]
                    })
                except Exception as e:
                    logger.error(f"Failed to create failure mode: {e}")
                    skipped_details.append({
                        "task": task.get("original_task", "")[:100],
                        "reason": f"Failed to create: {str(e)[:50]}"
                    })
                continue
            
            # No valid mapping - skip the task
            skipped_count += 1
            reason = "No failure mode mapping confirmed"
            if match_status == "multiple_possible":
                reason = "Multiple matches - user did not select one"
            elif match_status == "new_proposed":
                reason = "New failure mode proposed - user did not approve"
            elif match_status == "weak_match":
                reason = "Weak match - user did not confirm"
            
            skipped_details.append({
                "task": task.get("original_task", "")[:100],
                "reason": reason
            })
        
        # Build import result with details
        import_result = {
            "total_imported": imported_count,
            "linked_to_existing": linked_count,
            "new_created": new_count,
            "skipped": skipped_count,
            "low_confidence_imported": low_confidence_imported,
            "imported_at": now.isoformat(),
            "imported_by": created_by,
            "linked_details": linked_details,
            "created_details": created_details,
            "skipped_details": skipped_details
        }
        
        # Update session status
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "imported",
                "import_result": import_result,
                "updated_at": now
            }}
        )
        
        return {
            "success": True,
            "total_imported": imported_count,
            "linked_to_existing": linked_count,
            "new_created": new_count,
            "skipped": skipped_count,
            "low_confidence_imported": low_confidence_imported,
            "linked_details": linked_details,
            "created_details": created_details,
            "skipped_details": skipped_details
        }
    
    async def _link_task_to_failure_mode(
        self,
        task: Dict[str, Any],
        failure_mode_id: str,
        fm_service,
        file_name: str,
        now
    ) -> Optional[Dict[str, Any]]:
        """Link a PM task to an existing failure mode as a preventive control.
        
        Updates the failure mode with:
        - The PM/CM/PDM action (with discipline)
        - failure_mode_type → "customer_specific" (customized with user's PM)
        """
        
        existing_fm = await fm_service.get_by_id(failure_mode_id)
        if not existing_fm:
            return None
        
        action_type, discipline = self._resolve_task_type_and_discipline(task)
        estimated_time = task.get("estimated_time") or ""
        
        # Add the PM task as a recommended action if not already present
        actions = existing_fm.get("recommended_actions", [])
        new_action = self._build_recommended_action_from_task(
            task, source="PM Import"
        )
        new_action["imported_from"] = file_name
        new_action["imported_at"] = now.isoformat()
        desc_key = (new_action.get("description") or "").lower()
        
        # Check if similar action exists — refresh type/discipline if it does
        action_exists = False
        for idx, a in enumerate(actions):
            if not isinstance(a, dict):
                continue
            if (a.get("description") or "").lower() == desc_key:
                actions[idx] = self._merge_action_metadata(a, new_action)
                action_exists = True
                break
        
        if not action_exists:
            actions.append(new_action)
        
        # Mark failure mode as customer_specific since user has customized it with their PM
        update_payload = {
            "recommended_actions": actions,
            "failure_mode_type": "customer_specific",
        }
        await fm_service.update(
            failure_mode_id,
            update_payload,
            updated_by="PM Import",
            change_reason=f"PM Import: linked task '{(task.get('original_task') or '')[:80]}'"
        )
        
        return {
            "task": task.get("original_task", "")[:100],
            "task_type": task.get("task_type", ""),
            "action_type": action_type,
            "discipline": discipline,
            "estimated_time": estimated_time,
            "component": task.get("component", ""),
            "frequency": task.get("frequency", ""),
            "failure_mode_id": failure_mode_id,
            "failure_mode_name": existing_fm.get("failure_mode", ""),
            "equipment": existing_fm.get("equipment", ""),
            "category": existing_fm.get("category", ""),
            "action_added": new_action["description"][:80] if not action_exists else None,
            "already_existed": action_exists,
            "marked_customer_specific": existing_fm.get("failure_mode_type") != "customer_specific",
        }
    
