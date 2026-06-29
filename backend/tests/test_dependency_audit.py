"""Tests for dependency audit helpers."""
from services.dependency_audit import (
    count_vulnerabilities,
    dependency_audit_enabled,
    parse_pip_audit_report,
)


def test_count_vulnerabilities_sums_nested_entries():
    report = [
        {"name": "flask", "version": "0.5", "vulns": [{"id": "A"}, {"id": "B"}]},
        {"name": "requests", "version": "2.32.0", "vulns": []},
        {"name": "urllib3", "version": "2.0.0", "vulns": [{"id": "C"}]},
    ]
    assert count_vulnerabilities(report) == 3


def test_parse_pip_audit_report_empty_stdout():
    result = parse_pip_audit_report("")
    assert result.ok
    assert result.vulnerability_count == 0


def test_dependency_audit_enabled_defaults(monkeypatch):
    monkeypatch.delenv("RUN_DEPENDENCY_AUDIT", raising=False)
    assert dependency_audit_enabled("uat") is True
    assert dependency_audit_enabled("production") is True
    assert dependency_audit_enabled("development") is False


def test_dependency_audit_enabled_respects_override(monkeypatch):
    monkeypatch.setenv("RUN_DEPENDENCY_AUDIT", "false")
    assert dependency_audit_enabled("uat") is False
    monkeypatch.setenv("RUN_DEPENDENCY_AUDIT", "true")
    assert dependency_audit_enabled("development") is True
