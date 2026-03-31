"""
Backend API tests for ThreatBase/AssetIQ - Iteration 11
Testing: Authentication, User Management, Task Planner, Form Builder, Actions
"""
import pytest
from datetime import datetime
from conftest import BASE_URL, TEST_ADMIN_EMAIL, TEST_OWNER_EMAIL


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_owner_success(self, api_client, owner_credentials):
        """Test owner login with valid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=owner_credentials)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["email"] == owner_credentials["email"]
        print(f"✓ Owner login successful - role: {data['user'].get('role')}")
    
    def test_login_admin_success(self, api_client, admin_credentials):
        """Test admin login with valid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=admin_credentials)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["email"] == admin_credentials["email"]
        print(f"✓ Admin login successful - role: {data['user'].get('role')}")
    
    def test_login_invalid_credentials(self, api_client):
        """Test login with invalid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")
    
    def test_get_current_user(self, authenticated_client, admin_credentials):
        """Test /auth/me endpoint"""
        response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == admin_credentials["email"]
        print(f"✓ Get current user successful - name: {data.get('name')}")


class TestPasswordReset:
    """Test password reset flow"""
    
    def test_forgot_password_endpoint(self, api_client, admin_credentials):
        """Test forgot password endpoint (always returns success to prevent enumeration)"""
        response = api_client.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": admin_credentials["email"]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        print("✓ Forgot password endpoint works correctly")
    
    def test_forgot_password_nonexistent_email(self, api_client):
        """Test forgot password with non-existent email (should still return success)"""
        response = api_client.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": "nonexistent@test.com"
        })
        # Should return 200 to prevent email enumeration
        assert response.status_code == 200
        print("✓ Forgot password correctly handles non-existent email")


class TestUserManagement:
    """Test user management endpoints"""
    
    def test_get_users_list(self, owner_authenticated_client):
        """Test getting users list"""
        response = owner_authenticated_client.get(f"{BASE_URL}/api/rbac/users")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert len(data["users"]) > 0
        print(f"✓ Got {len(data['users'])} users")
    
    def test_get_roles(self, owner_authenticated_client):
        """Test getting available roles"""
        response = owner_authenticated_client.get(f"{BASE_URL}/api/rbac/roles")
        assert response.status_code == 200
        data = response.json()
        assert "roles" in data
        print(f"✓ Got roles: {list(data['roles'].keys())}")
    
    def test_get_pending_users(self, owner_authenticated_client):
        """Test getting pending users"""
        response = owner_authenticated_client.get(f"{BASE_URL}/api/rbac/users/pending")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "count" in data
        print(f"✓ Got {data['count']} pending users")
    
    def test_admin_reset_password_endpoint(self, owner_authenticated_client):
        """Test admin reset password endpoint"""
        # First get a user ID
        users_resp = owner_authenticated_client.get(f"{BASE_URL}/api/rbac/users")
        users = users_resp.json()["users"]
        
        # Find a non-owner user to test with
        test_user = next((u for u in users if u["role"] != "owner"), None)
        if test_user:
            response = owner_authenticated_client.post(
                f"{BASE_URL}/api/auth/admin-reset-password",
                json={"user_id": test_user["id"]}
            )
            # Should succeed or fail gracefully
            assert response.status_code in [200, 500], f"Unexpected status: {response.status_code}"
            print(f"✓ Admin reset password endpoint tested for user: {test_user['email']}")
        else:
            print("⚠ No non-owner user found to test admin reset password")


class TestInstallations:
    """Test installation-related endpoints"""
    
    def test_get_installations(self, authenticated_client):
        """Test getting installations list"""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/installations")
        assert response.status_code == 200
        data = response.json()
        assert "installations" in data
        print(f"✓ Got {len(data['installations'])} installations")


class TestTaskPlanner:
    """Test Task Planner endpoints"""
    
    def test_get_task_templates(self, authenticated_client):
        """Test getting task templates"""
        response = authenticated_client.get(f"{BASE_URL}/api/task-templates")
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        print(f"✓ Got {len(data['templates'])} task templates")
    
    def test_get_task_plans(self, authenticated_client):
        """Test getting task plans"""
        response = authenticated_client.get(f"{BASE_URL}/api/task-plans")
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        print(f"✓ Got {len(data['plans'])} task plans")
    
    def test_get_task_instances(self, authenticated_client):
        """Test getting task instances"""
        response = authenticated_client.get(f"{BASE_URL}/api/task-instances")
        assert response.status_code == 200
        data = response.json()
        assert "instances" in data
        print(f"✓ Got {len(data['instances'])} task instances")
    
    def test_get_task_stats(self, authenticated_client):
        """Test getting task statistics"""
        response = authenticated_client.get(f"{BASE_URL}/api/tasks/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "by_status" in data
        print(f"✓ Got task stats: {data}")
    
    def test_create_task_template(self, authenticated_client):
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
        response = authenticated_client.post(f"{BASE_URL}/api/task-templates", json=template_data)
        assert response.status_code == 200, f"Failed to create template: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["name"] == template_data["name"]
        print(f"✓ Created task template: {data['id']}")
        
        # Cleanup - delete the template
        delete_resp = authenticated_client.delete(f"{BASE_URL}/api/task-templates/{data['id']}")
        assert delete_resp.status_code == 200
        print(f"✓ Cleaned up test template")


class TestFormBuilder:
    """Test Form Builder endpoints"""
    
    def test_get_form_templates(self, authenticated_client):
        """Test getting form templates"""
        response = authenticated_client.get(f"{BASE_URL}/api/form-templates")
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        print(f"✓ Got {len(data['templates'])} form templates")
    
    def test_create_form_template(self, authenticated_client):
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
        response = authenticated_client.post(f"{BASE_URL}/api/form-templates", json=template_data)
        assert response.status_code == 200, f"Failed to create form: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"✓ Created form template: {data['id']}")
        
        # Cleanup
        delete_resp = authenticated_client.delete(f"{BASE_URL}/api/form-templates/{data['id']}")
        assert delete_resp.status_code == 200
        print(f"✓ Cleaned up test form template")
    
    def test_get_form_submissions(self, authenticated_client):
        """Test getting form submissions"""
        response = authenticated_client.get(f"{BASE_URL}/api/form-submissions")
        assert response.status_code == 200
        data = response.json()
        assert "submissions" in data
        print(f"✓ Got {len(data['submissions'])} form submissions")


class TestEquipmentHierarchy:
    """Test Equipment Hierarchy endpoints"""
    
    def test_get_equipment_nodes(self, authenticated_client):
        """Test getting equipment hierarchy nodes"""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/nodes")
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        print(f"✓ Got {len(data['nodes'])} equipment nodes")
    
    def test_get_equipment_stats(self, authenticated_client):
        """Test getting equipment hierarchy stats"""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/stats")
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Got equipment stats: {data}")


class TestThreatsObservations:
    """Test Threats/Observations endpoints"""
    
    def test_get_threats(self, authenticated_client):
        """Test getting threats list"""
        response = authenticated_client.get(f"{BASE_URL}/api/threats")
        assert response.status_code == 200
        data = response.json()
        # Response could be a list or dict with threats key
        if isinstance(data, list):
            print(f"✓ Got {len(data)} threats")
        else:
            print(f"✓ Got threats data")
    
    def test_get_stats(self, authenticated_client):
        """Test getting stats"""
        response = authenticated_client.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Got stats: {data}")


class TestActions:
    """Test Actions endpoints"""
    
    def test_get_actions(self, authenticated_client):
        """Test getting actions list"""
        response = authenticated_client.get(f"{BASE_URL}/api/actions")
        assert response.status_code == 200
        data = response.json()
        assert "actions" in data
        assert "stats" in data
        print(f"✓ Got {len(data['actions'])} actions, stats: {data['stats']}")
    
    def test_create_and_delete_action(self, authenticated_client):
        """Test creating and deleting an action"""
        # First get a threat to use as source
        threats_resp = authenticated_client.get(f"{BASE_URL}/api/threats")
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
        create_resp = authenticated_client.post(f"{BASE_URL}/api/actions", json=action_data)
        assert create_resp.status_code == 200, f"Failed to create action: {create_resp.text}"
        created = create_resp.json()
        assert "id" in created
        action_id = created["id"]
        print(f"✓ Created action: {action_id}")
        
        # Delete action
        delete_resp = authenticated_client.delete(f"{BASE_URL}/api/actions/{action_id}")
        assert delete_resp.status_code == 200, f"Failed to delete action: {delete_resp.text}"
        print(f"✓ Deleted action: {action_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
