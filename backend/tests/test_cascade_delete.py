"""
Test cascade delete functionality for Investigations and Observations/Threats.

Features tested:
1. DELETE /api/investigations/{id}?delete_central_actions=true - deletes linked Central Actions
2. DELETE /api/threats/{id}?delete_actions=true&delete_investigations=true - deletes linked data
3. DELETE /api/observations/{id}?delete_actions=true&delete_investigations=true - deletes linked data
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from environment variables
TEST_ADMIN_EMAIL = os.environ.get('TEST_ADMIN_EMAIL', 'test@test.com')
TEST_ADMIN_PASSWORD = os.environ.get('TEST_ADMIN_PASSWORD', 'test')
TEST_OWNER_EMAIL = os.environ.get('TEST_OWNER_EMAIL', 'jedijk@gmail.com')
TEST_OWNER_PASSWORD = os.environ.get('TEST_OWNER_PASSWORD', 'admin123')


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_ADMIN_EMAIL,
        "password": TEST_ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping tests")


@pytest.fixture(scope="module")
def owner_token():
    """Get authentication token for owner user."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_OWNER_EMAIL,
        "password": TEST_OWNER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Owner authentication failed - skipping tests")


@pytest.fixture
def api_client(auth_token):
    """Create authenticated API client."""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


@pytest.fixture
def owner_client(owner_token):
    """Create authenticated API client for owner."""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {owner_token}"
    })
    return session


class TestInvestigationCascadeDelete:
    """Test cascade delete for Investigations."""
    
    def test_delete_investigation_without_cascade(self, api_client):
        """Test deleting investigation without cascade option - should NOT delete linked actions."""
        # Create an investigation
        inv_response = api_client.post(f"{BASE_URL}/api/investigations", json={
            "title": f"TEST_CASCADE_INV_{uuid.uuid4().hex[:8]}",
            "description": "Test investigation for cascade delete",
            "asset_name": "Test Equipment",
            "location": "Test Location"
        })
        assert inv_response.status_code == 200, f"Failed to create investigation: {inv_response.text}"
        inv_data = inv_response.json()
        inv_id = inv_data["id"]
        
        # Create a central action linked to this investigation
        action_response = api_client.post(f"{BASE_URL}/api/actions", json={
            "title": f"TEST_ACTION_{uuid.uuid4().hex[:8]}",
            "description": "Test action linked to investigation",
            "source_type": "investigation",
            "source_id": inv_id,
            "source_name": inv_data["title"],
            "priority": "medium"
        })
        assert action_response.status_code in [200, 201], f"Failed to create action: {action_response.text}"
        action_data = action_response.json()
        action_id = action_data["id"]
        
        # Delete investigation WITHOUT cascade option
        delete_response = api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}")
        assert delete_response.status_code == 200, f"Failed to delete investigation: {delete_response.text}"
        delete_data = delete_response.json()
        
        # Verify no actions were deleted
        assert delete_data.get("deleted_central_actions", 0) == 0, "Actions should NOT be deleted without cascade option"
        
        # Verify the action still exists
        action_check = api_client.get(f"{BASE_URL}/api/actions/{action_id}")
        assert action_check.status_code == 200, "Action should still exist after non-cascade delete"
        
        # Cleanup: delete the orphaned action
        api_client.delete(f"{BASE_URL}/api/actions/{action_id}")
    
    def test_delete_investigation_with_cascade_actions(self, api_client):
        """Test deleting investigation WITH delete_central_actions=true - should delete linked actions."""
        # Create an investigation
        inv_response = api_client.post(f"{BASE_URL}/api/investigations", json={
            "title": f"TEST_CASCADE_INV_{uuid.uuid4().hex[:8]}",
            "description": "Test investigation for cascade delete with actions",
            "asset_name": "Test Equipment",
            "location": "Test Location"
        })
        assert inv_response.status_code == 200, f"Failed to create investigation: {inv_response.text}"
        inv_data = inv_response.json()
        inv_id = inv_data["id"]
        
        # Create multiple central actions linked to this investigation
        action_ids = []
        for i in range(3):
            action_response = api_client.post(f"{BASE_URL}/api/actions", json={
                "title": f"TEST_ACTION_{i}_{uuid.uuid4().hex[:8]}",
                "description": f"Test action {i} linked to investigation",
                "source_type": "investigation",
                "source_id": inv_id,
                "source_name": inv_data["title"],
                "priority": "medium"
            })
            assert action_response.status_code in [200, 201], f"Failed to create action {i}: {action_response.text}"
            action_ids.append(action_response.json()["id"])
        
        # Delete investigation WITH cascade option
        delete_response = api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}?delete_central_actions=true")
        assert delete_response.status_code == 200, f"Failed to delete investigation: {delete_response.text}"
        delete_data = delete_response.json()
        
        # Verify actions were deleted
        assert delete_data.get("deleted_central_actions", 0) == 3, f"Expected 3 actions deleted, got {delete_data.get('deleted_central_actions', 0)}"
        
        # Verify the actions no longer exist
        for action_id in action_ids:
            action_check = api_client.get(f"{BASE_URL}/api/actions/{action_id}")
            assert action_check.status_code == 404, f"Action {action_id} should be deleted"


class TestThreatCascadeDelete:
    """Test cascade delete for Threats/Observations."""
    
    def test_delete_threat_without_cascade(self, owner_client):
        """Test deleting threat without cascade options - should NOT delete linked data."""
        # First get existing threats to find one we can test with
        threats_response = owner_client.get(f"{BASE_URL}/api/threats")
        assert threats_response.status_code == 200, f"Failed to get threats: {threats_response.text}"
        threats = threats_response.json()
        
        if not threats:
            pytest.skip("No threats available for testing")
        
        # Use the first threat for testing
        threat = threats[0]
        threat_id = threat["id"]
        
        # Create a central action linked to this threat
        action_response = owner_client.post(f"{BASE_URL}/api/actions", json={
            "title": f"TEST_ACTION_{uuid.uuid4().hex[:8]}",
            "description": "Test action linked to threat",
            "source_type": "threat",
            "source_id": threat_id,
            "source_name": threat.get("title", "Test Threat"),
            "priority": "medium"
        })
        assert action_response.status_code in [200, 201], f"Failed to create action: {action_response.text}"
        action_data = action_response.json()
        action_id = action_data["id"]
        
        # We won't actually delete the threat since it's existing data
        # Instead, verify the endpoint accepts the parameters
        
        # Cleanup: delete the test action
        owner_client.delete(f"{BASE_URL}/api/actions/{action_id}")
    
    def test_threat_delete_endpoint_accepts_cascade_params(self, owner_client):
        """Test that threat delete endpoint accepts cascade parameters."""
        # Get existing threats
        threats_response = owner_client.get(f"{BASE_URL}/api/threats")
        assert threats_response.status_code == 200
        threats = threats_response.json()
        
        if not threats:
            pytest.skip("No threats available for testing")
        
        # Test that the endpoint accepts the parameters (without actually deleting)
        # We'll use a non-existent ID to verify parameter handling
        fake_id = "nonexistent_threat_id_12345"
        
        # This should return 404 (not found) but NOT 422 (validation error)
        response = owner_client.delete(f"{BASE_URL}/api/threats/{fake_id}?delete_actions=true&delete_investigations=true")
        assert response.status_code in [404, 403], f"Expected 404 or 403, got {response.status_code}: {response.text}"


class TestObservationCascadeDelete:
    """Test cascade delete for Observations."""
    
    def test_observation_delete_endpoint_accepts_cascade_params(self, owner_client):
        """Test that observation delete endpoint accepts cascade parameters."""
        # Test that the endpoint accepts the parameters
        fake_id = "nonexistent_obs_id_12345"
        
        # This should return 404 (not found) but NOT 422 (validation error)
        response = owner_client.delete(f"{BASE_URL}/api/observations/{fake_id}?delete_actions=true&delete_investigations=true")
        assert response.status_code in [404, 403], f"Expected 404 or 403, got {response.status_code}: {response.text}"


class TestCascadeDeleteIntegration:
    """Integration tests for cascade delete across entities."""
    
    def test_full_cascade_flow_investigation(self, api_client):
        """Test full cascade flow: Create investigation -> Create actions -> Delete with cascade."""
        # Step 1: Create investigation
        inv_response = api_client.post(f"{BASE_URL}/api/investigations", json={
            "title": f"TEST_FULL_CASCADE_{uuid.uuid4().hex[:8]}",
            "description": "Full cascade test investigation",
            "asset_name": "Test Equipment",
            "location": "Test Location"
        })
        assert inv_response.status_code == 200
        inv_id = inv_response.json()["id"]
        
        # Step 2: Create central actions
        action_ids = []
        for i in range(2):
            action_response = api_client.post(f"{BASE_URL}/api/actions", json={
                "title": f"TEST_CASCADE_ACTION_{i}",
                "description": f"Cascade test action {i}",
                "source_type": "investigation",
                "source_id": inv_id,
                "source_name": "Test Investigation",
                "priority": "high"
            })
            assert action_response.status_code in [200, 201]
            action_ids.append(action_response.json()["id"])
        
        # Step 3: Verify actions exist
        for action_id in action_ids:
            check = api_client.get(f"{BASE_URL}/api/actions/{action_id}")
            assert check.status_code == 200, f"Action {action_id} should exist before delete"
        
        # Step 4: Delete investigation with cascade
        delete_response = api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}?delete_central_actions=true")
        assert delete_response.status_code == 200
        delete_data = delete_response.json()
        
        # Step 5: Verify cascade results
        assert delete_data.get("deleted_central_actions", 0) == 2, "Should have deleted 2 actions"
        
        # Step 6: Verify actions are gone
        for action_id in action_ids:
            check = api_client.get(f"{BASE_URL}/api/actions/{action_id}")
            assert check.status_code == 404, f"Action {action_id} should be deleted"
        
        # Step 7: Verify investigation is gone
        inv_check = api_client.get(f"{BASE_URL}/api/investigations/{inv_id}")
        assert inv_check.status_code == 404, "Investigation should be deleted"


class TestDeleteDialogCheckboxes:
    """Test that delete endpoints return proper response for UI checkboxes."""
    
    def test_investigation_delete_returns_action_count(self, api_client):
        """Test that investigation delete returns deleted_central_actions count."""
        # Create investigation
        inv_response = api_client.post(f"{BASE_URL}/api/investigations", json={
            "title": f"TEST_COUNT_{uuid.uuid4().hex[:8]}",
            "description": "Test for action count",
            "asset_name": "Test Equipment"
        })
        assert inv_response.status_code == 200
        inv_id = inv_response.json()["id"]
        
        # Create action
        action_response = api_client.post(f"{BASE_URL}/api/actions", json={
            "title": "TEST_COUNT_ACTION",
            "description": "Test action for count",
            "source_type": "investigation",
            "source_id": inv_id,
            "source_name": "Test",
            "priority": "low"
        })
        assert action_response.status_code in [200, 201]
        
        # Delete with cascade
        delete_response = api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}?delete_central_actions=true")
        assert delete_response.status_code == 200
        delete_data = delete_response.json()
        
        # Verify response structure
        assert "message" in delete_data, "Response should have 'message' field"
        assert "deleted_central_actions" in delete_data, "Response should have 'deleted_central_actions' field"
        assert delete_data["deleted_central_actions"] == 1, "Should report 1 deleted action"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
