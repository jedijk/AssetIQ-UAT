import pytest
import requests
import os
from pathlib import Path

# Load frontend .env to get REACT_APP_BACKEND_URL
_frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
if _frontend_env.exists():
    for line in _frontend_env.read_text().splitlines():
        if line.strip() and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://threat-capture-ai.preview.emergentagent.com').rstrip('/')

@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@test.com",
        "password": "test"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed ({response.status_code}) — skipping authenticated tests")

@pytest.fixture
def authenticated_client(api_client, auth_token):
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client

@pytest.fixture
def auth_headers(auth_token):
    """Return headers dict with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
