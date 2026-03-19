"""
Test suite for Centralized Actions API endpoints.
Tests CRUD operations, filtering, and statistics.
"""
import pytest
import requests
import os
import uuid
from pathlib import Path

# Load frontend .env to get REACT_APP_BACKEND_URL
_frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
if _frontend_env.exists():
    for line in _frontend_env.read_text().splitlines():
        if line.strip() and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestActionsAPI:
    """Test suite for /api/actions endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self, authenticated_client):
        """Setup for each test"""
        self.client = authenticated_client
        self.created_action_ids = []
    
    def teardown_method(self, method):
        """Cleanup created actions after each test"""
        for action_id in self.created_action_ids:
            try:
                self.client.delete(f"{BASE_URL}/api/actions/{action_id}")
            except:
                pass
    
    def _create_test_action(self, title_prefix="TEST_ACTION"):
        """Helper to create a test action"""
        unique_id = str(uuid.uuid4())[:8]
        action_data = {
            "title": f"{title_prefix}_{unique_id}",
            "description": f"Test action description {unique_id}",
            "source_type": "threat",
            "source_id": str(uuid.uuid4()),
            "source_name": f"Test Threat {unique_id}",
            "priority": "medium",
            "assignee": f"Tester_{unique_id}",
            "discipline": "Mechanical",
            "due_date": "2026-04-01"
        }
        response = self.client.post(f"{BASE_URL}/api/actions", json=action_data)
        if response.status_code == 200:
            action = response.json()
            self.created_action_ids.append(action['id'])
            return action
        return None
    
    # ============= CREATE TESTS =============
    
    def test_create_action_from_threat(self, authenticated_client):
        """Test creating a new action promoted from threat"""
        unique_id = str(uuid.uuid4())[:8]
        action_data = {
            "title": f"TEST_ACTION_THREAT_{unique_id}",
            "description": "Replace worn seal in pump P-101",
            "source_type": "threat",
            "source_id": str(uuid.uuid4()),
            "source_name": f"Pump P-101 Seal Leak",
            "priority": "high",
            "assignee": "John Engineer",
            "discipline": "Mechanical",
            "due_date": "2026-04-15"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/actions", json=action_data)
        assert response.status_code == 200
        
        action = response.json()
        self.created_action_ids.append(action['id'])
        
        # Verify response structure
        assert "id" in action
        assert "action_number" in action
        assert action["action_number"].startswith("ACT-")
        assert action["title"] == action_data["title"]
        assert action["description"] == action_data["description"]
        assert action["source_type"] == "threat"
        assert action["priority"] == "high"
        assert action["status"] == "open"  # Default status
        assert action["assignee"] == "John Engineer"
        assert action["discipline"] == "Mechanical"
    
    def test_create_action_from_investigation(self, authenticated_client):
        """Test creating a new action promoted from investigation"""
        unique_id = str(uuid.uuid4())[:8]
        action_data = {
            "title": f"TEST_ACTION_INV_{unique_id}",
            "description": "Implement vibration monitoring program",
            "source_type": "investigation",
            "source_id": str(uuid.uuid4()),
            "source_name": "Compressor C-201 Root Cause Analysis",
            "priority": "critical"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/actions", json=action_data)
        assert response.status_code == 200
        
        action = response.json()
        self.created_action_ids.append(action['id'])
        
        assert action["source_type"] == "investigation"
        assert action["priority"] == "critical"
        assert action["status"] == "open"
    
    def test_create_action_minimal_fields(self, authenticated_client):
        """Test creating action with only required fields"""
        unique_id = str(uuid.uuid4())[:8]
        action_data = {
            "title": f"TEST_ACTION_MIN_{unique_id}",
            "description": "Minimal action test",
            "source_type": "threat",
            "source_id": str(uuid.uuid4()),
            "source_name": "Minimal Test"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/actions", json=action_data)
        assert response.status_code == 200
        
        action = response.json()
        self.created_action_ids.append(action['id'])
        
        # Verify defaults
        assert action["priority"] == "medium"  # Default
        assert action["status"] == "open"
        assert action["assignee"] is None or action["assignee"] == ""
    
    # ============= READ TESTS =============
    
    def test_get_all_actions(self, authenticated_client):
        """Test getting all actions with stats"""
        # Create a test action first
        action = self._create_test_action()
        assert action is not None
        
        response = authenticated_client.get(f"{BASE_URL}/api/actions")
        assert response.status_code == 200
        
        data = response.json()
        assert "actions" in data
        assert "stats" in data
        
        # Verify stats structure
        stats = data["stats"]
        assert "total" in stats
        assert "open" in stats
        assert "in_progress" in stats
        assert "completed" in stats
        assert "overdue" in stats
        
        # Verify at least one action exists
        assert len(data["actions"]) >= 1
    
    def test_get_action_by_id(self, authenticated_client):
        """Test getting a specific action by ID"""
        # Create a test action
        action = self._create_test_action()
        assert action is not None
        
        # Fetch by ID
        response = authenticated_client.get(f"{BASE_URL}/api/actions/{action['id']}")
        assert response.status_code == 200
        
        fetched_action = response.json()
        assert fetched_action["id"] == action["id"]
        assert fetched_action["title"] == action["title"]
        assert fetched_action["action_number"] == action["action_number"]
    
    def test_get_action_not_found(self, authenticated_client):
        """Test getting non-existent action returns 404"""
        fake_id = str(uuid.uuid4())
        response = authenticated_client.get(f"{BASE_URL}/api/actions/{fake_id}")
        assert response.status_code == 404
    
    # ============= UPDATE TESTS =============
    
    def test_update_action_status(self, authenticated_client):
        """Test updating action status"""
        action = self._create_test_action()
        assert action is not None
        assert action["status"] == "open"
        
        # Update to in_progress
        response = authenticated_client.patch(
            f"{BASE_URL}/api/actions/{action['id']}",
            json={"status": "in_progress"}
        )
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["status"] == "in_progress"
        
        # Verify via GET
        get_response = authenticated_client.get(f"{BASE_URL}/api/actions/{action['id']}")
        assert get_response.json()["status"] == "in_progress"
    
    def test_update_action_priority(self, authenticated_client):
        """Test updating action priority"""
        action = self._create_test_action()
        assert action is not None
        
        response = authenticated_client.patch(
            f"{BASE_URL}/api/actions/{action['id']}",
            json={"priority": "critical"}
        )
        assert response.status_code == 200
        assert response.json()["priority"] == "critical"
    
    def test_update_action_assignee_and_discipline(self, authenticated_client):
        """Test updating assignee and discipline"""
        action = self._create_test_action()
        assert action is not None
        
        response = authenticated_client.patch(
            f"{BASE_URL}/api/actions/{action['id']}",
            json={
                "assignee": "Jane Engineer",
                "discipline": "Electrical"
            }
        )
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["assignee"] == "Jane Engineer"
        assert updated["discipline"] == "Electrical"
    
    def test_update_action_due_date(self, authenticated_client):
        """Test updating due date"""
        action = self._create_test_action()
        assert action is not None
        
        new_date = "2026-05-15"
        response = authenticated_client.patch(
            f"{BASE_URL}/api/actions/{action['id']}",
            json={"due_date": new_date}
        )
        assert response.status_code == 200
        assert new_date in response.json()["due_date"]
    
    def test_update_action_complete_with_notes(self, authenticated_client):
        """Test marking action complete with notes"""
        action = self._create_test_action()
        assert action is not None
        
        response = authenticated_client.patch(
            f"{BASE_URL}/api/actions/{action['id']}",
            json={
                "status": "completed",
                "completion_notes": "Replaced seal, verified no leaks"
            }
        )
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["status"] == "completed"
        assert updated["completion_notes"] == "Replaced seal, verified no leaks"
    
    def test_update_action_title_and_description(self, authenticated_client):
        """Test updating title and description"""
        action = self._create_test_action()
        assert action is not None
        
        response = authenticated_client.patch(
            f"{BASE_URL}/api/actions/{action['id']}",
            json={
                "title": "Updated Test Title",
                "description": "Updated description content"
            }
        )
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["title"] == "Updated Test Title"
        assert updated["description"] == "Updated description content"
    
    # ============= DELETE TESTS =============
    
    def test_delete_action(self, authenticated_client):
        """Test deleting an action"""
        action = self._create_test_action()
        assert action is not None
        action_id = action['id']
        
        # Delete
        response = authenticated_client.delete(f"{BASE_URL}/api/actions/{action_id}")
        assert response.status_code == 200
        
        # Remove from cleanup list since already deleted
        self.created_action_ids.remove(action_id)
        
        # Verify deleted
        get_response = authenticated_client.get(f"{BASE_URL}/api/actions/{action_id}")
        assert get_response.status_code == 404
    
    def test_delete_action_not_found(self, authenticated_client):
        """Test deleting non-existent action"""
        fake_id = str(uuid.uuid4())
        response = authenticated_client.delete(f"{BASE_URL}/api/actions/{fake_id}")
        assert response.status_code == 404
    
    # ============= FILTER TESTS =============
    
    def test_filter_actions_by_status(self, authenticated_client):
        """Test filtering actions by status"""
        # Create actions with different statuses
        action1 = self._create_test_action("TEST_FILTER_OPEN")
        
        action2 = self._create_test_action("TEST_FILTER_INPROG")
        if action2:
            authenticated_client.patch(
                f"{BASE_URL}/api/actions/{action2['id']}",
                json={"status": "in_progress"}
            )
        
        # Filter by open
        response = authenticated_client.get(f"{BASE_URL}/api/actions?status=open")
        assert response.status_code == 200
        
        data = response.json()
        open_actions = data["actions"]
        for a in open_actions:
            assert a["status"] == "open"
        
        # Filter by in_progress
        response = authenticated_client.get(f"{BASE_URL}/api/actions?status=in_progress")
        assert response.status_code == 200
        
        data = response.json()
        in_progress_actions = data["actions"]
        for a in in_progress_actions:
            assert a["status"] == "in_progress"
    
    def test_filter_actions_by_priority(self, authenticated_client):
        """Test filtering actions by priority"""
        # Create high priority action
        unique_id = str(uuid.uuid4())[:8]
        action_data = {
            "title": f"TEST_FILTER_HIGH_{unique_id}",
            "description": "High priority test",
            "source_type": "threat",
            "source_id": str(uuid.uuid4()),
            "source_name": "Test",
            "priority": "high"
        }
        response = authenticated_client.post(f"{BASE_URL}/api/actions", json=action_data)
        if response.status_code == 200:
            self.created_action_ids.append(response.json()['id'])
        
        # Filter by high priority
        response = authenticated_client.get(f"{BASE_URL}/api/actions?priority=high")
        assert response.status_code == 200
        
        data = response.json()
        for a in data["actions"]:
            assert a["priority"] == "high"
    
    def test_filter_actions_by_source_type(self, authenticated_client):
        """Test filtering actions by source type"""
        # Create actions from different sources
        self._create_test_action("TEST_THREAT_SOURCE")
        
        unique_id = str(uuid.uuid4())[:8]
        inv_action = {
            "title": f"TEST_INV_SOURCE_{unique_id}",
            "description": "From investigation",
            "source_type": "investigation",
            "source_id": str(uuid.uuid4()),
            "source_name": "Test Investigation"
        }
        response = authenticated_client.post(f"{BASE_URL}/api/actions", json=inv_action)
        if response.status_code == 200:
            self.created_action_ids.append(response.json()['id'])
        
        # Filter by threat source
        response = authenticated_client.get(f"{BASE_URL}/api/actions?source_type=threat")
        assert response.status_code == 200
        
        data = response.json()
        for a in data["actions"]:
            assert a["source_type"] == "threat"
        
        # Filter by investigation source
        response = authenticated_client.get(f"{BASE_URL}/api/actions?source_type=investigation")
        assert response.status_code == 200
        
        data = response.json()
        for a in data["actions"]:
            assert a["source_type"] == "investigation"
    
    # ============= STATS TESTS =============
    
    def test_stats_accuracy(self, authenticated_client):
        """Test that stats are accurate"""
        # Create actions with various statuses
        action1 = self._create_test_action("TEST_STATS_OPEN")
        
        action2 = self._create_test_action("TEST_STATS_INPROG")
        if action2:
            authenticated_client.patch(
                f"{BASE_URL}/api/actions/{action2['id']}",
                json={"status": "in_progress"}
            )
        
        action3 = self._create_test_action("TEST_STATS_COMPLETED")
        if action3:
            authenticated_client.patch(
                f"{BASE_URL}/api/actions/{action3['id']}",
                json={"status": "completed"}
            )
        
        # Get stats
        response = authenticated_client.get(f"{BASE_URL}/api/actions")
        assert response.status_code == 200
        
        stats = response.json()["stats"]
        
        # Stats should reflect reality
        assert stats["total"] >= 3
        assert stats["open"] >= 1
        assert stats["in_progress"] >= 1
        assert stats["completed"] >= 1
        # Overdue is calculated based on due_date
        assert "overdue" in stats


class TestActionsAPIUnauthorized:
    """Test unauthorized access to actions API"""
    
    def test_get_actions_unauthorized(self):
        """Test that unauthenticated requests are rejected"""
        response = requests.get(f"{BASE_URL}/api/actions")
        assert response.status_code in [401, 403]
    
    def test_create_action_unauthorized(self):
        """Test that unauthenticated create is rejected"""
        response = requests.post(
            f"{BASE_URL}/api/actions",
            json={"title": "Unauthorized", "description": "test", "source_type": "threat", "source_id": "x", "source_name": "x"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403]
