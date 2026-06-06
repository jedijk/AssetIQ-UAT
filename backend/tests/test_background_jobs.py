"""Tests for background job service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.background_jobs import BackgroundJobService, JobStatus, tenant_id_from_user


@pytest.fixture
def job_service():
    svc = BackgroundJobService()
    svc._in_memory = {"queued": 0, "completed": 0, "failed": 0, "dead_letter": 0}
    return svc


@pytest.mark.asyncio
async def test_job_completes_successfully(job_service):
    coll = MagicMock()
    coll.insert_one = AsyncMock()
    coll.update_one = AsyncMock()

    with patch.object(job_service, "_collection", return_value=coll):
        result = await job_service.run_with_retries(
            "job-1",
            "test_job",
            lambda: "ok",
            max_retries=3,
        )
    assert result == "ok"
    assert job_service._in_memory["completed"] == 1


@pytest.mark.asyncio
async def test_job_dead_letters_after_retries(job_service):
    coll = MagicMock()
    coll.insert_one = AsyncMock()
    coll.update_one = AsyncMock()

    def fail():
        raise RuntimeError("boom")

    with patch.object(job_service, "_collection", return_value=coll):
        result = await job_service.run_with_retries(
            "job-2",
            "failing_job",
            fail,
            max_retries=2,
        )
    assert result is None
    assert job_service._in_memory["dead_letter"] == 1


def test_tenant_id_from_user_prefers_company_id():
    assert tenant_id_from_user({"company_id": "co-1", "organization_id": "org-1"}) == "co-1"
    assert tenant_id_from_user({"organization_id": "org-2"}) == "org-2"
    assert tenant_id_from_user({}) is None
    assert tenant_id_from_user(None) is None


@pytest.mark.asyncio
async def test_create_record_stores_tenant_id(job_service):
    coll = MagicMock()
    coll.insert_one = AsyncMock()

    with patch.object(job_service, "_collection", return_value=coll):
        await job_service.create_record("test_job", tenant_id="tenant-abc")

    doc = coll.insert_one.call_args[0][0]
    assert doc["tenant_id"] == "tenant-abc"


@pytest.mark.asyncio
async def test_create_record_omits_tenant_id_when_absent(job_service):
    coll = MagicMock()
    coll.insert_one = AsyncMock()

    with patch.object(job_service, "_collection", return_value=coll):
        await job_service.create_record("test_job")

    doc = coll.insert_one.call_args[0][0]
    assert "tenant_id" not in doc
