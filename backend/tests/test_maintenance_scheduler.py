"""
Tests for AssetIQ Maintenance Scheduler & Planning Engine
Covers: dashboard, programs, scheduler, tasks (daily/weekly/timeline),
technicians, apply-strategy, AI planner, task lifecycle.
"""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://cm-task-config.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "jedijk@gmail.com"
PASSWORD = "Jaap8019@"


@pytest.fixture(scope="module")
def auth_headers():
    """Login and obtain bearer token."""
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} - {r.text[:300]}"
    data = r.json()
    token = data.get("token") or data.get("access_token") or data.get("data", {}).get("token")
    assert token, f"No token in login response: {data}"
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def equipment_type_id(auth_headers):
    """Pick any equipment type id from existing strategies."""
    r = requests.get(f"{API}/maintenance-strategies-v2", headers=auth_headers, timeout=30)
    if r.status_code == 200:
        body = r.json()
        items = body if isinstance(body, list) else body.get("strategies", body.get("items", body.get("data", [])))
        for it in items:
            etid = it.get("equipment_type_id") or it.get("id")
            if etid:
                return etid
    return None


# -------- Dashboard / KPIs --------
class TestDashboard:
    def test_get_dashboard(self, auth_headers):
        r = requests.get(f"{API}/maintenance-scheduler/dashboard", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "backlog" in data
        assert "open_tasks" in data["backlog"]
        assert "compliance" in data


# -------- Programs --------
class TestPrograms:
    def test_get_programs(self, auth_headers):
        r = requests.get(f"{API}/maintenance-scheduler/programs", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "programs" in data and isinstance(data["programs"], list)
        assert "total" in data

    def test_programs_summary(self, auth_headers, equipment_type_id):
        if not equipment_type_id:
            pytest.skip("No equipment_type_id available")
        r = requests.get(
            f"{API}/maintenance-scheduler/programs/{equipment_type_id}/summary",
            headers=auth_headers, timeout=30
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "equipment_count" in data
        assert "total_programs" in data
        assert "overdue_count" in data


# -------- Scheduler --------
class TestScheduler:
    def test_run_scheduler(self, auth_headers):
        r = requests.post(f"{API}/maintenance-scheduler/run-scheduler",
                          headers=auth_headers, json={}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "tasks_created" in data
        assert "tasks_skipped" in data
        assert "programs_reviewed" in data


# -------- Tasks --------
class TestTasks:
    def test_get_tasks(self, auth_headers):
        r = requests.get(f"{API}/maintenance-scheduler/tasks", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "tasks" in data and isinstance(data["tasks"], list)

    def test_daily_planner(self, auth_headers):
        r = requests.get(f"{API}/maintenance-scheduler/tasks/daily-planner",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "overdue" in data and "today" in data and "tomorrow" in data

    def test_weekly_planner(self, auth_headers):
        r = requests.get(f"{API}/maintenance-scheduler/tasks/weekly-planner",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "days" in data and isinstance(data["days"], list)
        assert len(data["days"]) == 7


# -------- Timeline --------
class TestTimeline:
    def test_get_timeline(self, auth_headers):
        r = requests.get(f"{API}/maintenance-scheduler/timeline", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "timeline" in data
        assert "total_tasks" in data


# -------- Technicians --------
class TestTechnicians:
    created_id = None

    def test_get_technicians(self, auth_headers):
        r = requests.get(f"{API}/maintenance-scheduler/technicians",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "technicians" in data

    def test_create_technician(self, auth_headers):
        payload = {
            "user_id": "TEST_user_001",
            "name": "TEST_Tech_AI_Planner",
            "email": "TEST_tech@example.com",
            "weekly_available_hours": 40,
            "daily_available_hours": 8,
            "disciplines": ["mechanical"],
            "skills": ["pump_repair"]
        }
        r = requests.post(f"{API}/maintenance-scheduler/technicians",
                          headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "id" in data
        TestTechnicians.created_id = data["id"]

        # Verify via GET
        g = requests.get(f"{API}/maintenance-scheduler/technicians",
                        headers=auth_headers, timeout=30)
        names = [t.get("name") for t in g.json().get("technicians", [])]
        assert "TEST_Tech_AI_Planner" in names


# -------- Apply Strategy --------
class TestApplyStrategy:
    def test_apply_strategy(self, auth_headers, equipment_type_id):
        if not equipment_type_id:
            pytest.skip("No equipment_type_id available")
        r = requests.post(
            f"{API}/maintenance-scheduler/apply-strategy/{equipment_type_id}",
            headers=auth_headers,
            json={"equipment_ids": []},
            timeout=30
        )
        # Accept 200 (applied), 400 (strategy not active), 404 (no equipment)
        assert r.status_code in [200, 400, 404], r.text[:300]


# -------- AI Planner --------
class TestAIPlanner:
    def test_ai_plan(self, auth_headers):
        start = datetime.utcnow().date().isoformat()
        end = (datetime.utcnow().date() + timedelta(days=14)).isoformat()
        r = requests.post(
            f"{API}/maintenance-scheduler/ai-plan",
            headers=auth_headers,
            json={"start_date": start, "end_date": end},
            timeout=120  # LLM call - allow generous time
        )
        assert r.status_code == 200, f"AI plan failed: {r.status_code} - {r.text[:500]}"
        data = r.json()
        assert "recommendations" in data
        assert "summary" in data or "message" in data

    def test_ai_plan_apply_empty(self, auth_headers):
        r = requests.post(
            f"{API}/maintenance-scheduler/ai-plan/apply",
            headers=auth_headers,
            json={"recommendations": []},
            timeout=30
        )
        # Empty recommendations list should return 400
        assert r.status_code == 400, r.text[:300]


# -------- Task Lifecycle --------
class TestTaskLifecycle:
    def test_task_lifecycle(self, auth_headers):
        """Try to find an open task and exercise PATCH, then defer."""
        r = requests.get(f"{API}/maintenance-scheduler/tasks", headers=auth_headers, timeout=30)
        tasks = r.json().get("tasks", [])
        if not tasks:
            pytest.skip("No tasks available for lifecycle test")
        task = tasks[0]
        tid = task["id"]

        # PATCH update notes
        p = requests.patch(f"{API}/maintenance-scheduler/tasks/{tid}",
                           headers=auth_headers,
                           json={"notes": "TEST_lifecycle_note"},
                           timeout=30)
        assert p.status_code == 200, p.text[:300]

        # Defer task
        new_date = (datetime.utcnow().date() + timedelta(days=10)).isoformat()
        d = requests.post(f"{API}/maintenance-scheduler/tasks/{tid}/defer",
                          headers=auth_headers,
                          json={"new_due_date": new_date, "reason": "TEST_reason"},
                          timeout=30)
        assert d.status_code == 200, d.text[:300]
        assert d.json().get("new_due_date") == new_date
