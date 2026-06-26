#!/usr/bin/env python3
"""AI entry point inventory — Convergence Program Phase 4."""
from __future__ import annotations

import re
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Direct OpenAI imports allowed outside ai_gateway transport layer.
OPENAI_IMPORT_ALLOWLIST = {
    "services/ai_gateway.py",
    "services/openai_service.py",
    "services/image_analysis_service.py",
    "maintenance_strategy_generator.py",
}

# Grandfathered legacy bypass paths (tracked, not blocking CI growth).
OPENAI_IMPORT_BASELINE: set[str] = set()

OPENAI_IMPORT_RE = re.compile(r"^\s*from\s+openai\s+import\b", re.MULTILINE)
AI_GATEWAY_RE = re.compile(r"\b(?:from\s+services\.ai_gateway\s+import|services\.ai_gateway\.)")
OPENAI_CLIENT_RE = re.compile(r"\bOpenAI\s*\(")


def _rel(path: Path) -> str:
    return path.relative_to(BACKEND_DIR).as_posix()


def scan_openai_imports() -> dict:
    violations: list[str] = []
    allowlisted: list[str] = []
    baseline: list[str] = []

    for path in sorted(BACKEND_DIR.rglob("*.py")):
        if "/tests/" in path.as_posix() or path.name == "__init__.py":
            continue
        rel = _rel(path)
        text = path.read_text(encoding="utf-8", errors="ignore")
        if not OPENAI_IMPORT_RE.search(text):
            continue
        if rel in OPENAI_IMPORT_ALLOWLIST:
            allowlisted.append(rel)
        elif rel in OPENAI_IMPORT_BASELINE:
            baseline.append(rel)
        else:
            violations.append(rel)

    return {
        "allowlisted": allowlisted,
        "baseline_bypasses": sorted(baseline),
        "violations": sorted(violations),
    }


def scan_ai_gateway_usage() -> dict:
    gateway_users: list[str] = []
    direct_client: list[str] = []

    for path in sorted(BACKEND_DIR.rglob("*.py")):
        if "/tests/" in path.as_posix() or path.name == "__init__.py":
            continue
        rel = _rel(path)
        if rel in OPENAI_IMPORT_ALLOWLIST:
            continue
        if rel.endswith("scripts/ai_entry_point_report.py"):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if AI_GATEWAY_RE.search(text):
            gateway_users.append(rel)
        if OPENAI_CLIENT_RE.search(text) and rel not in OPENAI_IMPORT_BASELINE:
            if "openai_service" not in rel and "ai_gateway" not in rel:
                direct_client.append(rel)

    return {
        "ai_gateway_users": sorted(gateway_users),
        "direct_openai_client": sorted(set(direct_client) - set(OPENAI_IMPORT_ALLOWLIST)),
    }


def build_report() -> dict:
    imports = scan_openai_imports()
    usage = scan_ai_gateway_usage()
    return {
        **imports,
        **usage,
        "gateway_user_count": len(usage["ai_gateway_users"]),
        "openai_bypass_count": len(imports["baseline_bypasses"]) + len(imports["violations"]),
    }


def main() -> int:
    report = build_report()
    print("=== AI Entry Point Report (Convergence 5 / Phase 4) ===")
    print(f"ai_gateway users: {report['gateway_user_count']}")
    print(f"OpenAI import allowlist: {len(report['allowlisted'])}")
    print(f"Legacy OpenAI bypasses (baseline): {len(report['baseline_bypasses'])}")
    for rel in report["baseline_bypasses"]:
        print(f"  - {rel}")
    if report["violations"]:
        print("\nNEW OpenAI import violations:")
        for rel in report["violations"]:
            print(f"  - {rel}")
        return 1
    if report["direct_openai_client"]:
        print("\nDirect OpenAI() client usage (review):")
        for rel in report["direct_openai_client"][:15]:
            print(f"  - {rel}")
    print("\nNo new OpenAI import violations.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
