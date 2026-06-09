"""Tests for Q1 cutover configuration defaults."""
import os

import pytest

from services.cutover_config import (
    cutover_gaps,
    default_work_items_source,
    is_deployed_environment,
)
from services.work_execution_config import work_items_source_mode


def test_default_work_items_hybrid_in_dev(monkeypatch):
    monkeypatch.delenv("WORK_ITEMS_SOURCE", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    assert default_work_items_source() == "hybrid"
    assert work_items_source_mode() == "hybrid"


def test_default_work_items_v2_on_uat(monkeypatch):
    monkeypatch.delenv("WORK_ITEMS_SOURCE", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "uat")
    assert default_work_items_source() == "v2_instances"
    assert work_items_source_mode() == "v2_instances"


def test_work_items_explicit_override(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "uat")
    monkeypatch.setenv("WORK_ITEMS_SOURCE", "hybrid")
    assert work_items_source_mode() == "hybrid"


def test_cutover_gaps_lists_missing_p0_flags(monkeypatch):
    monkeypatch.delenv("WORK_ITEMS_SOURCE", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("TENANT_STRICT_MODE", raising=False)
    gaps = cutover_gaps()
    assert any("WORK_ITEMS_SOURCE" in g for g in gaps)
    assert any("TENANT_STRICT_MODE" in g for g in gaps)


def test_is_deployed_environment():
    assert is_deployed_environment() is False or os.getenv("ENVIRONMENT") in (
        "production",
        "prod",
        "uat",
        "staging",
    )
