"""PM Import equipment hierarchy matching."""
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

from services.tenant_scope import scoped, scoped_job
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

    async def ensure_equipment_impacts(
        self,
        session_id: str,
        current_user: dict,
    ) -> Optional[Dict[str, Any]]:
        """
        Enrich tasks with equipment/tag impact information.

        Runs the same matchers used during upload (`_match_equipment_to_hierarchy`,
        `_match_equipment_types`) so the data shown in the review screen is consistent
        with the data the new PM Import table reads.

        Adds session fields:
        - equipment_impact_summary
        - equipment_impact_updated_at
        """
        session = await self.sessions_collection.find_one(
            scoped(current_user, {"session_id": session_id})
        )
        if not session:
            return None

        tasks = session.get("tasks_extracted") or []
        if not tasks:
            session["_id"] = str(session["_id"])
            return session

        # Only recompute if we haven't done it yet, or if tasks changed since last compute.
        prev = session.get("equipment_impact_summary") or {}
        if prev.get("tasks_count") == len(tasks) and session.get("equipment_impact_updated_at"):
            session["_id"] = str(session["_id"])
            return session

        # Use the SAME matchers as the upload pipeline so review and listing stay in sync.
        tasks = await self._match_equipment_to_hierarchy(tasks, current_user=current_user)

        matched_task_count = 0
        for task in tasks:
            if task.get("equipment_match"):
                matched_task_count += 1

        summary = {
            "tasks_count": len(tasks),
            "tasks_with_matches": matched_task_count,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        await self.sessions_collection.update_one(
            scoped(current_user, {"session_id": session_id}),
            {"$set": {
                "tasks_extracted": tasks,
                "equipment_impact_summary": summary,
                "equipment_impact_updated_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }},
        )

        session["tasks_extracted"] = tasks
        session["equipment_impact_summary"] = summary
        session["equipment_impact_updated_at"] = datetime.now(timezone.utc)
        session["_id"] = str(session["_id"])
        return session

    async def _load_accessible_equipment_nodes(self, current_user: dict) -> List[Dict[str, Any]]:
        """
        Load equipment nodes the user can access (based on installation assignments).
        """
        try:
            from services.installation_filter_service import installation_filter

            installation_ids = await installation_filter.get_user_installation_ids(current_user)
            if not installation_ids:
                return []
            equipment_ids = await installation_filter.get_all_equipment_ids_for_installations(
                installation_ids, current_user.get("id")
            )
            if not equipment_ids:
                return []
            return await self.db.equipment_nodes.find(
                scoped(current_user, {"id": {"$in": list(equipment_ids)}}),
                {"_id": 0, "id": 1, "tag": 1, "name": 1, "level": 1},
            ).to_list(20000)
        except Exception as e:
            logger.error(f"Failed to load accessible equipment nodes for PM impact: {e}")
            return []

    def _extract_tag_refs(self, text: str) -> List[str]:
        if not text:
            return []
        refs = []
        for m in TAG_REGEX.finditer(text.upper()):
            val = m.group(0).replace(" ", "")
            if val and val not in refs:
                refs.append(val)
        return refs

    async def _compute_import_impact_preview(self, task: Dict[str, Any], fm_service) -> Dict[str, Any]:
        """
        Compute a best-effort preview of what the PM import would change for this task.

        Returns:
          {
            "action": "link_existing" | "create_new" | "skip" | "rejected",
            "target_failure_mode": {id, failure_mode, equipment, category} | null,
            "changes": [{field, from, to, note}]  // human readable change intents
            "action_preview": {...} | null         // recommended action object we would add
            "reason": string | null
          }
        """
        status = task.get("review_status")
        if status == "rejected":
            return {"action": "rejected", "target_failure_mode": None, "changes": [], "action_preview": None, "reason": "Rejected"}

        if status not in ["accepted", "edited"]:
            return {"action": "skip", "target_failure_mode": None, "changes": [], "action_preview": None, "reason": "Not accepted"}

        library_match = task.get("library_match") or {}
        match_status = library_match.get("status", "")

        # Determine scenario target id
        target_id = None
        scenario = None
        if task.get("selected_match_id"):
            target_id = task.get("selected_match_id")
            scenario = "selected_match"
        elif match_status == "existing_match" and library_match.get("matched_id"):
            target_id = library_match.get("matched_id")
            scenario = "existing_match"

        action_type, discipline = self._resolve_task_type_and_discipline(task)
        estimated_time = task.get("estimated_time") or ""
        desc = task.get("existing_control") or task.get("original_task") or ""
        freq = task.get("frequency")

        if target_id:
            existing_fm = await fm_service.get_by_id(target_id)
            if not existing_fm:
                return {"action": "skip", "target_failure_mode": None, "changes": [], "action_preview": None, "reason": "Matched failure mode not found"}

            actions = existing_fm.get("recommended_actions", []) or []
            action_exists = any(
                isinstance(a, dict) and (a.get("description") or "").lower() == desc.lower()
                for a in actions
            )

            new_action = self._build_recommended_action_from_task(
                task, source="PM Import"
            )

            changes = []
            if not action_exists:
                changes.append({"field": "recommended_actions", "from": "unchanged", "to": "add 1 action", "note": desc[:120]})
            else:
                changes.append({"field": "recommended_actions", "from": "already contains action", "to": "unchanged", "note": desc[:120]})

            fm_type = existing_fm.get("failure_mode_type")
            if fm_type != "customer_specific":
                changes.append({"field": "failure_mode_type", "from": fm_type or "", "to": "customer_specific", "note": "Marked as customized by PM import"})

            return {
                "action": "link_existing",
                "target_failure_mode": {
                    "id": str(existing_fm.get("id") or target_id),
                    "failure_mode": existing_fm.get("failure_mode", ""),
                    "equipment": existing_fm.get("equipment", ""),
                    "category": existing_fm.get("category", ""),
                },
                "changes": changes,
                "action_preview": new_action,
                "reason": None if scenario else None,
            }

        # Scenario C: approved new FM
        if task.get("approved_new_fm"):
            approved = task.get("approved_new_fm") or {}
            fm_name = approved.get("failure_mode") or approved.get("name") or ""
            if not fm_name:
                return {"action": "skip", "target_failure_mode": None, "changes": [], "action_preview": None, "reason": "No failure mode name approved"}

            # If name already exists, we will link instead of create
            existing = await fm_service.find_by_name(fm_name)
            if existing:
                # best-effort: existing may have _id not id
                existing_id = str(existing.get("id") or existing.get("_id"))
                # Recursively treat as link
                task_copy = dict(task)
                task_copy["selected_match_id"] = existing_id
                return await self._compute_import_impact_preview(task_copy, fm_service)

            equipment = approved.get("equipment") or task.get("component") or "General Equipment"
            category = approved.get("category") or self._determine_category(task)
            new_action = self._build_recommended_action_from_task(task, source="PM Import")

            return {
                "action": "create_new",
                "target_failure_mode": {
                    "id": None,
                    "failure_mode": fm_name,
                    "equipment": equipment,
                    "category": category,
                },
                "changes": [
                    {"field": "failure_mode", "from": "", "to": fm_name, "note": "New failure mode created"},
                    {"field": "recommended_actions", "from": "", "to": "1 action", "note": desc[:120]},
                    {"field": "failure_mode_type", "from": "", "to": "customer_specific", "note": "Created as customer-specific"},
                ],
                "action_preview": new_action,
                "reason": None,
            }

        # Otherwise skip reasons based on match status
        reason = "No failure mode mapping confirmed"
        if match_status == "multiple_possible":
            reason = "Multiple matches — no selection"
        elif match_status == "new_proposed":
            reason = "New failure mode proposed — not approved"
        elif match_status == "weak_match":
            reason = "Weak match — not confirmed"

        return {"action": "skip", "target_failure_mode": None, "changes": [], "action_preview": None, "reason": reason}
    async def _match_equipment_to_hierarchy(
        self,
        tasks: List[Dict[str, Any]],
        *,
        current_user: Optional[dict] = None,
    ) -> List[Dict[str, Any]]:
        """
        Match each task to ONE equipment node per the refactor spec.
        
        Priority 1: tag exact match against `equipment_nodes.tag`
        Priority 2: description fuzzy match against `equipment_nodes.name`
        
        Stores a single `equipment_match` object (or None) per task.
        """
        scope = (lambda q: scoped(current_user, q)) if current_user else scoped_job
        nodes_cursor = self.db.equipment_nodes.find(scope({}))
        nodes = await nodes_cursor.to_list(20000)
        
        by_tag = {}
        by_tag_normalized = {}  # Tags with "-" removed for matching handwritten tags
        by_name_exact = {}
        all_names = []  # for fuzzy
        for n in nodes:
            tag = (n.get("tag") or "").strip()
            if tag:
                by_tag[tag.upper()] = n
                # Also store a normalized version without dashes for fuzzy tag matching
                tag_normalized = tag.upper().replace("-", "")
                by_tag_normalized[tag_normalized] = n
            name = (n.get("name") or "").strip()
            if name:
                by_name_exact[name.lower()] = n
                all_names.append((name.lower(), n))
        
        for task in tasks:
            # Priority 1: tag exact match — ONLY use the explicit Tag column from the
            # upload (`equipment_tag` / `asset`). We deliberately do NOT mine the
            # description or task text for tag-like patterns.
            tag_field = (
                str(task.get("equipment_tag") or task.get("asset") or "").strip()
            )
            
            match = None
            
            if tag_field:
                # Try exact tag match (single token or the whole field)
                hit = by_tag.get(tag_field.upper())
                if hit:
                    match = {
                        "equipment_id": hit.get("id"),
                        "tag": hit.get("tag"),
                        "name": hit.get("name"),
                        "match_type": "tag_exact",
                        "confidence": 100,
                    }
                else:
                    # Try normalized match (without dashes) for handwritten tags
                    tag_normalized = tag_field.upper().replace("-", "")
                    hit = by_tag_normalized.get(tag_normalized)
                    if hit:
                        match = {
                            "equipment_id": hit.get("id"),
                            "tag": hit.get("tag"),
                            "name": hit.get("name"),
                            "match_type": "tag_normalized",
                            "confidence": 95,  # Slightly lower confidence for normalized match
                        }
                    else:
                        # If the tag column contains multiple tokens (e.g. "P-1001, P-1002"),
                        # try each token individually.
                        for token in self._extract_tag_refs(tag_field):
                            hit = by_tag.get(token.upper())
                            if hit:
                                match = {
                                    "equipment_id": hit.get("id"),
                                    "tag": hit.get("tag"),
                                    "name": hit.get("name"),
                                    "match_type": "tag_exact",
                                    "confidence": 100,
                                }
                                break
                            # Also try normalized match for each token
                            token_normalized = token.upper().replace("-", "")
                            hit = by_tag_normalized.get(token_normalized)
                            if hit:
                                match = {
                                    "equipment_id": hit.get("id"),
                                    "tag": hit.get("tag"),
                                    "name": hit.get("name"),
                                    "match_type": "tag_normalized",
                                    "confidence": 95,
                                }
                                break
            
            # Priority 2: description fuzzy match
            if not match:
                description_candidates = [
                    str(task.get("equipment_description") or task.get("component") or "").strip().lower(),
                    str(task.get("equipment_tag") or task.get("asset") or "").strip().lower(),
                ]
                description_candidates = [c for c in description_candidates if len(c) >= 3]
                
                # Exact name match
                for cand in description_candidates:
                    if cand in by_name_exact:
                        hit = by_name_exact[cand]
                        match = {
                            "equipment_id": hit.get("id"),
                            "tag": hit.get("tag"),
                            "name": hit.get("name"),
                            "match_type": "name_exact",
                            "confidence": 90,
                        }
                        break
                
                # Partial / fuzzy contains
                if not match:
                    for cand in description_candidates:
                        best = None
                        best_score = 0
                        for name_lower, n in all_names:
                            if len(name_lower) < 4:
                                continue
                            # simple substring score
                            score = 0
                            if cand == name_lower:
                                score = 90
                            elif cand in name_lower:
                                score = 80
                            elif name_lower in cand:
                                score = 70
                            elif self._token_overlap_score(cand, name_lower) >= 0.5:
                                score = 60
                            if score > best_score:
                                best_score = score
                                best = n
                        if best and best_score >= 60:
                            match = {
                                "equipment_id": best.get("id"),
                                "tag": best.get("tag"),
                                "name": best.get("name"),
                                "match_type": "name_partial" if best_score < 90 else "name_exact",
                                "confidence": best_score,
                            }
                            break
            
            task["equipment_match"] = match
            # Preserve canonical equipment_tag / equipment_description fields
            task["equipment_tag"] = task.get("equipment_tag") or task.get("asset") or ""
            task["equipment_description"] = task.get("equipment_description") or task.get("component") or ""

        type_map = await self._load_equipment_type_name_map(current_user)
        node_by_id = {n.get("id"): n for n in nodes if n.get("id")}
        for task in tasks:
            em = task.get("equipment_match")
            if em:
                node = node_by_id.get(em.get("equipment_id"))
                self._apply_equipment_type_to_match(em, node, type_map)
        
        return tasks

    async def _load_equipment_type_name_map(self, current_user: Optional[dict] = None) -> Dict[str, str]:
        """Map equipment_type_id -> display name (ISO + custom types)."""
        type_map: Dict[str, str] = {}
        scope = (lambda q: scoped(current_user, q)) if current_user else scoped_job
        try:
            from iso14224_models import EQUIPMENT_TYPES
            for t in EQUIPMENT_TYPES:
                tid = t.get("id")
                if tid:
                    type_map[str(tid)] = t.get("name") or ""
        except Exception as e:
            logger.warning("Could not load ISO equipment types for map: %s", e)

        cursor = self.db.custom_equipment_types.find(
            scope({}), {"_id": 0, "id": 1, "name": 1}
        )
        async for doc in cursor:
            tid = doc.get("id")
            if tid:
                type_map[str(tid)] = doc.get("name") or type_map.get(str(tid), "")
        return type_map

    def _apply_equipment_type_to_match(
        self,
        match: Optional[Dict[str, Any]],
        node: Optional[Dict[str, Any]],
        type_map: Dict[str, str],
    ) -> Optional[Dict[str, Any]]:
        """Attach equipment_type_id/name to a hierarchy equipment_match record."""
        if not match or not node:
            return match
        type_id = node.get("equipment_type_id")
        if type_id is None:
            return match
        type_id_str = str(type_id)
        if not match.get("equipment_type_id"):
            match["equipment_type_id"] = type_id_str
        if not match.get("equipment_type_name"):
            match["equipment_type_name"] = type_map.get(type_id_str)
        return match

    async def enrich_task_rows_equipment_types(self, task_rows: List[Dict[str, Any]]) -> None:
        """Fill equipment_type_name on nested equipment_match for list/display APIs."""
        equipment_ids = set()
        for row in task_rows:
            em = row.get("equipment_match")
            if em and em.get("equipment_id") and not em.get("equipment_type_name"):
                equipment_ids.add(em["equipment_id"])
        if not equipment_ids:
            return

        nodes = await self.db.equipment_nodes.find(
            scoped_job({"id": {"$in": list(equipment_ids)}}),
            {"_id": 0, "id": 1, "equipment_type_id": 1},
        ).to_list(length=len(equipment_ids))
        type_map = await self._load_equipment_type_name_map()
        node_by_id = {n["id"]: n for n in nodes if n.get("id")}
        for row in task_rows:
            em = row.get("equipment_match")
            if em and em.get("equipment_id"):
                self._apply_equipment_type_to_match(
                    em, node_by_id.get(em["equipment_id"]), type_map
                )
                row["equipment_type_name"] = em.get("equipment_type_name") or ""
    
    @staticmethod
    def _token_overlap_score(a: str, b: str) -> float:
        """Cheap token-overlap score in [0,1] used as a fuzzy fallback."""
        ta = {w for w in a.split() if len(w) >= 3}
        tb = {w for w in b.split() if len(w) >= 3}
        if not ta or not tb:
            return 0.0
        inter = ta & tb
        return len(inter) / max(len(ta), len(tb))
    
    def _calculate_stats(self, tasks: List[Dict[str, Any]]) -> Dict[str, int]:
        """Calculate statistics for the session."""
        stats = {
            "total_tasks": len(tasks),
            "failure_modes_identified": 0,
            "existing_matches": 0,
            "new_proposed": 0,
            "low_confidence_items": 0,
            "manual_review_required": 0,
            "accepted": 0,
            "rejected": 0,
            "pending": 0
        }
        
        fm_set = set()
        
        for task in tasks:
            # Count failure modes
            for fm in task.get("suggested_failure_modes", []):
                fm_name = fm if isinstance(fm, str) else fm.get("name", str(fm))
                fm_set.add(fm_name)
            
            # Count by library match status
            match_status = task.get("library_match", {}).get("status", "")
            if match_status == "existing_match":
                stats["existing_matches"] += 1
            elif match_status in ["new_proposed", "weak_match"]:
                stats["new_proposed"] += 1
            elif match_status == "multiple_possible":
                stats["manual_review_required"] += 1
            
            # Count by confidence
            confidence = task.get("confidence_score", 0)
            if confidence < 70:
                stats["low_confidence_items"] += 1
                stats["manual_review_required"] += 1
            
            # Count by review status
            review_status = task.get("review_status", "pending")
            if review_status == "accepted":
                stats["accepted"] += 1
            elif review_status == "rejected":
                stats["rejected"] += 1
            else:
                stats["pending"] += 1
        
        stats["failure_modes_identified"] = len(fm_set)
        
        return stats
    
    def _determine_category(self, task: Dict[str, Any]) -> str:
        """Determine the failure mode category based on task data."""
        task_type = task.get("task_type", "").lower()
        component = (task.get("component") or "").lower()
        
        # Map based on component type
        if any(kw in component for kw in ["pump", "compressor", "motor", "fan", "turbine", "bearing", "gear"]):
            return "Rotating"
        elif any(kw in component for kw in ["valve", "pipe", "tank", "vessel", "exchanger"]):
            return "Static"
        elif any(kw in component for kw in ["sensor", "transmitter", "controller", "plc", "gauge"]):
            return "Instrumentation"
        elif any(kw in component for kw in ["cable", "switch", "transformer", "breaker"]):
            return "Electrical"
        elif "seal" in component or "gasket" in component:
            return "Piping"
        
        # Map based on task type
        if task_type == "calibration":
            return "Instrumentation"
        elif task_type == "lubrication":
            return "Rotating"
        
        return "Process"  # Default
    
    def _extract_keywords(self, task: Dict[str, Any]) -> List[str]:
        """Extract keywords from task for the failure mode."""
        keywords = []
        
        # Add task type
        task_type = task.get("task_type", "")
        if task_type and task_type != "Unknown":
            keywords.append(task_type.lower())
        
        # Add component words
        component = task.get("component", "")
        if component:
            keywords.extend(component.lower().split())
        
        # Add from detection methods
        for method in task.get("detection_methods", [])[:2]:
            keywords.append(method.lower().split()[0])
        
        # Dedupe and limit
        return list(dict.fromkeys(keywords))[:6]
    
