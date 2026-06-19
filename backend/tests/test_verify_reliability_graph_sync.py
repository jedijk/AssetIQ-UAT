"""Tests for scripts/verify_reliability_graph_sync.py."""
import importlib.util
import os
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "verify_reliability_graph_sync.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("verify_reliability_graph_sync", SCRIPT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_should_skip_db_sampling_without_mongo(monkeypatch):
    mod = _load_module()
    monkeypatch.delenv("MONGO_URL", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    assert mod._should_skip_db_sampling() == "MONGO_URL not set"


def test_should_skip_db_sampling_in_test_env(monkeypatch):
    mod = _load_module()
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017/test")
    monkeypatch.setenv("ENVIRONMENT", "test")
    assert "ENVIRONMENT=test" in mod._should_skip_db_sampling()


def test_should_run_db_sampling_for_uat(monkeypatch):
    mod = _load_module()
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017/uat")
    monkeypatch.setenv("ENVIRONMENT", "uat")
    monkeypatch.delenv("GRAPH_AUDIT_SKIP_DB", raising=False)
    assert mod._should_skip_db_sampling() is None


def test_static_path_checks_pass():
    mod = _load_module()
    assert mod._static_path_checks() == []
