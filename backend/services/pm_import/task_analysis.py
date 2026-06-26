"""PM Import task classification and AI enrichment."""
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

    async def _analyze_task(
        self,
        row: Dict[str, Any],
        session_id: str,
        file_name: str
    ) -> Optional[Dict[str, Any]]:
        """Analyze a single maintenance task and extract failure mode intelligence."""
        
        # Use clean task text if available, otherwise use raw_text
        task_text = row.get("_task_text") or row.get("_raw_text", "")
        if not task_text or len(task_text) < 5:
            return None
        
        # Step 1: Rule-based pre-classification
        task_type, rule_based_data = self._classify_by_rules(task_text)
        
        # Step 2: Extract frequency (from parsed data or text)
        frequency = row.get("_frequency") or row.get("_ocr_data", {}).get("frequency", "")
        if not frequency:
            frequency = self._extract_frequency(task_text)
        
        # Step 2b: Extract estimated duration (task execution time)
        duration_field_text = ""
        # Check common duration column names from parsed data
        for key in ("duration", "estimated_time", "estimated time", "time", "estimated_duration", "tijd", "duur"):
            if row.get(key):
                duration_field_text = str(row.get(key))
                break
        ocr_duration = row.get("_ocr_data", {}).get("duration") or row.get("_ocr_data", {}).get("estimated_time")
        estimated_time = self._extract_duration(duration_field_text) \
            or (str(ocr_duration) if ocr_duration else "") \
            or self._extract_duration(task_text)
        
        # Step 3: Extract component (from parsed data, OCR data, or text)
        component = row.get("_equipment") or row.get("_ocr_data", {}).get("equipment", "")
        if not component:
            component = self._extract_component(task_text)
        
        # Step 3b: Extract discipline from Excel column if present
        # Check common discipline column names (case-insensitive matching via row keys)
        explicit_discipline = ""
        # Log all keys to debug column detection
        row_keys = [k for k in row.keys() if not k.startswith('_')]
        logger.info(f"Row columns (non-internal): {row_keys}")
        
        for key in row.keys():
            key_lower = key.lower().strip() if isinstance(key, str) else ""
            if key_lower in ("discipline", "disc", "vakgebied", "specialisme", "dept", "department"):
                val = row.get(key, "")
                if val and str(val).strip():
                    explicit_discipline = str(val).strip()
                    logger.info(f"Found explicit discipline '{explicit_discipline}' from column '{key}'")
                    break
        
        if not explicit_discipline:
            logger.info("No explicit discipline found in columns")
        
        # Step 4: AI enhancement
        ai_analysis = await self._ai_analyze_task(
            task_text, task_type, rule_based_data, session_id=session_id
        )
        
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
            "original_task": task_text,  # Clean task text without delimiters
            # CRITICAL: Preserve equipment tag from Column A - this is the ONLY authoritative source
            "equipment_tag": row.get("_tag", ""),  # From Column A - DO NOT use AI extraction
            "component": component or ai_analysis.get("component", ""),
            "asset": row.get("_tag", "") or ai_analysis.get("asset", ""),  # Prefer Column A tag
            "task_type": ai_analysis.get("task_type", task_type),
            "action_type": self._infer_action_type(
                task_text,
                ai_analysis.get("task_type", task_type),
                ai_analysis.get("action_type"),
            ),
            "discipline": self._infer_discipline(
                task_text,
                component or ai_analysis.get("component", ""),
                ai_analysis.get("task_type", task_type),
                # Priority: explicit Excel column value > AI hint
                explicit_discipline or ai_analysis.get("discipline"),
            ),
            "suggested_failure_modes": ai_analysis.get("failure_modes", rule_based_data.get("failure_modes", [])),
            "failure_mechanisms": ai_analysis.get("mechanisms", rule_based_data.get("failure_mechanisms", [])),
            "detection_methods": ai_analysis.get("detection_methods", rule_based_data.get("detection_methods", [])),
            "existing_control": task_text,
            "frequency": frequency or ai_analysis.get("frequency", ""),
            "estimated_time": estimated_time or ai_analysis.get("estimated_time", ""),
            "confidence_score": confidence,
            "ai_reasoning": ai_analysis.get("reasoning", ""),
            "review_status": "pending",
            "is_active": True,
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
    
    def _infer_action_type(
        self,
        task_text: str,
        task_type: str,
        ai_hint: Optional[str] = None,
    ) -> str:
        """Infer maintenance action type: PM (preventive), PDM (predictive), CM (corrective)."""
        text_lower = (task_text or "").lower()
        
        # 1) Honor explicit AI hint if it's a valid action type
        if ai_hint and ai_hint.upper() in ACTION_TYPES:
            return ai_hint.upper()
        
        # 2) Keyword override (predictive/corrective signals beat the default)
        for action_type, keywords in ACTION_TYPE_KEYWORDS.items():
            if any(kw in text_lower for kw in keywords):
                return action_type
        
        # 3) Fall back to task-type default
        default = TASK_TYPE_DEFAULTS.get(task_type, TASK_TYPE_DEFAULTS["Unknown"])
        return default["action_type"]
    
    def _infer_discipline(
        self,
        task_text: str,
        component: str,
        task_type: str,
        ai_hint: Optional[str] = None,
    ) -> str:
        """Infer execution discipline from task text, component, and task type."""
        from models.disciplines import normalize_discipline, normalize_discipline_or_default, DISCIPLINE_LIST
        
        # 1) Honor explicit hint (from Excel column or AI) if it normalizes to a known discipline
        if ai_hint:
            normalized = normalize_discipline(ai_hint)
            if normalized in DISCIPLINE_LIST:
                logger.debug(f"_infer_discipline: Using explicit/AI hint '{ai_hint}' -> normalized to '{normalized}'")
                return normalized
            else:
                logger.debug(f"_infer_discipline: Hint '{ai_hint}' normalized to '{normalized}' but not in DISCIPLINE_LIST, falling back")
        
        haystack = f"{task_text or ''} {component or ''}".lower()
        
        # 2) Keyword scoring across haystack — pick the discipline with most matches
        scores = {discipline: 0 for discipline in DISCIPLINE_KEYWORDS}
        for discipline, keywords in DISCIPLINE_KEYWORDS.items():
            for kw in keywords:
                if kw in haystack:
                    scores[discipline] += 1
        
        best = max(scores.items(), key=lambda kv: kv[1])
        if best[1] > 0:
            logger.debug(f"_infer_discipline: Keyword match found, returning '{best[0]}'")
            return best[0]
        
        # 3) Fall back to task-type default
        default = TASK_TYPE_DEFAULTS.get(task_type, TASK_TYPE_DEFAULTS["Unknown"])
        logger.debug(f"_infer_discipline: Falling back to task-type default '{default['discipline']}' for task_type '{task_type}'")
        return normalize_discipline_or_default(default["discipline"])
    
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
    
    def _extract_duration(self, text: str) -> str:
        """Extract estimated task duration from text (e.g., '30 min', '2 hours').
        
        Returns a clean, normalized duration string or empty if none found.
        """
        text_lower = (text or "").lower()
        
        for pattern, unit in DURATION_PATTERNS:
            match = re.search(pattern, text_lower)
            if not match:
                continue
            value = match.group(1).replace(",", ".")
            try:
                num = float(value)
            except ValueError:
                continue
            # Filter out values that are obviously frequency intervals, not durations
            if unit == "hours" and num > 24:
                continue
            if unit == "minutes" and num > 480:  # >8h likely not a duration
                continue
            # Normalize formatting
            if num.is_integer():
                num_str = str(int(num))
            else:
                num_str = f"{num:g}"
            label = "hour" if (unit == "hours" and num == 1) else unit
            return f"{num_str} {label}"
        
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
        rule_based_data: Dict[str, Any],
        *,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Use AI to enhance task analysis."""
        from services.ai_gateway import chat as ai_gateway_chat

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

        user_id, company_id = await self._ai_user_context(session_id)
        
        prompt = f"""Analyze this preventive maintenance task and extract reliability intelligence.

MAINTENANCE TASK: "{task_text}"

Pre-classified type: {pre_classified_type}
Pre-identified failure modes: {rule_based_data.get('failure_modes', [])}

Please analyze and provide:
1. Component: What equipment/component is this task for?
2. Task Type: One of [Inspection, Lubrication, Calibration, Replacement, Cleaning, Adjustment, Monitoring, Unknown]
3. Action Type: Maintenance strategy — one of:
   - "PM"  (Preventive — time/usage-based scheduled work)
   - "PDM" (Predictive — condition-based monitoring like vibration, oil, thermography)
   - "CM"  (Corrective — repair on failure)
4. Discipline: Execution discipline — one of [Rotating, Static, Piping, Electrical, Instrumentation, Civil, Operations, Laboratory]
5. Failure Modes: What failures is this task preventing? (list 2-4 specific failure modes)
6. Mechanisms: What failure mechanisms are being addressed? (list 1-3)
7. Detection Methods: How would failures be detected? (list 1-3)
8. Frequency: If mentioned, what is the task frequency?
9. Estimated Time: If mentioned, estimated duration to execute this task (e.g., "30 min", "2 hours"). Empty if not stated.
10. Confidence: How confident are you in this analysis? (0-100)
11. Reasoning: Brief explanation of your analysis

Respond in JSON format:
{{
  "component": "string",
  "asset": "broader asset category if identifiable",
  "task_type": "string",
  "action_type": "PM | PDM | CM",
  "discipline": "string",
  "failure_modes": ["string", "string"],
  "mechanisms": ["string"],
  "detection_methods": ["string"],
  "frequency": "string or empty",
  "estimated_time": "string or empty",
  "confidence": number,
  "reasoning": "string"
}}"""

        try:
            result_text = (
                await ai_gateway_chat(
                    [{"role": "user", "content": prompt}],
                    user_id=user_id,
                    company_id=company_id,
                    endpoint="pm_import.analyze_task",
                    model="gpt-4o-mini",
                    max_tokens=800,
                    temperature=0.2,
                )
            ).strip()
            
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
    
    # ============================================================
    # AI Enrichment (new — replaces FM/library matching per refactor spec)
    # ============================================================
    
    # Canonical frequency vocabulary + day mapping
    _FREQUENCY_DAYS = {
        "Daily": 1,
        "Weekly": 7,
        "Biweekly": 14,
        "Monthly": 30,
        "Quarterly": 90,
        "Semi-Annual": 180,
        "Annual": 365,
        "Every 2 Years": 730,
        "Every 3 Years": 1095,
        "Condition Based": None,
        "One Time": None,
    }
    _DISCIPLINES = [
        "Rotating", "Static", "Piping", "Electrical", "Instrumentation",
        "Civil", "Operations", "Laboratory",
    ]
    _TASK_TYPES = ["PM", "PDM", "CBM", "CM"]
    
    async def _ai_enrich_tasks(self, tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Synchronous AI enrichment per the PM Import refactor spec. For each task,
        the LLM is asked to:
          1. Translate `task_description` to English
          2. Classify task_type ∈ {PM, PDM, CBM, CM}
          3. Suggest a discipline from the configured list
          4. Standardize frequency to canonical vocabulary
          5. Estimate labor hours
        
        Each call is batched to keep cost down. On any failure the task keeps
        rule-derived defaults so the import never fully blocks.
        """
        if not tasks:
            return tasks
        
        from services.ai_gateway import chat as ai_gateway_chat
        
        # Batch into groups of 10 to stay within token limits
        BATCH = 10
        for batch_start in range(0, len(tasks), BATCH):
            batch = tasks[batch_start: batch_start + BATCH]
            
            # Build a compact prompt
            payload = []
            for idx, t in enumerate(batch):
                payload.append({
                    "i": idx,
                    "raw_task": (t.get("original_task") or "")[:400],
                    "component": (t.get("component") or "")[:120],
                    "asset": (t.get("asset") or "")[:120],
                    "raw_frequency": (t.get("frequency") or "")[:80],
                })
            
            try:
                from services.ai_platform import execute_json_prompt

                result = await execute_json_prompt(
                    "pm_import.task_enrich",
                    user={"id": "pm-import", "company_id": "default"},
                    user_message=(
                        "Enrich these maintenance tasks. Reply with JSON only.\n\n"
                        + json.dumps(payload, ensure_ascii=False)
                    ),
                    variables={
                        "task_types": str(self._TASK_TYPES),
                        "disciplines": str(self._DISCIPLINES),
                        "frequencies": str(list(self._FREQUENCY_DAYS.keys())),
                    },
                    endpoint="pm_import.task_analysis.enrich",
                    model="gpt-4o",
                    temperature=0.1,
                    response_format={"type": "json_object"},
                )
                parsed = result["parsed"] or {}
                results = parsed.get("results") or parsed.get("tasks") or []
                by_idx = {int(r.get("i")): r for r in results if "i" in r}
            except Exception as e:
                logger.warning(f"AI enrichment batch failed: {e}")
                by_idx = {}
            
            # Merge back into tasks
            for idx, t in enumerate(batch):
                ai = by_idx.get(idx, {})
                
                # Task description (English)
                t["task_description"] = (
                    ai.get("task_description")
                    or t.get("original_task")
                    or ""
                ).strip()
                
                # Task type — clamp to allowed
                tt = (ai.get("task_type") or "").upper().strip()
                t["task_type"] = tt if tt in self._TASK_TYPES else "PM"
                
                # Discipline — clamp to allowed, then map to standard value
                from models.disciplines import normalize_discipline_or_default

                disc = (ai.get("discipline") or "").strip()
                if disc in self._DISCIPLINES:
                    t["discipline"] = normalize_discipline_or_default(disc)
                elif t.get("discipline") in self._DISCIPLINES:
                    t["discipline"] = normalize_discipline_or_default(t.get("discipline"))
                else:
                    t["discipline"] = normalize_discipline_or_default(
                        t.get("discipline") or "Rotating"
                    )
                
                # Frequency — clamp to allowed
                freq = (ai.get("frequency") or "").strip()
                if freq not in self._FREQUENCY_DAYS:
                    # try title-case variant
                    freq_tc = freq.title()
                    freq = freq_tc if freq_tc in self._FREQUENCY_DAYS else "Monthly"
                t["frequency"] = freq
                
                # Frequency days
                fdays = ai.get("frequency_days")
                if fdays is None:
                    fdays = self._FREQUENCY_DAYS.get(freq)
                try:
                    t["frequency_days"] = int(fdays) if fdays is not None else None
                except (TypeError, ValueError):
                    t["frequency_days"] = self._FREQUENCY_DAYS.get(freq)
                
                # Estimated hours
                try:
                    eh = float(ai.get("estimated_hours") or 0)
                    t["estimated_hours"] = max(0.1, min(24.0, eh)) if eh else 0.5
                except (TypeError, ValueError):
                    t["estimated_hours"] = 0.5
                
                # Confidence score
                try:
                    cs = int(ai.get("confidence_score") or 0)
                    t["confidence_score"] = max(0, min(100, cs)) if cs else 50
                except (TypeError, ValueError):
                    t["confidence_score"] = 50
        
        return tasks
    
    def _normalize_task_shape(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Project a task into the canonical PM Import output shape per the refactor spec.
        Drops FM-related fields entirely.
        """
        return {
            "task_id": task.get("task_id"),
            # Equipment fields
            "equipment_tag": task.get("equipment_tag") or task.get("asset") or "",
            "equipment_description": task.get("equipment_description") or task.get("component") or "",
            # Task fields
            "task_description": task.get("task_description") or task.get("original_task") or "",
            "task_type": task.get("task_type") or "PM",
            "discipline": normalize_pm_import_discipline(task.get("discipline")),
            "frequency": task.get("frequency") or "Monthly",
            "frequency_days": task.get("frequency_days"),
            "estimated_hours": task.get("estimated_hours") or 0.5,
            "confidence_score": task.get("confidence_score") or 50,
            # Match + review
            "equipment_match": task.get("equipment_match"),
            "review_status": task.get("review_status") or "pending",
            "is_active": task.get("is_active", True),
            # Raw source preserved for traceability
            "original_task": task.get("original_task") or "",
        }
    
    # ============================================================
    # Multi-tag splitting (one task per tag in the Tag column)
    # ============================================================
    
    # Recognized separators between tags inside a single Tag-column cell.
    _MULTI_TAG_SEPARATORS = re.compile(
        r"\s*(?:,|;|\||/|\\|\+|\bin\b|\band\b|\b&\b|\ben\b|\bof\b|\n|\r)\s*",
        flags=re.IGNORECASE,
    )
    
    def _split_multi_tag_tasks(self, tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        If a task's Tag column (`equipment_tag` / `asset`) contains multiple tags
        (e.g. "P-1001, P-1002" or "MTR-01 / MTR-02"), duplicate the task into one
        row per tag. All other fields are copied; each child gets:
          - a fresh task_id
          - parent_task_id pointing at the original
          - equipment_tag set to the single tag
        """
        if not tasks:
            return tasks
        
        out = []
        for task in tasks:
            raw_tag = (task.get("equipment_tag") or task.get("asset") or "").strip()
            if not raw_tag:
                out.append(task)
                continue
            
            # Split & filter
            parts = [p.strip() for p in self._MULTI_TAG_SEPARATORS.split(raw_tag)]
            parts = [p for p in parts if p and len(p) >= 2]
            
            # Deduplicate (case-insensitive) while preserving order
            seen = set()
            unique_parts = []
            for p in parts:
                key = p.upper()
                if key not in seen:
                    seen.add(key)
                    unique_parts.append(p)
            
            # If only one tag (or splitting produced nothing useful), keep as-is
            if len(unique_parts) <= 1:
                out.append(task)
                continue
            
            parent_id = task.get("task_id")
            for idx, tag_value in enumerate(unique_parts):
                child = dict(task)
                child["task_id"] = str(uuid.uuid4())
                child["parent_task_id"] = parent_id
                child["multi_tag_index"] = idx
                child["multi_tag_total"] = len(unique_parts)
                child["equipment_tag"] = tag_value
                child["asset"] = tag_value
                # Clear any prior auto-match so it's recomputed per tag
                child["equipment_match"] = None
                out.append(child)
        
        return out
    
