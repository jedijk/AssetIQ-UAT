"""Tests for pulse survey service."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

import services.pulse_survey_service as pulse_svc
from services.pulse_survey_models import MAX_QUESTIONS, SURVEY_TEMPLATES


def _mock_async_cursor(items=None):
    items = items or []

    class _Cursor:
        def sort(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        async def to_list(self, length=None):
            return list(items)

        def __aiter__(self):
            self._iter = iter(items)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration:
                raise StopAsyncIteration

    return _Cursor()


def _mock_db(**collections):
    class _DB:
        def __getitem__(self, key):
            return collections[key]

    db = _DB()
    for name, coll in collections.items():
        setattr(db, name, coll)
    return db


def test_list_templates():
    templates = pulse_svc.list_templates()
    assert len(templates) == len(SURVEY_TEMPLATES)
    assert templates[0]["template_id"] == "platform_feedback"


def test_validate_questions_rejects_too_many():
    with pytest.raises(ValueError, match=str(MAX_QUESTIONS)):
        pulse_svc._validate_questions([{"id": f"q{i}"} for i in range(MAX_QUESTIONS + 1)])


@pytest.mark.asyncio
async def test_create_survey_from_template():
    survey_oid = ObjectId()
    mock_surveys = MagicMock()
    mock_surveys.insert_one = AsyncMock(return_value=MagicMock(inserted_id=survey_oid))

    mock_users = MagicMock()
    mock_users.find = MagicMock(return_value=_mock_async_cursor([{"id": "user-1"}, {"id": "user-2"}]))

    mock_db = _mock_db(pulse_surveys=mock_surveys, users=mock_users)

    user = {"id": "admin-1", "name": "Admin", "company_id": "tenant-1", "role": "admin"}

    with patch("services.pulse_survey_service.db", mock_db):
        result = await pulse_svc.create_survey(user, {"template_id": "platform_feedback"})

    assert result["title"] == "AssetIQ Platform Feedback"
    assert result["status"] == "draft"
    assert len(result["questions"]) == 3
    assert result["recipient_count"] == 2
    inserted = mock_surveys.insert_one.call_args[0][0]
    assert inserted["tenant_id"] == "tenant-1"


@pytest.mark.asyncio
async def test_publish_survey_sets_active():
    survey_oid = ObjectId()
    existing = {
        "_id": survey_oid,
        "status": "draft",
        "recipient_rules": {"type": "users", "user_ids": ["user-1"]},
        "recipient_ids": ["user-1"],
        "tenant_id": "tenant-1",
    }
    mock_surveys = MagicMock()
    mock_surveys.find_one = AsyncMock(return_value=existing)
    mock_surveys.find_one_and_update = AsyncMock(
        return_value={**existing, "status": "active", "published_at": "2026-01-01T00:00:00+00:00"}
    )

    mock_db = _mock_db(pulse_surveys=mock_surveys)

    user = {"id": "admin-1", "company_id": "tenant-1", "role": "admin"}

    with patch("services.pulse_survey_service.db", mock_db):
        result = await pulse_svc.publish_survey(user, str(survey_oid))

    assert result["status"] == "active"
    query = mock_surveys.find_one_and_update.call_args[0][0]
    assert "$and" in query
    assert any("_id" in part for part in query["$and"])


@pytest.mark.asyncio
async def test_submit_response_once_only():
    survey_oid = ObjectId()
    survey = {
        "_id": survey_oid,
        "status": "active",
        "anonymous": True,
        "questions": [
            {"id": "q1", "type": "rating", "label": "Test", "scale_min": 1, "scale_max": 5},
        ],
        "tenant_id": "tenant-1",
    }
    mock_surveys = MagicMock()
    mock_surveys.find_one = AsyncMock(return_value=survey)

    mock_responses = MagicMock()
    mock_responses.find_one = AsyncMock(return_value={"respondent_id": "user-1"})
    mock_responses.insert_one = AsyncMock()

    mock_db = _mock_db(pulse_surveys=mock_surveys, pulse_survey_responses=mock_responses)

    user = {"id": "user-1", "company_id": "tenant-1", "role": "maintenance"}

    with patch("services.pulse_survey_service.db", mock_db):
        with pytest.raises(ValueError, match="already submitted"):
            await pulse_svc.submit_response(
                user,
                str(survey_oid),
                {"answers": [{"question_id": "q1", "value": 4}]},
            )

    mock_responses.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_submit_response_persists_answer():
    survey_oid = ObjectId()
    survey = {
        "_id": survey_oid,
        "status": "active",
        "anonymous": False,
        "questions": [
            {"id": "q1", "type": "rating", "label": "Test", "scale_min": 1, "scale_max": 5},
            {"id": "q2", "type": "yes_no", "label": "Yes?"},
        ],
        "tenant_id": "tenant-1",
    }
    mock_surveys = MagicMock()
    mock_surveys.find_one = AsyncMock(return_value=survey)

    mock_responses = MagicMock()
    mock_responses.find_one = AsyncMock(return_value=None)
    mock_responses.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))

    mock_db = _mock_db(pulse_surveys=mock_surveys, pulse_survey_responses=mock_responses)

    user = {"id": "user-1", "company_id": "tenant-1", "role": "maintenance", "department": "Ops"}

    with patch("services.pulse_survey_service.db", mock_db):
        result = await pulse_svc.submit_response(
            user,
            str(survey_oid),
            {
                "answers": [
                    {"question_id": "q1", "value": 4},
                    {"question_id": "q2", "value": "yes"},
                ],
                "comment": "Works well",
            },
        )

    assert result["average_rating"] == 4.5
    assert result["comment"] == "Works well"
    inserted = mock_responses.insert_one.call_args[0][0]
    assert inserted["tenant_id"] == "tenant-1"
    assert inserted["respondent_id"] == "user-1"


@pytest.mark.asyncio
async def test_close_survey_syncs_readiness_evidence():
    survey_oid = ObjectId()
    closed_doc = {
        "_id": survey_oid,
        "title": "Platform Feedback",
        "status": "closed",
        "recipient_count": 10,
        "tenant_id": "tenant-1",
    }
    mock_surveys = MagicMock()
    mock_surveys.find_one_and_update = AsyncMock(return_value=closed_doc)

    mock_responses = MagicMock()
    mock_responses.find = MagicMock(return_value=_mock_async_cursor([
        {"average_rating": 4.0, "answers": [], "comment": "Good"},
        {"average_rating": 5.0, "answers": [], "comment": ""},
    ]))

    mock_evidence = MagicMock()
    mock_evidence.update_one = AsyncMock()

    mock_db = _mock_db(
        pulse_surveys=mock_surveys,
        pulse_survey_responses=mock_responses,
        success_readiness_evidence=mock_evidence,
    )

    user = {"id": "admin-1", "company_id": "tenant-1", "role": "admin"}

    with patch("services.pulse_survey_service.db", mock_db):
        result = await pulse_svc.close_survey(user, str(survey_oid))

    assert result["status"] == "closed"
    assert result["stats"]["average_score"] == 4.5
    mock_evidence.update_one.assert_awaited_once()
    evidence_query = mock_evidence.update_one.call_args[0][0]
    assert "$and" in evidence_query
    base = evidence_query["$and"][0]
    assert base["kpi_id"] == "change_readiness"
    assert base["source"] == "pulse_survey"


@pytest.mark.asyncio
async def test_list_my_pending_skips_completed():
    survey_oid = ObjectId()
    active_survey = {
        "_id": survey_oid,
        "status": "active",
        "title": "Active survey",
        "recipient_ids": ["user-1"],
        "tenant_id": "tenant-1",
    }
    mock_surveys = MagicMock()
    mock_surveys.find = MagicMock(return_value=_mock_async_cursor([active_survey]))

    mock_responses = MagicMock()
    mock_responses.find_one = AsyncMock(return_value=None)

    mock_db = _mock_db(pulse_surveys=mock_surveys, pulse_survey_responses=mock_responses)

    user = {"id": "user-1", "company_id": "tenant-1", "role": "maintenance"}

    with patch("services.pulse_survey_service.db", mock_db):
        pending = await pulse_svc.list_my_pending_surveys(user)

    assert len(pending) == 1
    assert pending[0]["title"] == "Active survey"
