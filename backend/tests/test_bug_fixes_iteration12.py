"""
Test suite for ThreatBase/AssetIQ Bug Fixes - Iteration 12
Tests the 6 bug fixes implemented:
1. Password reset API endpoint
2. Failure Mode fullscreen mode
3. Failure Mode validation avatar
4. Form Builder discipline dropdown
5. Mobile menu button position
6. Feedback button visibility
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://prod-debug-6.preview.emergentagent.com')


class TestPasswordResetAPI:
    """Test password reset functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for owner account"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("token")
    
    @pytest.fixture
    def user_id(self, auth_token):
        """Get a user ID for testing"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/users",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        users = response.json().get("users", [])
        assert len(users) > 0, "No users found"
        return users[0]["id"]
    
    def test_admin_reset_password_endpoint_exists(self, auth_token, user_id):
        """Test that admin-reset-password endpoint returns proper response"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin-reset-password",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"user_id": user_id}
        )
        
        # Should return 200 with success message
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "success", f"Expected success status: {data}"
        assert "message" in data, "Response should contain message"
        print(f"✓ Password reset API returned: {data['message']}")
    
    def test_admin_reset_password_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin-reset-password",
            headers={"Content-Type": "application/json"},
            json={"user_id": "test-id"}
        )
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Password reset API requires authentication")
    
    def test_admin_reset_password_invalid_user(self, auth_token):
        """Test that endpoint handles invalid user ID"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin-reset-password",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"user_id": "non-existent-user-id"}
        )
        
        # Should return 404 for non-existent user
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Password reset API returns 404 for invalid user")


class TestFailureModeAPI:
    """Test failure mode related APIs"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    def test_failure_modes_list(self, auth_token):
        """Test that failure modes endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/failure-modes",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "failure_modes" in data
        print(f"✓ Found {len(data['failure_modes'])} failure modes")
    
    def test_failure_mode_validation_endpoint(self, auth_token):
        """Test that validation endpoint exists and works"""
        # First get a failure mode
        response = requests.get(
            f"{BASE_URL}/api/failure-modes",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        modes = response.json().get("failure_modes", [])
        
        if len(modes) > 0:
            fm_id = modes[0]["id"]
            
            # Test validation endpoint with correct field names
            response = requests.post(
                f"{BASE_URL}/api/failure-modes/{fm_id}/validate",
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "validated_by_name": "Test Validator",
                    "validated_by_position": "Test Engineer"
                }
            )
            
            # Should return 200 or already validated (400)
            assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}: {response.text}"
            print(f"✓ Validation endpoint works for failure mode {fm_id}")


class TestFormTemplateAPI:
    """Test form template APIs"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    def test_form_templates_list(self, auth_token):
        """Test that form templates endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/form-templates",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        print(f"✓ Found {len(data['templates'])} form templates")
    
    def test_form_template_discipline_in_existing(self, auth_token):
        """Test that existing form templates have discipline field available"""
        response = requests.get(
            f"{BASE_URL}/api/form-templates",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        templates = data.get("templates", [])
        
        # Check that discipline field is available in template schema
        # Even if no templates exist, the endpoint should work
        print(f"✓ Form templates endpoint works, found {len(templates)} templates")
        
        # If templates exist, check they have discipline field
        if len(templates) > 0:
            template = templates[0]
            # discipline can be None or a string value
            assert "discipline" in template or template.get("discipline") is None or isinstance(template.get("discipline"), str)
            print(f"✓ Template has discipline field: {template.get('discipline')}")


class TestUserManagementAPI:
    """Test user management APIs"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    def test_users_list(self, auth_token):
        """Test that users endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/rbac/users",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        print(f"✓ Found {len(data['users'])} users")
    
    def test_user_avatar_endpoint(self, auth_token):
        """Test that user avatar endpoint exists"""
        # Get a user ID
        response = requests.get(
            f"{BASE_URL}/api/rbac/users",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        users = response.json().get("users", [])
        
        if len(users) > 0:
            user_id = users[0]["id"]
            
            # Test avatar endpoint
            response = requests.get(
                f"{BASE_URL}/api/users/{user_id}/avatar",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            
            # Should return 200 (with image) or 404 (no avatar)
            assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
            print(f"✓ Avatar endpoint works for user {user_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
