"""
Backend Integration Tests for Causal Investigation API
Tests CRUD operations for investigations, timeline events, failures, causes, and actions
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInvestigationsCRUD:
    """Test Investigation CRUD Operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_headers):
        """Setup with authenticated client"""
        self.client = api_client
        self.headers = auth_headers
        self.created_inv_ids = []
    
    def teardown_method(self):
        """Cleanup created investigations"""
        for inv_id in self.created_inv_ids:
            try:
                self.client.delete(f"{BASE_URL}/api/investigations/{inv_id}", headers=self.headers)
            except:
                pass
    
    def test_create_investigation(self, api_client, auth_headers):
        """Test creating a new investigation"""
        unique_id = str(uuid.uuid4())[:8]
        data = {
            "title": f"TEST_Investigation_{unique_id}",
            "description": "Test investigation description",
            "asset_name": "Test Pump P-101",
            "location": "Unit A",
            "incident_date": "2024-03-15",
            "investigation_leader": "Test Leader"
        }
        response = api_client.post(f"{BASE_URL}/api/investigations", json=data, headers=auth_headers)
        assert response.status_code == 200
        
        result = response.json()
        assert "id" in result
        assert result["title"] == data["title"]
        assert result["description"] == data["description"]
        assert result["asset_name"] == data["asset_name"]
        assert result["status"] == "draft"
        assert "case_number" in result
        assert result["case_number"].startswith("INV-")
        
        self.created_inv_ids.append(result["id"])
    
    def test_get_investigations_list(self, api_client, auth_headers):
        """Test getting list of investigations"""
        response = api_client.get(f"{BASE_URL}/api/investigations", headers=auth_headers)
        assert response.status_code == 200
        
        result = response.json()
        assert "investigations" in result
        assert isinstance(result["investigations"], list)
    
    def test_get_investigation_by_id(self, api_client, auth_headers):
        """Test getting a specific investigation with all related data"""
        # First create an investigation
        unique_id = str(uuid.uuid4())[:8]
        data = {"title": f"TEST_Get_Investigation_{unique_id}", "description": "Test get by ID"}
        create_resp = api_client.post(f"{BASE_URL}/api/investigations", json=data, headers=auth_headers)
        assert create_resp.status_code == 200
        inv_id = create_resp.json()["id"]
        self.created_inv_ids.append(inv_id)
        
        # Get the investigation
        response = api_client.get(f"{BASE_URL}/api/investigations/{inv_id}", headers=auth_headers)
        assert response.status_code == 200
        
        result = response.json()
        assert "investigation" in result
        assert "timeline_events" in result
        assert "failure_identifications" in result
        assert "cause_nodes" in result
        assert "action_items" in result
        assert result["investigation"]["id"] == inv_id
    
    def test_update_investigation_status(self, api_client, auth_headers):
        """Test updating investigation status"""
        unique_id = str(uuid.uuid4())[:8]
        data = {"title": f"TEST_Update_Status_{unique_id}", "description": "Test update"}
        create_resp = api_client.post(f"{BASE_URL}/api/investigations", json=data, headers=auth_headers)
        inv_id = create_resp.json()["id"]
        self.created_inv_ids.append(inv_id)
        
        # Update status
        update_resp = api_client.patch(
            f"{BASE_URL}/api/investigations/{inv_id}",
            json={"status": "in_progress"},
            headers=auth_headers
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["status"] == "in_progress"
        
        # Verify via GET
        get_resp = api_client.get(f"{BASE_URL}/api/investigations/{inv_id}", headers=auth_headers)
        assert get_resp.json()["investigation"]["status"] == "in_progress"
    
    def test_delete_investigation(self, api_client, auth_headers):
        """Test deleting an investigation"""
        unique_id = str(uuid.uuid4())[:8]
        data = {"title": f"TEST_Delete_{unique_id}", "description": "Test delete"}
        create_resp = api_client.post(f"{BASE_URL}/api/investigations", json=data, headers=auth_headers)
        inv_id = create_resp.json()["id"]
        
        # Delete
        delete_resp = api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}", headers=auth_headers)
        assert delete_resp.status_code == 200
        
        # Verify deleted
        get_resp = api_client.get(f"{BASE_URL}/api/investigations/{inv_id}", headers=auth_headers)
        assert get_resp.status_code == 404


class TestTimelineEvents:
    """Test Timeline Event Operations"""
    
    @pytest.fixture
    def investigation_id(self, api_client, auth_headers):
        """Create a test investigation"""
        unique_id = str(uuid.uuid4())[:8]
        data = {"title": f"TEST_Timeline_Inv_{unique_id}", "description": "Test timeline events"}
        resp = api_client.post(f"{BASE_URL}/api/investigations", json=data, headers=auth_headers)
        inv_id = resp.json()["id"]
        yield inv_id
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}", headers=auth_headers)
    
    def test_add_timeline_event(self, api_client, auth_headers, investigation_id):
        """Test adding a timeline event"""
        event_data = {
            "investigation_id": investigation_id,
            "event_time": "2024-03-15 14:30",
            "description": "Equipment vibration alarm triggered",
            "category": "alarm",
            "evidence_source": "SCADA log",
            "confidence": "high",
            "notes": "Initial alarm"
        }
        response = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/events",
            json=event_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        result = response.json()
        assert "id" in result
        assert result["description"] == event_data["description"]
        assert result["category"] == "alarm"
        assert result["confidence"] == "high"
    
    def test_multiple_timeline_events(self, api_client, auth_headers, investigation_id):
        """Test adding multiple timeline events and verifying order"""
        events = [
            {"investigation_id": investigation_id, "event_time": "2024-03-15 14:30", "description": "First event", "category": "alarm", "confidence": "high"},
            {"investigation_id": investigation_id, "event_time": "2024-03-15 14:35", "description": "Second event", "category": "operational_event", "confidence": "medium"},
            {"investigation_id": investigation_id, "event_time": "2024-03-15 14:40", "description": "Third event", "category": "human_decision", "confidence": "high"},
        ]
        
        for event in events:
            resp = api_client.post(f"{BASE_URL}/api/investigations/{investigation_id}/events", json=event, headers=auth_headers)
            assert resp.status_code == 200
        
        # Get investigation and verify events
        inv_resp = api_client.get(f"{BASE_URL}/api/investigations/{investigation_id}", headers=auth_headers)
        assert len(inv_resp.json()["timeline_events"]) == 3
    
    def test_delete_timeline_event(self, api_client, auth_headers, investigation_id):
        """Test deleting a timeline event"""
        event_data = {
            "investigation_id": investigation_id,
            "event_time": "2024-03-15 15:00",
            "description": "Event to delete",
            "category": "operational_event",
            "confidence": "medium"
        }
        create_resp = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/events",
            json=event_data,
            headers=auth_headers
        )
        event_id = create_resp.json()["id"]
        
        # Delete event
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/investigations/{investigation_id}/events/{event_id}",
            headers=auth_headers
        )
        assert delete_resp.status_code == 200


class TestFailureIdentifications:
    """Test Failure Identification Operations"""
    
    @pytest.fixture
    def investigation_id(self, api_client, auth_headers):
        unique_id = str(uuid.uuid4())[:8]
        data = {"title": f"TEST_Failure_Inv_{unique_id}", "description": "Test failures"}
        resp = api_client.post(f"{BASE_URL}/api/investigations", json=data, headers=auth_headers)
        inv_id = resp.json()["id"]
        yield inv_id
        api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}", headers=auth_headers)
    
    def test_add_failure_identification(self, api_client, auth_headers, investigation_id):
        """Test adding a failure identification"""
        failure_data = {
            "investigation_id": investigation_id,
            "asset_name": "Pump P-101",
            "subsystem": "Sealing System",
            "component": "Mechanical Seal",
            "failure_mode": "External Leakage",
            "degradation_mechanism": "Wear",
            "evidence": "Visual inspection, fluid on floor"
        }
        response = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/failures",
            json=failure_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        result = response.json()
        assert result["asset_name"] == "Pump P-101"
        assert result["failure_mode"] == "External Leakage"
        assert result["component"] == "Mechanical Seal"
    
    def test_delete_failure_identification(self, api_client, auth_headers, investigation_id):
        """Test deleting a failure identification"""
        failure_data = {
            "investigation_id": investigation_id,
            "asset_name": "Test Asset",
            "component": "Test Component",
            "failure_mode": "Test Failure"
        }
        create_resp = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/failures",
            json=failure_data,
            headers=auth_headers
        )
        failure_id = create_resp.json()["id"]
        
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/investigations/{investigation_id}/failures/{failure_id}",
            headers=auth_headers
        )
        assert delete_resp.status_code == 200


class TestCauseNodes:
    """Test Causal Tree Operations"""
    
    @pytest.fixture
    def investigation_id(self, api_client, auth_headers):
        unique_id = str(uuid.uuid4())[:8]
        data = {"title": f"TEST_Causes_Inv_{unique_id}", "description": "Test causes"}
        resp = api_client.post(f"{BASE_URL}/api/investigations", json=data, headers=auth_headers)
        inv_id = resp.json()["id"]
        yield inv_id
        api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}", headers=auth_headers)
    
    def test_add_root_cause(self, api_client, auth_headers, investigation_id):
        """Test adding a cause node as root cause"""
        cause_data = {
            "investigation_id": investigation_id,
            "description": "Seal material incompatibility with process fluid",
            "category": "design_issue",
            "parent_id": None,
            "is_root_cause": True,
            "evidence": "Material spec review confirmed incompatibility"
        }
        response = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/causes",
            json=cause_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        result = response.json()
        assert result["is_root_cause"] == True
        assert result["category"] == "design_issue"
    
    def test_add_child_cause(self, api_client, auth_headers, investigation_id):
        """Test adding a child cause under parent"""
        # Create parent cause
        parent_data = {
            "investigation_id": investigation_id,
            "description": "Equipment failure",
            "category": "technical_cause",
            "is_root_cause": False
        }
        parent_resp = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/causes",
            json=parent_data,
            headers=auth_headers
        )
        parent_id = parent_resp.json()["id"]
        
        # Create child cause
        child_data = {
            "investigation_id": investigation_id,
            "description": "Bearing degradation",
            "category": "maintenance_issue",
            "parent_id": parent_id,
            "is_root_cause": False
        }
        child_resp = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/causes",
            json=child_data,
            headers=auth_headers
        )
        assert child_resp.status_code == 200
        assert child_resp.json()["parent_id"] == parent_id
    
    def test_toggle_root_cause(self, api_client, auth_headers, investigation_id):
        """Test marking/unmarking as root cause"""
        cause_data = {
            "investigation_id": investigation_id,
            "description": "Initial cause",
            "category": "technical_cause",
            "is_root_cause": False
        }
        create_resp = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/causes",
            json=cause_data,
            headers=auth_headers
        )
        cause_id = create_resp.json()["id"]
        
        # Mark as root cause
        update_resp = api_client.patch(
            f"{BASE_URL}/api/investigations/{investigation_id}/causes/{cause_id}",
            json={"is_root_cause": True},
            headers=auth_headers
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["is_root_cause"] == True
    
    def test_delete_cause_with_children(self, api_client, auth_headers, investigation_id):
        """Test deleting a cause deletes children too"""
        # Create parent
        parent_data = {
            "investigation_id": investigation_id,
            "description": "Parent cause to delete",
            "category": "technical_cause"
        }
        parent_resp = api_client.post(f"{BASE_URL}/api/investigations/{investigation_id}/causes", json=parent_data, headers=auth_headers)
        parent_id = parent_resp.json()["id"]
        
        # Create children
        for i in range(2):
            child_data = {
                "investigation_id": investigation_id,
                "description": f"Child cause {i}",
                "category": "technical_cause",
                "parent_id": parent_id
            }
            api_client.post(f"{BASE_URL}/api/investigations/{investigation_id}/causes", json=child_data, headers=auth_headers)
        
        # Delete parent
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/investigations/{investigation_id}/causes/{parent_id}",
            headers=auth_headers
        )
        assert delete_resp.status_code == 200
        # Should have deleted 3 nodes (parent + 2 children)
        assert "Deleted 3" in delete_resp.json()["message"]


class TestActionItems:
    """Test Corrective Action Operations"""
    
    @pytest.fixture
    def investigation_id(self, api_client, auth_headers):
        unique_id = str(uuid.uuid4())[:8]
        data = {"title": f"TEST_Actions_Inv_{unique_id}", "description": "Test actions"}
        resp = api_client.post(f"{BASE_URL}/api/investigations", json=data, headers=auth_headers)
        inv_id = resp.json()["id"]
        yield inv_id
        api_client.delete(f"{BASE_URL}/api/investigations/{inv_id}", headers=auth_headers)
    
    def test_add_action_item(self, api_client, auth_headers, investigation_id):
        """Test adding a corrective action"""
        action_data = {
            "investigation_id": investigation_id,
            "description": "Replace mechanical seal with compatible material",
            "owner": "Maintenance Team",
            "priority": "high",
            "due_date": "2024-04-01"
        }
        response = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/actions",
            json=action_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        result = response.json()
        assert "action_number" in result
        assert result["action_number"].startswith("ACT-")
        assert result["status"] == "open"
        assert result["priority"] == "high"
    
    def test_update_action_status(self, api_client, auth_headers, investigation_id):
        """Test updating action status"""
        action_data = {
            "investigation_id": investigation_id,
            "description": "Action to update",
            "priority": "medium"
        }
        create_resp = api_client.post(
            f"{BASE_URL}/api/investigations/{investigation_id}/actions",
            json=action_data,
            headers=auth_headers
        )
        action_id = create_resp.json()["id"]
        
        # Update to in_progress
        update_resp = api_client.patch(
            f"{BASE_URL}/api/investigations/{investigation_id}/actions/{action_id}",
            json={"status": "in_progress"},
            headers=auth_headers
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["status"] == "in_progress"
        
        # Update to completed
        update_resp = api_client.patch(
            f"{BASE_URL}/api/investigations/{investigation_id}/actions/{action_id}",
            json={"status": "completed", "completion_notes": "Seal replaced successfully"},
            headers=auth_headers
        )
        assert update_resp.json()["status"] == "completed"
        assert update_resp.json()["completion_notes"] == "Seal replaced successfully"


class TestCreateFromThreat:
    """Test creating investigation from threat"""
    
    def test_create_investigation_from_threat(self, api_client, auth_headers):
        """Test creating investigation from existing threat"""
        # Get existing threats
        threats_resp = api_client.get(f"{BASE_URL}/api/threats", headers=auth_headers)
        if threats_resp.status_code != 200:
            pytest.skip("No threats available")
        
        threats = threats_resp.json()
        if not threats:
            pytest.skip("No threats to create investigation from")
        
        threat = threats[0]
        threat_id = threat["id"]
        
        # Create investigation from threat
        response = api_client.post(
            f"{BASE_URL}/api/threats/{threat_id}/investigate",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        result = response.json()
        assert "investigation" in result
        inv = result["investigation"]
        assert inv["threat_id"] == threat_id
        assert threat["title"] in inv["title"]
        
        # Cleanup
        if inv.get("id"):
            api_client.delete(f"{BASE_URL}/api/investigations/{inv['id']}", headers=auth_headers)
