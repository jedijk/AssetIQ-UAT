import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


# ===== AUTH TESTS =====

class TestAuthRegistration:
    def test_register_new_user(self, api_client):
        """Register a new user successfully"""
        unique_email = f"test_reg_{uuid.uuid4().hex[:8]}@example.com"
        response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "name": "TEST_RegisterUser",
            "password": "testpassword123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == unique_email
        assert data["user"]["name"] == "TEST_RegisterUser"
        assert "id" in data["user"]

    def test_register_duplicate_email(self, api_client):
        """Cannot register with existing email"""
        response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": "test@example.com",
            "name": "TEST_DuplicateUser",
            "password": "testpassword123"
        })
        assert response.status_code == 400
        assert "already registered" in response.json().get("detail", "").lower()

    def test_register_requires_all_fields(self, api_client):
        """Registration fails with missing fields"""
        response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": "incomplete@example.com"
        })
        assert response.status_code == 422


class TestAuthLogin:
    def test_login_valid_credentials(self, api_client):
        """Login with valid credentials returns token and user"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"

    def test_login_invalid_password(self, api_client):
        """Login fails with wrong password"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401

    def test_login_invalid_email(self, api_client):
        """Login fails with non-existent email"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "test123"
        })
        assert response.status_code == 401

    def test_get_current_user(self, authenticated_client):
        """Get current user with valid token"""
        response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "email" in data
        assert "name" in data

    def test_protected_route_without_token(self, api_client):
        """Protected routes require authentication"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [401, 403]
