"""
Background job runner with retries, dead-letter tracking, and MongoDB status records.
"""
from __future__ import annotations

import asyncio
import inspect
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, Optional

from fastapi import BackgroundTasks

logger = logging.getLogger("assetiq.jobs")


def tenant_id_from_user(user: Optional[dict]) -> Optional[str]:
    """Extract tenant id from JWT user payload (company_id or organization_id)."""
    if not user:
        return None
    return user.get("company_id") or user.get("organization_id") or None


def _serialize_job_result(result: Any) -> Any:
    """Persist JSON-friendly job output (dict/list/scalars only)."""
    if result is None or isinstance(result, (str, int, float, bool)):
        return result
    if isinstance(result, dict):
        return result
    if isinstance(result, list):
        return result
    return {"value": str(result)[:2000]}


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


class BackgroundJobService:
    """Tracks and executes background work with exponential backoff retries."""

    def __init__(self) -> None:
        self._in_memory = {
            "queued": 0,
            "completed": 0,
            "failed": 0,
            "dead_letter": 0,
        }

    def _collection(self):
        from database import db

        return db.background_jobs

    async def create_record(
        self,
        job_type: str,
        *,
        user_id: Optional[str] = None,
        payload: Optional[dict] = None,
        max_retries: int = 3,
        tenant_id: Optional[str] = None,
    ) -> str:
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": job_id,
            "job_type": job_type,
            "status": JobStatus.PENDING.value,
            "user_id": user_id,
            "payload": payload or {},
            "attempts": 0,
            "max_retries": max_retries,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
        if tenant_id:
            doc["tenant_id"] = tenant_id
        try:
            await self._collection().insert_one(doc)
        except Exception as exc:
            logger.warning("background_jobs insert failed: %s", exc)
        return job_id

    async def update_record(self, job_id: str, **fields: Any) -> None:
        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            await self._collection().update_one({"id": job_id}, {"$set": fields})
        except Exception as exc:
            logger.warning("background_jobs update failed: %s", exc)

    async def run_with_retries(
        self,
        job_id: str,
        job_type: str,
        fn: Callable,
        *args: Any,
        max_retries: int = 3,
        **kwargs: Any,
    ) -> Any:
        last_error: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            await self.update_record(job_id, status=JobStatus.RUNNING.value, attempts=attempt)
            try:
                if inspect.iscoroutinefunction(fn):
                    result = await fn(*args, **kwargs)
                else:
                    result = fn(*args, **kwargs)
                await self.update_record(
                    job_id,
                    status=JobStatus.COMPLETED.value,
                    error=None,
                    result=_serialize_job_result(result),
                )
                self._in_memory["completed"] += 1
                logger.info(
                    "job completed",
                    extra={"job_event": "completed", "job_id": job_id, "job_type": job_type, "attempt": attempt},
                )
                return result
            except Exception as exc:
                last_error = exc
                self._in_memory["failed"] += 1
                logger.exception(
                    "job attempt failed",
                    extra={"job_event": "attempt_failed", "job_id": job_id, "job_type": job_type, "attempt": attempt},
                )
                if attempt < max_retries:
                    await asyncio.sleep(2**attempt)

        await self.update_record(
            job_id,
            status=JobStatus.DEAD_LETTER.value,
            error=str(last_error)[:2000] if last_error else "unknown",
        )
        self._in_memory["dead_letter"] += 1
        logger.error(
            "job dead-lettered",
            extra={"job_event": "dead_letter", "job_id": job_id, "job_type": job_type},
        )
        return None

    async def execute(
        self,
        job_type: str,
        fn: Callable,
        *args: Any,
        user_id: Optional[str] = None,
        payload: Optional[dict] = None,
        max_retries: int = 3,
        **kwargs: Any,
    ) -> Any:
        job_id = await self.create_record(job_type, user_id=user_id, payload=payload, max_retries=max_retries)
        self._in_memory["queued"] += 1
        return await self.run_with_retries(job_id, job_type, fn, *args, max_retries=max_retries, **kwargs)

    def schedule(
        self,
        background_tasks: BackgroundTasks,
        job_type: str,
        fn: Callable,
        *args: Any,
        user_id: Optional[str] = None,
        payload: Optional[dict] = None,
        max_retries: int = 3,
        **kwargs: Any,
    ) -> None:
        """Drop-in replacement for background_tasks.add_task with persistence and retries."""

        async def _runner() -> None:
            await self.execute(
                job_type,
                fn,
                *args,
                user_id=user_id,
                payload=payload,
                max_retries=max_retries,
                **kwargs,
            )

        background_tasks.add_task(_runner)

    async def schedule_returning_job_id(
        self,
        background_tasks: BackgroundTasks,
        job_type: str,
        fn: Callable,
        *args: Any,
        user_id: Optional[str] = None,
        payload: Optional[dict] = None,
        max_retries: int = 1,
        tenant_id: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """Create a job record, queue work, and return job_id immediately."""
        job_id = await self.create_record(
            job_type,
            user_id=user_id,
            payload=payload,
            max_retries=max_retries,
            tenant_id=tenant_id,
        )
        self._in_memory["queued"] += 1

        async def _runner() -> None:
            await self.run_with_retries(
                job_id,
                job_type,
                fn,
                *args,
                max_retries=max_retries,
                **kwargs,
            )

        background_tasks.add_task(_runner)
        return job_id

    async def enqueue_for_external_worker(
        self,
        job_type: str,
        *,
        user_id: Optional[str] = None,
        payload: Optional[dict] = None,
        max_retries: int = 1,
        tenant_id: Optional[str] = None,
    ) -> str:
        """Persist a pending job for run_background_worker.py (no in-process execution)."""
        job_id = await self.create_record(
            job_type,
            user_id=user_id,
            payload=payload,
            max_retries=max_retries,
            tenant_id=tenant_id,
        )
        self._in_memory["queued"] += 1
        logger.info(
            "job enqueued for external worker",
            extra={"job_event": "external_enqueue", "job_id": job_id, "job_type": job_type},
        )
        return job_id

    async def get_job(self, job_id: str) -> Optional[dict]:
        try:
            return await self._collection().find_one({"id": job_id}, {"_id": 0})
        except Exception:
            return None

    async def get_queue_health(self) -> dict:
        try:
            pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
            rows = await self._collection().aggregate(pipeline).to_list(20)
            by_status = {r["_id"]: r["count"] for r in rows}
            dead_letter_recent = await self._collection().count_documents(
                {"status": JobStatus.DEAD_LETTER.value}
            )
            return {
                "status": "ok",
                "by_status": by_status,
                "dead_letter_total": dead_letter_recent,
                "in_memory": dict(self._in_memory),
            }
        except Exception as exc:
            return {"status": "degraded", "error": str(exc)[:200], "in_memory": dict(self._in_memory)}

    async def claim_next_pending(self, job_types: Optional[list] = None) -> Optional[dict]:
        """Atomically claim the oldest pending job for an external worker process."""
        claim_filter = self._build_claim_filter(job_types)
        try:
            return await self._collection().find_one_and_update(
                claim_filter,
                {
                    "$set": {
                        "status": JobStatus.RUNNING.value,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                },
                sort=[("created_at", 1)],
                return_document=True,
            )
        except Exception as exc:
            logger.warning("background_jobs claim failed: %s", exc)
            return None

    def _build_claim_filter(self, job_types: Optional[list]) -> dict:
        """Pending jobs only; optionally filter by handler types and worker tenant."""
        from services.worker_config import worker_tenant_id

        claim_filter: dict = {"status": JobStatus.PENDING.value}

        if job_types:
            claim_filter["job_type"] = {"$in": job_types}

        tenant_id = worker_tenant_id()
        if tenant_id:
            claim_filter["tenant_id"] = tenant_id

        return claim_filter

    async def run_claimed_job(
        self,
        job: dict,
        handlers: Dict[str, Callable],
    ) -> Any:
        """Execute a claimed job using a registered handler."""
        job_id = job.get("id")
        job_type = job.get("job_type")
        if not job_id or not job_type:
            return None
        handler = handlers.get(job_type)
        if not handler:
            await self.update_record(
                job_id,
                status=JobStatus.DEAD_LETTER.value,
                error=f"no handler for job_type={job_type}",
            )
            return None
        max_retries = int(job.get("max_retries") or 1)
        return await self.run_with_retries(
            job_id,
            job_type,
            handler,
            job,
            max_retries=max_retries,
        )


background_job_service = BackgroundJobService()


def schedule_tracked_job(
    background_tasks: BackgroundTasks,
    job_type: str,
    fn: Callable,
    *args: Any,
    **kwargs: Any,
) -> None:
    background_job_service.schedule(background_tasks, job_type, fn, *args, **kwargs)
