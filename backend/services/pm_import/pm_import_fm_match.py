"""PM Import AI review — failure mode similarity matching."""
from __future__ import annotations

import os
import re
import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple

from services.tenant_scope import scoped_job
from services.pm_import_constants import (
    _sanitize_for_json,
    normalize_pm_import_discipline,
)

logger = logging.getLogger(__name__)


class PMImportMixin:
    """Mixin — use only via PMImportService."""

    async def _find_similar_failure_modes(
        self, 
        task_description: str, 
        equipment_type_id: Optional[str],
        discipline: str
    ) -> List[Dict[str, Any]]:
        """Find similar failure modes from the library."""
        
        # Get all failure modes (we'll score them all)
        # Include _id since some failure modes use it as identifier
        cursor = self.failure_modes_collection.find(
            scoped_job({}),
            {"_id": 1, "id": 1, "failure_mode": 1, "equipment": 1, "category": 1, 
             "mechanism": 1, "detection_methods": 1, "severity": 1, "occurrence": 1,
             "detectability": 1, "rpn": 1, "recommended_actions": 1, "equipment_type_ids": 1}
        ).limit(500)
        
        failure_modes = await cursor.to_list(length=500)
        
        if not failure_modes:
            return []
        
        # Normalize IDs - use 'id' field if present, otherwise convert _id to string
        for fm in failure_modes:
            if fm.get("id") is not None:
                fm["id"] = str(fm.get("id"))
            elif fm.get("_id"):
                fm["id"] = str(fm["_id"])
            # Remove _id from response to avoid serialization issues
            if "_id" in fm:
                del fm["_id"]
            fm["equipment_type_ids"] = [str(t) for t in fm.get("equipment_type_ids", [])]
        
        # Score each failure mode based on text similarity
        task_lower = task_description.lower()
        task_words = set(task_lower.split())
        
        # Extract key terms from task (words > 3 chars, excluding common words)
        stop_words = {'the', 'and', 'for', 'that', 'with', 'from', 'this', 'have', 'been', 'will', 'system', 'systems'}
        key_terms = {w for w in task_words if len(w) > 3 and w not in stop_words}
        
        # Map common task verbs to failure mode concepts
        task_to_fm_mapping = {
            'clean': ['cooling', 'contamination', 'fouling', 'blockage', 'clogging', 'dirt', 'debris', 'filter'],
            'lubricate': ['lubrication', 'bearing', 'wear', 'friction', 'oil', 'grease'],
            'inspect': ['inspection', 'visual', 'check', 'monitor'],
            'calibrate': ['calibration', 'accuracy', 'drift', 'sensor', 'instrument'],
            'replace': ['wear', 'fatigue', 'degradation', 'life'],
            'cooling': ['overheat', 'thermal', 'temperature', 'fan', 'heat'],
            'motor': ['overload', 'burnout', 'winding', 'rotor', 'stator', 'phase', 'electric'],
            'bearing': ['vibration', 'noise', 'wear', 'lubrication', 'alignment'],
            'pump': ['cavitation', 'seal', 'impeller', 'flow', 'pressure'],
            'valve': ['leak', 'seat', 'stem', 'actuator', 'stuck'],
        }
        
        scored_modes = []
        for fm in failure_modes:
            score = 0
            
            fm_name = (fm.get('failure_mode') or '').lower()
            fm_mechanism = (fm.get('mechanism') or '').lower()
            fm_equipment = (fm.get('equipment') or '').lower()
            fm_text = f"{fm_name} {fm_mechanism} {fm_equipment}"
            fm_words = set(fm_text.split())
            
            # Direct word overlap (high value)
            common_words = key_terms & fm_words
            score += len(common_words) * 15
            
            # Check task-to-FM concept mapping
            for task_term, fm_concepts in task_to_fm_mapping.items():
                if task_term in task_lower:
                    for concept in fm_concepts:
                        if concept in fm_text:
                            score += 25  # Strong conceptual match
                            break
            
            # Check if any recommended action matches task terms
            for action in fm.get("recommended_actions", []):
                if isinstance(action, dict):
                    raw_action = (
                        action.get("description")
                        or action.get("action")
                        or action.get("name")
                        or ""
                    )
                else:
                    raw_action = action
                action_text = str(raw_action).lower()
                
                # Check for key term matches in actions
                matching_terms = sum(1 for term in key_terms if term in action_text)
                if matching_terms > 0:
                    score += matching_terms * 20  # Actions are highly relevant
            
            # Check detection methods
            for method in fm.get("detection_methods", []):
                method_lower = str(method).lower() if method is not None else ""
                if any(term in method_lower for term in key_terms):
                    score += 10
                    break
            
            # Equipment type match - BIG bonus
            fm_type_ids = [str(t) for t in fm.get("equipment_type_ids", [])]
            if equipment_type_id and str(equipment_type_id) in fm_type_ids:
                score += 50  # Strong equipment type match
            
            # Partial equipment type match (e.g., task for motor, FM for electric equipment)
            if equipment_type_id:
                eq_base = str(equipment_type_id).split('_')[0] if '_' in str(equipment_type_id) else str(equipment_type_id)
                for fm_type in fm_type_ids:
                    if eq_base in fm_type or fm_type.split('_')[0] == eq_base:
                        score += 25
                        break
            
            if score > 0:
                scored_modes.append({
                    **fm,
                    "similarity_score": score
                })
        
        # Sort by score descending
        scored_modes.sort(key=lambda x: x["similarity_score"], reverse=True)
        
        return scored_modes[:10]
