"""RBAC alias and permission matrix unit tests."""
import re
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from services.rbac_service import RBACService, ROLE_ALIASES, ROLES


def _permissions_for(role: str) -> set:
    resolved = ROLE_ALIASES.get(role, role)
    return set(ROLES[resolved]["permissions"])


def test_manager_role_alias_has_admin_permissions():
    assert _permissions_for("manager") == _permissions_for("admin")
    assert "library:write" in _permissions_for("manager")


def test_operator_role_alias_maps_to_operations():
    assert _permissions_for("operator") == _permissions_for("operations")


def test_viewer_cannot_write_library():
    svc = RBACService.__new__(RBACService)
    assert svc.has_permission("viewer", "library:write") is False
    assert svc.has_permission("reliability_engineer", "library:write") is True


def test_all_roles_defined_or_aliased():
    for alias, target in ROLE_ALIASES.items():
        assert target in ROLES, f"alias {alias} -> missing target {target}"


def test_permissions_route_aliases_match_rbac():
    source = (Path(__file__).resolve().parents[1] / "services" / "permissions_defaults.py").read_text()
    assert 'DEFAULT_PERMISSIONS["manager"] = DEFAULT_PERMISSIONS["admin"]' in source
    assert 'DEFAULT_PERMISSIONS["operator"] = DEFAULT_PERMISSIONS["operations"]' in source


def test_require_permission_helper_exists_in_auth():
    source = (Path(__file__).resolve().parents[1] / "auth.py").read_text()
    assert "def require_permission(" in source


def test_work_items_route_requires_tasks_read():
    source = (Path(__file__).resolve().parents[1] / "routes" / "work_items.py").read_text()
    assert 'require_permission("tasks:read")' in source


def test_chat_analyze_requires_auth():
    source = (Path(__file__).resolve().parents[1] / "routes" / "ai_routes.py").read_text()
    idx = source.index('async def chat_analyze')
    block = source[idx: idx + 400]
    assert "Depends(get_current_user)" in block


def test_failure_modes_mutations_require_library_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "failure_modes_routes.py").read_text()
    assert '_library_write = require_permission("library:write")' in source
    assert "Depends(_library_write)" in source
    assert "failure_modes.ai_confirm_similar_cluster" not in source


def test_maintenance_program_mutations_require_scheduler_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "maintenance_program.py").read_text()
    assert '_scheduler_write = require_permission("scheduler:write")' in source
    assert "Depends(_scheduler_write)" in source


def test_investigations_ai_problem_check_uses_gateway():
    source = (Path(__file__).resolve().parents[1] / "services" / "investigation_service.py").read_text()
    assert "from services.ai_gateway import chat as ai_gateway_chat" in source
    idx = source.index("async def ai_problem_check")
    block = source[idx: idx + 2500]
    assert "ai_gateway_chat" in block
    assert 'endpoint="investigations.ai_problem_check"' in block


def test_equipment_search_escapes_regex():
    source = (Path(__file__).resolve().parents[1] / "services" / "equipment_search_service.py").read_text()
    assert "case_insensitive_contains" in source
    assert '"$regex": q' not in source


def test_tasks_mutations_require_tasks_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "tasks.py").read_text()
    assert '_tasks_write = require_permission("tasks:write")' in source
    idx = source.index("async def create_task_template")
    block = source[idx: idx + 200]
    assert "Depends(_tasks_write)" in block


def test_tasks_reads_require_tasks_read():
    source = (Path(__file__).resolve().parents[1] / "routes" / "tasks.py").read_text()
    idx = source.index("async def get_task_templates")
    block = source[idx: idx + 500]
    assert "Depends(_tasks_read)" in block


def test_production_logs_ai_parse_uses_gateway():
    source = (Path(__file__).resolve().parents[1] / "services" / "production_logs_service.py").read_text()
    assert "from services.ai_gateway import chat as ai_gateway_chat" in source
    idx = source.index("async def ai_parse_file")
    block = source[idx: idx + 3500]
    assert "ai_gateway_chat" in block
    assert 'endpoint="production_logs.ai_parse"' in block


def test_translation_service_uses_gateway():
    source = (Path(__file__).resolve().parents[1] / "services" / "translation_service.py").read_text()
    assert "from services.ai_gateway import chat as ai_gateway_chat" in source
    assert "AsyncOpenAI" not in source


def test_pm_import_service_uses_gateway():
    services_dir = Path(__file__).resolve().parents[1] / "services"
    pkg = services_dir / "pm_import"
    parts = [p.read_text() for p in sorted(pkg.glob("*.py"))]
    parts.append((services_dir / "pm_import_service.py").read_text())
    source = "\n".join(parts)
    assert "from services.ai_gateway import chat_with_images" in source
    assert "client.chat.completions.create" not in source


def test_production_logs_ingest_uses_tracked_jobs():
    source = (Path(__file__).resolve().parents[1] / "services" / "production_logs_service.py").read_text()
    assert "schedule_tracked_job" in source
    idx = source.index("async def ingest_logs")
    block = source[idx: idx + 1200]
    assert "schedule_tracked_job" in block


def test_ai_fm_suggestions_uses_ai_gateway():
    source = (Path(__file__).resolve().parents[1] / "routes" / "ai_fm_suggestions.py").read_text()
    assert "from services.ai_gateway import chat_completion_response" in source
    assert "AsyncOpenAI" not in source
    assert "guarded_openai_create" not in source
    assert "chat_completion_response" in source


def test_translations_mutations_require_library_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "translations.py").read_text()
    assert '_library_write = require_permission("library:write")' in source
    idx = source.index("async def create_language")
    block = source[idx: idx + 200]
    assert "Depends(_library_write)" in block
    idx_pref = source.index("async def set_user_language_preference")
    pref_block = source[idx_pref: idx_pref + 200]
    assert "Depends(get_current_user)" in pref_block


def test_observations_mutations_require_observations_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "observations.py").read_text()
    assert '_observations_write = require_permission("observations:write")' in source
    idx = source.index("async def create_observation")
    assert "Depends(_observations_write)" in source[idx: idx + 250]


def test_definitions_mutations_require_settings_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "definitions.py").read_text()
    assert '_settings_write = require_permission("settings:write")' in source
    idx = source.index("async def create_or_update_definitions")
    assert "Depends(_settings_write)" in source[idx: idx + 250]


def test_process_import_mutations_require_library_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "process_import.py").read_text()
    assert '_library_write = require_permission("library:write")' in source
    idx = source.index("async def upload_process_diagram")
    assert "Depends(_library_write)" in source[idx: idx + 600]
    idx_get = source.index("async def get_session")
    assert "Depends(get_current_user)" in source[idx_get: idx_get + 200]


def test_scheduler_write_granted_to_admin_and_reliability_engineer():
    svc = RBACService.__new__(RBACService)
    assert svc.has_permission("admin", "scheduler:write") is True
    assert svc.has_permission("reliability_engineer", "scheduler:write") is True
    assert svc.has_permission("maintenance", "scheduler:write") is False
    assert svc.has_permission("viewer", "scheduler:read") is True


def test_owner_bypass_in_require_permission():
    source = (Path(__file__).resolve().parents[1] / "auth.py").read_text()
    idx = source.index("def require_permission(")
    block = source[idx: idx + 450]
    assert 'role == "owner"' in block


def test_investigations_mutations_require_investigations_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "investigations.py").read_text()
    assert '_investigations_write = require_permission("investigations:write")' in source
    idx = source.index("async def create_investigation")
    assert "Depends(_investigations_write)" in source[idx: idx + 250]


def test_forms_mutations_require_forms_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "forms.py").read_text()
    assert '_forms_write = require_permission("forms:write")' in source
    idx = source.index("async def create_form_template")
    assert "Depends(_forms_write)" in source[idx: idx + 250]


def test_users_rbac_mutations_require_users_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "users.py").read_text()
    assert '_users_write = require_permission("users:write")' in source
    idx = source.index("async def update_user_role")
    assert "Depends(_users_write)" in source[idx: idx + 250]
    idx_del = source.index("async def delete_user")
    assert "Depends(_users_delete)" in source[idx_del: idx_del + 250]


def test_ril_mutations_require_decision_engine_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "ril" / "cases.py").read_text()
    assert "from routes.ril._auth import _ril_read, _ril_write" in source
    idx = source.index("async def create_case")
    assert "Depends(_ril_write)" in source[idx: idx + 250]


def test_production_mutations_require_forms_or_settings_write():
    pkg = Path(__file__).resolve().parents[1] / "routes" / "production"
    source = "\n".join(p.read_text() for p in sorted(pkg.glob("*.py")))
    idx = source.index("async def create_production_event")
    assert "Depends(_forms_write)" in source[idx: idx + 250]
    idx_seed = source.index("async def clear_seed_data")
    assert "Depends(_settings_write)" in source[idx_seed: idx_seed + 250]


def test_routes_use_tracked_jobs_not_raw_background_tasks():
    routes_dir = Path(__file__).resolve().parents[1] / "routes"
    offenders = []
    for path in routes_dir.rglob("*.py"):
        text = path.read_text()
        if "background_tasks.add_task(" in text:
            offenders.append(str(path.relative_to(routes_dir.parent)))
    assert offenders == [], f"Use schedule_tracked_job instead: {offenders}"


def test_my_tasks_routes_require_tasks_permissions():
    routes_source = (Path(__file__).resolve().parents[1] / "routes" / "my_tasks.py").read_text()
    service_source = (Path(__file__).resolve().parents[1] / "services" / "my_tasks_service.py").read_text()
    assert '_tasks_read = require_permission("tasks:read")' in routes_source
    assert '_tasks_write = require_permission("tasks:write")' in routes_source
    assert "Depends(_tasks_read)" in routes_source
    assert "Depends(_tasks_write)" in routes_source
    assert "_ensure_user_can_execute_task" in service_source


def test_work_items_mutations_require_tasks_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "work_items.py").read_text()
    assert 'require_permission("tasks:write")' in source
    idx = source.index("async def start_work_item")
    assert "Depends(_tasks_write)" in source[idx: idx + 250]
    idx_list = source.index("async def list_adhoc_plans")
    assert "Depends(_tasks_read)" in source[idx_list: idx_list + 200]


def test_production_logs_require_settings_permissions():
    source = (Path(__file__).resolve().parents[1] / "routes" / "production_logs.py").read_text()
    assert '_read = require_permission("settings:read")' in source
    assert '_write = require_permission("settings:write")' in source
    assert "_owner_only" not in source
    idx = source.index("async def upload_log_files")
    assert "Depends(_write)" in source[idx: idx + 250]
    idx_get = source.index("async def list_jobs")
    assert "Depends(_read)" in source[idx_get: idx_get + 250]


def test_qr_codes_require_settings_permissions():
    source = (Path(__file__).resolve().parents[1] / "routes" / "qr_codes.py").read_text()
    assert '_settings_read = require_permission("settings:read")' in source
    assert '_settings_write = require_permission("settings:write")' in source
    idx = source.index("async def generate_qr_code")
    assert "Depends(_settings_write)" in source[idx: idx + 250]
    idx_list = source.index("async def list_qr_codes")
    assert "Depends(_settings_read)" in source[idx_list: idx_list + 300]


def test_maintenance_strategy_v2_reads_require_library_read():
    source = (
        Path(__file__).resolve().parents[1] / "routes" / "maintenance_strategy_v2" / "routes.py"
    ).read_text()
    assert '_library_read = require_permission("library:read")' in source
    idx = source.index("async def list_equipment_type_strategies")
    assert "Depends(_library_read)" in source[idx: idx + 250]
    idx_write = source.index("async def create_equipment_type_strategy")
    assert "Depends(_library_write)" in source[idx_write: idx_write + 250]


def test_reliability_context_service_exists():
    source = (
        Path(__file__).resolve().parents[1] / "services" / "reliability_context_service.py"
    ).read_text()
    assert "class ReliabilityContextService" in source
    assert "build_reliability_context" in source
    assert "format_context_for_prompt" in source


def test_work_item_projection_service_exists():
    source = (
        Path(__file__).resolve().parents[1] / "services" / "work_item_projection.py"
    ).read_text()
    assert "get_projected_work_items" in source
    assert "work_item_projections" in source


def test_oidc_routes_mounted():
    init_source = (Path(__file__).resolve().parents[1] / "routes" / "__init__.py").read_text()
    assert "auth_oidc_router" in init_source
    oidc_source = (Path(__file__).resolve().parents[1] / "routes" / "auth_oidc.py").read_text()
    assert "/auth/oidc/config" in oidc_source or 'prefix="/auth/oidc"' in oidc_source


def test_audit_log_export_endpoint():
    source = (Path(__file__).resolve().parents[1] / "routes" / "audit_log.py").read_text()
    assert "async def export_audit_log" in source
    assert "/audit-log/export" in source


def test_copilot_context_endpoint():
    source = (Path(__file__).resolve().parents[1] / "routes" / "ril" / "copilot.py").read_text()
    assert "get_equipment_reliability_context" in source
    assert "ReliabilityContextService" in source


def test_executive_kpis_service_exists():
    source = (
        Path(__file__).resolve().parents[1] / "services" / "executive_reliability_kpis.py"
    ).read_text()
    assert "compute_executive_reliability_kpis" in source
    assert "mtbf_proxy" in source
    assert "overdue_pm" in source


def test_permission_resolver_maps_threats_to_observations():
    from services.permission_resolver import API_TO_UI_FEATURE

    assert API_TO_UI_FEATURE["threats"] == "observations"


@pytest.mark.asyncio
async def test_viewer_ui_matrix_denies_observations_write():
    from services.permission_resolver import check_api_permission, invalidate_permissions_cache

    invalidate_permissions_cache()
    with patch("services.permission_resolver._load_ui_permissions", new_callable=AsyncMock) as mock_load:
        mock_load.return_value = {
            "viewer": {
                "observations": {"read": True, "write": False, "delete": False},
            }
        }
        assert await check_api_permission("viewer", "threats:write") is False
        assert await check_api_permission("viewer", "threats:read") is True


def test_threats_routes_require_permission_deps():
    source = (Path(__file__).resolve().parents[1] / "routes" / "threats.py").read_text()
    service_source = (Path(__file__).resolve().parents[1] / "services" / "threat_service.py").read_text()
    assert '_threats_read = require_permission("threats:read")' in source
    assert '_threats_write = require_permission("threats:write")' in source
    assert '_threats_delete = require_permission("threats:delete")' in source
    assert "Depends(_threats_write)" in source
    assert "assert_user_can_access_equipment" in service_source


def test_actions_routes_require_permission_deps():
    source = (Path(__file__).resolve().parents[1] / "routes" / "actions.py").read_text()
    service_source = (Path(__file__).resolve().parents[1] / "services" / "action_service.py").read_text()
    assert '_actions_read = require_permission("actions:read")' in source
    assert '_actions_write = require_permission("actions:write")' in source
    assert '_actions_delete = require_permission("actions:delete")' in source
    assert "Depends(_actions_write)" in source
    assert "assert_user_can_access_equipment" in service_source


def test_failure_modes_reads_require_library_read():
    source = (Path(__file__).resolve().parents[1] / "routes" / "failure_modes_routes.py").read_text()
    assert '_library_read = require_permission("library:read")' in source
    idx = source.index("async def export_failure_modes_excel")
    assert "Depends(_library_read)" in source[idx: idx + 250]


def test_equipment_file_view_requires_auth_and_equipment_read():
    routes_source = (
        Path(__file__).resolve().parents[1] / "routes" / "equipment" / "equipment_files.py"
    ).read_text()
    service_source = (
        Path(__file__).resolve().parents[1] / "services" / "equipment_files_service.py"
    ).read_text()
    idx = routes_source.index("async def view_equipment_file_public")
    block = routes_source[idx: idx + 500]
    assert 'require_permission("equipment:read")' in routes_source
    assert "Depends(_equipment_read)" in block
    assert "assert_user_can_access_equipment" in service_source
    assert "no auth required" not in block.lower()


def test_inactive_user_rejected_in_validate_token():
    source = (Path(__file__).resolve().parents[1] / "auth.py").read_text()
    assert 'user.get("is_active") is False' in source
    assert "Account deactivated" in source


def test_require_permission_uses_async_resolver():
    source = (Path(__file__).resolve().parents[1] / "auth.py").read_text()
    idx = source.index("def require_permission(")
    block = source[idx: idx + 500]
    assert "check_api_permission" in block


def test_permissions_updates_invalidate_resolver_cache():
    source = (Path(__file__).resolve().parents[1] / "routes" / "permissions.py").read_text()
    assert "invalidate_permissions_cache" in source


def test_threat_enrichment_extracted():
    threats_source = (Path(__file__).resolve().parents[1] / "services" / "threat_service.py").read_text()
    enrichment_source = (
        Path(__file__).resolve().parents[1] / "services" / "threat_enrichment.py"
    ).read_text()
    assert "from services.threat_enrichment import" in threats_source
    assert "async def enrich_with_creator_info" in enrichment_source
    assert "async def enrich_with_equipment_tags" in enrichment_source


def test_installation_filter_user_can_access_equipment():
    source = (
        Path(__file__).resolve().parents[1] / "services" / "installation_filter_service.py"
    ).read_text()
    assert "async def user_can_access_equipment" in source
    assert "async def assert_user_can_access_equipment" in source


def test_create_indexes_passes_expire_after_seconds():
    source = (Path(__file__).resolve().parents[1] / "scripts" / "create_indexes.py").read_text()
    assert "expire_after = idx_def.get" in source
    assert '"expireAfterSeconds"' in source or "expireAfterSeconds" in source


def test_schedule_tracked_job_prefers_external_worker():
    source = (Path(__file__).resolve().parents[1] / "services" / "background_jobs.py").read_text()
    idx = source.index("def schedule_tracked_job(")
    block = source[idx: idx + 900]
    assert "use_external_background_worker" in block
    assert "enqueue_for_external_worker" in block


def test_ril_copilot_dropped_direct_openai_client():
    source = (Path(__file__).resolve().parents[1] / "services" / "ril_copilot_service.py").read_text()
    assert "_get_openai_client" not in source
    assert "ai_gateway_chat" in source or "from services.ai_gateway import chat" in source


def test_ai_risk_engine_uses_gateway():
    source = (Path(__file__).resolve().parents[1] / "ai_risk_engine.py").read_text()
    idx = source.index("async def _call_openai")
    block = source[idx: idx + 500]
    assert "chat_completion_response" in block


def test_ai_helpers_chat_paths_use_gateway():
    source = (Path(__file__).resolve().parents[1] / "ai_helpers.py").read_text()
    assert "_gateway_completion" in source
    idx = source.index("async def analyze_threat_with_ai")
    block = source[idx: idx + 800]
    assert "_gateway_completion" in block
    assert "chat_completions_create(client" not in block


def test_seed_endpoint_has_no_default_secret():
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text()
    idx = source.index("async def trigger_database_seed")
    block = source[idx: idx + 450]
    assert "emergent-seed-2024" not in block
    assert "SEED_SECRET_KEY" in block


def test_scheduler_job_uses_leader_lock():
    sched = (Path(__file__).resolve().parents[1] / "services" / "scheduler_job.py").read_text()
    assert "try_acquire_scheduler_leadership" in sched


ALLOWED_MUTATION_FILES = frozenset({
    "auth.py",
    "auth_oidc.py",
    "gdpr.py",
    "__init__.py",
})

ALLOWED_MUTATION_PATH_SNIPPETS = (
    "/webhook",
    "/health",
    "login",
    "register",
    "callback",
    "oidc",
    "forgot-password",
    "reset-password",
)


def _mutation_block_has_rbac(block: str, file_text: str) -> bool:
    if (
        "require_permission" in block
        or "require_roles" in block
        or "require_any_permission" in block
    ):
        return True
    for match in re.finditer(r"Depends\(([_a-zA-Z0-9]+)\)", block):
        dep = match.group(1)
        if (
            f"{dep} = require_permission" in file_text
            or f"{dep} = require_roles" in file_text
            or f"{dep} = require_any_permission" in file_text
        ):
            return True
    return False


PRIORITY_SENSITIVE_ROUTE_FILES = frozenset({
    "routes/admin.py",
    "routes/task_generation_admin.py",
    "routes/system.py",
    "routes/analytics.py",
    "routes/intelligence_map.py",
    "routes/chat.py",
    "routes/efms.py",
    "routes/granulometry.py",
    "routes/insights.py",
    "routes/feedback.py",
    "routes/reports.py",
    "routes/labels.py",
    "routes/config_performance.py",
    "routes/assets.py",
    "routes/image_analysis.py",
    "routes/decision_engine_routes.py",
    "routes/maintenance.py",
    "routes/stats.py",
})


def _priority_route_path(path: Path, routes_root: Path) -> str:
    rel = path.relative_to(routes_root.parent)
    return str(rel).replace("\\", "/")


def _feedback_user_mutation_ok(block: str) -> bool:
    """User-scoped feedback mutations only need authentication."""
    header = "\n".join(block.split("\n")[:8])
    decorator = header.split("\n", 1)[0]
    if "/admin" in decorator or "generate-prompt" in decorator:
        return False
    return "Depends(get_current_user)" in header


def test_sensitive_mutations_have_permission_deps():
    """CI guard: priority sensitive mutation routes must declare RBAC deps."""
    routes_root = Path(__file__).resolve().parents[1] / "routes"
    offenders = []
    for path in sorted(routes_root.rglob("*.py")):
        rel = _priority_route_path(path, routes_root)
        if rel not in PRIORITY_SENSITIVE_ROUTE_FILES and not rel.startswith(
            "routes/maintenance_scheduler/"
        ):
            continue
        text = path.read_text()
        for match in re.finditer(r"@router\.(post|put|patch|delete)\(", text):
            block = text[match.start() : match.start() + 400]
            if _mutation_block_has_rbac(block, text):
                continue
            if _feedback_user_mutation_ok(block):
                continue
            if any(snippet in block.lower() for snippet in ALLOWED_MUTATION_PATH_SNIPPETS):
                continue
            line = text[: match.start()].count("\n") + 1
            offenders.append(f"{rel}:{line}")
    assert offenders == [], f"Priority mutation routes missing RBAC deps: {offenders}"
