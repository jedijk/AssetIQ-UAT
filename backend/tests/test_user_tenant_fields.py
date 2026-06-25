"""Tests for user tenant field stamping."""
import os

os.environ.setdefault("BACKFILL_TENANT_ID", "Tyromer")

from services.tenant_schema import stamp_user_tenant_fields, tenant_id_from_user, with_tenant_id


def test_stamp_user_tenant_fields_from_creator():
    doc = {"email": "a@b.com"}
    creator = {"company_id": "Tyromer", "id": "owner-1"}
    out = stamp_user_tenant_fields(doc, creator)
    assert out["company_id"] == "Tyromer"
    assert out["tenant_id"] == "Tyromer"


def test_stamp_user_tenant_fields_from_env_when_no_creator():
    doc = {"email": "a@b.com"}
    out = stamp_user_tenant_fields(doc)
    assert out["company_id"] == "Tyromer"
    assert out["tenant_id"] == "Tyromer"


def test_stamp_user_tenant_fields_does_not_overwrite_existing():
    doc = {"email": "a@b.com", "company_id": "OtherCo"}
    out = stamp_user_tenant_fields(doc, {"company_id": "Tyromer"})
    assert out["company_id"] == "OtherCo"


def test_with_tenant_id_uses_company_id_from_user():
    user = {"company_id": "Tyromer"}
    doc = {"name": "widget"}
    out = with_tenant_id(doc, user)
    assert out["tenant_id"] == "Tyromer"
    assert tenant_id_from_user(user) == "Tyromer"
