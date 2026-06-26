"""Investigation file upload/download and AI problem-check."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import HTTPException

from database import db
from services.ai_gateway import chat as ai_gateway_chat, user_context
from services.investigation_queries import investigation_query
from services.storage_service import APP_NAME, MIME_TYPES, get_object_async, put_object_async
from services.tenant_schema import with_tenant_id
from services.tenant_scope import scoped

logger = logging.getLogger(__name__)

DEFENSIVE_REASONING_CHECK_PROMPT = """You are an expert in Root Cause Analysis (RCA) and reliability engineering. Your role is to help engineers write better problem statements by identifying and removing DEFENSIVE REASONING patterns that block effective investigation.

Respond with JSON only:
{
  "analysis": {"blame_patterns": [], "assumption_patterns": [], "solution_patterns": [], "clarity_score": "red|yellow|green"},
  "has_issues": true/false,
  "refined_description": "Improved neutral problem statement",
  "guidance": ["Specific suggestions"],
  "changes_made": ["List of specific changes made to improve the statement"]
}

Be thorough but constructive. The goal is to help the investigator, not criticize them."""


async def upload_investigation_file(
    user: dict,
    inv_id: str,
    *,
    file_data: bytes,
    filename: str,
    content_type: str,
    description: Optional[str] = None,
) -> dict:
    """Upload a file to an investigation and create an evidence record."""
    inv = await db.investigations.find_one(investigation_query(user, inv_id=inv_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    if not filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    resolved_content_type = content_type or MIME_TYPES.get(ext, "application/octet-stream")
    image_exts = ["jpg", "jpeg", "png", "gif", "webp"]
    doc_exts = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv"]
    if ext in image_exts:
        evidence_type = "photo"
    elif ext in doc_exts:
        evidence_type = "document"
    else:
        evidence_type = "file"

    file_size = len(file_data)
    if file_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")

    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/investigations/{inv_id}/{file_id}.{ext}"

    try:
        result = await put_object_async(storage_path, file_data, resolved_content_type)
        evidence_doc = with_tenant_id({
            "id": file_id,
            "investigation_id": inv_id,
            "name": filename,
            "evidence_type": evidence_type,
            "description": description,
            "storage_path": result["path"],
            "content_type": resolved_content_type,
            "file_size": file_size,
            "original_filename": filename,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }, user)
        await db.evidence_items.insert_one(evidence_doc)
        evidence_doc.pop("_id", None)
        return evidence_doc
    except Exception as exc:
        logger.error("File upload failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File upload failed: {exc}") from exc


async def download_file(user: dict, path: str) -> Tuple[bytes, str, str]:
    """Return file bytes, content type, and original filename for a storage path."""
    record = await db.evidence_items.find_one(
        scoped(user, {"storage_path": path, "is_deleted": {"$ne": True}})
    )
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        data, content_type = await get_object_async(path)
        return (
            data,
            record.get("content_type", content_type),
            record.get("original_filename", "download"),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found in storage") from exc
    except Exception as exc:
        logger.error("File download failed: %s", exc)
        raise HTTPException(status_code=500, detail="File download failed") from exc


async def ai_problem_check(user: dict, inv_id: str, description: str) -> dict:
    """Analyze investigation description for defensive reasoning patterns."""
    from services.ai_citation import attach_citations_to_response, format_citations_for_prompt
    from services.ai_evidence_pack import build_evidence_pack

    inv = await db.investigations.find_one(investigation_query(user, inv_id=inv_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    description = description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="Description cannot be empty")

    equipment_id = inv.get("asset_id")
    evidence_pack = None
    if equipment_id:
        try:
            evidence_pack = await build_evidence_pack(
                user=user,
                equipment_id=equipment_id,
                intent="investigation",
            )
        except Exception as exc:
            logger.warning("investigation evidence pack failed: %s", exc)

    try:
        uid, cid = user_context(user)
        user_content = f"Analyze this problem statement for defensive reasoning:\n\n{description}"
        if evidence_pack and evidence_pack.get("prompt_summary"):
            user_content += (
                f"\n\nLinked equipment evidence:\n{evidence_pack['prompt_summary']}\n"
                f"{format_citations_for_prompt(evidence_pack.get('citations') or [])}"
            )
        content = await ai_gateway_chat(
            [
                {"role": "system", "content": DEFENSIVE_REASONING_CHECK_PROMPT},
                {"role": "user", "content": user_content},
            ],
            user_id=uid,
            company_id=cid,
            endpoint="investigations.ai_problem_check",
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=2000,
        )
        content = content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip().rstrip("```")
        result = json.loads(content)
        payload = {
            "analysis": result.get("analysis", {}),
            "has_issues": result.get("has_issues", False),
            "refined_description": result.get("refined_description", description),
            "guidance": result.get("guidance", []),
            "changes_made": result.get("changes_made", []),
        }
        return attach_citations_to_response(
            payload,
            (evidence_pack or {}).get("citations") or [],
            evidence=evidence_pack,
        )
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse AI response: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to parse AI response") from exc
    except Exception as exc:
        logger.error("AI problem check failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {exc}") from exc
