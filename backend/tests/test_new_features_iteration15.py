"""
Test new features for iteration 15:
1. Create Custom Role functionality in Permissions
2. Delete custom role functionality
3. Voice-to-text transcription in Feedback
4. BackButton navigation (frontend only - tested via Playwright)
"""

import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "jedijk@gmail.com"
OWNER_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def owner_token(api_client):
    """Get authentication token for owner account."""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": OWNER_EMAIL,
        "password": OWNER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Owner authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, owner_token):
    """Session with auth header."""
    api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
    return api_client


class TestRoleCreation:
    """Test custom role creation functionality."""
    
    TEST_ROLE_NAME = "test_technician"
    TEST_ROLE_DISPLAY = "Test Technician"
    
    def test_get_permissions_requires_owner(self, api_client):
        """Test that permissions endpoint requires owner role."""
        # Without auth
        response = api_client.get(f"{BASE_URL}/api/permissions")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_get_all_permissions(self, authenticated_client):
        """Test getting all permissions returns expected structure."""
        response = authenticated_client.get(f"{BASE_URL}/api/permissions")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "permissions" in data
        assert "features" in data
        assert "roles" in data
        
        # Verify system roles exist
        assert "admin" in data["roles"]
        assert "viewer" in data["roles"]
        assert "owner" in data["roles"]
    
    def test_create_custom_role(self, authenticated_client):
        """Test creating a new custom role."""
        # First, clean up if role exists from previous test
        authenticated_client.delete(f"{BASE_URL}/api/permissions/roles/{self.TEST_ROLE_NAME}")
        
        # Create new role
        response = authenticated_client.post(f"{BASE_URL}/api/permissions/roles", json={
            "name": self.TEST_ROLE_NAME,
            "display_name": self.TEST_ROLE_DISPLAY,
            "description": "Test role for automated testing",
            "base_role": "viewer"
        })
        
        assert response.status_code == 200, f"Failed to create role: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "role" in data
        assert data["role"]["name"] == self.TEST_ROLE_NAME
        assert data["role"]["display_name"] == self.TEST_ROLE_DISPLAY
        
        # Verify permissions were copied from base role
        assert "permissions" in data
        assert "observations" in data["permissions"]
    
    def test_verify_role_appears_in_list(self, authenticated_client):
        """Test that created role appears in permissions list."""
        response = authenticated_client.get(f"{BASE_URL}/api/permissions")
        assert response.status_code == 200
        
        data = response.json()
        assert self.TEST_ROLE_NAME in data["roles"], f"Custom role not found in roles list: {data['roles']}"
        
        # Verify custom_roles list
        if "custom_roles" in data:
            assert self.TEST_ROLE_NAME in data["custom_roles"]
    
    def test_list_roles_endpoint(self, authenticated_client):
        """Test the dedicated list roles endpoint."""
        response = authenticated_client.get(f"{BASE_URL}/api/permissions/roles")
        assert response.status_code == 200
        
        data = response.json()
        assert "roles" in data
        
        # Find our custom role
        custom_role = next((r for r in data["roles"] if r["name"] == self.TEST_ROLE_NAME), None)
        assert custom_role is not None, f"Custom role not found in roles list"
        assert custom_role["is_system"] == False
        assert custom_role["is_deletable"] == True
    
    def test_cannot_create_duplicate_role(self, authenticated_client):
        """Test that creating a duplicate role fails."""
        response = authenticated_client.post(f"{BASE_URL}/api/permissions/roles", json={
            "name": self.TEST_ROLE_NAME,
            "display_name": "Duplicate Role",
            "base_role": "viewer"
        })
        
        assert response.status_code == 400, f"Expected 400 for duplicate, got {response.status_code}"
        assert "already exists" in response.json().get("detail", "").lower()
    
    def test_cannot_create_system_role_name(self, authenticated_client):
        """Test that creating a role with system role name fails."""
        response = authenticated_client.post(f"{BASE_URL}/api/permissions/roles", json={
            "name": "admin",
            "display_name": "Fake Admin",
            "base_role": "viewer"
        })
        
        assert response.status_code == 400, f"Expected 400 for system role name, got {response.status_code}"
    
    def test_update_custom_role_permissions(self, authenticated_client):
        """Test updating permissions for custom role."""
        response = authenticated_client.patch(f"{BASE_URL}/api/permissions", json={
            "role": self.TEST_ROLE_NAME,
            "feature": "observations",
            "write": True
        })
        
        assert response.status_code == 200, f"Failed to update permission: {response.text}"
        
        data = response.json()
        assert data["permissions"]["write"] == True
    
    def test_delete_custom_role(self, authenticated_client):
        """Test deleting a custom role."""
        response = authenticated_client.delete(f"{BASE_URL}/api/permissions/roles/{self.TEST_ROLE_NAME}")
        
        assert response.status_code == 200, f"Failed to delete role: {response.text}"
        assert "deleted" in response.json().get("message", "").lower()
    
    def test_verify_role_removed(self, authenticated_client):
        """Test that deleted role no longer appears in list."""
        response = authenticated_client.get(f"{BASE_URL}/api/permissions")
        assert response.status_code == 200
        
        data = response.json()
        assert self.TEST_ROLE_NAME not in data["roles"], "Deleted role still appears in list"
    
    def test_cannot_delete_system_role(self, authenticated_client):
        """Test that system roles cannot be deleted."""
        response = authenticated_client.delete(f"{BASE_URL}/api/permissions/roles/admin")
        
        assert response.status_code == 400, f"Expected 400 for system role delete, got {response.status_code}"
        assert "system" in response.json().get("detail", "").lower()


class TestVoiceTranscription:
    """Test voice-to-text transcription functionality."""
    
    def test_transcribe_endpoint_exists(self, authenticated_client):
        """Test that transcribe endpoint exists and requires file."""
        # Without file - should return 422 (validation error)
        response = authenticated_client.post(f"{BASE_URL}/api/feedback/transcribe")
        assert response.status_code == 422, f"Expected 422 for missing file, got {response.status_code}"
    
    def test_transcribe_invalid_format(self, authenticated_client):
        """Test that invalid audio format is rejected."""
        # Create a fake file with invalid extension
        files = {
            'file': ('test.txt', b'not audio content', 'text/plain')
        }
        
        # Remove content-type header for multipart
        headers = dict(authenticated_client.headers)
        if 'Content-Type' in headers:
            del headers['Content-Type']
        
        response = requests.post(
            f"{BASE_URL}/api/feedback/transcribe",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid format, got {response.status_code}"
        assert "format" in response.json().get("detail", "").lower()
    
    def test_transcribe_file_too_large(self, authenticated_client):
        """Test that files over 25MB are rejected."""
        # Create a large fake audio file (26MB)
        large_content = b'0' * (26 * 1024 * 1024)
        files = {
            'file': ('large.webm', large_content, 'audio/webm')
        }
        
        headers = dict(authenticated_client.headers)
        if 'Content-Type' in headers:
            del headers['Content-Type']
        
        response = requests.post(
            f"{BASE_URL}/api/feedback/transcribe",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400 for large file, got {response.status_code}"
        assert "large" in response.json().get("detail", "").lower() or "size" in response.json().get("detail", "").lower()
    
    def test_transcribe_valid_audio_format_accepted(self, authenticated_client):
        """Test that valid audio formats are accepted (may fail transcription but format is valid)."""
        # Create a minimal webm file header (won't actually transcribe but tests format validation)
        # This is a minimal valid webm header
        webm_header = bytes([
            0x1A, 0x45, 0xDF, 0xA3,  # EBML header
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F,  # Size
            0x42, 0x86, 0x81, 0x01,  # EBMLVersion
            0x42, 0xF7, 0x81, 0x01,  # EBMLReadVersion
            0x42, 0xF2, 0x81, 0x04,  # EBMLMaxIDLength
            0x42, 0xF3, 0x81, 0x08,  # EBMLMaxSizeLength
            0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D,  # DocType: webm
        ])
        
        files = {
            'file': ('recording.webm', webm_header, 'audio/webm')
        }
        
        headers = dict(authenticated_client.headers)
        if 'Content-Type' in headers:
            del headers['Content-Type']
        
        response = requests.post(
            f"{BASE_URL}/api/feedback/transcribe",
            files=files,
            headers=headers
        )
        
        # Should either succeed or fail with transcription error (not format error)
        # 200 = success, 500 = transcription failed (but format was valid)
        assert response.status_code in [200, 500], f"Unexpected status: {response.status_code} - {response.text}"
        
        if response.status_code == 500:
            # Verify it's a transcription error, not format error
            detail = response.json().get("detail", "")
            assert "format" not in detail.lower() or "transcription" in detail.lower()


class TestFeedbackAPI:
    """Test feedback API endpoints."""
    
    def test_submit_feedback(self, authenticated_client):
        """Test submitting feedback."""
        response = authenticated_client.post(f"{BASE_URL}/api/feedback", json={
            "type": "improvement",
            "message": "TEST_ITERATION15: Test feedback for voice transcription feature",
            "severity": None
        })
        
        assert response.status_code == 200, f"Failed to submit feedback: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["type"] == "improvement"
        
        # Store ID for cleanup
        TestFeedbackAPI.test_feedback_id = data["id"]
    
    def test_get_my_feedback(self, authenticated_client):
        """Test getting user's feedback."""
        response = authenticated_client.get(f"{BASE_URL}/api/feedback/my")
        
        assert response.status_code == 200, f"Failed to get feedback: {response.text}"
        
        data = response.json()
        assert "items" in data
        assert "total" in data
    
    def test_cleanup_test_feedback(self, authenticated_client):
        """Clean up test feedback."""
        if hasattr(TestFeedbackAPI, 'test_feedback_id'):
            response = authenticated_client.delete(f"{BASE_URL}/api/feedback/{TestFeedbackAPI.test_feedback_id}")
            assert response.status_code == 200, f"Failed to delete test feedback: {response.text}"


class TestPermissionsEndpoints:
    """Test permissions-related endpoints."""
    
    def test_get_my_permissions(self, authenticated_client):
        """Test getting current user's permissions."""
        response = authenticated_client.get(f"{BASE_URL}/api/permissions/my")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "role" in data
        assert "permissions" in data
        assert data["role"] == "owner"  # We're logged in as owner
    
    def test_check_permission(self, authenticated_client):
        """Test checking specific permission."""
        response = authenticated_client.get(f"{BASE_URL}/api/permissions/check/observations?action=read")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "allowed" in data
        assert data["allowed"] == True  # Owner should have all permissions
    
    def test_reset_permissions(self, authenticated_client):
        """Test resetting permissions to defaults."""
        response = authenticated_client.post(f"{BASE_URL}/api/permissions/reset")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "permissions" in data
        assert "admin" in data["permissions"]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
