"""Tests for threat→observation convergence verify script."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from scripts.verify_threat_observation_convergence import (  # noqa: E402
    analyze_convergence,
    format_report,
    verify_threat_observation_convergence,
)


def test_analyze_convergence_passes_when_aligned():
    report = analyze_convergence(
        {"t-1", "t-2"},
        [
            {"id": "t-1"},
            {"id": "t-2"},
        ],
    )
    assert report.passed
    assert report.threats_total == 2
    assert report.observations_total == 2


def test_analyze_convergence_detects_missing_observation():
    report = analyze_convergence(
        {"t-1", "t-2"},
        [{"id": "t-1"}],
    )
    assert not report.passed
    assert report.missing_observations == ["t-2"]


def test_analyze_convergence_detects_orphan_observation():
    report = analyze_convergence(
        {"t-1"},
        [{"id": "t-1"}, {"id": "orphan-1"}],
    )
    assert not report.passed
    assert report.orphan_observations == ["orphan-1"]


def test_analyze_convergence_detects_legacy_threat_id_duplicates():
    report = analyze_convergence(
        {"t-1"},
        [
            {"id": "t-1"},
            {"id": "obs-legacy", "legacy_threat_id": "t-1"},
        ],
    )
    assert not report.passed
    assert report.legacy_threat_id_duplicates == {"t-1": ["obs-legacy"]}


def test_format_report_includes_counts():
    report = analyze_convergence({"t-1"}, [])
    text = format_report(report)
    assert "Missing same-id observations: 1" in text
    assert "sample missing: t-1" in text


@pytest.mark.asyncio
async def test_verify_threat_observation_convergence_mocked_db():
    mock_db = MagicMock()
    mock_db.threats = MagicMock()
    mock_db.observations = MagicMock()
    mock_db.threats.find = MagicMock(
        return_value=MagicMock(
            to_list=AsyncMock(return_value=[{"id": "t-1"}, {"id": "t-2"}])
        )
    )

    class _ObsCursor:
        def __init__(self, docs):
            self._docs = docs

        def batch_size(self, _n):
            return self

        def __aiter__(self):
            return self

        async def __anext__(self):
            if not self._docs:
                raise StopAsyncIteration
            return self._docs.pop(0)

    mock_db.observations.find = MagicMock(
        return_value=_ObsCursor([{"id": "t-1"}, {"id": "t-2"}])
    )

    report = await verify_threat_observation_convergence(mock_db)
    assert report.passed
    assert report.threats_total == 2
