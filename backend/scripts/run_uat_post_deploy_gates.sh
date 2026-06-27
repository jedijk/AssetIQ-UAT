#!/usr/bin/env bash
# Run live UAT verification after deploy (observation/threat convergence + standard gates).
#
# Requires:
#   MONGO_URL          — Atlas URI for assetiq-UAT (read/write for --execute backfills)
#   JWT_SECRET_KEY     — required when ENVIRONMENT=uat
#
# Optional:
#   DB_NAME=assetiq-UAT
#   TENANT_ID=Tyromer   — scope convergence backfills to pilot tenant
#   BACKFILL_TENANT_ID=Tyromer
#
# Steps 4b–5a remediate legacy data gaps (tenant_id on scheduled_tasks, task_instance
# bridge) that otherwise fail verify_uat_gates / phase1 under TENANT_STRICT_MODE.
# Usage:
#   cd backend && MONGO_URL='...' JWT_SECRET_KEY='...' ./scripts/run_uat_post_deploy_gates.sh
#
# Exit 0 only if all eight steps pass.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_ROOT}"

export DB_NAME="${DB_NAME:-assetiq-UAT}"
export ENVIRONMENT="${ENVIRONMENT:-uat}"
export TENANT_STRICT_MODE="${TENANT_STRICT_MODE:-true}"
export BACKFILL_TENANT_ID="${BACKFILL_TENANT_ID:-Tyromer}"
TENANT_ID="${TENANT_ID:-${BACKFILL_TENANT_ID}}"

if [[ -z "${MONGO_URL:-}" ]]; then
  echo "ERROR: MONGO_URL is required (Atlas URI for ${DB_NAME})" >&2
  exit 1
fi

if [[ -z "${JWT_SECRET_KEY:-}" ]]; then
  echo "ERROR: JWT_SECRET_KEY is required when ENVIRONMENT=${ENVIRONMENT}" >&2
  exit 1
fi

run() {
  echo ""
  echo "=== $* ==="
  python3 "$@"
}

echo "UAT post-deploy gates"
echo "  Database: ${DB_NAME}"
echo "  Tenant:   ${TENANT_ID}"
echo "  Commit:   $(git -C "${BACKEND_ROOT}/.." rev-parse --short HEAD 2>/dev/null || echo unknown)"

run scripts/backfill_threat_observation_convergence.py --tenant-id "${TENANT_ID}" --execute
run scripts/verify_threat_observation_convergence.py --tenant-id "${TENANT_ID}"
run scripts/backfill_graph_threat_to_observation_edges.py --execute
run scripts/verify_reliability_graph_sync.py
run scripts/backfill_tenant_id.py --collections scheduled_tasks
run scripts/backfill_scheduled_task_instances.py
run scripts/verify_uat_gates.py
run scripts/phase1_data_integrity_report.py

echo ""
echo "OK: all UAT post-deploy gates passed"
