"""
Process Intelligence Import Service - Converts process diagrams to ISO 14224 asset hierarchy.

This service handles:
1. Process diagram parsing (PDF, images via GPT-4o Vision)
2. Equipment tag detection
3. ISO 14224 hierarchy classification
4. Equipment type identification
5. Criticality scoring
6. Hierarchy record generation
"""

import os
import io
import re
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# ISO 14224 Level definitions
ISO_LEVELS = [
    "Plant/Unit",
    "Section/System",
    "Equipment Unit",
    "Subunit",
    "Maintainable Item"
]

# Equipment type patterns (common industrial tag prefixes)
EQUIPMENT_TYPE_PATTERNS = {
    "P": {"type": "Pump", "template": "pump"},
    "C": {"type": "Compressor", "template": "compressor"},
    "T": {"type": "Tank", "template": "tank"},
    "V": {"type": "Vessel", "template": "vessel"},
    "E": {"type": "Heat Exchanger", "template": "exchanger"},
    "F": {"type": "Filter", "template": "filter"},
    "R": {"type": "Reactor/Extruder", "template": "extruder"},
    "X": {"type": "Miscellaneous", "template": None},
    "M": {"type": "Motor", "template": "motor"},
    "G": {"type": "Generator", "template": "generator"},
    "K": {"type": "Compressor", "template": "compressor"},
    "B": {"type": "Blower/Fan", "template": "fan"},
    "H": {"type": "Heater", "template": "heater"},
    "D": {"type": "Drum/Vessel", "template": "vessel"},
    "A": {"type": "Analyzer", "template": "instrument"},
    "FI": {"type": "Flow Indicator", "template": "instrument"},
    "PI": {"type": "Pressure Indicator", "template": "instrument"},
    "TI": {"type": "Temperature Indicator", "template": "instrument"},
    "LI": {"type": "Level Indicator", "template": "instrument"},
    "CV": {"type": "Control Valve", "template": "valve"},
}

# Equipment templates for auto-generating subunits/maintainable items
EQUIPMENT_TEMPLATES = {
    "pump": {
        "subunits": [
            {"suffix": "M01", "name": "Drive Motor", "type": "Motor"},
            {"suffix": "CPL", "name": "Coupling", "type": "Coupling"},
            {"suffix": "IMP", "name": "Impeller Section", "type": "Impeller"},
            {"suffix": "SEAL", "name": "Seal Section", "type": "Seal"},
        ],
        "maintainable_items": [
            {"suffix": "BRG01", "name": "Drive End Bearing", "type": "Bearing"},
            {"suffix": "BRG02", "name": "Non-Drive End Bearing", "type": "Bearing"},
            {"suffix": "SEAL01", "name": "Mechanical Seal", "type": "Seal"},
        ]
    },
    "extruder": {
        "subunits": [
            {"suffix": "M01", "name": "Drive Motor", "type": "Motor"},
            {"suffix": "GB01", "name": "Gearbox", "type": "Gearbox"},
            {"suffix": "SCR", "name": "Screw Section", "type": "Screw"},
            {"suffix": "HTR", "name": "Heating Section", "type": "Heater"},
            {"suffix": "CLR", "name": "Cooling Section", "type": "Cooler"},
        ],
        "maintainable_items": [
            {"suffix": "BRG01", "name": "Motor Bearing DE", "type": "Bearing"},
            {"suffix": "BRG02", "name": "Motor Bearing NDE", "type": "Bearing"},
            {"suffix": "SEAL01", "name": "Gearbox Seal", "type": "Seal"},
            {"suffix": "THRST", "name": "Thrust Bearing", "type": "Bearing"},
        ]
    },
    "compressor": {
        "subunits": [
            {"suffix": "M01", "name": "Drive Motor", "type": "Motor"},
            {"suffix": "GB01", "name": "Gearbox", "type": "Gearbox"},
            {"suffix": "STG01", "name": "Compression Stage 1", "type": "Stage"},
            {"suffix": "CLR01", "name": "Intercooler", "type": "Cooler"},
        ],
        "maintainable_items": [
            {"suffix": "BRG01", "name": "Drive Bearing", "type": "Bearing"},
            {"suffix": "BRG02", "name": "Support Bearing", "type": "Bearing"},
            {"suffix": "SEAL01", "name": "Shaft Seal", "type": "Seal"},
            {"suffix": "VLV01", "name": "Inlet Valve", "type": "Valve"},
        ]
    },
    "conveyor": {
        "subunits": [
            {"suffix": "M01", "name": "Drive Motor", "type": "Motor"},
            {"suffix": "GB01", "name": "Gearbox", "type": "Gearbox"},
            {"suffix": "DRV", "name": "Drive Assembly", "type": "Drive"},
            {"suffix": "BELT", "name": "Conveying Element", "type": "Belt"},
        ],
        "maintainable_items": [
            {"suffix": "BRG01", "name": "Head Pulley Bearing", "type": "Bearing"},
            {"suffix": "BRG02", "name": "Tail Pulley Bearing", "type": "Bearing"},
            {"suffix": "TENS", "name": "Belt Tensioner", "type": "Tensioner"},
        ]
    },
    "filter": {
        "subunits": [
            {"suffix": "BODY", "name": "Filter Body", "type": "Vessel"},
            {"suffix": "SCR", "name": "Screen/Element", "type": "Screen"},
            {"suffix": "DRV", "name": "Drive (if rotary)", "type": "Drive"},
        ],
        "maintainable_items": [
            {"suffix": "ELEM", "name": "Filter Element", "type": "Element"},
            {"suffix": "GSKT", "name": "Body Gasket", "type": "Gasket"},
        ]
    },
    "exchanger": {
        "subunits": [
            {"suffix": "SHELL", "name": "Shell Side", "type": "Shell"},
            {"suffix": "TUBE", "name": "Tube Bundle", "type": "Tubes"},
        ],
        "maintainable_items": [
            {"suffix": "GSKT01", "name": "Channel Gasket", "type": "Gasket"},
            {"suffix": "GSKT02", "name": "Shell Gasket", "type": "Gasket"},
            {"suffix": "TUBE01", "name": "Tube Bundle", "type": "Tubes"},
        ]
    },
    "tank": {
        "subunits": [
            {"suffix": "BODY", "name": "Tank Body", "type": "Vessel"},
            {"suffix": "AGT", "name": "Agitator", "type": "Agitator"},
        ],
        "maintainable_items": [
            {"suffix": "SEAL01", "name": "Agitator Seal", "type": "Seal"},
            {"suffix": "BRG01", "name": "Agitator Bearing", "type": "Bearing"},
            {"suffix": "NZL01", "name": "Inlet Nozzle", "type": "Nozzle"},
        ]
    },
    "vessel": {
        "subunits": [
            {"suffix": "BODY", "name": "Vessel Body", "type": "Vessel"},
            {"suffix": "INT", "name": "Internals", "type": "Internals"},
        ],
        "maintainable_items": [
            {"suffix": "GSKT01", "name": "Manway Gasket", "type": "Gasket"},
            {"suffix": "NZL01", "name": "Process Nozzle", "type": "Nozzle"},
        ]
    },
    "valve": {
        "subunits": [
            {"suffix": "ACT", "name": "Actuator", "type": "Actuator"},
            {"suffix": "BODY", "name": "Valve Body", "type": "Body"},
        ],
        "maintainable_items": [
            {"suffix": "SEAL01", "name": "Stem Seal", "type": "Seal"},
            {"suffix": "TRIM", "name": "Valve Trim", "type": "Trim"},
        ]
    },
    "instrument": {
        "subunits": [],
        "maintainable_items": [
            {"suffix": "SENS", "name": "Sensor Element", "type": "Sensor"},
            {"suffix": "TXMT", "name": "Transmitter", "type": "Transmitter"},
        ]
    },
}

# Unit pattern recognition (e.g., 1U-10, 2U-20, UNIT-100)
UNIT_PATTERNS = [
    r'\b(\d+U-\d+)\b',  # 1U-10, 2U-20
    r'\b(U-\d+)\b',      # U-100
    r'\b(UNIT[-\s]?\d+)\b',  # UNIT-100, UNIT 100
    r'\b(AREA[-\s]?\d+)\b',  # AREA-1
]

# Equipment tag patterns
EQUIPMENT_TAG_PATTERNS = [
    r'\b(\d+[A-Z]{1,2}-\d+[A-Z]?)\b',  # 1P-4003, 1R-2002A
    r'\b([A-Z]{1,3}-\d+[A-Z]?)\b',      # P-101, CV-201A
    r'\b([A-Z]{1,2}\d+-\d+)\b',         # P01-001
]


class ProcessImportService:
    """Service class for Process Import operations."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.sessions_collection = db["process_import_sessions"]
        self.equipment_collection = db["equipment_hierarchy"]
    
    async def create_session_placeholder(
        self,
        file_name: str,
        file_type: str,
        created_by: str,
        options: Dict[str, Any] = None
    ) -> str:
        """Create a session placeholder for background processing."""
        
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        options = options or {}
        
        session = {
            "session_id": session_id,
            "file_name": file_name,
            "file_type": file_type,
            "status": "processing",
            "progress": 0,
            "progress_message": "Initializing...",
            "hierarchy_items": [],
            "exceptions": [],
            "stats": {
                "total_items": 0,
                "plants": 0,
                "systems": 0,
                "equipment": 0,
                "subunits": 0,
                "maintainable_items": 0,
                "low_confidence": 0,
                "exceptions": 0
            },
            "options": {
                "generate_subunits": options.get("generate_subunits", True),
                "generate_maintainable_items": options.get("generate_maintainable_items", False),
                "estimate_criticality": options.get("estimate_criticality", True),
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
        file_content: bytes,
        options: Dict[str, Any] = None
    ) -> None:
        """Process a session (called as background task)."""
        
        options = options or {}
        
        try:
            # Process the file
            hierarchy_items, exceptions = await self._process_file(
                session_id, file_name, file_type, file_content, options
            )
            
            # Calculate stats
            stats = self._calculate_stats(hierarchy_items, exceptions)
            
            await self.sessions_collection.update_one(
                {"session_id": session_id},
                {"$set": {
                    "status": "ready_for_review",
                    "progress": 100,
                    "progress_message": "Processing complete",
                    "hierarchy_items": hierarchy_items,
                    "exceptions": exceptions,
                    "stats": stats,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            logger.info(f"Process Import session {session_id} completed with {len(hierarchy_items)} items")
            
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
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a session by ID."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if session:
            session["_id"] = str(session["_id"])
        return session
    
    async def update_item(
        self,
        session_id: str,
        item_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a specific hierarchy item."""
        
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        items = session.get("hierarchy_items", [])
        for item in items:
            if item.get("item_id") == item_id:
                item.update(updates)
                # Only set to "edited" if review_status wasn't explicitly updated
                if "review_status" not in updates:
                    item["review_status"] = "edited"
                break
        
        stats = self._calculate_stats(items, session.get("exceptions", []))
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "hierarchy_items": items,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"items": items, "stats": stats}
    
    async def delete_item(self, session_id: str, item_id: str) -> Optional[Dict[str, Any]]:
        """Delete a hierarchy item."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        items = [i for i in session.get("hierarchy_items", []) if i.get("item_id") != item_id]
        
        # Also remove children
        deleted_ids = {item_id}
        changed = True
        while changed:
            changed = False
            new_items = []
            for item in items:
                if item.get("parent_id") in deleted_ids:
                    deleted_ids.add(item["item_id"])
                    changed = True
                else:
                    new_items.append(item)
            items = new_items
        
        stats = self._calculate_stats(items, session.get("exceptions", []))
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "hierarchy_items": items,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"items": items, "stats": stats}
    
    async def add_item(
        self,
        session_id: str,
        item_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Add a new hierarchy item manually."""
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            return None
        
        items = session.get("hierarchy_items", [])
        
        new_item = {
            "item_id": str(uuid.uuid4()),
            "tag": item_data.get("tag", ""),
            "name": item_data.get("name", ""),
            "level": item_data.get("level", "Equipment Unit"),
            "equipment_type": item_data.get("equipment_type", ""),
            "description": item_data.get("description", ""),
            "parent_id": item_data.get("parent_id"),
            "criticality": item_data.get("criticality", {
                "safety": 0, "production": 0, "environmental": 0, "reputation": 0
            }),
            "confidence": 100,  # Manual entries are 100% confidence
            "review_status": "accepted",
            "source": "manual",
            "ai_reasoning": "Manually added by user"
        }
        
        items.append(new_item)
        stats = self._calculate_stats(items, session.get("exceptions", []))
        
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "hierarchy_items": items,
                "stats": stats,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"item": new_item, "items": items, "stats": stats}
    
    async def import_to_assetiq(
        self,
        session_id: str,
        installation_id: str,
        created_by: str
    ) -> Dict[str, Any]:
        """Import hierarchy items to AssetIQ equipment hierarchy."""
        
        session = await self.sessions_collection.find_one({"session_id": session_id})
        if not session:
            raise ValueError("Session not found")
        
        items = session.get("hierarchy_items", [])
        now = datetime.now(timezone.utc)
        
        created_count = 0
        updated_count = 0
        skipped_count = 0
        
        # Map item_id to created equipment_id
        id_map = {}
        
        # Sort items by level to ensure parents are created first
        level_order = {
            "Plant/Unit": 0,
            "Section/System": 1,
            "Equipment Unit": 2,
            "Subunit": 3,
            "Maintainable Item": 4
        }
        
        sorted_items = sorted(items, key=lambda x: level_order.get(x.get("level"), 5))
        
        for item in sorted_items:
            if item.get("review_status") == "rejected":
                skipped_count += 1
                continue
            
            # Map level to backend format
            level_map = {
                "Plant/Unit": "plant_unit",
                "Section/System": "section_system",
                "Equipment Unit": "equipment_unit",
                "Subunit": "subunit",
                "Maintainable Item": "maintainable_item"
            }
            
            # Determine parent_id
            parent_id = None
            if item.get("parent_id"):
                parent_id = id_map.get(item["parent_id"])
            if not parent_id and item.get("level") != "Plant/Unit":
                parent_id = installation_id
            
            # Build equipment record
            equipment_data = {
                "id": str(uuid.uuid4()),
                "tag": item.get("tag", ""),
                "name": item.get("name", ""),
                "level": level_map.get(item.get("level"), "equipment_unit"),
                "equipment_type": item.get("equipment_type", ""),
                "description": item.get("description", ""),
                "parent_id": parent_id,
                "criticality": {
                    "safety": item.get("criticality", {}).get("safety", 0),
                    "production": item.get("criticality", {}).get("production", 0),
                    "environmental": item.get("criticality", {}).get("environmental", 0),
                    "reputation": item.get("criticality", {}).get("reputation", 0),
                },
                "created_at": now,
                "updated_at": now,
                "created_by": created_by,
                "source": "process_import",
                "import_session_id": session_id
            }
            
            # Check if tag already exists
            existing = await self.equipment_collection.find_one({
                "tag": item.get("tag"),
                "parent_id": parent_id
            })
            
            if existing:
                # Update existing
                await self.equipment_collection.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "name": equipment_data["name"],
                        "equipment_type": equipment_data["equipment_type"],
                        "description": equipment_data["description"],
                        "criticality": equipment_data["criticality"],
                        "updated_at": now
                    }}
                )
                id_map[item["item_id"]] = str(existing["_id"])
                updated_count += 1
            else:
                # Create new
                await self.equipment_collection.insert_one(equipment_data)
                id_map[item["item_id"]] = equipment_data["id"]
                created_count += 1
        
        # Update session status
        await self.sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "imported",
                "import_result": {
                    "created_count": created_count,
                    "updated_count": updated_count,
                    "skipped_count": skipped_count,
                    "installation_id": installation_id,
                    "imported_at": now.isoformat(),
                    "imported_by": created_by
                },
                "updated_at": now
            }}
        )
        
        return {
            "success": True,
            "created_count": created_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count
        }
    
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
            items = await self._extract_from_image(img_info["data"], "png", img_info["page"])
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
        return await self._extract_from_image(img_b64, file_type, 1)
    
    async def _extract_from_image(
        self,
        img_b64: str,
        file_type: str,
        page_num: int
    ) -> List[Dict[str, Any]]:
        """Extract equipment and hierarchy from an image using GPT-4o Vision."""
        from openai import OpenAI
        
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API key not configured")
        
        client = OpenAI(api_key=api_key)
        
        mime_type = f"image/{file_type}" if file_type != "jpg" else "image/jpeg"
        
        prompt = """Analyze this process flow diagram (PFD) or engineering schematic and extract all equipment, systems, and process units.

For each item found, identify:
1. Equipment Tag (e.g., 1P-4003, 1R-2002, CV-201)
2. Equipment Name/Description
3. Equipment Type (Pump, Compressor, Tank, Vessel, Exchanger, Filter, Reactor, Extruder, Conveyor, Motor, Valve, Instrument, etc.)
4. Process Unit/Area it belongs to (if visible, e.g., 1U-10, 2U-20)
5. System/Function (e.g., Cooling Water, Main Process, Offgas Treatment)

Return the data as a JSON array where each item has:
{
  "tag": "equipment tag or identifier",
  "name": "descriptive name",
  "equipment_type": "type of equipment",
  "unit": "process unit if identified (e.g., 1U-10)",
  "system": "functional system if identifiable",
  "description": "brief operational description",
  "level_hint": "Plant/Unit, Section/System, Equipment Unit, Subunit, or Maintainable Item",
  "confidence": 0-100 confidence score
}

Focus on:
- Major equipment (pumps, compressors, vessels, exchangers, reactors)
- Process units and areas
- Control valves and instruments if clearly marked
- Flow paths and connections

Only return the JSON array, no other text."""

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{img_b64}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=4000,
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Parse JSON
            import json
            if result_text.startswith("```"):
                result_text = re.sub(r'^```(?:json)?\n?', '', result_text)
                result_text = re.sub(r'\n?```$', '', result_text)
            
            items = json.loads(result_text)
            
            # Add source page info
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
        from openai import OpenAI
        
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return items
        
        client = OpenAI(api_key=api_key)
        
        # Only estimate for Equipment Units
        equipment_items = [i for i in items if i.get("level") == "Equipment Unit"]
        
        if not equipment_items:
            return items
        
        # Batch process
        equipment_summary = "\n".join([
            f"- {i['tag']}: {i['name']} ({i['equipment_type']})"
            for i in equipment_items[:20]  # Limit to 20
        ])
        
        prompt = f"""Estimate criticality scores for these industrial equipment items.

Equipment list:
{equipment_summary}

For each equipment, provide scores from 0-5 for:
- Safety (rotating equipment, pressure, temperature, hazardous materials, stored energy)
- Production (bottleneck, shutdown risk, redundancy, downstream impact)
- Environmental (emissions, leaks, contamination, discharge)
- Reputation (product quality, customer impact, public exposure)

Return JSON array:
[
  {{
    "tag": "equipment tag",
    "safety": 0-5,
    "production": 0-5,
    "environmental": 0-5,
    "reputation": 0-5,
    "reasoning": "brief explanation"
  }}
]

Only return JSON array."""

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
                temperature=0.2
            )
            
            result_text = response.choices[0].message.content.strip()
            
            import json
            if result_text.startswith("```"):
                result_text = re.sub(r'^```(?:json)?\n?', '', result_text)
                result_text = re.sub(r'\n?```$', '', result_text)
            
            criticality_data = json.loads(result_text)
            
            # Map back to items
            crit_map = {c["tag"]: c for c in criticality_data}
            
            for item in items:
                if item["tag"] in crit_map:
                    crit = crit_map[item["tag"]]
                    item["criticality"] = {
                        "safety": crit.get("safety", 0),
                        "production": crit.get("production", 0),
                        "environmental": crit.get("environmental", 0),
                        "reputation": crit.get("reputation", 0)
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
