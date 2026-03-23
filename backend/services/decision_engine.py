"""
Decision Engine Service - Closed-loop learning rules for reliability improvement.

Implements automated rules from the functional spec:
1. Frequency Adjustment: If observation frequency increases → increase task frequency
2. Detection Gap: If failure occurs without prior detection → create new detection task
3. Unknown Failure: If observation not linked to FM → suggest new failure mode
4. Likelihood Update: Increase EFM likelihood based on observations
5. Threshold Breach: Auto-create observation (handled in Form Service)

Each rule can be enabled/disabled and configured per equipment or globally.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


class DecisionEngine:
    """Automated decision engine for reliability improvement."""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.rules = db["decision_rules"]
        self.rule_executions = db["rule_executions"]
        self.observations = db["observations"]
        self.efms = db["equipment_failure_modes"]
        self.failure_modes = db["failure_modes"]
        self.task_plans = db["task_plans"]
        self.task_templates = db["task_templates"]
        self.equipment = db["equipment_nodes"]
        self.suggestions = db["decision_suggestions"]
    
    # ==================== RULE DEFINITIONS ====================
    
    DEFAULT_RULES = [
        {
            "rule_id": "frequency_adjustment",
            "name": "Task Frequency Adjustment",
            "description": "Automatically adjust task frequency when observation rate increases",
            "category": "task_optimization",
            "trigger_type": "observation_threshold",
            "config": {
                "observation_window_days": 30,
                "min_observations": 3,
                "frequency_increase_factor": 1.5,
                "max_frequency_multiplier": 4.0
            },
            "is_enabled": True,
            "auto_execute": False,  # Requires approval
        },
        {
            "rule_id": "detection_gap",
            "name": "Detection Gap Task Creation",
            "description": "Create new detection task when failure occurs without prior warning",
            "category": "task_creation",
            "trigger_type": "undetected_failure",
            "config": {
                "lookback_days": 7,
                "severity_threshold": "high"
            },
            "is_enabled": True,
            "auto_execute": False,
        },
        {
            "rule_id": "likelihood_update",
            "name": "EFM Likelihood Update",
            "description": "Increase EFM likelihood score based on observation frequency",
            "category": "risk_update",
            "trigger_type": "observation_frequency",
            "config": {
                "observation_window_days": 90,
                "likelihood_increase_per_observation": 0.5,
                "max_likelihood": 10
            },
            "is_enabled": True,
            "auto_execute": True,  # Automatic
        },
        {
            "rule_id": "new_failure_mode_suggestion",
            "name": "New Failure Mode Suggestion",
            "description": "Suggest creating new failure mode for unlinked observations",
            "category": "library_enhancement",
            "trigger_type": "unlinked_observation",
            "config": {
                "min_similar_observations": 2,
                "similarity_window_days": 90
            },
            "is_enabled": True,
            "auto_execute": False,
        },
        {
            "rule_id": "task_effectiveness_review",
            "name": "Task Effectiveness Review",
            "description": "Flag tasks that haven't detected issues despite high observation rate",
            "category": "task_optimization",
            "trigger_type": "ineffective_task",
            "config": {
                "review_window_days": 180,
                "min_task_executions": 5,
                "observation_ratio_threshold": 0.3
            },
            "is_enabled": True,
            "auto_execute": False,
        },
    ]
    
    async def initialize_rules(self):
        """Initialize default rules if not present."""
        for rule in self.DEFAULT_RULES:
            existing = await self.rules.find_one({"rule_id": rule["rule_id"]})
            if not existing:
                rule["created_at"] = datetime.now(timezone.utc)
                rule["updated_at"] = datetime.now(timezone.utc)
                await self.rules.insert_one(rule)
                logger.info(f"Initialized rule: {rule['rule_id']}")
    
    async def get_rules(self, enabled_only: bool = False) -> List[Dict[str, Any]]:
        """Get all decision rules."""
        query = {"is_enabled": True} if enabled_only else {}
        cursor = self.rules.find(query)
        
        rules = []
        async for doc in cursor:
            rules.append(self._serialize_rule(doc))
        
        return rules
    
    async def update_rule(self, rule_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a rule's configuration."""
        allowed = ["is_enabled", "auto_execute", "config"]
        update_doc = {"updated_at": datetime.now(timezone.utc)}
        
        for key in allowed:
            if key in updates:
                update_doc[key] = updates[key]
        
        result = await self.rules.find_one_and_update(
            {"rule_id": rule_id},
            {"$set": update_doc},
            return_document=True
        )
        
        if result:
            return self._serialize_rule(result)
        return None
    
    # ==================== RULE EXECUTION ====================
    
    async def evaluate_all_rules(self, user_id: str) -> Dict[str, Any]:
        """Evaluate all enabled rules and generate suggestions."""
        await self.initialize_rules()
        
        results = {
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
            "rules_evaluated": 0,
            "suggestions_generated": 0,
            "auto_executed": 0,
            "details": []
        }
        
        rules = await self.get_rules(enabled_only=True)
        
        for rule in rules:
            try:
                rule_result = await self._evaluate_rule(rule, user_id)
                results["rules_evaluated"] += 1
                results["suggestions_generated"] += rule_result.get("suggestions", 0)
                results["auto_executed"] += rule_result.get("auto_executed", 0)
                results["details"].append({
                    "rule_id": rule["rule_id"],
                    "name": rule["name"],
                    **rule_result
                })
            except Exception as e:
                logger.error(f"Error evaluating rule {rule['rule_id']}: {e}")
                results["details"].append({
                    "rule_id": rule["rule_id"],
                    "error": str(e)
                })
        
        return results
    
    async def _evaluate_rule(self, rule: Dict, user_id: str) -> Dict[str, Any]:
        """Evaluate a single rule."""
        rule_id = rule["rule_id"]
        
        if rule_id == "frequency_adjustment":
            return await self._evaluate_frequency_adjustment(rule, user_id)
        elif rule_id == "detection_gap":
            return await self._evaluate_detection_gap(rule, user_id)
        elif rule_id == "likelihood_update":
            return await self._evaluate_likelihood_update(rule, user_id)
        elif rule_id == "new_failure_mode_suggestion":
            return await self._evaluate_new_fm_suggestion(rule, user_id)
        elif rule_id == "task_effectiveness_review":
            return await self._evaluate_task_effectiveness(rule, user_id)
        
        return {"status": "unknown_rule", "suggestions": 0, "auto_executed": 0}
    
    async def _evaluate_frequency_adjustment(self, rule: Dict, user_id: str) -> Dict[str, Any]:
        """
        Rule: If observation frequency increases for an EFM, suggest increasing task frequency.
        """
        config = rule.get("config", {})
        window_days = config.get("observation_window_days", 30)
        min_observations = config.get("min_observations", 3)
        increase_factor = config.get("frequency_increase_factor", 1.5)
        
        start_date = datetime.now(timezone.utc) - timedelta(days=window_days)
        
        # Find EFMs with high observation counts
        pipeline = [
            {"$match": {
                "created_at": {"$gte": start_date},
                "efm_id": {"$exists": True, "$ne": None}
            }},
            {"$group": {
                "_id": "$efm_id",
                "count": {"$sum": 1},
                "equipment_id": {"$first": "$equipment_id"}
            }},
            {"$match": {"count": {"$gte": min_observations}}}
        ]
        
        suggestions_created = 0
        
        async for result in self.observations.aggregate(pipeline):
            obs_count = result["count"]
            equipment_id = result.get("equipment_id")
            
            # Check if there's a task plan for this equipment
            if equipment_id:
                plans = await self.task_plans.find({
                    "equipment_id": equipment_id,
                    "is_active": True
                }).to_list(10)
                
                for plan in plans:
                    # Create suggestion to increase frequency
                    suggestion = await self._create_suggestion(
                        rule_id=rule["rule_id"],
                        suggestion_type="increase_task_frequency",
                        target_type="task_plan",
                        target_id=str(plan["_id"]),
                        title=f"Increase task frequency for {plan.get('task_template_name', 'task')}",
                        description=f"High observation rate ({obs_count} in {window_days} days) suggests increasing inspection frequency by {increase_factor}x",
                        recommended_action={
                            "action": "update_interval",
                            "current_interval": plan.get("interval_value"),
                            "suggested_interval": max(1, int(plan.get("interval_value", 30) / increase_factor)),
                            "interval_unit": plan.get("interval_unit", "days")
                        },
                        priority="medium",
                        created_by=user_id
                    )
                    if suggestion:
                        suggestions_created += 1
        
        return {"status": "evaluated", "suggestions": suggestions_created, "auto_executed": 0}
    
    async def _evaluate_detection_gap(self, rule: Dict, user_id: str) -> Dict[str, Any]:
        """
        Rule: If a failure observation occurs without prior warning task, suggest creating detection task.
        """
        config = rule.get("config", {})
        lookback_days = config.get("lookback_days", 7)
        severity_threshold = config.get("severity_threshold", "high")
        
        start_date = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        
        # Find high-severity observations
        severity_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        min_severity = severity_order.get(severity_threshold, 3)
        
        observations = await self.observations.find({
            "created_at": {"$gte": start_date},
            "equipment_id": {"$exists": True, "$ne": None},
            "severity": {"$in": [s for s, v in severity_order.items() if v >= min_severity]}
        }).to_list(100)
        
        suggestions_created = 0
        
        for obs in observations:
            equipment_id = obs.get("equipment_id")
            
            # Check if there was a task execution before this observation
            task_count = await self.db.task_instances.count_documents({
                "equipment_id": equipment_id,
                "status": "completed",
                "completed_at": {
                    "$gte": start_date,
                    "$lt": obs.get("created_at")
                }
            })
            
            if task_count == 0:
                # No prior task execution - detection gap
                suggestion = await self._create_suggestion(
                    rule_id=rule["rule_id"],
                    suggestion_type="create_detection_task",
                    target_type="equipment",
                    target_id=equipment_id,
                    title=f"Create detection task for {obs.get('equipment_name', 'equipment')}",
                    description=f"Failure detected without prior warning. Severity: {obs.get('severity')}. Consider adding a predictive/detective task.",
                    recommended_action={
                        "action": "create_task_template",
                        "equipment_id": equipment_id,
                        "suggested_discipline": "maintenance",
                        "suggested_strategy": "predictive",
                        "failure_mode_id": obs.get("failure_mode_id")
                    },
                    priority="high",
                    created_by=user_id
                )
                if suggestion:
                    suggestions_created += 1
        
        return {"status": "evaluated", "suggestions": suggestions_created, "auto_executed": 0}
    
    async def _evaluate_likelihood_update(self, rule: Dict, user_id: str) -> Dict[str, Any]:
        """
        Rule: Auto-update EFM likelihood based on observation frequency.
        """
        config = rule.get("config", {})
        window_days = config.get("observation_window_days", 90)
        increase_per_obs = config.get("likelihood_increase_per_observation", 0.5)
        max_likelihood = config.get("max_likelihood", 10)
        
        start_date = datetime.now(timezone.utc) - timedelta(days=window_days)
        
        # Get observation counts per EFM
        pipeline = [
            {"$match": {
                "created_at": {"$gte": start_date},
                "efm_id": {"$exists": True, "$ne": None}
            }},
            {"$group": {
                "_id": "$efm_id",
                "count": {"$sum": 1}
            }}
        ]
        
        auto_executed = 0
        
        async for result in self.observations.aggregate(pipeline):
            efm_id = result["_id"]
            obs_count = result["count"]
            
            if not ObjectId.is_valid(efm_id):
                continue
            
            # Get current EFM
            efm = await self.efms.find_one({"_id": ObjectId(efm_id)})
            if not efm:
                continue
            
            # Calculate new likelihood
            current_likelihood = efm.get("likelihood", 5)
            new_likelihood = min(
                max_likelihood,
                current_likelihood + (obs_count * increase_per_obs)
            )
            
            if new_likelihood > current_likelihood and rule.get("auto_execute"):
                # Auto-update likelihood
                await self.efms.update_one(
                    {"_id": ObjectId(efm_id)},
                    {"$set": {
                        "likelihood": int(new_likelihood),
                        "is_override": True,
                        "override_reason": f"Auto-adjusted by Decision Engine based on {obs_count} observations",
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )
                
                # Log the execution
                await self._log_execution(
                    rule_id=rule["rule_id"],
                    action="auto_update_likelihood",
                    target_type="efm",
                    target_id=efm_id,
                    details={
                        "old_likelihood": current_likelihood,
                        "new_likelihood": int(new_likelihood),
                        "observation_count": obs_count
                    },
                    executed_by="system"
                )
                auto_executed += 1
        
        return {"status": "evaluated", "suggestions": 0, "auto_executed": auto_executed}
    
    async def _evaluate_new_fm_suggestion(self, rule: Dict, user_id: str) -> Dict[str, Any]:
        """
        Rule: Suggest creating new failure mode for recurring unlinked observations.
        """
        config = rule.get("config", {})
        min_similar = config.get("min_similar_observations", 2)
        window_days = config.get("similarity_window_days", 90)
        
        start_date = datetime.now(timezone.utc) - timedelta(days=window_days)
        
        # Find unlinked observations
        unlinked = await self.observations.find({
            "created_at": {"$gte": start_date},
            "failure_mode_id": None,
            "status": {"$ne": "closed"}
        }).to_list(100)
        
        # Group by equipment and keywords
        groups = {}
        for obs in unlinked:
            equip_id = obs.get("equipment_id", "unknown")
            # Extract keywords from description
            desc = obs.get("description", "").lower()
            keywords = set(desc.split())
            
            key = f"{equip_id}"
            if key not in groups:
                groups[key] = []
            groups[key].append({"obs": obs, "keywords": keywords})
        
        suggestions_created = 0
        
        for key, items in groups.items():
            if len(items) >= min_similar:
                # Check for common keywords
                common_keywords = set.intersection(*[i["keywords"] for i in items])
                
                if len(common_keywords) >= 2:  # At least 2 common keywords
                    first_obs = items[0]["obs"]
                    suggestion = await self._create_suggestion(
                        rule_id=rule["rule_id"],
                        suggestion_type="create_failure_mode",
                        target_type="failure_mode_library",
                        target_id=None,
                        title="Consider new failure mode for recurring issue",
                        description=f"{len(items)} similar unlinked observations found. Common keywords: {', '.join(list(common_keywords)[:5])}",
                        recommended_action={
                            "action": "create_failure_mode",
                            "suggested_keywords": list(common_keywords)[:10],
                            "equipment_id": first_obs.get("equipment_id"),
                            "sample_description": first_obs.get("description", "")[:200]
                        },
                        priority="low",
                        created_by=user_id
                    )
                    if suggestion:
                        suggestions_created += 1
        
        return {"status": "evaluated", "suggestions": suggestions_created, "auto_executed": 0}
    
    async def _evaluate_task_effectiveness(self, rule: Dict, user_id: str) -> Dict[str, Any]:
        """
        Rule: Flag tasks that aren't detecting issues despite equipment having high observation rate.
        """
        config = rule.get("config", {})
        window_days = config.get("review_window_days", 180)
        min_executions = config.get("min_task_executions", 5)
        obs_ratio = config.get("observation_ratio_threshold", 0.3)
        
        start_date = datetime.now(timezone.utc) - timedelta(days=window_days)
        
        # Get task plans with enough executions
        plans = await self.task_plans.find({
            "is_active": True,
            "execution_count": {"$gte": min_executions}
        }).to_list(100)
        
        suggestions_created = 0
        
        for plan in plans:
            equipment_id = plan.get("equipment_id")
            
            # Count observations for this equipment
            obs_count = await self.observations.count_documents({
                "equipment_id": equipment_id,
                "created_at": {"$gte": start_date}
            })
            
            # Count task executions that found issues
            issues_found = await self.db.task_instances.count_documents({
                "task_plan_id": str(plan["_id"]),
                "status": "completed",
                "completed_at": {"$gte": start_date},
                "issues_found": {"$exists": True, "$ne": []}
            })
            
            total_executions = plan.get("execution_count", 0)
            
            if total_executions > 0 and obs_count > 0:
                detection_rate = issues_found / total_executions
                obs_per_execution = obs_count / total_executions
                
                # If observation rate is high but detection rate is low
                if obs_per_execution > obs_ratio and detection_rate < 0.1:
                    suggestion = await self._create_suggestion(
                        rule_id=rule["rule_id"],
                        suggestion_type="review_task_effectiveness",
                        target_type="task_plan",
                        target_id=str(plan["_id"]),
                        title=f"Review effectiveness of {plan.get('task_template_name', 'task')}",
                        description=f"Task has low detection rate ({detection_rate:.1%}) despite {obs_count} observations on equipment. Consider revising inspection criteria.",
                        recommended_action={
                            "action": "review_task",
                            "total_executions": total_executions,
                            "issues_detected": issues_found,
                            "observations_on_equipment": obs_count,
                            "detection_rate": detection_rate
                        },
                        priority="medium",
                        created_by=user_id
                    )
                    if suggestion:
                        suggestions_created += 1
        
        return {"status": "evaluated", "suggestions": suggestions_created, "auto_executed": 0}
    
    # ==================== SUGGESTIONS ====================
    
    async def _create_suggestion(
        self,
        rule_id: str,
        suggestion_type: str,
        target_type: str,
        target_id: Optional[str],
        title: str,
        description: str,
        recommended_action: Dict,
        priority: str,
        created_by: str
    ) -> Optional[Dict[str, Any]]:
        """Create a suggestion from rule evaluation."""
        
        # Check for duplicate suggestion
        existing = await self.suggestions.find_one({
            "rule_id": rule_id,
            "target_type": target_type,
            "target_id": target_id,
            "status": {"$in": ["pending", "approved"]}
        })
        
        if existing:
            return None  # Don't create duplicate
        
        now = datetime.now(timezone.utc)
        doc = {
            "rule_id": rule_id,
            "suggestion_type": suggestion_type,
            "target_type": target_type,
            "target_id": target_id,
            "title": title,
            "description": description,
            "recommended_action": recommended_action,
            "priority": priority,
            "status": "pending",  # pending, approved, rejected, executed
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        
        result = await self.suggestions.insert_one(doc)
        doc["_id"] = result.inserted_id
        
        return self._serialize_suggestion(doc)
    
    async def get_suggestions(
        self,
        status: Optional[str] = None,
        rule_id: Optional[str] = None,
        priority: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> Dict[str, Any]:
        """Get decision suggestions."""
        query = {}
        
        if status:
            query["status"] = status
        if rule_id:
            query["rule_id"] = rule_id
        if priority:
            query["priority"] = priority
        
        cursor = self.suggestions.find(query).sort("created_at", -1).skip(skip).limit(limit)
        
        suggestions = []
        async for doc in cursor:
            suggestions.append(self._serialize_suggestion(doc))
        
        total = await self.suggestions.count_documents(query)
        
        return {"total": total, "suggestions": suggestions}
    
    async def approve_suggestion(
        self,
        suggestion_id: str,
        approved_by: str,
        notes: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Approve a suggestion for execution."""
        if not ObjectId.is_valid(suggestion_id):
            return None
        
        result = await self.suggestions.find_one_and_update(
            {"_id": ObjectId(suggestion_id), "status": "pending"},
            {"$set": {
                "status": "approved",
                "approved_by": approved_by,
                "approved_at": datetime.now(timezone.utc),
                "approval_notes": notes,
                "updated_at": datetime.now(timezone.utc)
            }},
            return_document=True
        )
        
        if result:
            return self._serialize_suggestion(result)
        return None
    
    async def reject_suggestion(
        self,
        suggestion_id: str,
        rejected_by: str,
        reason: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Reject a suggestion."""
        if not ObjectId.is_valid(suggestion_id):
            return None
        
        result = await self.suggestions.find_one_and_update(
            {"_id": ObjectId(suggestion_id), "status": "pending"},
            {"$set": {
                "status": "rejected",
                "rejected_by": rejected_by,
                "rejected_at": datetime.now(timezone.utc),
                "rejection_reason": reason,
                "updated_at": datetime.now(timezone.utc)
            }},
            return_document=True
        )
        
        if result:
            return self._serialize_suggestion(result)
        return None
    
    async def execute_suggestion(
        self,
        suggestion_id: str,
        executed_by: str
    ) -> Dict[str, Any]:
        """Execute an approved suggestion."""
        if not ObjectId.is_valid(suggestion_id):
            raise ValueError("Invalid suggestion ID")
        
        suggestion = await self.suggestions.find_one({"_id": ObjectId(suggestion_id)})
        if not suggestion:
            raise ValueError("Suggestion not found")
        
        if suggestion.get("status") != "approved":
            raise ValueError("Suggestion must be approved before execution")
        
        action = suggestion.get("recommended_action", {})
        action_type = action.get("action")
        result = {"executed": False, "details": {}}
        
        try:
            if action_type == "update_interval":
                # Update task plan interval
                target_id = suggestion.get("target_id")
                new_interval = action.get("suggested_interval")
                
                await self.task_plans.update_one(
                    {"_id": ObjectId(target_id)},
                    {"$set": {
                        "interval_value": new_interval,
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )
                result["executed"] = True
                result["details"] = {"new_interval": new_interval}
            
            # Mark suggestion as executed
            await self.suggestions.update_one(
                {"_id": ObjectId(suggestion_id)},
                {"$set": {
                    "status": "executed",
                    "executed_by": executed_by,
                    "executed_at": datetime.now(timezone.utc),
                    "execution_result": result,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            
            # Log execution
            await self._log_execution(
                rule_id=suggestion.get("rule_id"),
                action=action_type,
                target_type=suggestion.get("target_type"),
                target_id=suggestion.get("target_id"),
                details=result,
                executed_by=executed_by
            )
            
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Error executing suggestion {suggestion_id}: {e}")
        
        return result
    
    async def _log_execution(
        self,
        rule_id: str,
        action: str,
        target_type: str,
        target_id: str,
        details: Dict,
        executed_by: str
    ):
        """Log a rule execution."""
        await self.rule_executions.insert_one({
            "rule_id": rule_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details,
            "executed_by": executed_by,
            "executed_at": datetime.now(timezone.utc)
        })
    
    # ==================== DASHBOARD ====================
    
    async def get_decision_dashboard(self) -> Dict[str, Any]:
        """Get dashboard stats for decision engine."""
        
        # Suggestion counts
        pending = await self.suggestions.count_documents({"status": "pending"})
        approved = await self.suggestions.count_documents({"status": "approved"})
        executed = await self.suggestions.count_documents({"status": "executed"})
        
        # By priority
        high_priority = await self.suggestions.count_documents({
            "status": "pending",
            "priority": "high"
        })
        
        # Recent executions
        recent_executions = await self.rule_executions.find({}).sort("executed_at", -1).limit(10).to_list(10)
        
        # Rules status
        rules = await self.get_rules()
        enabled_rules = sum(1 for r in rules if r.get("is_enabled"))
        auto_rules = sum(1 for r in rules if r.get("auto_execute"))
        
        return {
            "suggestions": {
                "pending": pending,
                "approved": approved,
                "executed": executed,
                "high_priority": high_priority
            },
            "rules": {
                "total": len(rules),
                "enabled": enabled_rules,
                "auto_execute": auto_rules
            },
            "recent_executions": [
                {
                    "rule_id": e.get("rule_id"),
                    "action": e.get("action"),
                    "target_type": e.get("target_type"),
                    "executed_at": e.get("executed_at").isoformat() if e.get("executed_at") else None
                }
                for e in recent_executions
            ]
        }
    
    # ==================== HELPERS ====================
    
    def _serialize_rule(self, doc: Dict) -> Dict[str, Any]:
        """Serialize rule document."""
        return {
            "id": str(doc.get("_id", "")),
            "rule_id": doc["rule_id"],
            "name": doc["name"],
            "description": doc.get("description"),
            "category": doc.get("category"),
            "trigger_type": doc.get("trigger_type"),
            "config": doc.get("config", {}),
            "is_enabled": doc.get("is_enabled", False),
            "auto_execute": doc.get("auto_execute", False),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
            "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None,
        }
    
    def _serialize_suggestion(self, doc: Dict) -> Dict[str, Any]:
        """Serialize suggestion document."""
        return {
            "id": str(doc["_id"]),
            "rule_id": doc["rule_id"],
            "suggestion_type": doc["suggestion_type"],
            "target_type": doc["target_type"],
            "target_id": doc.get("target_id"),
            "title": doc["title"],
            "description": doc["description"],
            "recommended_action": doc.get("recommended_action", {}),
            "priority": doc.get("priority", "medium"),
            "status": doc["status"],
            "created_by": doc.get("created_by"),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
            "approved_by": doc.get("approved_by"),
            "approved_at": doc.get("approved_at").isoformat() if doc.get("approved_at") else None,
            "rejected_by": doc.get("rejected_by"),
            "rejection_reason": doc.get("rejection_reason"),
            "executed_by": doc.get("executed_by"),
            "executed_at": doc.get("executed_at").isoformat() if doc.get("executed_at") else None,
        }
