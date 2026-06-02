"""
Tests for AssetIQ Maintenance Scheduler & Planning Engine
Covers: dashboard, programs, scheduler, tasks (daily/weekly/timeline),
technicians, apply-strategy, AI planner, task lifecycle.
"""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://maintenance-nexus-1.preview.emergentagent.com").rstrip("/")
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



# -------- Strategy → Program Propagation (regression for "not saved + not in schedule") --------
class TestStrategyPropagation:
    def test_task_template_patch_propagates_to_programs(self, auth_headers):
        """PATCH on a strategy task should sync name/duration/freq to all linked maintenance_programs."""
        # Find a strategy that has programs
        progs_r = requests.get(
            f"{API}/maintenance-scheduler/programs",
            headers=auth_headers,
            timeout=30,
        )
        programs = progs_r.json().get("programs", [])
        if not programs:
            pytest.skip("No maintenance programs to verify propagation against")

        # Pick a program — capture its equipment_type_id and task_template_id
        prog = next((p for p in programs if p.get("task_template_id") and p.get("equipment_type_id")), None)
        if not prog:
            pytest.skip("No program with task_template_id found")

        etid = prog["equipment_type_id"]
        tid = prog["task_template_id"]
        original_name = prog.get("task_name")
        original_duration = prog.get("estimated_duration_hours", 1.0)

        # PATCH the task template with new name + duration + freq matrix
        new_name = f"{original_name} [TEST]"
        new_duration = 4.25
        patch = requests.patch(
            f"{API}/maintenance-strategies-v2/{etid}/tasks/{tid}",
            headers=auth_headers,
            json={
                "name": new_name,
                "duration_hours": new_duration,
                "frequency_matrix": {"low": "annual", "medium": "quarterly", "high": "monthly"},
            },
            timeout=30,
        )
        assert patch.status_code == 200, patch.text[:300]
        body = patch.json()
        assert "programs_updated" in body, "patch response missing programs_updated"
        assert body["programs_updated"] >= 1, f"expected at least 1 program updated, got {body}"

        # Verify program reflects the change
        progs_after = requests.get(
            f"{API}/maintenance-scheduler/programs",
            headers=auth_headers,
            timeout=30,
        ).json().get("programs", [])
        synced = next((p for p in progs_after if p.get("task_template_id") == tid), None)
        assert synced is not None
        assert synced.get("task_name") == new_name, f"name not propagated: {synced.get('task_name')}"
        assert synced.get("estimated_duration_hours") == new_duration, f"duration not propagated: {synced.get('estimated_duration_hours')}"

        # Restore original values
        requests.patch(
            f"{API}/maintenance-strategies-v2/{etid}/tasks/{tid}",
            headers=auth_headers,
            json={"name": original_name, "duration_hours": original_duration},
            timeout=30,
        )

    def test_task_template_patch_bumps_strategy_version(self, auth_headers):
        """PATCH on a task template should increment the strategy's semver version (e.g. 1.0 -> 1.1)."""
        progs_r = requests.get(
            f"{API}/maintenance-scheduler/programs",
            headers=auth_headers,
            timeout=30,
        )
        programs = progs_r.json().get("programs", [])
        prog = next((p for p in programs if p.get("task_template_id") and p.get("equipment_type_id")), None)
        if not prog:
            pytest.skip("No program with task_template_id found")

        etid = prog["equipment_type_id"]
        tid = prog["task_template_id"]

        # Read current strategy version
        s_before = requests.get(
            f"{API}/maintenance-strategies-v2/{etid}",
            headers=auth_headers,
            timeout=30,
        ).json()
        before_version = (s_before.get("strategy") or {}).get("version", "1.0")

        # PATCH the task
        patch = requests.patch(
            f"{API}/maintenance-strategies-v2/{etid}/tasks/{tid}",
            headers=auth_headers,
            json={"duration_hours": 1.75},
            timeout=30,
        )
        assert patch.status_code == 200, patch.text[:300]
        new_version = patch.json().get("version")
        assert new_version is not None, "patch response missing version"
        assert new_version != before_version, (
            f"version should have bumped, but stayed at {new_version}"
        )

        # Confirm strategy reflects the new version
        s_after = requests.get(
            f"{API}/maintenance-strategies-v2/{etid}",
            headers=auth_headers,
            timeout=30,
        ).json()
        assert (s_after.get("strategy") or {}).get("version") == new_version


    def test_task_template_patch_syncs_open_scheduled_tasks(self, auth_headers):
        """PATCH on a strategy task should also sync metadata onto OPEN scheduled_tasks."""
        progs = requests.get(
            f"{API}/maintenance-scheduler/programs",
            headers=auth_headers,
            timeout=30,
        ).json().get("programs", [])
        prog = next((p for p in progs if p.get("task_template_id") and p.get("equipment_type_id")), None)
        if not prog:
            pytest.skip("No program with task_template_id found")

        etid = prog["equipment_type_id"]
        tid = prog["task_template_id"]
        original_name = prog.get("task_name")
        original_duration = prog.get("estimated_duration_hours", 1.0)

        marker = f"{original_name} ::SYNC_TEST::"
        r = requests.patch(
            f"{API}/maintenance-strategies-v2/{etid}/tasks/{tid}",
            headers=auth_headers,
            json={"name": marker, "duration_hours": 2.75},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # `scheduled_tasks_synced` is informational; may be 0 if no scheduled tasks exist
        assert "scheduled_tasks_synced" in body

        # If any scheduled tasks exist for this template, verify the rename propagated
        tasks_resp = requests.get(
            f"{API}/maintenance-scheduler/tasks?equipment_type_id={etid}",
            headers=auth_headers,
            timeout=30,
        ).json()
        matching = [t for t in tasks_resp.get("tasks", []) if marker in (t.get("task_name") or "")]
        if matching:
            for t in matching:
                assert t["task_name"] == marker
                assert t["estimated_hours"] == 2.75

        # Restore
        requests.patch(
            f"{API}/maintenance-strategies-v2/{etid}/tasks/{tid}",
            headers=auth_headers,
            json={"name": original_name, "duration_hours": original_duration},
            timeout=30,
        )

    def test_task_delete_cancels_open_scheduled_tasks(self, auth_headers):
        """DELETE a strategy task should auto-cancel its open scheduled_tasks."""
        # Find a strategy that has applied programs
        progs = requests.get(
            f"{API}/maintenance-scheduler/programs",
            headers=auth_headers,
            timeout=30,
        ).json().get("programs", [])
        if not progs:
            pytest.skip("No programs available")
        etid = progs[0]["equipment_type_id"]

        # Add a throwaway task
        add_r = requests.post(
            f"{API}/maintenance-strategies-v2/{etid}/tasks",
            headers=auth_headers,
            json={
                "name": "_PYTEST_DELETE_CASCADE_",
                "description": "test only",
                "task_type": "preventive",
                "duration_hours": 0.5,
                "discipline": "mechanical",
                "procedure_steps": [],
                "skills_required": [],
                "failure_mode_ids": [],
                "detection_methods": [],
                "frequency_matrix": {"low": "monthly", "medium": "weekly", "high": "daily"},
            },
            timeout=30,
        )
        assert add_r.status_code == 200, add_r.text[:300]
        new_task_id = add_r.json().get("id")

        # Apply strategy + run scheduler so scheduled_tasks get created
        equipment_ids = list({p["equipment_id"] for p in progs if p.get("equipment_type_id") == etid})[:3]
        requests.post(
            f"{API}/maintenance-scheduler/apply-strategy/{etid}",
            headers=auth_headers,
            json={"equipment_ids": equipment_ids},
            timeout=30,
        )
        requests.post(
            f"{API}/maintenance-scheduler/run-scheduler",
            headers=auth_headers,
            json={"equipment_type_id": etid},
            timeout=30,
        )

        # DELETE the task → expect cancellation cascade
        d = requests.delete(
            f"{API}/maintenance-strategies-v2/{etid}/tasks/{new_task_id}",
            headers=auth_headers,
            timeout=30,
        )
        assert d.status_code == 200, d.text[:300]
        body = d.json()
        assert "scheduled_tasks_cancelled" in body, body
        # If any scheduled tasks existed for this template, they should be cancelled now
        if body["scheduled_tasks_cancelled"] > 0:
            tasks_resp = requests.get(
                f"{API}/maintenance-scheduler/tasks?equipment_type_id={etid}&include_completed=true",
                headers=auth_headers,
                timeout=30,
            ).json()
            cancelled = [
                t for t in tasks_resp.get("tasks", [])
                if t.get("task_name") == "_PYTEST_DELETE_CASCADE_"
            ]
            assert cancelled
            assert all(t["status"] == "cancelled" for t in cancelled)

