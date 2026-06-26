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

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from services.decision_engine_evaluators import (
    evaluate_detection_gap as _evaluate_detection_gap,
    evaluate_frequency_adjustment as _evaluate_frequency_adjustment,
    evaluate_likelihood_update as _evaluate_likelihood_update,
    evaluate_task_effectiveness as _evaluate_task_effectiveness,
    evaluate_unknown_failure as _evaluate_unknown_failure,
)
from services.decision_engine_suggestions import (
    approve_suggestion as _approve_suggestion,
    create_suggestion as _create_suggestion,
    execute_suggestion as _execute_suggestion,
    get_suggestions as _get_suggestions,
    log_execution as _log_execution,
    reject_suggestion as _reject_suggestion,
    serialize_suggestion,
)

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
                "max_frequency_multiplier": 4.0,
            },
            "is_enabled": True,
            "auto_execute": False,
        },
        {
            "rule_id": "detection_gap",
            "name": "Detection Gap Task Creation",
            "description": "Create new detection task when failure occurs without prior warning",
            "category": "task_creation",
            "trigger_type": "undetected_failure",
            "config": {
                "lookback_days": 7,
                "severity_threshold": "high",
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
                "max_likelihood": 10,
            },
            "is_enabled": True,
            "auto_execute": True,
        },
        {
            "rule_id": "new_failure_mode_suggestion",
            "name": "New Failure Mode Suggestion",
            "description": "Suggest creating new failure mode for unlinked observations",
            "category": "library_enhancement",
            "trigger_type": "unlinked_observation",
            "config": {
                "min_similar_observations": 2,
                "similarity_window_days": 90,
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
                "observation_ratio_threshold": 0.3,
            },
            "is_enabled": True,
            "auto_execute": False,
        },
    ]

    def _bind_create_suggestion(self):
        suggestions = self.suggestions

        async def create_suggestion(**kwargs):
            return await _create_suggestion(suggestions=suggestions, **kwargs)

        return create_suggestion

    def _bind_log_execution(self):
        rule_executions = self.rule_executions

        async def log_execution(**kwargs):
            return await _log_execution(rule_executions=rule_executions, **kwargs)

        return log_execution

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
            return_document=True,
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
            "details": [],
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
                    **rule_result,
                })
            except Exception as e:
                logger.error(f"Error evaluating rule {rule['rule_id']}: {e}")
                results["details"].append({
                    "rule_id": rule["rule_id"],
                    "error": str(e),
                })

        return results

    async def _evaluate_rule(self, rule: Dict, user_id: str) -> Dict[str, Any]:
        """Evaluate a single rule."""
        rule_id = rule["rule_id"]
        create_suggestion = self._bind_create_suggestion()
        log_execution = self._bind_log_execution()

        if rule_id == "frequency_adjustment":
            return await _evaluate_frequency_adjustment(
                observations=self.observations,
                task_plans=self.task_plans,
                rule=rule,
                user_id=user_id,
                create_suggestion=create_suggestion,
            )
        if rule_id == "detection_gap":
            return await _evaluate_detection_gap(
                db=self.db,
                observations=self.observations,
                rule=rule,
                user_id=user_id,
                create_suggestion=create_suggestion,
            )
        if rule_id == "likelihood_update":
            return await _evaluate_likelihood_update(
                observations=self.observations,
                efms=self.efms,
                rule_executions=self.rule_executions,
                rule=rule,
                log_execution=log_execution,
            )
        if rule_id == "new_failure_mode_suggestion":
            return await _evaluate_unknown_failure(
                observations=self.observations,
                rule=rule,
                user_id=user_id,
                create_suggestion=create_suggestion,
            )
        if rule_id == "task_effectiveness_review":
            return await _evaluate_task_effectiveness(
                db=self.db,
                observations=self.observations,
                task_plans=self.task_plans,
                rule=rule,
                user_id=user_id,
                create_suggestion=create_suggestion,
            )

        return {"status": "unknown_rule", "suggestions": 0, "auto_executed": 0}

    # ==================== SUGGESTIONS ====================

    async def get_suggestions(
        self,
        status: Optional[str] = None,
        rule_id: Optional[str] = None,
        priority: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """Get decision suggestions."""
        return await _get_suggestions(
            suggestions=self.suggestions,
            status=status,
            rule_id=rule_id,
            priority=priority,
            skip=skip,
            limit=limit,
        )

    async def approve_suggestion(
        self,
        suggestion_id: str,
        approved_by: str,
        notes: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Approve a suggestion for execution."""
        return await _approve_suggestion(
            suggestions=self.suggestions,
            suggestion_id=suggestion_id,
            approved_by=approved_by,
            notes=notes,
        )

    async def reject_suggestion(
        self,
        suggestion_id: str,
        rejected_by: str,
        reason: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Reject a suggestion."""
        return await _reject_suggestion(
            suggestions=self.suggestions,
            suggestion_id=suggestion_id,
            rejected_by=rejected_by,
            reason=reason,
        )

    async def execute_suggestion(
        self,
        suggestion_id: str,
        executed_by: str,
    ) -> Dict[str, Any]:
        """Execute an approved suggestion."""
        return await _execute_suggestion(
            suggestions=self.suggestions,
            task_plans=self.task_plans,
            rule_executions=self.rule_executions,
            suggestion_id=suggestion_id,
            executed_by=executed_by,
        )

    # ==================== DASHBOARD ====================

    async def get_decision_dashboard(self) -> Dict[str, Any]:
        """Get dashboard stats for decision engine."""
        pending = await self.suggestions.count_documents({"status": "pending"})
        approved = await self.suggestions.count_documents({"status": "approved"})
        executed = await self.suggestions.count_documents({"status": "executed"})

        high_priority = await self.suggestions.count_documents({
            "status": "pending",
            "priority": "high",
        })

        recent_executions = await self.rule_executions.find({}).sort(
            "executed_at", -1
        ).limit(10).to_list(10)

        rules = await self.get_rules()
        enabled_rules = sum(1 for r in rules if r.get("is_enabled"))
        auto_rules = sum(1 for r in rules if r.get("auto_execute"))

        return {
            "suggestions": {
                "pending": pending,
                "approved": approved,
                "executed": executed,
                "high_priority": high_priority,
            },
            "rules": {
                "total": len(rules),
                "enabled": enabled_rules,
                "auto_execute": auto_rules,
            },
            "recent_executions": [
                {
                    "rule_id": e.get("rule_id"),
                    "action": e.get("action"),
                    "target_type": e.get("target_type"),
                    "executed_at": e.get("executed_at").isoformat() if e.get("executed_at") else None,
                }
                for e in recent_executions
            ],
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
        return serialize_suggestion(doc)
