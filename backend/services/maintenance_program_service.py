"""
Maintenance Program Service
Handles business logic for Maintenance Program operations

Features:
- Program generation from equipment type strategy
- Task consolidation from multiple sources
- AI task recommendation generation
- Version management and change detection
- Audit logging
"""

import json
import logging
import uuid
from enum import Enum
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from database import db
from services.maintenance_tenant_scope import maintenance_scoped_job, maintenance_scoped_tenant, tenant_id_from_record
from services.scheduler_helpers import (
    normalize_program_criticality,
    build_task_to_failure_modes,
    is_strategy_task_active,
    coerce_optional_str_id,
)
from services.maintenance_program_pm_import import (
    enrich_program_response_with_pm_import as _enrich_program_response_with_pm_import,
    fetch_pm_import_tasks_for_equipment as _fetch_pm_import_tasks_for_equipment,
    is_incorporated_pm_program_task,
    load_incorporated_pm_refs_for_equipment,
    propagate_pm_import_task_active_state as _propagate_pm_import_task_active_state,
)
from services.maintenance_program_helpers import (
    criticality_fields_from_equipment as _criticality_fields_from_equipment,
    load_equipment_for_program as _load_equipment_for_program,
    stamp_tenant_from_equipment as _stamp_tenant_from_equipment,
)
from services.maintenance_program_enrichment import (
    enrich_criticality_context as _enrich_criticality_context,
    enrich_program_response_with_strategy_tasks as _enrich_program_response_with_strategy_tasks,
    recalculate_program_task_stats as _recalculate_program_task_stats,
)
from services.maintenance_program_session_import import (
    import_tasks_from_session as _import_tasks_from_session,
)

from services.maintenance_program_task_crud import add_task, delete_task, update_task
from services.maintenance_program_regeneration import regenerate_program
from services.maintenance_program_helpers import bump_version as _bump_version_fn, log_program_audit as _log_program_audit_fn


from services.maintenance_program_scheduler_sync import (
    is_scheduleable_imported_pm_task,
    scheduler_task_type_from_program_task,
    sync_imported_program_tasks_to_scheduler,
)

from services.scheduler_config import should_sync_legacy_maintenance_programs
from services.criticality_score import resolve_equipment_criticality_score
from models.maintenance_program import (
    MaintenanceProgram,
    MaintenanceProgramTask,
    TaskTraceability,
    ProgramVersionEntry,
    TaskSource,
    TaskCategory,
    TaskFrequency,
    TaskPriority,
    SkillRequirement,
    ProgramStatus,
    ApprovalStatus,
    ProgramChangePreview,
    FREQUENCY_DAYS_MAP,
    frequency_to_days,
)

logger = logging.getLogger(__name__)


class MaintenanceProgramService:
    """Service for managing Maintenance Programs"""
    
    # ============= Task Category Mapping =============
    
    TASK_TYPE_TO_CATEGORY = {
        "preventive": TaskCategory.PREVENTIVE_MAINTENANCE,
        "predictive": TaskCategory.PREDICTIVE,
        "condition_based": TaskCategory.CONDITION_MONITORING,
        "inspection": TaskCategory.INSPECTION,
        "lubrication": TaskCategory.LUBRICATION,
        "calibration": TaskCategory.CALIBRATION,
        "cleaning": TaskCategory.CLEANING,
        "functional_test": TaskCategory.FUNCTIONAL_TEST,
        "safety": TaskCategory.SAFETY_VERIFICATION,
        "regulatory": TaskCategory.REGULATORY_COMPLIANCE,
        "corrective": TaskCategory.CORRECTIVE,
        "reactive": TaskCategory.CORRECTIVE,
        # Custom PM Import task types
        "pm": TaskCategory.PREVENTIVE_MAINTENANCE,
        "pdm": TaskCategory.PREDICTIVE,
        "cbm": TaskCategory.CONDITION_MONITORING,
        "cm": TaskCategory.CORRECTIVE,
    }

    PM_FREQUENCY_ALIASES = {
        "biweekly": "bi_weekly",
        "semi-annual": "semi_annual",
        "semi_annual": "semi_annual",
        "every_2_years": "biennial",
        "every_3_years": "biennial",
        "condition_based": "on_condition",
        "one_time": "not_required",
        "one-time": "not_required",
    }

    @staticmethod
    def _program_to_db_document(program: MaintenanceProgram) -> Dict[str, Any]:
        """BSON-safe dict for MongoDB inserts/updates."""
        return json.loads(program.model_dump_json())
    
    # ============= Program Generation =============
    
    @staticmethod
    async def get_or_create_program(
        equipment_id: str,
        generate_from_strategy: bool = True,
        user_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> MaintenanceProgram:
        """Get existing program or create new one for equipment"""

        equipment = await _load_equipment_for_program(equipment_id, tenant_id=tenant_id)
        tenant_id = tenant_id or tenant_id_from_record(equipment)

        existing = await db.maintenance_programs_v2.find_one(
            maintenance_scoped_tenant(tenant_id, {"equipment_id": equipment_id}),
            {"_id": 0}
        )
        if not existing:
            existing = await db.maintenance_programs_v2.find_one(
                {"equipment_id": equipment_id},
                {"_id": 0},
            )
        
        if existing:
            return MaintenanceProgram(**existing)
        
        equipment_crit = equipment.get("criticality")
        equipment_criticality_level = "low"
        criticality_score = None
        if equipment_crit:
            if isinstance(equipment_crit, dict):
                equipment_criticality_level = (equipment_crit.get("level") or "low").lower()
                criticality_score = resolve_equipment_criticality_score(equipment_crit)
            elif isinstance(equipment_crit, str):
                equipment_criticality_level = equipment_crit.lower()
        strategy_criticality_band = normalize_program_criticality(equipment_crit or equipment_criticality_level)
        
        # Create new program
        program = MaintenanceProgram(
            id=str(uuid.uuid4()),
            program_name=f"Maintenance Program - {equipment.get('name', equipment_id)}",
            equipment_id=equipment_id,
            equipment_name=equipment.get("name", ""),
            equipment_tag=equipment.get("tag"),
            equipment_type_id=equipment.get("equipment_type_id"),
            equipment_type_name=equipment.get("equipment_type_name"),
            criticality_level=equipment_criticality_level,
            criticality_score=criticality_score,
            status=ProgramStatus.DRAFT,
            created_by=user_id,
        )
        
        # Generate tasks from strategy if requested
        if generate_from_strategy and equipment.get("equipment_type_id"):
            tasks = await MaintenanceProgramService.generate_tasks_from_strategy(
                equipment_type_id=equipment.get("equipment_type_id"),
                equipment_id=equipment_id,
                criticality_level=strategy_criticality_band,
                user_id=user_id,
                tenant_id=tenant_id,
            )
            program.tasks = tasks
            program.source_strategy_id = equipment.get("equipment_type_id")
            strategy_doc = await db.equipment_type_strategies.find_one(
                maintenance_scoped_tenant(
                    tenant_id,
                    {"equipment_type_id": equipment.get("equipment_type_id")},
                ),
                {"version": 1, "_id": 0},
            )
            if strategy_doc:
                program.source_strategy_version = strategy_doc.get("version", "1.0")
            program.last_strategy_sync = datetime.utcnow().isoformat()
        
        # Calculate statistics
        program = MaintenanceProgramService._calculate_statistics(program)
        
        # Add version history entry
        program.version_history.append(ProgramVersionEntry(
            version="1.0",
            change_type="created",
            change_summary=f"Program created with {len(program.tasks)} tasks from strategy",
            tasks_added=len(program.tasks),
            changed_by=user_id
        ))
        
        # Save to database
        program_doc = MaintenanceProgramService._program_to_db_document(program)
        _stamp_tenant_from_equipment(program_doc, equipment)
        await db.maintenance_programs_v2.insert_one(program_doc)
        
        # Log audit
        await MaintenanceProgramService._log_audit(
            action="create_program",
            equipment_id=equipment_id,
            user_id=user_id,
            details={"total_tasks": len(program.tasks)}
        )
        
        return program

    @staticmethod
    async def _find_program_doc_for_equipment(
        equipment_id: str,
        tenant_id: Optional[str],
        projection: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        proj = projection or {"_id": 0}
        doc = await db.maintenance_programs_v2.find_one(
            maintenance_scoped_tenant(tenant_id, {"equipment_id": equipment_id}),
            proj,
        )
        if doc:
            return doc
        return await db.maintenance_programs_v2.find_one(
            {"equipment_id": equipment_id},
            proj,
        )

    @staticmethod
    async def _apply_program_ensure_update(
        equipment_id: str,
        tenant_id: Optional[str],
        update_fields: Dict[str, Any],
    ) -> None:
        result = await db.maintenance_programs_v2.update_one(
            maintenance_scoped_tenant(tenant_id, {"equipment_id": equipment_id}),
            {"$set": update_fields},
        )
        if result.matched_count > 0:
            return

        legacy_fields = dict(update_fields)
        if tenant_id:
            legacy_fields["tenant_id"] = tenant_id
        legacy = await db.maintenance_programs_v2.update_one(
            {"equipment_id": equipment_id},
            {"$set": legacy_fields},
        )
        if legacy.matched_count == 0:
            raise ValueError(
                f"Maintenance program v2 missing after ensure for equipment: {equipment_id}"
            )

    @staticmethod
    async def ensure_equipment_program_from_strategy(
        equipment_id: str,
        strategy_version: str,
        user_id: Optional[str] = None,
        activate: bool = True,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Ensure maintenance_programs_v2 exists for equipment after scheduler apply-strategy.
        Creates a new program from strategy or regenerates an existing one.
        """
        equipment = await _load_equipment_for_program(equipment_id, tenant_id=tenant_id)
        tenant_id = tenant_id or tenant_id_from_record(equipment)
        existing = await MaintenanceProgramService._find_program_doc_for_equipment(
            equipment_id,
            tenant_id,
            {"equipment_id": 1, "_id": 0},
        )

        if existing:
            await MaintenanceProgramService.regenerate_program(
                equipment_id=equipment_id,
                preserve_overrides=True,
                preserve_manual_tasks=True,
                preserve_imported_tasks=True,
                user_id=user_id,
            )
            action = "regenerated"
        else:
            await MaintenanceProgramService.get_or_create_program(
                equipment_id=equipment_id,
                generate_from_strategy=True,
                user_id=user_id,
                tenant_id=tenant_id,
            )
            action = "created"

        equipment = await _load_equipment_for_program(equipment_id, tenant_id=tenant_id)
        tenant_id = tenant_id or tenant_id_from_record(equipment)
        update_fields: Dict[str, Any] = {
            "applied_strategy_version": strategy_version,
            "updated_at": datetime.utcnow().isoformat(),
        }
        if equipment:
            if equipment.get("tag"):
                update_fields["equipment_tag"] = equipment["tag"]
            if equipment.get("name"):
                update_fields["equipment_name"] = equipment["name"]
        if activate:
            update_fields["status"] = ProgramStatus.ACTIVE.value

        await MaintenanceProgramService._apply_program_ensure_update(
            equipment_id,
            tenant_id,
            update_fields,
        )

        return {"equipment_id": equipment_id, "action": action}

    @staticmethod
    async def ensure_programs_for_equipment_ids(
        equipment_ids: List[str],
        strategy_version: str,
        user_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ensure maintenance_programs_v2 exists for each equipment id."""
        created: List[str] = []
        regenerated: List[str] = []
        errors: List[Dict[str, str]] = []

        for equipment_id in equipment_ids:
            if not equipment_id:
                continue
            try:
                result = await MaintenanceProgramService.ensure_equipment_program_from_strategy(
                    equipment_id=equipment_id,
                    strategy_version=strategy_version,
                    user_id=user_id,
                    tenant_id=tenant_id,
                )
                if result.get("action") == "created":
                    created.append(equipment_id)
                else:
                    regenerated.append(equipment_id)
            except Exception as exc:
                logger.exception(
                    "Failed to ensure v2 maintenance program for equipment_id=%s",
                    equipment_id,
                )
                errors.append({"equipment_id": equipment_id, "error": str(exc)})

        return {
            "programs_created": len(created),
            "programs_regenerated": len(regenerated),
            "equipment_ids_created": created,
            "equipment_ids_regenerated": regenerated,
            "errors": errors,
        }
    
    @staticmethod
    async def generate_tasks_from_strategy(
        equipment_type_id: str,
        equipment_id: str,
        criticality_level: str = "low",
        user_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> List[MaintenanceProgramTask]:
        """Generate maintenance tasks from equipment type strategy"""
        
        equipment = await _load_equipment_for_program(equipment_id, tenant_id=tenant_id)
        tenant_id = tenant_id or tenant_id_from_record(equipment)

        # Get strategy
        strategy = await db.equipment_type_strategies.find_one(
            maintenance_scoped_tenant(tenant_id, {"equipment_type_id": equipment_type_id}),
            {"_id": 0}
        )
        
        if not strategy:
            logger.warning(f"No strategy found for equipment type: {equipment_type_id}")
            return []
        
        tasks = []
        task_templates = strategy.get("task_templates", [])
        task_to_fms = build_task_to_failure_modes(strategy)

        for template in task_templates:
            if not is_strategy_task_active(template, task_to_fms=task_to_fms):
                continue

            task_type = template.get("task_type", "preventive")
            # Get frequency based on strategy band (low / medium / high)
            strategy_band = normalize_program_criticality(criticality_level)
            freq_matrix = template.get("frequency_matrix", {})
            frequency_str = freq_matrix.get(strategy_band, "monthly")
            
            try:
                frequency = TaskFrequency(frequency_str)
            except ValueError:
                frequency = TaskFrequency.MONTHLY
            
            # Get linked failure mode info (prefer an enabled FM when multiple are linked)
            template_id = template.get("id")
            linked_fms = task_to_fms.get(template_id, [])
            enabled_fm = next(
                (fm for fm in linked_fms if fm.get("enabled") is not False),
                linked_fms[0] if linked_fms else None,
            )
            fm_id = coerce_optional_str_id(
                enabled_fm.get("failure_mode_id") if enabled_fm else None
            )
            fm_name = enabled_fm.get("failure_mode_name") if enabled_fm else None
            
            # Map task type to category
            category = MaintenanceProgramService.TASK_TYPE_TO_CATEGORY.get(
                task_type,
                TaskCategory.PREVENTIVE_MAINTENANCE
            )
            
            # Create task
            task = MaintenanceProgramTask(
                id=str(uuid.uuid4()),
                task_title=template.get("name", "Maintenance Task"),
                task_description=template.get("description"),
                frequency=frequency,
                frequency_days=frequency_to_days(frequency.value),
                estimated_duration_hours=template.get("duration_hours", 1.0),
                task_category=category,
                task_source=TaskSource.STRATEGY_GENERATED,
                priority=TaskPriority.MEDIUM,
                skill_requirement=SkillRequirement.TECHNICIAN,
                discipline=template.get("discipline"),
                skills_required=template.get("skills_required", []),
                tools_required=template.get("tools_required", []),
                spare_parts=template.get("spare_parts", []),
                procedure_steps=template.get("procedure_steps", []),
                is_mandatory=template.get("is_mandatory", True),
                traceability=TaskTraceability(
                    strategy_id=equipment_type_id,
                    strategy_version=strategy.get("version", "1.0"),
                    task_template_id=template_id,
                    failure_mode_id=fm_id,
                    failure_mode_name=fm_name
                ),
                created_by=user_id
            )
            tasks.append(task)
        
        return tasks
    
    # ============= Task Management =============
    
    add_task = staticmethod(add_task)
    update_task = staticmethod(update_task)
    delete_task = staticmethod(delete_task)

    @staticmethod
    async def sync_programs_for_equipment_type(
        equipment_type_id: str,
        user_id: Optional[str] = None,
        preserve_overrides: bool = True,
        preserve_manual_tasks: bool = True,
        preserve_imported_tasks: bool = True,
    ) -> Dict[str, Any]:
        """
        Regenerate all maintenance programs (v2) for an equipment type after strategy changes.
        Creates missing programs for equipment of this type, then regenerates existing ones.
        Preserves manual/imported tasks and overridden strategy tasks by default.
        """
        strategy = await db.equipment_type_strategies.find_one(
            maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
            {"version": 1, "_id": 0},
        )
        strategy_version = (strategy or {}).get("version", "1.0")

        equipment_nodes = await db.equipment_nodes.find(
            maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
            {"id": 1, "_id": 0},
        ).to_list(500)
        equipment_ids = [node["id"] for node in equipment_nodes if node.get("id")]

        created: List[str] = []
        if equipment_ids:
            existing_docs = await db.maintenance_programs_v2.find(
                maintenance_scoped_job({"equipment_id": {"$in": equipment_ids}}),
                {"equipment_id": 1, "_id": 0},
            ).to_list(len(equipment_ids))
            existing_ids = {doc.get("equipment_id") for doc in existing_docs}
            for equipment_id in equipment_ids:
                if equipment_id in existing_ids:
                    continue
                try:
                    await MaintenanceProgramService.ensure_equipment_program_from_strategy(
                        equipment_id=equipment_id,
                        strategy_version=strategy_version,
                        user_id=user_id,
                    )
                    created.append(equipment_id)
                except Exception as exc:
                    logger.exception(
                        "Failed to create maintenance program for %s: %s",
                        equipment_id,
                        exc,
                    )

        programs = await db.maintenance_programs_v2.find(
            maintenance_scoped_job({"equipment_type_id": equipment_type_id}),
            {"equipment_id": 1, "_id": 0},
        ).to_list(500)

        regenerated: List[str] = []
        errors: List[Dict[str, str]] = []

        for prog in programs:
            equipment_id = prog.get("equipment_id")
            if not equipment_id:
                continue
            try:
                await MaintenanceProgramService.regenerate_program(
                    equipment_id=equipment_id,
                    preserve_overrides=preserve_overrides,
                    preserve_manual_tasks=preserve_manual_tasks,
                    preserve_imported_tasks=preserve_imported_tasks,
                    user_id=user_id,
                )
                regenerated.append(equipment_id)
            except ValueError as exc:
                errors.append({"equipment_id": equipment_id, "error": str(exc)})
            except Exception as exc:
                logger.exception(
                    "Failed to sync maintenance program for %s after strategy change: %s",
                    equipment_id,
                    exc,
                )
                errors.append({"equipment_id": equipment_id, "error": str(exc)})

        if regenerated:
            await MaintenanceProgramService._log_audit(
                action="sync_programs_from_strategy",
                equipment_id=equipment_type_id,
                user_id=user_id,
                details={
                    "equipment_type_id": equipment_type_id,
                    "programs_regenerated": len(regenerated),
                    "errors": len(errors),
                },
            )

        return {
            "programs_created": len(created),
            "programs_regenerated": len(regenerated),
            "equipment_ids_created": created,
            "equipment_ids": regenerated,
            "errors": errors,
        }

    _is_scheduleable_imported_pm_task = staticmethod(is_scheduleable_imported_pm_task)
    _scheduler_task_type_from_program_task = staticmethod(scheduler_task_type_from_program_task)
    sync_imported_program_tasks_to_scheduler = staticmethod(sync_imported_program_tasks_to_scheduler)

    # ============= Program Regeneration =============
    
    regenerate_program = staticmethod(regenerate_program)

    # ============= Import from PM Import =============
    
    @staticmethod
    async def import_tasks_from_session(
        equipment_id: str,
        import_session_id: str,
        task_ids: Optional[List[str]] = None,
        user_id: Optional[str] = None,
    ) -> Tuple[int, str]:
        """Import tasks from a PM Import session. Returns (tasks_imported, new_version)."""
        return await _import_tasks_from_session(
            equipment_id, import_session_id, task_ids=task_ids, user_id=user_id
        )
    
    # ============= AI Recommendations =============

    @staticmethod
    async def generate_ai_recommendations(
        equipment_id: str,
        include_failure_history: bool = True,
        include_industry_standards: bool = True,
        max_recommendations: int = 10,
        user_id: Optional[str] = None,
        user: Optional[dict] = None,
    ) -> List[MaintenanceProgramTask]:
        from services.maintenance_program_ai_recommendations import generate_ai_recommendations as _generate

        return await _generate(
            equipment_id,
            include_failure_history=include_failure_history,
            include_industry_standards=include_industry_standards,
            max_recommendations=max_recommendations,
            user_id=user_id,
            user=user,
        )

    @staticmethod
    async def accept_ai_recommendation(
        equipment_id: str,
        task: MaintenanceProgramTask,
        user_id: Optional[str] = None,
        user: Optional[dict] = None,
    ) -> Tuple[MaintenanceProgramTask, str]:
        from services.maintenance_program_ai_recommendations import accept_ai_recommendation as _accept

        return await _accept(equipment_id, task, user_id=user_id, user=user)
    
    # ============= Custom PM Import (hierarchy program view) =============

    propagate_pm_import_task_active_state = staticmethod(_propagate_pm_import_task_active_state)
    fetch_pm_import_tasks_for_equipment = staticmethod(_fetch_pm_import_tasks_for_equipment)
    enrich_program_response_with_pm_import = staticmethod(_enrich_program_response_with_pm_import)

    @staticmethod
    async def enrich_program_response_with_strategy_tasks(
        program: Optional[Dict[str, Any]],
        equipment_id: str,
        user_id: Optional[str] = None,
    ) -> Tuple[Optional[Dict[str, Any]], int]:
        return await _enrich_program_response_with_strategy_tasks(program, equipment_id, user_id)

    @staticmethod
    async def enrich_criticality_context(
        program: Dict[str, Any],
        equipment: Optional[Dict[str, Any]] = None,
        strategy: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await _enrich_criticality_context(program, equipment, strategy)

    # ============= Utility Methods =============
    
    _bump_version = staticmethod(_bump_version_fn)

    
    @staticmethod
    def _calculate_statistics(program: MaintenanceProgram) -> MaintenanceProgram:
        """Calculate and update program statistics"""
        tasks = program.tasks
        
        program.total_tasks = len(tasks)
        program.active_tasks = sum(1 for t in tasks if t.is_active)
        
        # Count by source
        program.strategy_tasks = sum(1 for t in tasks if t.task_source == TaskSource.STRATEGY_GENERATED)
        program.imported_tasks = sum(1 for t in tasks if t.task_source == TaskSource.CUSTOMER_IMPORTED)
        program.ai_tasks = sum(1 for t in tasks if t.task_source == TaskSource.AI_GENERATED)
        program.manual_tasks = sum(1 for t in tasks if t.task_source == TaskSource.MANUAL)
        
        # Count by category
        program.inspection_tasks = sum(1 for t in tasks if t.task_category == TaskCategory.INSPECTION)
        program.preventive_tasks = sum(1 for t in tasks if t.task_category == TaskCategory.PREVENTIVE_MAINTENANCE)
        program.predictive_tasks = sum(1 for t in tasks if t.task_category in [TaskCategory.PREDICTIVE, TaskCategory.CONDITION_MONITORING])
        
        return program
    
    _log_audit = staticmethod(_log_program_audit_fn)
