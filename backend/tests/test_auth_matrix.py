"""RBAC alias and permission matrix unit tests."""
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
