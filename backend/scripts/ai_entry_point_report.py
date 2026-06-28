#!/usr/bin/env python3
"""AI entry point inventory — Convergence Program Phase 4 + Sprint 3/4 contract gates."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/ai-entry-point-report")
os.environ.setdefault("DB_NAME", "ai-entry-point-report")
os.environ.setdefault("JWT_SECRET_KEY", "ai-entry-point-report")
os.environ.setdefault("ENVIRONMENT", "test")

# Direct OpenAI imports allowed outside ai_gateway transport layer.
OPENAI_IMPORT_ALLOWLIST = {
    "services/ai_gateway.py",
    "services/openai_service.py",
    "services/image_analysis_service.py",
    "maintenance_strategy_generator.py",
}

# Grandfathered legacy bypass paths (tracked, not blocking CI growth).
OPENAI_IMPORT_BASELINE: set[str] = set()

# Sprint 4 — enforced surfaces must call contract finalization before return.
ENFORCED_CONTRACT_SURFACES: dict[str, str] = {
    "services/ai_risk_analysis.py": "AI Risk Analysis",
    "services/ril_copilot_service.py": "RIL Copilot",
    "services/pm_import/pm_import_recommendation.py": "PM Import AI Review",
    "services/maintenance_program_routes_operations.py": "Maintenance Program AI",
    "services/investigation_files.py": "Investigation Recommendations",
    "routes/ai_fm_suggestions.py": "Failure Mode Suggestions",
    "routes/reports.py": "Investigation AI Summary",
    "services/maintenance_routes_service.py": "Maintenance Strategy AI",
}

# Surfaces that must route through execute_grounded (or _call_grounded_json wrapper).
ENFORCED_GROUNDED_SURFACES: dict[str, str] = {
    "ai_risk_engine.py": "Observation risk / RCA / fault tree engine",
    "services/ai_execute_grounded.py": "Universal AI pipeline",
    "services/ai_risk_dashboard.py": "Executive dashboard intent AI",
    "services/ai_risk_analysis_chat.py": "Chat analyze",
    "services/insights_service.py": "Executive AI recommendations",
    "services/image_analysis_service.py": "Image vision damage analysis",
    "ai_helpers.py": "Chat attachment vision",
    "services/maintenance_scheduler_ai_service.py": "Scheduler AI plan",
    "services/production_dashboard_ops.py": "Production AI insights / machine analysis",
    "services/production_logs_service.py": "Production log AI parse",
    "routes/ai_extract.py": "Photo field extraction vision",
    "routes/forms.py": "Form document search AI",
    "routes/feedback.py": "Feedback agent prompt generation",
}

GROUNDED_MARKERS = (
    "execute_grounded(",
    "_call_grounded_json(",
)

CONTRACT_MARKERS = (
    "finalize_recommendation_response",
    "finalize_ai_recommendation_response",
    "_merge_grounded_contract",
)

PROMPT_CALL_RE = re.compile(
    r'execute_(?:json_prompt|prompt|grounded_prompt)\(\s*["\']([^"\']+)["\']'
)
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


def scan_enforced_grounded_surfaces() -> dict:
    violations: list[str] = []
    compliant: list[str] = []
    missing: list[str] = []

    for rel, label in sorted(ENFORCED_GROUNDED_SURFACES.items()):
        path = BACKEND_DIR / rel
        if not path.is_file():
            missing.append(f"{rel} ({label})")
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if any(marker in text for marker in GROUNDED_MARKERS):
            compliant.append(rel)
        else:
            violations.append(f"{rel} ({label})")

    return {
        "grounded_surface_count": len(ENFORCED_GROUNDED_SURFACES),
        "grounded_compliant": compliant,
        "grounded_violations": violations,
        "missing_grounded_files": missing,
    }


def scan_enforced_contract_surfaces() -> dict:
    """Sprint 4 — enforced AI surfaces must use contract finalization."""
    violations: list[str] = []
    compliant: list[str] = []
    missing_files: list[str] = []

    for rel, label in sorted(ENFORCED_CONTRACT_SURFACES.items()):
        path = BACKEND_DIR / rel
        if not path.is_file():
            missing_files.append(f"{rel} ({label})")
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if any(marker in text for marker in CONTRACT_MARKERS):
            compliant.append(rel)
        else:
            violations.append(f"{rel} ({label})")

    return {
        "enforced_surface_count": len(ENFORCED_CONTRACT_SURFACES),
        "contract_compliant": compliant,
        "contract_violations": violations,
        "missing_enforced_files": missing_files,
    }


def scan_unregistered_prompts() -> dict:
    """Flag execute_prompt calls with prompt IDs missing from the registry."""
    from services.ai_prompt_registry import list_prompts

    registered = set(list_prompts().keys())
    unregistered: list[str] = []
    seen: set[str] = set()

    for path in sorted(BACKEND_DIR.rglob("*.py")):
        if "/tests/" in path.as_posix():
            continue
        rel = _rel(path)
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in PROMPT_CALL_RE.finditer(text):
            prompt_id = match.group(1)
            key = f"{rel}:{prompt_id}"
            if prompt_id in registered or key in seen:
                continue
            seen.add(key)
            unregistered.append(key)

    return {
        "registered_prompt_count": len(registered),
        "unregistered_prompt_calls": sorted(unregistered),
    }


def build_report() -> dict:
    imports = scan_openai_imports()
    usage = scan_ai_gateway_usage()
    contract = scan_enforced_contract_surfaces()
    grounded = scan_enforced_grounded_surfaces()
    prompts = scan_unregistered_prompts()
    return {
        **imports,
        **usage,
        **contract,
        **grounded,
        **prompts,
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

    print(f"\nEnforced contract surfaces: {report['enforced_surface_count']}")
    print(f"  compliant: {len(report['contract_compliant'])}")
    if report["contract_violations"]:
        print("\nCONTRACT violations (enforced surfaces):")
        for rel in report["contract_violations"]:
            print(f"  - {rel}")
    if report["missing_enforced_files"]:
        print("\nMissing enforced surface files:")
        for rel in report["missing_enforced_files"]:
            print(f"  - {rel}")

    if report["unregistered_prompt_calls"]:
        print(f"\nUnregistered prompt calls ({len(report['unregistered_prompt_calls'])}):")
        for item in report["unregistered_prompt_calls"][:20]:
            print(f"  - {item}")
        if len(report["unregistered_prompt_calls"]) > 20:
            print(f"  ... and {len(report['unregistered_prompt_calls']) - 20} more")

    if report["violations"]:
        print("\nNEW OpenAI import violations:")
        for rel in report["violations"]:
            print(f"  - {rel}")
        return 1

    print(f"\nEnforced grounded surfaces: {report.get('grounded_surface_count', 0)}")
    print(f"  compliant: {len(report.get('grounded_compliant', []))}")
    if report.get("grounded_violations"):
        print("\nGROUNDED pipeline violations:")
        for rel in report["grounded_violations"]:
            print(f"  - {rel}")
    if report.get("missing_grounded_files"):
        print("\nMissing grounded surface files:")
        for rel in report["missing_grounded_files"]:
            print(f"  - {rel}")

    if report["contract_violations"] or report["missing_enforced_files"]:
        return 1

    if report.get("grounded_violations") or report.get("missing_grounded_files"):
        return 1

    if report["direct_openai_client"]:
        print("\nDirect OpenAI() client usage (review):")
        for rel in report["direct_openai_client"][:15]:
            print(f"  - {rel}")

    print("\nNo new OpenAI import or contract enforcement violations.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
