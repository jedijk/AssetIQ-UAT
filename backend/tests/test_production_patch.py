"""Regression tests for production submission PATCH supporting both
form_submissions and production_logs (all scenarios in one event loop to
avoid motor event-loop binding issues)."""
import asyncio
import sys

sys.path.insert(0, "/app/backend")

from database import db


def test_patch_production_submission_all_scenarios():
    async def _run():
        from fastapi import HTTPException
        from routes.production import update_production_submission

        class _U(dict):
            pass

        user = _U(id="test-user")

        # --- Scenario 1: production_logs mooney_viscosity update ---
        entry = await db.production_logs.find_one({}, {"_id": 0, "id": 1, "mooney_viscosity": 1, "metrics": 1})
        if entry:
            original_visc = entry.get("mooney_viscosity")
            original_metrics = dict(entry.get("metrics") or {})

            r = await update_production_submission(
                submission_id=entry["id"],
                data={"values": {"Measurement": "77.77"}},
                current_user=user,
            )
            assert r["status"] == "updated"
            assert r["source"] == "production_log"
            after = await db.production_logs.find_one({"id": entry["id"]}, {"_id": 0, "mooney_viscosity": 1})
            assert after["mooney_viscosity"] == 77.77

            # --- Scenario 2: production_logs metrics update ---
            r = await update_production_submission(
                submission_id=entry["id"],
                data={"values": {"RPM": "123.4", "FEED": "222"}},
                current_user=user,
            )
            assert r["matched_fields"] >= 2
            after = await db.production_logs.find_one({"id": entry["id"]}, {"_id": 0, "metrics": 1})
            assert after["metrics"]["RPM"] == 123.4
            assert after["metrics"]["FEED"] == 222.0

            # Restore
            await db.production_logs.update_one(
                {"id": entry["id"]},
                {"$set": {"mooney_viscosity": original_visc, "metrics": original_metrics}},
            )

        # --- Scenario 3: non-existent ID raises 404 ---
        raised = None
        try:
            await update_production_submission(
                submission_id="definitely-not-real-abc123",
                data={"values": {"Measurement": "1.0"}},
                current_user=user,
            )
        except HTTPException as e:
            raised = e.status_code
        assert raised == 404

    asyncio.run(_run())
