"""Tests for dependency audit helpers."""
import json

from services.dependency_audit import (
    DependencyAuditResult,
    count_vulnerabilities,
    dependency_audit_enabled,
    parse_pip_audit_report,
    run_pip_audit_cached,
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


def test_parse_pip_audit_report_manifest_shape():
    report = {
        "dependencies": [
            {"name": "flask", "version": "0.5", "vulns": [{"id": "A"}, {"id": "B"}]},
            {"name": "requests", "version": "2.32.0", "vulns": []},
            {"name": "legacy-pkg", "skip_reason": "could not resolve"},
        ],
        "fixes": [],
    }
    result = parse_pip_audit_report(json.dumps(report))
    assert result.error is None
    assert result.package_count == 3
    assert result.vulnerability_count == 2


def test_parse_pip_audit_report_legacy_list_shape():
    report = [
        {"name": "urllib3", "version": "2.0.0", "vulns": [{"id": "C"}]},
    ]
    result = parse_pip_audit_report(json.dumps(report))
    assert result.error is None
    assert result.package_count == 1
    assert result.vulnerability_count == 1


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


def test_run_pip_audit_cached_reuses_result(monkeypatch):
    calls = {"count": 0}

    def fake_run_pip_audit(*_args, **_kwargs):
        calls["count"] += 1
        return DependencyAuditResult(
            available=True,
            vulnerability_count=0,
            package_count=3,
        )

    monkeypatch.setattr(
        "services.dependency_audit.run_pip_audit",
        fake_run_pip_audit,
    )
    monkeypatch.setenv("DEPENDENCY_AUDIT_CACHE_TTL", "3600")

    first = run_pip_audit_cached(timeout=25)
    second = run_pip_audit_cached(timeout=25)

    assert first.package_count == 3
    assert second.package_count == 3
    assert calls["count"] == 1
