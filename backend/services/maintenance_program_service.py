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

import logging
import uuid
from enum import Enum
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from database import db
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
    }
    
    # ============= Program Generation =============
    
    @staticmethod
    async def get_or_create_program(
        equipment_id: str,
        generate_from_strategy: bool = True,
        user_id: Optional[str] = None
    ) -> MaintenanceProgram:
        """Get existing program or create new one for equipment"""
        
        # Check for existing program
        existing = await db.maintenance_programs_v2.find_one(
            {"equipment_id": equipment_id},
            {"_id": 0}
        )
        
        if existing:
            return MaintenanceProgram(**existing)
        
        # Get equipment details
        equipment = await db.equipment_nodes.find_one(
            {"id": equipment_id},
            {"_id": 0}
        )
        
        if not equipment:
            raise ValueError(f"Equipment not found: {equipment_id}")
        
        # Get criticality
        criticality_level = "low"
        criticality_score = None
        if equipment.get("criticality"):
            crit = equipment["criticality"]
            if isinstance(crit, dict):
                criticality_level = crit.get("level", "low").lower()
                criticality_score = crit.get("risk_score")
            elif isinstance(crit, str):
                criticality_level = crit.lower()
        
        # Create new program
        program = MaintenanceProgram(
            id=str(uuid.uuid4()),
            program_name=f"Maintenance Program - {equipment.get('name', equipment_id)}",
            equipment_id=equipment_id,
            equipment_name=equipment.get("name", ""),
            equipment_tag=equipment.get("tag"),
            equipment_type_id=equipment.get("equipment_type_id"),
            equipment_type_name=equipment.get("equipment_type_name"),
            criticality_level=criticality_level,
            criticality_score=criticality_score,
            status=ProgramStatus.DRAFT,
            created_by=user_id,
        )
        
        # Generate tasks from strategy if requested
        if generate_from_strategy and equipment.get("equipment_type_id"):
            tasks = await MaintenanceProgramService.generate_tasks_from_strategy(
                equipment_type_id=equipment.get("equipment_type_id"),
                equipment_id=equipment_id,
                criticality_level=criticality_level,
                user_id=user_id
            )
            program.tasks = tasks
            program.source_strategy_id = equipment.get("equipment_type_id")
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
        await db.maintenance_programs_v2.insert_one(program.model_dump())
        
        # Log audit
        await MaintenanceProgramService._log_audit(
            action="create_program",
            equipment_id=equipment_id,
            user_id=user_id,
            details={"total_tasks": len(program.tasks)}
        )
        
        return program
    
    @staticmethod
    async def generate_tasks_from_strategy(
        equipment_type_id: str,
        equipment_id: str,
        criticality_level: str = "low",
        user_id: Optional[str] = None
    ) -> List[MaintenanceProgramTask]:
        """Generate maintenance tasks from equipment type strategy"""
        
        # Get strategy
        strategy = await db.equipment_type_strategies.find_one(
            {"equipment_type_id": equipment_type_id},
            {"_id": 0}
        )
        
        if not strategy:
            logger.warning(f"No strategy found for equipment type: {equipment_type_id}")
            return []
        
        tasks = []
        task_templates = strategy.get("task_templates", [])
        failure_mode_strategies = strategy.get("failure_mode_strategies", [])
        
        # Build reverse map: task_id -> failure modes
        task_to_fms = {}
        for fm in failure_mode_strategies:
            for tid in fm.get("task_ids", []):
                if tid not in task_to_fms:
                    task_to_fms[tid] = []
                task_to_fms[tid].append(fm)
        
        for template in task_templates:
            # Skip if not mandatory
            if not template.get("is_mandatory", True):
                continue
            
            # Skip reactive/corrective tasks
            task_type = template.get("task_type", "preventive")
            if task_type in ("reactive", "corrective"):
                continue
            
            # Get frequency based on criticality
            freq_matrix = template.get("frequency_matrix", {})
            frequency_str = freq_matrix.get(criticality_level, "monthly")
            
            try:
                frequency = TaskFrequency(frequency_str)
            except ValueError:
                frequency = TaskFrequency.MONTHLY
            
            # Get linked failure mode info
            template_id = template.get("id")
            linked_fms = task_to_fms.get(template_id, [])
            fm_id = linked_fms[0].get("failure_mode_id") if linked_fms else None
            fm_name = linked_fms[0].get("failure_mode_name") if linked_fms else None
            
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
    
    @staticmethod
    async def add_task(
        equipment_id: str,
        task_title: str,
        task_description: Optional[str] = None,
        frequency: TaskFrequency = TaskFrequency.MONTHLY,
        estimated_duration_hours: float = 1.0,
        task_category: TaskCategory = TaskCategory.PREVENTIVE_MAINTENANCE,
        task_source: TaskSource = TaskSource.MANUAL,
        priority: TaskPriority = TaskPriority.MEDIUM,
        skill_requirement: SkillRequirement = SkillRequirement.TECHNICIAN,
        discipline: Optional[str] = None,
        procedure_steps: List[str] = None,
        acceptance_criteria: List[str] = None,
        tools_required: List[str] = None,
        spare_parts: List[str] = None,
        traceability: Optional[TaskTraceability] = None,
        user_id: Optional[str] = None
    ) -> Tuple[MaintenanceProgramTask, str]:
        """Add a task to a maintenance program. Returns (task, new_version)"""
        
        program = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id})
        if not program:
            raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
        
        # Create task
        task = MaintenanceProgramTask(
            id=str(uuid.uuid4()),
            task_title=task_title,
            task_description=task_description,
            frequency=frequency,
            frequency_days=frequency_to_days(frequency.value),
            estimated_duration_hours=estimated_duration_hours,
            task_category=task_category,
            task_source=task_source,
            priority=priority,
            skill_requirement=skill_requirement,
            discipline=discipline,
            procedure_steps=procedure_steps or [],
            acceptance_criteria=acceptance_criteria or [],
            tools_required=tools_required or [],
            spare_parts=spare_parts or [],
            traceability=traceability or TaskTraceability(),
            created_by=user_id
        )
        
        # Bump version
        new_version = MaintenanceProgramService._bump_version(program.get("version", "1.0"))
        
        # Update program
        await db.maintenance_programs_v2.update_one(
            {"equipment_id": equipment_id},
            {
                "$push": {
                    "tasks": task.model_dump(),
                    "version_history": ProgramVersionEntry(
                        version=new_version,
                        change_type="task_added",
                        change_summary=f"Added task: {task_title}",
                        tasks_added=1,
                        previous_version=program.get("version"),
                        changed_by=user_id
                    ).model_dump()
                },
                "$set": {
                    "version": new_version,
                    "updated_at": datetime.utcnow().isoformat()
                },
                "$inc": {
                    "total_tasks": 1,
                    "active_tasks": 1 if task.is_active else 0,
                    "manual_tasks": 1 if task_source == TaskSource.MANUAL else 0,
                    "imported_tasks": 1 if task_source == TaskSource.CUSTOMER_IMPORTED else 0,
                    "ai_tasks": 1 if task_source == TaskSource.AI_GENERATED else 0
                }
            }
        )
        
        # Log audit
        await MaintenanceProgramService._log_audit(
            action="add_task",
            equipment_id=equipment_id,
            user_id=user_id,
            details={"task_id": task.id, "task_title": task_title, "source": task_source.value}
        )
        
        return task, new_version
    
    @staticmethod
    async def update_task(
        equipment_id: str,
        task_id: str,
        updates: Dict[str, Any],
        override_reason: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Tuple[Dict[str, Any], str]:
        """Update a task in a maintenance program. Returns (updated_task, new_version)"""
        
        program = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id})
        if not program:
            raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
        
        tasks = program.get("tasks", [])
        task_found = False
        updated_task = None
        
        for i, task in enumerate(tasks):
            if task.get("id") == task_id:
                # Track if this is an override
                is_override = task.get("task_source") == TaskSource.STRATEGY_GENERATED.value
                
                # Apply updates
                for key, value in updates.items():
                    if key == "frequency" and isinstance(value, str):
                        tasks[i]["frequency"] = value
                        tasks[i]["frequency_days"] = frequency_to_days(value)
                    elif key in ["task_title", "task_description", "estimated_duration_hours",
                                "task_category", "priority", "skill_requirement", "discipline",
                                "procedure_steps", "acceptance_criteria", "is_active", "is_mandatory",
                                "tools_required", "spare_parts", "skills_required"]:
                        if isinstance(value, Enum):
                            tasks[i][key] = value.value
                        else:
                            tasks[i][key] = value
                
                # Mark as overridden if strategy task
                if is_override and override_reason:
                    tasks[i]["is_overridden"] = True
                    if "traceability" not in tasks[i]:
                        tasks[i]["traceability"] = {}
                    tasks[i]["traceability"]["override_reason"] = override_reason
                    tasks[i]["traceability"]["overridden_at"] = datetime.utcnow().isoformat()
                    tasks[i]["traceability"]["overridden_by"] = user_id
                
                tasks[i]["updated_at"] = datetime.utcnow().isoformat()
                updated_task = tasks[i]
                task_found = True
                break
        
        if not task_found:
            raise ValueError(f"Task not found: {task_id}")
        
        # Bump version
        new_version = MaintenanceProgramService._bump_version(program.get("version", "1.0"))
        
        # Update program
        await db.maintenance_programs_v2.update_one(
            {"equipment_id": equipment_id},
            {
                "$set": {
                    "tasks": tasks,
                    "version": new_version,
                    "updated_at": datetime.utcnow().isoformat()
                },
                "$push": {
                    "version_history": ProgramVersionEntry(
                        version=new_version,
                        change_type="task_modified",
                        change_summary=f"Modified task: {updated_task.get('task_title', task_id)}",
                        tasks_modified=1,
                        previous_version=program.get("version"),
                        changed_by=user_id
                    ).model_dump()
                }
            }
        )
        
        # Log audit
        await MaintenanceProgramService._log_audit(
            action="update_task",
            equipment_id=equipment_id,
            user_id=user_id,
            details={"task_id": task_id, "updates": list(updates.keys())}
        )
        
        return updated_task, new_version
    
    @staticmethod
    async def delete_task(
        equipment_id: str,
        task_id: str,
        user_id: Optional[str] = None
    ) -> str:
        """Delete a task from a maintenance program. Returns new_version"""
        
        program = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id})
        if not program:
            raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
        
        tasks = program.get("tasks", [])
        task_to_delete = None
        
        for task in tasks:
            if task.get("id") == task_id:
                task_to_delete = task
                break
        
        if not task_to_delete:
            raise ValueError(f"Task not found: {task_id}")
        
        # Bump version
        new_version = MaintenanceProgramService._bump_version(program.get("version", "1.0"))
        
        # Determine count decrements
        source = task_to_delete.get("task_source", "manual")
        
        # Update program
        await db.maintenance_programs_v2.update_one(
            {"equipment_id": equipment_id},
            {
                "$pull": {"tasks": {"id": task_id}},
                "$set": {
                    "version": new_version,
                    "updated_at": datetime.utcnow().isoformat()
                },
                "$push": {
                    "version_history": ProgramVersionEntry(
                        version=new_version,
                        change_type="task_removed",
                        change_summary=f"Removed task: {task_to_delete.get('task_title', task_id)}",
                        tasks_removed=1,
                        previous_version=program.get("version"),
                        changed_by=user_id
                    ).model_dump()
                },
                "$inc": {
                    "total_tasks": -1,
                    "active_tasks": -1 if task_to_delete.get("is_active", True) else 0,
                    "manual_tasks": -1 if source == "manual" else 0,
                    "imported_tasks": -1 if source == "customer_imported" else 0,
                    "ai_tasks": -1 if source == "ai_generated" else 0,
                    "strategy_tasks": -1 if source == "strategy_generated" else 0
                }
            }
        )
        
        # Log audit
        await MaintenanceProgramService._log_audit(
            action="delete_task",
            equipment_id=equipment_id,
            user_id=user_id,
            details={"task_id": task_id, "task_title": task_to_delete.get("task_title")}
        )
        
        return new_version
    
    # ============= Program Regeneration =============
    
    @staticmethod
    async def regenerate_program(
        equipment_id: str,
        preserve_overrides: bool = True,
        preserve_manual_tasks: bool = True,
        preserve_imported_tasks: bool = True,
        preview_only: bool = False,
        user_id: Optional[str] = None
    ) -> Tuple[MaintenanceProgram, ProgramChangePreview]:
        """Regenerate a maintenance program from strategy"""
        
        program_doc = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id})
        if not program_doc:
            raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
        
        program = MaintenanceProgram(**program_doc)
        equipment_type_id = program.equipment_type_id
        
        if not equipment_type_id:
            raise ValueError("Equipment has no equipment type - cannot regenerate from strategy")
        
        # Get current strategy
        strategy = await db.equipment_type_strategies.find_one(
            {"equipment_type_id": equipment_type_id},
            {"_id": 0}
        )
        
        if not strategy:
            raise ValueError(f"No strategy found for equipment type: {equipment_type_id}")
        
        # Collect preserved tasks
        preserved_tasks = []
        preserved_overrides = []
        current_strategy_task_ids = set()
        
        for task in program.tasks:
            source = task.task_source if hasattr(task, 'task_source') else task.get("task_source")
            
            # Preserve manual tasks
            if preserve_manual_tasks and source == TaskSource.MANUAL.value:
                preserved_tasks.append(task)
            
            # Preserve imported tasks
            elif preserve_imported_tasks and source == TaskSource.CUSTOMER_IMPORTED.value:
                preserved_tasks.append(task)
            
            # Preserve AI tasks
            elif source == TaskSource.AI_GENERATED.value:
                preserved_tasks.append(task)
            
            # Preserve overridden strategy tasks
            elif preserve_overrides and source == TaskSource.STRATEGY_GENERATED.value:
                is_overridden = task.is_overridden if hasattr(task, 'is_overridden') else task.get("is_overridden", False)
                if is_overridden:
                    traceability = task.traceability if hasattr(task, 'traceability') else task.get("traceability", {})
                    template_id = traceability.get("task_template_id") if isinstance(traceability, dict) else getattr(traceability, 'task_template_id', None)
                    if template_id:
                        current_strategy_task_ids.add(template_id)
                        preserved_overrides.append(task)
        
        # Generate new tasks from strategy
        new_strategy_tasks = await MaintenanceProgramService.generate_tasks_from_strategy(
            equipment_type_id=equipment_type_id,
            equipment_id=equipment_id,
            criticality_level=program.criticality_level or "low",
            user_id=user_id
        )
        
        # Build change preview
        preview = ProgramChangePreview()
        final_tasks = []
        
        # Add preserved non-strategy tasks
        for task in preserved_tasks:
            task_dict = task.model_dump() if hasattr(task, 'model_dump') else task
            final_tasks.append(task_dict)
            if task_dict.get("task_source") == TaskSource.MANUAL.value:
                preview.preserved_manual_tasks.append({"task_title": task_dict.get("task_title"), "id": task_dict.get("id")})
        
        # Process new strategy tasks
        for new_task in new_strategy_tasks:
            template_id = new_task.traceability.task_template_id
            
            # Check if we have an override for this task
            override_found = False
            for override in preserved_overrides:
                override_traceability = override.traceability if hasattr(override, 'traceability') else override.get("traceability", {})
                override_template_id = override_traceability.get("task_template_id") if isinstance(override_traceability, dict) else getattr(override_traceability, 'task_template_id', None)
                
                if override_template_id == template_id:
                    # Keep the override
                    override_dict = override.model_dump() if hasattr(override, 'model_dump') else override
                    final_tasks.append(override_dict)
                    preview.preserved_overrides.append({
                        "task_title": override_dict.get("task_title"),
                        "id": override_dict.get("id"),
                        "template_id": template_id
                    })
                    override_found = True
                    break
            
            if not override_found:
                # Add new strategy task
                task_dict = new_task.model_dump()
                final_tasks.append(task_dict)
                preview.tasks_to_add.append({
                    "task_title": task_dict.get("task_title"),
                    "id": task_dict.get("id"),
                    "frequency": task_dict.get("frequency")
                })
        
        # Identify tasks to remove (old strategy tasks not in new strategy)
        old_strategy_template_ids = set()
        for task in program.tasks:
            task_dict = task.model_dump() if hasattr(task, 'model_dump') else task
            if task_dict.get("task_source") == TaskSource.STRATEGY_GENERATED.value:
                traceability = task_dict.get("traceability", {})
                if traceability.get("task_template_id"):
                    old_strategy_template_ids.add(traceability["task_template_id"])
        
        new_strategy_template_ids = {t.traceability.task_template_id for t in new_strategy_tasks}
        removed_template_ids = old_strategy_template_ids - new_strategy_template_ids - current_strategy_task_ids
        
        for task in program.tasks:
            task_dict = task.model_dump() if hasattr(task, 'model_dump') else task
            traceability = task_dict.get("traceability", {})
            if traceability.get("task_template_id") in removed_template_ids:
                preview.tasks_to_remove.append({
                    "task_title": task_dict.get("task_title"),
                    "id": task_dict.get("id")
                })
        
        if preview_only:
            return program, preview
        
        # Apply changes
        new_version = MaintenanceProgramService._bump_version(program.version)
        
        # Update program document
        update_data = {
            "tasks": final_tasks,
            "version": new_version,
            "source_strategy_version": strategy.get("version", "1.0"),
            "last_strategy_sync": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        # Calculate new statistics
        total_tasks = len(final_tasks)
        active_tasks = sum(1 for t in final_tasks if t.get("is_active", True))
        strategy_tasks = sum(1 for t in final_tasks if t.get("task_source") == TaskSource.STRATEGY_GENERATED.value)
        imported_tasks = sum(1 for t in final_tasks if t.get("task_source") == TaskSource.CUSTOMER_IMPORTED.value)
        ai_tasks = sum(1 for t in final_tasks if t.get("task_source") == TaskSource.AI_GENERATED.value)
        manual_tasks = sum(1 for t in final_tasks if t.get("task_source") == TaskSource.MANUAL.value)
        
        update_data.update({
            "total_tasks": total_tasks,
            "active_tasks": active_tasks,
            "strategy_tasks": strategy_tasks,
            "imported_tasks": imported_tasks,
            "ai_tasks": ai_tasks,
            "manual_tasks": manual_tasks
        })
        
        await db.maintenance_programs_v2.update_one(
            {"equipment_id": equipment_id},
            {
                "$set": update_data,
                "$push": {
                    "version_history": ProgramVersionEntry(
                        version=new_version,
                        change_type="regenerated",
                        change_summary=f"Regenerated from strategy v{strategy.get('version', '1.0')}: +{len(preview.tasks_to_add)} tasks, -{len(preview.tasks_to_remove)} tasks",
                        tasks_added=len(preview.tasks_to_add),
                        tasks_removed=len(preview.tasks_to_remove),
                        previous_version=program.version,
                        changed_by=user_id
                    ).model_dump()
                }
            }
        )
        
        # Log audit
        await MaintenanceProgramService._log_audit(
            action="regenerate_program",
            equipment_id=equipment_id,
            user_id=user_id,
            details={
                "tasks_added": len(preview.tasks_to_add),
                "tasks_removed": len(preview.tasks_to_remove),
                "overrides_preserved": len(preview.preserved_overrides)
            }
        )
        
        # Fetch updated program
        updated_doc = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id}, {"_id": 0})
        return MaintenanceProgram(**updated_doc), preview
    
    # ============= Import from PM Import =============
    
    @staticmethod
    async def import_tasks_from_session(
        equipment_id: str,
        import_session_id: str,
        task_ids: Optional[List[str]] = None,
        user_id: Optional[str] = None
    ) -> Tuple[int, str]:
        """Import tasks from a PM Import session. Returns (tasks_imported, new_version)"""
        
        # Get import session
        session = await db.pm_import_sessions.find_one(
            {"session_id": import_session_id},
            {"_id": 0}
        )
        
        if not session:
            raise ValueError(f"Import session not found: {import_session_id}")
        
        # Get accepted tasks
        extracted_tasks = session.get("extracted_tasks", [])
        tasks_to_import = []
        
        for task in extracted_tasks:
            review_status = task.get("review_status", "pending")
            if review_status != "accepted":
                continue
            
            if task_ids and task.get("id") not in task_ids:
                continue
            
            tasks_to_import.append(task)
        
        if not tasks_to_import:
            return 0, ""
        
        # Import each task
        imported_count = 0
        new_version = None
        
        for imported_task in tasks_to_import:
            # Map frequency
            frequency_str = imported_task.get("frequency", "monthly").lower()
            try:
                frequency = TaskFrequency(frequency_str)
            except ValueError:
                frequency = TaskFrequency.MONTHLY
            
            # Map category
            task_type = imported_task.get("task_type", "preventive").lower()
            category = MaintenanceProgramService.TASK_TYPE_TO_CATEGORY.get(
                task_type,
                TaskCategory.PREVENTIVE_MAINTENANCE
            )
            
            # Create traceability
            traceability = TaskTraceability(
                import_session_id=import_session_id,
                import_source_file=session.get("file_name"),
                import_row_reference=str(imported_task.get("row_index", "")),
                failure_mode_id=imported_task.get("matched_failure_mode_id"),
                failure_mode_name=imported_task.get("matched_failure_mode_name")
            )
            
            task, new_version = await MaintenanceProgramService.add_task(
                equipment_id=equipment_id,
                task_title=imported_task.get("task_name", "Imported Task"),
                task_description=imported_task.get("description"),
                frequency=frequency,
                estimated_duration_hours=imported_task.get("estimated_duration", 1.0),
                task_category=category,
                task_source=TaskSource.CUSTOMER_IMPORTED,
                procedure_steps=imported_task.get("procedure_steps", []),
                acceptance_criteria=imported_task.get("acceptance_criteria", []),
                traceability=traceability,
                user_id=user_id
            )
            imported_count += 1
        
        # Update program with import tracking
        await db.maintenance_programs_v2.update_one(
            {"equipment_id": equipment_id},
            {
                "$set": {
                    "last_import_session_id": import_session_id,
                    "last_import_date": datetime.utcnow().isoformat()
                }
            }
        )
        
        return imported_count, new_version or ""
    
    # ============= AI Recommendations =============
    
    @staticmethod
    async def generate_ai_recommendations(
        equipment_id: str,
        include_failure_history: bool = True,
        include_industry_standards: bool = True,
        max_recommendations: int = 10,
        user_id: Optional[str] = None
    ) -> List[MaintenanceProgramTask]:
        """Generate AI maintenance recommendations"""
        
        from services.openai_service import get_openai_response
        
        program = await db.maintenance_programs_v2.find_one({"equipment_id": equipment_id})
        if not program:
            raise ValueError(f"No maintenance program found for equipment: {equipment_id}")
        
        # Gather context
        equipment = await db.equipment_nodes.find_one({"id": equipment_id}, {"_id": 0})
        if not equipment:
            raise ValueError(f"Equipment not found: {equipment_id}")
        
        equipment_type = equipment.get("equipment_type_name", "Unknown Equipment")
        criticality = program.get("criticality_level", "medium")
        existing_tasks = [t.get("task_title") for t in program.get("tasks", [])]
        
        # Get failure history if requested
        failure_context = ""
        if include_failure_history:
            observations = await db.observations.find(
                {"equipment_id": equipment_id},
                {"title": 1, "description": 1, "failure_mode": 1, "_id": 0}
            ).sort("created_at", -1).limit(20).to_list(20)
            
            if observations:
                failure_context = "\n\nRecent failure history:\n"
                for obs in observations:
                    failure_context += f"- {obs.get('title', 'Unknown')}: {obs.get('failure_mode', 'N/A')}\n"
        
        # Get equipment type failure modes
        fm_context = ""
        if equipment.get("equipment_type_id"):
            failure_modes = await db.failure_modes.find(
                {"equipment_type": equipment_type},
                {"failure_mode": 1, "detection_methods": 1, "_id": 0}
            ).limit(30).to_list(30)
            
            if failure_modes:
                fm_context = f"\n\nKnown failure modes for {equipment_type}:\n"
                for fm in failure_modes:
                    fm_context += f"- {fm.get('failure_mode', 'Unknown')}\n"
        
        # Build AI prompt
        prompt = f"""You are a maintenance engineering expert. Analyze the following equipment and recommend additional maintenance tasks.

Equipment: {equipment.get('name', equipment_id)}
Equipment Type: {equipment_type}
Criticality: {criticality}

Existing maintenance tasks:
{chr(10).join([f'- {t}' for t in existing_tasks[:20]]) if existing_tasks else '- None currently defined'}
{failure_context}
{fm_context}

Based on ISO 14224 standards and industry best practices, recommend up to {max_recommendations} additional maintenance tasks that are NOT already in the existing task list.

For each recommendation, provide:
1. Task title (concise, action-oriented)
2. Description (brief explanation of what and why)
3. Frequency (daily, weekly, monthly, quarterly, semi_annual, annual)
4. Category (inspection, condition_monitoring, preventive_maintenance, lubrication, calibration, cleaning, safety_verification)
5. Estimated duration in hours
6. Reasoning (why this task is recommended)

Format your response as JSON array:
[
  {{
    "task_title": "...",
    "description": "...",
    "frequency": "...",
    "category": "...",
    "duration_hours": ...,
    "reasoning": "..."
  }}
]

Only include tasks that would genuinely improve reliability and are not redundant with existing tasks."""

        try:
            response = await get_openai_response(
                prompt=prompt,
                model="gpt-4o-mini",
                response_format={"type": "json_object"},
                system_message="You are a maintenance engineering expert specializing in ISO 14224 standards and reliability-centered maintenance."
            )
            
            import json
            
            # Parse response
            try:
                # Handle if response is wrapped in a key
                if isinstance(response, str):
                    response_data = json.loads(response)
                else:
                    response_data = response
                
                if isinstance(response_data, dict):
                    recommendations = response_data.get("recommendations", response_data.get("tasks", []))
                    if not recommendations and "task_title" in response_data:
                        recommendations = [response_data]
                else:
                    recommendations = response_data
                
            except json.JSONDecodeError:
                logger.error(f"Failed to parse AI response: {response[:500]}")
                recommendations = []
            
            # Convert to tasks
            ai_tasks = []
            for rec in recommendations[:max_recommendations]:
                # Map frequency
                freq_str = rec.get("frequency", "monthly").lower()
                try:
                    frequency = TaskFrequency(freq_str)
                except ValueError:
                    frequency = TaskFrequency.MONTHLY
                
                # Map category
                cat_str = rec.get("category", "preventive_maintenance").lower()
                try:
                    category = TaskCategory(cat_str)
                except ValueError:
                    category = TaskCategory.PREVENTIVE_MAINTENANCE
                
                task = MaintenanceProgramTask(
                    id=str(uuid.uuid4()),
                    task_title=rec.get("task_title", "AI Recommended Task"),
                    task_description=rec.get("description"),
                    frequency=frequency,
                    frequency_days=frequency_to_days(frequency.value),
                    estimated_duration_hours=rec.get("duration_hours", 1.0),
                    task_category=category,
                    task_source=TaskSource.AI_GENERATED,
                    priority=TaskPriority.MEDIUM,
                    is_active=False,  # AI recommendations start inactive until approved
                    traceability=TaskTraceability(
                        ai_model="gpt-4o-mini",
                        ai_confidence=0.85,
                        ai_reasoning=rec.get("reasoning")
                    ),
                    created_by=user_id
                )
                ai_tasks.append(task)
            
            # Update program with AI tracking
            if ai_tasks:
                await db.maintenance_programs_v2.update_one(
                    {"equipment_id": equipment_id},
                    {
                        "$set": {
                            "last_ai_analysis_date": datetime.utcnow().isoformat(),
                            "ai_recommendations_pending": len(ai_tasks)
                        }
                    }
                )
            
            # Log audit
            await MaintenanceProgramService._log_audit(
                action="generate_ai_recommendations",
                equipment_id=equipment_id,
                user_id=user_id,
                details={"recommendations_count": len(ai_tasks)}
            )
            
            return ai_tasks
            
        except Exception as e:
            logger.error(f"AI recommendation generation failed: {e}")
            raise
    
    @staticmethod
    async def accept_ai_recommendation(
        equipment_id: str,
        task: MaintenanceProgramTask,
        user_id: Optional[str] = None
    ) -> Tuple[MaintenanceProgramTask, str]:
        """Accept an AI recommendation and add it to the program"""
        
        # Activate the task
        task.is_active = True
        
        # Add to program
        result_task, new_version = await MaintenanceProgramService.add_task(
            equipment_id=equipment_id,
            task_title=task.task_title,
            task_description=task.task_description,
            frequency=task.frequency,
            estimated_duration_hours=task.estimated_duration_hours,
            task_category=task.task_category,
            task_source=TaskSource.AI_GENERATED,
            priority=task.priority,
            skill_requirement=task.skill_requirement,
            procedure_steps=task.procedure_steps,
            traceability=task.traceability,
            user_id=user_id
        )
        
        # Decrement pending count
        await db.maintenance_programs_v2.update_one(
            {"equipment_id": equipment_id},
            {"$inc": {"ai_recommendations_pending": -1}}
        )
        
        return result_task, new_version
    
    # ============= Utility Methods =============
    
    @staticmethod
    def _bump_version(version: str) -> str:
        """Increment version number"""
        try:
            major, minor = map(int, version.split("."))
            return f"{major}.{minor + 1}"
        except (ValueError, AttributeError):
            return "1.1"
    
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
    
    @staticmethod
    async def _log_audit(
        action: str,
        equipment_id: str,
        user_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """Log audit entry for maintenance program changes"""
        await db.maintenance_program_audit.insert_one({
            "action": action,
            "equipment_id": equipment_id,
            "user_id": user_id,
            "details": details or {},
            "timestamp": datetime.utcnow().isoformat()
        })
