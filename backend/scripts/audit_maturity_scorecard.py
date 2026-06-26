#!/usr/bin/env python3
"""
Compute audit maturity scorecard from verifiable gates (code + optional live UAT).

Target milestone: 9.0 / 10 (90%) on every dimension where UAT/code evidence exists.

    cd backend && MONGO_URL=... DB_NAME=assetiq-UAT ENVIRONMENT=uat python3 scripts/audit_maturity_scorecard.py

Exit codes:
  0 — all scored dimensions >= 9.0
  1 — configuration error
  2 — one or more dimensions below 9.0
"""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

TARGET = 9.0


@dataclass
class DimensionScore:
    name: str
    score: float
    max_score: float
    evidence: str
    not_tested: bool = False

    @property
    def pct(self) -> float:
        return round(100.0 * self.score / self.max_score, 1) if self.max_score else 0.0

    @property
    def meets_target(self) -> bool:
        return self.score >= TARGET


def _run_script(name: str, env: dict | None = None) -> tuple[bool, str]:
    script = SCRIPTS_DIR / name
    if not script.is_file():
        return False, f"missing script {name}"
    merged = os.environ.copy()
    if env:
        merged.update(env)
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(BACKEND_DIR),
        env=merged,
        capture_output=True,
        text=True,
        check=False,
    )
    ok = result.returncode == 0
    tail = (result.stdout or result.stderr or "").strip().splitlines()
    summary = tail[-1] if tail else f"exit {result.returncode}"
    return ok, summary


def _code_gate_scores() -> list[DimensionScore]:
    env = {
        "MONGO_URL": os.environ.get("MONGO_URL", "mongodb://localhost:27017/test"),
        "DB_NAME": os.environ.get("DB_NAME", "test"),
        "JWT_SECRET_KEY": os.environ.get("JWT_SECRET_KEY", "scorecard-script"),
        "ENVIRONMENT": "test",
    }
    scores: list[DimensionScore] = []

    tenant_ok, tenant_ev = _run_script("tenant_service_filter_audit.py", env)
    scores.append(DimensionScore(
        "Tenant isolation (code gate)",
        10.0 if tenant_ok else 3.0,
        10.0,
        tenant_ev,
    ))

    platform_ok, platform_ev = _run_script("verify_platform_standards.py", env)
    scores.append(DimensionScore(
        "Platform standards (WS8)",
        10.0 if platform_ok else 2.0,
        10.0,
        platform_ev,
    ))

    graph_static_ok, graph_ev = _run_script("verify_reliability_graph_sync.py", env)
    scores.append(DimensionScore(
        "Graph sync (static code gate)",
        10.0 if graph_static_ok else 2.0,
        10.0,
        graph_ev,
    ))

    coverage_ok, coverage_ev = _run_script("graph_coverage_report.py", env)
    scores.append(DimensionScore(
        "Graph handler coverage",
        10.0 if coverage_ok else 5.0,
        10.0,
        coverage_ev,
    ))

    ai_ok, ai_ev = _run_script("ai_entry_point_report.py", env)
    scores.append(DimensionScore(
        "AI platform entry points",
        10.0 if ai_ok else 4.0,
        10.0,
        ai_ev,
    ))

    return scores


async def _uat_data_scores() -> list[DimensionScore]:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "assetiq-UAT").strip('"')
    env_uat = os.environ.get("ENVIRONMENT", "").lower()

    if not mongo_url or env_uat not in ("uat", "staging"):
        return [
            DimensionScore("UAT data integrity", 0, 10, "NOT TESTED — set MONGO_URL + ENVIRONMENT=uat", not_tested=True),
            DimensionScore("UAT verification gates", 0, 10, "NOT TESTED", not_tested=True),
            DimensionScore("Graph sync (UAT DB sample)", 0, 10, "NOT TESTED", not_tested=True),
            DimensionScore("Tenancy report (UAT)", 0, 10, "NOT TESTED", not_tested=True),
            DimensionScore("Strict mode cutover (UAT)", 0, 10, "NOT TESTED", not_tested=True),
        ]

    os.environ.setdefault("JWT_SECRET_KEY", "scorecard-script")
    os.environ.setdefault("REQUIRE_JWT_SECRET_KEY", "false")

    from motor.motor_asyncio import AsyncIOMotorClient
    import database

    client = AsyncIOMotorClient(mongo_url)
    database.db = client[db_name]

    scores: list[DimensionScore] = []

    # 1A unbridged scheduled tasks
    bridged_ids: set[str] = set()
    async for row in database.db.task_instances.find(
        {"scheduled_task_id": {"$exists": True, "$nin": [None, ""]}},
        {"scheduled_task_id": 1},
    ):
        sid = row.get("scheduled_task_id")
        if sid:
            bridged_ids.add(str(sid))

    unbridged = 0
    async for st in database.db.scheduled_tasks.find(
        {"status": {"$nin": ["completed", "cancelled"]}},
        {"id": 1, "_id": 1},
    ):
        st_id = st.get("id") or str(st.get("_id", ""))
        if st_id and st_id not in bridged_ids:
            unbridged += 1

    bridge_score = 10.0 if unbridged == 0 else max(1.0, 10.0 - min(unbridged / 25.0, 9.0))
    scores.append(DimensionScore(
        "Scheduled task bridge (UAT)",
        round(bridge_score, 1),
        10.0,
        f"unbridged open scheduled_tasks={unbridged}",
    ))

    # Failure mode library gap
    from failure_modes import FAILURE_MODES_LIBRARY

    mongo_fms = await database.db.failure_modes.count_documents({})
    static_count = len(FAILURE_MODES_LIBRARY)
    fm_gap = max(0, static_count - mongo_fms)
    fm_score = 10.0 if fm_gap == 0 else max(1.0, 10.0 - min(fm_gap / 15.0, 9.0))
    scores.append(DimensionScore(
        "Failure mode library (UAT)",
        round(fm_score, 1),
        10.0,
        f"mongo={mongo_fms} static={static_count} gap={fm_gap}",
    ))

    client.close()

    # Subprocess gates on live UAT
    uat_env = {
        "MONGO_URL": mongo_url,
        "DB_NAME": db_name,
        "ENVIRONMENT": "uat",
        "JWT_SECRET_KEY": os.environ.get("JWT_SECRET_KEY", "scorecard-script"),
    }
    phase1_ok, phase1_ev = _run_script("phase1_data_integrity_report.py", uat_env)
    scores.append(DimensionScore(
        "Phase 1 data integrity report",
        10.0 if phase1_ok else 3.0,
        10.0,
        phase1_ev,
    ))

    gates_ok, gates_ev = _run_script("verify_uat_gates.py", uat_env)
    scores.append(DimensionScore(
        "UAT verification gates",
        10.0 if gates_ok else 3.0,
        10.0,
        gates_ev,
    ))

    graph_uat_ok, graph_uat_ev = _run_script("verify_reliability_graph_sync.py", uat_env)
    scores.append(DimensionScore(
        "Graph sync (UAT DB sample)",
        10.0 if graph_uat_ok else 3.0,
        10.0,
        graph_uat_ev,
    ))

    tenancy_ok, tenancy_ev = _run_script("phase2_tenancy_report.py", uat_env)
    scores.append(DimensionScore(
        "Tenancy report (UAT)",
        10.0 if tenancy_ok else 4.0,
        10.0,
        tenancy_ev,
    ))

    strict_ok, strict_ev = _run_script("strict_mode_cutover_check.py", uat_env)
    scores.append(DimensionScore(
        "Strict mode cutover (UAT)",
        10.0 if strict_ok else 4.0,
        10.0,
        strict_ev,
    ))

    return scores


def _frontend_unit_test_score() -> DimensionScore:
    """Score from verify_frontend_unit_tests.py (lib coverage + CI execution)."""
    ok, summary = _run_script("verify_frontend_unit_tests.py")
    if ok:
        return DimensionScore(
            "Frontend unit test coverage",
            10.0,
            10.0,
            summary,
        )

    lib_match = re.search(r"lib=(\d+)/(\d+)", summary)
    suites_match = re.search(r"suites=(\d+)", summary)
    tests_match = re.search(r"tests=(\d+)", summary)
    lib_ratio = 0.0
    if lib_match:
        tested, total = int(lib_match.group(1)), int(lib_match.group(2))
        lib_ratio = tested / total if total else 0.0
    suites = int(suites_match.group(1)) if suites_match else 0
    tests = int(tests_match.group(1)) if tests_match else 0

    lib_pts = min(4.0, (lib_ratio / 0.85) * 4.0) if lib_ratio else 0.0
    suite_pts = min(3.0, (suites / 30.0) * 3.0)
    test_pts = min(3.0, (tests / 200.0) * 3.0)
    score = round(min(9.5, lib_pts + suite_pts + test_pts), 1)

    return DimensionScore(
        "Frontend unit test coverage",
        score,
        10.0,
        summary,
    )


def _infra_ceiling_scores() -> list[DimensionScore]:
    """Dimensions that cannot reach 9.0 from UAT data fixes alone."""
    return [
        DimensionScore(
            "Scalability (Redis/K8s/multi-replica)",
            4.0, 10.0,
            "Requires infra — not UAT-script addressable",
            not_tested=True,
        ),
        DimensionScore(
            "Enterprise certification (SOC2/NIS2)",
            3.0, 10.0,
            "External audit — not UAT-script addressable",
            not_tested=True,
        ),
        _frontend_unit_test_score(),
    ]


def print_scorecard(scores: list[DimensionScore]) -> None:
    print("=== AssetIQ Audit Maturity Scorecard ===")
    print(f"Target: {TARGET:.1f} / 10 on all UAT-addressable dimensions\n")
    below: list[str] = []
    for row in scores:
        flag = "OK" if row.meets_target else ("SKIP" if row.not_tested else "BELOW")
        print(f"  [{flag:5}] {row.name:40} {row.score:4.1f}/10  ({row.pct:5.1f}%)  {row.evidence}")
        if not row.not_tested and not row.meets_target:
            below.append(row.name)

    tested = [s for s in scores if not s.not_tested]
    if tested:
        avg = sum(s.score for s in tested) / len(tested)
        print(f"\nAverage (tested dimensions): {avg:.1f}/10")
    if below:
        print(f"\nBelow target ({TARGET}): {', '.join(below)}")


async def main() -> int:
    scores = _code_gate_scores()
    scores.extend(await _uat_data_scores())
    scores.extend(_infra_ceiling_scores())
    print_scorecard(scores)

    uat_testable = [s for s in scores if not s.not_tested]
    if any(s.not_tested and "NOT TESTED" in s.evidence for s in scores[:10]):
        print("\nNOTE: Connect UAT Atlas (MONGO_URL + ENVIRONMENT=uat) to score live data dimensions.")
    if not uat_testable:
        return 1
    if all(s.meets_target for s in uat_testable):
        print("\nOK: all tested dimensions meet 9.0 target")
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
