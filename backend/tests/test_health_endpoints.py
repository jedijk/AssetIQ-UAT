"""Tests for liveness (/health) vs operational (/api/health) probes."""
import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017/test")
    import server

    importlib.reload(server)
    with TestClient(server.app) as test_client:
        yield test_client, server


def test_health_always_200_even_when_routes_fail(client):
    test_client, server = client
    server.route_load_error = {
        "error": "simulated import failure",
        "type": "ImportError",
        "traceback": "",
    }

    response = test_client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["routes_loaded"] is False
    assert data["route_load_error"] == "simulated import failure"


def test_health_includes_routes_loaded_when_ok(client):
    test_client, server = client
    server.route_load_error = None

    response = test_client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["routes_loaded"] is True
    assert "route_load_error" not in data


def test_api_health_503_when_routes_fail(client):
    test_client, server = client
    server.route_load_error = {
        "error": "simulated import failure",
        "type": "ImportError",
        "traceback": "",
    }

    response = test_client.get("/api/health")

    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["routes_loaded"] is False
    assert data["route_load_error"] == "simulated import failure"


def test_api_health_includes_routes_loaded(client):
    test_client, server = client
    server.route_load_error = None

    response = test_client.get("/api/health")

    assert "routes_loaded" in response.json()
