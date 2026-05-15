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

        # --- Scenario 4: PATCH Mooney form re-runs auto-pairing ---
        from services.form_service import FormService

        ext_tpl = await db.form_templates.find_one(
            {"name": {"$regex": "^extruder settings sample$", "$options": "i"}}, {"_id": 0, "id": 1}
        )
        visc_tpl = await db.form_templates.find_one(
            {"name": {"$regex": "^mooney viscosity sample$", "$options": "i"}}, {"_id": 0, "id": 1}
        )
        if ext_tpl and visc_tpl:
            import uuid
            from datetime import datetime

            tag = f"_patch_pair_test_{uuid.uuid4().hex[:6]}"
            test_date = datetime(2026, 1, 9, 14, 30)
            ext_id = str(uuid.uuid4())
            await db.form_submissions.insert_one({
                "id": ext_id,
                "form_template_id": ext_tpl["id"],
                "form_template_name": "Extruder settings sample",
                "values": [
                    {"field_id": "date_&_time", "field_label": "Date & Time", "value": test_date.strftime("%Y-%m-%dT%H:%M")},
                ],
                "submitted_at": test_date,
                "_test_tag": tag,
            })
            visc_id = str(uuid.uuid4())
            await db.form_submissions.insert_one({
                "id": visc_id,
                "form_template_id": visc_tpl["id"],
                "form_template_name": "Mooney viscosity sample",
                "values": [
                    {"field_id": "date_&_time", "field_label": "Date & Time", "value": test_date.replace(hour=16, minute=0).strftime("%Y-%m-%dT%H:%M")},
                    {"field_id": "measurement", "field_label": "Measurement", "value": "60.0"},
                ],
                "submitted_at": test_date.replace(hour=16, minute=0),
                "_test_tag": tag,
            })
            try:
                r = await update_production_submission(
                    submission_id=visc_id,
                    data={"values": {"Measurement": "61.0"}},
                    current_user=user,
                )
                assert r["status"] == "updated"
                assert r["source"] == "form_submission"
                after = await db.form_submissions.find_one({"id": visc_id}, {"_id": 0, "values": 1})
                dt_val = next(
                    (v["value"] for v in after["values"] if v.get("field_id") == "date_&_time"),
                    "",
                )
                assert dt_val.endswith("T14:30"), f"expected pairing to move time to T14:30, got {dt_val}"
            finally:
                await db.form_submissions.delete_many({"_test_tag": tag})

    asyncio.run(_run())
