"""Wave 3 — Architecture convergence enforcement tests."""
from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
ROUTES_DIR = BACKEND_ROOT / "routes"
FRONTEND_SRC = BACKEND_ROOT.parent / "frontend" / "src"
ARCHITECTURE = BACKEND_ROOT / "architecture"


def _route_files_importing_db() -> set[str]:
    found = set()
    for path in ROUTES_DIR.rglob("*.py"):
        if path.name == "__init__.py":
            continue
        rel = path.relative_to(BACKEND_ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "database":
                for alias in node.names:
                    if alias.name == "db":
                        found.add(rel)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "database":
                        found.add(rel)
    return found


def test_convergence_registry_exists():
    from architecture.convergence_registry import (
        ConvergenceStatus,
        GREEN_ROUTES,
        ROUTE_DB_IMPORT_ALLOWLIST,
        REPOSITORY_COLLECTIONS,
    )

    assert ConvergenceStatus.GREEN.value == "green"
    assert "routes/observations.py" in GREEN_ROUTES
    assert len(REPOSITORY_COLLECTIONS) >= 10


def test_green_routes_do_not_import_database_db():
    from architecture.convergence_registry import GREEN_ROUTES

    importing = _route_files_importing_db()
    violations = sorted(importing.intersection(GREEN_ROUTES))
    assert not violations, f"GREEN routes must not import db: {violations}"


def test_actions_route_is_green_and_thin():
    from architecture.convergence_registry import GREEN_ROUTES

    assert "routes/actions.py" in GREEN_ROUTES
    path = BACKEND_ROOT / "routes" / "actions.py"
    line_count = len(path.read_text(encoding="utf-8").splitlines())
    assert line_count < 300, f"actions.py should be orchestration-only (<300 LOC), got {line_count}"


def test_stats_route_is_green_and_thin():
    from architecture.convergence_registry import GREEN_ROUTES

    assert "routes/stats.py" in GREEN_ROUTES
    path = BACKEND_ROOT / "routes" / "stats.py"
    text = path.read_text(encoding="utf-8")
    assert "from database import" not in text
    assert len(text.splitlines()) < 80, "stats.py should delegate to stats_service"


def test_executive_dashboard_route_is_green_and_thin():
    from architecture.convergence_registry import GREEN_ROUTES

    assert "routes/executive_dashboard.py" in GREEN_ROUTES
    path = BACKEND_ROOT / "routes" / "executive_dashboard.py"
    text = path.read_text(encoding="utf-8")
    assert "from database import" not in text
    assert len(text.splitlines()) < 80, "executive_dashboard.py should delegate to service"


def test_wave5_service_modules_exist():
    from services import executive_dashboard_service, investigation_service, threat_service

    assert callable(executive_dashboard_service.get_or_compute_executive_dashboard)
    assert callable(investigation_service.list_investigations)
    assert callable(threat_service.list_threats)


def test_wave6_service_crud_modules_exist():
    from services import investigation_service, my_tasks_service, threat_service

    assert callable(threat_service.get_threat_detail)
    assert callable(threat_service.update_threat)
    assert callable(threat_service.delete_threat)
    assert callable(investigation_service.create_investigation)
    assert callable(investigation_service.update_investigation)
    assert callable(investigation_service.delete_investigation)
    assert callable(my_tasks_service.list_my_tasks)


def test_wave7_threats_and_investigations_routes_are_green_and_thin():
    from architecture.convergence_registry import GREEN_ROUTES

    assert "routes/threats.py" in GREEN_ROUTES
    assert "routes/investigations.py" in GREEN_ROUTES

    for rel in ("routes/threats.py", "routes/investigations.py"):
        path = BACKEND_ROOT / rel
        text = path.read_text(encoding="utf-8")
        assert "from database import" not in text
        assert len(text.splitlines()) < 400, f"{rel} should be orchestration-only"


def test_wave7_service_modules_exist():
    from services import investigation_service, production_dashboard_service, threat_service

    assert callable(threat_service.create_investigation_from_threat)
    assert callable(threat_service.get_threat_timeline)
    assert callable(investigation_service.create_timeline_event)
    assert callable(investigation_service.upload_investigation_file)
    assert callable(production_dashboard_service.get_or_compute_production_dashboard)


def test_wave8_priority_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/my_tasks.py",
        "routes/production/dashboard.py",
        "routes/ril/dashboard.py",
    ):
        assert rel in GREEN_ROUTES
        path = BACKEND_ROOT / rel
        text = path.read_text(encoding="utf-8")
        assert "from database import" not in text
        assert len(text.splitlines()) < 300, f"{rel} should be orchestration-only"


def test_wave8_service_modules_exist():
    from services import my_tasks_service, production_dashboard_ops, ril_dashboard_service

    assert callable(my_tasks_service.get_task_detail)
    assert callable(my_tasks_service.execute_adhoc_plan)
    assert callable(production_dashboard_ops.list_production_events)
    assert callable(ril_dashboard_service.get_executive_dashboard)
    assert callable(ril_dashboard_service.get_dashboard_stats)


def test_wave9_observation_workspace_and_forms_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in ("routes/observation_workspace.py", "routes/forms.py"):
        assert rel in GREEN_ROUTES
        path = BACKEND_ROOT / rel
        text = path.read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_wave9_service_modules_exist():
    from services import observation_workspace_service
    from services.form_service import FormService

    assert callable(observation_workspace_service.get_workspace)
    assert callable(observation_workspace_service.add_action_to_plan)
    assert callable(FormService.list_submissions_lightweight)


def test_wave10_production_and_equipment_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/production_logs.py",
        "routes/production/submissions.py",
        "routes/equipment/equipment_nodes.py",
    ):
        assert rel in GREEN_ROUTES
        path = BACKEND_ROOT / rel
        text = path.read_text(encoding="utf-8")
        assert "from database import db" not in text
        assert len(text.splitlines()) < 300, f"{rel} should be orchestration-only"


def test_wave10_service_modules_exist():
    from services import equipment_nodes_service, production_logs_service, production_submissions_service

    assert callable(production_logs_service.ingest_logs)
    assert callable(production_submissions_service.update_production_submission)
    assert callable(equipment_nodes_service.get_equipment_nodes)


def test_wave11_insights_and_ai_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in ("routes/insights.py", "routes/ai_routes.py"):
        assert rel in GREEN_ROUTES
        path = BACKEND_ROOT / rel
        text = path.read_text(encoding="utf-8")
        assert "from database import db" not in text
        if rel == "routes/ai_routes.py":
            assert len(text.splitlines()) < 180, "ai_routes.py should be orchestration-only"


def test_wave11_service_modules_exist():
    from services import ai_risk_queries, insights_service

    assert callable(insights_service.get_insights_summary)
    assert callable(ai_risk_queries.find_threat)
    assert callable(ai_risk_queries.upsert_ai_doc)


def test_wave12_ai_and_scheduler_modules_exist():
    from services import ai_extract_queries, ai_fm_queries

    assert callable(ai_extract_queries.find_form_template)
    assert callable(ai_extract_queries.insert_corrections)
    assert callable(ai_fm_queries.find_cache_doc)
    assert callable(ai_fm_queries.upsert_cache_doc)


def test_wave13_ai_risk_service_exists():
    from services import ai_risk_service

    assert callable(ai_risk_service.analyze_threat_risk)
    assert callable(ai_risk_service.get_ai_top_risks)


def test_wave14_scheduler_service_exists():
    from services import maintenance_scheduler_service, maintenance_scheduler_scope

    assert callable(maintenance_scheduler_service.get_dashboard_kpis)
    assert callable(maintenance_scheduler_scope.scope_scheduled_tasks_query)


def test_wave14_scheduler_read_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/maintenance_scheduler/dashboard.py",
        "routes/maintenance_scheduler/timeline.py",
    ):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_wave15_scheduler_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/maintenance_scheduler/tasks.py",
        "routes/maintenance_scheduler/technicians.py",
        "routes/maintenance_scheduler/programs.py",
        "routes/maintenance_scheduler/ai_planner.py",
    ):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_wave15_scheduler_services_exist():
    from services import maintenance_scheduler_service, maintenance_scheduler_ai_service

    assert callable(maintenance_scheduler_service.complete_scheduled_task)
    assert callable(maintenance_scheduler_ai_service.ai_plan_tasks)


def test_wave16_equipment_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/equipment/equipment_history.py",
        "routes/equipment/equipment_types.py",
        "routes/equipment/equipment_utils.py",
        "routes/equipment/equipment_files.py",
    ):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_wave16_equipment_services_exist():
    from services import equipment_files_service, equipment_history_service

    assert callable(equipment_history_service.get_equipment_history)
    assert callable(equipment_files_service.list_equipment_files)


def test_wave17_equipment_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/equipment/equipment_criticality.py",
        "routes/equipment/equipment_operations.py",
    ):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_wave17_equipment_services_exist():
    from services import equipment_criticality_service, equipment_operations_service

    assert callable(equipment_criticality_service.assign_criticality)
    assert callable(equipment_operations_service.reorder_equipment_node)


def test_wave18_equipment_import_is_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/equipment/equipment_import.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_wave18_equipment_import_service_exists():
    from services import equipment_import_service

    assert callable(equipment_import_service.parse_equipment_list)
    assert callable(equipment_import_service.import_excel_file)


def test_wave19_ril_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/ril/observations.py",
        "routes/ril/readings.py",
        "routes/ril/alerts.py",
        "routes/ril/correlations.py",
        "routes/ril/predictions.py",
        "routes/ril/cases.py",
        "routes/ril/copilot.py",
    ):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_wave19_ril_service_factory_exists():
    from services.ril_service_factory import get_ril_service, ril_owner_id

    assert callable(get_ril_service)
    assert callable(ril_owner_id)


def test_wave20_config_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in ("routes/disciplines.py", "routes/risk_settings.py"):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_wave20_services_exist():
    from services import disciplines_service, risk_settings_service

    assert callable(disciplines_service.normalize_discipline)
    assert callable(risk_settings_service.reset_risk_settings)


def test_wave21_strategy_helper_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    for rel in (
        "routes/maintenance_strategy_v2/strategy_helpers.py",
        "routes/maintenance_strategy_v2/propagation.py",
    ):
        assert rel in GREEN_ROUTES
        text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
        assert "from database import db" not in text


def test_wave21_services_exist():
    from services import maintenance_strategy_helpers, maintenance_strategy_propagation

    assert callable(maintenance_strategy_helpers.log_strategy_audit)
    assert callable(maintenance_strategy_propagation._sync_metadata_to_open_scheduled_tasks)


def test_wave22_maintenance_strategy_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/maintenance_strategy_v2/routes.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_wave22_service_exists():
    from services import maintenance_strategy_v2_service as svc

    assert callable(svc.create_equipment_type_strategy)
    assert callable(svc.delete_task_template)


def test_wave23_failure_modes_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/failure_modes_routes.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_wave23_service_exists():
    from services import failure_modes_routes_service as svc

    assert callable(svc.get_failure_mode_by_id)
    assert callable(svc.scan_similar_failure_modes)


def test_wave24_chat_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/chat.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_wave24_service_exists():
    from services import chat_routes_service as svc

    assert callable(svc.cancel_chat_flow)
    assert callable(svc.transcribe_voice)


def test_wave25_maintenance_program_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/maintenance_program.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_wave25_service_exists():
    from services import maintenance_program_routes_service as svc

    assert callable(svc.regenerate_program)
    assert callable(svc.approve_program)


def test_wave26_intelligence_map_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/intelligence_map.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_wave26_service_exists():
    from services import intelligence_map_routes_service as svc

    assert callable(svc._count_imported_pm_import_tasks)
    assert callable(svc._scope_query)


def test_wave27_efms_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/efms.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_wave27_service_exists():
    from services import efms_routes_service as svc

    assert callable(svc.generate_efms_for_equipment)
    assert callable(svc.get_high_risk_efms)


def test_wave28_maintenance_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/maintenance.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_wave28_service_exists():
    from services import maintenance_routes_service as svc

    assert callable(svc.download_documentation)
    assert callable(svc.increment_strategy_version)


def test_route_db_imports_are_allowlisted():
    """No new route may import db without explicit allowlist entry."""
    from architecture.convergence_registry import ROUTE_DB_IMPORT_ALLOWLIST

    importing = _route_files_importing_db()
    unlisted = sorted(importing - ROUTE_DB_IMPORT_ALLOWLIST)
    assert not unlisted, (
        "Routes importing db must be in ROUTE_DB_IMPORT_ALLOWLIST until migrated: "
        + ", ".join(unlisted)
    )


def test_all_target_repositories_exist():
    from repositories import (
        ActionRepository,
        EquipmentRepository,
        FormSubmissionRepository,
        FormTemplateRepository,
        InvestigationRepository,
        MaintenanceProgramRepository,
        ObservationRepository,
        ProductionLogRepository,
        ScheduledTaskRepository,
        TaskInstanceRepository,
        ThreatRepository,
        UserRepository,
        WorkItemProjectionRepository,
    )

    assert ActionRepository.collection_name == "central_actions"
    assert ThreatRepository.collection_name == "threats"
    assert ObservationRepository.collection_name == "observations"
    assert EquipmentRepository.collection_name == "equipment_nodes"
    assert FormTemplateRepository.collection_name == "form_templates"
    assert UserRepository.collection_name == "users"
    assert WorkItemProjectionRepository.collection_name == "work_item_projections"
    assert ProductionLogRepository.collection_name == "production_logs"
    assert MaintenanceProgramRepository.collection_name == "maintenance_programs_v2"


def test_services_do_not_import_routes():
    for path in (BACKEND_ROOT / "services").rglob("*.py"):
        if path.name == "__init__.py":
            continue
        text = path.read_text(encoding="utf-8")
        assert "from routes." not in text and "import routes." not in text, path.name


def test_graph_dispatch_used_in_reliability_graph_query_wrapper():
    text = (BACKEND_ROOT / "services" / "reliability_graph_query.py").read_text()
    assert "dispatch_graph_sync" in text
    assert "sync_observation_edges(" not in text.split("dispatch_graph_sync")[0]


def test_outbox_handlers_include_graph_and_projection():
    from workers.event_outbox_processor import build_event_handlers
    from services.domain_events import GRAPH_EVENT_TYPES, PROJECTION_EVENT_TYPES

    handlers = build_event_handlers()
    for event_type in GRAPH_EVENT_TYPES:
        assert event_type.value in handlers
    for event_type in PROJECTION_EVENT_TYPES:
        assert event_type.value in handlers


def test_lifecycle_and_projection_dispatch_modules():
    from services.lifecycle_dispatch import publish_action_completed
    from services.projection_dispatch import invalidate_executive_kpi

    assert callable(publish_action_completed)
    assert callable(invalidate_executive_kpi)


@pytest.mark.parametrize(
    "repo_module,collection",
    [
        ("repositories.threat_repository", "threats"),
        ("repositories.action_repository", "central_actions"),
        ("repositories.equipment_repository", "equipment_nodes"),
        ("repositories.form_repository", "form_templates"),
        ("repositories.user_repository", "users"),
        ("repositories.work_item_repository", "work_item_projections"),
        ("repositories.production_log_repository", "production_logs"),
        ("repositories.maintenance_repository", "maintenance_programs_v2"),
    ],
)
def test_repository_collection_names(repo_module, collection):
    import importlib

    mod = importlib.import_module(repo_module)
    for name in dir(mod):
        obj = getattr(mod, name)
        if isinstance(obj, type) and hasattr(obj, "collection_name"):
            if obj.collection_name == collection:
                return
    pytest.fail(f"No repository with collection_name={collection} in {repo_module}")


def test_frontend_raw_fetch_allowlist():
    from architecture.convergence_registry import FRONTEND_RAW_FETCH_ALLOWLIST

    pattern = re.compile(r"\bfetch\s*\(")
    violations = []
    for path in FRONTEND_SRC.rglob("*"):
        if path.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
            continue
        rel = path.relative_to(FRONTEND_SRC.parent).as_posix()
        if rel.replace("frontend/", "") in FRONTEND_RAW_FETCH_ALLOWLIST:
            continue
        if "mediaClient.js" in rel:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if pattern.search(text) and "apiClient" not in path.name:
            # apiClient uses axios not fetch — flag raw fetch
            if "fetch(" in text and "lib/apiClient" not in text:
                # allow test files
                if "/__tests__/" in rel or ".test." in rel:
                    continue
                violations.append(rel)

    # Grandfathered until migrated — fail only if count grows beyond baseline
    BASELINE = 25
    assert len(violations) <= BASELINE, (
        f"Too many frontend raw fetch usages ({len(violations)}): "
        + ", ".join(sorted(violations)[:10])
    )


SERVICES_DIR = BACKEND_ROOT / "services"
SERVICE_LOC_LIMIT = 800
# Grandfathered god-modules pending modularization — fail if count grows or new offenders appear.
SERVICE_LOC_ALLOWLIST = {
    "ai_risk_service.py": 46,
    "ai_risk_dashboard.py": 186,
    "ai_risk_analysis.py": 632,
    "chat_routes_service.py": 200,
    "chat_routes_processor.py": 670,
    "chat_routes_state.py": 150,
    "chat_routes_media.py": 60,
    "chat_routes_observation.py": 240,
    "chat_routes_confirm.py": 110,
    "chat_routes_finalize.py": 210,
    "decision_engine.py": 395,
    "decision_engine_evaluators.py": 366,
    "decision_engine_suggestions.py": 252,
    "equipment_import_service.py": 40,
    "equipment_import_unstructured.py": 270,
    "equipment_import_excel.py": 715,
    "equipment_import_json.py": 95,
    "form_service.py": 360,
    "form_service_templates.py": 450,
    "form_service_submit.py": 270,
    "form_service_submission_detail.py": 130,
    "form_service_reliability.py": 95,
    "form_service_submissions_query.py": 280,
    "form_service_thresholds.py": 120,
    "form_service_serializers.py": 110,
    "form_service_analytics.py": 80,
    "form_service_submissions_list.py": 180,
    "maintenance_program_service.py": 620,
    "maintenance_program_task_crud.py": 290,
    "maintenance_program_regeneration.py": 290,
    "maintenance_program_scheduler_sync.py": 280,
    "maintenance_program_helpers.py": 60,
    "maintenance_program_session_import.py": 100,
    "maintenance_program_enrichment.py": 170,
    "maintenance_scheduler_sync.py": 50,
    "maintenance_scheduler_shared.py": 80,
    "maintenance_scheduler_strategy_sync.py": 175,
    "maintenance_scheduler_v2_sync.py": 390,
    "maintenance_scheduler_cleanup.py": 425,
    "maintenance_scheduler_refresh.py": 210,
    "maintenance_strategy_v2_service.py": 820,
    "maintenance_strategy_v2_instances.py": 540,
    "maintenance_strategy_v2_sync.py": 260,
    "pm_import/ai_review.py": 139,
    "pm_import/pm_import_equipment_match.py": 164,
    "pm_import/pm_import_fm_match.py": 147,
    "pm_import/pm_import_recommendation.py": 530,
    "process_import_service.py": 380,
    "process_import_constants.py": 175,
    "process_import_vision.py": 565,
    "production_dashboard_service.py": 60,
    "production_dashboard_scope.py": 432,
    "production_dashboard_forms.py": 514,
    "production_dashboard_ingest.py": 358,
    "production_logs_service.py": 420,
    "production_logs_ingest.py": 580,
    "production_logs_templates.py": 430,
    "production_logs_parsing.py": 600,
    "maintenance_program_ai_recommendations.py": 230,
    "ril_predictions.py": 180,
    "reliability_graph.py": 185,
    "reliability_graph_core.py": 275,
    "reliability_graph_strategy.py": 530,
    "reliability_graph_entities.py": 285,
    "ril_service.py": 215,
    "ril_observations.py": 162,
    "ril_readings.py": 174,
    "ril_alerts.py": 222,
    "ril_correlations.py": 160,
    "ril_cases.py": 355,
    "task_service.py": 720,
    "task_service_completion.py": 320,
    "task_service_helpers.py": 160,
    "task_service_plans.py": 280,
    "task_service_scheduling.py": 220,
    "task_service_templates.py": 180,
    "threat_service_investigation.py": 520,
}


def test_service_modules_respect_loc_limit_or_allowlist():
    """Services over 800 LOC must be explicitly allowlisted (no silent growth)."""
    violations: list[str] = []
    for path in SERVICES_DIR.rglob("*.py"):
        if path.name == "__init__.py":
            continue
        rel = path.relative_to(SERVICES_DIR).as_posix()
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        allowed = SERVICE_LOC_ALLOWLIST.get(rel) or SERVICE_LOC_ALLOWLIST.get(path.name)
        if line_count > SERVICE_LOC_LIMIT and allowed is None:
            violations.append(f"{rel}: {line_count} LOC (limit {SERVICE_LOC_LIMIT})")
        elif allowed is not None and line_count > allowed + 50:
            violations.append(f"{rel}: {line_count} LOC exceeds allowlist cap {allowed}")
    assert not violations, "Oversized service modules: " + "; ".join(sorted(violations)[:12])


def test_pm_import_graph_sync_registered_in_dispatch_handlers():
    from services.reliability_graph import GRAPH_SYNC_HANDLERS

    assert "sync_edge_for_pm_import_task" in GRAPH_SYNC_HANDLERS
    assert "sync_prediction_edges" in GRAPH_SYNC_HANDLERS


def test_copilot_tool_registry_includes_reliability_tools():
    from services.ril_copilot_service import COPILOT_TOOL_REGISTRY

    assert "get_reliability_chain" in COPILOT_TOOL_REGISTRY
    assert "get_open_signals" in COPILOT_TOOL_REGISTRY


def test_threat_insert_one_only_in_allowlist():
    """Phase 3 — direct threats.insert_one must stay in THREAT_INSERT_ALLOWLIST."""
    from services.work_signal_lifecycle import THREAT_INSERT_ALLOWLIST

    pattern = re.compile(r"\bdb\.threats\.insert_one\b")
    violations: list[str] = []
    for path in SERVICES_DIR.rglob("*.py"):
        if path.name == "__init__.py":
            continue
        rel = path.relative_to(BACKEND_ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        if pattern.search(text) and rel not in THREAT_INSERT_ALLOWLIST:
            violations.append(rel)

    assert not violations, (
        "db.threats.insert_one outside THREAT_INSERT_ALLOWLIST — use create_work_signal: "
        + ", ".join(sorted(violations))
    )


def test_phase4_ai_convergence_modules_exist():
    from services.ai_citation import attach_citations_to_response, format_citations_for_prompt
    from services.ai_evidence_pack import build_evidence_pack
    from services.ai_orchestrator import run_grounded_recommendation

    assert callable(build_evidence_pack)
    assert callable(format_citations_for_prompt)
    assert callable(attach_citations_to_response)
    assert callable(run_grounded_recommendation)


def test_ws5_ai_platform_modules_exist():
    """WS5 — unified AI platform entry points and prompt registry."""
    from services.ai_platform import (
        execute_grounded_prompt,
        execute_json_prompt,
        execute_multimodal_json_prompt,
        execute_prompt,
        execute_vision_json_prompt,
        list_prompts,
    )
    from services.ai_prompt_registry import get_prompt, render_prompt
    from services.ai_context_builder import build_ai_context
    from services.ai_output_validation import parse_json_from_llm

    assert callable(execute_prompt)
    assert callable(execute_json_prompt)
    assert callable(execute_grounded_prompt)
    assert callable(execute_vision_json_prompt)
    assert callable(execute_multimodal_json_prompt)
    assert callable(build_ai_context)
    assert callable(parse_json_from_llm)
    prompts = list_prompts()
    assert "chat.threat_extraction" in prompts
    assert "risk.analysis" in prompts
    assert "investigation.defensive_reasoning" in prompts
    assert "fm.failure_mode_mapping" in prompts
    assert "vision.damage_analysis" in prompts
    assert "maintenance.strategy_generation" in prompts
    assert "chat.issue_summary" in prompts
    assert "production.log_parse" in prompts
    assert "production.daily_insights" in prompts
    assert "ril.copilot_assistant" in prompts
    assert "insights.recommendations" in prompts
    assert "maintenance.scheduler_plan" in prompts
    assert "reports.investigation_summary" in prompts
    assert "vision.field_extraction" in prompts
    assert len(prompts) >= 56
    assert get_prompt("reliability.grounded_assistant").version == "1.0"
    assert "AssetIQ reliability AI" in render_prompt("reliability.grounded_assistant")


def test_openai_imports_are_allowlisted():
    """Phase 4 — direct OpenAI imports must stay in allowlist or grandfathered baseline."""
    import importlib.util

    script = BACKEND_ROOT / "scripts" / "ai_entry_point_report.py"
    spec = importlib.util.spec_from_file_location("ai_entry_point_report", script)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)

    report = mod.build_report()
    assert not report["violations"], (
        "New direct OpenAI imports outside allowlist: " + ", ".join(report["violations"])
    )
    # Grandfathered legacy bypasses — fail if count grows
    assert len(report["baseline_bypasses"]) <= len(mod.OPENAI_IMPORT_BASELINE)
