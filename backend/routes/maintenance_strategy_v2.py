"""
Maintenance Strategy v2 Routes
Equipment Type Level Strategy Management with Task Generation
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import os

from database import db
from routes.auth import get_current_user
from models.maintenance_strategy_v2 import (
    EquipmentTypeStrategy,
    FailureModeStrategy,
    MaintenanceTaskTemplate,
    CriticalityFrequency,
    GeneratedTask,
    EquipmentStrategyInstance,
    CreateEquipmentTypeStrategyRequest,
    UpdateEquipmentTypeStrategyRequest,
    GenerateTasksRequest,
    UpdateFailureModeStrategyRequest,
    AddTaskTemplateRequest,
    RegenerateStrategyRequest,
    CriticalityLevel,
    MaintenanceStrategyType,
    TaskFrequency,
    DetectionMethod,
    TaskActivationState
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/maintenance-strategies-v2", tags=["Maintenance Strategies V2"])


# ============= Strategy → Program Propagation =============

_FREQUENCY_DAYS = {
    "continuous": 1, "daily": 1, "weekly": 7, "bi_weekly": 14,
    "monthly": 30, "quarterly": 90, "semi_annual": 180, "annual": 365,
    "biennial": 730, "on_condition": 30,
}


async def _propagate_task_template_to_programs(equipment_type_id: str, task_template: dict, new_strategy_version: str):
    """
    When a task template is added/edited on a strategy, propagate the changed
    fields to all maintenance_programs that reference it. Frequency is
    re-derived per-program based on each equipment's criticality.
    """
    task_template_id = task_template.get("id")
    if not task_template_id:
        return 0

    freq_matrix = task_template.get("frequency_matrix", {}) or {}
    now = datetime.now(timezone.utc).isoformat()

    # Find all programs that reference this task template
    programs = await db.maintenance_programs.find(
        {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id}
    ).to_list(5000)

    updated = 0
    for prog in programs:
        criticality = prog.get("criticality", "medium")
        frequency = freq_matrix.get(criticality, prog.get("frequency", "monthly"))
        freq_days = _FREQUENCY_DAYS.get(frequency, 30)

        set_fields = {
            "task_name": task_template.get("name", prog.get("task_name")),
            "task_description": task_template.get("description"),
            "task_type": task_template.get("task_type", prog.get("task_type")),
            "estimated_duration_hours": task_template.get("duration_hours", prog.get("estimated_duration_hours", 1.0)),
            "frequency": frequency,
            "frequency_days": freq_days,
            "discipline": task_template.get("discipline"),
            "skills_required": task_template.get("skills_required", []),
            "strategy_version": new_strategy_version,
            "updated_at": now,
        }
        result = await db.maintenance_programs.update_one(
            {"_id": prog["_id"]},
            {"$set": set_fields},
        )
        if result.modified_count > 0:
            updated += 1

    return updated


async def _deactivate_programs_for_task(equipment_type_id: str, task_template_id: str):
    """Mark all programs for this deleted task template as inactive."""
    now = datetime.now(timezone.utc).isoformat()
    result = await db.maintenance_programs.update_many(
        {"equipment_type_id": equipment_type_id, "task_template_id": task_template_id},
        {"$set": {"is_active": False, "updated_at": now}},
    )
    return result.modified_count


async def _toggle_programs_for_failure_mode(
    equipment_type_id: str,
    failure_mode_id: str,
    enabled: bool,
):
    """
    When a failure mode strategy is enabled/disabled, activate/deactivate
    all programs whose failure_mode_id matches.
    """
    now = datetime.now(timezone.utc).isoformat()
    result = await db.maintenance_programs.update_many(
        {
            "equipment_type_id": equipment_type_id,
            "failure_mode_id": failure_mode_id,
        },
        {"$set": {"is_active": enabled, "updated_at": now}},
    )
    return result.modified_count


def _bump_version(current_version: str) -> str:
    """Bump a semver-like 'major.minor' string. Defaults to 1.1 if unparseable."""
    try:
        major, minor = map(int, str(current_version).split("."))
        return f"{major}.{minor + 1}"
    except (ValueError, AttributeError):
        return "1.1"


async def _bump_strategy_version(
    strategy: dict,
    changes: list,
    user_id: Optional[str],
) -> str:
    """
    Increment the strategy version and append to version_history.
    Returns the new version string. The caller is responsible for $set'ing the
    new version on the strategy (it's bundled in the same update_one call).
    """
    new_version = _bump_version(strategy.get("version", "1.0"))
    now = datetime.now(timezone.utc).isoformat()
    entry = {
        "version": new_version,
        "updated_at": now,
        "updated_by": user_id,
        "changes": changes,
    }
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": strategy["equipment_type_id"]},
        {
            "$set": {"version": new_version, "updated_at": now},
            "$push": {"version_history": entry},
        },
    )
    return new_version


# ============= Helper Functions =============

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


# ============= Equipment Type Strategy Endpoints =============

@router.get("")
async def list_equipment_type_strategies(
    equipment_type_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all equipment type strategies"""
    query = {}
    
    if equipment_type_id:
        query["equipment_type_id"] = equipment_type_id
    if status:
        query["status"] = status
    
    strategies = await db.equipment_type_strategies.find(query, {"_id": 0}).to_list(500)
    
    # Apply search filter
    if search:
        search_lower = search.lower()
        strategies = [
            s for s in strategies
            if search_lower in s.get("equipment_type_name", "").lower()
            or search_lower in s.get("description", "").lower()
        ]
    
    return {
        "strategies": strategies,
        "total": len(strategies)
    }


@router.get("/{equipment_type_id}")
async def get_equipment_type_strategy(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get strategy for a specific equipment type"""
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0}
    )
    
    if not strategy:
        # Return empty response (not error) so UI can show "Create Strategy" button
        return {
            "strategy": None,
            "equipment_type_id": equipment_type_id,
            "exists": False
        }
    
    # Enrich failure mode strategies with potential_effects from library if missing
    # Also check for version updates
    fm_strategies = strategy.get("failure_mode_strategies", [])
    needs_update = False
    
    for fm_strategy in fm_strategies:
        fm_id = fm_strategy.get("failure_mode_id")
        fm_name = fm_strategy.get("failure_mode_name")
        
        # Search for the failure mode in the library
        library_fm = await db.failure_modes.find_one(
            {"$or": [
                {"id": fm_id},
                {"failure_mode": fm_name}
            ]},
            {"potential_effects": 1, "version": 1, "updated_at": 1, "_id": 0}
        )
        
        if library_fm:
            # Check if potential_effects is missing or empty
            if not fm_strategy.get("potential_effects") and library_fm.get("potential_effects"):
                fm_strategy["potential_effects"] = library_fm["potential_effects"]
                needs_update = True
            
            # Add current library version info for comparison
            library_version = library_fm.get("version") or 1
            library_updated_at = library_fm.get("updated_at")
            if library_updated_at:
                library_updated_at = str(library_updated_at)
            
            # Get strategy's FM version (handle None explicitly)
            strategy_fm_version = fm_strategy.get("fm_version")
            if strategy_fm_version is None:
                strategy_fm_version = 1
            
            # Add version info to the response
            fm_strategy["library_version"] = library_version
            fm_strategy["library_updated_at"] = library_updated_at
            fm_strategy["has_new_version"] = library_version > strategy_fm_version
            # Also set fm_version to 1 if it was None for display purposes
            if fm_strategy.get("fm_version") is None:
                fm_strategy["fm_version"] = 1
    
    # Calculate coverage based on active failure modes
    total_fms = len(fm_strategies)
    active_fms = sum(1 for fm in fm_strategies if fm.get("enabled", True))
    coverage_score = (active_fms / total_fms * 100) if total_fms > 0 else 0.0
    
    # Count failure modes with new versions available
    fms_with_updates = sum(1 for fm in fm_strategies if fm.get("has_new_version", False))
    strategy["failure_modes_with_updates"] = fms_with_updates
    
    # Update strategy stats
    strategy["active_failure_modes"] = active_fms
    strategy["coverage_score"] = round(coverage_score, 1)
    
    # Count affected equipment from hierarchy
    affected_equipment_count = await db.equipment_nodes.count_documents({
        "equipment_type_id": equipment_type_id
    })
    strategy["affected_equipment_count"] = affected_equipment_count
    
    # Optionally update the database with the enriched data
    if needs_update or strategy.get("active_failure_modes") != active_fms:
        await db.equipment_type_strategies.update_one(
            {"equipment_type_id": equipment_type_id},
            {"$set": {
                "failure_mode_strategies": fm_strategies,
                "active_failure_modes": active_fms,
                "coverage_score": round(coverage_score, 1)
            }}
        )
    
    return {
        "strategy": strategy,
        "equipment_type_id": equipment_type_id,
        "exists": True,
        "affected_equipment_count": affected_equipment_count
    }


@router.post("")
async def create_equipment_type_strategy(
    request: CreateEquipmentTypeStrategyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a new equipment type strategy"""
    # Check if strategy already exists
    existing = await db.equipment_type_strategies.find_one({
        "equipment_type_id": request.equipment_type_id
    })
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Strategy already exists for {request.equipment_type_name}"
        )
    
    # Get failure modes for this equipment type
    failure_modes = await get_failure_modes_for_equipment_type(
        request.equipment_type_id,
        request.equipment_type_name
    )
    
    # Build failure mode strategies and task templates
    fm_strategies = []
    all_tasks = []
    
    for fm in failure_modes:
        fm_id = fm.get("id", str(uuid.uuid4()))
        fm_name = fm.get("failure_mode", fm.get("name", "Unknown"))
        
        # Determine strategy type and detection methods
        detection_methods = map_detection_methods(fm)
        strategy_type = determine_strategy_type(fm)
        
        # Generate tasks for this failure mode
        tasks = generate_default_tasks_for_failure_mode(fm, strategy_type, detection_methods)
        all_tasks.extend(tasks)
        
        # Create failure mode strategy with RPN data
        severity = fm.get("severity", 5)
        occurrence = fm.get("occurrence", 5)
        detectability = fm.get("detectability", 5)
        rpn = fm.get("rpn", severity * occurrence * detectability)
        
        # Determine risk level from RPN
        if rpn >= 250:
            risk_level = "critical"
        elif rpn >= 180:
            risk_level = "high"
        elif rpn >= 100:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # Get potential effects from the failure mode
        potential_effects = fm.get("potential_effects", [])
        if isinstance(potential_effects, str):
            potential_effects = [potential_effects] if potential_effects else []
        
        # Get version info for tracking updates
        fm_version = fm.get("version", 1)
        fm_updated_at = fm.get("updated_at")
        if fm_updated_at:
            fm_updated_at = str(fm_updated_at)
        
        fm_strategy = FailureModeStrategy(
            failure_mode_id=fm_id,
            failure_mode_name=fm_name,
            potential_effects=potential_effects,
            fm_version=fm_version,
            fm_updated_at=fm_updated_at,
            strategy_type=strategy_type,
            detection_methods=[DetectionMethod(m) for m in detection_methods if m in [e.value for e in DetectionMethod]],
            task_ids=[t.id for t in tasks],
            severity=severity,
            occurrence=occurrence,
            detectability=detectability,
            rpn=rpn,
            risk_if_unaddressed=risk_level,
            enabled=True
        )
        fm_strategies.append(fm_strategy)
    
    # Create the strategy
    strategy = EquipmentTypeStrategy(
        id=str(uuid.uuid4()),
        equipment_type_id=request.equipment_type_id,
        equipment_type_name=request.equipment_type_name,
        description=request.description or f"Maintenance strategy for {request.equipment_type_name}",
        failure_mode_strategies=fm_strategies,
        task_templates=all_tasks,
        total_failure_modes=len(fm_strategies),
        total_tasks=len(all_tasks),
        coverage_score=100.0 if fm_strategies else 0.0,  # All FMs are enabled by default
        active_failure_modes=len(fm_strategies),  # Track active count
        created_by=current_user.get("user_id"),
        auto_generated=request.auto_generate,
        status="active"
    )
    
    strategy_dict = strategy.model_dump()
    await db.equipment_type_strategies.insert_one(strategy_dict)
    
    # Log audit
    await log_strategy_audit(
        action="create_strategy",
        equipment_type_id=request.equipment_type_id,
        user_id=current_user.get("user_id"),
        details={
            "equipment_type_name": request.equipment_type_name,
            "total_failure_modes": len(fm_strategies),
            "total_tasks": len(all_tasks),
            "auto_generated": request.auto_generate
        }
    )
    
    # Remove MongoDB _id
    strategy_dict.pop("_id", None)
    
    return strategy_dict


@router.patch("/{equipment_type_id}")
async def update_equipment_type_strategy(
    equipment_type_id: str,
    request: UpdateEquipmentTypeStrategyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update an equipment type strategy"""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    update_data = {"updated_at": datetime.utcnow().isoformat()}
    
    if request.description is not None:
        update_data["description"] = request.description
    
    if request.failure_mode_strategies is not None:
        update_data["failure_mode_strategies"] = [
            fm.model_dump() if hasattr(fm, 'model_dump') else fm 
            for fm in request.failure_mode_strategies
        ]
        update_data["total_failure_modes"] = len(request.failure_mode_strategies)
    
    if request.task_templates is not None:
        update_data["task_templates"] = [
            t.model_dump() if hasattr(t, 'model_dump') else t 
            for t in request.task_templates
        ]
        update_data["total_tasks"] = len(request.task_templates)
    
    if request.default_frequency_matrix is not None:
        update_data["default_frequency_matrix"] = request.default_frequency_matrix.model_dump()
    
    if request.status is not None:
        update_data["status"] = request.status
    
    # Increment version
    current_version = strategy.get("version", "1.0")
    try:
        major, minor = map(int, current_version.split("."))
        update_data["version"] = f"{major}.{minor + 1}"
    except (ValueError, AttributeError):
        update_data["version"] = "1.1"
    
    # Add to version history
    version_entry = {
        "version": update_data["version"],
        "updated_at": update_data["updated_at"],
        "updated_by": current_user.get("user_id"),
        "changes": list(update_data.keys())
    }
    
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": update_data,
            "$push": {"version_history": version_entry}
        }
    )
    
    updated = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0}
    )
    
    return updated


@router.delete("/{equipment_type_id}")
async def delete_equipment_type_strategy(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an equipment type strategy"""
    result = await db.equipment_type_strategies.delete_one({
        "equipment_type_id": equipment_type_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    # Log audit
    await log_strategy_audit(
        action="delete_strategy",
        equipment_type_id=equipment_type_id,
        user_id=current_user.get("user_id")
    )
    
    return {"message": "Strategy deleted", "equipment_type_id": equipment_type_id}


@router.post("/{equipment_type_id}/sync")
async def sync_equipment_type_strategy(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Sync strategy with library - adds new failure modes and tasks without overwriting existing ones.
    - Keeps all existing failure mode configurations
    - Keeps all existing task templates
    - Only adds NEW failure modes from the library
    - Only adds NEW tasks for the new failure modes
    - Updates version info for existing failure modes if they have been updated in library
    """
    # Get existing strategy
    existing_strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not existing_strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    equipment_type_name = existing_strategy.get("equipment_type_name", "")
    
    # Get all failure modes for this equipment type from library
    library_failure_modes = await get_failure_modes_for_equipment_type(
        equipment_type_id,
        equipment_type_name
    )
    
    # Get existing FM IDs and names for comparison
    existing_fm_strategies = existing_strategy.get("failure_mode_strategies", [])
    existing_fm_ids = {fm.get("failure_mode_id") for fm in existing_fm_strategies}
    existing_fm_names = {fm.get("failure_mode_name") for fm in existing_fm_strategies}
    existing_tasks = existing_strategy.get("task_templates", [])
    
    # Track what was added
    new_fm_strategies = []
    new_tasks = []
    updated_fms = []
    
    for fm in library_failure_modes:
        fm_id = fm.get("id", str(uuid.uuid4()))
        fm_name = fm.get("failure_mode", fm.get("name", "Unknown"))
        fm_version = fm.get("version", 1)
        fm_updated_at = fm.get("updated_at")
        if fm_updated_at:
            fm_updated_at = str(fm_updated_at)
        
        # Check if this FM already exists in strategy
        if fm_id in existing_fm_ids or fm_name in existing_fm_names:
            # Update version info for existing FM
            for existing_fm in existing_fm_strategies:
                if existing_fm.get("failure_mode_id") == fm_id or existing_fm.get("failure_mode_name") == fm_name:
                    if existing_fm.get("fm_version", 1) < fm_version:
                        # Update version tracking and potential effects
                        existing_fm["fm_version"] = fm_version
                        existing_fm["fm_updated_at"] = fm_updated_at
                        potential_effects = fm.get("potential_effects", [])
                        if isinstance(potential_effects, str):
                            potential_effects = [potential_effects] if potential_effects else []
                        existing_fm["potential_effects"] = potential_effects
                        updated_fms.append(fm_name)
                    break
            continue
        
        # This is a NEW failure mode - add it
        detection_methods = map_detection_methods(fm)
        strategy_type = determine_strategy_type(fm)
        
        # Generate tasks for this new failure mode
        tasks = generate_default_tasks_for_failure_mode(fm, strategy_type, detection_methods)
        new_tasks.extend(tasks)
        
        # Create failure mode strategy
        severity = fm.get("severity", 5)
        occurrence = fm.get("occurrence", 5)
        detectability = fm.get("detectability", 5)
        rpn = fm.get("rpn", severity * occurrence * detectability)
        
        if rpn >= 250:
            risk_level = "critical"
        elif rpn >= 180:
            risk_level = "high"
        elif rpn >= 100:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        potential_effects = fm.get("potential_effects", [])
        if isinstance(potential_effects, str):
            potential_effects = [potential_effects] if potential_effects else []
        
        fm_strategy = FailureModeStrategy(
            failure_mode_id=fm_id,
            failure_mode_name=fm_name,
            potential_effects=potential_effects,
            fm_version=fm_version,
            fm_updated_at=fm_updated_at,
            strategy_type=strategy_type,
            detection_methods=[DetectionMethod(m) for m in detection_methods if m in [e.value for e in DetectionMethod]],
            task_ids=[t.id for t in tasks],
            severity=severity,
            occurrence=occurrence,
            detectability=detectability,
            rpn=rpn,
            risk_if_unaddressed=risk_level,
            enabled=True
        )
        new_fm_strategies.append(fm_strategy)
    
    # Merge: existing + new
    all_fm_strategies = existing_fm_strategies + [fm.model_dump() for fm in new_fm_strategies]
    all_tasks = existing_tasks + [t.model_dump() for t in new_tasks]
    
    # Update totals
    total_fms = len(all_fm_strategies)
    active_fms = sum(1 for fm in all_fm_strategies if fm.get("enabled", True))
    coverage_score = (active_fms / total_fms * 100) if total_fms > 0 else 0.0
    
    # Increment version
    current_version = existing_strategy.get("version", "1.0")
    try:
        major, minor = map(int, current_version.split("."))
        new_version = f"{major}.{minor + 1}"
    except (ValueError, AttributeError):
        new_version = "1.1"
    
    # Create version history entry
    version_entry = {
        "version": new_version,
        "changed_at": datetime.utcnow().isoformat(),
        "changed_by": current_user.get("user_id"),
        "change_type": "sync",
        "change_summary": f"Synced with library: Added {len(new_fm_strategies)} new failure modes, {len(new_tasks)} new tasks. Updated {len(updated_fms)} existing FMs."
    }
    
    # Update the strategy
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {
                "failure_mode_strategies": all_fm_strategies,
                "task_templates": all_tasks,
                "total_failure_modes": total_fms,
                "total_tasks": len(all_tasks),
                "active_failure_modes": active_fms,
                "coverage_score": round(coverage_score, 1),
                "version": new_version,
                "updated_at": datetime.utcnow().isoformat()
            },
            "$push": {"version_history": version_entry}
        }
    )
    
    # Log audit
    await log_strategy_audit(
        action="sync_strategy",
        equipment_type_id=equipment_type_id,
        user_id=current_user.get("user_id"),
        details={
            "new_failure_modes": len(new_fm_strategies),
            "new_tasks": len(new_tasks),
            "updated_fms": len(updated_fms),
            "new_version": new_version
        }
    )
    
    return {
        "message": "Strategy synced with library",
        "equipment_type_id": equipment_type_id,
        "new_failure_modes_added": len(new_fm_strategies),
        "new_tasks_added": len(new_tasks),
        "updated_failure_modes": len(updated_fms),
        "total_failure_modes": total_fms,
        "total_tasks": len(all_tasks),
        "new_version": new_version
    }


@router.get("/{equipment_type_id}/affected-equipment")
async def get_affected_equipment(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of equipment affected by this strategy"""
    # Find all equipment nodes that use this equipment type
    equipment_nodes = await db.equipment_nodes.find(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0, "id": 1, "name": 1, "tag": 1, "level": 1, "location": 1, "parent_id": 1, "criticality": 1}
    ).to_list(500)
    
    return {
        "equipment": equipment_nodes,
        "total": len(equipment_nodes),
        "equipment_type_id": equipment_type_id
    }


@router.get("/{equipment_type_id}/version-history")
async def get_strategy_version_history(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get version history for an equipment type strategy"""
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0, "version_history": 1, "version": 1}
    )
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    return {
        "current_version": strategy.get("version", "1.0"),
        "version_history": strategy.get("version_history", [])
    }


@router.get("/{equipment_type_id}/audit-log")
async def get_strategy_audit_log(
    equipment_type_id: str,
    limit: int = Query(default=50, le=200),
    current_user: dict = Depends(get_current_user)
):
    """Get audit log for an equipment type strategy"""
    audit_entries = await db.maintenance_strategy_audit.find(
        {"entity_id": equipment_type_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {
        "audit_log": audit_entries,
        "total": len(audit_entries)
    }


# ============= Failure Mode Strategy Endpoints =============

@router.get("/{equipment_type_id}/failure-modes")
async def get_failure_mode_strategies(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all failure mode strategies for an equipment type"""
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0}
    )
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    return {
        "failure_mode_strategies": strategy.get("failure_mode_strategies", []),
        "total": len(strategy.get("failure_mode_strategies", []))
    }


@router.patch("/{equipment_type_id}/failure-modes/{failure_mode_id}")
async def update_failure_mode_strategy(
    equipment_type_id: str,
    failure_mode_id: str,
    request: UpdateFailureModeStrategyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update a specific failure mode's strategy"""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    fm_strategies = strategy.get("failure_mode_strategies", [])
    updated = False
    
    for i, fm in enumerate(fm_strategies):
        if fm.get("failure_mode_id") == failure_mode_id:
            if request.strategy_type is not None:
                fm_strategies[i]["strategy_type"] = request.strategy_type.value
            if request.detection_methods is not None:
                fm_strategies[i]["detection_methods"] = [m.value for m in request.detection_methods]
            if request.task_ids is not None:
                fm_strategies[i]["task_ids"] = request.task_ids
            if request.frequency_override is not None:
                fm_strategies[i]["frequency_override"] = request.frequency_override.model_dump()
            if request.enabled is not None:
                fm_strategies[i]["enabled"] = request.enabled
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Failure mode not found in strategy")
    
    # Recalculate coverage based on active failure modes
    total_fms = len(fm_strategies)
    active_fms = sum(1 for fm in fm_strategies if fm.get("enabled", True))
    coverage_score = (active_fms / total_fms * 100) if total_fms > 0 else 0.0
    
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {
                "failure_mode_strategies": fm_strategies,
                "active_failure_modes": active_fms,
                "coverage_score": round(coverage_score, 1),
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )

    # Propagate enable/disable to maintenance_programs
    programs_toggled = 0
    if request.enabled is not None:
        programs_toggled = await _toggle_programs_for_failure_mode(
            equipment_type_id,
            failure_mode_id,
            request.enabled,
        )

    # Bump strategy version
    changed_keys = [k for k in ["strategy_type", "detection_methods", "task_ids", "frequency_override", "enabled"] if getattr(request, k, None) is not None]
    new_version = await _bump_strategy_version(
        strategy,
        changes=[f"fm:{failure_mode_id}:{','.join(changed_keys)}"],
        user_id=current_user.get("user_id"),
    )

    return {
        "message": "Failure mode strategy updated",
        "failure_mode_id": failure_mode_id,
        "active_failure_modes": active_fms,
        "total_failure_modes": total_fms,
        "coverage_score": round(coverage_score, 1),
        "programs_toggled": programs_toggled,
        "version": new_version,
    }


# ============= Task Template Endpoints =============

@router.get("/{equipment_type_id}/tasks")
async def get_task_templates(
    equipment_type_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all task templates for an equipment type"""
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": equipment_type_id},
        {"_id": 0}
    )
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    return {
        "task_templates": strategy.get("task_templates", []),
        "total": len(strategy.get("task_templates", []))
    }


@router.post("/{equipment_type_id}/tasks")
async def add_task_template(
    equipment_type_id: str,
    request: AddTaskTemplateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add a new task template to an equipment type strategy"""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    # Create new task template
    freq_matrix = request.frequency_matrix or CriticalityFrequency()
    
    task = MaintenanceTaskTemplate(
        id=f"task_{uuid.uuid4()}",
        name=request.name,
        description=request.description,
        task_type=request.task_type,
        frequency_matrix=freq_matrix,
        duration_hours=request.duration_hours,
        skills_required=request.skills_required,
        discipline=request.discipline,
        detection_methods=request.detection_methods,
        failure_mode_ids=request.failure_mode_ids,
        procedure_steps=request.procedure_steps,
        source="manual"
    )
    
    task_dict = task.model_dump()
    
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$push": {"task_templates": task_dict},
            "$inc": {"total_tasks": 1},
            "$set": {"updated_at": datetime.utcnow().isoformat()}
        }
    )

    new_version = await _bump_strategy_version(
        strategy,
        changes=[f"task:{task.id}:added"],
        user_id=current_user.get("user_id"),
    )

    return {**task_dict, "version": new_version}


@router.patch("/{equipment_type_id}/tasks/{task_id}")
async def update_task_template(
    equipment_type_id: str,
    task_id: str,
    updates: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """Update a task template and propagate to existing maintenance_programs."""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    task_templates = strategy.get("task_templates", [])
    updated = False
    updated_task = None
    
    for i, task in enumerate(task_templates):
        if task.get("id") == task_id:
            for key, value in updates.items():
                if key in ["name", "description", "task_type", "duration_hours", 
                          "skills_required", "discipline", "detection_methods",
                          "failure_mode_ids", "procedure_steps", "is_mandatory",
                          "tools_required", "spare_parts", "estimated_cost_eur"]:
                    task_templates[i][key] = value
                elif key == "frequency_matrix" and isinstance(value, dict):
                    task_templates[i]["frequency_matrix"] = value
            updated = True
            updated_task = task_templates[i]
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Task template not found")
    
    await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$set": {
                "task_templates": task_templates,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )

    # Bump strategy version
    new_version = await _bump_strategy_version(
        strategy,
        changes=[f"task:{task_id}:{','.join(updates.keys())}"],
        user_id=current_user.get("user_id"),
    )

    # Propagate to all maintenance_programs that reference this task
    programs_updated = await _propagate_task_template_to_programs(
        equipment_type_id, updated_task, new_version
    )

    return {
        "message": "Task template updated",
        "task_id": task_id,
        "version": new_version,
        "programs_updated": programs_updated,
    }


@router.delete("/{equipment_type_id}/tasks/{task_id}")
async def delete_task_template(
    equipment_type_id: str,
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a task template and deactivate any maintenance_programs that referenced it."""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    result = await db.equipment_type_strategies.update_one(
        {"equipment_type_id": equipment_type_id},
        {
            "$pull": {"task_templates": {"id": task_id}},
            "$inc": {"total_tasks": -1},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Task template not found")

    new_version = await _bump_strategy_version(
        strategy,
        changes=[f"task:{task_id}:deleted"],
        user_id=current_user.get("user_id"),
    )

    programs_deactivated = await _deactivate_programs_for_task(equipment_type_id, task_id)

    return {
        "message": "Task template deleted",
        "task_id": task_id,
        "version": new_version,
        "programs_deactivated": programs_deactivated,
    }


# ============= Task Generation Endpoints =============

@router.post("/{equipment_type_id}/generate-tasks")
async def generate_tasks_for_equipment(
    equipment_type_id: str,
    request: GenerateTasksRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate maintenance tasks for a specific equipment asset based on its criticality"""
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": equipment_type_id
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found for this equipment type")
    
    # Generate tasks based on criticality
    generated_tasks = []
    disabled_fm_set = set(request.disabled_failure_modes)
    
    for task_template in strategy.get("task_templates", []):
        # Check if any of the task's failure modes are disabled
        task_fm_ids = set(task_template.get("failure_mode_ids", []))
        if task_fm_ids and task_fm_ids.issubset(disabled_fm_set):
            continue  # Skip task if all its failure modes are disabled
        
        # Get frequency based on criticality
        freq_matrix = task_template.get("frequency_matrix", {})
        frequency = calculate_frequency_for_criticality(
            CriticalityFrequency(**freq_matrix),
            request.criticality
        )
        
        # Create generated task
        gen_task = GeneratedTask(
            id=f"gen_{uuid.uuid4()}",
            equipment_id=request.equipment_id,
            equipment_name=request.equipment_name,
            equipment_type_id=equipment_type_id,
            strategy_id=strategy.get("id"),
            strategy_version=strategy.get("version", "1.0"),
            task_template_id=task_template.get("id"),
            failure_mode_ids=task_template.get("failure_mode_ids", []),
            name=task_template.get("name"),
            description=task_template.get("description"),
            task_type=MaintenanceStrategyType(task_template.get("task_type", "preventive")),
            frequency=frequency,
            asset_criticality=request.criticality,
            activation_state=TaskActivationState.INHERITED,
            duration_hours=task_template.get("duration_hours", 1.0),
            skills_required=task_template.get("skills_required", []),
            discipline=task_template.get("discipline"),
            sync_status="current"
        )
        generated_tasks.append(gen_task)
    
    # Create or update equipment strategy instance
    existing_instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": request.equipment_id
    })
    
    instance = EquipmentStrategyInstance(
        id=existing_instance.get("id") if existing_instance else str(uuid.uuid4()),
        equipment_id=request.equipment_id,
        equipment_name=request.equipment_name,
        equipment_type_id=equipment_type_id,
        criticality=request.criticality,
        operating_context=request.operating_context,
        strategy_id=strategy.get("id"),
        strategy_version=strategy.get("version", "1.0"),
        generated_tasks=generated_tasks,
        disabled_failure_modes=request.disabled_failure_modes,
        sync_status="current",
        last_synced_at=datetime.utcnow().isoformat()
    )
    
    instance_dict = instance.model_dump()
    
    if existing_instance:
        await db.equipment_strategy_instances.update_one(
            {"equipment_id": request.equipment_id},
            {"$set": instance_dict}
        )
    else:
        await db.equipment_strategy_instances.insert_one(instance_dict)
    
    instance_dict.pop("_id", None)
    
    return {
        "equipment_id": request.equipment_id,
        "criticality": request.criticality.value,
        "generated_tasks": [t.model_dump() for t in generated_tasks],
        "total_tasks": len(generated_tasks),
        "strategy_version": strategy.get("version", "1.0")
    }


# ============= Equipment Strategy Instance Endpoints =============

@router.get("/equipment/{equipment_id}")
async def get_equipment_strategy_instance(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get the strategy instance for a specific equipment asset"""
    instance = await db.equipment_strategy_instances.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0}
    )
    
    if not instance:
        return {"instance": None, "exists": False}
    
    return {"instance": instance, "exists": True}


@router.patch("/equipment/{equipment_id}/tasks/{task_id}")
async def override_equipment_task(
    equipment_id: str,
    task_id: str,
    updates: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """Override a generated task at equipment level"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    generated_tasks = instance.get("generated_tasks", [])
    updated = False
    
    for i, task in enumerate(generated_tasks):
        if task.get("id") == task_id:
            # Store original values before override
            if not task.get("is_overridden"):
                generated_tasks[i]["original_frequency"] = task.get("frequency")
            
            # Apply updates
            for key, value in updates.items():
                if key in ["frequency", "activation_state", "override_reason"]:
                    generated_tasks[i][key] = value
            
            generated_tasks[i]["is_overridden"] = True
            generated_tasks[i]["activation_state"] = TaskActivationState.OVERRIDDEN.value
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "generated_tasks": generated_tasks,
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Task overridden", "task_id": task_id}


@router.post("/equipment/{equipment_id}/disable-failure-mode")
async def disable_failure_mode_for_equipment(
    equipment_id: str,
    failure_mode_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Disable a specific failure mode for an equipment asset"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Add to disabled list
    disabled_fms = instance.get("disabled_failure_modes", [])
    disabled_reasons = instance.get("disabled_fm_reasons", {})
    
    if failure_mode_id not in disabled_fms:
        disabled_fms.append(failure_mode_id)
    
    if reason:
        disabled_reasons[failure_mode_id] = reason
    
    # Disable related tasks
    generated_tasks = instance.get("generated_tasks", [])
    for i, task in enumerate(generated_tasks):
        if failure_mode_id in task.get("failure_mode_ids", []):
            generated_tasks[i]["activation_state"] = TaskActivationState.DISABLED.value
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "disabled_failure_modes": disabled_fms,
                "disabled_fm_reasons": disabled_reasons,
                "generated_tasks": generated_tasks,
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Failure mode disabled", "failure_mode_id": failure_mode_id}


@router.post("/equipment/{equipment_id}/regenerate")
async def regenerate_equipment_tasks(
    equipment_id: str,
    request: RegenerateStrategyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Regenerate tasks for equipment after strategy template changes"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Get latest strategy
    strategy = await db.equipment_type_strategies.find_one({
        "equipment_type_id": instance.get("equipment_type_id")
    })
    
    if not strategy:
        raise HTTPException(status_code=404, detail="Equipment type strategy not found")
    
    # Preview mode - just show what would change
    if request.preview_only:
        # TODO: Implement detailed preview
        return {
            "preview": True,
            "current_version": instance.get("strategy_version"),
            "new_version": strategy.get("version"),
            "changes": {
                "tasks_to_add": [],
                "tasks_to_remove": [],
                "tasks_to_update": []
            }
        }
    
    # Regenerate tasks
    criticality = CriticalityLevel(instance.get("criticality", "medium"))
    disabled_fms = instance.get("disabled_failure_modes", [])
    
    # Preserve overrides if requested
    preserved_overrides = {}
    if request.preserve_overrides:
        for task in instance.get("generated_tasks", []):
            if task.get("is_overridden"):
                preserved_overrides[task.get("task_template_id")] = {
                    "frequency": task.get("frequency"),
                    "override_reason": task.get("override_reason")
                }
    
    # Generate new tasks
    generated_tasks = []
    for task_template in strategy.get("task_templates", []):
        task_fm_ids = set(task_template.get("failure_mode_ids", []))
        if task_fm_ids and task_fm_ids.issubset(set(disabled_fms)):
            continue
        
        freq_matrix = task_template.get("frequency_matrix", {})
        frequency = calculate_frequency_for_criticality(
            CriticalityFrequency(**freq_matrix),
            criticality
        )
        
        # Check for preserved override
        template_id = task_template.get("id")
        is_overridden = template_id in preserved_overrides
        
        if is_overridden:
            frequency = TaskFrequency(preserved_overrides[template_id]["frequency"])
        
        gen_task = GeneratedTask(
            id=f"gen_{uuid.uuid4()}",
            equipment_id=equipment_id,
            equipment_name=instance.get("equipment_name"),
            equipment_type_id=instance.get("equipment_type_id"),
            strategy_id=strategy.get("id"),
            strategy_version=strategy.get("version", "1.0"),
            task_template_id=template_id,
            failure_mode_ids=task_template.get("failure_mode_ids", []),
            name=task_template.get("name"),
            description=task_template.get("description"),
            task_type=MaintenanceStrategyType(task_template.get("task_type", "preventive")),
            frequency=frequency,
            asset_criticality=criticality,
            activation_state=TaskActivationState.OVERRIDDEN if is_overridden else TaskActivationState.INHERITED,
            is_overridden=is_overridden,
            override_reason=preserved_overrides.get(template_id, {}).get("override_reason") if is_overridden else None,
            original_frequency=None,
            duration_hours=task_template.get("duration_hours", 1.0),
            skills_required=task_template.get("skills_required", []),
            discipline=task_template.get("discipline"),
            sync_status="current"
        )
        generated_tasks.append(gen_task)
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "generated_tasks": [t.model_dump() for t in generated_tasks],
                "strategy_version": strategy.get("version"),
                "sync_status": "current",
                "last_synced_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {
        "message": "Tasks regenerated",
        "equipment_id": equipment_id,
        "total_tasks": len(generated_tasks),
        "new_version": strategy.get("version"),
        "overrides_preserved": len(preserved_overrides)
    }



# ============= Local Tasks Endpoints =============

@router.post("/equipment/{equipment_id}/local-tasks")
async def add_local_task(
    equipment_id: str,
    request: AddTaskTemplateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add a local task to an equipment (not from template)"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Create local task
    local_task = MaintenanceTaskTemplate(
        id=f"local_{uuid.uuid4()}",
        name=request.name,
        description=request.description,
        task_type=request.task_type,
        frequency_matrix=request.frequency_matrix or CriticalityFrequency(),
        duration_hours=request.duration_hours,
        skills_required=request.skills_required,
        discipline=request.discipline,
        detection_methods=request.detection_methods,
        failure_mode_ids=request.failure_mode_ids,
        procedure_steps=request.procedure_steps,
        source="local"
    )
    
    local_task_dict = local_task.model_dump()
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$push": {"local_tasks": local_task_dict},
            "$set": {
                "sync_status": "customized",
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    # Log audit
    await log_strategy_audit(
        action="add_local_task",
        equipment_type_id=equipment_id,
        user_id=current_user.get("user_id"),
        details={"task_name": request.name},
        entity_type="equipment_strategy_instance"
    )
    
    return local_task_dict


@router.delete("/equipment/{equipment_id}/local-tasks/{task_id}")
async def delete_local_task(
    equipment_id: str,
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a local task from equipment"""
    result = await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$pull": {"local_tasks": {"id": task_id}},
            "$set": {"updated_at": datetime.utcnow().isoformat()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Local task not found")
    
    return {"message": "Local task deleted", "task_id": task_id}


@router.post("/equipment/{equipment_id}/enable-failure-mode")
async def enable_failure_mode_for_equipment(
    equipment_id: str,
    failure_mode_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Re-enable a previously disabled failure mode for an equipment asset"""
    instance = await db.equipment_strategy_instances.find_one({
        "equipment_id": equipment_id
    })
    
    if not instance:
        raise HTTPException(status_code=404, detail="Equipment strategy instance not found")
    
    # Remove from disabled list
    disabled_fms = instance.get("disabled_failure_modes", [])
    disabled_reasons = instance.get("disabled_fm_reasons", {})
    
    if failure_mode_id in disabled_fms:
        disabled_fms.remove(failure_mode_id)
    
    if failure_mode_id in disabled_reasons:
        del disabled_reasons[failure_mode_id]
    
    # Re-enable related tasks
    generated_tasks = instance.get("generated_tasks", [])
    for i, task in enumerate(generated_tasks):
        if failure_mode_id in task.get("failure_mode_ids", []):
            if task.get("activation_state") == TaskActivationState.DISABLED.value:
                generated_tasks[i]["activation_state"] = TaskActivationState.INHERITED.value
    
    await db.equipment_strategy_instances.update_one(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "disabled_failure_modes": disabled_fms,
                "disabled_fm_reasons": disabled_reasons,
                "generated_tasks": generated_tasks,
                "updated_at": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"message": "Failure mode enabled", "failure_mode_id": failure_mode_id}


# ============= Sync Status Endpoint =============

@router.get("/equipment/{equipment_id}/sync-status")
async def get_equipment_sync_status(
    equipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check sync status between equipment strategy and type strategy"""
    instance = await db.equipment_strategy_instances.find_one(
        {"equipment_id": equipment_id},
        {"_id": 0}
    )
    
    if not instance:
        return {"sync_status": "not_initialized", "needs_generation": True}
    
    # Get latest strategy version
    strategy = await db.equipment_type_strategies.find_one(
        {"equipment_type_id": instance.get("equipment_type_id")},
        {"_id": 0, "version": 1}
    )
    
    if not strategy:
        return {
            "sync_status": "orphaned",
            "message": "Equipment type strategy not found"
        }
    
    current_version = instance.get("strategy_version", "0.0")
    latest_version = strategy.get("version", "1.0")
    
    if current_version == latest_version:
        return {
            "sync_status": instance.get("sync_status", "current"),
            "current_version": current_version,
            "latest_version": latest_version,
            "is_up_to_date": True
        }
    else:
        return {
            "sync_status": "update_available",
            "current_version": current_version,
            "latest_version": latest_version,
            "is_up_to_date": False,
            "message": f"Strategy updated from v{current_version} to v{latest_version}"
        }
