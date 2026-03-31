"""
Test suite for verifying all refactored routes work correctly after server.py segmentation.
Tests all major endpoints to ensure the refactoring didn't break any functionality.
"""
import pytest
import requests
from conftest import BASE_URL, TEST_ADMIN_EMAIL


class TestAuthRoutes:
    """Test authentication routes after refactoring"""
    
    def test_login_success(self, api_client, admin_credentials):
        """POST /api/auth/login - test login with admin credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=admin_credentials)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["email"] == admin_credentials["email"]
        print(f"✓ Login successful, token received")
        return data["token"]
    
    def test_get_me(self, authenticated_client, admin_credentials):
        """GET /api/auth/me - verify token auth works"""
        response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Get me failed: {response.text}"
        data = response.json()
        assert data["email"] == admin_credentials["email"]
        print(f"✓ Auth/me endpoint working, user: {data['email']}")


class TestThreatsRoutes:
    """Test threats routes after refactoring"""
    
    def test_get_threats(self, authenticated_client):
        """GET /api/threats - list threats"""
        response = authenticated_client.get(f"{BASE_URL}/api/threats")
        assert response.status_code == 200, f"Get threats failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Threats endpoint working, found {len(data)} threats")


class TestStatsRoutes:
    """Test stats routes after refactoring"""
    
    def test_get_stats(self, authenticated_client):
        """GET /api/stats - dashboard stats"""
        response = authenticated_client.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200, f"Get stats failed: {response.text}"
        data = response.json()
        assert "total_threats" in data, "total_threats not in response"
        assert "open_threats" in data, "open_threats not in response"
        assert "critical_count" in data, "critical_count not in response"
        print(f"✓ Stats endpoint working: {data}")
    
    def test_reliability_scores(self, authenticated_client):
        """GET /api/reliability-scores - reliability scores"""
        response = authenticated_client.get(f"{BASE_URL}/api/reliability-scores")
        assert response.status_code == 200, f"Get reliability scores failed: {response.text}"
        data = response.json()
        assert "global_scores" in data or "nodes" in data, "Expected reliability data structure"
        print(f"✓ Reliability scores endpoint working")


class TestFailureModesRoutes:
    """Test failure modes routes after refactoring"""
    
    def test_get_failure_modes(self, authenticated_client):
        """GET /api/failure-modes?limit=3 - failure modes listing"""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes?limit=3")
        assert response.status_code == 200, f"Get failure modes failed: {response.text}"
        data = response.json()
        assert "failure_modes" in data or "total" in data, "Expected failure modes data"
        print(f"✓ Failure modes endpoint working")


class TestEquipmentRoutes:
    """Test equipment hierarchy routes after refactoring"""
    
    def test_get_equipment_nodes(self, authenticated_client):
        """GET /api/equipment-hierarchy/nodes - equipment hierarchy"""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes")
        assert response.status_code == 200, f"Get equipment nodes failed: {response.text}"
        data = response.json()
        assert "nodes" in data, "nodes not in response"
        print(f"✓ Equipment hierarchy endpoint working, found {len(data['nodes'])} nodes")


class TestEFMsRoutes:
    """Test EFM routes after refactoring"""
    
    def test_get_high_risk_efms(self, authenticated_client):
        """GET /api/efms/high-risk - high risk EFMs"""
        response = authenticated_client.get(f"{BASE_URL}/api/efms/high-risk")
        assert response.status_code == 200, f"Get high risk EFMs failed: {response.text}"
        data = response.json()
        assert "efms" in data or "total" in data, "Expected EFMs data structure"
        print(f"✓ High risk EFMs endpoint working")


class TestTasksRoutes:
    """Test task routes after refactoring"""
    
    def test_get_task_templates(self, authenticated_client):
        """GET /api/task-templates - task templates"""
        response = authenticated_client.get(f"{BASE_URL}/api/task-templates")
        assert response.status_code == 200, f"Get task templates failed: {response.text}"
        data = response.json()
        assert "templates" in data or "total" in data or isinstance(data, dict), "Expected task templates data"
        print(f"✓ Task templates endpoint working")
    
    def test_get_task_plans(self, authenticated_client):
        """GET /api/task-plans - task plans"""
        response = authenticated_client.get(f"{BASE_URL}/api/task-plans")
        assert response.status_code == 200, f"Get task plans failed: {response.text}"
        data = response.json()
        assert "plans" in data or "total" in data or isinstance(data, dict), "Expected task plans data"
        print(f"✓ Task plans endpoint working")


class TestFormsRoutes:
    """Test forms routes after refactoring"""
    
    def test_get_form_templates(self, authenticated_client):
        """GET /api/form-templates - form templates"""
        response = authenticated_client.get(f"{BASE_URL}/api/form-templates")
        assert response.status_code == 200, f"Get form templates failed: {response.text}"
        data = response.json()
        assert "templates" in data or "total" in data or isinstance(data, dict), "Expected form templates data"
        print(f"✓ Form templates endpoint working")


class TestObservationsRoutes:
    """Test observations routes after refactoring"""
    
    def test_get_observations(self, authenticated_client):
        """GET /api/observations - observations"""
        response = authenticated_client.get(f"{BASE_URL}/api/observations")
        assert response.status_code == 200, f"Get observations failed: {response.text}"
        data = response.json()
        assert "observations" in data or "total" in data or isinstance(data, dict), "Expected observations data"
        print(f"✓ Observations endpoint working")


class TestDecisionEngineRoutes:
    """Test decision engine routes after refactoring"""
    
    def test_get_decision_dashboard(self, authenticated_client):
        """GET /api/decision-engine/dashboard - decision engine"""
        response = authenticated_client.get(f"{BASE_URL}/api/decision-engine/dashboard")
        assert response.status_code == 200, f"Get decision dashboard failed: {response.text}"
        print(f"✓ Decision engine dashboard endpoint working")


class TestInvestigationsRoutes:
    """Test investigations routes after refactoring"""
    
    def test_get_investigations(self, authenticated_client):
        """GET /api/investigations - investigations list"""
        response = authenticated_client.get(f"{BASE_URL}/api/investigations")
        assert response.status_code == 200, f"Get investigations failed: {response.text}"
        data = response.json()
        assert "investigations" in data, "investigations not in response"
        print(f"✓ Investigations endpoint working, found {len(data['investigations'])} investigations")


class TestActionsRoutes:
    """Test actions routes after refactoring"""
    
    def test_get_actions(self, authenticated_client):
        """GET /api/actions - centralized actions"""
        response = authenticated_client.get(f"{BASE_URL}/api/actions")
        assert response.status_code == 200, f"Get actions failed: {response.text}"
        data = response.json()
        assert "actions" in data, "actions not in response"
        print(f"✓ Actions endpoint working, found {len(data['actions'])} actions")


class TestMaintenanceRoutes:
    """Test maintenance strategies routes after refactoring"""
    
    def test_get_maintenance_strategies(self, authenticated_client):
        """GET /api/maintenance-strategies - maintenance strategies"""
        response = authenticated_client.get(f"{BASE_URL}/api/maintenance-strategies")
        assert response.status_code == 200, f"Get maintenance strategies failed: {response.text}"
        data = response.json()
        assert "strategies" in data, "strategies not in response"
        print(f"✓ Maintenance strategies endpoint working, found {len(data['strategies'])} strategies")


class TestAnalyticsRoutes:
    """Test analytics routes after refactoring"""
    
    def test_get_risk_overview(self, authenticated_client):
        """GET /api/analytics/risk-overview - analytics"""
        response = authenticated_client.get(f"{BASE_URL}/api/analytics/risk-overview")
        assert response.status_code == 200, f"Get risk overview failed: {response.text}"
        print(f"✓ Analytics risk overview endpoint working")


class TestRBACRoutes:
    """Test RBAC routes after refactoring"""
    
    def test_get_rbac_roles(self, authenticated_client):
        """GET /api/rbac/roles - RBAC roles"""
        response = authenticated_client.get(f"{BASE_URL}/api/rbac/roles")
        assert response.status_code == 200, f"Get RBAC roles failed: {response.text}"
        data = response.json()
        assert "roles" in data, "roles not in response"
        print(f"✓ RBAC roles endpoint working")


class TestRootEndpoint:
    """Test root endpoint"""
    
    def test_root_endpoint(self, api_client):
        """GET /api/ - root endpoint"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Root endpoint failed: {response.text}"
        data = response.json()
        assert "message" in data, "message not in response"
        print(f"✓ Root endpoint working: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
