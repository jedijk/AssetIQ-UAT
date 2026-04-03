"""
Analytics Service - Comprehensive analytics and reporting.

Provides:
- Top risks by impact
- Failure mode ranking (Pareto)
- Observation trends
- Task compliance metrics
- Detection effectiveness
- Under-controlled risks
- Over-maintained assets
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Service for analytics and reporting."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.threats = db["threats"]
        self.observations = db["observations"]
        self.efms = db["equipment_failure_modes"]
        self.failure_modes = db["failure_modes"]
        self.equipment = db["equipment_nodes"]
        self.task_plans = db["task_plans"]
        self.task_instances = db["task_instances"]
        self.form_submissions = db["form_submissions"]
    
    # ==================== RISK ANALYTICS ====================
    
    async def get_risk_overview(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get overall risk metrics."""
        
        # Use aggregation pipeline to get all stats in one query
        match_stage = {"$match": {"created_by": user_id}} if user_id else {"$match": {}}
        
        pipeline = [
            match_stage,
            {"$facet": {
                "by_risk_level": [
                    {"$group": {
                        "_id": "$risk_level",
                        "count": {"$sum": 1}
                    }}
                ],
                "overall_stats": [
                    {"$group": {
                        "_id": None,
                        "avg_risk": {"$avg": "$risk_score"},
                        "max_risk": {"$max": "$risk_score"},
                        "total": {"$sum": 1}
                    }}
                ]
            }}
        ]
        
        result = await self.threats.aggregate(pipeline).to_list(1)
        
        risk_levels = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        avg_risk = 0
        max_risk = 0
        total_threats = 0
        
        if result:
            facets = result[0]
            
            # Extract risk level counts
            for item in facets.get("by_risk_level", []):
                level = (item.get("_id") or "").lower()
                if level in risk_levels:
                    risk_levels[level] = item["count"]
            
            # Extract overall stats
            if facets.get("overall_stats"):
                stats = facets["overall_stats"][0]
                avg_risk = stats.get("avg_risk") or 0
                max_risk = stats.get("max_risk") or 0
                total_threats = stats.get("total") or 0
        
        # EFM risk distribution
        efm_pipeline = [
            {"$match": {"is_active": True}},
            {"$addFields": {
                "rpn": {"$multiply": ["$severity", "$likelihood", "$detectability"]}
            }},
            {"$group": {
                "_id": None,
                "avg_rpn": {"$avg": "$rpn"},
                "high_risk": {"$sum": {"$cond": [{"$gte": ["$rpn", 200]}, 1, 0]}},
                "medium_risk": {"$sum": {"$cond": [{"$and": [{"$gte": ["$rpn", 100]}, {"$lt": ["$rpn", 200]}]}, 1, 0]}},
                "low_risk": {"$sum": {"$cond": [{"$lt": ["$rpn", 100]}, 1, 0]}},
                "total": {"$sum": 1}
            }}
        ]
        
        efm_result = await self.efms.aggregate(efm_pipeline).to_list(1)
        
        return {
            "threats": {
                "by_level": risk_levels,
                "total": total_threats,
                "avg_risk_score": round(avg_risk, 1) if avg_risk else 0,
                "max_risk_score": max_risk or 0
            },
            "efms": {
                "total": efm_result[0]["total"] if efm_result else 0,
                "high_risk": efm_result[0]["high_risk"] if efm_result else 0,
                "medium_risk": efm_result[0]["medium_risk"] if efm_result else 0,
                "low_risk": efm_result[0]["low_risk"] if efm_result else 0,
                "avg_rpn": round(efm_result[0]["avg_rpn"], 1) if efm_result and efm_result[0]["avg_rpn"] else 0
            }
        }
    
    async def get_top_risks(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get top risks by RPN/impact."""
        
        pipeline = [
            {"$match": {"is_active": True}},
            {"$addFields": {
                "rpn": {"$multiply": ["$severity", "$likelihood", "$detectability"]}
            }},
            {"$sort": {"rpn": -1}},
            {"$limit": limit},
            {"$project": {
                "equipment_id": 1,
                "equipment_name": 1,
                "failure_mode_name": 1,
                "severity": 1,
                "likelihood": 1,
                "detectability": 1,
                "rpn": 1,
                "observations_count": 1
            }}
        ]
        
        results = []
        async for doc in self.efms.aggregate(pipeline):
            results.append({
                "id": str(doc["_id"]),
                "equipment_name": doc.get("equipment_name"),
                "failure_mode": doc.get("failure_mode_name"),
                "severity": doc.get("severity"),
                "likelihood": doc.get("likelihood"),
                "detectability": doc.get("detectability"),
                "rpn": doc.get("rpn"),
                "observations": doc.get("observations_count", 0)
            })
        
        return results
    
    async def get_failure_mode_pareto(self, limit: int = 20) -> Dict[str, Any]:
        """Get failure mode ranking (Pareto analysis)."""
        
        # Count observations per failure mode
        pipeline = [
            {"$match": {"failure_mode_name": {"$exists": True, "$ne": None}}},
            {"$group": {
                "_id": "$failure_mode_name",
                "count": {"$sum": 1},
                "failure_mode_id": {"$first": "$failure_mode_id"}
            }},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        
        results = []
        total = 0
        async for doc in self.observations.aggregate(pipeline):
            total += doc["count"]
            results.append({
                "failure_mode": doc["_id"],
                "failure_mode_id": doc.get("failure_mode_id"),
                "count": doc["count"]
            })
        
        # Calculate cumulative percentage
        cumulative = 0
        for r in results:
            r["percentage"] = round(r["count"] / total * 100, 1) if total > 0 else 0
            cumulative += r["percentage"]
            r["cumulative_percentage"] = round(cumulative, 1)
        
        return {
            "total_observations": total,
            "failure_modes": results
        }
    
    # ==================== TASK ANALYTICS ====================
    
    async def get_task_compliance(self, days: int = 30) -> Dict[str, Any]:
        """Get task compliance metrics."""
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Task status distribution
        pipeline = [
            {"$match": {"scheduled_date": {"$gte": start_date}}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        status_counts = {}
        async for doc in self.task_instances.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]
        
        total = sum(status_counts.values())
        completed = status_counts.get("completed", 0)
        overdue = status_counts.get("overdue", 0)
        
        compliance_rate = round(completed / total * 100, 1) if total > 0 else 100
        overdue_rate = round(overdue / total * 100, 1) if total > 0 else 0
        
        # Average completion time
        completion_pipeline = [
            {"$match": {
                "status": "completed",
                "completed_at": {"$gte": start_date},
                "actual_duration_minutes": {"$exists": True, "$ne": None}
            }},
            {"$group": {
                "_id": None,
                "avg_duration": {"$avg": "$actual_duration_minutes"},
                "total_completed": {"$sum": 1}
            }}
        ]
        
        completion_result = await self.task_instances.aggregate(completion_pipeline).to_list(1)
        avg_duration = completion_result[0]["avg_duration"] if completion_result else 0
        
        # Issues found rate
        issues_pipeline = [
            {"$match": {
                "status": "completed",
                "completed_at": {"$gte": start_date}
            }},
            {"$group": {
                "_id": None,
                "with_issues": {"$sum": {"$cond": [{"$gt": [{"$size": {"$ifNull": ["$issues_found", []]}}, 0]}, 1, 0]}},
                "total": {"$sum": 1}
            }}
        ]
        
        issues_result = await self.task_instances.aggregate(issues_pipeline).to_list(1)
        issues_found_rate = 0
        if issues_result and issues_result[0]["total"] > 0:
            issues_found_rate = round(issues_result[0]["with_issues"] / issues_result[0]["total"] * 100, 1)
        
        return {
            "period_days": days,
            "total_tasks": total,
            "by_status": status_counts,
            "compliance_rate": compliance_rate,
            "overdue_rate": overdue_rate,
            "avg_completion_minutes": round(avg_duration, 1) if avg_duration else 0,
            "issues_found_rate": issues_found_rate
        }
    
    async def get_task_workload(self, days: int = 7) -> List[Dict[str, Any]]:
        """Get task workload by day."""
        
        start_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = start_date + timedelta(days=days)
        
        pipeline = [
            {"$match": {
                "scheduled_date": {"$gte": start_date, "$lt": end_date}
            }},
            {"$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$scheduled_date"}
                },
                "total": {"$sum": 1},
                "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                "overdue": {"$sum": {"$cond": [{"$eq": ["$status", "overdue"]}, 1, 0]}}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        results = []
        async for doc in self.task_instances.aggregate(pipeline):
            results.append({
                "date": doc["_id"],
                "total": doc["total"],
                "completed": doc["completed"],
                "overdue": doc["overdue"],
                "pending": doc["total"] - doc["completed"] - doc["overdue"]
            })
        
        return results
    
    # ==================== DETECTION EFFECTIVENESS ====================
    
    async def get_detection_effectiveness(self) -> Dict[str, Any]:
        """Analyze how effective tasks are at detecting issues."""
        
        # Get task templates with their detection rates
        pipeline = [
            {"$match": {"status": "completed"}},
            {"$group": {
                "_id": "$task_template_id",
                "template_name": {"$first": "$task_template_name"},
                "total_executions": {"$sum": 1},
                "with_issues": {"$sum": {"$cond": [{"$gt": [{"$size": {"$ifNull": ["$issues_found", []]}}, 0]}, 1, 0]}}
            }},
            {"$addFields": {
                "detection_rate": {
                    "$cond": [
                        {"$gt": ["$total_executions", 0]},
                        {"$multiply": [{"$divide": ["$with_issues", "$total_executions"]}, 100]},
                        0
                    ]
                }
            }},
            {"$sort": {"detection_rate": -1}},
            {"$limit": 20}
        ]
        
        effective_tasks = []
        ineffective_tasks = []
        
        async for doc in self.task_instances.aggregate(pipeline):
            item = {
                "template_id": doc["_id"],
                "template_name": doc.get("template_name", "Unknown"),
                "executions": doc["total_executions"],
                "issues_found": doc["with_issues"],
                "detection_rate": round(doc["detection_rate"], 1)
            }
            
            if doc["detection_rate"] >= 20:
                effective_tasks.append(item)
            elif doc["total_executions"] >= 5:  # Only include if enough data
                ineffective_tasks.append(item)
        
        return {
            "effective_tasks": effective_tasks[:10],
            "ineffective_tasks": sorted(ineffective_tasks, key=lambda x: x["detection_rate"])[:10]
        }
    
    # ==================== EQUIPMENT ANALYTICS ====================
    
    async def get_equipment_risk_ranking(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Rank equipment by aggregated risk."""
        
        pipeline = [
            {"$match": {"is_active": True}},
            {"$addFields": {
                "rpn": {"$multiply": ["$severity", "$likelihood", "$detectability"]}
            }},
            {"$group": {
                "_id": "$equipment_id",
                "equipment_name": {"$first": "$equipment_name"},
                "total_efms": {"$sum": 1},
                "max_rpn": {"$max": "$rpn"},
                "avg_rpn": {"$avg": "$rpn"},
                "total_observations": {"$sum": "$observations_count"}
            }},
            {"$sort": {"max_rpn": -1}},
            {"$limit": limit}
        ]
        
        results = []
        async for doc in self.efms.aggregate(pipeline):
            results.append({
                "equipment_id": doc["_id"],
                "equipment_name": doc.get("equipment_name", "Unknown"),
                "total_efms": doc["total_efms"],
                "max_rpn": doc["max_rpn"],
                "avg_rpn": round(doc["avg_rpn"], 1),
                "total_observations": doc["total_observations"]
            })
        
        return results
    
    async def get_under_controlled_risks(self) -> List[Dict[str, Any]]:
        """Find high-risk EFMs without adequate task coverage."""
        
        # Get high-risk EFMs
        efm_pipeline = [
            {"$match": {"is_active": True}},
            {"$addFields": {
                "rpn": {"$multiply": ["$severity", "$likelihood", "$detectability"]}
            }},
            {"$match": {"rpn": {"$gte": 150}}},
            {"$project": {
                "equipment_id": 1,
                "equipment_name": 1,
                "failure_mode_name": 1,
                "rpn": 1
            }}
        ]
        
        under_controlled = []
        
        async for efm in self.efms.aggregate(efm_pipeline):
            # Check if there's a task plan for this equipment
            task_plan_count = await self.task_plans.count_documents({
                "equipment_id": efm.get("equipment_id"),
                "is_active": True
            })
            
            if task_plan_count == 0:
                under_controlled.append({
                    "efm_id": str(efm["_id"]),
                    "equipment_id": efm.get("equipment_id"),
                    "equipment_name": efm.get("equipment_name"),
                    "failure_mode": efm.get("failure_mode_name"),
                    "rpn": efm.get("rpn"),
                    "task_plans": 0,
                    "recommendation": "Consider adding a preventive/predictive task"
                })
        
        return sorted(under_controlled, key=lambda x: x["rpn"], reverse=True)[:20]
    
    async def get_over_maintained_assets(self) -> List[Dict[str, Any]]:
        """Find equipment with excessive task frequency relative to risk."""
        
        # Get equipment with task plans
        pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {
                "_id": "$equipment_id",
                "equipment_name": {"$first": "$equipment_name"},
                "task_count": {"$sum": 1},
                "total_interval_days": {"$sum": {
                    "$switch": {
                        "branches": [
                            {"case": {"$eq": ["$interval_unit", "days"]}, "then": "$interval_value"},
                            {"case": {"$eq": ["$interval_unit", "weeks"]}, "then": {"$multiply": ["$interval_value", 7]}},
                            {"case": {"$eq": ["$interval_unit", "months"]}, "then": {"$multiply": ["$interval_value", 30]}}
                        ],
                        "default": "$interval_value"
                    }
                }}
            }}
        ]
        
        over_maintained = []
        
        async for plan_group in self.task_plans.aggregate(pipeline):
            equipment_id = plan_group["_id"]
            
            # Get max RPN for this equipment
            efm_result = await self.efms.aggregate([
                {"$match": {"equipment_id": equipment_id, "is_active": True}},
                {"$addFields": {"rpn": {"$multiply": ["$severity", "$likelihood", "$detectability"]}}},
                {"$group": {"_id": None, "max_rpn": {"$max": "$rpn"}}}
            ]).to_list(1)
            
            max_rpn = efm_result[0]["max_rpn"] if efm_result else 0
            
            # If low risk but high task frequency
            if max_rpn < 100 and plan_group["task_count"] >= 3:
                avg_interval = plan_group["total_interval_days"] / plan_group["task_count"]
                if avg_interval < 30:  # More than monthly on average
                    over_maintained.append({
                        "equipment_id": equipment_id,
                        "equipment_name": plan_group.get("equipment_name"),
                        "task_count": plan_group["task_count"],
                        "avg_interval_days": round(avg_interval, 1),
                        "max_rpn": max_rpn,
                        "recommendation": "Consider reducing task frequency"
                    })
        
        return over_maintained
    
    # ==================== FORM ANALYTICS ====================
    
    async def get_form_threshold_summary(self, days: int = 30) -> Dict[str, Any]:
        """Summary of form submissions with threshold breaches."""
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        pipeline = [
            {"$match": {"submitted_at": {"$gte": start_date}}},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "with_warnings": {"$sum": {"$cond": ["$has_warnings", 1, 0]}},
                "with_critical": {"$sum": {"$cond": ["$has_critical", 1, 0]}},
                "with_failures": {"$sum": {"$cond": ["$has_failures", 1, 0]}}
            }}
        ]
        
        result = await self.form_submissions.aggregate(pipeline).to_list(1)
        
        if result:
            r = result[0]
            return {
                "period_days": days,
                "total_submissions": r["total"],
                "with_warnings": r["with_warnings"],
                "with_critical": r["with_critical"],
                "with_failures": r["with_failures"],
                "warning_rate": round(r["with_warnings"] / r["total"] * 100, 1) if r["total"] > 0 else 0,
                "critical_rate": round(r["with_critical"] / r["total"] * 100, 1) if r["total"] > 0 else 0
            }
        
        return {
            "period_days": days,
            "total_submissions": 0,
            "with_warnings": 0,
            "with_critical": 0,
            "with_failures": 0,
            "warning_rate": 0,
            "critical_rate": 0
        }
    
    # ==================== COMPREHENSIVE DASHBOARD ====================
    
    async def get_full_dashboard(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get comprehensive analytics dashboard."""
        
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "risk_overview": await self.get_risk_overview(user_id),
            "top_risks": await self.get_top_risks(10),
            "task_compliance": await self.get_task_compliance(30),
            "task_workload": await self.get_task_workload(7),
            "failure_mode_pareto": await self.get_failure_mode_pareto(10),
            "detection_effectiveness": await self.get_detection_effectiveness(),
            "equipment_risk_ranking": await self.get_equipment_risk_ranking(10),
            "form_summary": await self.get_form_threshold_summary(30)
        }
