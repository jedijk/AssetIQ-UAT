"""
AI Photo Data Extraction API
Universal photo data capture with configurable AI extraction.
Uses OpenAI GPT-4o Vision to extract structured data from images.
Includes learning from past user corrections.
"""
import os
import re
import json
import base64
import logging
import uuid
from datetime import datetime, timezone, date, time
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from auth import get_current_user
from database import db
from openai import OpenAI
from services.storage_service import put_object_async

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI Extraction"])

VISION_KEY = os.environ.get("OPENAI_VISION_KEY") or os.environ.get("OPENAI_API_KEY", "")


class ExtractionField(BaseModel):
    key: str
    description: str
    type: str = "string"
    unit: Optional[str] = None
    required: bool = False
    enum_values: Optional[List[str]] = None


class ExtractionSchema(BaseModel):
    fields: List[ExtractionField]
    mode: str = "hybrid"
    prompt_template: Optional[str] = None
    confidence_threshold: float = 0.7


class ExtractedValue(BaseModel):
    key: str
    value: Any
    confidence: float
    raw_text: Optional[str] = None
    # True when calendar date was snapped to capture anchor (year/drift mismatch)
    date_adjusted: bool = False


class ExtractionResponse(BaseModel):
    success: bool
    extracted: List[ExtractedValue]
    message: Optional[str] = None
    photo_path: Optional[str] = None


async def _get_learned_hints(form_template_id: Optional[str]) -> List[str]:
    """Fetch past corrections to enhance the prompt."""
    if not form_template_id:
        return []

    try:
        # Aggregate corrections: group by field key, find most common correction patterns
        pipeline = [
            {"$match": {"form_template_id": form_template_id}},
            {"$sort": {"created_at": -1}},
            {"$limit": 50},  # Last 50 corrections
            {"$group": {
                "_id": "$field_key",
                "corrections": {"$push": {
                    "ai_value": "$ai_value",
                    "corrected_value": "$corrected_value",
                }},
                "count": {"$sum": 1},
            }},
            {"$match": {"count": {"$gte": 2}}},  # Only fields corrected 2+ times
        ]
        results = await db.ai_extraction_corrections.aggregate(pipeline).to_list(20)

        hints = []
        for r in results:
            key = r["_id"]
            # Find the most recent correction pattern
            latest = r["corrections"][0]
            hints.append(
                f'Note for "{key}": Users have corrected this field {r["count"]} times. '
                f'AI often reads "{latest["ai_value"]}" but correct value tends to be "{latest["corrected_value"]}". '
                f'Please be extra careful with this field.'
            )
        return hints
    except Exception as e:
        logger.warning(f"[AI Extract] Failed to fetch correction hints: {e}")
        return []


_DUTCH_MONTHS = {
    "jan": 1, "januari": 1, "january": 1,
    "feb": 2, "februari": 2, "february": 2,
    "mrt": 3, "maart": 3, "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "mei": 5, "may": 5,
    "jun": 6, "juni": 6, "june": 6,
    "jul": 7, "juli": 7, "july": 7,
    "aug": 8, "augustus": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "okt": 10, "oct": 10, "oktober": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _normalize_date_value(raw: str, kind: str = "date") -> Optional[str]:
    """Safety-net normalizer for AI-returned date/datetime strings.
    Returns ISO (YYYY-MM-DD or YYYY-MM-DDTHH:MM) or None if unparseable.
    """
    if not raw:
        return None
    s = raw.strip()

    # Already ISO date
    m = re.match(r"^(\d{4})[-/.](\d{2})[-/.](\d{2})(?:[T ](\d{1,2}):(\d{2}))?", s)
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        if kind == "datetime" and m.group(4):
            return f"{y}-{mo}-{d}T{int(m.group(4)):02d}:{m.group(5)}"
        return f"{y}-{mo}-{d}" if kind == "date" else f"{y}-{mo}-{d}T00:00"

    # DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY (optional time)
    m = re.match(r"^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        if 1 <= d <= 31 and 1 <= mo <= 12:
            base = f"{y:04d}-{mo:02d}-{d:02d}"
            if kind == "datetime":
                hh = int(m.group(4)) if m.group(4) else 0
                mm = int(m.group(5)) if m.group(5) else 0
                return f"{base}T{hh:02d}:{mm:02d}"
            return base

    # "21 juli 2024" / "21 July 2024"
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})", s)
    if m:
        d = int(m.group(1))
        mo = _DUTCH_MONTHS.get(m.group(2).lower())
        y = int(m.group(3))
        if y < 100:
            y += 2000
        if mo and 1 <= d <= 31:
            base = f"{y:04d}-{mo:02d}-{d:02d}"
            return base if kind == "date" else f"{base}T00:00"
    return None


# Max calendar drift from capture date before we treat OCR date as implausible (~1 month).
_MAX_CAPTURE_DATE_DRIFT_DAYS = 31


def _parse_capture_reference_utc(captured_at_iso: Optional[str]) -> datetime:
    """Client-reported capture instant (ISO); fallback to current UTC."""
    if not captured_at_iso or not isinstance(captured_at_iso, str):
        return datetime.now(timezone.utc)
    s = captured_at_iso.strip()
    if not s:
        return datetime.now(timezone.utc)
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def _calibrate_date_value_to_capture(
    value: Any,
    field_type: str,
    ref_utc: datetime,
    confidence: float,
) -> tuple[Any, float, bool]:
    """
    If the extracted calendar date is a different year or more than ~1 month from
    the capture anchor, snap the calendar date to the capture date (keep time for
    datetime), cap confidence, and mark date_adjusted for UI.
    """
    if value is None or field_type not in ("date", "datetime"):
        return value, confidence, False
    normalized = _normalize_date_value(str(value).strip(), field_type)
    if not normalized:
        return value, confidence, False

    ref_cal: date = ref_utc.date()
    time_part: time = time(0, 0)
    try:
        if field_type == "date":
            extracted_date = datetime.strptime(normalized[:10], "%Y-%m-%d").date()
        else:
            if "T" in normalized:
                dt_part = datetime.strptime(normalized[:16], "%Y-%m-%dT%H:%M")
                extracted_date = dt_part.date()
                time_part = dt_part.time()
            else:
                extracted_date = datetime.strptime(normalized[:10], "%Y-%m-%d").date()
    except ValueError:
        return normalized, confidence, False

    delta_days = abs((extracted_date - ref_cal).days)
    year_mismatch = extracted_date.year != ref_cal.year
    if not year_mismatch and delta_days <= _MAX_CAPTURE_DATE_DRIFT_DAYS:
        return normalized, confidence, False

    new_conf = min(float(confidence), 0.28)
    if field_type == "date":
        return ref_cal.isoformat(), new_conf, True
    out = datetime.combine(ref_cal, time_part).strftime("%Y-%m-%dT%H:%M")
    return out, new_conf, True


def _schema_has_date_or_datetime(schema: ExtractionSchema) -> bool:
    return any(f.type in ("date", "datetime") for f in schema.fields)


def _build_prompt(
    schema: ExtractionSchema,
    hints: List[str] = None,
    capture_anchor_utc: Optional[datetime] = None,
) -> str:
    if schema.prompt_template:
        prompt = schema.prompt_template
        if hints:
            prompt += "\n\nLearned corrections from past usage:\n" + "\n".join(hints)
        if capture_anchor_utc and _schema_has_date_or_datetime(schema):
            anchor = capture_anchor_utc.strftime("%Y-%m-%d %H:%M UTC")
            prompt += (
                "\n\nPHOTO CAPTURE ANCHOR (UTC): approximately "
                f"{anchor}. For ambiguous reading dates/times, align with this capture window; "
                "do not guess a year or month far from it unless the image clearly shows a different printed date."
            )
        return prompt

    lines = [
        "Analyze this image and extract the following data fields.",
        "CRITICAL: The 'key' in your response MUST be EXACTLY the same string as listed below. Do not rename, abbreviate, or modify the keys.",
        "For each key, also provide a confidence score (0.0 to 1.0).",
        "",
        "Fields to extract:",
    ]
    has_date_field = False
    has_datetime_field = False
    for f in schema.fields:
        desc = f.description
        if f.unit:
            desc += f" (unit: {f.unit})"
        if f.type == "enum" and f.enum_values:
            desc += f" (must be one of: {', '.join(f.enum_values)})"
        if f.type == "date":
            desc += ". Return the date STRICTLY in ISO format YYYY-MM-DD (e.g. 2024-07-21). Handle European DD-MM-YYYY or DD/MM/YYYY dates by converting to YYYY-MM-DD. If only month/day visible without year, assume current year"
            has_date_field = True
        elif f.type == "datetime":
            desc += ". Return the datetime STRICTLY in ISO format YYYY-MM-DDTHH:MM (e.g. 2024-07-21T14:30)"
            has_datetime_field = True
        required = " [REQUIRED]" if f.required else ""
        lines.append(f'  - "{f.key}": {desc}{required} (type: {f.type})')

    if has_date_field or has_datetime_field:
        lines.append("")
        lines.append("DATE FORMAT RULES (very important):")
        lines.append("- European dates like '21-07-2024', '21/07/2024', '21.07.2024' mean 21 July 2024 (day-month-year).")
        lines.append("- Always output dates as YYYY-MM-DD (ISO 8601).")
        lines.append("- Month names in Dutch/German/English (e.g. 'juli', 'Juli', 'July') must be converted to numeric format.")
        lines.append("- If the year is written with only 2 digits (e.g. '24'), assume 20XX (2024).")

    if capture_anchor_utc and (has_date_field or has_datetime_field):
        anchor = capture_anchor_utc.strftime("%Y-%m-%d %H:%M UTC")
        lines.append("")
        lines.append("PHOTO CAPTURE ANCHOR (trust this for ambiguous dates):")
        lines.append(f"- This photo was captured at approximately {anchor}.")
        lines.append(
            "- For date/datetime fields that describe when this reading was taken (gauges, forms, labels on equipment): "
            "the calendar date should match this capture window unless the image clearly shows a different printed date as the main subject."
        )
        lines.append(
            "- Do not output a year or month far from this capture window from noisy or partial digits. "
            "If the printed date is ambiguous, use the capture calendar date and set confidence lower."
        )

    # Append learned corrections
    if hints:
        lines.append("")
        lines.append("IMPORTANT - Learned corrections from past usage:")
        for h in hints:
            lines.append(f"  {h}")

    lines.append("")
    lines.append("Return ONLY valid JSON in this exact format:")
    lines.append('{')
    lines.append('  "results": [')
    lines.append('    {"key": "<field_key>", "value": <extracted_value>, "confidence": <0.0-1.0>, "raw_text": "<what you read from image>"},')
    lines.append('    ...')
    lines.append('  ]')
    lines.append('}')
    lines.append("")
    lines.append("If a field is not visible or cannot be determined, set value to null and confidence to 0.")
    return "\n".join(lines)


@router.post("/extract", response_model=ExtractionResponse)
async def extract_from_image(
    image: UploadFile = File(...),
    schema_json: str = Form(...),
    form_template_id: Optional[str] = Form(None),
    captured_at_iso: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    if not VISION_KEY:
        raise HTTPException(status_code=500, detail="Vision API key not configured")

    try:
        schema = ExtractionSchema(**json.loads(schema_json))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid schema: {e}")

    # Auto-upgrade extraction field types based on the mapped form field types.
    # This ensures date/datetime fields get proper formatting hints even when
    # the saved extraction config still has type="string" from older configs.
    form_template_doc = None
    if form_template_id:
        try:
            form_template_doc = await db.form_templates.find_one(
                {"id": form_template_id}, {"_id": 0, "fields": 1, "photo_extraction_config": 1}
            )
        except Exception as e:
            logger.warning(f"[AI Extract] Could not fetch form template {form_template_id}: {e}")

    if form_template_doc:
        form_fields_by_id = {f.get("id"): f for f in (form_template_doc.get("fields") or [])}
        saved_cfg = form_template_doc.get("photo_extraction_config") or {}
        saved_fields_by_key = {ef.get("key"): ef for ef in (saved_cfg.get("extraction_fields") or []) if ef.get("key")}
        for ef in schema.fields:
            target_id = None
            saved = saved_fields_by_key.get(ef.key)
            if saved:
                target_id = saved.get("target_field_id")
            form_field = form_fields_by_id.get(target_id) if target_id else None
            if form_field:
                target_type = form_field.get("field_type") or form_field.get("type")
                if target_type in ("date", "datetime") and ef.type not in ("date", "datetime"):
                    ef.type = target_type
                    logger.info(f"[AI Extract] Auto-upgraded extraction type for '{ef.key}' to '{target_type}' (mapped to '{target_id}')")
                elif target_type == "numeric" and ef.type == "string":
                    ef.type = "number"

    # Read and encode image
    image_bytes = await image.read()
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    mime = image.content_type or "image/jpeg"
    data_uri = f"data:{mime};base64,{b64}"

    # Store the compressed photo immediately
    photo_path = None
    try:
        ext = (image.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
        if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
            ext = "jpg"
        photo_path = f"ai-scans/{current_user.get('id')}/{uuid.uuid4()}.{ext}"
        await put_object_async(photo_path, image_bytes, mime)
        logger.info(f"[AI Extract] Stored photo: {photo_path} ({len(image_bytes)} bytes)")
    except Exception as store_err:
        logger.warning(f"[AI Extract] Failed to store photo: {store_err}")
        photo_path = None

    # Fetch learned hints from past corrections
    hints = await _get_learned_hints(form_template_id)
    if hints:
        logger.info(f"[AI Extract] Applying {len(hints)} learned correction hints")

    ref_utc = _parse_capture_reference_utc(captured_at_iso)
    prompt = _build_prompt(schema, hints, capture_anchor_utc=ref_utc)
    logger.info(
        f"[AI Extract] user={current_user.get('id')} fields={len(schema.fields)} mode={schema.mode} "
        f"hints={len(hints)} capture_anchor={ref_utc.isoformat()}"
    )

    try:
        client = OpenAI(api_key=VISION_KEY)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_uri, "detail": "high"}},
                    ],
                }
            ],
            max_completion_tokens=1000,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()
        logger.info(f"[AI Extract] Raw response (first 500 chars): {raw[:500]}")
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        parsed = json.loads(raw)
        results = parsed.get("results", [])

        extracted = []
        schema_fields = {f.key: f for f in schema.fields}
        normalize = lambda s: ''.join(c for c in s.lower() if c.isalnum())
        norm_schema = {normalize(k): k for k in schema_fields}
        
        for idx, item in enumerate(results):
            ai_key = item["key"]
            # Try exact match
            if ai_key in schema_fields:
                matched_key = ai_key
            else:
                # Try normalized match
                norm_ai = normalize(ai_key)
                matched_key = norm_schema.get(norm_ai)
                if not matched_key and idx < len(schema.fields):
                    # Fallback: match by position
                    matched_key = schema.fields[idx].key
                    logger.info(f"[AI Extract] Positional match: AI key '{ai_key}' → schema key '{matched_key}'")
                elif matched_key:
                    logger.info(f"[AI Extract] Normalized match: AI key '{ai_key}' → schema key '{matched_key}'")
                else:
                    matched_key = ai_key
                    logger.warning(f"[AI Extract] No match for AI key '{ai_key}'")

            # Normalize date/datetime values as a safety net in case AI returns non-ISO format
            value = item.get("value")
            conf = float(item.get("confidence", 0))
            matched_schema_field = schema_fields.get(matched_key)
            date_adjusted = False
            if value and matched_schema_field and matched_schema_field.type in ("date", "datetime"):
                normalized = _normalize_date_value(str(value), matched_schema_field.type)
                if normalized and normalized != value:
                    logger.info(f"[AI Extract] Normalized {matched_schema_field.type} value for '{matched_key}': '{value}' → '{normalized}'")
                    value = normalized
                value, conf, date_adjusted = _calibrate_date_value_to_capture(
                    value, matched_schema_field.type, ref_utc, conf
                )
                if date_adjusted:
                    logger.info(
                        f"[AI Extract] Calibrated {matched_schema_field.type} for '{matched_key}' to capture date "
                        f"(confidence→{conf:.2f})"
                    )

            extracted.append(ExtractedValue(
                key=matched_key,
                value=value,
                confidence=conf,
                raw_text=item.get("raw_text"),
                date_adjusted=date_adjusted,
            ))

        logger.info(f"[AI Extract] success - {len(extracted)} fields extracted")
        logger.info(f"[AI Extract] keys returned: {[e.key for e in extracted]}")

        return ExtractionResponse(success=True, extracted=extracted, photo_path=photo_path)

    except json.JSONDecodeError:
        logger.error(f"[AI Extract] Failed to parse response: {raw[:200]}")
        return ExtractionResponse(success=False, extracted=[], message="AI returned invalid format. Please retry.", photo_path=photo_path)
    except Exception as e:
        logger.error(f"[AI Extract] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


class CorrectionEntry(BaseModel):
    field_key: str
    ai_value: Any
    corrected_value: Any


class CorrectionsBatch(BaseModel):
    form_template_id: str
    corrections: List[CorrectionEntry]


@router.post("/extract/corrections")
async def store_corrections(
    data: CorrectionsBatch,
    current_user: dict = Depends(get_current_user),
):
    """Store user corrections to improve future extraction accuracy."""
    now = datetime.now(timezone.utc)
    docs = []
    for c in data.corrections:
        docs.append({
            "form_template_id": data.form_template_id,
            "field_key": c.field_key,
            "ai_value": c.ai_value,
            "corrected_value": c.corrected_value,
            "corrected_by": current_user.get("id"),
            "created_at": now,
        })

    if docs:
        await db.ai_extraction_corrections.insert_many(docs)
        logger.info(f"[AI Extract] Stored {len(docs)} corrections for form {data.form_template_id}")

    return {"stored": len(docs)}
