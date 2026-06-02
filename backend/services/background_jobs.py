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
                await self.update_record(job_id, status=JobStatus.COMPLETED.value, error=None)
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


background_job_service = BackgroundJobService()


def schedule_tracked_job(
    background_tasks: BackgroundTasks,
    job_type: str,
    fn: Callable,
    *args: Any,
    **kwargs: Any,
) -> None:
    background_job_service.schedule(background_tasks, job_type, fn, *args, **kwargs)
