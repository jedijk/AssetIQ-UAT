import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@example.com",
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed ({response.status_code})")

@pytest.fixture
def authenticated_client(api_client, auth_token):
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client

@pytest.fixture
def created_threat_id(authenticated_client):
    """Create a threat via API seeding and clean up after test"""
    # We'll use a chat send to create a threat
    response = authenticated_client.post(f"{BASE_URL}/api/chat/send", json={
        "content": "TEST_Pump P-999 has bearing failure causing high vibration and noise. This is a frequent occurrence with high likelihood of recurrence. Moderate detectability."
    })
    threat_id = None
    if response.status_code == 200:
        data = response.json()
        threat = data.get("threat")
        if threat:
            threat_id = threat.get("id")
    
    yield threat_id
    
    # Cleanup
    if threat_id:
        authenticated_client.delete(f"{BASE_URL}/api/threats/{threat_id}")


class TestThreatsAPI:
    def test_get_all_threats(self, authenticated_client):
        """Get all threats returns list"""
        response = authenticated_client.get(f"{BASE_URL}/api/threats")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_threats_with_status_filter(self, authenticated_client):
        """Filter threats by Open status"""
        response = authenticated_client.get(f"{BASE_URL}/api/threats?status=Open")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for threat in data:
            assert threat["status"] == "Open"

    def test_get_top_threats(self, authenticated_client):
        """Get top threats endpoint"""
        response = authenticated_client.get(f"{BASE_URL}/api/threats/top?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 5

    def test_get_threat_by_id(self, authenticated_client, created_threat_id):
        """Get single threat by ID"""
        if not created_threat_id:
            pytest.skip("No threat was created")
        response = authenticated_client.get(f"{BASE_URL}/api/threats/{created_threat_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == created_threat_id
        # Validate key fields
        assert "title" in data
        assert "asset" in data
        assert "risk_level" in data
        assert "risk_score" in data
        assert isinstance(data["risk_score"], int)
        assert "status" in data
        assert "recommended_actions" in data

    def test_get_nonexistent_threat(self, authenticated_client):
        """Get non-existent threat returns 404"""
        response = authenticated_client.get(f"{BASE_URL}/api/threats/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_update_threat_status(self, authenticated_client, created_threat_id):
        """Update threat status and verify"""
        if not created_threat_id:
            pytest.skip("No threat was created")
        
        response = authenticated_client.patch(
            f"{BASE_URL}/api/threats/{created_threat_id}",
            json={"status": "Mitigated"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Mitigated"
        
        # Verify via GET
        get_response = authenticated_client.get(f"{BASE_URL}/api/threats/{created_threat_id}")
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "Mitigated"

    def test_delete_threat(self, authenticated_client):
        """Delete a threat and verify it's gone"""
        # Create a fresh threat for deletion test
        response = authenticated_client.post(f"{BASE_URL}/api/chat/send", json={
            "content": "TEST_Compressor C-DELETE bearing wear causing vibration. Frequent occurrence, High likelihood."
        })
        if response.status_code != 200:
            pytest.skip("Failed to create threat for deletion test")
        
        threat = response.json().get("threat")
        if not threat:
            pytest.skip("AI did not create a threat (needs follow-up)")
        
        threat_id = threat["id"]
        
        # Delete
        del_response = authenticated_client.delete(f"{BASE_URL}/api/threats/{threat_id}")
        assert del_response.status_code == 200
        
        # Verify deleted
        get_response = authenticated_client.get(f"{BASE_URL}/api/threats/{threat_id}")
        assert get_response.status_code == 404

    def test_threats_unauthorized(self, api_client):
        """Threats endpoint requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/threats")
        assert response.status_code in [401, 403]


class TestStatsAPI:
    def test_get_stats(self, authenticated_client):
        """Get stats returns expected structure"""
        response = authenticated_client.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_threats" in data
        assert "open_threats" in data
        assert "critical_count" in data
        assert "high_count" in data
        assert isinstance(data["total_threats"], int)
        assert isinstance(data["open_threats"], int)


class TestChatAPI:
    def test_get_chat_history(self, authenticated_client):
        """Get chat history returns list"""
        response = authenticated_client.get(f"{BASE_URL}/api/chat/history?limit=10")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_chat_unauthorized(self, api_client):
        """Chat endpoint requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/chat/history")
        assert response.status_code in [401, 403]
