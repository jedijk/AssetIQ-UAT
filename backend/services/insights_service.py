"""
Execution & Reliability Insights — Wave 11 tenant-scoped service.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging

from database import db
from services.tenant_schema import prepend_tenant_match
from services.tenant_scope import scoped
from services.ai_gateway import chat as ai_gateway_chat, user_context

logger = logging.getLogger(__name__)



async def get_action_execution_metrics(
    user: dict,
):
    """
    Get action execution performance metrics.
    Optimized with count queries and aggregation.
    """
    import asyncio
    
    try:
        async def fetch_metrics():
            # Parallel count queries
            total_task = db.central_actions.count_documents(scoped(user))
            completed_task = db.central_actions.count_documents(scoped(user, {
                "status": {"$in": ["completed", "Completed", "done", "Done", "closed", "Closed"]}
            }))
            failed_task = db.central_actions.count_documents(scoped(user, {
                "status": {"$in": ["failed", "Failed", "cancelled", "Cancelled", "rejected", "Rejected"]}
            }))
            with_obs_task = db.central_actions.count_documents(scoped(user, {
                "$or": [
                    {"observation_id": {"$exists": True, "$ne": None}},
                    {"threat_id": {"$exists": True, "$ne": None}}
                ]
            }))
            with_inv_task = db.central_actions.count_documents(scoped(user, {
                "investigation_id": {"$exists": True, "$ne": None}
            }))
            with_asset_task = db.central_actions.count_documents(scoped(user, {
                "$or": [
                    {"asset_id": {"$exists": True, "$ne": None}},
                    {"equipment_id": {"$exists": True, "$ne": None}}
                ]
            }))
            
            total, completed, failed, with_obs, with_inv, with_asset = await asyncio.gather(
                total_task, completed_task, failed_task, with_obs_task, with_inv_task, with_asset_task
            )
            
            success_rate = round((completed / total * 100), 1) if total > 0 else 0
            
            return {
                "total_actions": total,
                "completed_actions": completed,
                "failed_actions": failed,
                "in_progress_actions": total - completed - failed,
                "success_rate": success_rate,
                "avg_completion_time_days": 0,  # Simplified - skip expensive calculation
                "breakdown": {
                    "by_observation_count": with_obs,
                    "by_investigation_count": with_inv,
                    "by_asset_count": with_asset
                }
            }
        
        return await asyncio.wait_for(fetch_metrics(), timeout=5.0)
        
    except asyncio.TimeoutError:
        return {"total_actions": 0, "completed_actions": 0, "failed_actions": 0, 
                "in_progress_actions": 0, "success_rate": 0, "avg_completion_time_days": 0,
                "breakdown": {"by_observation_count": 0, "by_investigation_count": 0, "by_asset_count": 0},
                "error": "timeout"}


async def get_task_execution_metrics(
    user: dict,
):
    """
    Get task execution metrics comparing recurring vs ad-hoc tasks.
    Optimized with count queries.
    """
    import asyncio
    
    try:
        async def fetch_metrics():
            # Count task instances by status
            total_task = db.task_instances.count_documents(scoped(user))
            completed_task = db.task_instances.count_documents(scoped(user, {
                "status": {"$in": ["completed", "Completed", "done", "Done"]}
            }))
            failed_task = db.task_instances.count_documents(scoped(user, {
                "status": {"$in": ["failed", "Failed", "missed", "Missed", "overdue", "Overdue"]}
            }))
            
            # Count by type - adhoc vs recurring
            adhoc_total = db.task_instances.count_documents(scoped(user, {"is_adhoc": True}))
            adhoc_completed = db.task_instances.count_documents(scoped(user, {
                "is_adhoc": True,
                "status": {"$in": ["completed", "Completed", "done", "Done"]}
            }))
            adhoc_failed = db.task_instances.count_documents(scoped(user, {
                "is_adhoc": True,
                "status": {"$in": ["failed", "Failed", "missed", "Missed", "overdue", "Overdue"]}
            }))
            
            total, completed, failed, adhoc_t, adhoc_c, adhoc_f = await asyncio.gather(
                total_task, completed_task, failed_task, adhoc_total, adhoc_completed, adhoc_failed
            )
            
            recurring_t = total - adhoc_t
            recurring_c = completed - adhoc_c
            recurring_f = failed - adhoc_f
            
            recurring_completion_rate = round((recurring_c / recurring_t * 100), 1) if recurring_t > 0 else 0
            recurring_failure_rate = round((recurring_f / recurring_t * 100), 1) if recurring_t > 0 else 0
            adhoc_completion_rate = round((adhoc_c / adhoc_t * 100), 1) if adhoc_t > 0 else 0
            adhoc_failure_rate = round((adhoc_f / adhoc_t * 100), 1) if adhoc_t > 0 else 0
            
            return {
                "recurring": {
                    "total": recurring_t,
                    "completed": recurring_c,
                    "failed": recurring_f,
                    "in_progress": recurring_t - recurring_c - recurring_f,
                    "completion_rate": recurring_completion_rate,
                    "failure_rate": recurring_failure_rate
                },
                "adhoc": {
                    "total": adhoc_t,
                    "completed": adhoc_c,
                    "failed": adhoc_f,
                    "in_progress": adhoc_t - adhoc_c - adhoc_f,
                    "completion_rate": adhoc_completion_rate,
                    "failure_rate": adhoc_failure_rate
                },
                "insights": {
                    "more_efficient": "recurring" if recurring_completion_rate > adhoc_completion_rate else "adhoc" if adhoc_completion_rate > recurring_completion_rate else "equal",
                    "reactive_pattern": adhoc_t > recurring_t
                }
            }
        
        return await asyncio.wait_for(fetch_metrics(), timeout=5.0)
        
    except asyncio.TimeoutError:
        return {
            "recurring": {"total": 0, "completed": 0, "failed": 0, "in_progress": 0, "completion_rate": 0, "failure_rate": 0},
            "adhoc": {"total": 0, "completed": 0, "failed": 0, "in_progress": 0, "completion_rate": 0, "failure_rate": 0},
            "insights": {"more_efficient": "equal", "reactive_pattern": False},
            "error": "timeout"
        }


async def get_discipline_performance(
    user: dict,
):
    """
    Get performance metrics by discipline (actor performance).
    Optimized with aggregation pipeline.
    """
    import asyncio
    
    try:
        async def fetch_metrics():
            # Use aggregation to get discipline stats from task_instances
            pipeline = prepend_tenant_match([
                {"$match": {"assigned_to": {"$exists": True, "$ne": None}}},
                {"$group": {
                    "_id": "$discipline",
                    "total": {"$sum": 1},
                    "completed": {"$sum": {"$cond": [{"$in": ["$status", ["completed", "Completed", "done", "Done"]]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$in": ["$status", ["failed", "Failed", "missed", "Missed", "overdue", "Overdue"]]}, 1, 0]}}
                }},
                {"$limit": 20}
            ], user)

            results = await db.task_instances.aggregate(pipeline).to_list(length=20)
            
            disciplines = []
            for r in results:
                name = r.get("_id") or "Unassigned"
                total = r.get("total", 0)
                completed = r.get("completed", 0)
                failed = r.get("failed", 0)
                
                failure_rate = round((failed / total * 100), 1) if total > 0 else 0
                completion_rate = round((completed / total * 100), 1) if total > 0 else 0
                
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
                    "avg_completion_time_days": 0,
                    "classification": classification
                })
            
            disciplines.sort(key=lambda x: (-x["completion_rate"], x["failure_rate"]))
            
            return {
                "disciplines": disciplines,
                "top_performers": [d for d in disciplines if d["classification"] == "good"][:5],
                "bottom_performers": [d for d in disciplines if d["classification"] == "bad"][:5],
                "summary": {
                    "total_disciplines": len(disciplines),
                    "good_actors": len([d for d in disciplines if d["classification"] == "good"]),
                    "average_actors": len([d for d in disciplines if d["classification"] == "average"]),
                    "bad_actors": len([d for d in disciplines if d["classification"] == "bad"])
                }
            }
        
        return await asyncio.wait_for(fetch_metrics(), timeout=5.0)
        
    except asyncio.TimeoutError:
        return {
            "disciplines": [],
            "top_performers": [],
            "bottom_performers": [],
            "summary": {"total_disciplines": 0, "good_actors": 0, "average_actors": 0, "bad_actors": 0},
            "error": "timeout"
        }


async def get_data_quality_metrics(
    user: dict,
):
    """
    Assess quality and completeness of reliability data.
    Optimized with count queries.
    """
    import asyncio
    
    try:
        async def fetch_metrics():
            # Parallel count queries - use correct collections
            total_task = db.equipment_nodes.count_documents(scoped(user))
            crit_task = db.equipment_nodes.count_documents(scoped(user, {
                "$or": [
                    {"criticality": {"$exists": True, "$nin": [None, ""]}},
                    {"criticality_score": {"$exists": True, "$ne": None}}
                ]
            }))
            type_task = db.equipment_nodes.count_documents(scoped(user, {
                "$or": [
                    {"equipment_type_id": {"$exists": True, "$nin": [None, ""]}},
                    {"type": {"$exists": True, "$nin": [None, ""]}}
                ]
            }))
            fmea_task = db.failure_modes.count_documents(scoped(user))
            
            total, with_crit, with_type, fmea_count = await asyncio.gather(
                total_task, crit_task, type_task, fmea_task
            )
            
            # Calculate FMEA coverage: nodes that have equipment_type_id linked to at least one failure mode
            fmea_linked_types = set(await db.failure_modes.distinct("equipment_type_ids", scoped(user)))
            fmea_linked_types.discard(None)
            fmea_linked_types.discard("")
            assets_with_fmea = await db.equipment_nodes.count_documents(scoped(user, {
                "equipment_type_id": {"$in": list(fmea_linked_types)}
            })) if fmea_linked_types else 0
            
            if total == 0:
                return {
                    "metrics": {"criticality_coverage": 0, "fmea_coverage": 0, "equipment_type_coverage": 0},
                    "overall_score": 0,
                    "status": "critical",
                    "total_assets": 0
                }
            
            crit_coverage = round((with_crit / total * 100), 1)
            fmea_coverage = round((assets_with_fmea / total * 100), 1)
            type_coverage = round((with_type / total * 100), 1)
            overall_score = round((crit_coverage + fmea_coverage + type_coverage) / 3, 1)
            
            if overall_score >= 80:
                status = "good"
            elif overall_score >= 50:
                status = "warning"
            else:
                status = "critical"
            
            return {
                "metrics": {
                    "criticality_coverage": crit_coverage,
                    "fmea_coverage": fmea_coverage,
                    "equipment_type_coverage": type_coverage
                },
                "details": {
                    "total_assets": total,
                    "assets_with_criticality": with_crit,
                    "assets_with_fmea": assets_with_fmea,
                    "assets_with_type": with_type,
                    "total_failure_modes": fmea_count
                },
                "overall_score": overall_score,
                "status": status
            }
        
        return await asyncio.wait_for(fetch_metrics(), timeout=5.0)
        
    except asyncio.TimeoutError:
        return {
            "metrics": {"criticality_coverage": 0, "fmea_coverage": 0, "equipment_type_coverage": 0},
            "overall_score": 0,
            "status": "critical",
            "total_assets": 0,
            "error": "timeout"
        }


async def get_reliability_gaps(
    user: dict,
):
    """
    Identify areas where execution or data is insufficient.
    Optimized with count queries.
    """
    import asyncio
    
    try:
        async def fetch_gaps():
            gaps = []
            
            # 1. Count observations without actions
            threats_count = await db.threats.count_documents(scoped(user))
            actions_with_obs = await db.central_actions.count_documents(scoped(user, {
                "$or": [
                    {"observation_id": {"$exists": True, "$ne": None}},
                    {"threat_id": {"$exists": True, "$ne": None}}
                ]
            }))
            obs_without_actions = max(0, threats_count - actions_with_obs)
            
            if obs_without_actions > 0:
                gaps.append({
                    "type": "observations_without_actions",
                    "title": "Observations Without Actions",
                    "description": f"{obs_without_actions} observations may have no linked corrective actions",
                    "count": obs_without_actions,
                    "severity": "high" if obs_without_actions > 10 else "medium",
                    "items": []
                })
            
            # 2. Count investigations without follow-up
            inv_count = await db.investigations.count_documents(scoped(user))
            actions_with_inv = await db.central_actions.count_documents(scoped(user, {
                "investigation_id": {"$exists": True, "$ne": None}
            }))
            inv_without_followup = max(0, inv_count - actions_with_inv)
            
            if inv_without_followup > 0:
                gaps.append({
                    "type": "investigations_without_followup",
                    "title": "Investigations Without Follow-up",
                    "description": f"{inv_without_followup} investigations may have no resulting actions",
                    "count": inv_without_followup,
                    "severity": "medium",
                    "items": []
                })
            
            # 3. Critical assets without FMEA - simplified
            critical_equipment = await db.equipment_nodes.count_documents(scoped(user, {
                "$or": [
                    {"criticality": {"$in": ["high", "High", "critical", "Critical", "a", "A", "1"]}},
                    {"criticality_score": {"$gte": 8}}
                ]
            }))
            fmea_count = await db.failure_modes.count_documents(scoped(user))
            
            # Estimate critical without FMEA (simplified - may have duplicates)
            critical_without_fmea_est = max(0, critical_equipment - fmea_count)
            
            if critical_without_fmea_est > 0:
                gaps.append({
                    "type": "critical_without_fmea",
                    "title": "Critical Assets Without FMEA",
                    "description": f"Approximately {critical_without_fmea_est} critical assets may lack FMEA coverage",
                    "count": critical_without_fmea_est,
                    "severity": "high",
                    "items": []
                })
            
            # Sort by severity
            severity_order = {"high": 0, "medium": 1, "low": 2}
            gaps.sort(key=lambda x: severity_order.get(x["severity"], 3))
            
            return {
                "gaps": gaps,
                "total_gaps": len(gaps),
                "critical_gap_count": len([g for g in gaps if g["severity"] == "high"])
            }
        
        return await asyncio.wait_for(fetch_gaps(), timeout=5.0)
        
    except asyncio.TimeoutError:
        return {"gaps": [], "total_gaps": 0, "critical_gap_count": 0, "error": "timeout"}


async def generate_ai_recommendations(
    user: dict,
):
    """
    Generate AI-driven recommendations based on current reliability data.
    """
    
    
    # Gather context data
    try:
        # Get execution metrics
        actions = await db.central_actions.find(scoped(user)).to_list(length=None)
        total_actions = len(actions)
        completed = len([a for a in actions if a.get("status", "").lower() in ["completed", "done", "closed"]])
        failed = len([a for a in actions if a.get("status", "").lower() in ["failed", "cancelled", "rejected"]])
        success_rate = round((completed / total_actions * 100), 1) if total_actions > 0 else 0
        
        # Get task metrics
        tasks = await db.task_assignments.find(scoped(user)).to_list(length=None)
        schedules = await db.task_schedules.find(scoped(user)).to_list(length=None)
        recurring_ids = set(s.get("id") for s in schedules if s.get("recurrence", {}).get("type") and s.get("recurrence", {}).get("type") != "none")
        
        recurring_count = len([t for t in tasks if t.get("schedule_id") in recurring_ids])
        adhoc_count = len(tasks) - recurring_count
        
        # Get data quality
        equipment = await db.equipment.find(scoped(user)).to_list(length=None)
        total_assets = len(equipment)
        fmea_mappings = await db.equipment_fmea.find(scoped(user)).to_list(length=None)
        fmea_coverage = round((len(fmea_mappings) / total_assets * 100), 1) if total_assets > 0 else 0
        
        # Get gaps summary
        threats = await db.threats.find(scoped(user)).to_list(length=None)
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
        
        from services.ai_platform import execute_json_prompt

        result = await execute_json_prompt(
            "insights.recommendations",
            user=user,
            user_message=context,
            endpoint="insights.ai_recommendations",
            model="gpt-4o",
            temperature=0.5,
        )
        parsed = result["parsed"]
        if isinstance(parsed, list):
            recommendations = parsed
        elif isinstance(parsed, dict):
            recommendations = parsed.get("actions", parsed.get("recommendations", []))
        else:
            recommendations = None

        if not recommendations:
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

        from services.ai_citation import make_citation
        from services.ai_recommendation_contract import finalize_ai_recommendation_response

        citations = [
            make_citation(
                id="fleet-reliability-summary",
                type="kpi",
                label="Fleet reliability KPI snapshot",
                url_path="/insights",
            )
        ]
        evidence = {
            "deterministic": {
                "total_actions": total_actions,
                "success_rate": success_rate,
                "fmea_coverage": fmea_coverage,
                "observations_without_actions": obs_without_actions,
            },
        }
        return finalize_ai_recommendation_response(
            {
                "recommendations": recommendations,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "data_summary": evidence["deterministic"],
            },
            citations=citations,
            evidence=evidence,
        )
        
    except Exception as e:
        logger.error(f"Error generating AI recommendations: {e}")
        from services.ai_recommendation_contract import finalize_ai_recommendation_response

        # Return fallback recommendations
        return finalize_ai_recommendation_response(
            {
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
            "error": "AI generation failed, showing default recommendations",
        },
        citations=[],
    )


async def get_insights_summary(
    user: dict,
):
    """Get quick overview summary from materialized read model."""
    from services.insights_summary_materializer import get_or_compute_insights_summary

    return await get_or_compute_insights_summary(user)
