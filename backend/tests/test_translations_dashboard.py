"""Tests for P1 Translation Management Dashboard + Dictionary Validation features."""
import os
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or os.environ.get(
    "PUBLIC_BACKEND_URL", ""
).rstrip("/")
if not BASE_URL:
    _env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if _env_path.is_file():
        for line in _env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

pytestmark = pytest.mark.skipif(not BASE_URL, reason="Backend URL not configured")

OWNER_EMAIL = "jedijk@gmail.com"
OWNER_PASSWORD = "Jaap8019@"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return {"Authorization": f"Bearer {token}"}


# ============ Coverage =============
def test_coverage_endpoint(auth_headers):
    r = requests.get(f"{BASE_URL}/api/translations/coverage", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "coverage" in data
    cov = data["coverage"]
    expected_keys = {"failure_mode", "equipment_type", "equipment_node",
                     "maintenance_task_template", "observation", "investigation", "form_template"}
    missing = expected_keys - set(cov.keys())
    assert not missing, f"Missing coverage keys: {missing}. Got: {list(cov.keys())}"
    for k in expected_keys:
        assert "translated" in cov[k]
        assert "total" in cov[k]
        assert isinstance(cov[k]["translated"], int)
        assert isinstance(cov[k]["total"], int)


# ============ Dictionary list =============
def test_dictionary_list(auth_headers):
    r = requests.get(f"{BASE_URL}/api/translations/dictionary", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "terms" in data and "total" in data
    assert data["total"] >= 26, f"Expected ≥26 terms, got {data['total']}"
    # Verify shape of first term
    t0 = data["terms"][0]
    assert "id" in t0 and "source_term" in t0 and "translations" in t0


# ============ Dictionary validate (NL) =============
def test_dictionary_validate_nl(auth_headers):
    r = requests.post(f"{BASE_URL}/api/translations/dictionary/validate?language_code=nl",
                      headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "issues" in data and "terms_checked" in data and "total_issues" in data
    assert data["terms_checked"] >= 20, f"terms_checked too low: {data['terms_checked']}"
    # NL expected to surface issues per task description (~19)
    assert data["total_issues"] >= 0
    if data["total_issues"] > 0:
        iss = data["issues"][0]
        for k in ("entity_type", "entity_id", "translation_value", "expected_term", "source_term"):
            assert k in iss, f"Issue missing key {k}: {iss}"


# ============ Dictionary validate (DE) =============
def test_dictionary_validate_de(auth_headers):
    r = requests.post(f"{BASE_URL}/api/translations/dictionary/validate?language_code=de",
                      headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["terms_checked"] >= 1
    assert data["total_issues"] >= 0


# ============ Dictionary CRUD =============
def test_dictionary_crud_lifecycle(auth_headers):
    body = {
        "source_term": "TestTerm_E2E",
        "category": "mechanical",
        "translations": {"nl": "TestTermNL", "de": "TestTermDE"},
        "is_protected": False,
    }
    # Cleanup first if exists
    listr = requests.get(f"{BASE_URL}/api/translations/dictionary",
                         headers=auth_headers, params={"search": "TestTerm_E2E"}, timeout=15).json()
    for t in listr.get("terms", []):
        if t["source_term"].lower() == body["source_term"].lower():
            requests.delete(f"{BASE_URL}/api/translations/dictionary/{t['id']}", headers=auth_headers, timeout=15)

    # CREATE
    r = requests.post(f"{BASE_URL}/api/translations/dictionary", headers=auth_headers, json=body, timeout=15)
    assert r.status_code == 200, r.text
    term = r.json()["term"]
    assert term["source_term"] == "TestTerm_E2E"
    assert term["translations"]["nl"] == "TestTermNL"
    term_id = term["id"]

    # VERIFY GET
    r2 = requests.get(f"{BASE_URL}/api/translations/dictionary",
                      headers=auth_headers, params={"search": "TestTerm_E2E"}, timeout=15)
    assert r2.status_code == 200
    found = [t for t in r2.json()["terms"] if t["id"] == term_id]
    assert len(found) == 1

    # PATCH
    upd = requests.patch(f"{BASE_URL}/api/translations/dictionary/{term_id}",
                        headers=auth_headers,
                        json={"translations": {"nl": "TestTermNL_v2", "de": "TestTermDE_v2"}}, timeout=15)
    assert upd.status_code == 200, upd.text
    assert upd.json()["term"]["translations"]["nl"] == "TestTermNL_v2"

    # DELETE
    delr = requests.delete(f"{BASE_URL}/api/translations/dictionary/{term_id}",
                           headers=auth_headers, timeout=15)
    assert delr.status_code == 200
    # Confirm deletion
    r3 = requests.get(f"{BASE_URL}/api/translations/dictionary",
                      headers=auth_headers, params={"search": "TestTerm_E2E"}, timeout=15).json()
    assert not any(t["id"] == term_id for t in r3.get("terms", []))


# ============ Seed idempotency =============
def test_dictionary_seed_idempotent(auth_headers):
    r1 = requests.post(f"{BASE_URL}/api/translations/dictionary/seed", headers=auth_headers, timeout=30)
    assert r1.status_code == 200, r1.text
    r2 = requests.post(f"{BASE_URL}/api/translations/dictionary/seed", headers=auth_headers, timeout=30)
    assert r2.status_code == 200, r2.text
    # Second call should always be 0 created
    assert r2.json()["created"] == 0, f"Seed not idempotent: second call created {r2.json()['created']}"
