"""
PM Intelligence Import Service - Converts maintenance plans to failure mode intelligence.

This service handles:
1. File parsing (Excel, PDF, Images via GPT-4o Vision)
2. AI-powered task classification
3. Failure mode extraction and mapping
4. Library matching
5. Confidence scoring
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

# Task type classifications
TASK_TYPES = [
    "Inspection",
    "Lubrication",
    "Calibration",
    "Replacement",
    "Cleaning",
    "Adjustment",
    "Monitoring",
    "Unknown"
]

# Keyword-based pre-classification rules
TASK_CLASSIFICATION_RULES = {
    "lubrication": {
        "keywords": ["grease", "lubricate", "oil", "smeer", "vet", "lub", "lube"],
        "failure_modes": ["Lubrication starvation", "Bearing wear", "Bearing seizure", "Overheating"],
        "failure_mechanisms": ["Insufficient lubrication", "Grease contamination", "Grease degradation"],
        "detection_methods": ["Temperature monitoring", "Vibration analysis", "Noise detection", "Visual inspection"]
    },
    "inspection": {
        "keywords": ["inspect", "visual check", "controleer", "listen", "leakage", "check pressure", "check", "examine", "verify", "control"],
        "failure_modes": ["Leak", "Abnormal noise", "Loose part", "Crack", "Pressure loss", "Overheating", "Corrosion"],
        "failure_mechanisms": ["Wear", "Fatigue", "Corrosion", "Loosening"],
        "detection_methods": ["Visual inspection", "Auditory check", "Pressure measurement", "Temperature monitoring"]
    },
    "calibration": {
        "keywords": ["calibrate", "kalibreren", "adjust", "afstellen", "tune", "zero", "set point"],
        "failure_modes": ["Sensor drift", "False reading", "Instrument failure", "Measurement error"],
        "failure_mechanisms": ["Sensor degradation", "Electronic drift", "Environmental effects"],
        "detection_methods": ["Reference comparison", "Trend analysis", "Deviation monitoring"]
    },
    "replacement": {
        "keywords": ["replace", "vervangen", "overhaul", "flush", "change", "renew", "swap"],
        "failure_modes": ["Consumable degradation", "Contamination", "Wear-out", "Fluid degradation"],
        "failure_mechanisms": ["Age-related degradation", "Contamination buildup", "Material fatigue"],
        "detection_methods": ["Time-based schedule", "Condition monitoring", "Sample analysis"]
    },
    "cleaning": {
        "keywords": ["clean", "reinig", "cooling", "blow out", "spoelen", "wash", "purge", "filter"],
        "failure_modes": ["Fouling", "Overheating", "Blockage", "Contamination", "Reduced efficiency"],
        "failure_mechanisms": ["Buildup accumulation", "Debris collection", "Scale formation"],
        "detection_methods": ["Visual inspection", "Pressure drop measurement", "Temperature monitoring"]
    },
    "adjustment": {
        "keywords": ["adjust", "tension", "align", "tighten", "torque", "set", "position"],
        "failure_modes": ["Misalignment", "Loose components", "Belt slip", "Coupling failure"],
        "failure_mechanisms": ["Vibration loosening", "Thermal expansion", "Wear"],
        "detection_methods": ["Alignment check", "Torque verification", "Vibration analysis"]
    },
    "monitoring": {
        "keywords": ["monitor", "record", "log", "measure", "track", "observe", "trend"],
        "failure_modes": ["Performance degradation", "Abnormal operation", "Efficiency loss"],
        "failure_mechanisms": ["Progressive wear", "System degradation"],
        "detection_methods": ["Trend analysis", "Threshold monitoring", "Data logging"]
    }
}

# Frequency pattern matching
FREQUENCY_PATTERNS = [
    (r'\b(daily|dagelijks)\b', 'Daily'),
    (r'\b(weekly|wekelijks)\b', 'Weekly'),
    (r'\b(bi-weekly|tweewekelijks)\b', 'Bi-weekly'),
    (r'\b(monthly|maandelijks)\b', 'Monthly'),
    (r'\b(quarterly|driemaandelijks|kwartaal)\b', 'Quarterly'),
    (r'\b(semi-annual|halfjaarlijks)\b', 'Semi-annual'),
    (r'\b(annual|yearly|jaarlijks)\b', 'Annual'),
    (r'\bevery\s+(\d+)\s*hours?\b', 'Every {0} hours'),
    (r'\bevery\s+(\d+)\s*days?\b', 'Every {0} days'),
    (r'\bevery\s+(\d+)\s*weeks?\b', 'Every {0} weeks'),
    (r'\bevery\s+(\d+)\s*months?\b', 'Every {0} months'),
    (r'\b(\d+)\s*hours?\b', 'Every {0} hours'),
    (r'\b(\d+)\s*h\b', 'Every {0} hours'),
]


class PMImportService:
    """Service class for PM Import operations."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.sessions_collection = db["pm_import_sessions"]
        self.failure_modes_collection = db["failure_modes"]
    
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
            
            # Skip tasks not accepted/edited
            if task.get("review_status") not in ["accepted", "edited"]:
                continue
            
            confidence = task.get("confidence_score", 0)
            if confidence < 70:
                low_confidence_imported += 1
            
            library_match = task.get("library_match", {})
            match_status = library_match.get("status", "")
            
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
            
            # SCENARIO B: User selected from multiple matches
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
                new_fm_data = {
                    "category": approved_fm.get("category") or self._determine_category(task),
                    "equipment": approved_fm.get("equipment") or task.get("component") or "General Equipment",
                    "failure_mode": fm_name,
                    "keywords": self._extract_keywords(task),
                    "severity": approved_fm.get("severity", 5),
                    "occurrence": approved_fm.get("occurrence", 5),
                    "detectability": approved_fm.get("detectability", 5),
                    "recommended_actions": [{
                        "description": task.get("existing_control") or task.get("original_task"),
                        "action_type": "PM",
                        "discipline": "mechanical",
                        "source": "PM Import",
                        "frequency": task.get("frequency"),
                        "imported_from": session.get("file_name"),
                        "imported_at": now.isoformat()
                    }],
                    "failure_mode_type": "customer_specific",
                    "source": "pm_import",
                    "potential_causes": task.get("failure_mechanisms", []),
                    "process": task.get("task_type")
                }
                
                try:
                    await fm_service.create(new_fm_data, created_by=created_by)
                    new_count += 1
                    imported_count += 1
                    created_details.append({
                        "task": task.get("original_task", "")[:100],
                        "task_type": task.get("task_type", ""),
                        "component": task.get("component", ""),
                        "frequency": task.get("frequency", ""),
                        "failure_modes_created": [{
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
        """Link a PM task to an existing failure mode as a preventive control."""
        
        existing_fm = await fm_service.get_by_id(failure_mode_id)
        if not existing_fm:
            return None
        
        # Add the PM task as a recommended action if not already present
        actions = existing_fm.get("recommended_actions", [])
        new_action = {
            "description": task.get("existing_control") or task.get("original_task"),
            "action_type": "PM",
            "discipline": "mechanical",
            "source": "PM Import",
            "frequency": task.get("frequency"),
            "imported_from": file_name,
            "imported_at": now.isoformat()
        }
        
        # Check if similar action exists
        action_exists = any(
            a.get("description", "").lower() == new_action["description"].lower()
            for a in actions if isinstance(a, dict)
        )
        
        if not action_exists:
            actions.append(new_action)
            await fm_service.update(
                failure_mode_id,
                {"recommended_actions": actions},
                updated_by="PM Import"
            )
        
        return {
            "task": task.get("original_task", "")[:100],
            "task_type": task.get("task_type", ""),
            "component": task.get("component", ""),
            "frequency": task.get("frequency", ""),
            "failure_mode_id": failure_mode_id,
            "failure_mode_name": existing_fm.get("failure_mode", ""),
            "equipment": existing_fm.get("equipment", ""),
            "category": existing_fm.get("category", ""),
            "action_added": new_action["description"][:80] if not action_exists else None,
            "already_existed": action_exists
        }
    
    # ==================== FILE PROCESSING ====================
    
    async def _process_file(
        self,
        session_id: str,
        file_name: str,
        file_type: str,
        file_content: bytes
    ) -> List[Dict[str, Any]]:
        """Process uploaded file and extract maintenance tasks."""
        
        await self._update_progress(session_id, 10, "Reading maintenance plan...")
        
        # Extract raw text/rows based on file type
        if file_type in ["xlsx", "xls"]:
            raw_rows = await self._parse_excel(file_content)
        elif file_type == "pdf":
            raw_rows = await self._parse_pdf(file_content, session_id)
        elif file_type in ["png", "jpg", "jpeg", "webp"]:
            raw_rows = await self._parse_image(file_content, file_type, session_id)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
        
        if not raw_rows:
            raise ValueError("No maintenance tasks could be extracted from the file")
        
        await self._update_progress(session_id, 40, f"Extracted {len(raw_rows)} tasks. Analyzing...")
        
        # Process each row with AI
        tasks = []
        total = len(raw_rows)
        
        for idx, row in enumerate(raw_rows):
            progress = 40 + int((idx / total) * 50)
            await self._update_progress(
                session_id, 
                progress, 
                f"Processing task {idx + 1} of {total}..."
            )
            
            task = await self._analyze_task(row, session_id, file_name)
            if task:
                tasks.append(task)
        
        await self._update_progress(session_id, 95, "Matching with library...")
        
        # Match with existing library
        tasks = await self._match_with_library(tasks)
        
        return tasks
    
    async def _parse_excel(self, content: bytes) -> List[Dict[str, Any]]:
        """Parse Excel file and extract maintenance tasks."""
        import openpyxl
        
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        rows = []
        
        for sheet in wb.worksheets:
            # Try to find header row
            header_row = None
            for row_idx, row in enumerate(sheet.iter_rows(max_row=10, values_only=True), 1):
                if row and any(cell for cell in row if cell):
                    # Check if this looks like a header
                    row_text = " ".join(str(c).lower() for c in row if c)
                    if any(kw in row_text for kw in ["task", "maintenance", "description", "activity", "action", "equipment", "component"]):
                        header_row = row_idx
                        headers = [str(c).strip() if c else f"col_{i}" for i, c in enumerate(row)]
                        break
            
            if not header_row:
                header_row = 1
                first_row = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), None)
                headers = [str(c).strip() if c else f"col_{i}" for i, c in enumerate(first_row)] if first_row else []
            
            # Extract data rows
            for row in sheet.iter_rows(min_row=header_row + 1, values_only=True):
                if not any(cell for cell in row if cell):
                    continue
                
                row_data = {}
                row_text_parts = []
                
                for idx, cell in enumerate(row):
                    if cell is not None:
                        header = headers[idx] if idx < len(headers) else f"col_{idx}"
                        row_data[header] = str(cell).strip()
                        row_text_parts.append(str(cell).strip())
                
                if row_text_parts:
                    row_data["_raw_text"] = " | ".join(row_text_parts)
                    rows.append(row_data)
        
        return rows
    
    async def _parse_pdf(self, content: bytes, session_id: str) -> List[Dict[str, Any]]:
        """Parse PDF file - use text extraction first, fall back to vision for scanned PDFs."""
        import pdfplumber
        
        rows = []
        has_text = False
        
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages:
                    # Try to extract tables first
                    tables = page.extract_tables()
                    if tables:
                        for table in tables:
                            for row in table:
                                if row and any(cell for cell in row if cell):
                                    row_text = " | ".join(str(c).strip() for c in row if c)
                                    rows.append({"_raw_text": row_text})
                                    has_text = True
                    
                    # If no tables, extract text
                    if not tables:
                        text = page.extract_text()
                        if text and text.strip():
                            has_text = True
                            # Split into lines as potential tasks
                            for line in text.split("\n"):
                                line = line.strip()
                                if len(line) > 10:  # Skip very short lines
                                    rows.append({"_raw_text": line})
        except Exception as e:
            logger.warning(f"PDF text extraction failed: {e}")
        
        # If no text found (scanned PDF), use GPT-4o Vision
        if not has_text or len(rows) < 3:
            logger.info("Using GPT-4o Vision for scanned PDF")
            await self._update_progress(session_id, 20, "Scanned PDF detected. Using AI vision...")
            rows = await self._ocr_with_vision(content, "pdf", session_id)
        
        return rows
    
    async def _parse_image(
        self,
        content: bytes,
        file_type: str,
        session_id: str
    ) -> List[Dict[str, Any]]:
        """Parse image using GPT-4o Vision."""
        await self._update_progress(session_id, 20, "Analyzing image with AI vision...")
        return await self._ocr_with_vision(content, file_type, session_id)
    
    async def _ocr_with_vision(
        self,
        content: bytes,
        file_type: str,
        session_id: str
    ) -> List[Dict[str, Any]]:
        """Use GPT-4o Vision to extract maintenance tasks from images/scanned documents."""
        from openai import OpenAI
        
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API key not configured")
        
        client = OpenAI(api_key=api_key)
        
        # Convert to base64
        if file_type == "pdf":
            # Convert PDF pages to images
            try:
                import fitz  # PyMuPDF
                pdf_doc = fitz.open(stream=content, filetype="pdf")
                images_b64 = []
                for page_num in range(min(pdf_doc.page_count, 5)):  # Max 5 pages
                    page = pdf_doc[page_num]
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
                    img_bytes = pix.tobytes("png")
                    images_b64.append(base64.b64encode(img_bytes).decode('utf-8'))
                pdf_doc.close()
            except ImportError:
                # Fallback: just use first page as image
                from PIL import Image
                from pdf2image import convert_from_bytes
                pages = convert_from_bytes(content, first_page=1, last_page=5)
                images_b64 = []
                for page in pages:
                    buf = io.BytesIO()
                    page.save(buf, format='PNG')
                    images_b64.append(base64.b64encode(buf.getvalue()).decode('utf-8'))
        else:
            # Regular image
            images_b64 = [base64.b64encode(content).decode('utf-8')]
        
        # Process with GPT-4o Vision
        all_rows = []
        
        for idx, img_b64 in enumerate(images_b64):
            mime_type = "image/png" if file_type == "pdf" else f"image/{file_type}"
            
            prompt = """Analyze this maintenance plan document and extract all preventive maintenance tasks.

For each maintenance task found, extract:
1. The original task text exactly as written
2. The equipment or component mentioned
3. Any frequency information (daily, weekly, monthly, etc.)
4. Any additional details

Return the data as a JSON array where each item has:
{
  "task": "original task text",
  "equipment": "equipment/component name if mentioned",
  "frequency": "frequency if mentioned",
  "details": "any additional details"
}

If the document is in Dutch, still extract the tasks but keep them in Dutch.
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
                    temperature=0
                )
                
                result_text = response.choices[0].message.content.strip()
                
                # Parse JSON response
                import json
                # Clean up response
                if result_text.startswith("```"):
                    result_text = re.sub(r'^```(?:json)?\n?', '', result_text)
                    result_text = re.sub(r'\n?```$', '', result_text)
                
                tasks = json.loads(result_text)
                
                for task in tasks:
                    raw_text = task.get("task", "")
                    if task.get("equipment"):
                        raw_text += f" | Equipment: {task['equipment']}"
                    if task.get("frequency"):
                        raw_text += f" | Frequency: {task['frequency']}"
                    
                    all_rows.append({
                        "_raw_text": raw_text,
                        "_ocr_data": task
                    })
                    
            except Exception as e:
                logger.error(f"Vision API error on page {idx + 1}: {e}")
                continue
        
        return all_rows
    
    async def _analyze_task(
        self,
        row: Dict[str, Any],
        session_id: str,
        file_name: str
    ) -> Optional[Dict[str, Any]]:
        """Analyze a single maintenance task and extract failure mode intelligence."""
        
        raw_text = row.get("_raw_text", "")
        if not raw_text or len(raw_text) < 5:
            return None
        
        # Step 1: Rule-based pre-classification
        task_type, rule_based_data = self._classify_by_rules(raw_text)
        
        # Step 2: Extract frequency
        frequency = self._extract_frequency(raw_text)
        
        # Step 3: Extract component (from OCR data or text)
        component = row.get("_ocr_data", {}).get("equipment", "")
        if not component:
            component = self._extract_component(raw_text)
        
        # Step 4: AI enhancement
        ai_analysis = await self._ai_analyze_task(raw_text, task_type, rule_based_data)
        
        # Build task object
        task_id = str(uuid.uuid4())
        
        # Calculate confidence score
        confidence = self._calculate_confidence(
            has_component=bool(component),
            has_frequency=bool(frequency),
            task_type_known=(task_type != "Unknown"),
            ai_confidence=ai_analysis.get("confidence", 70),
            failure_modes_count=len(ai_analysis.get("failure_modes", rule_based_data.get("failure_modes", [])))
        )
        
        return {
            "task_id": task_id,
            "original_task": raw_text,
            "component": component or ai_analysis.get("component", ""),
            "asset": ai_analysis.get("asset", ""),
            "task_type": ai_analysis.get("task_type", task_type),
            "suggested_failure_modes": ai_analysis.get("failure_modes", rule_based_data.get("failure_modes", [])),
            "failure_mechanisms": ai_analysis.get("mechanisms", rule_based_data.get("failure_mechanisms", [])),
            "detection_methods": ai_analysis.get("detection_methods", rule_based_data.get("detection_methods", [])),
            "existing_control": raw_text,
            "frequency": frequency or ai_analysis.get("frequency", ""),
            "confidence_score": confidence,
            "ai_reasoning": ai_analysis.get("reasoning", ""),
            "library_match": {"status": "pending"},
            "review_status": "pending",
            # User selections - populated during review
            "selected_match_id": None,  # When user selects from multiple matches
            "approved_new_fm": None,    # When user approves a new failure mode to be created
            "source_document": file_name,
            "source_row": row
        }
    
    def _classify_by_rules(self, text: str) -> Tuple[str, Dict[str, Any]]:
        """Classify task type and extract data using keyword rules."""
        text_lower = text.lower()
        
        for task_type, rules in TASK_CLASSIFICATION_RULES.items():
            for keyword in rules["keywords"]:
                if keyword in text_lower:
                    return (
                        task_type.capitalize(),
                        {
                            "failure_modes": rules["failure_modes"][:3],
                            "failure_mechanisms": rules["failure_mechanisms"][:2],
                            "detection_methods": rules["detection_methods"][:2]
                        }
                    )
        
        return ("Unknown", {})
    
    def _extract_frequency(self, text: str) -> str:
        """Extract frequency information from text."""
        text_lower = text.lower()
        
        for pattern, template in FREQUENCY_PATTERNS:
            match = re.search(pattern, text_lower)
            if match:
                if '{0}' in template:
                    return template.format(match.group(1))
                return template
        
        return ""
    
    def _extract_component(self, text: str) -> str:
        """Extract component/equipment name from text."""
        # Common equipment keywords
        equipment_patterns = [
            r'\b(pump|compressor|motor|valve|bearing|seal|gear|fan|blower|turbine|exchanger|filter|sensor|conveyor|roller|belt|chain|coupling|shaft)\b',
            r'\b(pomp|compressor|motor|klep|lager|afdichting|tandwiel|ventilator|turbine|warmtewisselaar|filter|sensor)\b',  # Dutch
        ]
        
        for pattern in equipment_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                # Try to get more context
                start = max(0, match.start() - 20)
                end = min(len(text), match.end() + 20)
                context = text[start:end]
                
                # Clean up
                words = context.split()
                for i, word in enumerate(words):
                    if match.group(1).lower() in word.lower():
                        # Get the word and maybe adjacent words
                        component_words = []
                        if i > 0 and words[i-1][0].isupper():
                            component_words.append(words[i-1])
                        component_words.append(word)
                        if i < len(words) - 1 and words[i+1][0].islower():
                            component_words.append(words[i+1])
                        return " ".join(component_words)
                
                return match.group(1).capitalize()
        
        return ""
    
    async def _ai_analyze_task(
        self,
        task_text: str,
        pre_classified_type: str,
        rule_based_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Use AI to enhance task analysis."""
        from openai import OpenAI
        
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return {
                "task_type": pre_classified_type,
                "failure_modes": rule_based_data.get("failure_modes", []),
                "mechanisms": rule_based_data.get("failure_mechanisms", []),
                "detection_methods": rule_based_data.get("detection_methods", []),
                "confidence": 60,
                "reasoning": "AI analysis unavailable - using rule-based classification"
            }
        
        client = OpenAI(api_key=api_key)
        
        prompt = f"""Analyze this preventive maintenance task and extract reliability intelligence.

MAINTENANCE TASK: "{task_text}"

Pre-classified type: {pre_classified_type}
Pre-identified failure modes: {rule_based_data.get('failure_modes', [])}

Please analyze and provide:
1. Component: What equipment/component is this task for?
2. Task Type: One of [Inspection, Lubrication, Calibration, Replacement, Cleaning, Adjustment, Monitoring, Unknown]
3. Failure Modes: What failures is this task preventing? (list 2-4 specific failure modes)
4. Mechanisms: What failure mechanisms are being addressed? (list 1-3)
5. Detection Methods: How would failures be detected? (list 1-3)
6. Frequency: If mentioned, what is the task frequency?
7. Confidence: How confident are you in this analysis? (0-100)
8. Reasoning: Brief explanation of your analysis

Respond in JSON format:
{{
  "component": "string",
  "asset": "broader asset category if identifiable",
  "task_type": "string",
  "failure_modes": ["string", "string"],
  "mechanisms": ["string"],
  "detection_methods": ["string"],
  "frequency": "string or empty",
  "confidence": number,
  "reasoning": "string"
}}"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=800,
                temperature=0.2
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Parse JSON
            import json
            if result_text.startswith("```"):
                result_text = re.sub(r'^```(?:json)?\n?', '', result_text)
                result_text = re.sub(r'\n?```$', '', result_text)
            
            return json.loads(result_text)
            
        except Exception as e:
            logger.error(f"AI analysis error: {e}")
            return {
                "task_type": pre_classified_type,
                "failure_modes": rule_based_data.get("failure_modes", []),
                "mechanisms": rule_based_data.get("failure_mechanisms", []),
                "detection_methods": rule_based_data.get("detection_methods", []),
                "confidence": 50,
                "reasoning": f"AI analysis failed: {str(e)[:100]}"
            }
    
    def _calculate_confidence(
        self,
        has_component: bool,
        has_frequency: bool,
        task_type_known: bool,
        ai_confidence: int,
        failure_modes_count: int
    ) -> int:
        """Calculate overall confidence score."""
        score = ai_confidence * 0.4  # AI contributes 40%
        
        if has_component:
            score += 15
        if has_frequency:
            score += 10
        if task_type_known:
            score += 15
        if failure_modes_count >= 2:
            score += 10
        if failure_modes_count >= 3:
            score += 10
        
        return min(100, max(0, int(score)))
    
    async def _match_with_library(self, tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Match extracted tasks with existing Failure Mode Library."""
        
        # Get all failure modes for matching
        existing_fms = await self.failure_modes_collection.find({}).to_list(5000)
        
        # Build lookup structures
        fm_by_name = {}
        fm_by_keyword = {}
        
        for fm in existing_fms:
            name_lower = fm.get("failure_mode", "").lower()
            fm_by_name[name_lower] = fm
            
            for keyword in fm.get("keywords", []):
                kw_lower = keyword.lower()
                if kw_lower not in fm_by_keyword:
                    fm_by_keyword[kw_lower] = []
                fm_by_keyword[kw_lower].append(fm)
        
        # Match each task
        for task in tasks:
            matches = []
            
            # Check suggested failure modes against library
            for fm_name in task.get("suggested_failure_modes", []):
                fm_name_str = fm_name if isinstance(fm_name, str) else fm_name.get("name", str(fm_name))
                fm_lower = fm_name_str.lower()
                
                # Direct name match
                if fm_lower in fm_by_name:
                    matches.append({
                        "id": str(fm_by_name[fm_lower].get("_id")),
                        "name": fm_by_name[fm_lower].get("failure_mode"),
                        "match_type": "exact",
                        "score": 100
                    })
                    continue
                
                # Partial name match
                for lib_name, lib_fm in fm_by_name.items():
                    if fm_lower in lib_name or lib_name in fm_lower:
                        matches.append({
                            "id": str(lib_fm.get("_id")),
                            "name": lib_fm.get("failure_mode"),
                            "match_type": "partial",
                            "score": 80
                        })
            
            # Check keywords from task text
            task_words = task.get("original_task", "").lower().split()
            for word in task_words:
                if word in fm_by_keyword:
                    for fm in fm_by_keyword[word][:2]:  # Max 2 per keyword
                        if not any(m["id"] == str(fm.get("_id")) for m in matches):
                            matches.append({
                                "id": str(fm.get("_id")),
                                "name": fm.get("failure_mode"),
                                "match_type": "keyword",
                                "score": 60
                            })
            
            # Sort matches by score
            matches.sort(key=lambda x: -x["score"])
            
            # Determine library match status
            if matches:
                if matches[0]["score"] >= 80:
                    task["library_match"] = {
                        "status": "existing_match",
                        "matched_id": matches[0]["id"],
                        "matched_name": matches[0]["name"],
                        "match_score": matches[0]["score"],
                        "all_matches": matches[:3]
                    }
                elif len(matches) > 1:
                    task["library_match"] = {
                        "status": "multiple_possible",
                        "matches": matches[:3]
                    }
                else:
                    task["library_match"] = {
                        "status": "weak_match",
                        "matches": matches[:3]
                    }
            else:
                task["library_match"] = {
                    "status": "new_proposed"
                }
        
        return tasks
    
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
