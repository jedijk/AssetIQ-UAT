"""Shared pip-audit helpers for CI gates and runtime security checks."""
from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REQUIREMENTS = BACKEND_ROOT / "requirements.txt"


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
    if not isinstance(report, list):
        return 0
    total = 0
    for package in report:
        if not isinstance(package, dict):
            continue
        vulns = package.get("vulns") or []
        if isinstance(vulns, list):
            total += len(vulns)
    return total


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
    if not isinstance(report, list):
        return DependencyAuditResult(
            available=True,
            vulnerability_count=0,
            package_count=0,
            error="Unexpected pip-audit JSON shape",
        )
    return DependencyAuditResult(
        available=True,
        vulnerability_count=count_vulnerabilities(report),
        package_count=len(report),
        packages=report,
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


def dependency_audit_enabled(default_environment: str) -> bool:
    """Whether runtime dependency audit should run for this environment."""
    import os

    raw = os.environ.get("RUN_DEPENDENCY_AUDIT")
    if raw is not None:
        return raw.lower() == "true"
    return default_environment.lower() in {"uat", "staging", "production"}
