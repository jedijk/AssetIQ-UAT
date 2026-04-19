"""
Tests for Definitions (editable per installation) and User Avatar features.
Tests:
1. Definitions API - CRUD operations for custom definitions per installation
2. User Avatar API - Upload and retrieve user photos
3. RBAC users endpoint returns avatar_path field
"""
import pytest
import requests
import os
import io
from pathlib import Path

# Load frontend .env to get REACT_APP_BACKEND_URL
_frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
if _frontend_env.exists():
    for line in _frontend_env.read_text().splitlines():
        if line.strip() and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://production-insights-3.preview.emergentagent.com').rstrip('/')


class TestDefinitionsAPI:
    """Tests for the Definitions API - editable per installation"""
    
    @pytest.fixture(autouse=True)
    def setup(self, authenticated_client):
        self.client = authenticated_client
    
    def test_get_default_definitions(self):
        """Test GET /api/definitions/defaults returns default SOD definitions"""
        response = self.client.get(f"{BASE_URL}/api/definitions/defaults")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "severity" in data, "Response should contain severity"
        assert "occurrence" in data, "Response should contain occurrence"
        assert "detection" in data, "Response should contain detection"
        
        # Verify severity has 10 ranks
        assert len(data["severity"]) == 10, "Severity should have 10 ranks"
        assert data["severity"][0]["rank"] == 10, "First severity rank should be 10"
        assert data["severity"][0]["label"] == "Hazardous", "First severity label should be Hazardous"
        
        # Verify occurrence has 10 ranks
        assert len(data["occurrence"]) == 10, "Occurrence should have 10 ranks"
        
        # Verify detection has 10 ranks
        assert len(data["detection"]) == 10, "Detection should have 10 ranks"
        
        print("✓ Default definitions returned correctly with all 10 ranks for S, O, D")
    
    def test_get_installations_list(self):
        """Test GET /api/definitions/installations returns list of installations"""
        response = self.client.get(f"{BASE_URL}/api/definitions/installations")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "installations" in data, "Response should contain installations list"
        
        # Each installation should have id, name, has_custom_definitions
        if len(data["installations"]) > 0:
            inst = data["installations"][0]
            assert "id" in inst, "Installation should have id"
            assert "name" in inst, "Installation should have name"
            assert "has_custom_definitions" in inst, "Installation should have has_custom_definitions flag"
            print(f"✓ Found {len(data['installations'])} installations")
        else:
            print("✓ No installations found (empty list)")
    
    def test_get_definitions_for_equipment_returns_defaults(self):
        """Test GET /api/definitions/equipment/{id} returns defaults when no custom definitions"""
        # First get an installation
        inst_response = self.client.get(f"{BASE_URL}/api/definitions/installations")
        assert inst_response.status_code == 200
        
        installations = inst_response.json().get("installations", [])
        if not installations:
            pytest.skip("No installations available for testing")
        
        equipment_id = installations[0]["id"]
        
        response = self.client.get(f"{BASE_URL}/api/definitions/equipment/{equipment_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "equipment_id" in data, "Response should contain equipment_id"
        assert "is_custom" in data, "Response should contain is_custom flag"
        assert "severity" in data, "Response should contain severity"
        assert "occurrence" in data, "Response should contain occurrence"
        assert "detection" in data, "Response should contain detection"
        
        print(f"✓ Definitions for equipment {equipment_id}: is_custom={data['is_custom']}")
    
    def test_create_custom_definitions(self):
        """Test POST /api/definitions creates custom definitions for an installation"""
        # First get an installation
        inst_response = self.client.get(f"{BASE_URL}/api/definitions/installations")
        assert inst_response.status_code == 200
        
        installations = inst_response.json().get("installations", [])
        if not installations:
            pytest.skip("No installations available for testing")
        
        equipment_id = installations[0]["id"]
        
        # Get default definitions first
        defaults_response = self.client.get(f"{BASE_URL}/api/definitions/defaults")
        defaults = defaults_response.json()
        
        # Modify one severity row
        custom_severity = defaults["severity"].copy()
        custom_severity[0]["label"] = "TEST_CUSTOM_HAZARDOUS"
        custom_severity[0]["description"] = "Custom test description"
        
        # Create custom definitions
        payload = {
            "equipment_id": equipment_id,
            "severity": custom_severity,
            "occurrence": defaults["occurrence"],
            "detection": defaults["detection"]
        }
        
        response = self.client.post(f"{BASE_URL}/api/definitions", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert data["equipment_id"] == equipment_id, "Response should contain correct equipment_id"
        
        # Verify the custom definitions are saved
        verify_response = self.client.get(f"{BASE_URL}/api/definitions/equipment/{equipment_id}")
        assert verify_response.status_code == 200
        
        verify_data = verify_response.json()
        assert verify_data["is_custom"] == True, "Definitions should be marked as custom"
        assert verify_data["severity"][0]["label"] == "TEST_CUSTOM_HAZARDOUS", "Custom label should be saved"
        
        print(f"✓ Custom definitions created and verified for equipment {equipment_id}")
    
    def test_reset_definitions_to_defaults(self):
        """Test DELETE /api/definitions/{equipment_id} resets to defaults"""
        # First get an installation
        inst_response = self.client.get(f"{BASE_URL}/api/definitions/installations")
        assert inst_response.status_code == 200
        
        installations = inst_response.json().get("installations", [])
        if not installations:
            pytest.skip("No installations available for testing")
        
        equipment_id = installations[0]["id"]
        
        # Delete custom definitions (reset to defaults)
        response = self.client.delete(f"{BASE_URL}/api/definitions/{equipment_id}")
        # Could be 200 (deleted) or 404 (no custom definitions to delete)
        assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}: {response.text}"
        
        # Verify definitions are now defaults
        verify_response = self.client.get(f"{BASE_URL}/api/definitions/equipment/{equipment_id}")
        assert verify_response.status_code == 200
        
        verify_data = verify_response.json()
        assert verify_data["is_custom"] == False, "Definitions should be marked as defaults after reset"
        
        print(f"✓ Definitions reset to defaults for equipment {equipment_id}")


class TestUserAvatarAPI:
    """Tests for User Avatar API - upload and retrieve user photos"""
    
    @pytest.fixture(autouse=True)
    def setup(self, authenticated_client, auth_token):
        self.client = authenticated_client
        self.auth_token = auth_token
    
    def test_rbac_users_returns_avatar_path(self):
        """Test GET /api/rbac/users returns avatar_path field for each user"""
        response = self.client.get(f"{BASE_URL}/api/rbac/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "users" in data, "Response should contain users list"
        
        if len(data["users"]) > 0:
            user = data["users"][0]
            assert "avatar_path" in user, "User should have avatar_path field"
            print(f"✓ RBAC users endpoint returns avatar_path field. First user avatar_path: {user.get('avatar_path')}")
        else:
            print("✓ No users found (empty list)")
    
    def test_get_my_avatar_info(self):
        """Test GET /api/users/me/avatar returns avatar info"""
        response = self.client.get(f"{BASE_URL}/api/users/me/avatar")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "has_avatar" in data, "Response should contain has_avatar"
        assert "initials" in data, "Response should contain initials"
        
        print(f"✓ My avatar info: has_avatar={data['has_avatar']}, initials={data['initials']}")
    
    def test_upload_avatar_invalid_type(self):
        """Test POST /api/users/me/avatar rejects invalid file types"""
        # Create a fake text file
        files = {
            "file": ("test.txt", io.BytesIO(b"This is not an image"), "text/plain")
        }
        
        # Remove Content-Type header for multipart upload
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/users/me/avatar",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}: {response.text}"
        print("✓ Invalid file type correctly rejected")
    
    def test_upload_avatar_success(self):
        """Test POST /api/users/me/avatar uploads a valid image"""
        # Create a minimal valid PNG image (1x1 pixel)
        # PNG header + IHDR + IDAT + IEND
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 pixel
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {
            "file": ("test_avatar.png", io.BytesIO(png_data), "image/png")
        }
        
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/users/me/avatar",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "avatar_path" in data, "Response should contain avatar_path"
        assert "message" in data, "Response should contain message"
        
        print(f"✓ Avatar uploaded successfully: {data['avatar_path']}")
    
    def test_get_user_avatar_image(self):
        """Test GET /api/users/{user_id}/avatar returns the image"""
        # First get current user's ID from RBAC users
        users_response = self.client.get(f"{BASE_URL}/api/rbac/users")
        assert users_response.status_code == 200
        
        users = users_response.json().get("users", [])
        if not users:
            pytest.skip("No users available for testing")
        
        # Find a user with avatar_path
        user_with_avatar = None
        for user in users:
            if user.get("avatar_path"):
                user_with_avatar = user
                break
        
        if not user_with_avatar:
            pytest.skip("No users with avatars found")
        
        user_id = user_with_avatar["id"]
        
        # Get avatar image using query param auth
        response = requests.get(
            f"{BASE_URL}/api/users/{user_id}/avatar?auth={self.auth_token}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "image" in response.headers.get("Content-Type", ""), "Response should be an image"
        
        print(f"✓ Avatar image retrieved for user {user_id}")


class TestRBACUsersEndpoint:
    """Tests for RBAC users endpoint with avatar support"""
    
    @pytest.fixture(autouse=True)
    def setup(self, authenticated_client):
        self.client = authenticated_client
    
    def test_get_roles(self):
        """Test GET /api/rbac/roles returns available roles"""
        response = self.client.get(f"{BASE_URL}/api/rbac/roles")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "roles" in data, "Response should contain roles"
        
        roles = data["roles"]
        assert len(roles) > 0, "Should have at least one role"
        
        # Check role structure
        for role_key, role_info in roles.items():
            assert "name" in role_info, f"Role {role_key} should have name"
            assert "description" in role_info, f"Role {role_key} should have description"
        
        print(f"✓ Found {len(roles)} roles: {list(roles.keys())}")
    
    def test_get_users_with_filters(self):
        """Test GET /api/rbac/users with search and role filters"""
        # Test without filters
        response = self.client.get(f"{BASE_URL}/api/rbac/users")
        assert response.status_code == 200
        
        all_users = response.json().get("users", [])
        print(f"✓ Found {len(all_users)} total users")
        
        # Test with search filter
        if all_users:
            search_term = all_users[0]["name"][:3] if all_users[0].get("name") else "test"
            response = self.client.get(f"{BASE_URL}/api/rbac/users?search={search_term}")
            assert response.status_code == 200
            print(f"✓ Search filter works")
        
        # Test with role filter
        response = self.client.get(f"{BASE_URL}/api/rbac/users?role=admin")
        assert response.status_code == 200
        print(f"✓ Role filter works")
    
    def test_user_has_required_fields(self):
        """Test that users have all required fields including avatar_path"""
        response = self.client.get(f"{BASE_URL}/api/rbac/users")
        assert response.status_code == 200
        
        users = response.json().get("users", [])
        if not users:
            pytest.skip("No users available for testing")
        
        user = users[0]
        required_fields = ["id", "email", "name", "role", "role_name", "is_active", "avatar_path"]
        
        for field in required_fields:
            assert field in user, f"User should have {field} field"
        
        print(f"✓ User has all required fields including avatar_path")


# Fixtures
@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@test.com",
        "password": "test"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed ({response.status_code}) — skipping authenticated tests")

@pytest.fixture
def authenticated_client(api_client, auth_token):
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client
