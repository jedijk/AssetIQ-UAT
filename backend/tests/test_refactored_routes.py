"""
Test suite for verifying all refactored routes work correctly after server.py segmentation.
Tests all major endpoints to ensure the refactoring didn't break any functionality.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"


class TestAuthRoutes:
    """Test authentication routes after refactoring"""
    
    def test_login_success(self):
        """POST /api/auth/login - test login with test@test.com / test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Login successful, token received")
        return data["token"]
    
    def test_get_me(self):
        """GET /api/auth/me - verify token auth works"""
        # First login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = login_response.json()["token"]
        
        # Test /auth/me endpoint
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Get me failed: {response.text}"
        data = response.json()
        assert data["email"] == TEST_EMAIL
        print(f"✓ Auth/me endpoint working, user: {data['email']}")


class TestThreatsRoutes:
    """Test threats routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_threats(self):
        """GET /api/threats - list threats"""
        response = requests.get(f"{BASE_URL}/api/threats", headers=self.headers)
        assert response.status_code == 200, f"Get threats failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Threats endpoint working, found {len(data)} threats")


class TestStatsRoutes:
    """Test stats routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_stats(self):
        """GET /api/stats - dashboard stats"""
        response = requests.get(f"{BASE_URL}/api/stats", headers=self.headers)
        assert response.status_code == 200, f"Get stats failed: {response.text}"
        data = response.json()
        assert "total_threats" in data, "total_threats not in response"
        assert "open_threats" in data, "open_threats not in response"
        assert "critical_count" in data, "critical_count not in response"
        print(f"✓ Stats endpoint working: {data}")
    
    def test_reliability_scores(self):
        """GET /api/reliability-scores - reliability scores"""
        response = requests.get(f"{BASE_URL}/api/reliability-scores", headers=self.headers)
        assert response.status_code == 200, f"Get reliability scores failed: {response.text}"
        data = response.json()
        assert "global_scores" in data or "nodes" in data, "Expected reliability data structure"
        print(f"✓ Reliability scores endpoint working")


class TestFailureModesRoutes:
    """Test failure modes routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_failure_modes(self):
        """GET /api/failure-modes?limit=3 - failure modes listing"""
        response = requests.get(f"{BASE_URL}/api/failure-modes?limit=3", headers=self.headers)
        assert response.status_code == 200, f"Get failure modes failed: {response.text}"
        data = response.json()
        assert "failure_modes" in data or "total" in data, "Expected failure modes data"
        print(f"✓ Failure modes endpoint working")


class TestEquipmentRoutes:
    """Test equipment hierarchy routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_equipment_nodes(self):
        """GET /api/equipment-hierarchy/nodes - equipment hierarchy"""
        response = requests.get(f"{BASE_URL}/api/equipment-hierarchy/nodes", headers=self.headers)
        assert response.status_code == 200, f"Get equipment nodes failed: {response.text}"
        data = response.json()
        assert "nodes" in data, "nodes not in response"
        print(f"✓ Equipment hierarchy endpoint working, found {len(data['nodes'])} nodes")


class TestEFMsRoutes:
    """Test EFM routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_high_risk_efms(self):
        """GET /api/efms/high-risk - high risk EFMs"""
        response = requests.get(f"{BASE_URL}/api/efms/high-risk", headers=self.headers)
        assert response.status_code == 200, f"Get high risk EFMs failed: {response.text}"
        data = response.json()
        assert "efms" in data or "total" in data, "Expected EFMs data structure"
        print(f"✓ High risk EFMs endpoint working")


class TestTasksRoutes:
    """Test task routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_task_templates(self):
        """GET /api/task-templates - task templates"""
        response = requests.get(f"{BASE_URL}/api/task-templates", headers=self.headers)
        assert response.status_code == 200, f"Get task templates failed: {response.text}"
        data = response.json()
        assert "templates" in data or "total" in data or isinstance(data, dict), "Expected task templates data"
        print(f"✓ Task templates endpoint working")
    
    def test_get_task_plans(self):
        """GET /api/task-plans - task plans"""
        response = requests.get(f"{BASE_URL}/api/task-plans", headers=self.headers)
        assert response.status_code == 200, f"Get task plans failed: {response.text}"
        data = response.json()
        assert "plans" in data or "total" in data or isinstance(data, dict), "Expected task plans data"
        print(f"✓ Task plans endpoint working")


class TestFormsRoutes:
    """Test forms routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_form_templates(self):
        """GET /api/form-templates - form templates"""
        response = requests.get(f"{BASE_URL}/api/form-templates", headers=self.headers)
        assert response.status_code == 200, f"Get form templates failed: {response.text}"
        data = response.json()
        assert "templates" in data or "total" in data or isinstance(data, dict), "Expected form templates data"
        print(f"✓ Form templates endpoint working")


class TestObservationsRoutes:
    """Test observations routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_observations(self):
        """GET /api/observations - observations"""
        response = requests.get(f"{BASE_URL}/api/observations", headers=self.headers)
        assert response.status_code == 200, f"Get observations failed: {response.text}"
        data = response.json()
        assert "observations" in data or "total" in data or isinstance(data, dict), "Expected observations data"
        print(f"✓ Observations endpoint working")


class TestDecisionEngineRoutes:
    """Test decision engine routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_decision_dashboard(self):
        """GET /api/decision-engine/dashboard - decision engine"""
        response = requests.get(f"{BASE_URL}/api/decision-engine/dashboard", headers=self.headers)
        assert response.status_code == 200, f"Get decision dashboard failed: {response.text}"
        data = response.json()
        print(f"✓ Decision engine dashboard endpoint working")


class TestInvestigationsRoutes:
    """Test investigations routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_investigations(self):
        """GET /api/investigations - investigations list"""
        response = requests.get(f"{BASE_URL}/api/investigations", headers=self.headers)
        assert response.status_code == 200, f"Get investigations failed: {response.text}"
        data = response.json()
        assert "investigations" in data, "investigations not in response"
        print(f"✓ Investigations endpoint working, found {len(data['investigations'])} investigations")


class TestActionsRoutes:
    """Test actions routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_actions(self):
        """GET /api/actions - centralized actions"""
        response = requests.get(f"{BASE_URL}/api/actions", headers=self.headers)
        assert response.status_code == 200, f"Get actions failed: {response.text}"
        data = response.json()
        assert "actions" in data, "actions not in response"
        print(f"✓ Actions endpoint working, found {len(data['actions'])} actions")


class TestMaintenanceRoutes:
    """Test maintenance strategies routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_maintenance_strategies(self):
        """GET /api/maintenance-strategies - maintenance strategies"""
        response = requests.get(f"{BASE_URL}/api/maintenance-strategies", headers=self.headers)
        assert response.status_code == 200, f"Get maintenance strategies failed: {response.text}"
        data = response.json()
        assert "strategies" in data, "strategies not in response"
        print(f"✓ Maintenance strategies endpoint working, found {len(data['strategies'])} strategies")


class TestAnalyticsRoutes:
    """Test analytics routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_risk_overview(self):
        """GET /api/analytics/risk-overview - analytics"""
        response = requests.get(f"{BASE_URL}/api/analytics/risk-overview", headers=self.headers)
        assert response.status_code == 200, f"Get risk overview failed: {response.text}"
        data = response.json()
        print(f"✓ Analytics risk overview endpoint working")


class TestRBACRoutes:
    """Test RBAC routes after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_rbac_roles(self):
        """GET /api/rbac/roles - RBAC roles"""
        response = requests.get(f"{BASE_URL}/api/rbac/roles", headers=self.headers)
        assert response.status_code == 200, f"Get RBAC roles failed: {response.text}"
        data = response.json()
        assert "roles" in data, "roles not in response"
        print(f"✓ RBAC roles endpoint working")


class TestRootEndpoint:
    """Test root endpoint"""
    
    def test_root_endpoint(self):
        """GET /api/ - root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Root endpoint failed: {response.text}"
        data = response.json()
        assert "message" in data, "message not in response"
        print(f"✓ Root endpoint working: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
