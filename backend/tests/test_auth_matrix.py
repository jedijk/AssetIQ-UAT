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
