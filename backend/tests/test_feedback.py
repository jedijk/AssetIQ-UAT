"""
Test suite for User Feedback API endpoints.
Tests: POST /api/feedback, GET /api/feedback/my, GET /api/feedback/{id}
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestFeedbackAPI:
    """Test cases for Feedback API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@test.com", "password": "test"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.user_id = login_response.json().get("user", {}).get("id")
    
    def test_get_my_feedback_returns_list(self):
        """GET /api/feedback/my - should return user's feedback list"""
        response = self.session.get(f"{BASE_URL}/api/feedback/my")
        
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)
        assert data["total"] == len(data["items"])
        
        # If items exist, validate structure
        if data["items"]:
            item = data["items"][0]
            assert "id" in item
            assert "type" in item
            assert "message" in item
            assert "status" in item
            assert "timestamp" in item
            assert "user_id" in item
            print(f"PASSED: GET /api/feedback/my returned {data['total']} items")
    
    def test_create_feedback_issue_type(self):
        """POST /api/feedback - create issue type feedback with severity"""
        unique_msg = f"TEST_issue_feedback_{uuid.uuid4().hex[:8]}"
        payload = {
            "type": "issue",
            "message": unique_msg,
            "severity": "high"
        }
        
        response = self.session.post(f"{BASE_URL}/api/feedback", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        # Validate response data
        assert data["type"] == "issue"
        assert data["message"] == unique_msg
        assert data["severity"] == "high"
        assert data["status"] == "new"
        assert "id" in data
        assert "timestamp" in data
        
        # Verify persistence via GET
        get_response = self.session.get(f"{BASE_URL}/api/feedback/my")
        assert get_response.status_code == 200
        items = get_response.json()["items"]
        created_item = next((i for i in items if i["id"] == data["id"]), None)
        assert created_item is not None, "Created feedback not found in list"
        assert created_item["message"] == unique_msg
        
        print(f"PASSED: Created issue feedback with id {data['id']}")
        return data["id"]
    
    def test_create_feedback_improvement_type(self):
        """POST /api/feedback - create improvement type feedback (no severity)"""
        unique_msg = f"TEST_improvement_feedback_{uuid.uuid4().hex[:8]}"
        payload = {
            "type": "improvement",
            "message": unique_msg
        }
        
        response = self.session.post(f"{BASE_URL}/api/feedback", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] == "improvement"
        assert data["message"] == unique_msg
        assert data["severity"] is None  # Improvement type shouldn't have severity
        assert data["status"] == "new"
        
        print(f"PASSED: Created improvement feedback with id {data['id']}")
    
    def test_create_feedback_general_type(self):
        """POST /api/feedback - create general type feedback"""
        unique_msg = f"TEST_general_feedback_{uuid.uuid4().hex[:8]}"
        payload = {
            "type": "general",
            "message": unique_msg
        }
        
        response = self.session.post(f"{BASE_URL}/api/feedback", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["type"] == "general"
        assert data["message"] == unique_msg
        assert data["status"] == "new"
        
        print(f"PASSED: Created general feedback with id {data['id']}")
    
    def test_get_feedback_by_id(self):
        """GET /api/feedback/{id} - get specific feedback detail"""
        # First create a feedback
        unique_msg = f"TEST_detail_feedback_{uuid.uuid4().hex[:8]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/feedback",
            json={"type": "issue", "message": unique_msg, "severity": "medium"}
        )
        assert create_response.status_code == 200
        feedback_id = create_response.json()["id"]
        
        # Get by ID
        response = self.session.get(f"{BASE_URL}/api/feedback/{feedback_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == feedback_id
        assert data["message"] == unique_msg
        assert data["type"] == "issue"
        assert data["severity"] == "medium"
        
        print(f"PASSED: GET /api/feedback/{feedback_id} returned correct data")
    
    def test_get_feedback_not_found(self):
        """GET /api/feedback/{id} - should return 404 for non-existent feedback"""
        fake_id = str(uuid.uuid4())
        response = self.session.get(f"{BASE_URL}/api/feedback/{fake_id}")
        
        assert response.status_code == 404
        print(f"PASSED: GET /api/feedback/{fake_id} returned 404 as expected")
    
    def test_feedback_sorted_by_newest_first(self):
        """GET /api/feedback/my - should return items sorted by newest first"""
        response = self.session.get(f"{BASE_URL}/api/feedback/my")
        
        assert response.status_code == 200
        items = response.json()["items"]
        
        if len(items) >= 2:
            # Check timestamps are in descending order
            for i in range(len(items) - 1):
                assert items[i]["timestamp"] >= items[i + 1]["timestamp"], \
                    "Feedback items not sorted by newest first"
            print(f"PASSED: Feedback items sorted by newest first ({len(items)} items)")
        else:
            print(f"SKIPPED: Not enough items to verify sorting ({len(items)} items)")
    
    def test_create_feedback_with_all_severity_levels(self):
        """POST /api/feedback - test all severity levels for issue type"""
        severity_levels = ["low", "medium", "high", "critical"]
        
        for severity in severity_levels:
            payload = {
                "type": "issue",
                "message": f"TEST_severity_{severity}_{uuid.uuid4().hex[:8]}",
                "severity": severity
            }
            response = self.session.post(f"{BASE_URL}/api/feedback", json=payload)
            
            assert response.status_code == 200
            assert response.json()["severity"] == severity
        
        print(f"PASSED: All severity levels (low, medium, high, critical) work correctly")
    
    def test_create_feedback_empty_message_fails(self):
        """POST /api/feedback - should fail with empty message"""
        payload = {
            "type": "issue",
            "message": ""
        }
        response = self.session.post(f"{BASE_URL}/api/feedback", json=payload)
        
        # Should return 422 validation error
        assert response.status_code == 422
        print(f"PASSED: Empty message correctly rejected with 422")
    
    def test_create_feedback_invalid_type_fails(self):
        """POST /api/feedback - should fail with invalid type"""
        payload = {
            "type": "invalid_type",
            "message": "Test message"
        }
        response = self.session.post(f"{BASE_URL}/api/feedback", json=payload)
        
        # Should return 422 validation error
        assert response.status_code == 422
        print(f"PASSED: Invalid type correctly rejected with 422")
    
    def test_feedback_requires_authentication(self):
        """Feedback endpoints should require authentication"""
        # Create a new session without auth
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        # Test GET /api/feedback/my - should return 401 or 403
        response = no_auth_session.get(f"{BASE_URL}/api/feedback/my")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        
        # Test POST /api/feedback - should return 401 or 403
        response = no_auth_session.post(
            f"{BASE_URL}/api/feedback",
            json={"type": "general", "message": "test"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        
        print(f"PASSED: Feedback endpoints require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
