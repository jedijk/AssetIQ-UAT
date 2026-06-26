"""Decision engine rule evaluators."""
from datetime import datetime, timezone, timedelta
from typing import Any, Awaitable, Callable, Dict, Optional

from bson import ObjectId


CreateSuggestionFn = Callable[..., Awaitable[Optional[Dict[str, Any]]]]
LogExecutionFn = Callable[..., Awaitable[None]]


async def evaluate_frequency_adjustment(
    *,
    observations,
    task_plans,
    rule: Dict,
    user_id: str,
    create_suggestion: CreateSuggestionFn,
) -> Dict[str, Any]:
    """
    Rule: If observation frequency increases for an EFM, suggest increasing task frequency.
    """
    config = rule.get("config", {})
    window_days = config.get("observation_window_days", 30)
    min_observations = config.get("min_observations", 3)
    increase_factor = config.get("frequency_increase_factor", 1.5)

    start_date = datetime.now(timezone.utc) - timedelta(days=window_days)

    pipeline = [
        {"$match": {
            "created_at": {"$gte": start_date},
            "efm_id": {"$exists": True, "$ne": None},
        }},
        {"$group": {
            "_id": "$efm_id",
            "count": {"$sum": 1},
            "equipment_id": {"$first": "$equipment_id"},
        }},
        {"$match": {"count": {"$gte": min_observations}}},
    ]

    suggestions_created = 0

    async for result in observations.aggregate(pipeline):
        obs_count = result["count"]
        equipment_id = result.get("equipment_id")

        if equipment_id:
            plans = await task_plans.find({
                "equipment_id": equipment_id,
                "is_active": True,
            }).to_list(10)

            for plan in plans:
                suggestion = await create_suggestion(
                    rule_id=rule["rule_id"],
                    suggestion_type="increase_task_frequency",
                    target_type="task_plan",
                    target_id=str(plan["_id"]),
                    title=f"Increase task frequency for {plan.get('task_template_name', 'task')}",
                    description=(
                        f"High observation rate ({obs_count} in {window_days} days) "
                        f"suggests increasing inspection frequency by {increase_factor}x"
                    ),
                    recommended_action={
                        "action": "update_interval",
                        "current_interval": plan.get("interval_value"),
                        "suggested_interval": max(
                            1, int(plan.get("interval_value", 30) / increase_factor)
                        ),
                        "interval_unit": plan.get("interval_unit", "days"),
                    },
                    priority="medium",
                    created_by=user_id,
                )
                if suggestion:
                    suggestions_created += 1

    return {"status": "evaluated", "suggestions": suggestions_created, "auto_executed": 0}


async def evaluate_detection_gap(
    *,
    db,
    observations,
    rule: Dict,
    user_id: str,
    create_suggestion: CreateSuggestionFn,
) -> Dict[str, Any]:
    """
    Rule: If a failure observation occurs without prior warning task, suggest creating detection task.
    """
    config = rule.get("config", {})
    lookback_days = config.get("lookback_days", 7)
    severity_threshold = config.get("severity_threshold", "high")

    start_date = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    severity_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    min_severity = severity_order.get(severity_threshold, 3)

    obs_list = await observations.find({
        "created_at": {"$gte": start_date},
        "equipment_id": {"$exists": True, "$ne": None},
        "severity": {"$in": [s for s, v in severity_order.items() if v >= min_severity]},
    }).to_list(100)

    suggestions_created = 0

    for obs in obs_list:
        equipment_id = obs.get("equipment_id")

        task_count = await db.task_instances.count_documents({
            "equipment_id": equipment_id,
            "status": "completed",
            "completed_at": {
                "$gte": start_date,
                "$lt": obs.get("created_at"),
            },
        })

        if task_count == 0:
            suggestion = await create_suggestion(
                rule_id=rule["rule_id"],
                suggestion_type="create_detection_task",
                target_type="equipment",
                target_id=equipment_id,
                title=f"Create detection task for {obs.get('equipment_name', 'equipment')}",
                description=(
                    f"Failure detected without prior warning. Severity: {obs.get('severity')}. "
                    "Consider adding a predictive/detective task."
                ),
                recommended_action={
                    "action": "create_task_template",
                    "equipment_id": equipment_id,
                    "suggested_discipline": "maintenance",
                    "suggested_strategy": "predictive",
                    "failure_mode_id": obs.get("failure_mode_id"),
                },
                priority="high",
                created_by=user_id,
            )
            if suggestion:
                suggestions_created += 1

    return {"status": "evaluated", "suggestions": suggestions_created, "auto_executed": 0}


async def evaluate_likelihood_update(
    *,
    observations,
    efms,
    rule_executions,
    rule: Dict,
    log_execution: LogExecutionFn,
) -> Dict[str, Any]:
    """
    Rule: Auto-update EFM likelihood based on observation frequency.
    """
    config = rule.get("config", {})
    window_days = config.get("observation_window_days", 90)
    increase_per_obs = config.get("likelihood_increase_per_observation", 0.5)
    max_likelihood = config.get("max_likelihood", 10)

    start_date = datetime.now(timezone.utc) - timedelta(days=window_days)

    pipeline = [
        {"$match": {
            "created_at": {"$gte": start_date},
            "efm_id": {"$exists": True, "$ne": None},
        }},
        {"$group": {
            "_id": "$efm_id",
            "count": {"$sum": 1},
        }},
    ]

    auto_executed = 0

    async for result in observations.aggregate(pipeline):
        efm_id = result["_id"]
        obs_count = result["count"]

        if not ObjectId.is_valid(efm_id):
            continue

        efm = await efms.find_one({"_id": ObjectId(efm_id)})
        if not efm:
            continue

        current_likelihood = efm.get("likelihood", 5)
        new_likelihood = min(
            max_likelihood,
            current_likelihood + (obs_count * increase_per_obs),
        )

        if new_likelihood > current_likelihood and rule.get("auto_execute"):
            await efms.update_one(
                {"_id": ObjectId(efm_id)},
                {"$set": {
                    "likelihood": int(new_likelihood),
                    "is_override": True,
                    "override_reason": (
                        f"Auto-adjusted by Decision Engine based on {obs_count} observations"
                    ),
                    "updated_at": datetime.now(timezone.utc),
                }},
            )

            await log_execution(
                rule_id=rule["rule_id"],
                action="auto_update_likelihood",
                target_type="efm",
                target_id=efm_id,
                details={
                    "old_likelihood": current_likelihood,
                    "new_likelihood": int(new_likelihood),
                    "observation_count": obs_count,
                },
                executed_by="system",
            )
            auto_executed += 1

    return {"status": "evaluated", "suggestions": 0, "auto_executed": auto_executed}


async def evaluate_unknown_failure(
    *,
    observations,
    rule: Dict,
    user_id: str,
    create_suggestion: CreateSuggestionFn,
) -> Dict[str, Any]:
    """
    Rule: Suggest creating new failure mode for recurring unlinked observations.
    """
    config = rule.get("config", {})
    min_similar = config.get("min_similar_observations", 2)
    window_days = config.get("similarity_window_days", 90)

    start_date = datetime.now(timezone.utc) - timedelta(days=window_days)

    unlinked = await observations.find({
        "created_at": {"$gte": start_date},
        "failure_mode_id": None,
        "status": {"$ne": "closed"},
    }).to_list(100)

    groups: Dict[str, list] = {}
    for obs in unlinked:
        equip_id = obs.get("equipment_id", "unknown")
        desc = obs.get("description", "").lower()
        keywords = set(desc.split())

        key = f"{equip_id}"
        if key not in groups:
            groups[key] = []
        groups[key].append({"obs": obs, "keywords": keywords})

    suggestions_created = 0

    for _key, items in groups.items():
        if len(items) >= min_similar:
            common_keywords = set.intersection(*[i["keywords"] for i in items])

            if len(common_keywords) >= 2:
                first_obs = items[0]["obs"]
                suggestion = await create_suggestion(
                    rule_id=rule["rule_id"],
                    suggestion_type="create_failure_mode",
                    target_type="failure_mode_library",
                    target_id=None,
                    title="Consider new failure mode for recurring issue",
                    description=(
                        f"{len(items)} similar unlinked observations found. "
                        f"Common keywords: {', '.join(list(common_keywords)[:5])}"
                    ),
                    recommended_action={
                        "action": "create_failure_mode",
                        "suggested_keywords": list(common_keywords)[:10],
                        "equipment_id": first_obs.get("equipment_id"),
                        "sample_description": first_obs.get("description", "")[:200],
                    },
                    priority="low",
                    created_by=user_id,
                )
                if suggestion:
                    suggestions_created += 1

    return {"status": "evaluated", "suggestions": suggestions_created, "auto_executed": 0}


async def evaluate_task_effectiveness(
    *,
    db,
    observations,
    task_plans,
    rule: Dict,
    user_id: str,
    create_suggestion: CreateSuggestionFn,
) -> Dict[str, Any]:
    """
    Rule: Flag tasks that aren't detecting issues despite equipment having high observation rate.
    """
    config = rule.get("config", {})
    window_days = config.get("review_window_days", 180)
    min_executions = config.get("min_task_executions", 5)
    obs_ratio = config.get("observation_ratio_threshold", 0.3)

    start_date = datetime.now(timezone.utc) - timedelta(days=window_days)

    plans = await task_plans.find({
        "is_active": True,
        "execution_count": {"$gte": min_executions},
    }).to_list(100)

    suggestions_created = 0

    for plan in plans:
        equipment_id = plan.get("equipment_id")

        obs_count = await observations.count_documents({
            "equipment_id": equipment_id,
            "created_at": {"$gte": start_date},
        })

        issues_found = await db.task_instances.count_documents({
            "task_plan_id": str(plan["_id"]),
            "status": "completed",
            "completed_at": {"$gte": start_date},
            "issues_found": {"$exists": True, "$ne": []},
        })

        total_executions = plan.get("execution_count", 0)

        if total_executions > 0 and obs_count > 0:
            detection_rate = issues_found / total_executions
            obs_per_execution = obs_count / total_executions

            if obs_per_execution > obs_ratio and detection_rate < 0.1:
                suggestion = await create_suggestion(
                    rule_id=rule["rule_id"],
                    suggestion_type="review_task_effectiveness",
                    target_type="task_plan",
                    target_id=str(plan["_id"]),
                    title=f"Review effectiveness of {plan.get('task_template_name', 'task')}",
                    description=(
                        f"Task has low detection rate ({detection_rate:.1%}) despite "
                        f"{obs_count} observations on equipment. "
                        "Consider revising inspection criteria."
                    ),
                    recommended_action={
                        "action": "review_task",
                        "total_executions": total_executions,
                        "issues_detected": issues_found,
                        "observations_on_equipment": obs_count,
                        "detection_rate": detection_rate,
                    },
                    priority="medium",
                    created_by=user_id,
                )
                if suggestion:
                    suggestions_created += 1

    return {"status": "evaluated", "suggestions": suggestions_created, "auto_executed": 0}
