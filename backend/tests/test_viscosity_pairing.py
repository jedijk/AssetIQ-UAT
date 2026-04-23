"""Regression test for Mooney viscosity → Extruder auto-pairing.

Runs all scenarios in one asyncio.run() to avoid motor event-loop binding issues.
"""
import asyncio
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")

from database import db
from services.form_service import FormService


def _visc_doc(visc_id: str, when: datetime):
    return {
        "id": visc_id,
        "form_template_id": None,  # filled below
        "values": [
            {"field_id": "date_&_time", "field_label": "Date & Time", "value": when.strftime("%Y-%m-%dT%H:%M")},
            {"field_id": "measurement", "field_label": "Measurement", "value": "65.0"},
        ],
        "submitted_at": when,
    }


def test_viscosity_pairing():
    async def _run():
        svc = FormService(db)

        # Resolve templates
        ext_tpl = await db.form_templates.find_one({"name": {"$regex": "^extruder settings sample$", "$options": "i"}}, {"_id": 0, "id": 1})
        visc_tpl = await db.form_templates.find_one({"name": {"$regex": "^mooney viscosity sample$", "$options": "i"}}, {"_id": 0, "id": 1})
        assert ext_tpl and visc_tpl, "Templates not seeded"

        # Use a date far in the past so we don't collide with real data
        test_date = datetime(2026, 1, 5)
        tag = f"_pairing_test_{uuid.uuid4().hex[:6]}"

        async def _mk_ext(when: datetime):
            eid = str(uuid.uuid4())
            await db.form_submissions.insert_one({
                "id": eid,
                "form_template_id": ext_tpl["id"],
                "values": [
                    {"field_id": "date_&_time", "field_label": "Date & Time", "value": when.strftime("%Y-%m-%dT%H:%M")},
                    {"field_id": "rpm", "field_label": "RPM", "value": "500"},
                ],
                "submitted_at": when,
                "_test_tag": tag,
            })
            return eid

        async def _mk_visc(when: datetime):
            vid = str(uuid.uuid4())
            doc = {
                "id": vid,
                "form_template_id": visc_tpl["id"],
                "values": [
                    {"field_id": "date_&_time", "field_label": "Date & Time", "value": when.strftime("%Y-%m-%dT%H:%M")},
                    {"field_id": "measurement", "field_label": "Measurement", "value": "65.0"},
                ],
                "submitted_at": when,
                "_test_tag": tag,
            }
            await db.form_submissions.insert_one(doc)
            return vid, doc

        async def _dt_value(sub_id: str) -> str:
            s = await db.form_submissions.find_one({"id": sub_id}, {"_id": 0, "values": 1})
            for v in s["values"]:
                if v.get("field_id") == "date_&_time":
                    return v["value"]
            return ""

        try:
            # ── Case 1: one orphan extruder → pair ──
            ext_a = await _mk_ext(test_date.replace(hour=14, minute=30))
            vid, vdoc = await _mk_visc(test_date.replace(hour=14, minute=45))
            await svc._auto_pair_viscosity_to_extruder(vdoc)
            got = await _dt_value(vid)
            assert got.endswith("T14:30"), f"Case 1 expected T14:30, got {got}"

            # ── Case 2: no orphan → no change ──
            # Add a viscosity at 15:00 to pair with nothing; no extruder exists at <=15:00 unpaired
            # Reset: mark ext_a as already-paired via our new viscosity above. Now submit another viscosity.
            vid2, vdoc2 = await _mk_visc(test_date.replace(hour=16, minute=0))
            await svc._auto_pair_viscosity_to_extruder(vdoc2)
            got2 = await _dt_value(vid2)
            assert got2.endswith("T16:00"), f"Case 2 expected T16:00 (no pair), got {got2}"

            # ── Case 3: multiple orphans → latest wins ──
            await _mk_ext(test_date.replace(hour=10, minute=0))
            await _mk_ext(test_date.replace(hour=11, minute=30))
            await _mk_ext(test_date.replace(hour=12, minute=15))
            vid3, vdoc3 = await _mk_visc(test_date.replace(hour=12, minute=45))
            await svc._auto_pair_viscosity_to_extruder(vdoc3)
            got3 = await _dt_value(vid3)
            assert got3.endswith("T12:15"), f"Case 3 expected T12:15, got {got3}"

            # ── Case 4: orphan on different date → no pair ──
            # Extruder yesterday; viscosity today
            other_day = datetime(2026, 1, 6, 9, 0)
            await _mk_ext(other_day.replace(hour=9, minute=0))  # different day
            vid4, vdoc4 = await _mk_visc(datetime(2026, 1, 7, 10, 0))  # yet another day
            await svc._auto_pair_viscosity_to_extruder(vdoc4)
            got4 = await _dt_value(vid4)
            assert got4.endswith("T10:00"), f"Case 4 expected T10:00 (no cross-date pair), got {got4}"

            return "ok"
        finally:
            # Cleanup
            await db.form_submissions.delete_many({"_test_tag": tag})

    assert asyncio.run(_run()) == "ok"
