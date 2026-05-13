"""
Test Production Dashboard API endpoints.
Tests for:
- GET /api/production/dashboard - Dashboard data with KPIs, production log, actions, insights
- GET /api/production/events - Production events list
- POST /api/production/events - Create production event
- DELETE /api/production/events/{id} - Delete production event
"""
import pytest
import requests
import os
import uuid

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable not set")

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "admin123"

# Test dates with seeded data
SEEDED_DATE_1 = "2026-04-13"
SEEDED_DATE_2 = "2026-04-12"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for test user."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    return response.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token."""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Database-Environment": "Production"
    }


class TestProductionDashboardAPI:
    """Tests for GET /api/production/dashboard endpoint."""
    
    def test_dashboard_returns_200(self, auth_headers):
        """Test dashboard endpoint returns 200 status."""
        response = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_dashboard_returns_kpis(self, auth_headers):
        """Test dashboard returns KPIs structure."""
        response = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify KPIs structure
        assert "kpis" in data, "Response should contain 'kpis'"
        kpis = data["kpis"]
        
        # Check required KPI fields
        required_kpi_fields = [
            "total_input", "waste", "waste_pct", "yield_pct", 
            "avg_viscosity", "rsd", "runtime_hours"
        ]
        for field in required_kpi_fields:
            assert field in kpis, f"KPIs should contain '{field}'"
    
    def test_dashboard_returns_production_log(self, auth_headers):
        """Test dashboard returns production_log array."""
        response = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "production_log" in data, "Response should contain 'production_log'"
        assert isinstance(data["production_log"], list), "production_log should be a list"
    
    def test_dashboard_returns_actions_and_insights(self, auth_headers):
        """Test dashboard returns actions and insights arrays."""
        response = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "actions" in data, "Response should contain 'actions'"
        assert "insights" in data, "Response should contain 'insights'"
        assert isinstance(data["actions"], list), "actions should be a list"
        assert isinstance(data["insights"], list), "insights should be a list"
    
    def test_dashboard_returns_chart_data(self, auth_headers):
        """Test dashboard returns chart data arrays."""
        response = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check chart data arrays
        assert "waste_downtime_series" in data, "Response should contain 'waste_downtime_series'"
        assert "scatter_data" in data, "Response should contain 'scatter_data'"
        assert "viscosity_series" in data, "Response should contain 'viscosity_series'"
    
    def test_dashboard_shift_parameter(self, auth_headers):
        """Test dashboard accepts single and comma-separated shift parameters."""
        for shift_key in ("morning", "afternoon", "night"):
            resp = requests.get(
                f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift={shift_key}",
                headers=auth_headers,
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["shift"] == shift_key
            assert data.get("shifts") == [shift_key]

        multi = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning,night",
            headers=auth_headers,
        )
        assert multi.status_code == 200
        body = multi.json()
        assert body["shift"] == "morning,night"
        assert body["shifts"] == ["morning", "night"]

        response_day = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=day",
            headers=auth_headers,
        )
        assert response_day.status_code == 200
        assert response_day.json()["shift"] == "day"
    
    def test_dashboard_date_parameter(self, auth_headers):
        """Test dashboard returns correct date in response."""
        response = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["date"] == SEEDED_DATE_1, f"Expected date {SEEDED_DATE_1}, got {data['date']}"
    
    def test_dashboard_requires_auth(self):
        """Test dashboard endpoint requires authentication."""
        response = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning"
        )
        assert response.status_code == 401, "Should return 401 without auth"


class TestProductionEventsAPI:
    """Tests for GET /api/production/events endpoint."""
    
    def test_events_returns_200(self, auth_headers):
        """Test events endpoint returns 200 status."""
        response = requests.get(
            f"{BASE_URL}/api/production/events?date={SEEDED_DATE_1}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_events_returns_list(self, auth_headers):
        """Test events endpoint returns events list."""
        response = requests.get(
            f"{BASE_URL}/api/production/events?date={SEEDED_DATE_1}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "events" in data, "Response should contain 'events'"
        assert "total" in data, "Response should contain 'total'"
        assert isinstance(data["events"], list), "events should be a list"
    
    def test_events_filter_by_type(self, auth_headers):
        """Test events can be filtered by type (action/insight)."""
        # Filter by action type
        response = requests.get(
            f"{BASE_URL}/api/production/events?date={SEEDED_DATE_1}&event_type=action",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Filter by insight type
        response = requests.get(
            f"{BASE_URL}/api/production/events?date={SEEDED_DATE_1}&event_type=insight",
            headers=auth_headers
        )
        assert response.status_code == 200
    
    def test_events_requires_auth(self):
        """Test events endpoint requires authentication."""
        response = requests.get(
            f"{BASE_URL}/api/production/events?date={SEEDED_DATE_1}"
        )
        assert response.status_code == 401, "Should return 401 without auth"


class TestCreateProductionEvent:
    """Tests for POST /api/production/events endpoint."""
    
    def test_create_event_returns_201_or_200(self, auth_headers):
        """Test creating a production event."""
        event_data = {
            "title": f"TEST_Event_{uuid.uuid4().hex[:8]}",
            "description": "Test event description",
            "type": "action",
            "severity": "warning",
            "date": SEEDED_DATE_1,
            "time": "10:30"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/events",
            json=event_data,
            headers=auth_headers
        )
        
        # Accept both 200 and 201 as success
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain 'id'"
        assert data["title"] == event_data["title"], "Title should match"
        assert data["type"] == event_data["type"], "Type should match"
        
        # Store event ID for cleanup
        return data["id"]
    
    def test_create_event_with_insight_type(self, auth_headers):
        """Test creating an insight event."""
        event_data = {
            "title": f"TEST_Insight_{uuid.uuid4().hex[:8]}",
            "description": "Test insight description",
            "type": "insight",
            "severity": "info",
            "date": SEEDED_DATE_1,
            "time": "11:00"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/events",
            json=event_data,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["type"] == "insight", "Type should be 'insight'"
    
    def test_create_event_requires_auth(self):
        """Test create event requires authentication."""
        event_data = {
            "title": "Unauthorized Event",
            "type": "action"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/events",
            json=event_data
        )
        assert response.status_code == 401, "Should return 401 without auth"


class TestDeleteProductionEvent:
    """Tests for DELETE /api/production/events/{id} endpoint."""
    
    def test_delete_event(self, auth_headers):
        """Test deleting a production event (create then delete)."""
        # First create an event
        event_data = {
            "title": f"TEST_ToDelete_{uuid.uuid4().hex[:8]}",
            "description": "Event to be deleted",
            "type": "action",
            "severity": "info",
            "date": SEEDED_DATE_1
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/production/events",
            json=event_data,
            headers=auth_headers
        )
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        event_id = create_response.json()["id"]
        
        # Now delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/production/events/{event_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        data = delete_response.json()
        assert data.get("status") == "deleted" or data.get("id") == event_id
    
    def test_delete_nonexistent_event(self, auth_headers):
        """Test deleting a non-existent event."""
        fake_id = str(uuid.uuid4())
        
        response = requests.delete(
            f"{BASE_URL}/api/production/events/{fake_id}",
            headers=auth_headers
        )
        
        # Should return 200 with error message or 404
        assert response.status_code in [200, 404], f"Expected 200/404, got {response.status_code}"
    
    def test_delete_requires_auth(self):
        """Test delete event requires authentication."""
        response = requests.delete(
            f"{BASE_URL}/api/production/events/some-id"
        )
        assert response.status_code == 401, "Should return 401 without auth"


class TestProductionDashboardIntegration:
    """Integration tests for production dashboard flow."""
    
    def test_create_event_appears_in_dashboard(self, auth_headers):
        """Test that created event appears in dashboard actions/insights."""
        # Create an action event
        event_data = {
            "title": f"TEST_Integration_{uuid.uuid4().hex[:8]}",
            "description": "Integration test event",
            "type": "action",
            "severity": "warning",
            "date": SEEDED_DATE_1,
            "time": "12:00"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/production/events",
            json=event_data,
            headers=auth_headers
        )
        assert create_response.status_code in [200, 201]
        event_id = create_response.json()["id"]
        
        # Fetch dashboard and check if event appears
        dashboard_response = requests.get(
            f"{BASE_URL}/api/production/dashboard?date={SEEDED_DATE_1}&shift=morning",
            headers=auth_headers
        )
        assert dashboard_response.status_code == 200
        
        dashboard_data = dashboard_response.json()
        actions = dashboard_data.get("actions", [])
        
        # Check if our event is in the actions list
        event_found = any(a.get("id") == event_id for a in actions)
        assert event_found, f"Created event {event_id} should appear in dashboard actions"
        
        # Cleanup - delete the event
        requests.delete(
            f"{BASE_URL}/api/production/events/{event_id}",
            headers=auth_headers
        )


# Cleanup fixture to remove test events after all tests
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_events(auth_headers):
    """Cleanup any TEST_ prefixed events after tests complete."""
    yield
    
    # Get all events and delete TEST_ prefixed ones
    try:
        response = requests.get(
            f"{BASE_URL}/api/production/events",
            headers=auth_headers
        )
        if response.status_code == 200:
            events = response.json().get("events", [])
            for event in events:
                if event.get("title", "").startswith("TEST_"):
                    requests.delete(
                        f"{BASE_URL}/api/production/events/{event['id']}",
                        headers=auth_headers
                    )
    except Exception:
        pass  # Ignore cleanup errors
