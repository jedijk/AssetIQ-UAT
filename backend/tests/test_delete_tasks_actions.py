"""
Test suite for My Tasks deletion functionality.
Tests both Action deletion (/api/actions/{id}) and Task Instance deletion (/api/task-instances/{id}).
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDeleteActions:
    """Tests for deleting Actions from My Tasks page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_my_tasks_returns_actions(self):
        """Verify My Tasks endpoint returns actions with source_type='action'"""
        response = requests.get(f"{BASE_URL}/api/my-tasks?filter=open", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "tasks" in data
        
        # Check that we have actions
        actions = [t for t in data["tasks"] if t.get("source_type") == "action"]
        print(f"Found {len(actions)} actions in My Tasks")
        assert len(actions) > 0, "Expected at least one action in My Tasks"
        
        # Verify action structure
        action = actions[0]
        assert "id" in action
        assert "title" in action
        assert action["source_type"] == "action"
    
    def test_delete_action_uses_correct_endpoint(self):
        """Verify deleting an action calls /api/actions/{id} endpoint"""
        # Get an action to delete
        response = requests.get(f"{BASE_URL}/api/my-tasks?filter=open", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        actions = [t for t in data["tasks"] if t.get("source_type") == "action"]
        
        if len(actions) == 0:
            pytest.skip("No actions available to delete")
        
        action_to_delete = actions[0]
        action_id = action_to_delete["id"]
        print(f"Deleting action: {action_id} - {action_to_delete['title'][:50]}")
        
        # Delete the action using the actions endpoint
        delete_response = requests.delete(
            f"{BASE_URL}/api/actions/{action_id}",
            headers=self.headers
        )
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        assert delete_response.json().get("message") == "Action deleted"
        
        # Verify action is removed from my-tasks
        verify_response = requests.get(f"{BASE_URL}/api/my-tasks?filter=open", headers=self.headers)
        assert verify_response.status_code == 200
        
        remaining_ids = [t["id"] for t in verify_response.json()["tasks"]]
        assert action_id not in remaining_ids, "Action should be removed from My Tasks after deletion"
    
    def test_delete_action_returns_404_for_nonexistent(self):
        """Verify deleting non-existent action returns 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.delete(
            f"{BASE_URL}/api/actions/{fake_id}",
            headers=self.headers
        )
        assert response.status_code == 404


class TestDeleteTaskInstances:
    """Tests for deleting Task Instances from My Tasks page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_task_instances(self):
        """Verify task instances endpoint works"""
        response = requests.get(f"{BASE_URL}/api/task-instances", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "instances" in data
        print(f"Found {len(data['instances'])} task instances")
    
    def test_delete_task_instance_endpoint_exists(self):
        """Verify DELETE /api/task-instances/{id} endpoint exists"""
        # Try to delete a non-existent task instance
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.delete(
            f"{BASE_URL}/api/task-instances/{fake_id}",
            headers=self.headers
        )
        # Should return 404 (not found) not 405 (method not allowed)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestMyTasksDeleteLogic:
    """Tests for the frontend delete logic that routes to correct endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "jedijk@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_my_tasks_contains_source_type_field(self):
        """Verify My Tasks response includes source_type for routing delete requests"""
        response = requests.get(f"{BASE_URL}/api/my-tasks?filter=open", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        for task in data["tasks"]:
            assert "source_type" in task, f"Task {task['id']} missing source_type field"
            assert task["source_type"] in ["action", "task"], f"Invalid source_type: {task['source_type']}"
    
    def test_action_delete_invalidates_cache(self):
        """Verify deleting an action removes it from subsequent My Tasks queries"""
        # Get initial count
        initial_response = requests.get(f"{BASE_URL}/api/my-tasks?filter=open", headers=self.headers)
        assert initial_response.status_code == 200
        initial_count = len(initial_response.json()["tasks"])
        
        # Get an action to delete
        actions = [t for t in initial_response.json()["tasks"] if t.get("source_type") == "action"]
        if len(actions) == 0:
            pytest.skip("No actions available to delete")
        
        action_id = actions[0]["id"]
        
        # Delete the action
        delete_response = requests.delete(
            f"{BASE_URL}/api/actions/{action_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200
        
        # Verify count decreased
        final_response = requests.get(f"{BASE_URL}/api/my-tasks?filter=open", headers=self.headers)
        assert final_response.status_code == 200
        final_count = len(final_response.json()["tasks"])
        
        assert final_count == initial_count - 1, f"Expected count to decrease by 1, was {initial_count}, now {final_count}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
