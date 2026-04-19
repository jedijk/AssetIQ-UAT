"""
AI Photo Data Extraction API
Universal photo data capture with configurable AI extraction.
Uses OpenAI GPT-4o Vision to extract structured data from images.
Includes learning from past user corrections.
"""
import os
import json
import base64
import logging
import uuid
from datetime import datetime, timezone
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


def _build_prompt(schema: ExtractionSchema, hints: List[str] = None) -> str:
    if schema.prompt_template:
        prompt = schema.prompt_template
        if hints:
            prompt += "\n\nLearned corrections from past usage:\n" + "\n".join(hints)
        return prompt

    lines = [
        "Analyze this image and extract the following data fields.",
        "CRITICAL: The 'key' in your response MUST be EXACTLY the same string as listed below. Do not rename, abbreviate, or modify the keys.",
        "For each key, also provide a confidence score (0.0 to 1.0).",
        "",
        "Fields to extract:",
    ]
    for f in schema.fields:
        desc = f.description
        if f.unit:
            desc += f" (unit: {f.unit})"
        if f.type == "enum" and f.enum_values:
            desc += f" (must be one of: {', '.join(f.enum_values)})"
        required = " [REQUIRED]" if f.required else ""
        lines.append(f'  - "{f.key}": {desc}{required} (type: {f.type})')

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
    current_user: dict = Depends(get_current_user),
):
    if not VISION_KEY:
        raise HTTPException(status_code=500, detail="Vision API key not configured")

    try:
        schema = ExtractionSchema(**json.loads(schema_json))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid schema: {e}")

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

    prompt = _build_prompt(schema, hints)
    logger.info(f"[AI Extract] user={current_user.get('id')} fields={len(schema.fields)} mode={schema.mode} hints={len(hints)}")

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
            
            extracted.append(ExtractedValue(
                key=matched_key,
                value=item.get("value"),
                confidence=float(item.get("confidence", 0)),
                raw_text=item.get("raw_text"),
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
