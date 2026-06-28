#!/usr/bin/env bash
# Platform truth audit — code gates + optional live UAT verification.
#
# Local (no Atlas):
#   cd backend && ./scripts/run_platform_truth_audit.sh --local
#
# Full audit (requires MONGO_URL + JWT_SECRET_KEY for assetiq-UAT):
#   cd backend && MONGO_URL=... JWT_SECRET_KEY=... ./scripts/run_platform_truth_audit.sh
#
# Exit 0 only if all executed phases pass.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"
cd "${BACKEND_ROOT}"

LOCAL_ONLY=false
if [[ "${1:-}" == "--local" ]]; then
  LOCAL_ONLY=true
fi

COMMIT="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FAILED=()

run_local() {
  local label="$1"
  shift
  echo ""
  echo "=== ${label} ==="
  if "$@"; then
    echo "PASS: ${label}"
  else
    echo "FAIL: ${label}" >&2
    FAILED+=("${label}")
  fi
}

echo "Platform Truth Audit"
echo "  Commit: ${COMMIT}"
echo "  Time:   ${TS}"
echo "  Mode:   $([[ "${LOCAL_ONLY}" == true ]] && echo local-only || echo local+uat)"

# --- Local code gates (no live Atlas) ---
LOCAL_ENV=(MONGO_URL=mongodb://localhost:27017/test DB_NAME=test JWT_SECRET_KEY=test-secret ENVIRONMENT=test)

run_local "tenant_service_filter_audit" env "${LOCAL_ENV[@]}" python3 scripts/tenant_service_filter_audit.py
run_local "verify_platform_standards" env "${LOCAL_ENV[@]}" python3 scripts/verify_platform_standards.py
run_local "ai_entry_point_report" env "${LOCAL_ENV[@]}" python3 scripts/ai_entry_point_report.py
run_local "graph_coverage_report" env "${LOCAL_ENV[@]}" python3 scripts/graph_coverage_report.py
run_local "verify_canonical_models" env "${LOCAL_ENV[@]}" python3 scripts/verify_canonical_models.py
run_local "verify_read_models_registry" env "${LOCAL_ENV[@]}" python3 scripts/verify_read_models_registry.py
# WS7 harness only — skip micro benchmark unless caller exports MONGO_URL for Atlas
run_local "verify_graph_performance_benchmarks" env -u MONGO_URL DB_NAME=test JWT_SECRET_KEY=test-secret ENVIRONMENT=test \
  python3 scripts/verify_graph_performance_benchmarks.py
run_local "verify_reliability_graph_sync_static" env "${LOCAL_ENV[@]}" python3 scripts/verify_reliability_graph_sync.py
run_local "route_auth_inventory" python3 scripts/route_auth_inventory.py --json /dev/null
run_local "check_frontend_imports" bash "${REPO_ROOT}/scripts/check_frontend_imports.sh"
run_local "pytest_core" env "${LOCAL_ENV[@]}" TENANT_STRICT_MODE=true \
  python3 -m pytest tests/test_auth_matrix.py tests/test_architecture_convergence.py \
  tests/test_platform_standards.py tests/test_multi_tenant_pen_test.py \
  tests/test_tenant_isolation.py tests/test_cross_tenant_regression.py -q
run_local "verify_frontend_unit_tests" python3 scripts/verify_frontend_unit_tests.py

if [[ "${LOCAL_ONLY}" == true ]]; then
  echo ""
  if ((${#FAILED[@]})); then
    echo "FAILED local gates: ${FAILED[*]}" >&2
    exit 2
  fi
  echo "OK: local platform truth audit passed"
  exit 0
fi

# --- Live UAT gates ---
if [[ -z "${MONGO_URL:-}" ]]; then
  echo "ERROR: MONGO_URL required for UAT phase (or use --local)" >&2
  exit 1
fi
if [[ -z "${JWT_SECRET_KEY:-}" ]]; then
  echo "ERROR: JWT_SECRET_KEY required for UAT phase" >&2
  exit 1
fi

export DB_NAME="${DB_NAME:-assetiq-UAT}"
export ENVIRONMENT="${ENVIRONMENT:-uat}"
export TENANT_STRICT_MODE="${TENANT_STRICT_MODE:-true}"
export BACKFILL_TENANT_ID="${BACKFILL_TENANT_ID:-Tyromer}"
export TENANT_ID="${TENANT_ID:-${BACKFILL_TENANT_ID}}"

run_local "cross_tenant_pen_test" python3 scripts/run_cross_tenant_pen_test.py
run_local "validate_tenant_onboarding" python3 scripts/validate_tenant_onboarding.py --all
run_local "uat_post_deploy_gates" "${SCRIPT_DIR}/run_uat_post_deploy_gates.sh"
run_local "uat_audit_milestone" python3 scripts/run_uat_audit_milestone.py --verify-only
run_local "audit_maturity_scorecard" python3 scripts/audit_maturity_scorecard.py

echo ""
if ((${#FAILED[@]})); then
  echo "FAILED: ${FAILED[*]}" >&2
  exit 2
fi
echo "OK: full platform truth audit passed"
exit 0
