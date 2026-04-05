"""
Execution & Reliability Insights API Routes
Provides analytics on action execution, task performance, data quality, and AI recommendations.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging
import os

from models.api_models import UserResponse
from routes.auth import get_current_user
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(tags=["insights"])


@router.get("/execution/actions")
async def get_action_execution_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Get action execution performance metrics.
    Returns total, completed, failed actions, success rate, and average completion time.
    """
    
    
    # Get all actions
    actions = await db.central_actions.find({}).to_list(length=None)
    
    total_actions = len(actions)
    completed_actions = 0
    failed_actions = 0
    completion_times = []
    
    # Breakdown tracking
    by_observation = {}
    by_investigation = {}
    by_asset = {}
    
    for action in actions:
        status = action.get("status", "").lower()
        
        # Count by status
        if status in ["completed", "done", "closed"]:
            completed_actions += 1
            # Calculate completion time if dates available
            created = action.get("created_at") or action.get("createdAt")
            completed = action.get("completed_at") or action.get("completedAt") or action.get("updated_at")
            if created and completed:
                try:
                    if isinstance(created, str):
                        created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    if isinstance(completed, str):
                        completed = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                    diff = (completed - created).days
                    if diff >= 0:
                        completion_times.append(diff)
                except:
                    pass
        elif status in ["failed", "cancelled", "rejected"]:
            failed_actions += 1
        
        # Breakdown by observation
        obs_id = action.get("observation_id") or action.get("threat_id")
        if obs_id:
            if obs_id not in by_observation:
                by_observation[obs_id] = {"total": 0, "completed": 0, "failed": 0}
            by_observation[obs_id]["total"] += 1
            if status in ["completed", "done", "closed"]:
                by_observation[obs_id]["completed"] += 1
            elif status in ["failed", "cancelled", "rejected"]:
                by_observation[obs_id]["failed"] += 1
        
        # Breakdown by investigation
        inv_id = action.get("investigation_id")
        if inv_id:
            if inv_id not in by_investigation:
                by_investigation[inv_id] = {"total": 0, "completed": 0, "failed": 0}
            by_investigation[inv_id]["total"] += 1
            if status in ["completed", "done", "closed"]:
                by_investigation[inv_id]["completed"] += 1
            elif status in ["failed", "cancelled", "rejected"]:
                by_investigation[inv_id]["failed"] += 1
        
        # Breakdown by asset
        asset_id = action.get("asset_id") or action.get("equipment_id")
        if asset_id:
            if asset_id not in by_asset:
                by_asset[asset_id] = {"total": 0, "completed": 0, "failed": 0}
            by_asset[asset_id]["total"] += 1
            if status in ["completed", "done", "closed"]:
                by_asset[asset_id]["completed"] += 1
            elif status in ["failed", "cancelled", "rejected"]:
                by_asset[asset_id]["failed"] += 1
    
    # Calculate metrics
    success_rate = round((completed_actions / total_actions * 100), 1) if total_actions > 0 else 0
    avg_completion_time = round(sum(completion_times) / len(completion_times), 1) if completion_times else 0
    
    return {
        "total_actions": total_actions,
        "completed_actions": completed_actions,
        "failed_actions": failed_actions,
        "in_progress_actions": total_actions - completed_actions - failed_actions,
        "success_rate": success_rate,
        "avg_completion_time_days": avg_completion_time,
        "breakdown": {
            "by_observation_count": len(by_observation),
            "by_investigation_count": len(by_investigation),
            "by_asset_count": len(by_asset)
        }
    }


@router.get("/execution/tasks")
async def get_task_execution_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Get task execution metrics comparing recurring vs ad-hoc tasks.
    """
    
    
    # Get all task assignments/executions
    tasks = await db.task_assignments.find({}).to_list(length=None)
    schedules = await db.task_schedules.find({}).to_list(length=None)
    
    # Track schedule IDs that are recurring
    recurring_schedule_ids = set()
    for schedule in schedules:
        recurrence = schedule.get("recurrence", {})
        if recurrence.get("type") and recurrence.get("type") != "none":
            recurring_schedule_ids.add(schedule.get("id"))
    
    recurring_tasks = {"total": 0, "completed": 0, "failed": 0}
    adhoc_tasks = {"total": 0, "completed": 0, "failed": 0}
    
    for task in tasks:
        schedule_id = task.get("schedule_id")
        status = task.get("status", "").lower()
        
        # Determine if recurring or ad-hoc
        is_recurring = schedule_id in recurring_schedule_ids
        target = recurring_tasks if is_recurring else adhoc_tasks
        
        target["total"] += 1
        if status in ["completed", "done"]:
            target["completed"] += 1
        elif status in ["failed", "missed", "overdue"]:
            target["failed"] += 1
    
    # Calculate rates
    recurring_completion_rate = round((recurring_tasks["completed"] / recurring_tasks["total"] * 100), 1) if recurring_tasks["total"] > 0 else 0
    recurring_failure_rate = round((recurring_tasks["failed"] / recurring_tasks["total"] * 100), 1) if recurring_tasks["total"] > 0 else 0
    
    adhoc_completion_rate = round((adhoc_tasks["completed"] / adhoc_tasks["total"] * 100), 1) if adhoc_tasks["total"] > 0 else 0
    adhoc_failure_rate = round((adhoc_tasks["failed"] / adhoc_tasks["total"] * 100), 1) if adhoc_tasks["total"] > 0 else 0
    
    return {
        "recurring": {
            "total": recurring_tasks["total"],
            "completed": recurring_tasks["completed"],
            "failed": recurring_tasks["failed"],
            "in_progress": recurring_tasks["total"] - recurring_tasks["completed"] - recurring_tasks["failed"],
            "completion_rate": recurring_completion_rate,
            "failure_rate": recurring_failure_rate
        },
        "adhoc": {
            "total": adhoc_tasks["total"],
            "completed": adhoc_tasks["completed"],
            "failed": adhoc_tasks["failed"],
            "in_progress": adhoc_tasks["total"] - adhoc_tasks["completed"] - adhoc_tasks["failed"],
            "completion_rate": adhoc_completion_rate,
            "failure_rate": adhoc_failure_rate
        },
        "insights": {
            "more_efficient": "recurring" if recurring_completion_rate > adhoc_completion_rate else "adhoc" if adhoc_completion_rate > recurring_completion_rate else "equal",
            "reactive_pattern": adhoc_tasks["total"] > recurring_tasks["total"]
        }
    }


@router.get("/execution/disciplines")
async def get_discipline_performance(
    current_user: dict = Depends(get_current_user)
):
    """
    Get performance metrics by discipline (actor performance).
    Classifies disciplines as good/average/bad actors based on failure rate.
    """
    
    
    # Get all users with their disciplines
    users = await db.users.find({}).to_list(length=None)
    user_disciplines = {}
    for user in users:
        user_disciplines[user.get("id")] = user.get("discipline") or user.get("position") or "Unassigned"
    
    # Get all actions and tasks
    actions = await db.central_actions.find({}).to_list(length=None)
    tasks = await db.task_assignments.find({}).to_list(length=None)
    
    # Aggregate by discipline
    discipline_stats = {}
    
    # Process actions
    for action in actions:
        assignee_id = action.get("assignee_id") or action.get("assigned_to")
        if not assignee_id:
            continue
        
        discipline = user_disciplines.get(assignee_id, "Unassigned")
        if discipline not in discipline_stats:
            discipline_stats[discipline] = {
                "total_tasks": 0,
                "completed": 0,
                "failed": 0,
                "completion_times": []
            }
        
        discipline_stats[discipline]["total_tasks"] += 1
        status = action.get("status", "").lower()
        
        if status in ["completed", "done", "closed"]:
            discipline_stats[discipline]["completed"] += 1
            # Track completion time
            created = action.get("created_at")
            completed = action.get("completed_at") or action.get("updated_at")
            if created and completed:
                try:
                    if isinstance(created, str):
                        created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    if isinstance(completed, str):
                        completed = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                    diff = (completed - created).days
                    if diff >= 0:
                        discipline_stats[discipline]["completion_times"].append(diff)
                except:
                    pass
        elif status in ["failed", "cancelled", "rejected"]:
            discipline_stats[discipline]["failed"] += 1
    
    # Process task assignments
    for task in tasks:
        assignee_id = task.get("assignee_id") or task.get("assigned_to")
        if not assignee_id:
            continue
        
        discipline = user_disciplines.get(assignee_id, "Unassigned")
        if discipline not in discipline_stats:
            discipline_stats[discipline] = {
                "total_tasks": 0,
                "completed": 0,
                "failed": 0,
                "completion_times": []
            }
        
        discipline_stats[discipline]["total_tasks"] += 1
        status = task.get("status", "").lower()
        
        if status in ["completed", "done"]:
            discipline_stats[discipline]["completed"] += 1
        elif status in ["failed", "missed", "overdue"]:
            discipline_stats[discipline]["failed"] += 1
    
    # Calculate metrics and classify
    disciplines = []
    for name, stats in discipline_stats.items():
        total = stats["total_tasks"]
        failed = stats["failed"]
        completed = stats["completed"]
        
        failure_rate = round((failed / total * 100), 1) if total > 0 else 0
        completion_rate = round((completed / total * 100), 1) if total > 0 else 0
        avg_time = round(sum(stats["completion_times"]) / len(stats["completion_times"]), 1) if stats["completion_times"] else 0
        
        # Classify actor
        if failure_rate < 5:
            classification = "good"
        elif failure_rate <= 15:
            classification = "average"
        else:
            classification = "bad"
        
        disciplines.append({
            "discipline": name,
            "total_tasks": total,
            "completed": completed,
            "failed": failed,
            "in_progress": total - completed - failed,
            "failure_rate": failure_rate,
            "completion_rate": completion_rate,
            "avg_completion_time_days": avg_time,
            "classification": classification
        })
    
    # Sort by completion rate descending
    disciplines.sort(key=lambda x: (-x["completion_rate"], x["failure_rate"]))
    
    # Get top 5 and bottom 5
    top_performers = [d for d in disciplines if d["classification"] == "good"][:5]
    bottom_performers = [d for d in disciplines if d["classification"] == "bad"][:5]
    
    return {
        "disciplines": disciplines,
        "top_performers": top_performers,
        "bottom_performers": bottom_performers,
        "summary": {
            "total_disciplines": len(disciplines),
            "good_actors": len([d for d in disciplines if d["classification"] == "good"]),
            "average_actors": len([d for d in disciplines if d["classification"] == "average"]),
            "bad_actors": len([d for d in disciplines if d["classification"] == "bad"])
        }
    }


@router.get("/reliability/data-quality")
async def get_data_quality_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Assess quality and completeness of reliability data.
    """
    
    
    # Get all equipment
    equipment = await db.equipment.find({}).to_list(length=None)
    total_assets = len(equipment)
    
    if total_assets == 0:
        return {
            "metrics": {
                "criticality_coverage": 0,
                "fmea_coverage": 0,
                "equipment_type_coverage": 0
            },
            "overall_score": 0,
            "status": "critical",
            "total_assets": 0
        }
    
    # Count assets with various data
    assets_with_criticality = 0
    assets_with_fmea = 0
    assets_with_type = 0
    
    # Get FMEA mappings
    fmea_mappings = await db.equipment_fmea.find({}).to_list(length=None)
    equipment_with_fmea = set(m.get("equipment_id") for m in fmea_mappings if m.get("equipment_id"))
    
    for equip in equipment:
        equip_id = equip.get("id")
        
        # Check criticality
        if equip.get("criticality") or equip.get("criticality_score"):
            assets_with_criticality += 1
        
        # Check FMEA
        if equip_id in equipment_with_fmea:
            assets_with_fmea += 1
        
        # Check equipment type
        if equip.get("type") or equip.get("equipment_type"):
            assets_with_type += 1
    
    # Calculate percentages
    criticality_coverage = round((assets_with_criticality / total_assets * 100), 1)
    fmea_coverage = round((assets_with_fmea / total_assets * 100), 1)
    type_coverage = round((assets_with_type / total_assets * 100), 1)
    
    # Overall score (average of all metrics)
    overall_score = round((criticality_coverage + fmea_coverage + type_coverage) / 3, 1)
    
    # Determine status
    if overall_score >= 80:
        status = "good"
    elif overall_score >= 50:
        status = "warning"
    else:
        status = "critical"
    
    return {
        "metrics": {
            "criticality_coverage": criticality_coverage,
            "fmea_coverage": fmea_coverage,
            "equipment_type_coverage": type_coverage
        },
        "details": {
            "total_assets": total_assets,
            "assets_with_criticality": assets_with_criticality,
            "assets_with_fmea": assets_with_fmea,
            "assets_with_type": assets_with_type
        },
        "overall_score": overall_score,
        "status": status
    }


@router.get("/reliability/gaps")
async def get_reliability_gaps(
    current_user: dict = Depends(get_current_user)
):
    """
    Identify areas where execution or data is insufficient.
    """
    
    
    gaps = []
    
    # 1. Observations without actions
    threats = await db.threats.find({}).to_list(length=None)
    actions = await db.central_actions.find({}).to_list(length=None)
    
    threat_ids_with_actions = set()
    for action in actions:
        tid = action.get("observation_id") or action.get("threat_id")
        if tid:
            threat_ids_with_actions.add(tid)
    
    observations_without_actions = []
    for threat in threats:
        if threat.get("id") not in threat_ids_with_actions:
            observations_without_actions.append({
                "id": threat.get("id"),
                "title": threat.get("title") or threat.get("description", "")[:50]
            })
    
    if observations_without_actions:
        gaps.append({
            "type": "observations_without_actions",
            "title": "Observations Without Actions",
            "description": f"{len(observations_without_actions)} observations have no linked corrective actions",
            "count": len(observations_without_actions),
            "severity": "high" if len(observations_without_actions) > 10 else "medium",
            "items": observations_without_actions[:10]  # Limit to 10
        })
    
    # 2. Investigations without follow-up (no actions after investigation)
    investigations = await db.investigations.find({}).to_list(length=None)
    investigation_ids_with_actions = set()
    for action in actions:
        inv_id = action.get("investigation_id")
        if inv_id:
            investigation_ids_with_actions.add(inv_id)
    
    investigations_without_followup = []
    for inv in investigations:
        if inv.get("id") not in investigation_ids_with_actions:
            investigations_without_followup.append({
                "id": inv.get("id"),
                "title": inv.get("title") or "Investigation"
            })
    
    if investigations_without_followup:
        gaps.append({
            "type": "investigations_without_followup",
            "title": "Investigations Without Follow-up",
            "description": f"{len(investigations_without_followup)} investigations have no resulting actions",
            "count": len(investigations_without_followup),
            "severity": "medium",
            "items": investigations_without_followup[:10]
        })
    
    # 3. High failure rate assets
    equipment = await db.equipment.find({}).to_list(length=None)
    asset_failures = {}
    asset_total = {}
    
    for action in actions:
        asset_id = action.get("asset_id") or action.get("equipment_id")
        if not asset_id:
            continue
        
        if asset_id not in asset_total:
            asset_total[asset_id] = 0
            asset_failures[asset_id] = 0
        
        asset_total[asset_id] += 1
        if action.get("status", "").lower() in ["failed", "cancelled", "rejected"]:
            asset_failures[asset_id] += 1
    
    high_failure_assets = []
    for asset_id, total in asset_total.items():
        if total >= 3:  # Minimum 3 actions to be significant
            failure_rate = (asset_failures.get(asset_id, 0) / total) * 100
            if failure_rate > 20:
                # Find asset name
                asset = next((e for e in equipment if e.get("id") == asset_id), None)
                asset_name = asset.get("name") if asset else asset_id
                high_failure_assets.append({
                    "id": asset_id,
                    "name": asset_name,
                    "failure_rate": round(failure_rate, 1)
                })
    
    if high_failure_assets:
        gaps.append({
            "type": "high_failure_assets",
            "title": "High Failure Rate Assets",
            "description": f"{len(high_failure_assets)} assets have action failure rate above 20%",
            "count": len(high_failure_assets),
            "severity": "high",
            "items": sorted(high_failure_assets, key=lambda x: -x["failure_rate"])[:10]
        })
    
    # 4. Missing FMEA on critical assets
    fmea_mappings = await db.equipment_fmea.find({}).to_list(length=None)
    equipment_with_fmea = set(m.get("equipment_id") for m in fmea_mappings)
    
    critical_without_fmea = []
    for equip in equipment:
        criticality = equip.get("criticality") or equip.get("criticality_score") or ""
        is_critical = str(criticality).lower() in ["high", "critical", "a", "1"] or (isinstance(criticality, (int, float)) and criticality >= 8)
        
        if is_critical and equip.get("id") not in equipment_with_fmea:
            critical_without_fmea.append({
                "id": equip.get("id"),
                "name": equip.get("name"),
                "criticality": criticality
            })
    
    if critical_without_fmea:
        gaps.append({
            "type": "critical_without_fmea",
            "title": "Critical Assets Without FMEA",
            "description": f"{len(critical_without_fmea)} critical assets have no FMEA coverage",
            "count": len(critical_without_fmea),
            "severity": "high",
            "items": critical_without_fmea[:10]
        })
    
    # Sort gaps by severity
    severity_order = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda x: severity_order.get(x["severity"], 3))
    
    return {
        "gaps": gaps,
        "total_gaps": len(gaps),
        "critical_gap_count": len([g for g in gaps if g["severity"] == "high"])
    }


@router.post("/ai/recommendations")
async def generate_ai_recommendations(
    current_user: dict = Depends(get_current_user)
):
    """
    Generate AI-driven recommendations based on current reliability data.
    """
    
    
    # Gather context data
    try:
        # Get execution metrics
        actions = await db.central_actions.find({}).to_list(length=None)
        total_actions = len(actions)
        completed = len([a for a in actions if a.get("status", "").lower() in ["completed", "done", "closed"]])
        failed = len([a for a in actions if a.get("status", "").lower() in ["failed", "cancelled", "rejected"]])
        success_rate = round((completed / total_actions * 100), 1) if total_actions > 0 else 0
        
        # Get task metrics
        tasks = await db.task_assignments.find({}).to_list(length=None)
        schedules = await db.task_schedules.find({}).to_list(length=None)
        recurring_ids = set(s.get("id") for s in schedules if s.get("recurrence", {}).get("type") and s.get("recurrence", {}).get("type") != "none")
        
        recurring_count = len([t for t in tasks if t.get("schedule_id") in recurring_ids])
        adhoc_count = len(tasks) - recurring_count
        
        # Get data quality
        equipment = await db.equipment.find({}).to_list(length=None)
        total_assets = len(equipment)
        fmea_mappings = await db.equipment_fmea.find({}).to_list(length=None)
        fmea_coverage = round((len(fmea_mappings) / total_assets * 100), 1) if total_assets > 0 else 0
        
        # Get gaps summary
        threats = await db.threats.find({}).to_list(length=None)
        threat_ids_with_actions = set(a.get("observation_id") or a.get("threat_id") for a in actions if a.get("observation_id") or a.get("threat_id"))
        obs_without_actions = len([t for t in threats if t.get("id") not in threat_ids_with_actions])
        
        # Build context for AI
        context = f"""
Current Reliability Data Summary:
- Total Actions: {total_actions}
- Completed Actions: {completed}
- Failed Actions: {failed}
- Action Success Rate: {success_rate}%
- Recurring Tasks: {recurring_count}
- Ad-hoc Tasks: {adhoc_count}
- Total Assets: {total_assets}
- FMEA Coverage: {fmea_coverage}%
- Observations Without Actions: {obs_without_actions}

Based on this data, provide 5 specific, actionable recommendations to improve reliability performance.
Focus on:
1. Improving action completion rates
2. Increasing FMEA coverage
3. Converting ad-hoc to recurring maintenance where beneficial
4. Addressing observations that lack follow-up actions
5. Reducing failure rates

Return as JSON array with fields: title, description, impact (high/medium/low)
"""
        
        # Call AI
        from emergentintegrations.llm.chat import chat, ChatMessage
        
        response = await chat(
            api_key=os.environ.get("EMERGENT_API_KEY"),
            model="gpt-5.2",
            messages=[
                ChatMessage(
                    role="system",
                    content="You are a reliability engineering expert. Provide specific, actionable recommendations based on the data. Return only valid JSON array."
                ),
                ChatMessage(role="user", content=context)
            ]
        )
        
        # Parse response
        import json
        response_text = response.message.strip()
        
        # Extract JSON from response
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
        
        try:
            recommendations = json.loads(response_text)
            if not isinstance(recommendations, list):
                recommendations = recommendations.get("actions", recommendations.get("recommendations", []))
        except json.JSONDecodeError:
            # Fallback recommendations
            recommendations = [
                {
                    "title": "Improve FMEA Coverage",
                    "description": f"Current FMEA coverage is {fmea_coverage}%. Target 80%+ coverage for critical assets first.",
                    "impact": "high"
                },
                {
                    "title": "Address Unactioned Observations",
                    "description": f"{obs_without_actions} observations lack corrective actions. Review and assign actions to high-priority items.",
                    "impact": "high" if obs_without_actions > 10 else "medium"
                },
                {
                    "title": "Convert Reactive to Planned Maintenance",
                    "description": f"Ad-hoc tasks ({adhoc_count}) exceed recurring tasks ({recurring_count}). Identify patterns for preventive scheduling.",
                    "impact": "medium"
                },
                {
                    "title": "Reduce Action Failure Rate",
                    "description": f"Current success rate is {success_rate}%. Investigate root causes of {failed} failed actions.",
                    "impact": "high" if success_rate < 80 else "medium"
                },
                {
                    "title": "Standardize Follow-up Procedures",
                    "description": "Ensure all investigations result in documented actions with clear ownership and deadlines.",
                    "impact": "medium"
                }
            ]
        
        # Ensure max 5 recommendations
        recommendations = recommendations[:5]
        
        return {
            "recommendations": recommendations,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "data_summary": {
                "total_actions": total_actions,
                "success_rate": success_rate,
                "fmea_coverage": fmea_coverage,
                "observations_without_actions": obs_without_actions
            }
        }
        
    except Exception as e:
        logger.error(f"Error generating AI recommendations: {e}")
        # Return fallback recommendations
        return {
            "recommendations": [
                {
                    "title": "Review Data Quality",
                    "description": "Ensure all assets have complete criticality assessments and FMEA coverage.",
                    "impact": "high"
                },
                {
                    "title": "Close Open Actions",
                    "description": "Review and complete or close outstanding actions to improve execution metrics.",
                    "impact": "high"
                },
                {
                    "title": "Link Observations to Actions",
                    "description": "Ensure every observation has at least one corrective or preventive action assigned.",
                    "impact": "medium"
                },
                {
                    "title": "Schedule Recurring Maintenance",
                    "description": "Convert frequently occurring ad-hoc tasks into scheduled recurring maintenance.",
                    "impact": "medium"
                },
                {
                    "title": "Track Performance by Discipline",
                    "description": "Monitor execution performance by discipline to identify training needs.",
                    "impact": "low"
                }
            ],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "error": "AI generation failed, showing default recommendations"
        }


@router.get("/insights/summary")
async def get_insights_summary(
    current_user: dict = Depends(get_current_user)
):
    """
    Get quick overview summary of system health.
    """
    
    
    # Execution success rate
    actions = await db.central_actions.find({}).to_list(length=None)
    total_actions = len(actions)
    completed = len([a for a in actions if a.get("status", "").lower() in ["completed", "done", "closed"]])
    success_rate = round((completed / total_actions * 100), 1) if total_actions > 0 else 0
    
    # Data completeness
    equipment = await db.equipment.find({}).to_list(length=None)
    total_assets = len(equipment)
    
    assets_with_criticality = len([e for e in equipment if e.get("criticality") or e.get("criticality_score")])
    fmea_mappings = await db.equipment_fmea.find({}).to_list(length=None)
    assets_with_type = len([e for e in equipment if e.get("type") or e.get("equipment_type")])
    
    if total_assets > 0:
        crit_pct = (assets_with_criticality / total_assets * 100)
        fmea_pct = (len(fmea_mappings) / total_assets * 100)
        type_pct = (assets_with_type / total_assets * 100)
        completeness_score = round((crit_pct + fmea_pct + type_pct) / 3, 1)
    else:
        completeness_score = 0
    
    # Bad actors count (disciplines with >15% failure rate)
    users = await db.users.find({}).to_list(length=None)
    user_disciplines = {u.get("id"): u.get("discipline") or u.get("position") or "Unassigned" for u in users}
    
    discipline_stats = {}
    tasks = await db.task_assignments.find({}).to_list(length=None)
    
    for item in actions + tasks:
        assignee = item.get("assignee_id") or item.get("assigned_to")
        if not assignee:
            continue
        discipline = user_disciplines.get(assignee, "Unassigned")
        if discipline not in discipline_stats:
            discipline_stats[discipline] = {"total": 0, "failed": 0}
        discipline_stats[discipline]["total"] += 1
        status = item.get("status", "").lower()
        if status in ["failed", "cancelled", "rejected", "missed", "overdue"]:
            discipline_stats[discipline]["failed"] += 1
    
    bad_actors = len([d for d, s in discipline_stats.items() if s["total"] >= 3 and (s["failed"] / s["total"] * 100) > 15])
    
    # Critical gaps count
    threats = await db.threats.find({}).to_list(length=None)
    threat_ids_with_actions = set(a.get("observation_id") or a.get("threat_id") for a in actions if a.get("observation_id") or a.get("threat_id"))
    obs_without_actions = len([t for t in threats if t.get("id") not in threat_ids_with_actions])
    
    critical_without_fmea = len([e for e in equipment 
        if (str(e.get("criticality", "")).lower() in ["high", "critical", "a", "1"] or 
            (isinstance(e.get("criticality_score"), (int, float)) and e.get("criticality_score", 0) >= 8))
        and e.get("id") not in set(m.get("equipment_id") for m in fmea_mappings)])
    
    critical_gaps = 0
    if obs_without_actions > 10:
        critical_gaps += 1
    if critical_without_fmea > 0:
        critical_gaps += 1
    
    return {
        "execution_success_rate": success_rate,
        "data_completeness_score": completeness_score,
        "bad_actors_count": bad_actors,
        "critical_gaps_count": critical_gaps,
        "total_actions": total_actions,
        "total_assets": total_assets
    }
