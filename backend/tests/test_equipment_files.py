"""
Test Equipment Files API endpoints
Tests: GET /api/equipment/{equipment_id}/files, GET /api/equipment-files/{file_id}/download
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "jedijk@gmail.com"
TEST_PASSWORD = "Jaap8019@"

# Known equipment with files
EQUIPMENT_ID_WITH_FILES = "8acba29d-7a74-4403-9698-62248b5afab8"  # Line-90
FILE_ID = "415c9107-2499-46bf-9e85-238a632def1f"  # Tyromer PFD.pdf


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestEquipmentFilesAPI:
    """Test equipment files listing and download endpoints"""
    
    def test_get_equipment_files_requires_auth(self):
        """Test that GET /api/equipment/{id}/files requires authentication"""
        response = requests.get(f"{BASE_URL}/api/equipment/{EQUIPMENT_ID_WITH_FILES}/files")
        assert response.status_code == 401, "Should require authentication"
    
    def test_get_equipment_files_success(self, auth_headers):
        """Test GET /api/equipment/{id}/files returns files list"""
        response = requests.get(
            f"{BASE_URL}/api/equipment/{EQUIPMENT_ID_WITH_FILES}/files",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "files" in data, "Response should contain 'files' key"
        assert isinstance(data["files"], list), "Files should be a list"
        
        # Verify at least one file exists (Tyromer PFD.pdf)
        assert len(data["files"]) >= 1, "Should have at least one file"
        
        # Verify file structure
        file = data["files"][0]
        assert "id" in file, "File should have 'id'"
        assert "filename" in file, "File should have 'filename'"
        assert "content_type" in file, "File should have 'content_type'"
        assert "size" in file, "File should have 'size'"
    
    def test_get_equipment_files_not_found(self, auth_headers):
        """Test GET /api/equipment/{id}/files returns 404 for non-existent equipment"""
        response = requests.get(
            f"{BASE_URL}/api/equipment/non-existent-id/files",
            headers=auth_headers
        )
        assert response.status_code == 404, "Should return 404 for non-existent equipment"
    
    def test_download_file_requires_auth(self):
        """Test that GET /api/equipment-files/{id}/download requires authentication"""
        response = requests.get(f"{BASE_URL}/api/equipment-files/{FILE_ID}/download")
        assert response.status_code == 401, "Should require authentication"
    
    def test_download_file_success(self, auth_headers):
        """Test GET /api/equipment-files/{id}/download returns file content"""
        response = requests.get(
            f"{BASE_URL}/api/equipment-files/{FILE_ID}/download",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify content type is PDF
        content_type = response.headers.get("Content-Type", "")
        assert "pdf" in content_type.lower() or "octet-stream" in content_type.lower(), \
            f"Expected PDF content type, got: {content_type}"
        
        # Verify content disposition header
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp.lower(), "Should have attachment disposition"
        assert "Tyromer" in content_disp or "tyromer" in content_disp.lower(), \
            f"Filename should contain 'Tyromer', got: {content_disp}"
        
        # Verify content is not empty
        assert len(response.content) > 0, "File content should not be empty"
    
    def test_download_file_not_found(self, auth_headers):
        """Test GET /api/equipment-files/{id}/download returns 404 for non-existent file"""
        response = requests.get(
            f"{BASE_URL}/api/equipment-files/non-existent-file-id/download",
            headers=auth_headers
        )
        assert response.status_code == 404, "Should return 404 for non-existent file"
    
    def test_view_file_public_endpoint(self):
        """Test GET /api/equipment-files/{id}/view is public (no auth required)"""
        response = requests.get(f"{BASE_URL}/api/equipment-files/{FILE_ID}/view")
        assert response.status_code == 200, f"View endpoint should be public: {response.text}"
        
        # Verify content type
        content_type = response.headers.get("Content-Type", "")
        assert "pdf" in content_type.lower() or "octet-stream" in content_type.lower(), \
            f"Expected PDF content type, got: {content_type}"
        
        # Verify inline disposition (for viewing, not downloading)
        content_disp = response.headers.get("Content-Disposition", "")
        assert "inline" in content_disp.lower(), "Should have inline disposition for viewing"


class TestEquipmentFilesDataIntegrity:
    """Test data integrity for equipment files"""
    
    def test_file_metadata_matches_content(self, auth_headers):
        """Test that file metadata matches actual file content"""
        # Get file metadata
        response = requests.get(
            f"{BASE_URL}/api/equipment/{EQUIPMENT_ID_WITH_FILES}/files",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        files = response.json().get("files", [])
        assert len(files) > 0, "Should have files"
        
        file_meta = files[0]
        file_id = file_meta["id"]
        expected_size = file_meta["size"]
        
        # Download file and verify size
        download_response = requests.get(
            f"{BASE_URL}/api/equipment-files/{file_id}/download",
            headers=auth_headers
        )
        assert download_response.status_code == 200
        
        actual_size = len(download_response.content)
        # Allow some tolerance for encoding differences
        assert abs(actual_size - expected_size) < 1000, \
            f"File size mismatch: expected ~{expected_size}, got {actual_size}"
