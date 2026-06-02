"""Tests for background job service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.background_jobs import BackgroundJobService, JobStatus


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
