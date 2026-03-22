"""
Maintenance Strategy Generator - AI-powered generation from FMEA data
Generates comprehensive strategies for ALL criticality levels per equipment type
"""

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

from maintenance_strategy_models import (
    MaintenanceStrategy, CriticalityLevel, MaintenanceFrequency,
    DetectionSystemType, MaintenanceType, CriticalityStrategy,
    OperatorRound, OperatorCheckItem,
    DetectionSystem, MaintenanceTask,
    CorrectiveAction, EmergencyProcedure,
    SparePart, FailureModeMapping
)

logger = logging.getLogger(__name__)


STRATEGY_GENERATION_PROMPT = """You are an expert Reliability Engineer. Generate a COMPLETE maintenance strategy for ALL 4 criticality levels for the given equipment type.

CRITICALITY LEVELS (generate strategy for EACH):
1. safety_critical: Most comprehensive - continuous monitoring, shift-based rounds, immediate response
2. production_critical: High monitoring - daily rounds, 4-hour response
3. medium: Standard monitoring - weekly rounds, 24-hour response  
4. low: Basic inspections - monthly rounds, planned response

For EACH criticality level, provide:
- Operator rounds with specific checklists
- Detection systems (vibration, temperature, pressure, etc.)
- Scheduled maintenance tasks
- Corrective actions
- Emergency procedures (safety_critical and production_critical only)

Also provide:
- Common spare parts (applicable to all levels)
- Failure mode mappings

RESPOND ONLY WITH VALID JSON:
{
  "strategies_by_criticality": [
    {
      "criticality_level": "safety_critical",
      "operator_rounds": [
        {
          "id": "sc_round_1",
          "name": "Shift Inspection",
          "frequency": "shift",
          "duration_minutes": 20,
          "checklist": [
            {"id": "sc_c1", "description": "Check vibration levels", "check_type": "measurement", "acceptable_range": "<4.5 mm/s", "failure_modes_addressed": ["Bearing failure"]}
          ],
          "skills_required": ["Operator"],
          "ppe_required": ["Safety glasses", "Hearing protection"]
        }
      ],
      "detection_systems": [
        {
          "id": "sc_det_1",
          "name": "Continuous Vibration Monitoring",
          "system_type": "vibration",
          "description": "24/7 vibration monitoring on bearing housings",
          "monitoring_interval": "continuous",
          "alarm_thresholds": {"warning": 4.5, "critical": 7.1},
          "failure_modes_detected": ["Bearing failure", "Imbalance"],
          "installation_cost_eur": 3500
        }
      ],
      "scheduled_maintenance": [
        {
          "id": "sc_task_1",
          "name": "Bearing inspection and lubrication",
          "description": "Detailed bearing inspection with vibration analysis",
          "maintenance_type": "predictive",
          "interval": "monthly",
          "duration_hours": 4,
          "skills_required": ["Mechanical Technician"],
          "tools_required": ["Vibration analyzer", "Grease gun"],
          "spare_parts": ["Grease cartridge"],
          "failure_modes_addressed": ["Bearing failure"],
          "estimated_cost_eur": 400
        }
      ],
      "corrective_actions": [
        {
          "id": "sc_corr_1",
          "trigger_condition": "Vibration exceeds warning threshold",
          "action_description": "Immediate inspection required within 4 hours",
          "response_time_hours": 4,
          "priority": "critical",
          "failure_modes": ["Bearing failure"]
        }
      ],
      "emergency_procedures": [
        {
          "id": "sc_emerg_1",
          "condition": "Bearing seizure or catastrophic failure",
          "immediate_actions": ["Emergency stop", "Isolate power", "Evacuate area"],
          "notification_list": ["Shift Supervisor", "Safety Officer", "Maintenance Manager"],
          "safety_precautions": ["Lock out/Tag out", "Fire watch", "Allow to cool"],
          "recovery_steps": ["Damage assessment", "Replace bearings", "Alignment check"],
          "estimated_downtime_hours": 48
        }
      ],
      "estimated_annual_cost_eur": 25000,
      "expected_availability_percent": 99.5
    },
    {
      "criticality_level": "production_critical",
      "operator_rounds": [...],
      "detection_systems": [...],
      "scheduled_maintenance": [...],
      "corrective_actions": [...],
      "emergency_procedures": [...],
      "estimated_annual_cost_eur": 18000,
      "expected_availability_percent": 98.5
    },
    {
      "criticality_level": "medium",
      "operator_rounds": [...],
      "detection_systems": [...],
      "scheduled_maintenance": [...],
      "corrective_actions": [...],
      "emergency_procedures": [],
      "estimated_annual_cost_eur": 12000,
      "expected_availability_percent": 97.0
    },
    {
      "criticality_level": "low",
      "operator_rounds": [...],
      "detection_systems": [...],
      "scheduled_maintenance": [...],
      "corrective_actions": [...],
      "emergency_procedures": [],
      "estimated_annual_cost_eur": 6000,
      "expected_availability_percent": 95.0
    }
  ],
  "spare_parts": [
    {
      "id": "spare_1",
      "part_name": "Bearing kit",
      "part_number": "BRG-001",
      "quantity_recommended": 2,
      "criticality": "high",
      "lead_time_days": 14,
      "estimated_cost_eur": 450,
      "failure_modes_addressed": ["Bearing failure"]
    }
  ],
  "failure_mode_mappings": [
    {
      "failure_mode_name": "Bearing failure",
      "equipment_type": "Centrifugal Pump",
      "detection_methods": ["sc_det_1"],
      "operator_checks": ["sc_c1"],
      "preventive_tasks": ["sc_task_1"],
      "recommended_interval": "monthly",
      "risk_if_unaddressed": "high"
    }
  ],
  "total_annual_cost_estimate_eur": 15000
}

Generate COMPLETE and REALISTIC strategies for each criticality level. Include at least:
- 2-3 operator rounds per high criticality, 1-2 for lower
- 2-4 detection systems for safety_critical, scaling down
- 3-5 maintenance tasks per level
- 2-4 corrective actions per level
- 1-2 emergency procedures for safety/production critical
- 4-8 spare parts total"""


class MaintenanceStrategyGenerator:
    """AI-powered maintenance strategy generator"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
    
    def _create_chat(self, session_id: str) -> LlmChat:
        """Create a new LLM chat instance"""
        return LlmChat(
            api_key=self.api_key,
            session_id=session_id,
            system_message=STRATEGY_GENERATION_PROMPT
        ).with_model("openai", "gpt-5.2")
    
    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from LLM response, handling markdown code blocks"""
        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()
        return json.loads(clean_response)
    
    def _build_fmea_context(self, equipment_type: str, failure_modes: List[dict]) -> str:
        """Build context string with FMEA data"""
        context = f"""
EQUIPMENT TYPE: {equipment_type}

FAILURE MODES FROM FMEA DATABASE:
"""
        for fm in failure_modes[:15]:  # Limit to 15 failure modes
            context += f"""
- Failure Mode: {fm.get('failure_mode', 'Unknown')}
  Category: {fm.get('category', 'Unknown')}
  Severity: {fm.get('severity', 'N/A')}/10
  Occurrence: {fm.get('occurrence', 'N/A')}/10
  Detectability: {fm.get('detectability', 'N/A')}/10
  RPN: {fm.get('rpn', 'N/A')}
  Recommended Actions: {', '.join(fm.get('recommended_actions', [])[:3]) or 'None specified'}
"""
        
        context += f"""
Generate a COMPLETE maintenance strategy for {equipment_type} covering ALL 4 criticality levels.
Address each failure mode appropriately for each criticality level.
"""
        return context
    
    def _parse_criticality_strategy(self, data: dict) -> CriticalityStrategy:
        """Parse a single criticality strategy from JSON"""
        # Parse operator rounds
        operator_rounds = []
        for round_data in data.get("operator_rounds", []):
            checklist = [
                OperatorCheckItem(
                    id=check.get("id", str(uuid.uuid4())),
                    description=check.get("description", ""),
                    check_type=check.get("check_type", "visual"),
                    acceptable_range=check.get("acceptable_range"),
                    unit=check.get("unit"),
                    failure_modes_addressed=check.get("failure_modes_addressed", [])
                ) for check in round_data.get("checklist", [])
            ]
            operator_rounds.append(OperatorRound(
                id=round_data.get("id", str(uuid.uuid4())),
                name=round_data.get("name", "Operator Round"),
                frequency=MaintenanceFrequency(round_data.get("frequency", "daily")),
                duration_minutes=round_data.get("duration_minutes", 15),
                checklist=checklist,
                skills_required=round_data.get("skills_required", []),
                ppe_required=round_data.get("ppe_required", [])
            ))
        
        # Parse detection systems
        detection_systems = []
        for det_data in data.get("detection_systems", []):
            try:
                system_type = DetectionSystemType(det_data.get("system_type", "visual"))
            except ValueError:
                system_type = DetectionSystemType.VISUAL
            detection_systems.append(DetectionSystem(
                id=det_data.get("id", str(uuid.uuid4())),
                name=det_data.get("name", "Detection System"),
                system_type=system_type,
                description=det_data.get("description", ""),
                monitoring_interval=MaintenanceFrequency(det_data.get("monitoring_interval", "daily")),
                alarm_thresholds=det_data.get("alarm_thresholds"),
                failure_modes_detected=det_data.get("failure_modes_detected", []),
                installation_cost_eur=det_data.get("installation_cost_eur"),
                recommended_for_criticality=[]
            ))
        
        # Parse scheduled maintenance
        scheduled_maintenance = []
        for task_data in data.get("scheduled_maintenance", []):
            try:
                maint_type = MaintenanceType(task_data.get("maintenance_type", "preventive"))
            except ValueError:
                maint_type = MaintenanceType.PREVENTIVE
            scheduled_maintenance.append(MaintenanceTask(
                id=task_data.get("id", str(uuid.uuid4())),
                name=task_data.get("name", "Maintenance Task"),
                description=task_data.get("description", ""),
                maintenance_type=maint_type,
                interval=MaintenanceFrequency(task_data.get("interval", "monthly")),
                duration_hours=task_data.get("duration_hours", 2.0),
                skills_required=task_data.get("skills_required", []),
                tools_required=task_data.get("tools_required", []),
                spare_parts=task_data.get("spare_parts", []),
                failure_modes_addressed=task_data.get("failure_modes_addressed", []),
                estimated_cost_eur=task_data.get("estimated_cost_eur")
            ))
        
        # Parse corrective actions
        corrective_actions = []
        for corr_data in data.get("corrective_actions", []):
            corrective_actions.append(CorrectiveAction(
                id=corr_data.get("id", str(uuid.uuid4())),
                trigger_condition=corr_data.get("trigger_condition", ""),
                action_description=corr_data.get("action_description", ""),
                response_time_hours=corr_data.get("response_time_hours", 24),
                priority=corr_data.get("priority", "medium"),
                failure_modes=corr_data.get("failure_modes", []),
                escalation_path=corr_data.get("escalation_path")
            ))
        
        # Parse emergency procedures
        emergency_procedures = []
        for emerg_data in data.get("emergency_procedures", []):
            emergency_procedures.append(EmergencyProcedure(
                id=emerg_data.get("id", str(uuid.uuid4())),
                condition=emerg_data.get("condition", ""),
                immediate_actions=emerg_data.get("immediate_actions", []),
                notification_list=emerg_data.get("notification_list", []),
                safety_precautions=emerg_data.get("safety_precautions", []),
                recovery_steps=emerg_data.get("recovery_steps", []),
                estimated_downtime_hours=emerg_data.get("estimated_downtime_hours")
            ))
        
        return CriticalityStrategy(
            criticality_level=CriticalityLevel(data.get("criticality_level", "medium")),
            operator_rounds=operator_rounds,
            detection_systems=detection_systems,
            scheduled_maintenance=scheduled_maintenance,
            corrective_actions=corrective_actions,
            emergency_procedures=emergency_procedures,
            estimated_annual_cost_eur=data.get("estimated_annual_cost_eur"),
            expected_availability_percent=data.get("expected_availability_percent")
        )
    
    def _create_default_strategy(
        self,
        equipment_type_id: str,
        equipment_type_name: str,
        user_id: str,
        error_msg: str = ""
    ) -> MaintenanceStrategy:
        """Create a default fallback strategy when AI generation fails"""
        strategies = []
        
        for level, freq, response_hrs, cost, avail in [
            (CriticalityLevel.SAFETY_CRITICAL, MaintenanceFrequency.SHIFT, 4, 20000, 99.0),
            (CriticalityLevel.PRODUCTION_CRITICAL, MaintenanceFrequency.DAILY, 8, 15000, 98.0),
            (CriticalityLevel.MEDIUM, MaintenanceFrequency.WEEKLY, 24, 10000, 96.0),
            (CriticalityLevel.LOW, MaintenanceFrequency.MONTHLY, 48, 5000, 94.0),
        ]:
            strategies.append(CriticalityStrategy(
                criticality_level=level,
                operator_rounds=[
                    OperatorRound(
                        id=f"{level.value}_round_1",
                        name=f"{level.value.replace('_', ' ').title()} Inspection",
                        frequency=freq,
                        duration_minutes=15 if level in [CriticalityLevel.SAFETY_CRITICAL, CriticalityLevel.PRODUCTION_CRITICAL] else 10,
                        checklist=[
                            OperatorCheckItem(
                                id=f"{level.value}_check_1",
                                description="Visual inspection for leaks, noise, and vibration",
                                check_type="visual",
                                failure_modes_addressed=[]
                            ),
                            OperatorCheckItem(
                                id=f"{level.value}_check_2",
                                description="Check operating parameters (pressure, temperature, flow)",
                                check_type="measurement",
                                failure_modes_addressed=[]
                            )
                        ]
                    )
                ],
                detection_systems=[
                    DetectionSystem(
                        id=f"{level.value}_det_1",
                        name="Visual Monitoring",
                        system_type=DetectionSystemType.VISUAL,
                        description="Routine visual inspection",
                        monitoring_interval=freq,
                        failure_modes_detected=[]
                    )
                ] if level != CriticalityLevel.SAFETY_CRITICAL else [
                    DetectionSystem(
                        id=f"{level.value}_det_1",
                        name="Vibration Monitoring",
                        system_type=DetectionSystemType.VIBRATION,
                        description="Continuous vibration monitoring",
                        monitoring_interval=MaintenanceFrequency.CONTINUOUS,
                        alarm_thresholds={"warning": 4.5, "critical": 7.1},
                        failure_modes_detected=["Bearing failure", "Imbalance"]
                    )
                ],
                scheduled_maintenance=[
                    MaintenanceTask(
                        id=f"{level.value}_task_1",
                        name="Routine Maintenance",
                        description="Standard preventive maintenance",
                        maintenance_type=MaintenanceType.PREVENTIVE,
                        interval=MaintenanceFrequency.QUARTERLY if level == CriticalityLevel.SAFETY_CRITICAL else MaintenanceFrequency.SEMI_ANNUAL,
                        duration_hours=4,
                        skills_required=["Technician"],
                        failure_modes_addressed=[]
                    )
                ],
                corrective_actions=[
                    CorrectiveAction(
                        id=f"{level.value}_corr_1",
                        trigger_condition="Abnormal operation detected",
                        action_description=f"Schedule inspection within {response_hrs} hours",
                        response_time_hours=response_hrs,
                        priority="high" if level in [CriticalityLevel.SAFETY_CRITICAL, CriticalityLevel.PRODUCTION_CRITICAL] else "medium",
                        failure_modes=[]
                    )
                ],
                emergency_procedures=[
                    EmergencyProcedure(
                        id=f"{level.value}_emerg_1",
                        condition="Catastrophic failure",
                        immediate_actions=["Emergency stop", "Isolate power"],
                        notification_list=["Supervisor", "Maintenance"],
                        safety_precautions=["Lock out/Tag out"],
                        recovery_steps=["Assess damage", "Plan repairs"]
                    )
                ] if level in [CriticalityLevel.SAFETY_CRITICAL, CriticalityLevel.PRODUCTION_CRITICAL] else [],
                estimated_annual_cost_eur=cost,
                expected_availability_percent=avail
            ))
        
        return MaintenanceStrategy(
            id=str(uuid.uuid4()),
            equipment_type_id=equipment_type_id,
            equipment_type_name=equipment_type_name,
            strategy_version="1.0",
            description=f"Default maintenance strategy for {equipment_type_name}" + (f" ({error_msg})" if error_msg else ""),
            strategies_by_criticality=strategies,
            spare_parts=[
                SparePart(
                    id="default_spare_1",
                    part_name="Standard maintenance kit",
                    quantity_recommended=1,
                    criticality="medium",
                    failure_modes_addressed=[]
                )
            ],
            failure_mode_mappings=[],
            total_annual_cost_estimate_eur=12500,
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
            created_by=user_id,
            auto_generated=True
        )
    
    async def generate_strategy(
        self,
        equipment_type_id: str,
        equipment_type_name: str,
        failure_modes: List[dict],
        user_id: str
    ) -> MaintenanceStrategy:
        """Generate a complete maintenance strategy for ALL criticality levels"""
        try:
            session_id = f"strategy_gen_{equipment_type_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            chat = self._create_chat(session_id)
            
            context = self._build_fmea_context(equipment_type_name, failure_modes)
            message = UserMessage(text=context)
            
            response = await chat.send_message(message)
            data = self._parse_json_response(response)
            
            # Parse strategies for each criticality level
            strategies_by_criticality = []
            for crit_data in data.get("strategies_by_criticality", []):
                strategies_by_criticality.append(self._parse_criticality_strategy(crit_data))
            
            # Ensure we have all 4 criticality levels
            existing_levels = {s.criticality_level for s in strategies_by_criticality}
            for level in CriticalityLevel:
                if level not in existing_levels:
                    # Create a basic strategy for missing level
                    default = self._create_default_strategy(equipment_type_id, equipment_type_name, user_id)
                    for s in default.strategies_by_criticality:
                        if s.criticality_level == level:
                            strategies_by_criticality.append(s)
                            break
            
            # Sort by criticality order
            order = [CriticalityLevel.SAFETY_CRITICAL, CriticalityLevel.PRODUCTION_CRITICAL, 
                     CriticalityLevel.MEDIUM, CriticalityLevel.LOW]
            strategies_by_criticality.sort(key=lambda x: order.index(x.criticality_level))
            
            # Parse spare parts
            spare_parts = []
            for spare_data in data.get("spare_parts", []):
                spare_parts.append(SparePart(
                    id=spare_data.get("id", str(uuid.uuid4())),
                    part_name=spare_data.get("part_name", "Spare Part"),
                    part_number=spare_data.get("part_number"),
                    quantity_recommended=spare_data.get("quantity_recommended", 1),
                    criticality=spare_data.get("criticality", "medium"),
                    lead_time_days=spare_data.get("lead_time_days"),
                    estimated_cost_eur=spare_data.get("estimated_cost_eur"),
                    failure_modes_addressed=spare_data.get("failure_modes_addressed", [])
                ))
            
            # Parse failure mode mappings
            failure_mode_mappings = []
            for mapping_data in data.get("failure_mode_mappings", []):
                interval = mapping_data.get("recommended_interval")
                failure_mode_mappings.append(FailureModeMapping(
                    failure_mode_name=mapping_data.get("failure_mode_name", ""),
                    equipment_type=mapping_data.get("equipment_type", equipment_type_name),
                    detection_methods=mapping_data.get("detection_methods", []),
                    operator_checks=mapping_data.get("operator_checks", []),
                    preventive_tasks=mapping_data.get("preventive_tasks", []),
                    recommended_interval=MaintenanceFrequency(interval) if interval else None,
                    risk_if_unaddressed=mapping_data.get("risk_if_unaddressed", "medium")
                ))
            
            return MaintenanceStrategy(
                id=str(uuid.uuid4()),
                equipment_type_id=equipment_type_id,
                equipment_type_name=equipment_type_name,
                strategy_version="1.0",
                description=f"AI-generated maintenance strategy for {equipment_type_name} covering all criticality levels",
                strategies_by_criticality=strategies_by_criticality,
                spare_parts=spare_parts,
                failure_mode_mappings=failure_mode_mappings,
                total_annual_cost_estimate_eur=data.get("total_annual_cost_estimate_eur"),
                created_at=datetime.now(timezone.utc).isoformat(),
                updated_at=datetime.now(timezone.utc).isoformat(),
                created_by=user_id,
                auto_generated=True
            )
            
        except Exception as e:
            logger.error(f"Strategy generation failed: {e}")
            return self._create_default_strategy(
                equipment_type_id, equipment_type_name, user_id, 
                f"AI generation failed: {str(e)[:100]}"
            )
