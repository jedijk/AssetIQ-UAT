"""Process import — vision parsing and hierarchy building."""
import os
import io
import re
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple

from services.process_import_constants import (
    EQUIPMENT_TAG_PATTERNS,
    EQUIPMENT_TEMPLATES,
    EQUIPMENT_TYPE_PATTERNS,
    ISO_LEVELS,
    UNIT_PATTERNS,
)

logger = logging.getLogger(__name__)


class ProcessImportVisionMixin:
    """Vision/file processing methods for ProcessImportService."""

    # ==================== FILE PROCESSING ====================
    
    async def _process_file(
        self,
        session_id: str,
        file_name: str,
        file_type: str,
        file_content: bytes,
        options: Dict[str, Any]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Process uploaded file and extract hierarchy."""
        
        await self._update_progress(session_id, 10, "Reading process documentation...")
        
        # Use GPT-4o Vision for all file types
        if file_type == "pdf":
            raw_items = await self._parse_pdf_with_vision(file_content, session_id)
        elif file_type in ["png", "jpg", "jpeg", "webp"]:
            raw_items = await self._parse_image_with_vision(file_content, file_type, session_id)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
        
        await self._update_progress(session_id, 50, f"Extracted {len(raw_items)} items. Building hierarchy...")
        
        # Build hierarchy from raw items
        hierarchy_items, exceptions = await self._build_hierarchy(
            raw_items, session_id, options
        )
        
        await self._update_progress(session_id, 80, "Estimating criticality...")
        
        # Estimate criticality if enabled
        if options.get("estimate_criticality", True):
            hierarchy_items = await self._estimate_criticality(hierarchy_items, session_id)
        
        await self._update_progress(session_id, 95, "Finalizing...")
        
        return hierarchy_items, exceptions
    
    async def _parse_pdf_with_vision(
        self,
        content: bytes,
        session_id: str
    ) -> List[Dict[str, Any]]:
        """Parse PDF using GPT-4o Vision."""
        
        await self._update_progress(session_id, 20, "Analyzing PDF with AI vision...")
        
        # Convert PDF pages to images
        try:
            import fitz  # PyMuPDF
            pdf_doc = fitz.open(stream=content, filetype="pdf")
            images_b64 = []
            for page_num in range(min(pdf_doc.page_count, 10)):  # Max 10 pages
                page = pdf_doc[page_num]
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img_bytes = pix.tobytes("png")
                images_b64.append({
                    "data": base64.b64encode(img_bytes).decode('utf-8'),
                    "page": page_num + 1
                })
            pdf_doc.close()
        except Exception as e:
            logger.error(f"PDF conversion error: {e}")
            raise ValueError(f"Could not process PDF: {str(e)}")
        
        all_items = []
        for img_info in images_b64:
            items = await self._extract_from_image(
                img_info["data"], "png", img_info["page"], session_id=session_id
            )
            all_items.extend(items)
        
        return all_items
    
    async def _parse_image_with_vision(
        self,
        content: bytes,
        file_type: str,
        session_id: str
    ) -> List[Dict[str, Any]]:
        """Parse image using GPT-4o Vision."""
        
        await self._update_progress(session_id, 20, "Analyzing image with AI vision...")
        
        img_b64 = base64.b64encode(content).decode('utf-8')
        return await self._extract_from_image(img_b64, file_type, 1, session_id=session_id)
    
    async def _extract_from_image(
        self,
        img_b64: str,
        file_type: str,
        page_num: int,
        *,
        session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Extract equipment and hierarchy from an image using GPT-4o Vision."""
        from services.ai_platform import execute_vision_json_prompt

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API key not configured")

        user_id, company_id = await self._ai_user_context(session_id)

        mime_type = f"image/{file_type}" if file_type != "jpg" else "image/jpeg"

        try:
            result = await execute_vision_json_prompt(
                "process_import.vision_extract",
                user={"id": user_id, "company_id": company_id},
                user_message="Extract all equipment items from this diagram.",
                image_base64=img_b64,
                media_type=mime_type,
                endpoint="process_import.vision_extract",
                model="gpt-4o",
                temperature=0.1,
                max_tokens=4000,
            )
            items = result.get("parsed")
            if not isinstance(items, list):
                items = []

            for item in items:
                item["source_page"] = page_num

            return items

        except Exception as e:
            logger.error(f"Vision API error: {e}")
            return []
    
    async def _build_hierarchy(
        self,
        raw_items: List[Dict[str, Any]],
        session_id: str,
        options: Dict[str, Any]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Build proper hierarchy from raw extracted items."""
        
        hierarchy_items = []
        exceptions = []
        
        # Group items by unit and system
        units = {}
        systems = {}
        equipment = []
        
        for item in raw_items:
            tag = item.get("tag", "")
            level_hint = item.get("level_hint", "")
            unit = item.get("unit", "")
            system = item.get("system", "")
            
            # Determine level
            if "Plant" in level_hint or "Unit" in level_hint or self._is_unit_tag(tag):
                if unit:
                    units[unit] = item
                elif tag:
                    units[tag] = item
            elif "System" in level_hint or "Section" in level_hint:
                key = system or tag or f"System-{len(systems)}"
                systems[key] = item
            else:
                equipment.append(item)
        
        # Create hierarchy items
        item_id_map = {}
        
        # 1. Create Plant/Unit items
        for unit_key, unit_item in units.items():
            item_id = str(uuid.uuid4())
            item_id_map[unit_key] = item_id
            
            hierarchy_items.append({
                "item_id": item_id,
                "tag": unit_item.get("tag") or unit_key,
                "name": unit_item.get("name") or f"Process Unit {unit_key}",
                "level": "Plant/Unit",
                "equipment_type": "",
                "description": unit_item.get("description", ""),
                "parent_id": None,
                "criticality": {"safety": 0, "production": 0, "environmental": 0, "reputation": 0},
                "confidence": unit_item.get("confidence", 80),
                "review_status": "pending",
                "source": "detected",
                "source_page": unit_item.get("source_page"),
                "ai_reasoning": "Detected as process unit from diagram"
            })
        
        # 2. Create Section/System items
        for sys_key, sys_item in systems.items():
            item_id = str(uuid.uuid4())
            item_id_map[sys_key] = item_id
            
            # Find parent unit
            parent_id = None
            if sys_item.get("unit") and sys_item["unit"] in item_id_map:
                parent_id = item_id_map[sys_item["unit"]]
            elif units:
                parent_id = list(item_id_map.values())[0]  # First unit as default parent
            
            hierarchy_items.append({
                "item_id": item_id,
                "tag": sys_item.get("tag") or sys_key,
                "name": sys_item.get("name") or sys_key,
                "level": "Section/System",
                "equipment_type": "",
                "description": sys_item.get("description", ""),
                "parent_id": parent_id,
                "criticality": {"safety": 0, "production": 0, "environmental": 0, "reputation": 0},
                "confidence": sys_item.get("confidence", 75),
                "review_status": "pending",
                "source": "detected",
                "source_page": sys_item.get("source_page"),
                "ai_reasoning": f"Detected as functional system: {sys_key}"
            })
        
        # 3. Create Equipment Unit items
        for eq_item in equipment:
            tag = eq_item.get("tag", "")
            if not tag:
                exceptions.append({
                    "type": "missing_tag",
                    "item": eq_item,
                    "message": "Equipment detected but no tag found"
                })
                continue
            
            item_id = str(uuid.uuid4())
            item_id_map[tag] = item_id
            
            # Determine equipment type
            eq_type = eq_item.get("equipment_type", "")
            if not eq_type:
                eq_type = self._detect_equipment_type(tag)
            
            # Find parent
            parent_id = None
            unit = eq_item.get("unit", "")
            system = eq_item.get("system", "")
            
            if system and system in item_id_map:
                parent_id = item_id_map[system]
            elif unit and unit in item_id_map:
                parent_id = item_id_map[unit]
            elif systems:
                # Assign to first system
                parent_id = list(item_id_map.values())[len(units)] if len(item_id_map) > len(units) else None
            elif units:
                parent_id = list(item_id_map.values())[0]
            
            hierarchy_items.append({
                "item_id": item_id,
                "tag": tag,
                "name": eq_item.get("name") or f"{eq_type} {tag}",
                "level": "Equipment Unit",
                "equipment_type": eq_type,
                "description": eq_item.get("description", ""),
                "parent_id": parent_id,
                "criticality": {"safety": 0, "production": 0, "environmental": 0, "reputation": 0},
                "confidence": eq_item.get("confidence", 85),
                "review_status": "pending",
                "source": "detected",
                "source_page": eq_item.get("source_page"),
                "ai_reasoning": f"Detected equipment tag {tag}, classified as {eq_type}"
            })
            
            # Generate subunits if enabled
            if options.get("generate_subunits", True):
                template = self._get_equipment_template(eq_type)
                if template:
                    for subunit in template.get("subunits", []):
                        sub_id = str(uuid.uuid4())
                        sub_tag = f"{tag}-{subunit['suffix']}"
                        
                        hierarchy_items.append({
                            "item_id": sub_id,
                            "tag": sub_tag,
                            "name": subunit["name"],
                            "level": "Subunit",
                            "equipment_type": subunit["type"],
                            "description": f"{subunit['name']} for {tag}",
                            "parent_id": item_id,
                            "criticality": {"safety": 0, "production": 0, "environmental": 0, "reputation": 0},
                            "confidence": 70,
                            "review_status": "pending",
                            "source": "template",
                            "ai_reasoning": f"Generated from {eq_type} template"
                        })
                        item_id_map[sub_tag] = sub_id
                        
                        # Generate maintainable items if enabled
                        if options.get("generate_maintainable_items", False):
                            for mi in template.get("maintainable_items", []):
                                if mi["suffix"].startswith(subunit["suffix"][:3]):
                                    mi_id = str(uuid.uuid4())
                                    mi_tag = f"{tag}-{mi['suffix']}"
                                    
                                    hierarchy_items.append({
                                        "item_id": mi_id,
                                        "tag": mi_tag,
                                        "name": mi["name"],
                                        "level": "Maintainable Item",
                                        "equipment_type": mi["type"],
                                        "description": f"{mi['name']} for {tag}",
                                        "parent_id": sub_id,
                                        "criticality": {"safety": 0, "production": 0, "environmental": 0, "reputation": 0},
                                        "confidence": 60,
                                        "review_status": "pending",
                                        "source": "template",
                                        "ai_reasoning": f"Generated from {eq_type} template"
                                    })
        
        # Find orphaned items (low confidence)
        for item in hierarchy_items:
            if item.get("confidence", 100) < 70:
                exceptions.append({
                    "type": "low_confidence",
                    "item_id": item["item_id"],
                    "tag": item["tag"],
                    "message": f"Low confidence detection ({item['confidence']}%)"
                })
        
        return hierarchy_items, exceptions
    
    async def _estimate_criticality(
        self,
        items: List[Dict[str, Any]],
        session_id: str
    ) -> List[Dict[str, Any]]:
        """Estimate criticality scores for equipment."""
        from services.ai_platform import execute_json_prompt

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return items

        user_id, company_id = await self._ai_user_context(session_id)

        equipment_items = [i for i in items if i.get("level") == "Equipment Unit"]

        if not equipment_items:
            return items

        equipment_summary = "\n".join([
            f"- {i['tag']}: {i['name']} ({i['equipment_type']})"
            for i in equipment_items[:20]
        ])

        try:
            result = await execute_json_prompt(
                "process_import.estimate_criticality",
                user={"id": user_id, "company_id": company_id},
                user_message="Estimate criticality for each equipment item listed.",
                variables={"equipment_list": equipment_summary},
                endpoint="process_import.estimate_criticality",
                model="gpt-4o-mini",
                max_tokens=2000,
                temperature=0.2,
            )
            criticality_data = result.get("parsed")
            if not isinstance(criticality_data, list):
                criticality_data = []

            crit_map = {c["tag"]: c for c in criticality_data if isinstance(c, dict) and c.get("tag")}

            for item in items:
                if item["tag"] in crit_map:
                    crit = crit_map[item["tag"]]
                    item["criticality"] = {
                        "safety": crit.get("safety", 0),
                        "production": crit.get("production", 0),
                        "environmental": crit.get("environmental", 0),
                        "reputation": crit.get("reputation", 0),
                    }
                    item["criticality_reasoning"] = crit.get("reasoning", "")

        except Exception as e:
            logger.error(f"Criticality estimation error: {e}")

        return items
    
    def _is_unit_tag(self, tag: str) -> bool:
        """Check if tag looks like a process unit identifier."""
        for pattern in UNIT_PATTERNS:
            if re.match(pattern, tag, re.IGNORECASE):
                return True
        return False
    
    def _detect_equipment_type(self, tag: str) -> str:
        """Detect equipment type from tag prefix."""
        # Extract letter prefix
        match = re.match(r'\d*([A-Z]{1,2})', tag.upper())
        if match:
            prefix = match.group(1)
            if prefix in EQUIPMENT_TYPE_PATTERNS:
                return EQUIPMENT_TYPE_PATTERNS[prefix]["type"]
        return "Equipment"
    
    def _get_equipment_template(self, equipment_type: str) -> Optional[Dict[str, Any]]:
        """Get template for equipment type."""
        type_lower = equipment_type.lower()
        
        for key, template in EQUIPMENT_TEMPLATES.items():
            if key in type_lower or type_lower in key:
                return template
        
        # Check by type mapping
        for prefix, info in EQUIPMENT_TYPE_PATTERNS.items():
            if info["type"].lower() == type_lower and info.get("template"):
                return EQUIPMENT_TEMPLATES.get(info["template"])
        
        return None
    
    def _calculate_stats(
        self,
        items: List[Dict[str, Any]],
        exceptions: List[Dict[str, Any]]
    ) -> Dict[str, int]:
        """Calculate session statistics."""
        stats = {
            "total_items": len(items),
            "plants": 0,
            "systems": 0,
            "equipment": 0,
            "subunits": 0,
            "maintainable_items": 0,
            "low_confidence": 0,
            "exceptions": len(exceptions),
            "pending": 0,
            "accepted": 0,
            "rejected": 0
        }
        
        for item in items:
            level = item.get("level", "")
            if level == "Plant/Unit":
                stats["plants"] += 1
            elif level == "Section/System":
                stats["systems"] += 1
            elif level == "Equipment Unit":
                stats["equipment"] += 1
            elif level == "Subunit":
                stats["subunits"] += 1
            elif level == "Maintainable Item":
                stats["maintainable_items"] += 1
            
            if item.get("confidence", 100) < 70:
                stats["low_confidence"] += 1
            
            status = item.get("review_status", "pending")
            if status == "accepted":
                stats["accepted"] += 1
            elif status == "rejected":
                stats["rejected"] += 1
            else:
                stats["pending"] += 1
        
        return stats
    
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
