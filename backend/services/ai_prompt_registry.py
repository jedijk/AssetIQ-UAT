"""
Central prompt registry — Platform 1.0 WS5.

Versioned system prompts for AI features. New AI capabilities should register
prompts here and execute via `services.ai_platform`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class PromptSpec:
    """A versioned prompt template."""

    id: str
    version: str
    text: str
    description: str = ""
    default_model: str = "gpt-4o-mini"
    response_format: Optional[str] = None  # e.g. "json"


_REGISTRY: Dict[str, PromptSpec] = {}


def register_prompt(spec: PromptSpec, *, replace: bool = False) -> None:
    if spec.id in _REGISTRY and not replace:
        raise ValueError(f"Prompt already registered: {spec.id}")
    _REGISTRY[spec.id] = spec


def get_prompt(prompt_id: str, *, version: Optional[str] = None) -> PromptSpec:
    spec = _REGISTRY.get(prompt_id)
    if spec is None:
        raise KeyError(f"Unknown prompt: {prompt_id}")
    if version is not None and spec.version != version:
        raise KeyError(f"Prompt {prompt_id} version mismatch: want {version}, have {spec.version}")
    return spec


def render_prompt(prompt_id: str, variables: Optional[Dict[str, str]] = None) -> str:
    """Return prompt text with optional ``{key}`` substitution."""
    text = get_prompt(prompt_id).text
    if not variables:
        return text
    for key, value in variables.items():
        text = text.replace("{" + key + "}", str(value))
    return text


def list_prompts() -> Dict[str, str]:
    """Map prompt id → version (for audits)."""
    return {pid: spec.version for pid, spec in sorted(_REGISTRY.items())}


def _bootstrap() -> None:
    from ai_helpers import (
        DATA_QUERY_SYSTEM_PROMPT,
        IMAGE_ANALYSIS_SYSTEM_PROMPT,
        QUERY_CLASSIFIER_PROMPT,
        THREAT_ANALYSIS_SYSTEM_PROMPT,
    )
    from ai_risk_engine import (
        ACTION_OPTIMIZATION_PROMPT,
        BOW_TIE_PROMPT,
        CAUSE_ANALYSIS_PROMPT,
        FAULT_TREE_PROMPT,
        RISK_ANALYSIS_PROMPT,
    )
    from services.investigation_files import DEFENSIVE_REASONING_CHECK_PROMPT
    from services.ai_fm_prompts import (
        FM_ACTION_DISCIPLINE_MAP_PROMPT,
        FM_CONFIRM_DUPLICATE_ACTIONS_PROMPT,
        FM_CONFIRM_SIMILAR_CLUSTER_PROMPT,
        FM_EQUIPMENT_TYPE_MAPPING_PROMPT,
        FM_FAILURE_MODE_MAPPING_PROMPT,
        FM_IMPROVE_FAILURE_MODE_PROMPT,
        FM_NEW_EQUIPMENT_TYPE_PROMPT,
        FM_NEW_FAILURE_MODE_PROMPT,
    )
    from services.image_analysis_service import DAMAGE_ANALYSIS_PROMPT
    from maintenance_strategy_generator import STRATEGY_GENERATION_PROMPT
    from services.failure_modes.action_downtime_suggest import DOWNTIME_CLASSIFY_PROMPT
    from services.failure_modes.actions_consolidate import CONSOLIDATE_ACTIONS_PROMPT
    from services.ai_prompt_definitions import (
        CHAT_ATTACHMENT_ANALYSIS_PROMPT,
        CHAT_ISSUE_MERGE_EDIT_PROMPT,
        CHAT_ISSUE_SUMMARY_PROMPT,
        CHAT_OBSERVATION_DESCRIPTION_PROMPT,
        CHAT_TRANSLATE_RECORD_PROMPT,
        DASHBOARD_INTENT_CLASSIFIER_PROMPT,
        FEEDBACK_GENERATE_AGENT_PROMPT,
        FORMS_DOCUMENT_SEARCH_PROMPT,
        FM_SIMILAR_FAILURE_MODES_PROMPT,
        INSIGHTS_RECOMMENDATIONS_PROMPT,
        MAINTENANCE_PROGRAM_RECOMMENDATIONS_PROMPT,
        MAINTENANCE_PROGRAM_RECOMMENDATIONS_USER_PROMPT,
        MAINTENANCE_SCHEDULER_PLAN_PROMPT,
        PM_IMPORT_RECOMMENDATION_PROMPT,
        PM_IMPORT_TASK_ENRICH_PROMPT,
        PM_IMPORT_VISION_OCR_PROMPT,
        PROCESS_IMPORT_VISION_EXTRACT_PROMPT,
        PROCESS_IMPORT_ESTIMATE_CRITICALITY_PROMPT,
        PRODUCTION_DAILY_INSIGHTS_PROMPT,
        PRODUCTION_DAILY_INSIGHTS_USER_PROMPT,
        PRODUCTION_LOG_PARSE_PROMPT,
        PRODUCTION_MACHINE_SETTINGS_PROMPT,
        PRODUCTION_MACHINE_SETTINGS_USER_PROMPT,
        RIL_COPILOT_ASSISTANT_PROMPT,
        RIL_COPILOT_INTENT_CLASSIFIER_PROMPT,
        REPORTS_INVESTIGATION_SUMMARY_PROMPT,
        REPORTS_INVESTIGATION_BRIEFING_USER_PROMPT,
        THREAT_IMPROVE_DESCRIPTION_PROMPT,
        TRANSLATION_TECHNICAL_PROMPT,
        VISION_CAPTURE_ANCHOR_BLOCK,
        VISION_CUSTOM_CAPTURE_ANCHOR_PROMPT,
        VISION_DATE_RULES_BLOCK,
        VISION_FIELD_EXTRACTION_PROMPT,
    )

    _CHAT_GENERAL_ASSISTANT = (
        "You are a helpful AI assistant for industrial asset management "
        "and reliability engineering. Provide concise, actionable insights."
    )

    specs = [
        PromptSpec(
            id="chat.threat_extraction",
            version="1.0",
            description="Extract equipment failure threats from operator chat messages",
            text=THREAT_ANALYSIS_SYSTEM_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="chat.image_analysis",
            version="1.0",
            description="Describe equipment damage visible in a photo",
            text=IMAGE_ANALYSIS_SYSTEM_PROMPT,
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="chat.data_query",
            version="1.0",
            description="Answer reliability data questions using injected context",
            text=DATA_QUERY_SYSTEM_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="chat.query_classifier",
            version="1.0",
            description="Classify chat input as data query vs threat report",
            text=QUERY_CLASSIFIER_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="chat.general_assistant",
            version="1.0",
            description="General reliability engineering chat assistant",
            text=_CHAT_GENERAL_ASSISTANT,
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="reliability.grounded_assistant",
            version="1.0",
            description="Grounded reliability copilot — cite evidence only",
            text="""You are an AssetIQ reliability AI assistant.

Rules:
- Answer using ONLY the provided evidence and tool results.
- Cite sources inline as [cite:<id>] when referencing specific entities, KPIs, or graph edges.
- End with a "Sources" section listing cited IDs.
- Be concise, actionable, and focused on reliability and maintenance.
- Use markdown formatting when helpful.""",
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="risk.analysis",
            version="1.0",
            description="Comprehensive threat risk assessment",
            text=RISK_ANALYSIS_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="risk.cause_analysis",
            version="1.0",
            description="Probable root cause analysis for threats",
            text=CAUSE_ANALYSIS_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="risk.fault_tree",
            version="1.0",
            description="Fault tree generation for threats",
            text=FAULT_TREE_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="risk.bow_tie",
            version="1.0",
            description="Bow-tie risk model generation",
            text=BOW_TIE_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="risk.action_optimization",
            version="1.0",
            description="Optimized maintenance action recommendations",
            text=ACTION_OPTIMIZATION_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="investigation.defensive_reasoning",
            version="1.0",
            description="RCA problem statement defensive-reasoning check",
            text=DEFENSIVE_REASONING_CHECK_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="fm.failure_mode_mapping",
            version="1.0",
            description="Map failure modes to equipment types",
            text=FM_FAILURE_MODE_MAPPING_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="fm.equipment_type_mapping",
            version="1.0",
            description="Map equipment nodes to catalog equipment types",
            text=FM_EQUIPMENT_TYPE_MAPPING_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="fm.new_equipment_type",
            version="1.0",
            description="Propose new equipment types from hierarchy nodes",
            text=FM_NEW_EQUIPMENT_TYPE_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="fm.new_failure_mode",
            version="1.0",
            description="Propose new failure modes for equipment types",
            text=FM_NEW_FAILURE_MODE_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="fm.improve_failure_mode",
            version="1.0",
            description="Improve a single failure mode record",
            text=FM_IMPROVE_FAILURE_MODE_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="vision.damage_analysis",
            version="1.0",
            description="Structured damage assessment from equipment photos",
            text=DAMAGE_ANALYSIS_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="maintenance.strategy_generation",
            version="1.0",
            description="Generate maintenance strategy for all criticality levels",
            text=STRATEGY_GENERATION_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="fm.downtime_classification",
            version="1.0",
            description="Classify whether maintenance actions require downtime",
            text=DOWNTIME_CLASSIFY_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="fm.consolidate_actions",
            version="1.0",
            description="Consolidate duplicate FMEA recommended actions",
            text=CONSOLIDATE_ACTIONS_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="chat.issue_summary",
            version="1.0",
            description="Professional observation summary from operator text",
            text=CHAT_ISSUE_SUMMARY_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="chat.issue_merge_edit",
            version="1.0",
            description="Merge operator issue report with correction",
            text=CHAT_ISSUE_MERGE_EDIT_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="chat.observation_description",
            version="1.0",
            description="Technical observation record description",
            text=CHAT_OBSERVATION_DESCRIPTION_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="chat.translate_record",
            version="1.0",
            description="Translate operator text to English for records",
            text=CHAT_TRANSLATE_RECORD_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="chat.attachment_analysis",
            version="1.0",
            description="Analyze observation photo attachment",
            text=CHAT_ATTACHMENT_ANALYSIS_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="threat.improve_description",
            version="1.0",
            description="Improve threat/observation description text",
            text=THREAT_IMPROVE_DESCRIPTION_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="production.log_parse",
            version="1.0",
            description="Infer production log CSV structure from sample",
            text=PRODUCTION_LOG_PARSE_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="fm.similar_failure_modes",
            version="1.0",
            description="Group duplicate failure mode names in library",
            text=FM_SIMILAR_FAILURE_MODES_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="production.daily_insights",
            version="1.0",
            description="Daily production insights from extruder KPIs and logs",
            text=PRODUCTION_DAILY_INSIGHTS_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="production.machine_settings",
            version="1.0",
            description="Optimal extruder settings from historical viscosity data",
            text=PRODUCTION_MACHINE_SETTINGS_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="ril.copilot_intent_classifier",
            version="1.0",
            description="Classify reliability copilot query intent",
            text=RIL_COPILOT_INTENT_CLASSIFIER_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="ril.copilot_assistant",
            version="1.0",
            description="Reliability copilot grounded response",
            text=RIL_COPILOT_ASSISTANT_PROMPT,
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="insights.recommendations",
            version="1.0",
            description="Reliability performance improvement recommendations",
            text=INSIGHTS_RECOMMENDATIONS_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="translation.technical_text",
            version="1.0",
            description="Technical text translation with optional dictionary terms",
            text=TRANSLATION_TECHNICAL_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="pm_import.recommendation",
            version="1.0",
            description="PM import failure mode merge/new task recommendation",
            text=PM_IMPORT_RECOMMENDATION_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="pm_import.task_enrich",
            version="1.0",
            description="Enrich imported maintenance tasks with structured fields",
            text=PM_IMPORT_TASK_ENRICH_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="pm_import.vision_ocr",
            version="1.0",
            description="OCR maintenance tasks from scanned PM plan images",
            text=PM_IMPORT_VISION_OCR_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="process_import.vision_extract",
            version="1.0",
            description="Extract equipment hierarchy from PFD/schematic images",
            text=PROCESS_IMPORT_VISION_EXTRACT_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="process_import.estimate_criticality",
            version="1.0",
            description="Estimate equipment criticality scores from import hierarchy",
            text=PROCESS_IMPORT_ESTIMATE_CRITICALITY_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="maintenance.program_recommendations",
            version="1.0",
            description="ISO 14224 maintenance task recommendations for equipment",
            text=MAINTENANCE_PROGRAM_RECOMMENDATIONS_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="maintenance.scheduler_plan",
            version="1.0",
            description="AI maintenance scheduler plan with technician assignments",
            text=MAINTENANCE_SCHEDULER_PLAN_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="dashboard.intent_classifier",
            version="1.0",
            description="Map natural language to dashboard template id",
            text=DASHBOARD_INTENT_CLASSIFIER_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="maintenance.program_recommendations.user",
            version="1.0",
            description="User message: equipment context for maintenance task recommendations",
            text=MAINTENANCE_PROGRAM_RECOMMENDATIONS_USER_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="production.daily_insights.user",
            version="1.0",
            description="User message: daily extruder KPIs and log for insights",
            text=PRODUCTION_DAILY_INSIGHTS_USER_PROMPT,
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="production.machine_settings.user",
            version="1.0",
            description="User message: historical viscosity data for machine settings",
            text=PRODUCTION_MACHINE_SETTINGS_USER_PROMPT,
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="reports.investigation_briefing.user",
            version="1.0",
            description="User message: investigation data for executive briefing",
            text=REPORTS_INVESTIGATION_BRIEFING_USER_PROMPT,
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="feedback.generate_agent_prompt",
            version="1.0",
            description="Convert user feedback into AI coding agent prompt",
            text=FEEDBACK_GENERATE_AGENT_PROMPT,
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="forms.document_search",
            version="1.0",
            description="Search form reference documents for user query",
            text=FORMS_DOCUMENT_SEARCH_PROMPT,
            default_model="gpt-4o-mini",
        ),
        PromptSpec(
            id="reports.investigation_summary",
            version="1.0",
            description="Investigation RCA AI summary",
            text=REPORTS_INVESTIGATION_SUMMARY_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="fm.confirm_similar_cluster",
            version="1.0",
            description="Confirm duplicate failure modes in a candidate cluster",
            text=FM_CONFIRM_SIMILAR_CLUSTER_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="fm.confirm_duplicate_actions",
            version="1.0",
            description="Confirm duplicate maintenance actions within a failure mode",
            text=FM_CONFIRM_DUPLICATE_ACTIONS_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="fm.action_discipline_map",
            version="1.0",
            description="Map maintenance actions to tenant discipline taxonomy",
            text=FM_ACTION_DISCIPLINE_MAP_PROMPT,
            default_model="gpt-4o-mini",
            response_format="json",
        ),
        PromptSpec(
            id="vision.field_extraction",
            version="1.0",
            description="Default structured field extraction from form photos",
            text=VISION_FIELD_EXTRACTION_PROMPT,
            default_model="gpt-4o",
            response_format="json",
        ),
        PromptSpec(
            id="vision.capture_anchor",
            version="1.0",
            description="Capture-time anchor for default field extraction",
            text=VISION_CAPTURE_ANCHOR_BLOCK,
            default_model="gpt-4o",
        ),
        PromptSpec(
            id="vision.custom_capture_anchor",
            version="1.0",
            description="Capture-time anchor for custom extraction templates",
            text=VISION_CUSTOM_CAPTURE_ANCHOR_PROMPT,
            default_model="gpt-4o",
        ),
    ]
    for spec in specs:
        register_prompt(spec, replace=True)


_bootstrap()
