"""Form submission tenant isolation — Wave 3 regression."""
import importlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    bool(os.environ.get("REACT_APP_BACKEND_URL")),
    reason="Skip motor event-loop tests in HTTP integration CI mode",
)


@pytest.fixture(scope="session")
def require_mongo():
    """Skip DB integration tests when MongoDB is unreachable."""
    from pymongo import MongoClient

    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017/test")
    try:
        client = MongoClient(url, serverSelectionTimeoutMS=2000)
        client.admin.command("ping")
    except Exception as exc:
        pytest.skip(f"MongoDB not available at {url}: {exc}")
    return url


@pytest.mark.usefixtures("require_mongo")
@pytest.mark.asyncio(loop_scope="session")
async def test_list_submissions_hides_unscoped_rows_in_strict_mode(monkeypatch):
    from database import db
    from services.form_service import FormService
    import services.tenant_schema as tenant_schema

    monkeypatch.setenv("TENANT_STRICT_MODE", "true")
    importlib.reload(tenant_schema)

    tid = f"co-test-{uuid.uuid4().hex[:8]}"
    other_tid = f"co-other-{uuid.uuid4().hex[:8]}"
    scoped_id = str(uuid.uuid4())
    legacy_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    await db.form_submissions.insert_many([
        {
            "id": scoped_id,
            "tenant_id": tid,
            "form_template_name": "Tenant scoped",
            "submitted_at": now,
            "created_at": now,
        },
        {
            "id": legacy_id,
            "form_template_name": "Missing tenant",
            "submitted_at": now,
            "created_at": now,
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": other_tid,
            "form_template_name": "Other tenant",
            "submitted_at": now,
            "created_at": now,
        },
    ])

    svc = FormService(db)
    user = {"company_id": tid, "id": "u-1"}
    result = await svc.list_submissions_lightweight(limit=50, user=user)
    ids = {row["id"] for row in result["submissions"]}

    assert scoped_id in ids
    assert legacy_id not in ids

    await db.form_submissions.delete_many({"id": {"$in": [scoped_id, legacy_id]}})
    monkeypatch.delenv("TENANT_STRICT_MODE", raising=False)
    importlib.reload(tenant_schema)


@pytest.mark.usefixtures("require_mongo")
@pytest.mark.asyncio(loop_scope="session")
async def test_submit_form_attaches_tenant_id():
    from bson import ObjectId

    from database import db
    from services.form_service import FormService

    oid = ObjectId()
    tpl_id = str(oid)
    now = datetime.now(timezone.utc)
    await db.form_templates.insert_one({
        "_id": oid,
        "id": tpl_id,
        "name": "Tenant submit probe",
        "fields": [],
        "is_active": True,
        "allow_partial_submission": True,
        "version": 1,
        "created_at": now,
        "updated_at": now,
    })

    tid = f"co-submit-{uuid.uuid4().hex[:8]}"
    user = {"company_id": tid, "id": "submit-user"}
    svc = FormService(db)
    created = await svc.submit_form(
        {"form_template_id": tpl_id, "values": []},
        submitted_by="submit-user",
        user=user,
    )

    stored = await db.form_submissions.find_one({"id": created["id"]}, {"_id": 0, "tenant_id": 1})
    assert stored and stored.get("tenant_id") == tid

    await db.form_submissions.delete_one({"id": created["id"]})
    await db.form_templates.delete_one({"_id": oid})


def test_production_dashboard_query_uses_tenant_filter():
    text = (
        Path(__file__).resolve().parent.parent / "services" / "production_dashboard_service.py"
    ).read_text(encoding="utf-8")
    assert "merge_tenant_filter" in text
    assert "submissions_query = merge_tenant_filter" in text
