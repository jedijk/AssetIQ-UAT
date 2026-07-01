"""Pulse survey service — create, deliver, respond, analyse."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import db
from services.pulse_survey_models import MAX_QUESTIONS, SURVEY_TEMPLATES
from services.tenant_schema import merge_tenant_filter, with_tenant_id
from services.user_stats_service import EXCLUDED_USER_STATS_ROLES

SURVEYS = "pulse_surveys"
RESPONSES = "pulse_survey_responses"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_templates() -> List[Dict[str, Any]]:
    return SURVEY_TEMPLATES


def _template_by_id(template_id: str) -> Optional[Dict[str, Any]]:
    for row in SURVEY_TEMPLATES:
        if row["template_id"] == template_id:
            return row
    return None


def _serialize(doc: dict) -> dict:
    out = dict(doc)
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    return out


async def _resolve_recipient_ids(recipient_rules: dict, user: dict) -> List[str]:
    rules = recipient_rules or {}
    rule_type = rules.get("type") or "all_users"
    base_query = merge_tenant_filter({"role": {"$nin": list(EXCLUDED_USER_STATS_ROLES)}}, user)

    if rule_type == "all_users":
        cursor = db.users.find(base_query, {"_id": 0, "id": 1})
        return [doc["id"] async for doc in cursor if doc.get("id")]

    if rule_type == "roles":
        roles = rules.get("roles") or []
        if not roles:
            return []
        query = merge_tenant_filter({**base_query, "role": {"$in": roles}}, user)
        cursor = db.users.find(query, {"_id": 0, "id": 1})
        return [doc["id"] async for doc in cursor if doc.get("id")]

    if rule_type == "users":
        return [uid for uid in (rules.get("user_ids") or []) if uid]

    cursor = db.users.find(base_query, {"_id": 0, "id": 1})
    return [doc["id"] async for doc in cursor if doc.get("id")]


def _validate_questions(questions: List[dict]) -> None:
    if not questions or len(questions) > MAX_QUESTIONS:
        raise ValueError(f"Surveys must have 1–{MAX_QUESTIONS} questions")


async def create_survey(user: dict, payload: dict) -> Dict[str, Any]:
    template_id = payload.get("template_id")
    template = _template_by_id(template_id) if template_id else None
    questions = payload.get("questions") or (template.get("questions") if template else [])
    _validate_questions(questions)

    doc = {
        "survey_id": str(uuid.uuid4()),
        "title": payload.get("title") or (template.get("title") if template else "Untitled survey"),
        "description": payload.get("description") or (template.get("description") if template else ""),
        "survey_type": payload.get("survey_type") or (template.get("survey_type") if template else "custom"),
        "template_id": template_id,
        "status": payload.get("status") or "draft",
        "anonymous": bool(payload.get("anonymous", True)),
        "recipient_rules": payload.get("recipient_rules") or {"type": "all_users"},
        "questions": questions[:MAX_QUESTIONS],
        "comment_prompt": payload.get("comment_prompt")
        or (template.get("comment_prompt") if template else "What should we improve?"),
        "due_date": payload.get("due_date"),
        "created_by": user.get("id") or user.get("user_id"),
        "created_by_name": user.get("name"),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    with_tenant_id(doc, user)
    recipient_ids = await _resolve_recipient_ids(doc["recipient_rules"], user)
    doc["recipient_count"] = len(recipient_ids)
    doc["recipient_ids"] = recipient_ids
    result = await db[SURVEYS].insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return _serialize(doc)


async def update_survey(user: dict, survey_id: str, payload: dict) -> Optional[Dict[str, Any]]:
    from bson import ObjectId

    query = merge_tenant_filter({"_id": ObjectId(survey_id)}, user)
    existing = await db[SURVEYS].find_one(query)
    if not existing:
        return None
    if existing.get("status") not in ("draft", "scheduled"):
        raise ValueError("Only draft or scheduled surveys can be edited")

    updates: Dict[str, Any] = {"updated_at": _now_iso()}
    for field in ("title", "description", "survey_type", "anonymous", "due_date", "comment_prompt", "status"):
        if field in payload and payload[field] is not None:
            updates[field] = payload[field]
    if "recipient_rules" in payload:
        updates["recipient_rules"] = payload["recipient_rules"]
        recipient_ids = await _resolve_recipient_ids(payload["recipient_rules"], user)
        updates["recipient_ids"] = recipient_ids
        updates["recipient_count"] = len(recipient_ids)
    if "questions" in payload:
        _validate_questions(payload["questions"])
        updates["questions"] = payload["questions"][:MAX_QUESTIONS]

    result = await db[SURVEYS].find_one_and_update(query, {"$set": updates}, return_document=True)
    return _serialize(result) if result else None


async def publish_survey(user: dict, survey_id: str) -> Optional[Dict[str, Any]]:
    from bson import ObjectId

    query = merge_tenant_filter({"_id": ObjectId(survey_id)}, user)
    existing = await db[SURVEYS].find_one(query)
    if not existing:
        return None
    if existing.get("status") not in ("draft", "scheduled"):
        raise ValueError("Survey cannot be published from current status")

    recipient_ids = existing.get("recipient_ids") or await _resolve_recipient_ids(
        existing.get("recipient_rules"), user
    )
    updates = {
        "status": "active",
        "published_at": _now_iso(),
        "updated_at": _now_iso(),
        "recipient_ids": recipient_ids,
        "recipient_count": len(recipient_ids),
    }
    result = await db[SURVEYS].find_one_and_update(query, {"$set": updates}, return_document=True)
    return _serialize(result) if result else None


async def close_survey(user: dict, survey_id: str) -> Optional[Dict[str, Any]]:
    from bson import ObjectId

    query = merge_tenant_filter({"_id": ObjectId(survey_id)}, user)
    result = await db[SURVEYS].find_one_and_update(
        query,
        {"$set": {"status": "closed", "closed_at": _now_iso(), "updated_at": _now_iso()}},
        return_document=True,
    )
    if result:
        serialized = _serialize(result)
        serialized["stats"] = await _survey_stats(serialized["id"], user, result)
        await _sync_readiness_evidence(user, serialized)
        return serialized
    return None


async def _survey_stats(survey_mongo_id: str, user: dict, survey_doc: dict) -> Dict[str, Any]:
    query = merge_tenant_filter({"survey_id": survey_mongo_id}, user)
    responses = await db[RESPONSES].find(query).to_list(5000)
    sent = survey_doc.get("recipient_count") or len(survey_doc.get("recipient_ids") or [])
    completed = len(responses)
    rate = round((completed / sent) * 100) if sent else None
    scores = [r.get("average_rating") for r in responses if r.get("average_rating") is not None]
    avg = round(sum(scores) / len(scores), 1) if scores else None
    return {
        "sent": sent,
        "completed": completed,
        "response_rate": rate,
        "average_score": avg,
        "completion_pct": rate,
    }


async def list_surveys(user: dict, status: Optional[str] = None) -> List[Dict[str, Any]]:
    query = merge_tenant_filter({}, user)
    if status and status != "all":
        query["status"] = status
    cursor = db[SURVEYS].find(query).sort("updated_at", -1).limit(100)
    rows = []
    async for doc in cursor:
        serialized = _serialize(doc)
        serialized["stats"] = await _survey_stats(serialized["id"], user, doc)
        rows.append(serialized)
    return rows


async def get_dashboard(user: dict) -> Dict[str, Any]:
    surveys = await list_surveys(user)
    active = [s for s in surveys if s.get("status") == "active"]
    closed = [s for s in surveys if s.get("status") == "closed"]
    response_rates = [s["stats"]["response_rate"] for s in surveys if s.get("stats", {}).get("response_rate") is not None]
    avg_scores = [s["stats"]["average_score"] for s in surveys if s.get("stats", {}).get("average_score") is not None]

    return {
        "total_surveys": len(surveys),
        "open_surveys": len(active),
        "completed_surveys": len(closed),
        "average_response_rate": round(sum(response_rates) / len(response_rates)) if response_rates else None,
        "average_satisfaction_score": round(sum(avg_scores) / len(avg_scores), 1) if avg_scores else None,
        "latest_ai_summary": await _latest_ai_summary(user),
        "recent_comments": await _recent_comments(user, limit=5),
        "surveys": surveys,
    }


async def get_survey_detail(user: dict, survey_id: str) -> Optional[Dict[str, Any]]:
    from bson import ObjectId

    query = merge_tenant_filter({"_id": ObjectId(survey_id)}, user)
    doc = await db[SURVEYS].find_one(query)
    if not doc:
        return None
    serialized = _serialize(doc)
    serialized["stats"] = await _survey_stats(serialized["id"], user, doc)
    serialized["analytics"] = await get_survey_analytics(user, serialized["id"])
    serialized["ai_summary"] = await _build_ai_summary(serialized["id"], user)
    return serialized


async def get_survey_analytics(user: dict, survey_id: str) -> Dict[str, Any]:
    query = merge_tenant_filter({"survey_id": survey_id}, user)
    responses = await db[RESPONSES].find(query).to_list(5000)
    if not responses:
        return {"response_count": 0}

    by_question: Dict[str, List[float]] = {}
    by_role: Dict[str, List[float]] = {}
    by_department: Dict[str, List[float]] = {}
    comments: List[str] = []

    for resp in responses:
        if resp.get("comment"):
            comments.append(resp["comment"])
        score = resp.get("average_rating")
        if score is not None:
            by_role.setdefault(resp.get("role") or "unknown", []).append(score)
            by_department.setdefault(resp.get("department") or "unknown", []).append(score)
        for ans in resp.get("answers") or []:
            val = ans.get("numeric_value")
            qid = ans.get("question_id")
            if qid and val is not None:
                by_question.setdefault(qid, []).append(val)

    def _avg(vals: List[float]) -> float:
        return round(sum(vals) / len(vals), 1) if vals else 0

    return {
        "response_count": len(responses),
        "average_rating": _avg([r.get("average_rating") for r in responses if r.get("average_rating") is not None]),
        "average_by_question": {k: _avg(v) for k, v in by_question.items()},
        "by_role": {k: _avg(v) for k, v in by_role.items()},
        "by_department": {k: _avg(v) for k, v in by_department.items()},
        "comments": comments[:50],
    }


async def list_my_pending_surveys(user: dict) -> List[Dict[str, Any]]:
    user_id = user.get("id") or user.get("user_id")
    query = merge_tenant_filter({"status": "active"}, user)
    cursor = db[SURVEYS].find(query).sort("due_date", 1)
    pending = []
    async for doc in cursor:
        recipient_ids = doc.get("recipient_ids") or []
        if recipient_ids and user_id not in recipient_ids:
            continue
        sid = str(doc["_id"])
        if await db[RESPONSES].find_one(merge_tenant_filter({"survey_id": sid, "respondent_id": user_id}, user)):
            continue
        pending.append(_serialize(doc))
    return pending


def _answer_to_numeric(answer: dict, question: dict) -> Optional[float]:
    qtype = question.get("type")
    value = answer.get("value")
    if qtype == "rating":
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    if qtype == "yes_no":
        if value in (True, "yes", "Yes", "true", 1, "1"):
            return 5.0
        if value in (False, "no", "No", "false", 0, "0"):
            return 1.0
        return None
    if qtype == "multiple_choice":
        options = question.get("options") or []
        if value in options:
            idx = options.index(value)
            if len(options) <= 1:
                return 5.0
            return round(1 + (idx / (len(options) - 1)) * 4, 1)
    return None


async def submit_response(user: dict, survey_id: str, payload: dict) -> Dict[str, Any]:
    from bson import ObjectId

    user_id = user.get("id") or user.get("user_id")
    survey = await db[SURVEYS].find_one(merge_tenant_filter({"_id": ObjectId(survey_id)}, user))
    if not survey:
        raise ValueError("Survey not found")
    if survey.get("status") != "active":
        raise ValueError("Survey is not accepting responses")
    if await db[RESPONSES].find_one(
        merge_tenant_filter({"survey_id": survey_id, "respondent_id": user_id}, user)
    ):
        raise ValueError("You have already submitted this survey")

    questions = {q["id"]: q for q in survey.get("questions") or []}
    normalized = []
    numeric_values = []
    for item in payload.get("answers") or []:
        question = questions.get(item.get("question_id"))
        if not question:
            continue
        numeric = _answer_to_numeric(item, question)
        if numeric is not None:
            numeric_values.append(numeric)
        normalized.append({"question_id": item.get("question_id"), "value": item.get("value"), "numeric_value": numeric})

    doc = {
        "survey_id": survey_id,
        "user_id": None if survey.get("anonymous") else user_id,
        "respondent_id": user_id,
        "department": user.get("department") or user.get("location"),
        "role": user.get("role"),
        "site": user.get("site") or user.get("installation"),
        "answers": normalized,
        "comment": (payload.get("comment") or "").strip(),
        "average_rating": round(sum(numeric_values) / len(numeric_values), 1) if numeric_values else None,
        "submitted_at": _now_iso(),
    }
    with_tenant_id(doc, user)
    result = await db[RESPONSES].insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return _serialize(doc)


async def _recent_comments(user: dict, limit: int = 5) -> List[Dict[str, Any]]:
    query = merge_tenant_filter({"comment": {"$exists": True, "$ne": ""}}, user)
    cursor = db[RESPONSES].find(query).sort("submitted_at", -1).limit(limit)
    return [
        {"comment": doc.get("comment"), "submitted_at": doc.get("submitted_at"), "survey_id": doc.get("survey_id")}
        async for doc in cursor
    ]


async def _latest_ai_summary(user: dict) -> Optional[str]:
    doc = await db[SURVEYS].find_one(merge_tenant_filter({"status": "closed"}, user), sort=[("closed_at", -1)])
    if not doc:
        return None
    summary = await _build_ai_summary(str(doc["_id"]), user)
    return summary.get("summary") if summary else None


async def _build_ai_summary(survey_id: str, user: dict) -> Dict[str, Any]:
    analytics = await get_survey_analytics(user, survey_id)
    count = analytics.get("response_count") or 0
    if count == 0:
        return {"summary": None, "ai_enabled": False}
    avg = analytics.get("average_rating")
    comments = analytics.get("comments") or []
    themes = []
    if avg is not None and avg >= 4:
        themes.append("Overall sentiment is positive.")
    elif avg is not None and avg < 3:
        themes.append("Overall sentiment indicates improvement opportunities.")
    if comments:
        themes.append(f"{len(comments)} comment(s) captured for review.")
        if any("wifi" in c.lower() or "connect" in c.lower() for c in comments):
            themes.append("Connectivity issues were mentioned in comments.")
    summary = " ".join(themes) if themes else "Insufficient data for summary."
    if count < 5:
        summary += " (Aggregated only — fewer than 5 responses.)"
    return {"summary": summary, "average_rating": avg, "response_count": count, "ai_enabled": False}


async def _sync_readiness_evidence(user: dict, survey: dict) -> None:
    stats = survey.get("stats") or {}
    avg = stats.get("average_score")
    if avg is None:
        return
    doc = {
        "kpi_id": "change_readiness",
        "title": f"Pulse survey: {survey.get('title')}",
        "description": f"Avg satisfaction {avg}, response rate {stats.get('response_rate')}%",
        "source": "pulse_survey",
        "detail": {"survey_id": survey["id"], **stats},
        "updated_at": _now_iso(),
        "created_at": _now_iso(),
    }
    with_tenant_id(doc, user)
    query = merge_tenant_filter(
        {"kpi_id": "change_readiness", "source": "pulse_survey", "detail.survey_id": survey["id"]},
        user,
    )
    await db.success_readiness_evidence.update_one(query, {"$set": doc}, upsert=True)
