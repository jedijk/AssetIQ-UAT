"""PM Import AI review — equipment tag matching."""
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

    async def _match_equipment_by_tag(self, tag: str) -> Optional[Dict[str, Any]]:
        """Match equipment tag to equipment_nodes and get equipment_type_id."""
        if not tag:
            return None
        
        # Normalize the tag - remove common variations
        tag_normalized = tag.strip()
        tag_escaped = re.escape(tag_normalized)
        # Also create a version without hyphens for fuzzy matching
        tag_no_hyphens = tag_normalized.replace("-", "").replace(" ", "").lower()
        
        logger.info(f"_match_equipment_by_tag: tag='{tag}', normalized='{tag_normalized}', no_hyphens='{tag_no_hyphens}'")
        
        # Try exact match first on tag field
        equipment_node = await self.db.equipment_nodes.find_one(
            scoped_job({
                "$or": [
                    {"tag": {"$regex": f"^{tag_escaped}$", "$options": "i"}},
                    {"id": {"$regex": f"^{tag_escaped}$", "$options": "i"}},
                    {"name": {"$regex": f"^{tag_escaped}$", "$options": "i"}}
                ]
            }),
            {"_id": 0, "id": 1, "tag": 1, "name": 1, "equipment_type_id": 1, "level": 1}
        )
        
        if equipment_node:
            logger.info(f"_match_equipment_by_tag: exact match found - {equipment_node.get('tag')}")
            return await self._build_equipment_match(equipment_node)
        
        # Try matching with normalized tag (no hyphens) against stored tags
        # This handles cases like "1F3001-0122" matching "1F-3001-0122"
        logger.info(f"_match_equipment_by_tag: trying normalized match for '{tag_no_hyphens}'")
        cursor = self.db.equipment_nodes.find(
            scoped_job({}),
            {"_id": 0, "id": 1, "tag": 1, "name": 1, "equipment_type_id": 1, "level": 1}
        )
        async for node in cursor:
            node_tag = node.get("tag") or ""
            if node_tag and node_tag != "None":
                node_tag_normalized = node_tag.replace("-", "").replace(" ", "").lower()
                if node_tag_normalized == tag_no_hyphens:
                    logger.info(f"_match_equipment_by_tag: normalized match found - {node.get('tag')} (type: {node.get('equipment_type_id')})")
                    return await self._build_equipment_match(node)
        
        logger.info(f"_match_equipment_by_tag: no normalized match, trying partial")
        # Try partial/prefix match - tag might be a parent (e.g., "1F-3001" should match "1F-3001-0128")
        equipment_node = await self.db.equipment_nodes.find_one(
            scoped_job({
                "$or": [
                    {"tag": {"$regex": f"^{tag_normalized}", "$options": "i"}},
                    {"tag": {"$regex": tag_normalized, "$options": "i"}}
                ]
            }),
            {"_id": 0, "id": 1, "tag": 1, "name": 1, "equipment_type_id": 1, "level": 1}
        )
        
        if equipment_node:
            logger.info(f"_match_equipment_by_tag: partial match found - {equipment_node.get('tag')}")
            return await self._build_equipment_match(equipment_node, partial=True)
        
        # Try matching where the stored tag starts with our tag (parent equipment)
        # Or our tag contains the stored tag
        cursor = self.db.equipment_nodes.find(
            scoped_job({"tag": {"$exists": True, "$ne": None, "$ne": "None"}}),
            {"_id": 0, "id": 1, "tag": 1, "name": 1, "equipment_type_id": 1, "level": 1}
        ).limit(500)
        
        best_match = None
        best_score = 0
        async for node in cursor:
            node_tag = node.get("tag")
            if not node_tag or node_tag == "None":
                continue
            
            # Check if tags match when normalized
            node_tag_no_hyphens = node_tag.replace("-", "").replace(" ", "").lower()
            
            # Score based on how well they match
            if tag_no_hyphens.lower().startswith(node_tag_no_hyphens):
                score = len(node_tag_no_hyphens)
                if score > best_score:
                    best_score = score
                    best_match = node
            elif node_tag_no_hyphens.startswith(tag_no_hyphens.lower()):
                score = len(tag_no_hyphens)
                if score > best_score:
                    best_score = score
                    best_match = node
        
        if best_match:
            return await self._build_equipment_match(best_match, partial=True)
        
        return {
            "matched": False,
            "equipment_tag": tag,
            "suggestion": "No equipment found. Consider creating new equipment or mapping this tag."
        }
    
    async def _build_equipment_match(self, equipment_node: Dict, partial: bool = False) -> Dict[str, Any]:
        """Build equipment match response with type details."""
        equipment_type = None
        equipment_type_id = equipment_node.get("equipment_type_id")
        
        if equipment_type_id:
            # First try custom_equipment_types collection
            equipment_type = await self.db.custom_equipment_types.find_one(
                scoped_job({"id": equipment_type_id}),
                {"_id": 0, "id": 1, "name": 1, "category": 1}
            )
            
            # If not found in custom, check ISO14224 standard types
            if not equipment_type:
                try:
                    from iso14224_models import EQUIPMENT_TYPES
                    iso_type = next(
                        (t for t in EQUIPMENT_TYPES if t.get("id") == equipment_type_id),
                        None
                    )
                    if iso_type:
                        equipment_type = {
                            "id": iso_type.get("id"),
                            "name": iso_type.get("name"),
                            "category": iso_type.get("category")
                        }
                except Exception as e:
                    logger.warning("Could not load ISO equipment types for match: %s", e)
        
        result = {
            "matched": True,
            "equipment_id": equipment_node.get("id"),
            "equipment_tag": equipment_node.get("tag") or equipment_node.get("id"),
            "equipment_name": equipment_node.get("name"),
            "equipment_type_id": str(equipment_type_id) if equipment_type_id is not None else None,
            "equipment_type_name": equipment_type.get("name") if equipment_type else None,
            "equipment_type_category": equipment_type.get("category") if equipment_type else None,
            "level": equipment_node.get("level")
        }
        
        if partial:
            result["partial_match"] = True
        
        return result
