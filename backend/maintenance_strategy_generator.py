"""
Maintenance Strategy Generator - AI-powered generation from FMEA data
Uses GPT-5.2 to translate failure modes into maintenance strategies
"""

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

from maintenance_strategy_models import (
    MaintenanceStrategy, CriticalityLevel, MaintenanceFrequency,
    DetectionSystemType, MaintenanceType,
    OperatorRound, OperatorCheckItem,
    DetectionSystem, MaintenanceTask,
    CorrectiveAction, EmergencyProcedure,
    SparePart, FailureModeMapping
)

logger = logging.getLogger(__name__)


STRATEGY_GENERATION_PROMPT = """You are an expert Reliability Engineer specializing in maintenance strategy development. 
Your task is to translate FMEA (Failure Mode and Effects Analysis) data into comprehensive maintenance strategies.

Given an equipment type and its associated failure modes, generate a complete maintenance strategy that includes:

1. OPERATOR ROUNDS - Regular inspections by operators
   - Frequency based on criticality (safety_critical: shift, production_critical: daily, medium: weekly, low: monthly)
   - Specific checklist items that address the failure modes
   - Visual, measurement, and functional checks

2. DETECTION SYSTEMS - Condition monitoring systems
   - Types: vibration, temperature, pressure, flow, acoustic, oil_analysis, thermography, ultrasonic, visual, electrical
   - Recommend systems that can detect the failure modes early
   - Include alarm thresholds where applicable
   - Only recommend systems appropriate for the criticality level

3. SCHEDULED MAINTENANCE - Preventive and predictive tasks
   - Types: preventive, predictive, condition_based
   - Intervals based on failure mode occurrence rates and criticality
   - Include specific tasks that prevent the failure modes

4. CORRECTIVE ACTIONS - Response procedures when issues are detected
   - Trigger conditions from operator rounds or monitoring systems
   - Response times based on priority
   - Clear action descriptions

5. EMERGENCY PROCEDURES - For critical failures (safety_critical and production_critical only)
   - Immediate actions
   - Safety precautions
   - Recovery steps

6. SPARE PARTS - Critical spare parts to stock
   - Based on failure modes and lead times
   - Quantity recommendations

7. FAILURE MODE MAPPINGS - Link each failure mode to its maintenance strategy elements

CRITICALITY ADJUSTMENTS:
- safety_critical: Most comprehensive strategy, continuous monitoring, immediate response
- production_critical: High-level monitoring, daily rounds, rapid response
- medium: Standard monitoring, weekly rounds, scheduled response
- low: Basic visual inspections, monthly rounds, planned response

RESPOND ONLY WITH VALID JSON in this exact format:
{
  "operator_rounds": [
    {
      "id": "round_1",
      "name": "Shift Inspection",
      "frequency": "shift",
      "duration_minutes": 15,
      "checklist": [
        {
          "id": "check_1",
          "description": "Check description",
          "check_type": "visual",
          "acceptable_range": null,
          "unit": null,
          "failure_modes_addressed": ["Failure Mode Name"]
        }
      ],
      "skills_required": ["Operator"],
      "ppe_required": ["Safety glasses", "Hearing protection"]
    }
  ],
  "detection_systems": [
    {
      "id": "det_1",
      "name": "Vibration Monitoring",
      "system_type": "vibration",
      "description": "Continuous vibration monitoring on bearing housings",
      "monitoring_interval": "continuous",
      "alarm_thresholds": {"warning": 4.5, "critical": 7.1},
      "failure_modes_detected": ["Bearing failure", "Imbalance"],
      "installation_cost_eur": 2500,
      "recommended_for_criticality": ["safety_critical", "production_critical"]
    }
  ],
  "scheduled_maintenance": [
    {
      "id": "task_1",
      "name": "Bearing inspection",
      "description": "Detailed description of the task",
      "maintenance_type": "preventive",
      "interval": "quarterly",
      "duration_hours": 4,
      "skills_required": ["Mechanical Technician"],
      "tools_required": ["Vibration analyzer"],
      "spare_parts": ["Bearing kit"],
      "failure_modes_addressed": ["Bearing failure"],
      "estimated_cost_eur": 500
    }
  ],
  "corrective_actions": [
    {
      "id": "corr_1",
      "trigger_condition": "Vibration exceeds warning threshold",
      "action_description": "Schedule bearing inspection within 48 hours",
      "response_time_hours": 48,
      "priority": "high",
      "failure_modes": ["Bearing failure"],
      "escalation_path": "Maintenance Supervisor"
    }
  ],
  "emergency_procedures": [
    {
      "id": "emerg_1",
      "condition": "Complete bearing seizure",
      "immediate_actions": ["Stop equipment immediately", "Isolate power"],
      "notification_list": ["Shift Supervisor", "Maintenance Manager"],
      "safety_precautions": ["Lock out/Tag out", "Allow to cool"],
      "recovery_steps": ["Inspect damage", "Replace bearings", "Check alignment"],
      "estimated_downtime_hours": 24
    }
  ],
  "spare_parts": [
    {
      "id": "spare_1",
      "part_name": "Bearing kit",
      "part_number": null,
      "quantity_recommended": 2,
      "criticality": "high",
      "lead_time_days": 14,
      "estimated_cost_eur": 350,
      "failure_modes_addressed": ["Bearing failure"]
    }
  ],
  "failure_mode_mappings": [
    {
      "failure_mode_name": "Bearing failure",
      "equipment_type": "Pump",
      "detection_methods": ["det_1"],
      "operator_checks": ["check_1"],
      "preventive_tasks": ["task_1"],
      "recommended_interval": "quarterly",
      "risk_if_unaddressed": "high"
    }
  ],
  "total_annual_cost_estimate_eur": 15000,
  "expected_availability_percent": 98.5
}"""


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
    
    def _build_fmea_context(
        self, 
        equipment_type: str, 
        criticality_level: CriticalityLevel,
        failure_modes: List[dict]
    ) -> str:
        """Build context string with FMEA data"""
        context = f"""
EQUIPMENT TYPE: {equipment_type}
CRITICALITY LEVEL: {criticality_level.value}

FAILURE MODES FROM FMEA DATABASE:
"""
        for fm in failure_modes:
            context += f"""
- Failure Mode: {fm.get('failure_mode', 'Unknown')}
  Category: {fm.get('category', 'Unknown')}
  Equipment: {fm.get('equipment', equipment_type)}
  Severity: {fm.get('severity', 'N/A')}/10
  Occurrence: {fm.get('occurrence', 'N/A')}/10
  Detectability: {fm.get('detectability', 'N/A')}/10
  RPN: {fm.get('rpn', 'N/A')}
  Recommended Actions: {', '.join(fm.get('recommended_actions', [])) or 'None specified'}
"""
        
        context += f"""
Generate a complete maintenance strategy for this {equipment_type} at {criticality_level.value} criticality level.
Base the strategy on the failure modes above, ensuring each failure mode is addressed by appropriate:
- Operator round checks
- Detection systems (where cost-effective for {criticality_level.value})
- Scheduled maintenance tasks
- Corrective actions
- Emergency procedures (if {criticality_level.value} in ['safety_critical', 'production_critical'])
- Spare parts recommendations
"""
        return context
    
    async def generate_strategy(
        self,
        equipment_type_id: str,
        equipment_type_name: str,
        criticality_level: CriticalityLevel,
        failure_modes: List[dict],
        user_id: str
    ) -> MaintenanceStrategy:
        """Generate a complete maintenance strategy from FMEA data"""
        try:
            session_id = f"strategy_gen_{equipment_type_id}_{criticality_level.value}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            chat = self._create_chat(session_id)
            
            context = self._build_fmea_context(equipment_type_name, criticality_level, failure_modes)
            message = UserMessage(text=context)
            
            response = await chat.send_message(message)
            data = self._parse_json_response(response)
            
            # Build the strategy object
            strategy_id = str(uuid.uuid4())
            
            # Parse operator rounds
            operator_rounds = []
            for round_data in data.get("operator_rounds", []):
                checklist = [
                    OperatorCheckItem(**check) for check in round_data.get("checklist", [])
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
                detection_systems.append(DetectionSystem(
                    id=det_data.get("id", str(uuid.uuid4())),
                    name=det_data.get("name", "Detection System"),
                    system_type=DetectionSystemType(det_data.get("system_type", "visual")),
                    description=det_data.get("description", ""),
                    monitoring_interval=MaintenanceFrequency(det_data.get("monitoring_interval", "daily")),
                    alarm_thresholds=det_data.get("alarm_thresholds"),
                    failure_modes_detected=det_data.get("failure_modes_detected", []),
                    installation_cost_eur=det_data.get("installation_cost_eur"),
                    recommended_for_criticality=[
                        CriticalityLevel(c) for c in det_data.get("recommended_for_criticality", [])
                    ]
                ))
            
            # Parse scheduled maintenance
            scheduled_maintenance = []
            for task_data in data.get("scheduled_maintenance", []):
                scheduled_maintenance.append(MaintenanceTask(
                    id=task_data.get("id", str(uuid.uuid4())),
                    name=task_data.get("name", "Maintenance Task"),
                    description=task_data.get("description", ""),
                    maintenance_type=MaintenanceType(task_data.get("maintenance_type", "preventive")),
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
            
            # Parse emergency procedures (only for high criticality)
            emergency_procedures = []
            if criticality_level in [CriticalityLevel.SAFETY_CRITICAL, CriticalityLevel.PRODUCTION_CRITICAL]:
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
                id=strategy_id,
                equipment_type_id=equipment_type_id,
                equipment_type_name=equipment_type_name,
                criticality_level=criticality_level,
                strategy_version="1.0",
                description=f"Auto-generated maintenance strategy for {equipment_type_name} at {criticality_level.value} criticality",
                operator_rounds=operator_rounds,
                detection_systems=detection_systems,
                scheduled_maintenance=scheduled_maintenance,
                corrective_actions=corrective_actions,
                emergency_procedures=emergency_procedures,
                spare_parts=spare_parts,
                failure_mode_mappings=failure_mode_mappings,
                total_annual_cost_estimate_eur=data.get("total_annual_cost_estimate_eur"),
                expected_availability_percent=data.get("expected_availability_percent"),
                created_at=datetime.now(timezone.utc).isoformat(),
                updated_at=datetime.now(timezone.utc).isoformat(),
                created_by=user_id,
                auto_generated=True
            )
            
        except Exception as e:
            logger.error(f"Strategy generation failed: {e}")
            # Return a basic strategy on error
            return MaintenanceStrategy(
                id=str(uuid.uuid4()),
                equipment_type_id=equipment_type_id,
                equipment_type_name=equipment_type_name,
                criticality_level=criticality_level,
                strategy_version="1.0",
                description=f"Basic maintenance strategy for {equipment_type_name} (generation failed: {str(e)})",
                operator_rounds=[
                    OperatorRound(
                        id="default_round",
                        name="Basic Inspection",
                        frequency=MaintenanceFrequency.DAILY,
                        duration_minutes=10,
                        checklist=[
                            OperatorCheckItem(
                                id="basic_check",
                                description="General visual inspection for abnormalities",
                                check_type="visual",
                                failure_modes_addressed=[]
                            )
                        ]
                    )
                ],
                created_at=datetime.now(timezone.utc).isoformat(),
                updated_at=datetime.now(timezone.utc).isoformat(),
                created_by=user_id,
                auto_generated=True
            )
