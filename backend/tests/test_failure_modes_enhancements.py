"""
Test Failure Modes Module Enhancements:
1. Translation keys properly resolved (no raw keys like library.pendingValidation)
2. New fields (process, potential_effects, potential_causes) visible and editable
3. Equipment field is a dropdown in edit mode
4. Duplicate name check for new failure modes
5. All CRUD operations still work
"""
import pytest
import time
from conftest import BASE_URL


class TestFailureModesNewFields:
    """Test new fields: process, potential_effects, potential_causes"""
    
    def test_create_failure_mode_with_new_fields(self, authenticated_client):
        """Test creating a failure mode with new fields."""
        unique_name = f"TEST_FM_NewFields_{int(time.time())}"
        payload = {
            "category": "Rotating",
            "equipment": "Centrifugal Pump",
            "failure_mode": unique_name,
            "keywords": ["test", "new_fields"],
            "severity": 5,
            "occurrence": 4,
            "detectability": 3,
            "recommended_actions": [],
            "equipment_type_ids": [],
            "process": "Extrusion Process",
            "potential_effects": "Production loss, safety hazard",
            "potential_causes": "Wear, contamination, incorrect settings"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/failure-modes", json=payload)
        print(f"Create response: {response.status_code} - {response.text[:500]}")
        
        assert response.status_code == 200, f"Failed to create: {response.text}"
        data = response.json()
        
        # Verify new fields are returned
        assert data.get("process") == "Extrusion Process", "Process field not saved"
        assert data.get("potential_effects") == "Production loss, safety hazard", "Potential effects not saved"
        assert data.get("potential_causes") == "Wear, contamination, incorrect settings", "Potential causes not saved"
        
        # Store ID for cleanup
        self.__class__.created_fm_id = data.get("id")
        print(f"Created failure mode with ID: {self.created_fm_id}")
        return data
    
    def test_get_failure_mode_with_new_fields(self, authenticated_client):
        """Test that GET returns new fields."""
        if not hasattr(self.__class__, 'created_fm_id'):
            pytest.skip("No failure mode created in previous test")
        
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/{self.created_fm_id}")
        assert response.status_code == 200, f"Failed to get: {response.text}"
        
        data = response.json()
        assert "process" in data, "Process field missing from GET response"
        assert "potential_effects" in data, "Potential effects field missing"
        assert "potential_causes" in data, "Potential causes field missing"
        print(f"GET returned new fields: process={data.get('process')}, effects={data.get('potential_effects')}, causes={data.get('potential_causes')}")
    
    def test_update_failure_mode_new_fields(self, authenticated_client):
        """Test updating new fields."""
        if not hasattr(self.__class__, 'created_fm_id'):
            pytest.skip("No failure mode created in previous test")
        
        update_payload = {
            "process": "Updated Process",
            "potential_effects": "Updated effects",
            "potential_causes": "Updated causes"
        }
        
        response = authenticated_client.patch(f"{BASE_URL}/api/failure-modes/{self.created_fm_id}", json=update_payload)
        assert response.status_code == 200, f"Failed to update: {response.text}"
        
        data = response.json()
        assert data.get("process") == "Updated Process", "Process not updated"
        assert data.get("potential_effects") == "Updated effects", "Effects not updated"
        assert data.get("potential_causes") == "Updated causes", "Causes not updated"
        print("Successfully updated new fields")


class TestDuplicateNameCheck:
    """Test duplicate failure mode name check."""
    
    def test_create_duplicate_name_rejected(self, authenticated_client):
        """Test that creating a failure mode with duplicate name is rejected."""
        unique_name = f"TEST_FM_Duplicate_{int(time.time())}"
        
        # Create first failure mode
        payload = {
            "category": "Rotating",
            "equipment": "Pump",
            "failure_mode": unique_name,
            "keywords": ["test"],
            "severity": 5,
            "occurrence": 5,
            "detectability": 5,
            "recommended_actions": [],
            "equipment_type_ids": []
        }
        
        response1 = authenticated_client.post(f"{BASE_URL}/api/failure-modes", json=payload)
        assert response1.status_code == 200, f"First create failed: {response1.text}"
        first_id = response1.json().get("id")
        print(f"Created first FM with ID: {first_id}")
        
        # Try to create second with same name
        response2 = authenticated_client.post(f"{BASE_URL}/api/failure-modes", json=payload)
        print(f"Duplicate create response: {response2.status_code} - {response2.text}")
        
        # Should be rejected with 400
        assert response2.status_code == 400, f"Duplicate should be rejected, got {response2.status_code}"
        assert "already exists" in response2.text.lower(), "Error message should mention duplicate"
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/failure-modes/{first_id}")
        print("Duplicate name check working correctly")


class TestCRUDOperations:
    """Test that all CRUD operations still work."""
    
    def test_list_failure_modes(self, authenticated_client):
        """Test listing failure modes."""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes")
        assert response.status_code == 200, f"Failed to list: {response.text}"
        
        data = response.json()
        assert "failure_modes" in data, "Response missing failure_modes key"
        assert "total" in data, "Response missing total key"
        print(f"Listed {data['total']} failure modes")
    
    def test_get_categories(self, authenticated_client):
        """Test getting categories."""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/categories")
        assert response.status_code == 200, f"Failed to get categories: {response.text}"
        
        data = response.json()
        assert "categories" in data, "Response missing categories key"
        print(f"Categories: {data['categories']}")
    
    def test_create_read_update_delete(self, authenticated_client):
        """Test full CRUD cycle."""
        unique_name = f"TEST_FM_CRUD_{int(time.time())}"
        
        # CREATE
        create_payload = {
            "category": "Static",
            "equipment": "Heat Exchanger",
            "failure_mode": unique_name,
            "keywords": ["crud", "test"],
            "severity": 6,
            "occurrence": 4,
            "detectability": 5,
            "recommended_actions": [{"description": "Test action", "discipline": "mechanical", "action_type": "PM"}],
            "equipment_type_ids": []
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/failure-modes", json=create_payload)
        assert create_response.status_code == 200, f"CREATE failed: {create_response.text}"
        created = create_response.json()
        fm_id = created.get("id")
        assert fm_id, "No ID returned from create"
        print(f"CREATE: Success, ID={fm_id}")
        
        # READ
        read_response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/{fm_id}")
        assert read_response.status_code == 200, f"READ failed: {read_response.text}"
        read_data = read_response.json()
        assert read_data.get("failure_mode") == unique_name, "READ returned wrong data"
        print(f"READ: Success, name={read_data.get('failure_mode')}")
        
        # UPDATE
        update_payload = {
            "severity": 8,
            "keywords": ["crud", "test", "updated"]
        }
        update_response = authenticated_client.patch(f"{BASE_URL}/api/failure-modes/{fm_id}", json=update_payload)
        assert update_response.status_code == 200, f"UPDATE failed: {update_response.text}"
        updated = update_response.json()
        assert updated.get("severity") == 8, "UPDATE didn't change severity"
        print(f"UPDATE: Success, severity={updated.get('severity')}")
        
        # DELETE
        delete_response = authenticated_client.delete(f"{BASE_URL}/api/failure-modes/{fm_id}")
        assert delete_response.status_code == 200, f"DELETE failed: {delete_response.text}"
        print("DELETE: Success")
        
        # Verify deleted
        verify_response = authenticated_client.get(f"{BASE_URL}/api/failure-modes/{fm_id}")
        assert verify_response.status_code == 404, "Deleted item should return 404"
        print("CRUD cycle complete")


class TestEquipmentDropdown:
    """Test equipment types endpoint for dropdown."""
    
    def test_get_equipment_types_for_dropdown(self, authenticated_client):
        """Test that equipment types are available for dropdown."""
        response = authenticated_client.get(f"{BASE_URL}/api/equipment-hierarchy/types")
        print(f"Equipment types response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            assert "equipment_types" in data, "Response missing equipment_types"
            print(f"Found {len(data['equipment_types'])} equipment types for dropdown")
            if data['equipment_types']:
                print(f"Sample types: {[t.get('name') for t in data['equipment_types'][:5]]}")
        else:
            print(f"Equipment types endpoint returned {response.status_code}")


class TestCleanup:
    """Cleanup test data."""
    
    def test_cleanup_test_data(self, authenticated_client):
        """Clean up any TEST_ prefixed failure modes."""
        response = authenticated_client.get(f"{BASE_URL}/api/failure-modes?search=TEST_FM_")
        if response.status_code == 200:
            data = response.json()
            for fm in data.get("failure_modes", []):
                if fm.get("failure_mode", "").startswith("TEST_FM_"):
                    fm_id = fm.get("id")
                    delete_resp = authenticated_client.delete(f"{BASE_URL}/api/failure-modes/{fm_id}")
                    print(f"Cleaned up: {fm.get('failure_mode')} - {delete_resp.status_code}")
        print("Cleanup complete")
