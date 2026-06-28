#!/usr/bin/env bash
# Multi-tenant proof sprint — second UAT tenant, cross-tenant pen test, edge backfill, full gates.
#
# Requires:
#   MONGO_URL, JWT_SECRET_KEY
#
# Optional:
#   DB_NAME=assetiq-UAT
#   PRIMARY_TENANT_ID=Tyromer
#
# Usage:
#   cd backend && MONGO_URL='...' JWT_SECRET_KEY='...' ./scripts/run_multi_tenant_proof_sprint.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_ROOT}"

export DB_NAME="${DB_NAME:-assetiq-UAT}"
export ENVIRONMENT="${ENVIRONMENT:-uat}"
export TENANT_STRICT_MODE="${TENANT_STRICT_MODE:-true}"
export BACKFILL_TENANT_ID="${BACKFILL_TENANT_ID:-Tyromer}"
export PRIMARY_TENANT_ID="${PRIMARY_TENANT_ID:-Tyromer}"
export TENANT_ID="${TENANT_ID:-${BACKFILL_TENANT_ID}}"

if [[ -z "${MONGO_URL:-}" ]]; then
  echo "ERROR: MONGO_URL is required" >&2
  exit 1
fi
if [[ -z "${JWT_SECRET_KEY:-}" ]]; then
  echo "ERROR: JWT_SECRET_KEY is required" >&2
  exit 1
fi

run() {
  echo ""
  echo "=== $* ==="
  python3 "$@"
}

echo "Multi-tenant proof sprint"
echo "  Database: ${DB_NAME}"
echo "  Primary tenant: ${PRIMARY_TENANT_ID}"
echo "  Commit: $(git -C "${BACKEND_ROOT}/.." rev-parse --short HEAD 2>/dev/null || echo unknown)"

run scripts/seed_uat_second_tenant_proof.py
PROOF_TENANT_ID="$(python3 -c "import json; print(json.load(open('../docs/platform/UAT_MULTI_TENANT_PROOF_MANIFEST.json'))['proof_tenant']['tenant_id'])")"
echo "Proof tenant ID: ${PROOF_TENANT_ID}"

run scripts/validate_tenant_onboarding.py --tenant-id "${PROOF_TENANT_ID}"
run scripts/run_cross_tenant_pen_test.py
run scripts/backfill_reliability_edge_tenant.py
run scripts/validate_tenant_onboarding.py --all

echo ""
echo "=== UAT post-deploy gates (primary tenant ${TENANT_ID}) ==="
"${SCRIPT_DIR}/run_uat_post_deploy_gates.sh"

echo ""
echo "OK: multi-tenant proof sprint completed"
