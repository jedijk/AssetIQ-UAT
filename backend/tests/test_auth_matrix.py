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
