"""
Test Failure Mode Versioning - Tests for version management fix
Tests the fix for isoformat() error that was causing MongoDB queries to fall back to static library data.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestFailureModeVersioning:
    """Tests for failure mode versioning system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.base_url = BASE_URL
        # Login to get auth token
        login_response = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"email": "test@test.com", "password": "test"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_get_failure_mode_by_legacy_id_returns_correct_fields(self):
        """Test GET /api/failure-modes/{mode_id} returns correct id, legacy_id, and version fields"""
        # Use legacy_id 53 (Short Circuit) which has version history
        response = requests.get(f"{self.base_url}/api/failure-modes/53")
        
        assert response.status_code == 200, f"Failed to get failure mode: {response.text}"
        
        data = response.json()
        
        # Verify required fields exist
        assert "id" in data, "Response missing 'id' field"
        assert "legacy_id" in data, "Response missing 'legacy_id' field"
        assert "version" in data, "Response missing 'version' field"
        
        # Verify field values
        assert data["legacy_id"] == 53, f"Expected legacy_id=53, got {data['legacy_id']}"
        assert isinstance(data["id"], str), "id should be a string (MongoDB ObjectId)"
        assert isinstance(data["version"], int), "version should be an integer"
        assert data["version"] >= 1, f"version should be >= 1, got {data['version']}"
        
        # Verify RPN calculation
        expected_rpn = data["severity"] * data["occurrence"] * data["detectability"]
        assert data["rpn"] == expected_rpn, f"RPN mismatch: expected {expected_rpn}, got {data['rpn']}"
        
        # Verify datetime fields are properly serialized (not causing isoformat errors)
        if data.get("created_at"):
            assert isinstance(data["created_at"], str), "created_at should be serialized as string"
        if data.get("updated_at"):
            assert isinstance(data["updated_at"], str), "updated_at should be serialized as string"
        if data.get("validated_at"):
            assert isinstance(data["validated_at"], str), "validated_at should be serialized as string"
        
        print(f"✓ Failure mode 53 returned correctly: id={data['id']}, legacy_id={data['legacy_id']}, version={data['version']}, rpn={data['rpn']}")
    
    def test_get_failure_mode_by_mongodb_id(self):
        """Test GET /api/failure-modes/{mode_id} works with MongoDB ObjectId"""
        # First get the MongoDB id from legacy_id
        response = requests.get(f"{self.base_url}/api/failure-modes/53")
        assert response.status_code == 200
        mongodb_id = response.json()["id"]
        
        # Now fetch by MongoDB id
        response2 = requests.get(f"{self.base_url}/api/failure-modes/{mongodb_id}")
        assert response2.status_code == 200, f"Failed to get by MongoDB id: {response2.text}"
        
        data = response2.json()
        assert data["id"] == mongodb_id
        assert data["legacy_id"] == 53
        
        print(f"✓ Failure mode fetched by MongoDB id: {mongodb_id}")
    
    def test_version_history_endpoint_returns_versions(self):
        """Test GET /api/failure-modes/{mode_id}/versions returns version list"""
        response = requests.get(
            f"{self.base_url}/api/failure-modes/53/versions",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed to get versions: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "versions" in data, "Response missing 'versions' field"
        assert "total" in data, "Response missing 'total' field"
        assert isinstance(data["versions"], list), "versions should be a list"
        assert data["total"] == len(data["versions"]), "total should match versions count"
        
        # Verify version structure if versions exist
        if data["versions"]:
            version = data["versions"][0]
            assert "id" in version, "Version missing 'id' field"
            assert "version" in version, "Version missing 'version' field"
            assert "snapshot" in version, "Version missing 'snapshot' field"
            assert "created_at" in version, "Version missing 'created_at' field"
            
            # Verify snapshot contains FMEA data
            snapshot = version["snapshot"]
            assert "severity" in snapshot, "Snapshot missing 'severity'"
            assert "occurrence" in snapshot, "Snapshot missing 'occurrence'"
            assert "detectability" in snapshot, "Snapshot missing 'detectability'"
            assert "rpn" in snapshot, "Snapshot missing 'rpn'"
            
            print(f"✓ Version history returned {data['total']} versions")
            print(f"  Latest version in history: v{version['version']} with RPN={snapshot['rpn']}")
        else:
            print("✓ Version history endpoint works (no versions yet)")
    
    def test_update_failure_mode_increments_version(self):
        """Test PATCH /api/failure-modes/{mode_id} increments version and creates version history entry"""
        # Get current state
        get_response = requests.get(f"{self.base_url}/api/failure-modes/53")
        assert get_response.status_code == 200
        original = get_response.json()
        original_version = original["version"]
        original_severity = original["severity"]
        
        # Get current version history count
        versions_before = requests.get(
            f"{self.base_url}/api/failure-modes/53/versions",
            headers=self.headers
        ).json()
        versions_count_before = versions_before["total"]
        
        # Update with a small change (toggle severity between 8 and 9)
        new_severity = 8 if original_severity == 9 else 9
        
        update_response = requests.patch(
            f"{self.base_url}/api/failure-modes/53",
            headers=self.headers,
            json={"severity": new_severity}
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated = update_response.json()
        
        # Verify version incremented
        assert updated["version"] == original_version + 1, \
            f"Version should increment: expected {original_version + 1}, got {updated['version']}"
        
        # Verify severity changed
        assert updated["severity"] == new_severity, \
            f"Severity should be {new_severity}, got {updated['severity']}"
        
        # Verify RPN recalculated
        expected_rpn = new_severity * updated["occurrence"] * updated["detectability"]
        assert updated["rpn"] == expected_rpn, \
            f"RPN should be {expected_rpn}, got {updated['rpn']}"
        
        # Verify version history has new entry
        versions_after = requests.get(
            f"{self.base_url}/api/failure-modes/53/versions",
            headers=self.headers
        ).json()
        
        assert versions_after["total"] == versions_count_before + 1, \
            f"Version history should have {versions_count_before + 1} entries, got {versions_after['total']}"
        
        print(f"✓ Update incremented version: v{original_version} → v{updated['version']}")
        print(f"  Severity changed: {original_severity} → {new_severity}")
        print(f"  RPN updated: {original['rpn']} → {updated['rpn']}")
        print(f"  Version history entries: {versions_count_before} → {versions_after['total']}")
    
    def test_rollback_to_previous_version(self):
        """Test POST /api/failure-modes/{mode_id}/rollback works to revert to a previous version"""
        # Get current state
        get_response = requests.get(f"{self.base_url}/api/failure-modes/53")
        assert get_response.status_code == 200
        current = get_response.json()
        current_version = current["version"]
        
        # Get version history
        versions_response = requests.get(
            f"{self.base_url}/api/failure-modes/53/versions",
            headers=self.headers
        )
        assert versions_response.status_code == 200
        versions = versions_response.json()["versions"]
        
        if len(versions) < 1:
            pytest.skip("No version history available for rollback test")
        
        # Get the first version in history (most recent previous version)
        target_version = versions[0]
        target_version_id = target_version["id"]
        target_snapshot = target_version["snapshot"]
        
        # Perform rollback
        rollback_response = requests.post(
            f"{self.base_url}/api/failure-modes/53/rollback",
            headers=self.headers,
            json={"version_id": target_version_id}
        )
        
        assert rollback_response.status_code == 200, f"Rollback failed: {rollback_response.text}"
        
        rolled_back = rollback_response.json()
        
        # Verify version incremented (rollback creates new version)
        assert rolled_back["version"] == current_version + 1, \
            f"Version should increment after rollback: expected {current_version + 1}, got {rolled_back['version']}"
        
        # Verify rolled_back_from_version is set
        assert "rolled_back_from_version" in rolled_back, "Response should include rolled_back_from_version"
        
        # Verify FMEA values match the target snapshot
        assert rolled_back["severity"] == target_snapshot["severity"], \
            f"Severity should match snapshot: expected {target_snapshot['severity']}, got {rolled_back['severity']}"
        assert rolled_back["occurrence"] == target_snapshot["occurrence"], \
            f"Occurrence should match snapshot: expected {target_snapshot['occurrence']}, got {rolled_back['occurrence']}"
        assert rolled_back["detectability"] == target_snapshot["detectability"], \
            f"Detectability should match snapshot: expected {target_snapshot['detectability']}, got {rolled_back['detectability']}"
        
        print(f"✓ Rollback successful: v{current_version} → v{rolled_back['version']}")
        print(f"  Rolled back from version: {rolled_back.get('rolled_back_from_version')}")
        print(f"  FMEA values restored: S={rolled_back['severity']}, O={rolled_back['occurrence']}, D={rolled_back['detectability']}")
    
    def test_datetime_serialization_no_isoformat_error(self):
        """Test that datetime fields are properly serialized without isoformat() errors"""
        # This tests the fix for the bug where date fields stored as strings caused isoformat() errors
        
        # Get failure mode
        response = requests.get(f"{self.base_url}/api/failure-modes/53")
        assert response.status_code == 200, f"Request failed: {response.text}"
        
        data = response.json()
        
        # Check all datetime fields are strings (properly serialized)
        datetime_fields = ["created_at", "updated_at", "validated_at"]
        
        for field in datetime_fields:
            if data.get(field) is not None:
                assert isinstance(data[field], str), \
                    f"{field} should be a string, got {type(data[field])}"
                # Verify it looks like a datetime string
                assert len(data[field]) >= 10, \
                    f"{field} should be a valid datetime string, got '{data[field]}'"
        
        print(f"✓ All datetime fields properly serialized:")
        print(f"  created_at: {data.get('created_at', 'N/A')}")
        print(f"  updated_at: {data.get('updated_at', 'N/A')}")
        print(f"  validated_at: {data.get('validated_at', 'N/A')}")
    
    def test_failure_modes_list_returns_from_mongodb(self):
        """Test that failure modes list returns from MongoDB (not static fallback)"""
        response = requests.get(f"{self.base_url}/api/failure-modes")
        assert response.status_code == 200, f"Request failed: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "failure_modes" in data, "Response missing 'failure_modes'"
        assert "total" in data, "Response missing 'total'"
        
        # Check if source is NOT static (meaning MongoDB is working)
        source = data.get("source")
        if source == "static":
            pytest.fail("Failure modes returned from static library - MongoDB may not be working")
        
        # Verify failure modes have version field (only MongoDB data has this)
        if data["failure_modes"]:
            fm = data["failure_modes"][0]
            assert "version" in fm, "Failure mode missing 'version' field - may be from static library"
            assert "id" in fm, "Failure mode missing 'id' field"
            
            # Verify id is a MongoDB ObjectId string (not an integer from static library)
            assert isinstance(fm["id"], str), "id should be a string (MongoDB ObjectId)"
            assert len(fm["id"]) == 24, f"id should be 24-char MongoDB ObjectId, got '{fm['id']}'"
        
        print(f"✓ Failure modes returned from MongoDB: {data['total']} total")
        if data.get("source"):
            print(f"  Source: {data['source']}")


class TestFailureModeVersionHistoryEdgeCases:
    """Edge case tests for version history"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.base_url = BASE_URL
        login_response = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"email": "test@test.com", "password": "test"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_version_history_for_nonexistent_mode(self):
        """Test version history returns empty for non-existent failure mode"""
        response = requests.get(
            f"{self.base_url}/api/failure-modes/99999/versions",
            headers=self.headers
        )
        
        # Should return empty list or 404
        if response.status_code == 200:
            data = response.json()
            assert data["versions"] == [], "Should return empty versions list"
            assert data["total"] == 0, "Total should be 0"
        else:
            assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("✓ Version history for non-existent mode handled correctly")
    
    def test_rollback_with_invalid_version_id(self):
        """Test rollback fails gracefully with invalid version ID"""
        response = requests.post(
            f"{self.base_url}/api/failure-modes/53/rollback",
            headers=self.headers,
            json={"version_id": "invalid_id_12345"}
        )
        
        # Should return 404 or 400
        assert response.status_code in [400, 404], \
            f"Expected 400 or 404 for invalid version_id, got {response.status_code}"
        
        print("✓ Rollback with invalid version ID handled correctly")
    
    def test_version_history_requires_auth(self):
        """Test version history endpoint requires authentication"""
        response = requests.get(
            f"{self.base_url}/api/failure-modes/53/versions"
            # No auth header
        )
        
        assert response.status_code in [401, 403], \
            f"Expected 401 or 403 for unauthenticated request, got {response.status_code}"
        
        print("✓ Version history requires authentication")
    
    def test_rollback_requires_auth(self):
        """Test rollback endpoint requires authentication"""
        response = requests.post(
            f"{self.base_url}/api/failure-modes/53/rollback",
            json={"version_id": "some_id"}
            # No auth header
        )
        
        assert response.status_code in [401, 403], \
            f"Expected 401 or 403 for unauthenticated request, got {response.status_code}"
        
        print("✓ Rollback requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
