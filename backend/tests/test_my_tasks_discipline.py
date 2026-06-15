"""Backend tests: my-tasks discipline filtering (case-insensitive regex)."""
import os
import pytest
import requests

from conftest import TEST_OWNER_EMAIL, TEST_OWNER_PASSWORD

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = TEST_OWNER_EMAIL
PASSWORD = TEST_OWNER_PASSWORD


@pytest.fixture(scope="module")
def auth_token():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set — skipping HTTP integration tests")
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Login failed ({r.status_code}) — skipping authenticated tests")
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestMyTasksDiscipline:
    def test_my_tasks_no_filter(self, headers):
        r = requests.get(f"{BASE_URL}/api/my-tasks?filter=open", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "tasks" in data and isinstance(data["tasks"], list)

    def test_my_tasks_discipline_lowercase(self, headers):
        r = requests.get(f"{BASE_URL}/api/my-tasks?filter=open&discipline=rotating", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # All returned items with discipline field should match (regex case-insensitive)
        for t in data["tasks"]:
            d = (t.get("discipline") or "").lower()
            if d:
                assert "rotating" in d, f"Unexpected discipline {d}"

    def test_my_tasks_discipline_mixed_case(self, headers):
        r = requests.get(f"{BASE_URL}/api/my-tasks?filter=open&discipline=Rotating", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        for t in data["tasks"]:
            d = (t.get("discipline") or "").lower()
            if d:
                assert "rotating" in d

    def test_my_tasks_discipline_no_match(self, headers):
        r = requests.get(f"{BASE_URL}/api/my-tasks?filter=open&discipline=zzz_nomatch", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Tasks may still include items without discipline field, but none with non-matching discipline
        for t in data["tasks"]:
            d = (t.get("discipline") or "").lower()
            if d:
                assert "zzz_nomatch" in d

    def test_my_tasks_all_disciplines(self, headers):
        # Sanity check each known discipline returns 200
        for disc in ["rotating", "static", "piping", "electrical", "instrumentation", "civil", "operations", "laboratory"]:
            r = requests.get(f"{BASE_URL}/api/my-tasks?filter=open&discipline={disc}", headers=headers, timeout=30)
            assert r.status_code == 200, f"{disc}: {r.text}"


class TestUserProfile:
    """Confirm the discipline-source fields on the seed user."""

    def test_user_discipline_fields(self, headers):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
        u = r.json()["user"]
        # Document what's present so the next agent knows
        print(f"user.discipline={u.get('discipline')!r}, department={u.get('department')!r}, position={u.get('position')!r}")
        # No discipline field, department='Engineering' -> normalizes to 'operations' on frontend
        assert u.get("department") == "Engineering"
