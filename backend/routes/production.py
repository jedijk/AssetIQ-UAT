"""
Production Dashboard API endpoints.
Aggregates form submission data for the Daily Production Overview (Line 90).
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional, Tuple
import logging
import re
import uuid

from bson import ObjectId
from database import db
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Production Dashboard"])


def _require_owner_or_admin(user: dict):
    role = (user or {}).get("role")
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _require_owner(user: dict):
    role = (user or {}).get("role")
    if role != "owner":
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _serialize_datetime(dt, *, force_utc: bool = False):
    """
    Serialize datetime to ISO format.

    - Operator-entered datetimes (from form fields) are treated as local wall-clock times and MUST remain naive.
    - Server timestamps (created_at/updated_at/submitted_at) should be emitted in UTC so clients can safely render.
    """
    if dt is None:
        return ""
    if hasattr(dt, 'isoformat'):
        if isinstance(dt, datetime):
            if dt.tzinfo is None:
                # Keep naive datetimes naive unless explicitly forced to UTC.
                if not force_utc:
                    return dt.isoformat()
                return dt.replace(tzinfo=timezone.utc).isoformat()

            # tz-aware datetime
            if force_utc:
                return dt.astimezone(timezone.utc).isoformat()
            return dt.isoformat()
        return dt.isoformat()
    return str(dt)

def _sort_key_dt(dt: Optional[datetime]) -> datetime:
    """
    Provide a comparable key for sorting mixed naive/aware datetimes.
    - naive -> returned as-is
    - aware -> converted to UTC and made naive
    """
    if not isinstance(dt, datetime):
        return datetime.min
    if dt.tzinfo is None:
        return dt
    try:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return datetime.min


def _in_range(dt: Optional[datetime], start: datetime, end: datetime) -> bool:
    """Safe date range check for mixed naive/aware datetimes."""
    if not isinstance(dt, datetime):
        return False
    if dt.tzinfo is None:
        # Compare as local wall-clock time: drop tzinfo from range bounds too.
        return start.replace(tzinfo=None) <= dt <= end.replace(tzinfo=None)
    return start <= dt <= end


# Form template names that contain production data
EXTRUDER_FORM = "Extruder settings sample"
VISCOSITY_FORM = "Mooney viscosity sample"
BIG_BAG_FORM = "Big Bag Loading"
SCREEN_CHANGE_FORM = "Screen change"
MAGNET_CLEANING_FORM = "Magnet cleaning"
END_OF_SHIFT_FORM = "End of shift"
# Any form template whose name contains "information" (e.g. "Production Information")
INFORMATION_FORM = "Information"

PRODUCTION_FORMS = [
    EXTRUDER_FORM,
    VISCOSITY_FORM,
    BIG_BAG_FORM,
    SCREEN_CHANGE_FORM,
    MAGNET_CLEANING_FORM,
    END_OF_SHIFT_FORM,
    INFORMATION_FORM,
]

EQUIPMENT_NAME = "Line-90"

# Shift definitions (single-day mode). "day" is legacy API/bookmarks: full 06:00–22:00 window.
SHIFTS = {
    "morning": {"label": "Morning (06:00 - 14:00)", "start_hour": 6, "end_hour": 14},
    "afternoon": {"label": "Afternoon (14:00 - 22:00)", "start_hour": 14, "end_hour": 22},
    "night": {"label": "Night (22:00 - 06:00)", "start_hour": 22, "end_hour": 6},
    "day": {"label": "Day (06:00 - 22:00)", "start_hour": 6, "end_hour": 22},
}


def _in_any_time_window(dt: Optional[datetime], windows: List[Tuple[datetime, datetime]]) -> bool:
    """True if dt falls inside any of the half-open-style inclusive windows."""
    if not isinstance(dt, datetime) or not windows:
        return False
    return any(_in_range(dt, ws, we) for ws, we in windows)


def _normalize_shift_keys(raw: Optional[str]) -> List[str]:
    """Parse comma-separated shift keys (morning, afternoon, night, legacy day). Dedupe, preserve order."""
    parts = [p.strip().lower() for p in (raw or "").split(",") if p.strip()]
    seen = set()
    out: List[str] = []
    for p in parts:
        if p not in SHIFTS or p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out or ["morning"]


def _shift_windows_for_day(shift_keys: List[str], target_date: datetime) -> List[Tuple[datetime, datetime]]:
    windows: List[Tuple[datetime, datetime]] = []
    for k in shift_keys:
        cfg = SHIFTS[k]
        if k == "night":
            ws = target_date.replace(hour=22, minute=0, second=0, microsecond=0)
            we = (target_date + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
        else:
            ws = target_date.replace(hour=cfg["start_hour"], minute=0, second=0, microsecond=0)
            we = target_date.replace(hour=cfg["end_hour"], minute=0, second=0, microsecond=0)
        windows.append((ws, we))
    return windows


def _envelope_windows(windows: List[Tuple[datetime, datetime]]) -> Tuple[datetime, datetime]:
    if not windows:
        raise ValueError("windows must be non-empty")
    return min(w[0] for w in windows), max(w[1] for w in windows)


def extract_field(submission, field_label):
    """Extract a value from a submission's values array by field_label or field_id (case-insensitive)."""
    target = field_label.strip().lower()
    # Normalize: "Date & Time" -> also match "date_&_time"
    target_normalized = target.replace(" ", "_").replace("&", "&")
    for v in submission.get("values", []):
        label = (v.get("field_label") or "").strip().lower()
        fid = (v.get("field_id") or "").strip().lower()
        if label == target or fid == target or label == target_normalized or fid == target_normalized:
            return v.get("value")
    return None


def extract_numeric(submission, field_label):
    """Extract numeric value from submission by field label."""
    val = extract_field(submission, field_label)
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_submitted_at(sub):
    """Parse submitted_at (fallback: created_at, then updated_at) into a datetime object."""
    for key in ("submitted_at", "created_at", "updated_at"):
        raw = sub.get(key, "")
        if isinstance(raw, datetime):
            return raw
        if not raw:
            continue
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except Exception:
            continue
    return None


def _production_date_raw_for_big_bag(sub) -> Optional[Any]:
    """Locate Production Date (or equivalent) on Big Bag style submissions."""
    for label in (
        "Production Date",
        "Production date",
        "Date of production",
        "Produced on",
    ):
        v = extract_field(sub, label)
        if v is not None and str(v).strip() and str(v).strip() not in ("{}", "null", ""):
            return v
    for v in sub.get("values") or []:
        lab = str(v.get("field_label") or "").lower()
        fid = str(v.get("field_id") or "").lower()
        if "production" in lab and "date" in lab:
            w = _unwrap_form_value(v.get("value"))
            if w is not None and str(w).strip() and str(w).strip() not in ("{}", "null", ""):
                return w
        if "production_date" in fid or fid.endswith("productiondate"):
            w = _unwrap_form_value(v.get("value"))
            if w is not None and str(w).strip() and str(w).strip() not in ("{}", "null", ""):
                return w
    return None


def _unwrap_form_value(val):
    """
    Form values are sometimes stored as plain scalars, sometimes as {value: "..."} (mobile / structured UIs).
    """
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, dict):
        for k in ("value", "isoValue", "iso", "dateTime", "text", "raw"):
            inner = val.get(k)
            if inner not in (None, ""):
                return _unwrap_form_value(inner)
        return val
    if isinstance(val, list) and len(val) > 0:
        return _unwrap_form_value(val[0])
    return val


def _submission_prefill_by_field_id(sub) -> dict:
    """Map field_id -> string for edit dialogs."""
    out: dict = {}
    for v in sub.get("values") or []:
        fid = (v.get("field_id") or "").strip()
        if not fid:
            continue
        raw = _unwrap_form_value(v.get("value"))
        if raw is None:
            continue
        if isinstance(raw, datetime):
            out[fid] = raw.isoformat(sep="T", timespec="minutes")
        else:
            out[fid] = str(raw)
    return out


def _information_text_from_submission(sub) -> str:
    """Primary text for dashboard: prefer obvious labels, else join non-trivial string fields."""
    priority_tokens = (
        "information",
        "details",
        "comments",
        "description",
        "notes",
        "message",
        "remarks",
        "text",
    )
    priority_chunks: List[str] = []
    other_chunks: List[str] = []
    for v in sub.get("values") or []:
        lab = (v.get("field_label") or "").strip().lower()
        raw = _unwrap_form_value(v.get("value"))
        if raw is None:
            continue
        if isinstance(raw, datetime):
            s = raw.isoformat(sep=" ", timespec="minutes")
        else:
            s = str(raw).strip()
        if len(s) < 2:
            continue
        if any(tok in lab for tok in priority_tokens):
            priority_chunks.append(s)
        else:
            other_chunks.append(s)
    ordered = priority_chunks + other_chunks
    seen = set()
    parts: List[str] = []
    for c in ordered:
        if c not in seen:
            seen.add(c)
            parts.append(c)
    out = " — ".join(parts)
    return out[:4000] if out else ""


def _parse_sample_datetime(val):
    """Parse operator-entered sample time from form values (ISO, EU day-first, etc.)."""
    if val is None:
        return None
    val = _unwrap_form_value(val)
    if isinstance(val, datetime):
        # BSON / backend may hydrate datetime; keep naive wall-clock when tz-unset (matches operator picker).
        if val.tzinfo is not None:
            try:
                return val.replace(tzinfo=None)
            except Exception:
                return val
        return val
    s = str(val).strip()
    if not s or s in ("{}", "null", "undefined"):
        return None
    # Normalise space-separated ISO (some clients send "YYYY-MM-DD HH:MM")
    if " " in s and "T" not in s and re.match(r"^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}", s):
        s = s.replace(" ", "T", 1)
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        d = None
    if d is None:
        for fmt in (
            "%d/%m/%Y %H:%M",
            "%d-%m-%Y %H:%M",
            "%d.%m.%Y %H:%M",
            "%d/%m/%Y %H:%M:%S",
            "%d-%m-%Y %H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
        ):
            try:
                d = datetime.strptime(s[:25].strip(), fmt)
                break
            except (ValueError, TypeError):
                continue
    if d is None:
        return None
    # Treat parsed clock as operator wall time for dashboard filters (match naive range bounds).
    if d.tzinfo is not None:
        try:
            return d.replace(tzinfo=None)
        except Exception:
            return d
    return d


def _extract_date_time_field_raw(sub) -> Optional[str]:
    """
    Raw sample datetime string from form values.
    Uses canonical "Date & Time" first, then field_type, then label/f_id heuristics
    (templates vary; mobile may nest value objects).
    """
    raw = _unwrap_form_value(extract_field(sub, "Date & Time"))
    if raw is not None and raw != "":
        if isinstance(raw, datetime):
            return raw.isoformat(sep="T", timespec="seconds")
        s = str(raw).strip()
        if s and s not in ("{}", "null"):
            return s

    for v in sub.get("values", []) or []:
        ft = str(v.get("field_type") or v.get("type") or "").strip().lower()
        if ft in ("datetime", "datetime-local", "datetime_local", "datetimelocal"):
            inner = _unwrap_form_value(v.get("value"))
            if inner is not None and inner != "":
                if isinstance(inner, datetime):
                    return inner.isoformat(sep="T", timespec="seconds")
                s = str(inner).strip()
                if s:
                    return s

        label = str(v.get("field_label") or "").strip().lower()
        fid = str(v.get("field_id") or "").strip().lower()
        is_dt_like = (
            ("date" in label and "time" in label)
            or ("datum" in label and "tijd" in label)
            or ("date/time" in label)
            or ("datetime" in label)
            or (fid.replace("_", " ").strip() == "date & time")
            or (fid == "date_&_time")
            or ("sample" in label and ("time" in label or "date" in label or "datum" in label))
        )
        if is_dt_like:
            inner = _unwrap_form_value(v.get("value"))
            if inner is not None and inner != "":
                if isinstance(inner, datetime):
                    return inner.isoformat(sep="T", timespec="seconds")
                s = str(inner).strip()
                if s:
                    return s
    return None


@router.get("/production/dashboard")
async def get_production_dashboard(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (single day, used if from_date not set)"),
    from_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD"),
    shift: Optional[str] = Query(
        "morning",
        description="Comma-separated shifts for single-day mode: morning, afternoon, night (legacy: day). Example: morning,night",
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Get aggregated production dashboard data.
    Supports single-day (date) or range (from_date + to_date).
    """
    now = datetime.now(timezone.utc)
    shift_keys = _normalize_shift_keys(shift)
    shift_param = ",".join(shift_keys)

    # Determine the effective date range
    if from_date and to_date:
        try:
            range_start = datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            range_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        try:
            range_end = datetime.strptime(to_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            range_end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        # Full days: start at 00:00 of from_date, end at 23:59 of to_date
        range_start = range_start.replace(hour=0, minute=0, second=0, microsecond=0)
        range_end = range_end.replace(hour=23, minute=59, second=59, microsecond=999999)
        target_date = range_start
        is_range = True
        filter_windows = [(range_start, range_end)]
    else:
        # Single day mode (backward compatible)
        if date:
            try:
                target_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                target_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            target_date = now.replace(hour=0, minute=0, second=0, microsecond=0)

        filter_windows = _shift_windows_for_day(shift_keys, target_date)
        range_start, range_end = _envelope_windows(filter_windows)
        is_range = False

    shift_label = ", ".join(SHIFTS[k]["label"] for k in shift_keys)
    shift_hours = "; ".join(
        f"{SHIFTS[k]['start_hour']:02d}:00 - {SHIFTS[k]['end_hour']:02d}:00" for k in shift_keys
    )
    cal_env_start, cal_env_end = _envelope_windows(filter_windows)

    # Find ALL equipment nodes that look like Line-90 (name/tag). Sites may have duplicates
    # or multiple rows; find_one only expanded one subtree and submissions linked to another
    # Line-90 id were dropped from the dashboard query.
    _line90_pat = {"$regex": r"line\s*[-–]?\s*90", "$options": "i"}
    line90_roots = await db.equipment_nodes.find(
        {"$or": [
            {"name": _line90_pat},
            {"tag": _line90_pat},
            {"tag_number": _line90_pat},
        ]},
        {"_id": 0, "id": 1, "parent_id": 1},
    ).limit(40).to_list(40)
    line90 = line90_roots[0] if line90_roots else None

    equipment_ids = []
    seen_eq: set = set()

    def _add_eq_id(eid):
        if not eid or eid in seen_eq:
            return
        seen_eq.add(eid)
        equipment_ids.append(eid)

    for root in line90_roots:
        rid = root.get("id")
        _add_eq_id(rid)
        if root.get("parent_id"):
            _add_eq_id(root["parent_id"])
            parent = await db.equipment_nodes.find_one(
                {"id": root["parent_id"]}, {"_id": 0, "parent_id": 1}
            )
            if parent and parent.get("parent_id"):
                _add_eq_id(parent["parent_id"])

        children = await db.equipment_nodes.find(
            {"parent_id": rid}, {"_id": 0, "id": 1}
        ).to_list(80)
        child_ids = [c["id"] for c in children if c.get("id")]
        for cid in child_ids:
            _add_eq_id(cid)

        if child_ids:
            grandchildren = await db.equipment_nodes.find(
                {"parent_id": {"$in": child_ids}}, {"_id": 0, "id": 1}
            ).to_list(300)
            for gc in grandchildren:
                _add_eq_id(gc.get("id"))

    # Tags/names under Line-90 (e.g. EXU, 1U-20) for matching form `equipment_name`
    # and ingested `production_logs.asset_id` — CSVs rarely use the literal "Line-90" string.
    line90_subtree_asset_tokens = set()
    if equipment_ids:
        subtree_nodes = await db.equipment_nodes.find(
            {"id": {"$in": list(dict.fromkeys(equipment_ids))}},
            {"_id": 0, "id": 1, "name": 1, "tag": 1, "tag_number": 1},
        ).to_list(500)
        for n in subtree_nodes:
            eid = (n.get("id") or "").strip()
            if eid:
                line90_subtree_asset_tokens.add(eid)
            for key in ("name", "tag", "tag_number"):
                v = (n.get(key) or "").strip()
                if len(v) >= 2:
                    line90_subtree_asset_tokens.add(v)

    def _meaningful_line90_token(s: str) -> bool:
        if len(s) >= 3:
            return True
        return any(ch.isdigit() for ch in s)

    equipment_match = [
        {"equipment_name": {"$regex": "Line.?90", "$options": "i"}},
        {"equipment_name": EQUIPMENT_NAME},
        {"equipment_tag": {"$regex": r"line\s*[-–]?\s*90", "$options": "i"}},
    ]
    if equipment_ids:
        equipment_match.append({"equipment_id": {"$in": equipment_ids}})
    subtree_toks = sorted(
        (t for t in line90_subtree_asset_tokens if _meaningful_line90_token(t)),
        key=len,
        reverse=True,
    )
    if subtree_toks:
        alt = "|".join(re.escape(t) for t in subtree_toks[:48])
        if alt:
            equipment_match.append({"equipment_name": {"$regex": alt, "$options": "i"}})
    # Common shop-floor names when hierarchy is flat or equipment is not under Line-90 in DB
    equipment_match.extend([
        {"equipment_name": {"$regex": r"(?i)extrusion\s*unit"}},
        {"equipment_name": {"$regex": r"(?i)\bexu\b"}},
        {"equipment_name": {"$regex": r"(?i)1u[- ]?[0-9]"}},
    ])

    # Query filter for template names: must match match_template() intent. Exact ^(…)$
    # omitted versioned / localized template titles, so the dashboard showed no rows.
    flex_production_template = {
        "$or": [
            {"$and": [
                {"form_template_name": {"$regex": "extruder", "$options": "i"}},
                {"form_template_name": {"$regex": "setting", "$options": "i"}},
            ]},
            {"$and": [
                {"form_template_name": {"$regex": "mooney", "$options": "i"}},
                {"$or": [
                    {"form_template_name": {"$regex": "viscos", "$options": "i"}},
                    {"form_template_name": {"$regex": "sample", "$options": "i"}},
                ]},
            ]},
            {"$and": [
                {"form_template_name": {"$regex": "big", "$options": "i"}},
                {"form_template_name": {"$regex": "bag", "$options": "i"}},
            ]},
            {"$and": [
                {"form_template_name": {"$regex": "screen", "$options": "i"}},
                {"form_template_name": {"$regex": "change", "$options": "i"}},
            ]},
            {"$and": [
                {"form_template_name": {"$regex": "magnet", "$options": "i"}},
                {"form_template_name": {"$regex": "clean", "$options": "i"}},
            ]},
            {"$and": [
                {"form_template_name": {"$regex": "end", "$options": "i"}},
                {"form_template_name": {"$regex": "shift", "$options": "i"}},
            ]},
            {"$and": [
                {"form_template_name": {"$regex": r"\binformation\b", "$options": "i"}},
            ]},
        ]
    }

    # Production forms without equipment are implicitly for Line-90
    # Include them in the query by adding conditions for empty/null equipment
    forms_without_equipment = {
        "$and": [
            {"$or": [
                {"$and": [
                    {"form_template_name": {"$regex": "screen", "$options": "i"}},
                    {"form_template_name": {"$regex": "change", "$options": "i"}},
                ]},
                {"$and": [
                    {"form_template_name": {"$regex": "magnet", "$options": "i"}},
                    {"form_template_name": {"$regex": "clean", "$options": "i"}},
                ]},
                {"$and": [
                    {"form_template_name": {"$regex": "end", "$options": "i"}},
                    {"form_template_name": {"$regex": "shift", "$options": "i"}},
                ]},
                # Big Bag Loading is often submitted without a linked equipment row
                {"$and": [
                    {"form_template_name": {"$regex": "big", "$options": "i"}},
                    {"form_template_name": {"$regex": "bag", "$options": "i"}},
                ]},
                {"$and": [
                    {"form_template_name": {"$regex": r"\binformation\b", "$options": "i"}},
                ]},
            ]},
            {"$or": [
                {"equipment_id": ""},
                {"equipment_id": None},
                {"equipment_id": {"$exists": False}},
            ]},
        ]
    }

    extruder_tpl_ids_str = set()
    viscosity_tpl_ids_str = set()
    big_bag_tpl_ids_str = set()
    screen_tpl_ids_str = set()
    magnet_tpl_ids_str = set()
    eos_tpl_ids_str = set()
    information_tpl_ids_str = set()

    prod_tpl_id_values = []
    try:
        tpl_rows = await db.form_templates.find(
            {"$or": flex_production_template["$or"]},
            {"_id": 1, "id": 1, "name": 1},
        ).to_list(400)
        seen = set()
        for t in tpl_rows:
            nm = (t.get("name") or "").strip().lower()
            id_strs = []
            for key in ("_id", "id"):
                v = t.get(key)
                if v is None:
                    continue
                if isinstance(v, ObjectId):
                    s = str(v)
                    id_strs.append(s)
                    if s not in seen:
                        seen.add(s)
                        prod_tpl_id_values.append(v)
                else:
                    s = str(v)
                    id_strs.append(s)
                    if s in seen:
                        continue
                    seen.add(s)
                    prod_tpl_id_values.append(s)
                    if len(s) == 24:
                        try:
                            o = ObjectId(s)
                            prod_tpl_id_values.append(o)
                        except Exception:
                            pass
            for sid in id_strs:
                if ("extruder" in nm) and ("setting" in nm):
                    extruder_tpl_ids_str.add(sid)
                if ("mooney" in nm) and (("viscos" in nm) or ("sample" in nm)):
                    viscosity_tpl_ids_str.add(sid)
                if ("big" in nm) and ("bag" in nm):
                    big_bag_tpl_ids_str.add(sid)
                if ("screen" in nm) and ("change" in nm):
                    screen_tpl_ids_str.add(sid)
                if ("magnet" in nm) and ("clean" in nm):
                    magnet_tpl_ids_str.add(sid)
                if ("end" in nm) and ("shift" in nm):
                    eos_tpl_ids_str.add(sid)
                if re.search(r"\binformation\b", nm):
                    information_tpl_ids_str.add(sid)
    except Exception as e:
        logger.warning("production dashboard: form_templates lookup failed: %s", e)

    query_or = [
        {
            "$and": [
                flex_production_template,
                {"$or": equipment_match},
            ]
        },
        forms_without_equipment,
    ]
    if prod_tpl_id_values:
        query_or.append({
            "$and": [
                {"form_template_id": {"$in": prod_tpl_id_values}},
                {"$or": equipment_match},
            ]
        })

    query = {"$or": query_or}

    # Pre-filter by submitted/created time around the visible range. A plain
    # find().limit(1000) without sort or time scope can omit the newest rows when
    # many Line-90 production forms exist (matches FormService pairing window).
    broad_start = range_start - timedelta(days=7)
    broad_end = range_end + timedelta(days=7)
    broad_start_iso = broad_start.isoformat()
    broad_end_iso = broad_end.isoformat()

    time_window_or = [
        {"submitted_at": {"$gte": broad_start, "$lte": broad_end}},
        {"created_at": {"$gte": broad_start, "$lte": broad_end}},
        {"updated_at": {"$gte": broad_start, "$lte": broad_end}},
        {"submitted_at": {"$gte": broad_start_iso, "$lte": broad_end_iso}},
        {"created_at": {"$gte": broad_start_iso, "$lte": broad_end_iso}},
        {"updated_at": {"$gte": broad_start_iso, "$lte": broad_end_iso}},
    ]
    span_days = (range_end.date() - range_start.date()).days + 1
    if span_days <= 120:
        scan_day = range_start.date()
        scan_end = range_end.date()
        while scan_day <= scan_end:
            day_prefix = scan_day.strftime("%Y-%m-%d")
            time_window_or.append({"submitted_at": {"$regex": f"^{day_prefix}"}})
            time_window_or.append({"created_at": {"$regex": f"^{day_prefix}"}})
            time_window_or.append({"updated_at": {"$regex": f"^{day_prefix}"}})
            scan_day += timedelta(days=1)

    submissions_query = {
        "$and": [
            query,
            {"$or": time_window_or},
        ]
    }

    all_subs = await db.form_submissions.find(
        submissions_query,
        {"_id": 0},
    ).sort([("submitted_at", -1), ("created_at", -1)]).to_list(15000)

    def _tid_str_for_filter(sub):
        tid = sub.get("form_template_id")
        if tid is None:
            return None
        if isinstance(tid, ObjectId):
            return str(tid)
        s = str(tid).strip()
        return s or None

    def _is_big_bag_template_sub(sub) -> bool:
        ts = _tid_str_for_filter(sub)
        if ts and ts in big_bag_tpl_ids_str:
            return True
        tpl = (sub.get("form_template_name") or "").strip().lower()
        return bool(tpl) and ("big" in tpl) and ("bag" in tpl)

    def _prefer_form_sample_time_for_row(sub) -> bool:
        """Extruder + Mooney: sample clock is the Date & Time field, not submitted_at."""
        tpl = (sub.get("form_template_name") or "").strip().lower()
        tid = sub.get("form_template_id")
        ts = str(tid).strip() if tid is not None else ""
        if isinstance(tid, ObjectId):
            ts = str(tid)
        if ts and ts in extruder_tpl_ids_str:
            return True
        if ts and ts in viscosity_tpl_ids_str:
            return True
        if ("extruder" in tpl) and ("setting" in tpl):
            return True
        if ("mooney" in tpl) and (("viscos" in tpl) or ("sample" in tpl)):
            return True
        return False

    # Filter by date range: include if submission time OR sample "Date & Time" falls in shift window.
    # (Using only the form field can drop rows when it parses wrong or defaults outside the window.)
    submissions = []
    for sub in all_subs:
        is_bb = _is_big_bag_template_sub(sub)

        raw_sample_dt = _extract_date_time_field_raw(sub)
        dt_form = _parse_sample_datetime(raw_sample_dt) if raw_sample_dt else None
        # Big Bag often has no "Date & Time"; use Production Date for shift/day windowing.
        if dt_form is None and is_bb:
            raw_pd = _production_date_raw_for_big_bag(sub)
            if raw_pd is not None and str(raw_pd).strip() and str(raw_pd).strip() not in ("{}", "null"):
                dt_form = _parse_sample_datetime(_unwrap_form_value(raw_pd))

        dt_meta = parse_submitted_at(sub)
        if dt_meta is None and is_bb and dt_form is not None:
            dt_meta = dt_form

        if dt_meta is None:
            continue
        if dt_meta.tzinfo is None:
            dt_meta = dt_meta.replace(tzinfo=timezone.utc)

        in_meta = _in_any_time_window(dt_meta, filter_windows)
        in_form = _in_any_time_window(dt_form, filter_windows) if dt_form else False
        # Date-only Production Date parses as midnight and misses day/night shift windows;
        # still include the row when the calendar day overlaps the dashboard range.
        if is_bb and dt_form:
            try:
                d0 = dt_form.date() if dt_form.tzinfo is None else dt_form.astimezone(timezone.utc).date()
                if cal_env_start.date() <= d0 <= cal_env_end.date():
                    in_form = True
            except Exception:
                pass

        if not in_meta and not in_form:
            continue

        # Extruder / Mooney: form Date & Time is authoritative. If it parses and falls OUTSIDE the
        # selected date/shift window, do not attach this row via submission time alone — it would
        # show a historical sample clock (e.g. Nov 2025) on a May 2026 dashboard and sort oddly.
        if _prefer_form_sample_time_for_row(sub) and dt_form is not None and not in_form:
            continue

        # Production log / charts use operator-entered sample time for extruder + Mooney when in-window.
        if _prefer_form_sample_time_for_row(sub) and dt_form is not None:
            sub["_parsed_time"] = dt_form
        else:
            sub["_parsed_time"] = dt_form if in_form else dt_meta
        submissions.append(sub)

    # Separate by form type.
    #
    # Production templates are often versioned / suffixed (e.g. "Extruder Settings v16"),
    # so we match by intent rather than exact equality, while keeping the historical
    # exact-name behavior as a fast path.
    def _tid_str(sub):
        tid = sub.get("form_template_id")
        if tid is None:
            return None
        if isinstance(tid, ObjectId):
            return str(tid)
        s = str(tid).strip()
        return s or None

    def match_template(sub, name: str):
        target = (name or "").strip().lower()
        if not target:
            return False
        ts = _tid_str(sub)
        if ts:
            if target == EXTRUDER_FORM.lower() and ts in extruder_tpl_ids_str:
                return True
            if target == VISCOSITY_FORM.lower() and ts in viscosity_tpl_ids_str:
                return True
            if target == BIG_BAG_FORM.lower() and ts in big_bag_tpl_ids_str:
                return True
            if target == SCREEN_CHANGE_FORM.lower() and ts in screen_tpl_ids_str:
                return True
            if target == MAGNET_CLEANING_FORM.lower() and ts in magnet_tpl_ids_str:
                return True
            if target == END_OF_SHIFT_FORM.lower() and ts in eos_tpl_ids_str:
                return True
            if target == INFORMATION_FORM.lower() and ts in information_tpl_ids_str:
                return True
        tpl = (sub.get("form_template_name") or "").strip().lower()
        if not tpl:
            return False
        if tpl == target:
            return True
        if target == EXTRUDER_FORM.lower():
            return ("extruder" in tpl) and ("setting" in tpl)
        if target == VISCOSITY_FORM.lower():
            return ("mooney" in tpl) and (("viscos" in tpl) or ("sample" in tpl))
        if target == BIG_BAG_FORM.lower():
            return ("big" in tpl) and ("bag" in tpl)
        if target == SCREEN_CHANGE_FORM.lower():
            return ("screen" in tpl) and ("change" in tpl)
        if target == MAGNET_CLEANING_FORM.lower():
            return ("magnet" in tpl) and ("clean" in tpl)
        if target == END_OF_SHIFT_FORM.lower():
            return ("end" in tpl) and ("shift" in tpl)
        if target == INFORMATION_FORM.lower():
            return bool(re.search(r"\binformation\b", tpl))
        return False

    extruder_subs = sorted(
        [s for s in submissions if match_template(s, EXTRUDER_FORM)],
        key=lambda s: _sort_key_dt(s.get("_parsed_time")),
    )
    viscosity_subs = sorted(
        [s for s in submissions if match_template(s, VISCOSITY_FORM)],
        key=lambda s: _sort_key_dt(s.get("_parsed_time")),
    )

    # Lookup for stable pairing when viscosity submissions were auto-paired to a specific
    # extruder submission id.
    extruder_time_by_id = {}
    for sub in extruder_subs:
        sid = sub.get("id")
        dt = sub.get("_parsed_time")
        if sid and dt:
            extruder_time_by_id[sid] = dt
    big_bag_subs = [s for s in submissions if match_template(s, BIG_BAG_FORM)]
    big_bag_subs.sort(key=lambda s: _sort_key_dt(s.get("_parsed_time")))
    information_subs = [s for s in submissions if match_template(s, INFORMATION_FORM)]
    information_subs.sort(key=lambda s: _sort_key_dt(s.get("_parsed_time")))
    screen_change_subs = [s for s in submissions if match_template(s, SCREEN_CHANGE_FORM)]
    magnet_subs = [s for s in submissions if match_template(s, MAGNET_CLEANING_FORM)]
    end_of_shift_subs = sorted(
        [s for s in submissions if match_template(s, END_OF_SHIFT_FORM)],
        key=lambda s: _sort_key_dt(s.get("_parsed_time")),
        reverse=True,
    )

    # Build production log entries from extruder data
    production_log = []
    # NOTE: total_feed is initialized to 0 and ONLY set from End of Shift entries (see below)
    # Do NOT accumulate from individual FEED values
    total_feed = 0.0
    total_waste = 0.0

    for sub in extruder_subs:
        dt = sub.get("_parsed_time")
        time_label = dt.strftime("%H:%M") if dt else ""

        rpm = extract_numeric(sub, "RPM") or 0
        feed = extract_numeric(sub, "FEED") or 0
        moisture = extract_numeric(sub, "M%") or 0
        energy = extract_numeric(sub, "ENERGY") or 0
        mt1 = extract_numeric(sub, "MT1") or 0
        mt2 = extract_numeric(sub, "MT2") or 0
        mt3 = extract_numeric(sub, "MT3") or 0
        mp1 = extract_numeric(sub, "MP1") or 0
        mp2 = extract_numeric(sub, "MP2") or 0
        mp3 = extract_numeric(sub, "MP3") or 0
        mp4 = extract_numeric(sub, "MP4") or 0
        co2_feed_p = extract_field(sub, "CO2 Feed/P") or extract_field(sub, "CO2 Feeds") or ""
        t_product_ir = extract_numeric(sub, "T Product IR") or 0
        remarks = extract_field(sub, "Remarks") or extract_field(sub, "REMARKS") or ""
        waste = extract_numeric(sub, "Waste") or 0

        # Do NOT add feed to total_feed - total_input comes ONLY from End of Shift
        total_waste += waste

        production_log.append({
            "time": time_label,
            "datetime": _serialize_datetime(dt),
            "submitted_by": sub.get("submitted_by_name", ""),
            "rpm": rpm,
            "feed": feed,
            "moisture": moisture,
            "energy": energy,
            "mt1": mt1,
            "mt2": mt2,
            "mt3": mt3,
            "mp1": mp1,
            "mp2": mp2,
            "mp3": mp3,
            "mp4": mp4,
            "co2_feed_p": co2_feed_p,
            "t_product_ir": t_product_ir,
            "remarks": remarks,
            "waste": waste,
            "submission_id": sub.get("id", ""),
        })

    # Viscosity data
    viscosity_values = []
    viscosity_entries = []
    for sub in viscosity_subs:
        dt = sub.get("_parsed_time")
        paired_to = sub.get("auto_paired_to_extruder_id")
        if paired_to and paired_to in extruder_time_by_id:
            dt = extruder_time_by_id[paired_to]
        time_label = dt.strftime("%H:%M") if dt else ""
        measurement = None
        # Be flexible: production Mooney forms differ across versions.
        # Prefer the dedicated "Measurement" field, but accept common variants.
        for key in ("Measurement", "Mooney", "Mooney Viscosity", "Viscosity", "MU"):
            measurement = extract_numeric(sub, key)
            if measurement is not None:
                break
        sample_no = extract_field(sub, "Sample No.")
        if measurement is not None:
            viscosity_values.append(measurement)
            viscosity_entries.append({
                "time": time_label,
                "datetime": _serialize_datetime(dt) if dt else "",
                "sample_no": sample_no,
                "value": measurement,
                "submission_id": sub.get("id", ""),
            })

    # Big Bag Loading data
    big_bag_entries = []
    for sub in big_bag_subs:
        dt = sub.get("_parsed_time")
        time_label = dt.strftime("%H:%M") if dt else ""
        material = extract_field(sub, "Input material") or ""
        supplier = extract_field(sub, "Supplier") or ""
        bag_no = extract_field(sub, "Bag No.") or ""
        lot_no = extract_field(sub, "Lot No.") or ""
        rpd = _production_date_raw_for_big_bag(sub)
        if rpd is not None:
            u = _unwrap_form_value(rpd)
            if isinstance(u, datetime):
                production_date = u.isoformat(sep=" ", timespec="minutes")
            else:
                production_date = str(u).strip() if u not in (None, "") else ""
        else:
            production_date = ""
        equip_label = (sub.get("equipment_name") or "").strip()
        if not equip_label:
            equip_label = EQUIPMENT_NAME
        big_bag_entries.append({
            "time": time_label,
            "datetime": _serialize_datetime(dt) if dt else "",
            "material": material,
            "supplier": supplier,
            "bag_no": bag_no,
            "lot_no": lot_no,
            "production_date": production_date,
            "equipment_name": equip_label,
            "submitted_by": sub.get("submitted_by_name", ""),
            "submission_id": sub.get("id", ""),
        })

    information_entries = []
    for sub in information_subs:
        dt = sub.get("_parsed_time")
        time_label = dt.strftime("%H:%M") if dt else ""
        st = parse_submitted_at(sub)
        if st:
            when_iso = _serialize_datetime(st, force_utc=True)
        elif dt:
            when_iso = _serialize_datetime(dt)
        else:
            when_iso = ""
        text = _information_text_from_submission(sub)
        tpl_name = (sub.get("form_template_name") or "").strip()
        ftid = sub.get("form_template_id")
        information_entries.append({
            "time": time_label,
            "datetime": _serialize_datetime(dt) if dt else "",
            "submitted_at": when_iso,
            "text": text,
            "submitted_by": sub.get("submitted_by_name", ""),
            "submission_id": sub.get("id", ""),
            "form_template_name": tpl_name,
            "form_template_id": str(ftid) if ftid is not None else "",
            "prefill": _submission_prefill_by_field_id(sub),
        })

    # End of Shift data
    end_of_shift_entries = []
    for sub in end_of_shift_subs:
        dt = sub.get("_parsed_time")
        date_time_raw = extract_field(sub, "Date & Time") or ""
        total_input = extract_numeric(sub, "Total Input")
        total_wast = extract_numeric(sub, "Total Wast")
        # Extract notes/comments for display on hover
        notes = sub.get("notes") or ""
        end_of_shift_entries.append({
            "datetime": _serialize_datetime(dt),
            "date_time_raw": date_time_raw,
            "total_input": total_input if total_input is not None else 0,
            "total_waste": total_wast if total_wast is not None else 0,
            "submitted_by": sub.get("submitted_by_name", ""),
            "submission_id": sub.get("id", ""),
            "notes": notes,
        })

    # Waste calculation - only show reported waste; do not fabricate an estimate
    waste_kg = total_waste
    waste_pct = round((waste_kg / total_feed * 100), 2) if total_feed > 0 and waste_kg > 0 else 0
    yield_pct = round(100 - waste_pct, 2) if total_feed > 0 else 0

    # Viscosity + chart series filled after form rows and ingested logs are merged (see below).
    avg_viscosity = 0
    rsd = 0
    runtime_hours = 0.0
    waste_downtime_series = []
    scatter_data = []

    # Viscosity over time series
    viscosity_series = []
    for entry in viscosity_entries:
        viscosity_series.append({
            "time": entry["time"],
            "datetime": entry.get("datetime", ""),
            "viscosity": entry["value"],
            "sample": entry.get("sample_no", ""),
            "submission_id": entry.get("submission_id", ""),
        })

    # Get production actions/insights from dedicated collection
    if is_range:
        event_date_query = {"date": {"$gte": range_start.strftime("%Y-%m-%d"), "$lte": range_end.strftime("%Y-%m-%d")}}
    else:
        event_date_query = {"date": target_date.strftime("%Y-%m-%d")}

    actions_query = {**event_date_query, "type": "action"}
    actions = await db.production_events.find(
        actions_query, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    # Dashboard "Information" panel uses form submissions (information_entries), not production_events insights.
    insights: List[dict] = []

    # Lot info from Big Bag Loading
    lot_info = ""
    if big_bag_entries:
        lots = [e.get("lot_no", "") for e in big_bag_entries if e.get("lot_no")]
        materials = [e.get("material", "") for e in big_bag_entries if e.get("material")]
        if lots:
            lot_info = f"Lot: {lots[0]}"
        if materials:
            lot_info += f" {materials[0]}" if lot_info else materials[0]

    # ── ALWAYS merge ingested production_logs data (not just as fallback) ──
    # This allows data uploaded via Log Ingestion to show alongside form submissions.
    ingested_asset_match = [{"asset_id": {"$regex": "line.?90", "$options": "i"}}]
    _ingest_exact = sorted(t for t in line90_subtree_asset_tokens if t and len(t) <= 200)
    if _ingest_exact:
        ingested_asset_match.append({"asset_id": {"$in": _ingest_exact[:200]}})
    # Ingestion stores missing mapping as "unknown" or leaves field empty
    ingested_asset_match.extend([
        {"asset_id": "unknown"},
        {"asset_id": None},
        {"asset_id": ""},
        {"asset_id": {"$exists": False}},
    ])
    # String range on timestamp misses some stored shapes (e.g. space instead of T). Use calendar-day
    # regex fallbacks, then tighten to shift window when appending rows below.
    _ingest_dates = []
    _scan_d = range_start.date()
    _end_d = range_end.date()
    while _scan_d <= _end_d and len(_ingest_dates) < 45:
        _ingest_dates.append(_scan_d.strftime("%Y-%m-%d"))
        _scan_d += timedelta(days=1)
    ingested_ts_match = [
        {
            "timestamp": {
                "$gte": range_start.strftime("%Y-%m-%dT%H:%M:%S"),
                "$lte": range_end.strftime("%Y-%m-%dT%H:%M:%S"),
            }
        },
    ]
    for _ds in _ingest_dates:
        ingested_ts_match.append({"timestamp": {"$regex": f"^{re.escape(_ds)}"}})
    ingested_query = {
        "$and": [
            {"$or": ingested_asset_match},
            {"$or": ingested_ts_match},
        ]
    }
    # Deduplicate: prefer entries with mooney_viscosity
    pipeline = [
        {"$match": ingested_query},
        {"$addFields": {"_has_visc": {"$cond": [{"$gt": [{"$ifNull": ["$mooney_viscosity", ""]}, ""]}, 1, 0]}}},
        {"$sort": {"timestamp": 1, "_has_visc": -1}},
        {"$group": {"_id": "$timestamp", "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$sort": {"timestamp": 1}},
        {"$project": {"_id": 0, "_has_visc": 0}},
    ]
    ingested = await db.production_logs.aggregate(pipeline).to_list(5000)

    if ingested:
        # NOTE: total_feed (Total Input) is NO LONGER calculated from ingested FEED values.
        # Total Input now comes ONLY from End of Shift entries (see below).
        total_waste_val = 0.0
        for entry in ingested:
            m = entry.get("metrics", {})
            # Extract feed value for display in production_log, but NOT for total_input calculation
            feed_val = 0
            try:
                feed_val = float(m.get("FEED", 0) or 0)
            except (ValueError, TypeError):
                pass

            ts = entry.get("timestamp", "")
            ts_dt = None
            if ts:
                try:
                    ts_dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                    if ts_dt.tzinfo is None:
                        ts_dt = ts_dt.replace(tzinfo=timezone.utc)
                except Exception:
                    ts_dt = None
            if ts_dt is None:
                continue
            if not _in_any_time_window(ts_dt, filter_windows):
                continue

            time_label = ts_dt.strftime("%H:%M")

            rpm = 0
            try: rpm = float(m.get("RPM", 0) or 0)
            except: pass
            moisture = 0
            try:
                moisture = float(m.get("M%", 0) or 0)
                if 0 < moisture < 1:
                    moisture = round(moisture * 100, 1)
            except: pass
            energy = 0
            try: energy = float(m.get("ENERGY", 0) or 0)
            except: pass
            mt1 = 0
            try: mt1 = float(m.get("MT1", 0) or 0)
            except: pass
            mt2 = 0
            try: mt2 = float(m.get("MT2", 0) or 0)
            except: pass
            mt3_raw = m.get("MT3", 0)
            mt3 = 0
            try: mt3 = float(mt3_raw) if mt3_raw and mt3_raw != "-" else 0
            except: pass
            mp1 = 0
            try: mp1 = float(m.get("MP1", 0) or 0)
            except: pass
            mp2 = 0
            try: mp2 = float(m.get("MP2", 0) or 0)
            except: pass
            mp3 = 0
            try: mp3 = float(m.get("MP3", 0) or 0)
            except: pass
            mp4 = 0
            try: mp4 = float(m.get("MP4", 0) or 0)
            except: pass
            co2 = m.get("CO2 Feed/P", "")
            t_prod_ir = 0
            try: t_prod_ir = float(m.get("T Product IR", 0) or 0)
            except: pass

            production_log.append({
                "time": time_label,
                "datetime": _serialize_datetime(ts_dt),
                "submitted_by": "Log Ingestion",
                "rpm": rpm, "feed": feed_val, "moisture": moisture, "energy": energy,
                "mt1": mt1, "mt2": mt2, "mt3": mt3,
                "mp1": mp1, "mp2": mp2, "mp3": mp3, "mp4": mp4,
                "co2_feed_p": co2, "t_product_ir": t_prod_ir,
                "remarks": entry.get("status", ""),
                "waste": 0,
                "submission_id": entry.get("id", ""),
            })

            # Viscosity
            visc_str = entry.get("mooney_viscosity")
            if visc_str:
                try:
                    visc_val = float(visc_str)
                    viscosity_values.append(visc_val)
                    viscosity_series.append({
                        "time": time_label,
                        "datetime": _serialize_datetime(ts_dt),
                        "viscosity": visc_val,
                        "sample": entry.get("sample_id", ""),
                        "submission_id": entry.get("id", ""),
                    })
                except (ValueError, TypeError):
                    pass

            # Magnet cleaning — detect from clean_magnet_status or clean_magnet_time
            magnet_status = str(entry.get("clean_magnet_status") or "").strip().lower()
            magnet_time_val = entry.get("clean_magnet_time")
            has_magnet = (
                magnet_status in ("done", "ok", "yes")
                or (magnet_status and ":" in magnet_status)  # time value like "06:30:00"
                or (magnet_time_val and str(magnet_time_val).strip())
            )
            if has_magnet:
                magnet_subs.append({"_parsed_time": ts_dt})

            # Screen changes — detect from status/remarks text
            status_text = str(entry.get("status") or "").lower()
            if "screen" in status_text and "change" in status_text:
                screen_change_subs.append({"_parsed_time": ts_dt})

            # Input material → big bag entries
            if entry.get("input_material"):
                big_bag_entries.append({
                    "time": time_label,
                    "datetime": _serialize_datetime(ts_dt),
                    "material": entry.get("input_material", ""),
                    "supplier": entry.get("supplier", ""),
                    "bag_no": entry.get("bag_no", ""),
                    "lot_no": entry.get("lot_no", ""),
                    "production_date": entry.get("production_date", ""),
                    "equipment_name": entry.get("asset_id") or EQUIPMENT_NAME,
                    "submitted_by": "Log Ingestion",
                    "submission_id": entry.get("id", ""),
                })

        # Recalculate KPIs from ingested data
        waste_from_entry = 0
        try:
            waste_from_entry = float(ingested[0].get("total_waste", 0) or 0)
        except (ValueError, TypeError):
            pass
        total_waste = waste_from_entry if waste_from_entry > 0 else total_waste
        waste_kg = total_waste
        waste_pct = round((waste_kg / total_feed * 100), 2) if total_feed > 0 else 0
        yield_pct = round(100 - waste_pct, 2) if total_feed > 0 else 0

        # Update lot_info
        if big_bag_entries and not lot_info:
            lots = [e.get("lot_no", "") for e in big_bag_entries if e.get("lot_no")]
            materials_list = [e.get("material", "") for e in big_bag_entries if e.get("material")]
            if lots:
                lot_info = f"Lot: {lots[0]}"
            if materials_list:
                lot_info += f" {materials_list[0]}" if lot_info else materials_list[0]

    # Order log by time after merging form + ingested rows; rebuild series for charts/KPIs.
    def _parse_entry_dt(entry):
        raw = entry.get("datetime") or ""
        if not raw:
            return datetime.min
        try:
            d = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            # Keep naive datetimes naive; convert aware → UTC naive for stable sorting.
            return _sort_key_dt(d)
        except Exception:
            return datetime.min

    production_log.sort(key=_parse_entry_dt)
    big_bag_entries.sort(key=_parse_entry_dt)
    if len(viscosity_values) > 1 and avg_viscosity > 0:
        mean_v = sum(viscosity_values) / len(viscosity_values)
        variance_v = sum((v - mean_v) ** 2 for v in viscosity_values) / (len(viscosity_values) - 1)
        rsd = round((variance_v ** 0.5 / mean_v) * 100, 2)
    else:
        rsd = 0

    waste_downtime_series = []
    for entry in production_log:
        waste_downtime_series.append({
            "time": entry["time"],
            "waste": entry.get("waste", 0),
            "downtime": 0,
            "feed": entry.get("feed", 0),
            "rpm": entry.get("rpm", 0),
        })

    scatter_data = []
    for i, entry in enumerate(production_log):
        visc = viscosity_values[i] if i < len(viscosity_values) else avg_viscosity
        scatter_data.append({
            "feed": entry.get("feed", 0),
            "rpm": entry.get("rpm", 0),
            "viscosity": visc,
            "waste": entry.get("waste", 0),
            "time": entry.get("time", ""),
        })

    if len(production_log) >= 2:
        try:
            t1 = _parse_entry_dt(production_log[0])
            t2 = _parse_entry_dt(production_log[-1])
            runtime_hours = round((t2 - t1).total_seconds() / 3600, 2)
        except Exception:
            runtime_hours = round(len(production_log) * 0.25, 2)
    else:
        runtime_hours = round(len(production_log) * 0.25, 2) if production_log else 0

    # Override Total Input and Total Waste with End of Shift sums when available
    # (This runs AFTER any ingested-data fallback so End of Shift always wins.)
    if end_of_shift_entries:
        total_feed = sum(float(e.get("total_input") or 0) for e in end_of_shift_entries)
        total_waste = sum(float(e.get("total_waste") or 0) for e in end_of_shift_entries)
        waste_kg = total_waste
        waste_pct = round((waste_kg / total_feed * 100), 2) if total_feed > 0 and waste_kg > 0 else 0
        yield_pct = round(100 - waste_pct, 2) if total_feed > 0 else 0

    # Viscosity range string
    visc_range_str = "55-60"
    if viscosity_values:
        visc_range_str = f"{min(viscosity_values):.1f}-{max(viscosity_values):.1f}"

    if not production_log:
        logger.warning(
            "Production dashboard: empty production_log (all_subs=%s submissions=%s extruder=%s ingested=%s range=%s–%s)",
            len(all_subs),
            len(submissions),
            len(extruder_subs),
            len(ingested),
            range_start.isoformat(),
            range_end.isoformat(),
        )

    return {
        "date": target_date.strftime("%Y-%m-%d"),
        "from_date": range_start.strftime("%Y-%m-%d"),
        "to_date": range_end.strftime("%Y-%m-%d"),
        "is_range": is_range,
        "shift": shift_param,
        "shifts": shift_keys,
        "shift_label": shift_label,
        "equipment_name": EQUIPMENT_NAME,
        "kpis": {
            "total_input": round(total_feed, 1),
            "lot_info": lot_info,
            "waste": round(waste_kg, 1),
            "waste_pct": waste_pct,
            "yield_pct": yield_pct,
            "yield_target": 92.0,
            "avg_viscosity": avg_viscosity,
            "viscosity_range": visc_range_str,
            "rsd": rsd,
            "rsd_target": 7,
            "runtime_hours": runtime_hours,
            "shift_hours": shift_hours,
            "sample_count": len(production_log),
            "viscosity_sample_count": len(viscosity_values),
        },
        "production_log": production_log,
        "waste_downtime_series": waste_downtime_series,
        "scatter_data": scatter_data,
        "viscosity_series": viscosity_series,
        "viscosity_values": viscosity_values,
        "big_bag_entries": big_bag_entries,
        "information_entries": information_entries,
        "end_of_shift_entries": end_of_shift_entries,
        "screen_changes": [{"time": s.get("_parsed_time").strftime("%H:%M") if s.get("_parsed_time") else "", "datetime": s.get("_parsed_time").isoformat() if s.get("_parsed_time") else ""} for s in screen_change_subs],
        "magnet_cleanings": [{"time": s.get("_parsed_time").strftime("%H:%M") if s.get("_parsed_time") else "", "datetime": s.get("_parsed_time").isoformat() if s.get("_parsed_time") else ""} for s in magnet_subs],
        "actions": actions,
        "insights": insights,
        "submissions_count": len(submissions),
    }


@router.get("/production/events")
async def get_production_events(
    date: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None, description="action or insight"),
    current_user: dict = Depends(get_current_user),
):
    """Get production events/actions/insights for a given date."""
    query = {}
    if date:
        query["date"] = date
    if event_type:
        query["type"] = event_type

    events = await db.production_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"events": events, "total": len(events)}


@router.post("/production/events")
async def create_production_event(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Create a production action or insight event."""
    event = {
        "id": str(uuid.uuid4()),
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "type": data.get("type", "action"),
        "severity": data.get("severity", "info"),
        "date": data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "time": data.get("time", datetime.now(timezone.utc).strftime("%H:%M")),
        "equipment_name": EQUIPMENT_NAME,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", ""),
        "created_at": _serialize_datetime(datetime.now(timezone.utc)),
    }
    await db.production_events.insert_one(event)
    # Remove MongoDB _id before returning
    event.pop("_id", None)
    return event


@router.delete("/production/events/{event_id}")
async def delete_production_event(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a production event."""
    result = await db.production_events.delete_one({"id": event_id})
    if result.deleted_count == 0:
        return {"error": "Event not found"}
    return {"status": "deleted", "id": event_id}


@router.patch("/production/submission/{submission_id}")
async def update_production_submission(
    submission_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update field values on a production form submission OR an ingested production_logs entry."""
    updates = data.get("values", {})
    if not updates:
        raise HTTPException(status_code=400, detail="No values provided")

    sub = await db.form_submissions.find_one({"id": submission_id}, {"_id": 0})
    if sub:
        # Update matching fields in the values array (case-insensitive, space/underscore normalized)
        updates_lower = {k.lower(): v for k, v in updates.items()}
        new_values = []
        matched_count = 0
        for v in sub.get("values", []):
            label = v.get("field_label", "")
            fid = v.get("field_id", "")
            label_lower = label.lower()
            fid_lower = fid.lower()
            label_norm = label_lower.replace(" ", "_")
            fid_norm = fid_lower.replace(" ", "_")
            matched_key = None
            for k in updates_lower:
                k_norm = k.replace(" ", "_")
                if k == label_lower or k == fid_lower or k_norm == label_norm or k_norm == fid_norm:
                    matched_key = k
                    break
            if matched_key is not None:
                old_val = v.get("value")
                new_val = str(updates_lower[matched_key])
                if old_val != new_val:
                    logger.info(f"PATCH {submission_id[:15]}: '{label}' {old_val} -> {new_val}")
                new_values.append({**v, "value": new_val})
                matched_count += 1
            else:
                new_values.append(v)

        if matched_count == 0:
            logger.warning(f"PATCH {submission_id[:15]}: NO fields matched! sent={list(updates.keys())}, db={[v.get('field_label','') for v in sub.get('values',[])]}")

        await db.form_submissions.update_one(
            {"id": submission_id},
            {"$set": {"values": new_values, "updated_at": _serialize_datetime(datetime.now(timezone.utc))}}
        )
        return {"status": "updated", "source": "form_submission", "id": submission_id, "matched_fields": matched_count}

    # Fallback: try the ingested production_logs collection
    log_entry = await db.production_logs.find_one({"id": submission_id}, {"_id": 0})
    if not log_entry:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Map frontend field labels to production_logs schema
    # Metrics live in `metrics` dict, viscosity in top-level `mooney_viscosity`, remarks in `status`.
    metrics_keys = {"RPM", "FEED", "M%", "ENERGY", "MT1", "MT2", "MT3",
                    "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR"}
    # Build case-insensitive lookup
    updates_norm = {str(k).strip(): v for k, v in updates.items()}
    updates_ci = {k.lower(): (k, v) for k, v in updates_norm.items()}

    set_ops = {}
    matched = 0
    current_metrics = dict(log_entry.get("metrics") or {})

    for mk in metrics_keys:
        hit = updates_ci.get(mk.lower())
        if hit is None:
            continue
        _, raw_val = hit
        # Preserve numeric type where possible
        try:
            current_metrics[mk] = float(raw_val) if raw_val not in (None, "") else raw_val
        except (ValueError, TypeError):
            current_metrics[mk] = raw_val
        matched += 1

    if any(k.lower() in updates_ci for k in ("RPM", "FEED", "M%", "ENERGY", "MT1", "MT2", "MT3",
                                              "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR")):
        set_ops["metrics"] = current_metrics

    # Viscosity ("Measurement" or "Mooney" or "mooney_viscosity")
    for visc_key in ("measurement", "mooney", "mooney_viscosity", "viscosity"):
        if visc_key in updates_ci:
            _, v = updates_ci[visc_key]
            try:
                set_ops["mooney_viscosity"] = float(v) if v not in (None, "") else None
            except (ValueError, TypeError):
                set_ops["mooney_viscosity"] = v
            matched += 1
            break

    # Remarks
    if "remarks" in updates_ci:
        _, v = updates_ci["remarks"]
        set_ops["status"] = v
        matched += 1

    if not set_ops:
        logger.warning(f"PATCH production_log {submission_id[:15]}: no matching keys. sent={list(updates.keys())}")
        raise HTTPException(status_code=400, detail="No matching fields to update")

    set_ops["updated_at"] = _serialize_datetime(datetime.now(timezone.utc))
    await db.production_logs.update_one({"id": submission_id}, {"$set": set_ops})
    logger.info(f"PATCH production_log {submission_id[:15]}: updated {matched} fields ({list(set_ops.keys())})")
    return {"status": "updated", "source": "production_log", "id": submission_id, "matched_fields": matched}


@router.post("/production/create-viscosity")
async def create_viscosity_submission(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new Mooney Viscosity form submission.
    Used when adding viscosity to an extruder entry that doesn't have a linked viscosity sample.
    
    Expected data:
    - datetime: ISO datetime string (must match extruder entry's date_&_time)
    - measurement: viscosity value (MU)
    """
    import uuid
    
    datetime_val = data.get("datetime")
    measurement = data.get("measurement")
    
    if not datetime_val or measurement is None:
        raise HTTPException(status_code=400, detail="datetime and measurement are required")
    
    # Find the Mooney Viscosity template (try multiple possible names/IDs)
    visc_template = await db.form_templates.find_one(
        {"name": {"$regex": "^mooney viscosity sample$", "$options": "i"}}
    )
    
    if not visc_template:
        raise HTTPException(status_code=404, detail="Mooney Viscosity template not found")
    
    # Get template ID (could be UUID 'id' or ObjectId '_id')
    template_id = str(visc_template.get("_id")) if visc_template.get("_id") else visc_template.get("id")
    template_name = visc_template.get("name", "Mooney viscosity sample")
    
    # Find Line-90 equipment for consistent equipment assignment
    line90 = await db.equipment_nodes.find_one(
        {"name": {"$regex": "Line.?90", "$options": "i"}}, {"_id": 0, "id": 1, "name": 1}
    )
    equipment_id = line90.get("id") if line90 else ""
    equipment_name = line90.get("name", "Line-90") if line90 else "Line-90"
    
    # Create the form submission
    submission_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    submission = {
        "id": submission_id,
        "form_template_id": template_id,
        "form_template_name": template_name,
        "equipment_id": equipment_id,
        "equipment_name": equipment_name,
        "submitted_by": current_user.get("id"),
        "submitted_by_name": current_user.get("name", "Unknown"),
        "submitted_at": now,
        "values": [
            {
                "field_id": "date_&_time",
                "field_label": "date_&_time",
                "field_type": "datetime",
                "value": datetime_val,
            },
            {
                "field_id": "measurement",
                "field_label": "measurement",
                "field_type": "number",
                "value": str(measurement),
            },
        ],
        "created_at": now,
        "updated_at": now,
    }
    
    await db.form_submissions.insert_one(submission)
    logger.info(f"Created new viscosity submission {submission_id} for datetime {datetime_val}, measurement={measurement}")
    
    # Trigger auto-pairing
    try:
        from services.form_service import FormService
        svc = FormService(db)
        await svc._auto_pair_viscosity_to_extruder(submission)
    except Exception as e:
        logger.warning(f"Auto-pairing failed for new viscosity submission: {e}")
    
    return {
        "status": "created",
        "id": submission_id,
        "datetime": datetime_val,
        "measurement": measurement,
    }


@router.get("/production/viscosity-pairing/status")
async def viscosity_pairing_status(
    date: str = Query(..., description="YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
):
    """
    Diagnostics for why viscosity pairing shows TBD.
    Returns:
    - extruder times (forms + ingested)
    - viscosity times (forms + ingested)
    - missing viscosity times (extruder time not in viscosity time)
    """
    _require_owner_or_admin(current_user)

    try:
        target_day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    day_start = datetime.combine(target_day, datetime.min.time()).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_day, datetime.max.time()).replace(tzinfo=timezone.utc)

    # Pull all relevant form submissions (broad query, then filter by extracted Date & Time)
    form_patterns = "|".join([p.replace(" ", "\\s*") for p in PRODUCTION_FORMS])
    query = {"form_template_name": {"$regex": f"^({form_patterns}).*$", "$options": "i"}}
    subs = await db.form_submissions.find(query, {"_id": 0}).to_list(2000)

    def _time_hhmm(sub):
        raw = _extract_date_time_field_raw(sub)
        dt_form = _parse_sample_datetime(raw) if raw else None
        dt = dt_form if dt_form is not None else parse_submitted_at(sub)
        if not dt:
            return None, None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if not (day_start <= dt <= day_end):
            return None, None
        return dt, dt.strftime("%H:%M")

    extruder_form_times = []
    visc_form_times = []
    for s in subs:
        tpl = (s.get("form_template_name") or "").lower()
        dt, hhmm = _time_hhmm(s)
        if not hhmm:
            continue
        if "extruder" in tpl and "setting" in tpl:
            extruder_form_times.append(hhmm)
        if "mooney" in tpl and "viscos" in tpl:
            visc_form_times.append(hhmm)

    # Ingested production logs (Line-90)
    day_start_iso = f"{date}T00:00:00"
    day_end_iso = f"{date}T23:59:59"
    ingested = await db.production_logs.find(
        {"asset_id": {"$regex": "line.?90", "$options": "i"}, "timestamp": {"$gte": day_start_iso, "$lte": day_end_iso}},
        {"_id": 0, "timestamp": 1, "mooney_viscosity": 1},
    ).to_list(5000)
    extruder_ingested_times = []
    visc_ingested_times = []
    for row in ingested:
        ts = row.get("timestamp")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except Exception:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt.date() != target_day:
            continue
        hhmm = dt.strftime("%H:%M")
        extruder_ingested_times.append(hhmm)
        if row.get("mooney_viscosity") not in (None, "", "-"):
            visc_ingested_times.append(hhmm)

    extruder_times = sorted(set(extruder_form_times) | set(extruder_ingested_times))
    viscosity_times = sorted(set(visc_form_times) | set(visc_ingested_times))
    missing = [t for t in extruder_times if t not in viscosity_times]

    return {
        "date": date,
        "extruder_times": extruder_times,
        "viscosity_times": viscosity_times,
        "missing_viscosity_times": missing,
        "counts": {
            "extruder_form": len(set(extruder_form_times)),
            "extruder_ingested": len(set(extruder_ingested_times)),
            "visc_form": len(set(visc_form_times)),
            "visc_ingested": len(set(visc_ingested_times)),
        },
    }


@router.post("/production/viscosity-pairing/repair")
async def repair_viscosity_pairing(
    date: str = Query(..., description="YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    """
    Re-run viscosity auto-pairing for already-submitted Mooney samples on a given day.
    Useful when pairing logic changed or ingestion/form timing was off.
    """
    try:
        target_day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    day_start = datetime.combine(target_day, datetime.min.time()).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_day, datetime.max.time()).replace(tzinfo=timezone.utc)

    # Find Mooney viscosity submissions broadly (including versioned template names)
    visc_subs = await db.form_submissions.find(
        {"form_template_name": {"$regex": r"mooney.*(viscos|sample)", "$options": "i"}},
        {"_id": 0},
    ).to_list(2000)

    def _extract_dt_for_filter(sub):
        raw = _extract_date_time_field_raw(sub)
        dt_form = _parse_sample_datetime(raw) if raw else None
        dt = dt_form if dt_form is not None else parse_submitted_at(sub)
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    # Only keep those whose effective datetime is on the target day
    day_visc = []
    for s in visc_subs:
        dt = _extract_dt_for_filter(s)
        if not dt:
            continue
        if day_start <= dt <= day_end:
            day_visc.append(s)

    # Pair in chronological order (stable)
    day_visc.sort(key=lambda s: (_extract_dt_for_filter(s) or day_start))
    day_visc = day_visc[:limit]

    from services.form_service import FormService
    svc = FormService(db)

    repaired = 0
    paired = []
    skipped = []
    for s in day_visc:
        try:
            await svc._auto_pair_viscosity_to_extruder(s)
            repaired += 1
            updated = await db.form_submissions.find_one(
                {"id": s.get("id")},
                {"_id": 0, "id": 1, "auto_paired_to_extruder_id": 1},
            )
            paired_to = (updated or {}).get("auto_paired_to_extruder_id")
            if paired_to:
                paired.append({"visc_id": s.get("id"), "paired_to": paired_to})
            else:
                skipped.append({"visc_id": s.get("id"), "reason": "no_pair"})
        except Exception as e:
            logger.warning(f"Repair viscosity pairing failed for {str(s.get('id',''))[:8]}: {e}")
            skipped.append({"visc_id": s.get("id"), "reason": f"error:{e}"})

    return {
        "date": date,
        "processed": len(day_visc),
        "attempted_repairs": repaired,
        "paired": paired,
        "skipped": skipped,
    }


@router.get("/production/viscosity-pairing/debug-report")
async def viscosity_pairing_debug_report(
    date: str = Query(..., description="YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a detailed pairing report for analysis (authenticated users).
    Includes:
    - extruder slots (forms + ingested)
    - viscosity slots (forms + ingested)
    - how the API would key each item (HH:MM)
    - which extruder slots are missing viscosity
    """
    try:
        target_day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    day_start = datetime.combine(target_day, datetime.min.time()).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_day, datetime.max.time()).replace(tzinfo=timezone.utc)

    # --- Form submissions ---
    subs = await db.form_submissions.find(
        {"form_template_name": {"$regex": r"(extruder.*setting|mooney.*(viscos|sample))", "$options": "i"}},
        {"_id": 0},
    ).to_list(5000)

    def _extract_form_dt_raw(sub):
        # Prefer the canonical Date & Time lookup used by the production dashboard,
        # but fall back to any "datetime-like" field label/id so we still report what
        # the operator entered even if the label differs (e.g. "Datetime").
        raw = extract_field(sub, "Date & Time")
        if raw:
            return raw, "Date & Time"

        for v in sub.get("values", []) or []:
            label = str(v.get("field_label") or "").strip().lower()
            fid = str(v.get("field_id") or "").strip().lower()
            is_dt_like = (
                ("date" in label and "time" in label)
                or ("date/time" in label)
                or ("datetime" in label)
                or (fid.replace("_", " ").strip() == "date & time")
                or (fid == "date_&_time")
            )
            if is_dt_like and v.get("value"):
                return v.get("value"), f"values:{v.get('field_label') or v.get('field_id')}"
        return None, None

    def _parse_dt(raw):
        if not raw:
            return None
        try:
            dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except Exception:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    def _effective_dt(sub):
        # "Effective dt" is what the report code will key on. This is based on the
        # form-entered Date & Time when present; otherwise it falls back to submitted_at.
        raw, _src = _extract_form_dt_raw(sub)
        dt = _parse_dt(raw) if raw else parse_submitted_at(sub)
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    def _measurement(sub):
        # mirrors the flexible extraction in the dashboard route
        for key in ("Measurement", "Mooney", "Mooney Viscosity", "Viscosity", "MU"):
            v = extract_numeric(sub, key)
            if v is not None:
                return v, key
        return None, None

    extruder_forms = []
    viscosity_forms = []
    for s in subs:
        dt = _effective_dt(s)
        if not dt or not (day_start <= dt <= day_end):
            continue
        hhmm = dt.strftime("%H:%M")
        tpl = (s.get("form_template_name") or "").strip()
        sid = s.get("id", "")
        ftid = s.get("form_template_id")
        ftid_type = type(ftid).__name__ if ftid is not None else None
        form_dt_raw, form_dt_src = _extract_form_dt_raw(s)
        form_dt_parsed = _parse_dt(form_dt_raw)

        if ("extruder" in tpl.lower()) and ("setting" in tpl.lower()):
            extruder_forms.append({
                "source": "form",
                "id": sid,
                "form_template_id": str(ftid) if ftid is not None else None,
                "form_template_id_type": ftid_type,
                "template": tpl,
                "hhmm": hhmm,
                "datetime": _serialize_datetime(dt),
                "form_date_time_raw": form_dt_raw,
                "form_date_time_source": form_dt_src,
                "form_date_time_parsed": _serialize_datetime(form_dt_parsed) if form_dt_parsed else "",
                "submitted_at": str(s.get("submitted_at") or ""),
            })
        if ("mooney" in tpl.lower()) and (("viscos" in tpl.lower()) or ("sample" in tpl.lower())):
            meas, meas_key = _measurement(s)
            viscosity_forms.append({
                "source": "form",
                "id": sid,
                "form_template_id": str(ftid) if ftid is not None else None,
                "form_template_id_type": ftid_type,
                "template": tpl,
                "hhmm": hhmm,
                "datetime": _serialize_datetime(dt),
                "form_date_time_raw": form_dt_raw,
                "form_date_time_source": form_dt_src,
                "form_date_time_parsed": _serialize_datetime(form_dt_parsed) if form_dt_parsed else "",
                "measurement": meas,
                "measurement_field": meas_key,
                "auto_paired_to_extruder_id": s.get("auto_paired_to_extruder_id"),
                "submitted_at": str(s.get("submitted_at") or ""),
            })

    # --- Ingested production logs ---
    day_start_iso = f"{date}T00:00:00"
    day_end_iso = f"{date}T23:59:59"
    ingested = await db.production_logs.find(
        {"asset_id": {"$regex": "line.?90", "$options": "i"}, "timestamp": {"$gte": day_start_iso, "$lte": day_end_iso}},
        {"_id": 0, "id": 1, "timestamp": 1, "mooney_viscosity": 1},
    ).to_list(5000)

    extruder_ingested = []
    viscosity_ingested = []
    for row in ingested:
        ts = row.get("timestamp")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except Exception:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt.date() != target_day:
            continue
        hhmm = dt.strftime("%H:%M")
        extruder_ingested.append({
            "source": "ingested",
            "id": row.get("id", ""),
            "hhmm": hhmm,
            "datetime": _serialize_datetime(dt),
            "timestamp": ts,
        })
        if row.get("mooney_viscosity") not in (None, "", "-"):
            viscosity_ingested.append({
                "source": "ingested",
                "id": row.get("id", ""),
                "hhmm": hhmm,
                "datetime": _serialize_datetime(dt),
                "timestamp": ts,
                "measurement": row.get("mooney_viscosity"),
            })

    extruder_slots = sorted(extruder_forms + extruder_ingested, key=lambda x: (x.get("hhmm") or ""))
    viscosity_slots = sorted(viscosity_forms + viscosity_ingested, key=lambda x: (x.get("hhmm") or ""))

    extruder_times = sorted({s["hhmm"] for s in extruder_slots if s.get("hhmm")})
    viscosity_times = sorted({s["hhmm"] for s in viscosity_slots if s.get("hhmm")})
    missing = [t for t in extruder_times if t not in viscosity_times]

    # Include the exact payload the report page uses (single-day mode).
    # Keep sizes bounded so the downloaded JSON stays usable.
    try:
        report_payload = await get_production_dashboard(
            date=date,
            from_date=None,
            to_date=None,
            shift="day",
            current_user=current_user,
        )
    except Exception as e:
        report_payload = {"error": f"Failed to generate report payload: {e}"}

    def _clip_list(v, limit=250):
        if not isinstance(v, list):
            return v
        return v[:limit]

    if isinstance(report_payload, dict):
        report_payload_clipped = dict(report_payload)
        for k in ("production_log", "viscosity_series", "big_bag_entries", "information_entries", "end_of_shift_entries", "actions", "insights"):
            if k in report_payload_clipped:
                report_payload_clipped[k] = _clip_list(report_payload_clipped.get(k))
    else:
        report_payload_clipped = report_payload

    # Add a dry-run pairing probe for each viscosity form submission in the report.
    pairing_probe = {}
    try:
        from services.form_service import FormService
        svc = FormService(db)
        for v in viscosity_forms[:20]:
            vid = v.get("id")
            if not vid:
                continue
            sub = await db.form_submissions.find_one({"id": vid}, {"_id": 0})
            if not sub:
                continue
            pairing_probe[vid] = await svc._auto_pair_viscosity_to_extruder(sub, dry_run=True)
    except Exception as e:
        pairing_probe = {"error": str(e)}

    return {
        "report_version": 2,
        "generated_at": _serialize_datetime(datetime.now(timezone.utc)),
        "date": date,
        "counts": {
            "extruder_forms": len(extruder_forms),
            "extruder_ingested": len(extruder_ingested),
            "viscosity_forms": len(viscosity_forms),
            "viscosity_ingested": len(viscosity_ingested),
            "missing_times": len(missing),
        },
        "missing_viscosity_times": missing,
        "extruder_slots": extruder_slots,
        "viscosity_slots": viscosity_slots,
        "report_page_payload": report_payload_clipped,
        "pairing_probe": pairing_probe,
    }


@router.delete("/production/seed-data")
async def clear_seed_data(
    current_user: dict = Depends(get_current_user),
):
    """Clear all seeded production sample data. Use this to remove demo data."""
    # Delete seeded form submissions
    result_subs = await db.form_submissions.delete_many({"_seeded": True})
    # Delete seeded production events
    result_events = await db.production_events.delete_many({"_seeded": True})
    return {
        "status": "cleared",
        "submissions_deleted": result_subs.deleted_count,
        "events_deleted": result_events.deleted_count,
    }


@router.post("/production/ai-insights")
async def generate_ai_insights(
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Generate AI-powered daily insights by analyzing the current production data."""
    import os
    from services.openai_service import chat_completion

    date = data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    production_log = data.get("production_log", [])
    viscosity_values = data.get("viscosity_values", [])
    kpis = data.get("kpis", {})

    # Build the analysis prompt
    log_text = ""
    for entry in production_log:
        log_text += f"  {entry.get('time','')} | RPM:{entry.get('rpm','')} Feed:{entry.get('feed','')} M%:{entry.get('moisture','')} Energy:{entry.get('energy','')} MT1:{entry.get('mt1','')} MT2:{entry.get('mt2','')} MT3:{entry.get('mt3','')} MP4:{entry.get('mp4','')} CO2:{entry.get('co2_feed_p','')} T_IR:{entry.get('t_product_ir','')} Waste:{entry.get('waste','')} Remarks:{entry.get('remarks','')}\n"

    visc_text = ", ".join([str(v) for v in viscosity_values]) if viscosity_values else "No samples"

    kpi_text = f"""Total Input: {kpis.get('total_input', 0)} kg
Waste: {kpis.get('waste', 0)} kg ({kpis.get('waste_pct', 0)}%)
Yield: {kpis.get('yield_pct', 0)}% (target: {kpis.get('yield_target', 92)}%)
Avg Mooney Viscosity: {kpis.get('avg_viscosity', 0)} MU (range: {kpis.get('viscosity_range', '55-60')})
RSD: {kpis.get('rsd', 0)}% (target: <{kpis.get('rsd_target', 7)}%)
Runtime: {kpis.get('runtime_hours', 0)} hours
Samples: {kpis.get('sample_count', 0)} extruder, {kpis.get('viscosity_sample_count', 0)} viscosity"""

    prompt = f"""Analyze this production data for Line-90 extruder on {date} and generate 3-5 concise daily insights.

KPIs:
{kpi_text}

Mooney Viscosity samples: {visc_text}

Production Log:
{log_text}

Rules:
- Each insight should have a severity: critical, warning, success, or info
- Focus on anomalies, trends, quality issues, and operational efficiency
- Be specific with times and values
- Keep each insight title under 50 chars, description under 100 chars
- Return ONLY valid JSON array, no markdown, no explanation

Format:
[{{"title": "...", "description": "...", "severity": "critical|warning|success|info", "time": "HH:MM"}}]"""

    try:
        messages = [
            {"role": "system", "content": "You are a production engineer AI assistant analyzing extruder and rubber compound production data. Return only valid JSON."},
            {"role": "user", "content": prompt}
        ]
        
        response = await chat_completion(
            messages=messages,
            model="gpt-4o",
            temperature=0.7
        )

        # Parse JSON response
        import json as json_module
        # Strip markdown code blocks if present
        clean = response.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()

        insights = json_module.loads(clean)

        # Delete existing AI insights for this date
        await db.production_events.delete_many({"date": date, "type": "insight", "_ai_generated": True})

        # Save new AI insights
        saved = []
        for ins in insights:
            event = {
                "id": str(uuid.uuid4()),
                "title": ins.get("title", ""),
                "description": ins.get("description", ""),
                "type": "insight",
                "severity": ins.get("severity", "info"),
                "date": date,
                "time": ins.get("time", ""),
                "equipment_name": EQUIPMENT_NAME,
                "created_by": current_user["id"],
                "created_by_name": "AI",
                "created_at": _serialize_datetime(datetime.now(timezone.utc)),
                "_ai_generated": True,
            }
            await db.production_events.insert_one(event)
            event.pop("_id", None)
            saved.append(event)

        return {"status": "ok", "insights": saved, "count": len(saved)}

    except Exception as e:
        logger.error(f"AI insights generation failed: {e}")
        return {"status": "error", "error": str(e), "insights": []}


@router.post("/production/machine-analysis")
async def generate_machine_analysis(
    data: dict = None,
    current_user: dict = Depends(get_current_user),
):
    """AI-powered analysis of production data to determine optimal machine settings. Accepts optional date range."""
    import statistics
    from services.openai_service import chat_completion

    data = data or {}
    start = data.get("start")
    end = data.get("end")

    # Build match filter
    match_filter = {"mooney_viscosity": {"$exists": True, "$ne": None, "$ne": ""}}
    if start and end:
        match_filter["timestamp"] = {"$gte": f"{start}T00:00:00", "$lte": f"{end}T23:59:59"}
    elif start:
        match_filter["timestamp"] = {"$gte": f"{start}T00:00:00"}

    # Aggregate entries with viscosity data (deduplicated)
    pipeline = [
        {"$match": match_filter},
        {"$sort": {"timestamp": 1}},
        {"$group": {"_id": {"timestamp": "$timestamp", "asset_id": "$asset_id"}, "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$sort": {"timestamp": 1}},
        {"$project": {"_id": 0}},
    ]
    entries = await db.production_logs.aggregate(pipeline).to_list(5000)

    if len(entries) < 3:
        return {"status": "error", "error": f"Not enough data for analysis in this period (found {len(entries)} entries, need at least 3)"}

    date_range = {"start": start or "all", "end": end or "all"}

    # Compute per-day aggregates
    days = {}
    for e in entries:
        m = e.get("metrics", {})
        try:
            visc = float(e["mooney_viscosity"])
        except (ValueError, TypeError):
            continue

        date = e.get("timestamp", "")[:10]
        if date not in days:
            days[date] = {"viscosities": [], "rpms": [], "feeds": [], "moistures": [],
                          "mt1s": [], "mt2s": [], "mt3s": [], "energies": [],
                          "mp1s": [], "mp4s": [], "waste": 0, "material": ""}

        days[date]["viscosities"].append(visc)
        try: days[date]["rpms"].append(float(m.get("RPM", 0) or 0))
        except: pass
        try: days[date]["feeds"].append(float(m.get("FEED", 0) or 0))
        except: pass
        try:
            moist = float(m.get("M%", 0) or 0)
            if 0 < moist < 1:
                moist = round(moist * 100, 1)
            if moist > 0:
                days[date]["moistures"].append(moist)
        except: pass
        try: days[date]["energies"].append(float(m.get("ENERGY", 0) or 0))
        except: pass
        try: days[date]["mt1s"].append(float(m.get("MT1", 0) or 0))
        except: pass
        try: days[date]["mt2s"].append(float(m.get("MT2", 0) or 0))
        except: pass
        try: days[date]["mt3s"].append(float(m.get("MT3", 0) or 0))
        except: pass
        try: days[date]["mp1s"].append(float(m.get("MP1", 0) or 0))
        except: pass
        try: days[date]["mp4s"].append(float(m.get("MP4", 0) or 0))
        except: pass

        waste = e.get("total_waste")
        if waste:
            try: days[date]["waste"] = float(waste)
            except: pass
        mat = e.get("input_material")
        if mat:
            days[date]["material"] = mat

    # Build daily summaries
    daily_summaries = []
    all_visc = []
    good_days = []  # days where avg viscosity is 50-60 and RSD < 5
    bad_days = []

    for date, d in sorted(days.items()):
        if not d["viscosities"]:
            continue
        avg_visc = statistics.mean(d["viscosities"])
        visc_std = statistics.stdev(d["viscosities"]) if len(d["viscosities"]) > 1 else 0
        rsd = (visc_std / avg_visc * 100) if avg_visc > 0 else 0
        avg_rpm = statistics.mean(d["rpms"]) if d["rpms"] else 0
        avg_feed = statistics.mean(d["feeds"]) if d["feeds"] else 0
        avg_moist = statistics.mean(d["moistures"]) if d["moistures"] else 0
        avg_mt1 = statistics.mean(d["mt1s"]) if d["mt1s"] else 0
        avg_mt2 = statistics.mean(d["mt2s"]) if d["mt2s"] else 0
        avg_mt3 = statistics.mean(d["mt3s"]) if d["mt3s"] else 0
        avg_energy = statistics.mean(d["energies"]) if d["energies"] else 0

        in_range = 50 <= avg_visc <= 60
        low_rsd = rsd < 5

        summary = {
            "date": date, "samples": len(d["viscosities"]),
            "avg_visc": round(avg_visc, 2), "rsd": round(rsd, 2),
            "avg_rpm": round(avg_rpm, 1), "avg_feed": round(avg_feed, 1),
            "avg_moisture": round(avg_moist, 3), "avg_energy": round(avg_energy, 2),
            "avg_mt1": round(avg_mt1, 1), "avg_mt2": round(avg_mt2, 1), "avg_mt3": round(avg_mt3, 1),
            "waste": d["waste"], "material": d["material"],
            "in_target": in_range, "low_rsd": low_rsd,
        }
        daily_summaries.append(summary)
        all_visc.extend(d["viscosities"])

        if in_range and low_rsd:
            good_days.append(summary)
        elif not in_range or rsd > 7:
            bad_days.append(summary)

    # Compute overall stats
    overall_avg = statistics.mean(all_visc) if all_visc else 0
    overall_std = statistics.stdev(all_visc) if len(all_visc) > 1 else 0
    in_target_pct = sum(1 for v in all_visc if 50 <= v <= 60) / len(all_visc) * 100 if all_visc else 0

    # Sort good days by RSD (best first)
    good_days.sort(key=lambda x: x["rsd"])
    bad_days.sort(key=lambda x: abs(x["avg_visc"] - 55), reverse=True)

    # Build GPT prompt
    good_text = "\n".join([
        f"  {d['date']}: Visc={d['avg_visc']}MU RSD={d['rsd']}% RPM={d['avg_rpm']} Feed={d['avg_feed']} M%(MotorTorque)={d['avg_moisture']} MT1={d['avg_mt1']} MT2={d['avg_mt2']} MT3={d['avg_mt3']} Waste={d['waste']}kg"
        for d in good_days[:30]
    ])
    bad_text = "\n".join([
        f"  {d['date']}: Visc={d['avg_visc']}MU RSD={d['rsd']}% RPM={d['avg_rpm']} Feed={d['avg_feed']} M%(MotorTorque)={d['avg_moisture']} MT1={d['avg_mt1']} MT2={d['avg_mt2']} MT3={d['avg_mt3']} Waste={d['waste']}kg"
        for d in bad_days[:20]
    ])

    range_desc = f"from {start} to {end}" if start and end else "all historical data"
    prompt = f"""You are analyzing production data for a Line-90 rubber compound extruder ({range_desc}) to determine OPTIMAL MACHINE SETTINGS.

OVERALL STATISTICS ({len(all_visc)} samples across {len(daily_summaries)} production days, period: {range_desc}):
- Mean Viscosity: {overall_avg:.2f} MU (target: 50-60 MU)
- Std Dev: {overall_std:.2f} MU
- In Target Range: {in_target_pct:.1f}%
- Total production days analyzed: {len(daily_summaries)}
- Good days (visc 50-60 & RSD<5%): {len(good_days)}
- Problematic days: {len(bad_days)}

BEST PERFORMING DAYS (viscosity in range, low variation):
{good_text}

WORST PERFORMING DAYS (out of range or high variation):
{bad_text}

CONTROLLABLE INPUTS: RPM, Feed rate (kg/h), M% (Motor Torque percentage, shown as 80-90 not 0.80-0.90), MT1/MT2/MT3 (temperatures)
QUALITY OUTCOMES: Mooney Viscosity (target 50-60 MU), RSD (target <5%), Waste (minimize)

Analyze the data and provide:

1. **optimal_settings**: The recommended settings for each controllable input (RPM, Feed, M% (Motor Torque), MT1, MT2, MT3) with specific values and acceptable ranges.

2. **key_findings**: 3-5 key statistical findings about what drives good vs bad days. Be specific with numbers.

3. **correlations**: What input parameters most strongly correlate with viscosity being in/out of target range?

4. **risk_factors**: Settings combinations that tend to produce out-of-spec results.

5. **improvement_recommendations**: 3-5 specific, actionable recommendations to improve the {100-in_target_pct:.1f}% of samples currently out of target.

Return ONLY valid JSON with this structure:
{{
  "optimal_settings": {{
    "RPM": {{"recommended": 165, "range": [160, 170], "unit": "rpm"}},
    "Feed": {{"recommended": 520, "range": [500, 540], "unit": "kg/h"}},
    "Motor_Torque": {{"recommended": 85, "range": [80, 90], "unit": "%"}},
    "MT1": {{"recommended": 210, "range": [200, 220], "unit": "°C"}},
    "MT2": {{"recommended": 168, "range": [160, 175], "unit": "°C"}},
    "MT3": {{"recommended": 155, "range": [145, 165], "unit": "°C"}}
  }},
  "key_findings": ["finding1", "finding2", ...],
  "correlations": ["correlation1", "correlation2", ...],
  "risk_factors": ["risk1", "risk2", ...],
  "improvement_recommendations": ["rec1", "rec2", ...],
  "summary": "2-3 sentence executive summary"
}}"""

    try:
        messages = [
            {"role": "system", "content": "You are an expert production engineer and data scientist specializing in rubber compound extrusion and Mooney viscosity optimization. Analyze the data rigorously and provide specific, actionable recommendations. Return only valid JSON."},
            {"role": "user", "content": prompt}
        ]

        response = await chat_completion(
            messages=messages,
            model="gpt-4o",
            temperature=0.3
        )

        # Parse JSON response
        import json as json_module
        clean = response.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()

        analysis = json_module.loads(clean)

        # Save analysis to DB
        analysis_doc = {
            "id": str(uuid.uuid4()),
            "type": "machine_analysis",
            "equipment": EQUIPMENT_NAME,
            "analysis": analysis,
            "date_range": date_range,
            "stats": {
                "total_samples": len(all_visc),
                "total_days": len(daily_summaries),
                "good_days": len(good_days),
                "bad_days": len(bad_days),
                "in_target_pct": round(in_target_pct, 1),
                "avg_viscosity": round(overall_avg, 2),
                "std_viscosity": round(overall_std, 2),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"],
        }
        await db.production_analyses.insert_one(analysis_doc)
        analysis_doc.pop("_id", None)

        return {"status": "ok", "analysis": analysis, "stats": analysis_doc["stats"], "date_range": date_range}

    except Exception as e:
        logger.error(f"Machine analysis failed: {e}")
        return {"status": "error", "error": str(e)}


@router.get("/production/machine-analysis")
async def get_latest_analysis(
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get the most recent machine analysis, optionally filtered by date range."""
    query = {"type": "machine_analysis"}
    if start and end:
        query["date_range.start"] = start
        query["date_range.end"] = end

    doc = await db.production_analyses.find_one(
        query,
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    if not doc:
        return {"status": "empty", "analysis": None}
    return {"status": "ok", "analysis": doc.get("analysis"), "stats": doc.get("stats"), "created_at": doc.get("created_at"), "date_range": doc.get("date_range")}
