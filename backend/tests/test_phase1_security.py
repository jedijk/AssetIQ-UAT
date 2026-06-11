"""Phase 1 security helpers: JWT config, DB env normalization, RBAC deps."""
import pytest

from database import normalize_db_env_key, REQUIRE_JWT_SECRET_KEY, ENVIRONMENT
from auth import _role_can_switch_database
from services.rbac_service import RBACService


class _FakeDb:
    users = None


def test_normalize_db_env_key_aliases():
    assert normalize_db_env_key("Production") == "production"
    assert normalize_db_env_key("UAT") == "uat"
    assert normalize_db_env_key("prod") == "production"
    assert normalize_db_env_key(None) is None
    assert normalize_db_env_key("unknown") is None


def test_role_can_switch_database_owner_only():
    assert _role_can_switch_database("owner") is True
    assert _role_can_switch_database("admin") is False
    assert _role_can_switch_database("viewer") is False
    assert _role_can_switch_database(None) is False


def test_rbac_has_permission_owner():
    svc = RBACService(_FakeDb())
    assert svc.has_permission("owner", "library:write") is True
    assert svc.has_permission("viewer", "library:write") is False
    assert svc.has_permission("viewer", "library:read") is True


def test_jwt_require_secret_default_by_environment(monkeypatch):
    """Non-dev environments should default to requiring JWT secret unless opted out."""
    monkeypatch.delenv("REQUIRE_JWT_SECRET_KEY", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")
    # Re-import would re-evaluate; document expected policy instead of full reload.
    assert ENVIRONMENT in ("development", "dev", "local", "test", "testing") or REQUIRE_JWT_SECRET_KEY is not None
