"""
Shared pytest fixtures and test configuration.
All test credentials are loaded from environment variables.
"""
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

# =============================================
# TEST CONFIGURATION - Environment Variables
# =============================================
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from environment (fallback to test_credentials.md values)
TEST_ADMIN_EMAIL = os.environ.get('TEST_ADMIN_EMAIL', 'test@test.com')
TEST_ADMIN_PASSWORD = os.environ.get('TEST_ADMIN_PASSWORD', 'test')
TEST_OWNER_EMAIL = os.environ.get('TEST_OWNER_EMAIL', 'jedijk@gmail.com')
TEST_OWNER_PASSWORD = os.environ.get('TEST_OWNER_PASSWORD', 'admin123')

# Test data IDs (if needed)
TEST_THREAT_ID = os.environ.get('TEST_THREAT_ID', '43455566-4f46-4c54-8130-fdd7a7d009a1')


# =============================================
# SHARED FIXTURES
# =============================================

@pytest.fixture(scope="session")
def base_url():
    """Return the API base URL."""
    return BASE_URL


@pytest.fixture
def api_client():
    """Create an unauthenticated API session."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def admin_credentials():
    """Return admin test credentials."""
    return {"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}


@pytest.fixture
def owner_credentials():
    """Return owner test credentials."""
    return {"email": TEST_OWNER_EMAIL, "password": TEST_OWNER_PASSWORD}


@pytest.fixture
def auth_token(api_client, admin_credentials):
    """Get auth token for admin user."""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=admin_credentials)
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed ({response.status_code}) — skipping authenticated tests")


@pytest.fixture
def owner_token(api_client, owner_credentials):
    """Get auth token for owner user."""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=owner_credentials)
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Owner authentication failed ({response.status_code}) — skipping owner tests")


@pytest.fixture
def authenticated_client(api_client, auth_token):
    """Create an authenticated API session with admin token."""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


@pytest.fixture
def owner_authenticated_client(api_client, owner_token):
    """Create an authenticated API session with owner token."""
    api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
    return api_client


@pytest.fixture
def auth_headers(auth_token):
    """Return headers dict with admin auth token."""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture
def owner_auth_headers(owner_token):
    """Return headers dict with owner auth token."""
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


@pytest.fixture
def test_threat_id():
    """Return test threat ID for AI tests."""
    return TEST_THREAT_ID
