"""RBAC alias and permission matrix unit tests."""
from pathlib import Path

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
    source = (Path(__file__).resolve().parents[1] / "routes" / "permissions.py").read_text()
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
    assert "ai_gateway" in source or "from services.ai_gateway import chat" in source


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
    source = (Path(__file__).resolve().parents[1] / "routes" / "investigations.py").read_text()
    assert "from services.ai_gateway import chat as ai_gateway_chat" in source
    idx = source.index("async def ai_problem_check")
    block = source[idx: idx + 2500]
    assert "ai_gateway_chat" in block
    assert 'endpoint="investigations.ai_problem_check"' in block


def test_equipment_search_escapes_regex():
    source = (Path(__file__).resolve().parents[1] / "routes" / "equipment" / "equipment_utils.py").read_text()
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
    source = (Path(__file__).resolve().parents[1] / "routes" / "production_logs.py").read_text()
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
    source = (Path(__file__).resolve().parents[1] / "services" / "pm_import_service.py").read_text()
    assert "from services.ai_gateway import chat_with_images" in source
    assert "client.chat.completions.create" not in source


def test_production_logs_ingest_uses_tracked_jobs():
    source = (Path(__file__).resolve().parents[1] / "routes" / "production_logs.py").read_text()
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
    source = (Path(__file__).resolve().parents[1] / "routes" / "production.py").read_text()
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
    source = (Path(__file__).resolve().parents[1] / "routes" / "my_tasks.py").read_text()
    assert '_tasks_read = require_permission("tasks:read")' in source
    assert '_tasks_write = require_permission("tasks:write")' in source
    assert "Depends(_tasks_read)" in source
    assert "Depends(_tasks_write)" in source
    assert "_ensure_user_can_execute_task" in source


def test_work_items_mutations_require_tasks_write():
    source = (Path(__file__).resolve().parents[1] / "routes" / "work_items.py").read_text()
    assert 'require_permission("tasks:write")' in source
    idx = source.index("async def start_work_item")
    assert "Depends(_tasks_write)" in source[idx: idx + 250]
    idx_list = source.index("async def list_adhoc_plans")
    assert "Depends(_tasks_read)" in source[idx_list: idx_list + 200]


def test_production_logs_require_settings_permissions():
    source = (Path(__file__).resolve().parents[1] / "routes" / "production_logs.py").read_text()
    assert '_settings_read = require_permission("settings:read")' in source
    assert '_settings_write = require_permission("settings:write")' in source
    assert "_owner_only" not in source
    idx = source.index("async def upload_log_files")
    assert "Depends(_settings_write)" in source[idx: idx + 250]
    idx_get = source.index("async def list_jobs")
    assert "Depends(_settings_read)" in source[idx_get: idx_get + 250]


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
