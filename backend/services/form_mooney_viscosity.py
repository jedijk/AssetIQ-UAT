"""Mooney viscosity → extruder auto-pairing for production log alignment."""
from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

class MooneyViscosityPairing:
    """Pairs Mooney viscosity form submissions to extruder samples on the same day."""

    def __init__(self, db):
        self.db = db
        self.submissions = db["form_submissions"]

    @staticmethod
    def is_mooney_viscosity_submission(sub: Dict[str, Any]) -> bool:
            """True when submission is a Mooney viscosity sample form (name may include version suffix)."""
            tpl = (sub.get("form_template_name") or "").strip().lower()
            return "mooney" in tpl and ("viscos" in tpl or "sample" in tpl)

    async def try_auto_pair_mooney_viscosity(self, visc_doc: Dict[str, Any]) -> None:
            """Run Mooney → Extruder pairing when applicable; logs and swallows errors (non-blocking)."""
            if not self.is_mooney_viscosity_submission(visc_doc):
                return
            try:
                await self.auto_pair_viscosity_to_extruder(visc_doc)
            except Exception as e:
                logger.warning(f"Viscosity auto-pair failed for submission {visc_doc.get('id')}: {e}")

    async def try_auto_pair_mooney_viscosity_by_id(self, submission_id: str) -> None:
            """Reload submission by id and run pairing if it is a Mooney viscosity form."""
            sub = await self.submissions.find_one({"id": submission_id}, {"_id": 0})
            if sub:
                await self.try_auto_pair_mooney_viscosity(sub)

    async def auto_pair_viscosity_to_extruder(self, visc_doc: Dict[str, Any], dry_run: bool = False) -> Optional[Dict[str, Any]]:
            """When a Mooney Viscosity sample is submitted, back-date its Date & Time to
            match the latest 'orphan' Extruder sample on the same date that still shows
            TBD (no viscosity paired at that HH:MM). This ensures the two show on the
            same row in the Production Log / Dashboard.

            Silent no-op when no candidate is found.
            """
            from dateutil import parser as _date_parser

            def _extract_dt(sub: Dict) -> Optional[datetime]:
                """Extract the effective sample datetime for pairing.

                Preference order:
                - Date/Time field in `values`
                - submitted_at
                - created_at

                Heuristic:
                Some production templates default their Date/Time field to midnight (00:00)
                even when the operator submits at the real sample time. When the values
                datetime looks like a default midnight but submitted_at is clearly later
                on the same day, prefer submitted_at to avoid false "exact time" matches.
                """

                dt_from_values = None

                # Try "Date & Time" (or similar) in values first
                for v in sub.get("values", []) or []:
                    label = str(v.get("field_label", "")).strip().lower()
                    fid = str(v.get("field_id", "")).strip().lower()
                    is_dt_like = (
                        ("date" in label and "time" in label)
                        or ("date/time" in label)
                        or ("datetime" in label)
                        or (fid.replace("_", " ").strip() == "date & time")
                        or (fid == "date_&_time")
                    )
                    if is_dt_like:
                        raw = v.get("value")
                        if raw:
                            try:
                                dt_from_values = _date_parser.parse(str(raw))
                                break
                            except Exception:
                                pass

                def _parse_dt(v) -> Optional[datetime]:
                    if isinstance(v, datetime):
                        return v
                    if not v:
                        return None
                    try:
                        return _date_parser.parse(str(v).replace("Z", "+00:00"))
                    except Exception:
                        return None

                dt_submitted = _parse_dt(sub.get("submitted_at"))
                dt_created = _parse_dt(sub.get("created_at"))
                dt_fallback = dt_submitted or dt_created

                if dt_from_values and dt_submitted:
                    # If values datetime is midnight but submitted time is later same-day,
                    # treat it as a defaulted field and use submitted_at.
                    try:
                        if (
                            dt_from_values.date() == dt_submitted.date()
                            and dt_from_values.hour == 0
                            and dt_from_values.minute == 0
                            and (dt_submitted.hour != 0 or dt_submitted.minute != 0)
                            and abs((dt_submitted - dt_from_values).total_seconds()) >= 2 * 3600
                        ):
                            return dt_submitted
                    except Exception:
                        pass

                return dt_from_values or dt_fallback

            def _extract_measurement(sub: Dict) -> Optional[float]:
                # Best-effort extraction of the viscosity measurement value from the submission values.
                # The production route is label-based and templates vary, so accept common variants.
                for v in sub.get("values", []) or []:
                    label = str(v.get("field_label", "")).strip().lower()
                    fid = str(v.get("field_id", "")).strip().lower()
                    if any(k in label for k in ("measurement", "mooney", "viscos")) or fid in ("measurement", "mooney", "viscosity"):
                        raw = v.get("value")
                        if raw in (None, ""):
                            continue
                        try:
                            return float(raw)
                        except (ValueError, TypeError):
                            continue
                return None

            visc_dt = _extract_dt(visc_doc)
            if not visc_dt:
                logger.info(
                    f"[Viscosity Auto-Pair] skip: cannot extract datetime from visc={str(visc_doc.get('id',''))[:8]}"
                )
                return {"status": "skip", "reason": "no_visc_datetime"}

            # Date window: same calendar day (local time — use naive date from parsed value)
            day = visc_dt.date()
            day_start = datetime.combine(day, datetime.min.time())
            day_end = datetime.combine(day, datetime.max.time())

            # Find ALL Extruder Settings and Mooney viscosity templates.
            #
            # Production naming often includes versions, line names, or suffixes:
            # - "Extruder Settings v16"
            # - "Extruder settings sample"
            # - "Mooney viscosity sample"
            # - "Mooney Viscosity v2"
            #
            # Match broadly but still specific enough to avoid accidental cross-template pairing.
            # NOTE: use a single backslash in the regex. `r"extruder\\s*..."` is WRONG:
            # it becomes the literal pattern `extruder\s...` (broken matching).
            extruder_tpls = await self.db.form_templates.find(
                {"name": {"$regex": r"extruder\s*settings", "$options": "i"}},
            ).to_list(200)
            visc_tpls = await self.db.form_templates.find(
                {"name": {"$regex": r"mooney.*(viscos|sample)", "$options": "i"}},
            ).to_list(200)

            if not extruder_tpls:
                logger.info(
                    f"[Viscosity Auto-Pair] skip: no extruder templates found for day={day} visc={str(visc_doc.get('id',''))[:8]}"
                )
                return {"status": "skip", "reason": "no_extruder_templates", "day": str(day)}

            # Collect all possible template ID formats (UUID 'id' field and ObjectId '_id')
            def _add_template_id_variants(out: list, raw_id: Any):
                """Add both string and ObjectId variants when possible.

                Some environments store `form_template_id` as a string, others as an actual ObjectId.
                We include both so $in matches regardless of storage type.
                """
                if not raw_id:
                    return
                try:
                    s = str(raw_id)
                except Exception:
                    return
                if s not in out:
                    out.append(s)
                try:
                    from bson import ObjectId as _OID
                    if _OID.is_valid(s):
                        oid = _OID(s)
                        if oid not in out:
                            out.append(oid)
                except Exception:
                    # If bson isn't available for some reason, keep string-only.
                    pass

            extruder_ids = []
            for t in extruder_tpls:
                _add_template_id_variants(extruder_ids, t.get("id"))
                _add_template_id_variants(extruder_ids, t.get("_id"))

            visc_ids = []
            for t in visc_tpls:
                _add_template_id_variants(visc_ids, t.get("id"))
                _add_template_id_variants(visc_ids, t.get("_id"))

            # Fetch all extruder & existing viscosity submissions for the day.
            #
            # IMPORTANT:
            # - operators sometimes submit forms later (retro-entry)
            # - some environments store submitted_at as strings (often "YYYY-MM-DD HH:MM:SS.ssssss")
            #
            # We therefore use an *inclusive* query (template_id + rough day match) and then
            # strictly re-filter in Python using the extracted sample datetime.
            broad_start = day_start - timedelta(days=7)
            broad_end = day_end + timedelta(days=7)
            broad_start_iso = broad_start.isoformat()
            broad_end_iso = broad_end.isoformat()
            day_prefix = day.strftime("%Y-%m-%d")

            time_window_or = [
                # datetime fields
                {"submitted_at": {"$gte": broad_start, "$lte": broad_end}},
                {"created_at": {"$gte": broad_start, "$lte": broad_end}},
                # ISO-like string fields
                {"submitted_at": {"$gte": broad_start_iso, "$lte": broad_end_iso}},
                {"created_at": {"$gte": broad_start_iso, "$lte": broad_end_iso}},
                # legacy "YYYY-MM-DD HH:MM:SS" string fields (space separator)
                {"submitted_at": {"$regex": f"^{day_prefix}"}},
                {"created_at": {"$regex": f"^{day_prefix}"}},
            ]

            # Match by template_id OR by template name (fallback) to handle historical data
            # where form_template_id may not align with the template collection.
            ext_subs = await self.db.form_submissions.find(
                {
                    "$and": [
                        {
                            "$or": [
                                {"form_template_id": {"$in": extruder_ids}},
                                {"form_template_name": {"$regex": r"extruder\s*settings", "$options": "i"}},
                            ]
                        },
                        {"$or": time_window_or},
                    ]
                },
                {"_id": 0, "id": 1, "values": 1, "submitted_at": 1, "created_at": 1, "form_template_name": 1}
            ).to_list(5000)

            visc_subs = []
            if visc_ids:
                visc_subs = await self.db.form_submissions.find(
                    {
                        "$and": [
                            {
                                "$or": [
                                    {"form_template_id": {"$in": visc_ids}},
                                    {"form_template_name": {"$regex": r"mooney.*(viscos|sample)", "$options": "i"}},
                                ]
                            },
                            {"$or": time_window_or},
                        ]
                    },
                    {"_id": 0, "id": 1, "values": 1, "submitted_at": 1, "created_at": 1, "form_template_name": 1}
                ).to_list(5000)

            # Build set of HH:MM times already occupied by a viscosity sample on the same day
            paired_times = set()
            for s in visc_subs:
                if s.get("id") == visc_doc.get("id"):
                    continue  # ignore self (we'll overwrite its time below)
                dt = _extract_dt(s)
                if dt and dt.date() == day:
                    paired_times.add(dt.strftime("%H:%M"))

            # If our new viscosity's own HH:MM already pairs with an extruder that has no viscosity,
            # nothing to do — the dashboard will pair them naturally.
            visc_hhmm = visc_dt.strftime("%H:%M")
            existing_extruder_at_visc_time = None

            # Find candidate extruder samples on the same date WITHOUT a viscosity pair
            candidates = []
            for s in ext_subs:
                dt = _extract_dt(s)
                if not dt or dt.date() != day:
                    continue
                hhmm = dt.strftime("%H:%M")
                if hhmm == visc_hhmm:
                    existing_extruder_at_visc_time = (s, dt)
                if hhmm in paired_times:
                    continue  # already paired
                candidates.append((s, dt, hhmm))

            logger.info(
                f"[Viscosity Auto-Pair] day={day} visc={str(visc_doc.get('id',''))[:8]} "
                f"visc_hhmm={visc_hhmm} ext_subs_window={len(ext_subs)} candidates={len(candidates)} paired_times={len(paired_times)}"
            )

            # Short-circuit: if an extruder already exists at the exact viscosity time AND not paired,
            # nothing to do (they'll pair by time naturally).
            if existing_extruder_at_visc_time and existing_extruder_at_visc_time[1].strftime("%H:%M") not in paired_times:
                logger.info(
                    f"[Viscosity Auto-Pair] no-op: exact-time extruder exists at {visc_hhmm} (not paired); visc={str(visc_doc.get('id',''))[:8]}"
                )
                return {"status": "noop", "reason": "exact_time_extruder_exists", "day": str(day), "time": visc_hhmm}

            # If there are no extruder form submissions to pair to, fall back to ingested production logs.
            # This happens when the extruder row the user sees comes from `production_logs` ingestion.
            if not candidates:
                try:
                    # Timestamps are stored as ISO strings in `production_logs.timestamp`.
                    day_start_iso = day_start.strftime("%Y-%m-%dT00:00:00")
                    day_end_iso = day_end.strftime("%Y-%m-%dT23:59:59")
                    ingested = await self.db.production_logs.find(
                        {
                            "asset_id": {"$regex": "line.?90", "$options": "i"},
                            "timestamp": {"$gte": day_start_iso, "$lte": day_end_iso},
                        },
                        {"_id": 0, "timestamp": 1, "mooney_viscosity": 1},
                    ).to_list(5000)

                    ingested_candidates = []
                    for row in ingested:
                        ts = row.get("timestamp")
                        if not ts:
                            continue
                        try:
                            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                        except Exception:
                            continue
                        if dt.date() != day:
                            continue
                        hhmm = dt.strftime("%H:%M")
                        # Only fill slots that don't already have a viscosity value and aren't already paired by time.
                        has_visc = row.get("mooney_viscosity") not in (None, "", "-")
                        if has_visc or hhmm in paired_times:
                            continue
                        ingested_candidates.append(({"id": f"ingested:{ts}"}, dt, hhmm))

                    logger.info(
                        f"[Viscosity Auto-Pair] fallback=ingested day={day} visc={str(visc_doc.get('id',''))[:8]} "
                        f"ingested_rows={len(ingested)} ingested_candidates={len(ingested_candidates)}"
                    )

                    candidates = ingested_candidates
                except Exception as e:
                    logger.info(
                        f"[Viscosity Auto-Pair] skip: no extruder candidates and ingested fallback failed ({e}); "
                        f"day={day} visc={str(visc_doc.get('id',''))[:8]}"
                    )
                    return {"status": "skip", "reason": "ingested_fallback_failed", "detail": str(e), "day": str(day)}

            if not candidates:
                logger.info(
                    f"[Viscosity Auto-Pair] skip: no orphan candidates (extruder+ingested) on day={day}; visc={str(visc_doc.get('id',''))[:8]}"
                )
                return {"status": "skip", "reason": "no_candidates", "day": str(day)}

            # Primary preference: pair "backwards" to fill earlier extruder slots on the same day.
            # 1) pick the LATEST orphan extruder sample at-or-before the viscosity time
            # 2) if none exist, pick the EARLIEST orphan extruder sample after the viscosity time
            earlier = [c for c in candidates if c[1] <= visc_dt]
            if earlier:
                earlier.sort(key=lambda c: c[1])
                target_sub, target_dt, target_hhmm = earlier[-1]
            else:
                candidates.sort(key=lambda c: c[1])
                target_sub, target_dt, target_hhmm = candidates[0]

            # Rewrite this viscosity submission's "Date & Time" value to the target extruder's time.
            new_values = []
            rewrote = False
            new_val = target_dt.strftime("%Y-%m-%dT%H:%M")
            has_canonical_dt = False
            for v in visc_doc.get("values", []) or []:
                label = str(v.get("field_label", "")).strip().lower()
                fid = str(v.get("field_id", "")).strip().lower()
                if label == "date & time" or fid == "date & time" or fid == "date_&_time":
                    has_canonical_dt = True
                # Templates often use UUID field_ids; rely primarily on the label, with a
                # couple of legacy id patterns as fallback.
                is_dt_field = (
                    ("date" in label and "time" in label)
                    or ("date/time" in label)
                    or ("datetime" in label)
                    or (fid == "date_&_time")
                    or (fid.replace("_", " ").strip() == "date & time")
                )
                if is_dt_field:
                    # Format target in same local-ISO style used by the form (YYYY-MM-DDTHH:MM)
                    new_values.append({**v, "value": new_val})
                    rewrote = True
                else:
                    new_values.append(v)

            # Ensure the production dashboard can *always* read the paired time.
            # `backend/routes/production.py` currently extracts by literal "Date & Time",
            # so we guarantee a canonical field exists, even if the template's datetime
            # field uses a different label like "Datetime".
            if not has_canonical_dt:
                new_values.append({
                    "field_id": "date_&_time",
                    "field_label": "Date & Time",
                    "value": new_val,
                    "threshold_status": "normal",
                })
                rewrote = True
            elif not rewrote:
                # Canonical exists but we didn't rewrite anything (unexpected); force it.
                patched = []
                for v in new_values:
                    label = str(v.get("field_label", "")).strip().lower()
                    fid = str(v.get("field_id", "")).strip().lower()
                    if label == "date & time" or fid == "date & time" or fid == "date_&_time":
                        patched.append({**v, "value": new_val})
                        rewrote = True
                    else:
                        patched.append(v)
                new_values = patched

            if dry_run:
                # Dry-run: don't write, just report what would happen.
                return {
                    "status": "would_pair",
                    "day": str(day),
                    "from": visc_hhmm,
                    "to": target_hhmm,
                    "paired_to": target_sub.get("id"),
                    "candidates": len(candidates),
                    "paired_times": len(paired_times),
                }

            await self.submissions.update_one(
                {"id": visc_doc["id"]},
                {"$set": {"values": new_values, "auto_paired_to_extruder_id": target_sub.get("id")}}
            )
            visc_doc["values"] = new_values
            logger.info(
                f"[Viscosity Auto-Pair] visc={visc_doc.get('id')[:8]} paired→ extruder={target_sub.get('id','')[:8]} "
                f"visc_time={visc_hhmm} → new_time={target_hhmm}"
            )
            return {"status": "paired", "day": str(day), "from": visc_hhmm, "to": target_hhmm, "paired_to": target_sub.get("id")}

