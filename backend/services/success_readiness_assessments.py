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
            {
                "id": "required_users",
                "label": "Required users",
                "type": "number",
                "intent": "Count users who must complete AssetIQ training for their role before go-live or ongoing operations.",
            },
            {
                "id": "trained_users",
                "label": "Users trained",
                "type": "number",
                "intent": "Users who have completed all required training modules and are cleared to work in AssetIQ.",
            },
            {
                "id": "refresh_overdue",
                "label": "Training refresh overdue",
                "type": "number",
                "intent": "Users whose training has expired or is past the refresh due date. Each overdue user reduces the score.",
            },
            {
                "id": "notes",
                "label": "Notes",
                "type": "comment",
                "intent": "Capture gaps, planned sessions, or roles still waiting on training assignment.",
            },
        ],
    },
    {
        "template_id": "governance_checklist",
        "title": "Governance checklist",
        "description": "Monthly operational governance meetings completed.",
        "kpi_ids": ["governance_maturity"],
        "frequency": "monthly",
        "fields": [
            {
                "id": "daily_standup",
                "label": "Daily operational stand-up held",
                "type": "yes_no",
                "intent": "Confirms a short daily forum exists to review priorities, blockers, and AssetIQ usage.",
            },
            {
                "id": "weekly_planning",
                "label": "Weekly planning meeting held",
                "type": "yes_no",
                "intent": "Checks that work is planned weekly with reliability and operations aligned on AssetIQ tasks.",
            },
            {
                "id": "monthly_reliability",
                "label": "Monthly reliability review held",
                "type": "yes_no",
                "intent": "Validates monthly review of failures, observations, and improvement actions in AssetIQ.",
            },
            {
                "id": "quarterly_management",
                "label": "Quarterly management review held",
                "type": "yes_no",
                "intent": "Ensures leadership reviews readiness trends, KPIs, and major adoption risks each quarter.",
            },
            {
                "id": "notes",
                "label": "Comments",
                "type": "comment",
                "intent": "Record meeting gaps, attendance issues, or actions to restore governance cadence.",
            },
        ],
    },
    {
        "template_id": "procedure_review",
        "title": "Procedure review",
        "description": "Operating procedures updated to include AssetIQ workflows.",
        "kpi_ids": ["procedure_coverage"],
        "frequency": "annual",
        "fields": [
            {
                "id": "procedures_reviewed",
                "label": "Procedures reviewed",
                "type": "number",
                "intent": "Total critical operating procedures assessed during this review cycle.",
            },
            {
                "id": "procedures_updated",
                "label": "Updated for AssetIQ",
                "type": "number",
                "intent": "Procedures revised to reference AssetIQ workflows, forms, or data instead of offline steps.",
            },
            {
                "id": "notes",
                "label": "Notes",
                "type": "comment",
                "intent": "List procedures still pending update or needing SME review.",
            },
        ],
    },
    {
        "template_id": "infrastructure_review",
        "title": "Infrastructure readiness review",
        "description": "Connectivity, devices, and authentication readiness.",
        "kpi_ids": ["infrastructure_readiness"],
        "frequency": "quarterly",
        "fields": [
            {
                "id": "connectivity",
                "label": "Reliable internet connectivity",
                "type": "yes_no",
                "intent": "Field and office locations have stable internet for AssetIQ web and mobile access.",
            },
            {
                "id": "wifi",
                "label": "Adequate Wi-Fi coverage",
                "type": "yes_no",
                "intent": "Wi-Fi reaches work areas where technicians and operators use mobile AssetIQ.",
            },
            {
                "id": "mobile_devices",
                "label": "Mobile devices available",
                "type": "yes_no",
                "intent": "Suitable phones or tablets are issued to users who need mobile workflows.",
            },
            {
                "id": "authentication",
                "label": "Authentication configured",
                "type": "yes_no",
                "intent": "SSO or secure login is configured so users can access AssetIQ without shared credentials.",
            },
            {
                "id": "browser_compat",
                "label": "Browser compatibility verified",
                "type": "yes_no",
                "intent": "Supported browsers are tested on standard client devices used in daily operations.",
            },
            {
                "id": "notes",
                "label": "Notes",
                "type": "comment",
                "intent": "Document infrastructure gaps, planned upgrades, or sites blocked from rollout.",
            },
        ],
    },
    {
        "template_id": "change_readiness",
        "title": "Change readiness survey",
        "description": "Stakeholder readiness for rollout milestones.",
        "kpi_ids": ["change_readiness"],
        "frequency": "quarterly",
        "fields": [
            {
                "id": "leadership_alignment",
                "label": "Leadership alignment",
                "type": "percentage",
                "intent": "How aligned sponsors and managers are on rollout goals, priorities, and resourcing (0–100%).",
            },
            {
                "id": "user_confidence",
                "label": "User confidence",
                "type": "percentage",
                "intent": "How confident frontline users feel using AssetIQ in daily work without extra support (0–100%).",
            },
            {
                "id": "notes",
                "label": "Notes",
                "type": "comment",
                "intent": "Capture resistance themes, communication needs, or support actions before the next milestone.",
            },
        ],
    },
]


def _template_by_id(template_id: str) -> Optional[Dict[str, Any]]:
    for template in ASSESSMENT_TEMPLATES:
        if template["template_id"] == template_id:
            return template
    return None


def _merge_field_metadata(assessment: Dict[str, Any]) -> Dict[str, Any]:
    """Enrich stored fields with latest template labels and intent text."""
    template = _template_by_id(assessment.get("template_id") or "")
    if not template:
        return assessment

    template_fields = {field["id"]: field for field in template.get("fields") or []}
    merged_fields = []
    for field in assessment.get("fields") or []:
        template_field = template_fields.get(field.get("id"))
        merged = dict(field)
        if template_field:
            merged["label"] = template_field.get("label", merged.get("label"))
            merged["type"] = template_field.get("type", merged.get("type"))
            if template_field.get("intent"):
                merged["intent"] = template_field["intent"]
        merged_fields.append(merged)

    result = dict(assessment)
    result["fields"] = merged_fields
    return result


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
        rows.append(_merge_field_metadata(doc))
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
    return _merge_field_metadata(result)
