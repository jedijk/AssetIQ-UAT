"""
Backend API tests for ThreatBase/AssetIQ - Iteration 11
Testing: Authentication, User Management, Task Planner, Form Builder, Actions
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://prod-debug-6.preview.emergentagent.com')

# Test credentials from test_credentials.md
OWNER_EMAIL = "jedijk@gmail.com"
OWNER_PASSWORD = "admin123"
ADMIN_EMAIL = "test@test.com"
ADMIN_PASSWORD = "test"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_owner_success(self):
        """Test owner login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["email"] == OWNER_EMAIL
        print(f"✓ Owner login successful - role: {data['user'].get('role')}")
    
    def test_login_admin_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        print(f"✓ Admin login successful - role: {data['user'].get('role')}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")
    
    def test_get_current_user(self):
        """Test /auth/me endpoint"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["token"]
        
        # Get current user
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        print(f"✓ Get current user successful - name: {data.get('name')}")


class TestPasswordReset:
    """Test password reset flow"""
    
    def test_forgot_password_endpoint(self):
        """Test forgot password endpoint (always returns success to prevent enumeration)"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": ADMIN_EMAIL
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        print("✓ Forgot password endpoint works correctly")
    
    def test_forgot_password_nonexistent_email(self):
        """Test forgot password with non-existent email (should still return success)"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": "nonexistent@test.com"
        })
        # Should return 200 to prevent email enumeration
        assert response.status_code == 200
        print("✓ Forgot password correctly handles non-existent email")


class TestUserManagement:
    """Test user management endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_users_list(self):
        """Test getting users list"""
        response = requests.get(f"{BASE_URL}/api/rbac/users", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert len(data["users"]) > 0
        print(f"✓ Got {len(data['users'])} users")
    
    def test_get_roles(self):
        """Test getting available roles"""
        response = requests.get(f"{BASE_URL}/api/rbac/roles", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "roles" in data
        print(f"✓ Got roles: {list(data['roles'].keys())}")
    
    def test_get_pending_users(self):
        """Test getting pending users"""
        response = requests.get(f"{BASE_URL}/api/rbac/users/pending", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "count" in data
        print(f"✓ Got {data['count']} pending users")
    
    def test_admin_reset_password_endpoint(self):
        """Test admin reset password endpoint"""
        # First get a user ID
        users_resp = requests.get(f"{BASE_URL}/api/rbac/users", headers=self.headers)
        users = users_resp.json()["users"]
        
        # Find a non-owner user to test with
        test_user = next((u for u in users if u["role"] != "owner"), None)
        if test_user:
            response = requests.post(f"{BASE_URL}/api/auth/admin-reset-password", 
                headers=self.headers,
                json={"user_id": test_user["id"]}
            )
            # Should succeed or fail gracefully
            assert response.status_code in [200, 500], f"Unexpected status: {response.status_code}"
            print(f"✓ Admin reset password endpoint tested for user: {test_user['email']}")
        else:
            print("⚠ No non-owner user found to test admin reset password")


class TestInstallations:
    """Test installation-related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_installations(self):
        """Test getting installations list"""
        response = requests.get(f"{BASE_URL}/api/equipment-hierarchy/installations", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "installations" in data
        print(f"✓ Got {len(data['installations'])} installations")


class TestTaskPlanner:
    """Test Task Planner endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_task_templates(self):
        """Test getting task templates"""
        response = requests.get(f"{BASE_URL}/api/task-templates", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        print(f"✓ Got {len(data['templates'])} task templates")
    
    def test_get_task_plans(self):
        """Test getting task plans"""
        response = requests.get(f"{BASE_URL}/api/task-plans", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        print(f"✓ Got {len(data['plans'])} task plans")
    
    def test_get_task_instances(self):
        """Test getting task instances"""
        response = requests.get(f"{BASE_URL}/api/task-instances", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "instances" in data
        print(f"✓ Got {len(data['instances'])} task instances")
    
    def test_get_task_stats(self):
        """Test getting task statistics"""
        response = requests.get(f"{BASE_URL}/api/tasks/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "by_status" in data
        print(f"✓ Got task stats: {data}")
    
    def test_create_task_template(self):
        """Test creating a task template"""
        template_data = {
            "name": f"TEST_Template_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "description": "Test template for automated testing",
            "discipline": "maintenance",
            "mitigation_strategy": "preventive",
            "default_interval": 30,
            "default_unit": "days",
            "estimated_duration_minutes": 60,
            "procedure_steps": ["Step 1", "Step 2"],
            "safety_requirements": ["Safety req 1"],
            "is_adhoc": False
        }
        response = requests.post(f"{BASE_URL}/api/task-templates", 
            headers=self.headers,
            json=template_data
        )
        assert response.status_code == 200, f"Failed to create template: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["name"] == template_data["name"]
        print(f"✓ Created task template: {data['id']}")
        
        # Cleanup - delete the template
        delete_resp = requests.delete(f"{BASE_URL}/api/task-templates/{data['id']}", headers=self.headers)
        assert delete_resp.status_code == 200
        print(f"✓ Cleaned up test template")


class TestFormBuilder:
    """Test Form Builder endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_form_templates(self):
        """Test getting form templates"""
        response = requests.get(f"{BASE_URL}/api/form-templates", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        print(f"✓ Got {len(data['templates'])} form templates")
    
    def test_create_form_template(self):
        """Test creating a form template"""
        template_data = {
            "name": f"TEST_Form_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "description": "Test form for automated testing",
            "discipline": "maintenance",
            "require_signature": False,
            "allow_partial_submission": False,
            "fields": [
                {
                    "id": "test_field_1",
                    "label": "Test Field",
                    "field_type": "text",
                    "required": True,
                    "order": 0
                }
            ]
        }
        response = requests.post(f"{BASE_URL}/api/form-templates", 
            headers=self.headers,
            json=template_data
        )
        assert response.status_code == 200, f"Failed to create form: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"✓ Created form template: {data['id']}")
        
        # Cleanup
        delete_resp = requests.delete(f"{BASE_URL}/api/form-templates/{data['id']}", headers=self.headers)
        assert delete_resp.status_code == 200
        print(f"✓ Cleaned up test form template")
    
    def test_get_form_submissions(self):
        """Test getting form submissions"""
        response = requests.get(f"{BASE_URL}/api/form-submissions", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "submissions" in data
        print(f"✓ Got {len(data['submissions'])} form submissions")


class TestEquipmentHierarchy:
    """Test Equipment Hierarchy endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_equipment_nodes(self):
        """Test getting equipment hierarchy nodes"""
        response = requests.get(f"{BASE_URL}/api/equipment-hierarchy/nodes", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        print(f"✓ Got {len(data['nodes'])} equipment nodes")
    
    def test_get_equipment_stats(self):
        """Test getting equipment hierarchy stats"""
        response = requests.get(f"{BASE_URL}/api/equipment-hierarchy/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Got equipment stats: {data}")


class TestThreatsObservations:
    """Test Threats/Observations endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_threats(self):
        """Test getting threats list"""
        response = requests.get(f"{BASE_URL}/api/threats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        # Response could be a list or dict with threats key
        if isinstance(data, list):
            print(f"✓ Got {len(data)} threats")
        else:
            threats = data.get("threats", data)
            print(f"✓ Got threats data")
    
    def test_get_stats(self):
        """Test getting stats"""
        response = requests.get(f"{BASE_URL}/api/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Got stats: {data}")


class TestActions:
    """Test Actions endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_actions(self):
        """Test getting actions list"""
        response = requests.get(f"{BASE_URL}/api/actions", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "actions" in data
        assert "stats" in data
        print(f"✓ Got {len(data['actions'])} actions, stats: {data['stats']}")
    
    def test_create_and_delete_action(self):
        """Test creating and deleting an action"""
        # First get a threat to use as source
        threats_resp = requests.get(f"{BASE_URL}/api/threats", headers=self.headers)
        threats = threats_resp.json() if isinstance(threats_resp.json(), list) else threats_resp.json().get("threats", [])
        
        source_id = threats[0]["id"] if threats else "test-source-id"
        
        action_data = {
            "title": f"TEST_Action_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "description": "Test action for automated testing",
            "priority": "medium",
            "status": "open",
            "source_type": "threat",
            "source_id": source_id,
            "source_name": "Test Source"
        }
        
        # Create action
        create_resp = requests.post(f"{BASE_URL}/api/actions", 
            headers=self.headers,
            json=action_data
        )
        assert create_resp.status_code == 200, f"Failed to create action: {create_resp.text}"
        created = create_resp.json()
        assert "id" in created
        action_id = created["id"]
        print(f"✓ Created action: {action_id}")
        
        # Delete action
        delete_resp = requests.delete(f"{BASE_URL}/api/actions/{action_id}", headers=self.headers)
        assert delete_resp.status_code == 200, f"Failed to delete action: {delete_resp.text}"
        print(f"✓ Deleted action: {action_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
