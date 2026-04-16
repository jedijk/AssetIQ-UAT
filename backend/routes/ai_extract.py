"""
AI Photo Data Extraction API
Universal photo data capture with configurable AI extraction.
Uses OpenAI GPT-4o Vision to extract structured data from images.
"""
import os
import json
import base64
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from auth import get_current_user
from openai import OpenAI

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI Extraction"])

VISION_KEY = os.environ.get("OPENAI_VISION_KEY", "")


class ExtractionField(BaseModel):
    key: str
    description: str
    type: str = "string"  # string, number, enum
    unit: Optional[str] = None
    required: bool = False
    enum_values: Optional[List[str]] = None


class ExtractionSchema(BaseModel):
    fields: List[ExtractionField]
    mode: str = "hybrid"  # structured, text, classification, hybrid
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


def _build_prompt(schema: ExtractionSchema) -> str:
    if schema.prompt_template:
        return schema.prompt_template

    lines = [
        "Analyze this image and extract the following data fields.",
        "Return a JSON object with exactly the keys listed below.",
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

    prompt = _build_prompt(schema)
    logger.info(f"[AI Extract] user={current_user.get('id')} fields={len(schema.fields)} mode={schema.mode}")

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
            max_tokens=1000,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        parsed = json.loads(raw)
        results = parsed.get("results", [])

        extracted = []
        for item in results:
            extracted.append(ExtractedValue(
                key=item["key"],
                value=item.get("value"),
                confidence=float(item.get("confidence", 0)),
                raw_text=item.get("raw_text"),
            ))

        logger.info(f"[AI Extract] success - {len(extracted)} fields extracted")
        return ExtractionResponse(success=True, extracted=extracted)

    except json.JSONDecodeError:
        logger.error(f"[AI Extract] Failed to parse response: {raw[:200]}")
        return ExtractionResponse(success=False, extracted=[], message="AI returned invalid format. Please retry.")
    except Exception as e:
        logger.error(f"[AI Extract] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
