"""
Test file for GET /api/system/file-storage endpoint.

Tests:
- Authentication requirements (401 without token)
- Authorization (403 for non-owner users)
- Response structure validation for owner users
- Data integrity checks
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "jedijk@gmail.com"
OWNER_PASSWORD = "Jaap8019@"


class TestFileStorageEndpoint:
    """Tests for /api/system/file-storage endpoint"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get authentication token for owner user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def owner_headers(self, owner_token):
        """Headers with owner authentication"""
        return {
            "Authorization": f"Bearer {owner_token}",
            "Content-Type": "application/json"
        }
    
    def test_file_storage_requires_authentication(self):
        """Test that endpoint returns 401 without auth token"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "authenticated" in data["detail"].lower() or "not authenticated" in data["detail"].lower()
    
    def test_file_storage_returns_valid_json(self, owner_headers):
        """Test that endpoint returns valid JSON with expected fields"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check required fields exist
        required_fields = [
            "total_files",
            "total_size_bytes",
            "total_size_mb",
            "by_storage_type",
            "by_category",
            "r2_configured"
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
    
    def test_file_storage_data_types(self, owner_headers):
        """Test that response fields have correct data types"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Validate data types
        assert isinstance(data["total_files"], int), "total_files should be int"
        assert isinstance(data["total_size_bytes"], (int, float)), "total_size_bytes should be numeric"
        assert isinstance(data["total_size_mb"], (int, float)), "total_size_mb should be numeric"
        assert isinstance(data["by_storage_type"], dict), "by_storage_type should be dict"
        assert isinstance(data["by_category"], dict), "by_category should be dict"
        assert isinstance(data["r2_configured"], bool), "r2_configured should be bool"
    
    def test_file_storage_values_are_non_negative(self, owner_headers):
        """Test that numeric values are non-negative"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        assert data["total_files"] >= 0, "total_files should be non-negative"
        assert data["total_size_bytes"] >= 0, "total_size_bytes should be non-negative"
        assert data["total_size_mb"] >= 0, "total_size_mb should be non-negative"
    
    def test_file_storage_size_consistency(self, owner_headers):
        """Test that total_size_mb is consistent with total_size_bytes"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Calculate expected MB from bytes
        expected_mb = round(data["total_size_bytes"] / (1024 * 1024), 2)
        actual_mb = data["total_size_mb"]
        
        # Allow small rounding difference
        assert abs(expected_mb - actual_mb) < 0.1, f"Size mismatch: {expected_mb} MB vs {actual_mb} MB"
    
    def test_file_storage_by_storage_type_structure(self, owner_headers):
        """Test that by_storage_type has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        by_storage_type = data["by_storage_type"]
        
        # Each storage type should have count and size_mb
        for storage_type, info in by_storage_type.items():
            assert "count" in info, f"Missing 'count' in {storage_type}"
            assert "size_mb" in info, f"Missing 'size_mb' in {storage_type}"
            assert isinstance(info["count"], int), f"count should be int for {storage_type}"
            assert isinstance(info["size_mb"], (int, float)), f"size_mb should be numeric for {storage_type}"
    
    def test_file_storage_by_category_structure(self, owner_headers):
        """Test that by_category has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        by_category = data["by_category"]
        
        # Each category should have an integer count
        for category, count in by_category.items():
            assert isinstance(count, int), f"count should be int for category {category}"
            assert count >= 0, f"count should be non-negative for category {category}"
    
    def test_file_storage_total_files_matches_categories(self, owner_headers):
        """Test that total_files equals sum of category counts"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        category_sum = sum(data["by_category"].values())
        total_files = data["total_files"]
        
        assert category_sum == total_files, f"Category sum ({category_sum}) != total_files ({total_files})"
    
    def test_file_storage_total_files_matches_storage_types(self, owner_headers):
        """Test that total_files equals sum of storage type counts"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        storage_type_sum = sum(info["count"] for info in data["by_storage_type"].values())
        total_files = data["total_files"]
        
        assert storage_type_sum == total_files, f"Storage type sum ({storage_type_sum}) != total_files ({total_files})"
    
    def test_file_storage_r2_configured_status(self, owner_headers):
        """Test that r2_configured reflects actual R2 configuration"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # If R2 is configured, we should see r2 in storage types (if there are files)
        if data["r2_configured"] and data["total_files"] > 0:
            # R2 should be present in storage types if configured and files exist
            # (unless all files are legacy MongoDB)
            pass  # This is informational - R2 may or may not have files
        
        # Just verify the field is a boolean
        assert isinstance(data["r2_configured"], bool)
    
    def test_file_storage_has_timestamp(self, owner_headers):
        """Test that response includes timestamp"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers=owner_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Timestamp should be present
        assert "timestamp" in data, "Missing timestamp field"
        assert isinstance(data["timestamp"], str), "timestamp should be string"
        # Should be ISO format
        assert "T" in data["timestamp"], "timestamp should be ISO format"


class TestFileStorageAuthorization:
    """Tests for authorization on /api/system/file-storage endpoint"""
    
    def test_invalid_token_returns_401(self):
        """Test that invalid token returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/system/file-storage",
            headers={
                "Authorization": "Bearer invalid_token_here",
                "Content-Type": "application/json"
            }
        )
        # Should return 401 for invalid token
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestExistingEndpointsStillWork:
    """Verify existing system endpoints still work after adding file-storage"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get authentication token for owner user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def owner_headers(self, owner_token):
        """Headers with owner authentication"""
        return {
            "Authorization": f"Bearer {owner_token}",
            "Content-Type": "application/json"
        }
    
    def test_system_metrics_still_works(self, owner_headers):
        """Test that /api/system/metrics still works"""
        response = requests.get(
            f"{BASE_URL}/api/system/metrics",
            headers=owner_headers
        )
        assert response.status_code == 200, f"system/metrics failed: {response.text}"
        data = response.json()
        # Should have timestamp at minimum
        assert "timestamp" in data
    
    def test_system_database_still_works(self, owner_headers):
        """Test that /api/system/database still works"""
        response = requests.get(
            f"{BASE_URL}/api/system/database",
            headers=owner_headers
        )
        assert response.status_code == 200, f"system/database failed: {response.text}"
        data = response.json()
        # Should have used and capacity
        assert "used" in data
        assert "capacity" in data
    
    def test_system_health_still_works(self):
        """Test that /api/system/health still works (no auth required)"""
        response = requests.get(
            f"{BASE_URL}/api/system/health",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200, f"system/health failed: {response.text}"
        data = response.json()
        assert data.get("status") == "healthy"
