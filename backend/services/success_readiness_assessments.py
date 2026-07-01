"""Manual assessment templates and submission workflow."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.tenant_schema import merge_tenant_filter, with_tenant_id

ASSESSMENT_TEMPLATES: List[Dict[str, Any]] = [
    {
        "template_id": "training_review",
        "title": "Training coverage review",
        "description": "Confirm role-based training completion and refresh status.",
        "kpi_ids": ["training_completion"],
        "frequency": "quarterly",
        "fields": [
            {"id": "required_users", "label": "Required users", "type": "number"},
            {"id": "trained_users", "label": "Users trained", "type": "number"},
            {"id": "refresh_overdue", "label": "Training refresh overdue", "type": "number"},
            {"id": "notes", "label": "Notes", "type": "comment"},
        ],
    },
    {
        "template_id": "governance_checklist",
        "title": "Governance checklist",
        "description": "Monthly operational governance meetings completed.",
        "kpi_ids": ["governance_maturity"],
        "frequency": "monthly",
        "fields": [
            {"id": "daily_standup", "label": "Daily operational stand-up held", "type": "yes_no"},
            {"id": "weekly_planning", "label": "Weekly planning meeting held", "type": "yes_no"},
            {"id": "monthly_reliability", "label": "Monthly reliability review held", "type": "yes_no"},
            {"id": "quarterly_management", "label": "Quarterly management review held", "type": "yes_no"},
            {"id": "notes", "label": "Comments", "type": "comment"},
        ],
    },
    {
        "template_id": "procedure_review",
        "title": "Procedure review",
        "description": "Operating procedures updated to include AssetIQ workflows.",
        "kpi_ids": ["procedure_coverage"],
        "frequency": "annual",
        "fields": [
            {"id": "procedures_reviewed", "label": "Procedures reviewed", "type": "number"},
            {"id": "procedures_updated", "label": "Updated for AssetIQ", "type": "number"},
            {"id": "notes", "label": "Notes", "type": "comment"},
        ],
    },
    {
        "template_id": "infrastructure_review",
        "title": "Infrastructure readiness review",
        "description": "Connectivity, devices, and authentication readiness.",
        "kpi_ids": ["infrastructure_readiness"],
        "frequency": "quarterly",
        "fields": [
            {"id": "connectivity", "label": "Reliable internet connectivity", "type": "yes_no"},
            {"id": "wifi", "label": "Adequate Wi-Fi coverage", "type": "yes_no"},
            {"id": "mobile_devices", "label": "Mobile devices available", "type": "yes_no"},
            {"id": "authentication", "label": "Authentication configured", "type": "yes_no"},
            {"id": "browser_compat", "label": "Browser compatibility verified", "type": "yes_no"},
            {"id": "notes", "label": "Notes", "type": "comment"},
        ],
    },
    {
        "template_id": "change_readiness",
        "title": "Change readiness survey",
        "description": "Stakeholder readiness for rollout milestones.",
        "kpi_ids": ["change_readiness"],
        "frequency": "quarterly",
        "fields": [
            {"id": "leadership_alignment", "label": "Leadership alignment", "type": "percentage"},
            {"id": "user_confidence", "label": "User confidence", "type": "percentage"},
            {"id": "notes", "label": "Notes", "type": "comment"},
        ],
    },
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _score_assessment_answers(template_id: str, answers: Dict[str, Any]) -> Optional[int]:
    if template_id == "training_review":
        required = int(answers.get("required_users") or 0)
        trained = int(answers.get("trained_users") or 0)
        if required <= 0:
            return None
        overdue = int(answers.get("refresh_overdue") or 0)
        base = min(100, round((trained / required) * 100))
        penalty = min(30, overdue * 5)
        return max(0, base - penalty)

    if template_id == "governance_checklist":
        checks = ["daily_standup", "weekly_planning", "monthly_reliability", "quarterly_management"]
        yes = sum(1 for key in checks if _truthy(answers.get(key)))
        return round((yes / len(checks)) * 100)

    if template_id == "procedure_review":
        reviewed = int(answers.get("procedures_reviewed") or 0)
        updated = int(answers.get("procedures_updated") or 0)
        if reviewed <= 0:
            return None
        return min(100, round((updated / reviewed) * 100))

    if template_id == "infrastructure_review":
        checks = ["connectivity", "wifi", "mobile_devices", "authentication", "browser_compat"]
        yes = sum(1 for key in checks if _truthy(answers.get(key)))
        return round((yes / len(checks)) * 100)

    if template_id == "change_readiness":
        values = [answers.get("leadership_alignment"), answers.get("user_confidence")]
        nums = [int(v) for v in values if v is not None and str(v).strip() != ""]
        if not nums:
            return None
        return min(100, round(sum(nums) / len(nums)))

    pct = answers.get("completion_pct")
    if pct is not None:
        return min(100, max(0, int(pct)))
    return None


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).lower() in ("true", "yes", "1", "y")


async def ensure_assessments_seeded(user: dict) -> None:
    query = merge_tenant_filter({}, user)
    existing = await db.success_readiness_assessments.count_documents(query)
    if existing:
        return
    now = _now_iso()
    for template in ASSESSMENT_TEMPLATES:
        doc = {
            **template,
            "status": "not_started",
            "answers": {},
            "score": None,
            "created_at": now,
            "updated_at": now,
        }
        with_tenant_id(doc, user)
        await db.success_readiness_assessments.insert_one(doc)


async def list_assessments(user: dict) -> List[Dict[str, Any]]:
    await ensure_assessments_seeded(user)
    query = merge_tenant_filter({}, user)
    cursor = db.success_readiness_assessments.find(query).sort("title", 1)
    rows: List[Dict[str, Any]] = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        rows.append(doc)
    return rows


async def submit_assessment(user: dict, assessment_id: str, payload: dict) -> Optional[Dict[str, Any]]:
    from bson import ObjectId

    answers = payload.get("answers") or {}
    query = merge_tenant_filter({"_id": ObjectId(assessment_id)}, user)
    existing = await db.success_readiness_assessments.find_one(query)
    if not existing:
        return None

    template_id = existing.get("template_id") or existing.get("id")
    score = _score_assessment_answers(template_id, answers)
    status = "completed" if score is not None else "in_progress"
    updates = {
        "answers": answers,
        "score": score,
        "status": status,
        "reviewer": payload.get("reviewer") or user.get("name"),
        "review_date": payload.get("review_date") or _now_iso(),
        "updated_at": _now_iso(),
    }
    if status == "completed":
        updates["completed_at"] = _now_iso()
        updates["completed_by"] = user.get("id") or user.get("user_id")

    result = await db.success_readiness_assessments.find_one_and_update(
        query,
        {"$set": updates},
        return_document=True,
    )
    if not result:
        return None
    result["id"] = str(result.pop("_id"))
    return result
