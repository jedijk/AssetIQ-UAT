"""Task instance generation and overdue marking — extracted from task_service.py (WS4)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from services.task_service_helpers import calculate_next_due
from services.tenant_scope import scoped_job

if TYPE_CHECKING:
    from services.task_service import TaskService


async def generate_instances_for_plan(
    service: "TaskService",
    plan_id: str,
    horizon_days: int = 30,
    created_by: str = "system",
    user: Optional[dict] = None,
) -> List[Dict[str, Any]]:
    """Generate task instances for a plan within the horizon and date range."""
    plan = await service.get_plan_by_id(plan_id, user=user)
    if not plan or not plan["is_active"]:
        return []

    if plan.get("is_adhoc"):
        return []

    if not plan.get("next_due_date") or not plan.get("interval_value") or not plan.get("interval_unit"):
        return []

    now = datetime.now(timezone.utc)
    horizon_end = now + timedelta(days=horizon_days)

    effective_from = plan.get("effective_from")
    if effective_from:
        if isinstance(effective_from, str):
            effective_from = datetime.fromisoformat(effective_from.replace("Z", "+00:00"))
        if effective_from.tzinfo is None:
            effective_from = effective_from.replace(tzinfo=timezone.utc)
    else:
        effective_from = now

    effective_until = plan.get("effective_until")
    if effective_until:
        if isinstance(effective_until, str):
            effective_until = datetime.fromisoformat(effective_until.replace("Z", "+00:00"))
        if effective_until.tzinfo is None:
            effective_until = effective_until.replace(tzinfo=timezone.utc)

    generation_end = horizon_end
    if effective_until and effective_until < generation_end:
        generation_end = effective_until

    generation_start = max(now, effective_from)

    if effective_until and effective_until < now:
        return []

    existing = await service.instances.find(service._scope(user, {
        "task_plan_id": plan_id,
        "scheduled_date": {"$gte": generation_start, "$lte": generation_end},
        "status": {"$in": ["planned", "scheduled"]},
    })).to_list(100)

    existing_dates = set()
    for inst in existing:
        sd = inst["scheduled_date"]
        if isinstance(sd, str):
            sd = datetime.fromisoformat(sd.replace("Z", "+00:00"))
        if sd.tzinfo is None:
            sd = sd.replace(tzinfo=timezone.utc)
        existing_dates.add(sd.date())

    generated = []
    current_date = plan["next_due_date"]

    if isinstance(current_date, str):
        current_date = datetime.fromisoformat(current_date.replace("Z", "+00:00"))
    if current_date.tzinfo is None:
        current_date = current_date.replace(tzinfo=timezone.utc)

    while current_date < effective_from:
        current_date = calculate_next_due(
            current_date,
            plan["interval_value"],
            plan["interval_unit"],
        )

    while current_date <= generation_end:
        if current_date.date() not in existing_dates and current_date >= generation_start:
            if not effective_until or current_date <= effective_until:
                instance = await service.create_instance({
                    "task_plan_id": plan_id,
                    "scheduled_date": current_date,
                    "due_date": current_date + timedelta(days=1),
                    "priority": "medium",
                }, created_by, user=user)
                generated.append(instance)

        current_date = calculate_next_due(
            current_date,
            plan["interval_value"],
            plan["interval_unit"],
        )

    return generated


async def generate_all_due_instances(
    service: "TaskService",
    horizon_days: int = 30,
    created_by: str = "system",
) -> Dict[str, Any]:
    """Generate instances for all active plans within their effective date ranges."""
    now = datetime.now(timezone.utc)
    horizon_end = now + timedelta(days=horizon_days)

    all_active_plans = await service.plans.find(service._scope(None, {
        "is_active": True,
    })).to_list(1000)

    plans = []
    for plan in all_active_plans:
        next_due = plan.get("next_due_date")
        effective_until = plan.get("effective_until")

        if isinstance(next_due, str):
            try:
                next_due = datetime.fromisoformat(next_due.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue

        if next_due is None:
            continue

        if next_due.tzinfo is None:
            next_due = next_due.replace(tzinfo=timezone.utc)

        if next_due > horizon_end:
            continue

        if effective_until is not None:
            if isinstance(effective_until, str):
                try:
                    effective_until = datetime.fromisoformat(effective_until.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    effective_until = None

            if effective_until and effective_until.tzinfo is None:
                effective_until = effective_until.replace(tzinfo=timezone.utc)

            if effective_until and effective_until < now:
                continue

        plans.append(plan)

    total_generated = 0
    plans_processed = 0

    for plan in plans:
        plan_id = plan.get("id") or str(plan["_id"])
        instances = await generate_instances_for_plan(
            service, plan_id, horizon_days, created_by, user=None
        )
        total_generated += len(instances)
        plans_processed += 1

    return {
        "plans_processed": plans_processed,
        "instances_generated": total_generated,
        "horizon_days": horizon_days,
    }


async def mark_overdue_tasks(service: "TaskService") -> int:
    """Mark tasks past due date as overdue."""
    now = datetime.now(timezone.utc)

    result = await service.instances.update_many(
        scoped_job({
            "status": {"$in": ["planned", "scheduled"]},
            "due_date": {"$lt": now},
        }),
        {"$set": {"status": "overdue", "updated_at": now}},
    )

    return result.modified_count
