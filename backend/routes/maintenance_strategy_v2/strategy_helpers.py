"""
Maintenance strategy v2 — shared helper functions.
"""
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
import uuid
import logging

from database import db
from models.maintenance_strategy_v2 import (
    CriticalityFrequency,
    CriticalityLevel,
    MaintenanceTaskTemplate,
    MaintenanceStrategyType,
    TaskFrequency,
    DetectionMethod,
)

logger = logging.getLogger(__name__)

def calculate_frequency_for_criticality(
    frequency_matrix: CriticalityFrequency,
    criticality: CriticalityLevel
) -> TaskFrequency:
    """Get the appropriate frequency based on criticality level"""
    if criticality == CriticalityLevel.LOW:
        return frequency_matrix.low
    elif criticality == CriticalityLevel.MEDIUM:
        return frequency_matrix.medium
    else:  # HIGH
        return frequency_matrix.high


async def get_failure_modes_for_equipment_type(equipment_type_id: str, equipment_type_name: str) -> List[Dict]:
    """Get all failure modes linked to an equipment type"""
    # Query failure modes from database
    query = {
        "$or": [
            {"equipment_type_ids": equipment_type_id},
            {"equipment_type": {"$regex": equipment_type_name, "$options": "i"}}
        ]
    }
    
    failure_modes = await db.failure_modes.find(query, {"_id": 0}).to_list(100)
    return failure_modes


def map_detection_methods(failure_mode: Dict) -> List[str]:
    """Map failure mode detection to detection methods"""
    detection = failure_mode.get("detection", "").lower()
    methods = []
    
    detection_mapping = {
        "vibration": DetectionMethod.VIBRATION,
        "temperature": DetectionMethod.TEMPERATURE,
        "pressure": DetectionMethod.PRESSURE,
        "visual": DetectionMethod.VISUAL,
        "oil": DetectionMethod.OIL_ANALYSIS,
        "thermograph": DetectionMethod.THERMOGRAPHY,
        "ultrasonic": DetectionMethod.ULTRASONIC,
        "acoustic": DetectionMethod.ACOUSTIC,
        "electrical": DetectionMethod.ELECTRICAL,
        "operator": DetectionMethod.OPERATOR_ROUNDS,
        "inspection": DetectionMethod.VISUAL,
        "monitoring": DetectionMethod.PROCESS,
    }
    
    for keyword, method in detection_mapping.items():
        if keyword in detection:
            methods.append(method.value)
    
    # Default to visual if no specific detection found
    if not methods:
        methods.append(DetectionMethod.VISUAL.value)
    
    return methods


def determine_strategy_type(failure_mode: Dict) -> MaintenanceStrategyType:
    """Determine recommended strategy type based on failure mode characteristics"""
    detection = failure_mode.get("detection", "").lower()
    severity = failure_mode.get("severity", 5)
    
    # High severity failures need predictive/condition-based
    if severity >= 8:
        if any(kw in detection for kw in ["vibration", "temperature", "oil", "thermograph"]):
            return MaintenanceStrategyType.PREDICTIVE
        return MaintenanceStrategyType.CONDITION_BASED
    
    # Medium severity - preventive with some condition monitoring
    if severity >= 5:
        if any(kw in detection for kw in ["vibration", "temperature"]):
            return MaintenanceStrategyType.CONDITION_BASED
        return MaintenanceStrategyType.PREVENTIVE
    
    # Low severity - can be reactive or basic preventive
    return MaintenanceStrategyType.PREVENTIVE


def determine_action_type_from_text(action_text: str, stored_action_type: str = "PM") -> str:
    """
    AI-enhanced logic to determine the correct action type based on action text content.
    This overrides the stored action_type if the text clearly indicates a different type.
    
    Returns: "PM", "PDM", or "CM"
    """
    action_lower = action_text.lower()
    
    # CM (Corrective/Reactive) indicators - actions taken AFTER failure
    cm_keywords = [
        "replace on failure", "repair", "fix", "restore", "rebuild", 
        "overhaul", "recondition", "refurbish", "emergency", "breakdown",
        "corrective", "reactive", "on failure", "when fail", "if fail",
        "after failure", "upon failure", "failure occurs", "has failed",
        "replace failed", "replace damaged", "replace worn", "remove debris",
        "clear blockage", "unplug", "reset", "restart after"
    ]
    
    # PDM (Predictive) indicators - condition monitoring, trending, analysis
    pdm_keywords = [
        "monitor", "analyze", "analysis", "trend", "measure", "check level",
        "vibration", "thermograph", "ultrasonic", "oil sample", "oil analysis",
        "infrared", "acoustic", "condition", "baseline", "benchmark",
        "track", "log reading", "record", "sample", "test result",
        "inspect for wear", "inspect for crack", "inspect for corrosion",
        "check for signs", "look for indication", "detect", "diagnose",
        "assess condition", "evaluate", "non-destructive", "ndt", "nde",
        "thickness measurement", "wear measurement", "temperature monitoring",
        "pressure monitoring", "flow monitoring", "continuous monitoring"
    ]
    
    # PM (Preventive) indicators - scheduled, time-based, routine
    pm_keywords = [
        "lubricate", "grease", "oil change", "replace filter", "clean",
        "tighten", "adjust", "calibrate", "align", "balance",
        "inspect", "visual inspection", "check", "verify", "ensure",
        "service", "maintain", "routine", "scheduled", "periodic",
        "preventive", "planned", "regular", "annual", "monthly", "weekly",
        "replace seal", "replace gasket", "replace belt", "replace bearing",
        "top up", "refill", "flush", "drain", "purge",
        "install", "upgrade", "improve", "modify", "protect", "coat",
        "paint", "apply", "treat", "preserve"
    ]
    
    # Count keyword matches
    cm_score = sum(1 for kw in cm_keywords if kw in action_lower)
    pdm_score = sum(1 for kw in pdm_keywords if kw in action_lower)
    pm_score = sum(1 for kw in pm_keywords if kw in action_lower)
    
    # Strong CM indicators override everything
    strong_cm_indicators = ["on failure", "after failure", "when fail", "replace on failure", 
                           "breakdown", "emergency", "corrective", "reactive"]
    if any(ind in action_lower for ind in strong_cm_indicators):
        return "CM"
    
    # Strong PDM indicators
    strong_pdm_indicators = ["monitor", "analysis", "trending", "vibration analysis", 
                            "oil analysis", "thermograph", "ultrasonic", "continuous monitoring",
                            "condition monitoring", "predictive"]
    if any(ind in action_lower for ind in strong_pdm_indicators):
        return "PDM"
    
    # If clear winner by score
    max_score = max(cm_score, pdm_score, pm_score)
    if max_score > 0:
        if cm_score == max_score and cm_score > pdm_score and cm_score > pm_score:
            return "CM"
        elif pdm_score == max_score and pdm_score > cm_score and pdm_score > pm_score:
            return "PDM"
        elif pm_score == max_score:
            return "PM"
    
    # Fall back to stored action type
    return stored_action_type


def generate_default_tasks_for_failure_mode(
    failure_mode: Dict,
    strategy_type: MaintenanceStrategyType,
    detection_methods: List[str]
) -> List[MaintenanceTaskTemplate]:
    """Generate default task templates based on failure mode and strategy"""
    tasks = []
    fm_name = failure_mode.get("failure_mode", failure_mode.get("name", "Unknown"))
    fm_id = failure_mode.get("id", str(uuid.uuid4()))
    
    # Recommended actions from failure mode
    recommended_actions = failure_mode.get("recommended_actions", [])
    
    for idx, action in enumerate(recommended_actions[:5]):  # Limit to 5 tasks per FM
        action_text = action.get("action", action) if isinstance(action, dict) else str(action)
        stored_action_type = action.get("action_type", "PM") if isinstance(action, dict) else "PM"
        discipline = action.get("discipline", None) if isinstance(action, dict) else None
        
        # Use AI-enhanced logic to determine correct action type
        determined_action_type = determine_action_type_from_text(action_text, stored_action_type)
        
        # Map to MaintenanceStrategyType
        if determined_action_type == "CM":
            task_type = MaintenanceStrategyType.REACTIVE
        elif determined_action_type == "PDM":
            task_type = MaintenanceStrategyType.PREDICTIVE
        else:
            task_type = MaintenanceStrategyType.PREVENTIVE
        
        # Set frequency based on task type and severity
        severity = failure_mode.get("severity", 5)
        if task_type == MaintenanceStrategyType.PREDICTIVE:
            freq_matrix = CriticalityFrequency(
                low=TaskFrequency.SEMI_ANNUAL,
                medium=TaskFrequency.QUARTERLY,
                high=TaskFrequency.MONTHLY
            )
        elif task_type == MaintenanceStrategyType.CONDITION_BASED:
            freq_matrix = CriticalityFrequency(
                low=TaskFrequency.QUARTERLY,
                medium=TaskFrequency.MONTHLY,
                high=TaskFrequency.WEEKLY
            )
        elif severity >= 8:
            freq_matrix = CriticalityFrequency(
                low=TaskFrequency.MONTHLY,
                medium=TaskFrequency.WEEKLY,
                high=TaskFrequency.DAILY
            )
        else:
            freq_matrix = CriticalityFrequency(
                low=TaskFrequency.QUARTERLY,
                medium=TaskFrequency.MONTHLY,
                high=TaskFrequency.WEEKLY
            )
        
        task = MaintenanceTaskTemplate(
            id=f"task_{fm_id}_{idx}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            name=action_text[:100] if len(action_text) > 100 else action_text,
            description=f"Task for: {fm_name}",
            task_type=task_type,
            frequency_matrix=freq_matrix,
            detection_methods=[DetectionMethod(m) for m in detection_methods if m in [e.value for e in DetectionMethod]],
            failure_mode_ids=[fm_id],
            discipline=discipline,
            source="template"
        )
        tasks.append(task)
    
    # If no recommended actions, create default inspection task
    if not tasks:
        default_freq = CriticalityFrequency(
            low=TaskFrequency.QUARTERLY,
            medium=TaskFrequency.MONTHLY,
            high=TaskFrequency.WEEKLY
        )
        
        task = MaintenanceTaskTemplate(
            id=f"task_{fm_id}_default_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            name=f"Inspect for {fm_name}",
            description=f"Inspection task for failure mode: {fm_name}",
            task_type=strategy_type,
            frequency_matrix=default_freq,
            detection_methods=[DetectionMethod(m) for m in detection_methods if m in [e.value for e in DetectionMethod]],
            failure_mode_ids=[fm_id],
            source="template"
        )
        tasks.append(task)
    
    return tasks


def _task_template_to_dict(task: Any) -> Dict[str, Any]:
    if hasattr(task, "model_dump"):
        return task.model_dump()
    return dict(task)


def refresh_failure_mode_strategy_from_library(
    library_fm: Dict[str, Any],
    fm_strategy: Dict[str, Any],
    task_templates: List[Dict[str, Any]],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]], int]:
    """
    Update strategy FM metadata and linked task template content from the library FM.
    Preserves existing task template IDs where possible so programs stay linked.
    """
    fm_id = fm_strategy.get("failure_mode_id") or library_fm.get("id")
    strategy_type_str = fm_strategy.get("strategy_type") or "preventive"
    try:
        strategy_type = MaintenanceStrategyType(strategy_type_str)
    except ValueError:
        strategy_type = determine_strategy_type(library_fm)

    detection_methods = fm_strategy.get("detection_methods") or map_detection_methods(library_fm)
    generated = generate_default_tasks_for_failure_mode(
        library_fm, strategy_type, detection_methods
    )
    generated_dicts = [_task_template_to_dict(t) for t in generated]

    by_id = {str(t.get("id")): t for t in task_templates if t.get("id")}
    old_ids = [str(tid) for tid in (fm_strategy.get("task_ids") or []) if tid]
    new_ids: List[str] = []
    refreshed = 0

    for i, gen in enumerate(generated_dicts):
        if gen.get("task_type") and hasattr(gen["task_type"], "value"):
            gen["task_type"] = gen["task_type"].value
        if gen.get("frequency_matrix") and hasattr(gen["frequency_matrix"], "model_dump"):
            gen["frequency_matrix"] = gen["frequency_matrix"].model_dump()

        if i < len(old_ids) and old_ids[i] in by_id:
            tid = old_ids[i]
            existing = by_id[tid]
            for key in (
                "name",
                "description",
                "task_type",
                "discipline",
                "detection_methods",
                "failure_mode_ids",
            ):
                if gen.get(key) is not None:
                    existing[key] = gen[key]
            if gen.get("frequency_matrix"):
                existing["frequency_matrix"] = gen["frequency_matrix"]
            new_ids.append(tid)
            refreshed += 1
        else:
            task_templates.append(gen)
            tid = str(gen.get("id"))
            if tid:
                by_id[tid] = gen
                new_ids.append(tid)
                refreshed += 1

    for extra_tid in old_ids[len(generated_dicts) :]:
        if extra_tid in by_id:
            task_templates[:] = [
                t for t in task_templates if str(t.get("id")) != extra_tid
            ]
            del by_id[extra_tid]

    fm_strategy["task_ids"] = new_ids
    fm_strategy["fm_version"] = library_fm.get("version") or 1
    updated_at = library_fm.get("updated_at")
    fm_strategy["fm_updated_at"] = str(updated_at) if updated_at else fm_strategy.get("fm_updated_at")

    potential_effects = library_fm.get("potential_effects", [])
    if isinstance(potential_effects, str):
        potential_effects = [potential_effects] if potential_effects else []
    fm_strategy["potential_effects"] = potential_effects

    severity = library_fm.get("severity", fm_strategy.get("severity", 5))
    occurrence = library_fm.get("occurrence", fm_strategy.get("occurrence", 5))
    detectability = library_fm.get("detectability", fm_strategy.get("detectability", 5))
    rpn = library_fm.get("rpn", severity * occurrence * detectability)
    fm_strategy["severity"] = severity
    fm_strategy["occurrence"] = occurrence
    fm_strategy["detectability"] = detectability
    fm_strategy["rpn"] = rpn

    if rpn >= 250:
        risk_level = "critical"
    elif rpn >= 180:
        risk_level = "high"
    elif rpn >= 100:
        risk_level = "medium"
    else:
        risk_level = "low"
    fm_strategy["risk_if_unaddressed"] = risk_level

    return fm_strategy, task_templates, refreshed


async def log_strategy_audit(
    action: str,
    equipment_type_id: str,
    user_id: str,
    details: Dict[str, Any] = None,
    entity_type: str = "equipment_type_strategy"
):
    """Log audit entry for maintenance strategy changes"""
    audit_entry = {
        "id": str(uuid.uuid4()),
        "entity_type": entity_type,
        "entity_id": equipment_type_id,
        "action": action,
        "user_id": user_id,
        "timestamp": datetime.utcnow().isoformat(),
        "details": details or {}
    }
    
    try:
        await db.maintenance_strategy_audit.insert_one(audit_entry)
    except Exception as e:
        logger.warning(f"Failed to log audit entry: {e}")


