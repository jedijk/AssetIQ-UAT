# UAT Multi-Tenant Proof Sprint

Prove two-tenant isolation on UAT Atlas (`assetiq-UAT`) under `TENANT_STRICT_MODE=true`.

## Prerequisites

- `MONGO_URL` — Atlas URI with read/write on `assetiq-UAT`
- `JWT_SECRET_KEY` — UAT backend secret
- Primary tenant `Tyromer` already gated (2026-06-27 baseline)

## One-command sprint

```bash
cd backend && \
  MONGO_URL='...' JWT_SECRET_KEY='...' DB_NAME=assetiq-UAT \
  TENANT_STRICT_MODE=true BACKFILL_TENANT_ID=Tyromer PRIMARY_TENANT_ID=Tyromer \
  ./scripts/run_multi_tenant_proof_sprint.sh
```

## What it does

1. **Seed Tenant B** (`uat-proof-b`) with minimal lifecycle data across 11 entity types
2. **Validate onboarding** for proof tenant
3. **Cross-tenant pen test** — Tyromer ↔ Tenant B cannot read each other's IDs
4. **Backfill graph edges** — stamp `tenant_id` on `reliability_edges` (1936-gap remediation)
5. **Validate all tenants** in registry
6. **Re-run full UAT gate bundle** (9 steps, Tyromer-scoped convergence + global integrity)

## Individual steps

```bash
python scripts/seed_uat_second_tenant_proof.py
python scripts/run_cross_tenant_pen_test.py
python scripts/backfill_reliability_edge_tenant.py
python scripts/validate_tenant_onboarding.py --all
./scripts/run_uat_post_deploy_gates.sh
```

## Evidence

- Manifest: `docs/platform/UAT_MULTI_TENANT_PROOF_MANIFEST.json`
- Audit section: `PLATFORM_TRUTH_AUDIT_2026-06-27.md` §18
- Unit tests: `tests/test_multi_tenant_pen_test.py`

## Proof tenant credentials

After seed, admin email is `uat-proof-b-admin@assetiq-uat.internal`. Temp password is printed once by `create_tenant` when the tenant is first created (or reset via owner UI).
