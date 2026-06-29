"""Shared pip-audit helpers for CI gates and runtime security checks."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROD_REQUIREMENTS = BACKEND_ROOT / "requirements.txt"
DEFAULT_REQUIREMENTS = PROD_REQUIREMENTS


@dataclass
class DependencyAuditResult:
    available: bool
    vulnerability_count: int
    package_count: int
    error: Optional[str] = None
    packages: Optional[List[Dict[str, Any]]] = None

    @property
    def ok(self) -> bool:
        return self.available and not self.error and self.vulnerability_count == 0


def count_vulnerabilities(report: Any) -> int:
    """Count vulnerability entries in pip-audit JSON output."""
    packages = _extract_dependency_entries(report)
    total = 0
    for package in packages:
        if not isinstance(package, dict):
            continue
        vulns = package.get("vulns") or []
        if isinstance(vulns, list):
            total += len(vulns)
    return total


def _extract_dependency_entries(report: Any) -> List[Any]:
    """Normalize pip-audit JSON to a list of dependency entries."""
    if isinstance(report, list):
        return report
    if isinstance(report, dict):
        dependencies = report.get("dependencies")
        if isinstance(dependencies, list):
            return dependencies
    return []


def parse_pip_audit_report(stdout: str) -> DependencyAuditResult:
    if not stdout.strip():
        return DependencyAuditResult(
            available=True,
            vulnerability_count=0,
            package_count=0,
            packages=[],
        )
    try:
        report = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return DependencyAuditResult(
            available=True,
            vulnerability_count=0,
            package_count=0,
            error=f"Failed to parse audit output: {exc}",
        )
    packages = _extract_dependency_entries(report)
    if not packages and report not in ([], {}):
        return DependencyAuditResult(
            available=True,
            vulnerability_count=0,
            package_count=0,
            error="Unexpected pip-audit JSON shape",
        )
    return DependencyAuditResult(
        available=True,
        vulnerability_count=count_vulnerabilities(report),
        package_count=len(packages),
        packages=packages,
    )


def run_pip_audit(
    requirements_path: Optional[Path] = None,
    *,
    timeout: int = 120,
) -> DependencyAuditResult:
    """Run pip-audit against a requirements file."""
    req_path = requirements_path or DEFAULT_REQUIREMENTS
    if not req_path.exists():
        return DependencyAuditResult(
            available=False,
            vulnerability_count=0,
            package_count=0,
            error=f"Requirements file not found: {req_path}",
        )
    try:
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "pip_audit",
                "-r",
                str(req_path),
                "--format",
                "json",
                "--progress-spinner",
                "off",
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        return DependencyAuditResult(
            available=False,
            vulnerability_count=0,
            package_count=0,
            error="pip-audit is not installed",
        )
    except subprocess.TimeoutExpired:
        return DependencyAuditResult(
            available=True,
            vulnerability_count=0,
            package_count=0,
            error=f"Dependency scan timed out after {timeout}s",
        )
    except Exception as exc:
        return DependencyAuditResult(
            available=False,
            vulnerability_count=0,
            package_count=0,
            error=str(exc),
        )

    if completed.returncode not in (0, 1):
        stderr = (completed.stderr or "").strip()
        return DependencyAuditResult(
            available=True,
            vulnerability_count=0,
            package_count=0,
            error=stderr or f"pip-audit exited with code {completed.returncode}",
        )

    parsed = parse_pip_audit_report(completed.stdout)
    if parsed.error:
        return parsed
    if completed.returncode == 1 and parsed.vulnerability_count == 0:
        stderr = (completed.stderr or "").strip()
        if stderr:
            return DependencyAuditResult(
                available=True,
                vulnerability_count=0,
                package_count=parsed.package_count,
                error=stderr,
            )
    return parsed


_AUDIT_CACHE: Tuple[Optional[DependencyAuditResult], float] = (None, 0.0)


def dependency_audit_cache_ttl_seconds() -> int:
    raw = os.environ.get("DEPENDENCY_AUDIT_CACHE_TTL", "3600")
    try:
        return max(0, int(raw))
    except ValueError:
        return 3600


def run_pip_audit_cached(
    requirements_path: Optional[Path] = None,
    *,
    timeout: int = 120,
    cache_ttl: Optional[int] = None,
) -> DependencyAuditResult:
    """Run pip-audit with an in-process TTL cache to avoid blocking every page load."""
    global _AUDIT_CACHE
    ttl = dependency_audit_cache_ttl_seconds() if cache_ttl is None else cache_ttl
    cached, cached_at = _AUDIT_CACHE
    if ttl > 0 and cached is not None and (time.time() - cached_at) < ttl:
        return cached
    result = run_pip_audit(requirements_path, timeout=timeout)
    if ttl > 0:
        _AUDIT_CACHE = (result, time.time())
    return result


def dependency_audit_enabled(default_environment: str) -> bool:
    """Whether runtime dependency audit should run for this environment."""
    import os

    raw = os.environ.get("RUN_DEPENDENCY_AUDIT")
    if raw is not None:
        return raw.lower() == "true"
    return default_environment.lower() in {"uat", "staging", "production"}
