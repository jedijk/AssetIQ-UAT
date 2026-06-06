"""Shared helpers for production dashboard routes."""
import logging
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional, Tuple

from fastapi import HTTPException

from database import db

logger = logging.getLogger(__name__)

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
WASTE_REPORTING_FORM = "Waste reporting"
# Highlight weight (kg) in dashboard when a single entry exceeds this value (override via env).
WASTE_ENTRY_WEIGHT_ALERT_KG = float(os.environ.get("WASTE_ENTRY_WEIGHT_ALERT_KG", "500"))
# Any form template whose name matches information-style titles (EN/NL), e.g. "Production Information", "Lijninformatie".
INFORMATION_FORM = "Information"
# Mongo $regex and Python checks must stay aligned (word boundaries; English + Dutch).
INFORMATION_TEMPLATE_NAME_REGEX = r"\b(information|informatie)\b"
# Persisted on form_submissions; shared by all users, survives navigation across days.
INFORMATION_DASHBOARD_PINNED_FIELD = "production_information_pinned"


def _information_template_name_matches(name: Optional[Any]) -> bool:
    if name is None:
        return False
    s = str(name).strip()
    if not s:
        return False
    return bool(re.search(INFORMATION_TEMPLATE_NAME_REGEX, s, flags=re.IGNORECASE))


def _waste_reporting_template_name_matches(name: Optional[Any]) -> bool:
    if name is None:
        return False
    tpl = str(name).strip().lower()
    return ("waste" in tpl) and ("report" in tpl)


def _format_waste_type_label(raw: Optional[Any]) -> str:
    """Map stored waste type values to operator-friendly labels for the dashboard."""
    if raw is None:
        return ""
    s = str(_unwrap_form_value(raw)).strip()
    if not s:
        return ""
    key = re.sub(r"\s+", "_", s.lower())
    labels = {
        "cut_waste": "Cut",
        "production_waste": "Production",
    }
    return labels.get(key, s)


def _extract_waste_reporting_fields(sub: dict) -> Tuple[str, str, Optional[float]]:
    """Extract Date & Time, waste type label, and weight (kg) from a waste reporting submission."""
    date_time_raw = extract_field(sub, "Date & Time") or ""
    waste_type = ""
    for label in ("Waste type", "Waste Type", "Waste category", "Category", "Type"):
        raw = extract_field(sub, label)
        if raw not in (None, ""):
            waste_type = _format_waste_type_label(raw)
            break
    weight_kg = None
    for label in ("Weight", "Weight (KG)", "Weight (kg)", "Weight kg", "Weight KG"):
        weight_kg = extract_numeric(sub, label)
        if weight_kg is not None:
            break
    return date_time_raw, waste_type, weight_kg


def _sum_waste_reporting_kg(entries: List[dict]) -> float:
    """Total kg from Waste reporting form rows shown in the dashboard table."""
    total = 0.0
    for e in entries or []:
        try:
            total += float(e.get("weight_kg") or 0)
        except (TypeError, ValueError):
            continue
    return round(total, 1)


PRODUCTION_FORMS = [
    EXTRUDER_FORM,
    VISCOSITY_FORM,
    BIG_BAG_FORM,
    SCREEN_CHANGE_FORM,
    MAGNET_CLEANING_FORM,
    END_OF_SHIFT_FORM,
    WASTE_REPORTING_FORM,
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


def _calendar_day_in_envelope(
    dt: Optional[datetime],
    cal_env_start: datetime,
    cal_env_end: datetime,
) -> bool:
    """True when dt's calendar day overlaps the dashboard date envelope (shift-agnostic)."""
    if not isinstance(dt, datetime):
        return False
    try:
        d0 = dt.date() if dt.tzinfo is None else dt.astimezone(timezone.utc).date()
        return cal_env_start.date() <= d0 <= cal_env_end.date()
    except Exception:
        return False


def _naive_shift_windows(windows: List[Tuple[datetime, datetime]]) -> List[Tuple[datetime, datetime]]:
    """Strip tzinfo so operator wall-clock times match shift bounds stored as naive/UTC clock."""
    out: List[Tuple[datetime, datetime]] = []
    for ws, we in windows:
        nws = ws.replace(tzinfo=None) if isinstance(ws, datetime) and ws.tzinfo else ws
        nwe = we.replace(tzinfo=None) if isinstance(we, datetime) and we.tzinfo else we
        out.append((nws, nwe))
    return out


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
        if raw is None or raw == "":
            continue
        if isinstance(raw, (int, float)):
            try:
                ts = float(raw)
                if ts > 1e12:
                    ts = ts / 1000.0
                return datetime.fromtimestamp(ts, tz=timezone.utc)
            except Exception:
                continue
        s = str(raw).strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
            try:
                return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except Exception:
                pass
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            continue
    return None


def _information_entry_display_time(sub: dict) -> datetime:
    """Sort/display clock for an information row (including pinned rows outside the visible date window)."""
    raw_sample_dt = _extract_date_time_field_raw(sub)
    dt_form = _parse_sample_datetime(raw_sample_dt) if raw_sample_dt else None
    dt_meta = parse_submitted_at(sub)
    if dt_meta is None and dt_form is not None:
        dt_meta = dt_form
    if dt_meta is None:
        dt_meta = datetime.now(timezone.utc)
    elif dt_meta.tzinfo is None:
        dt_meta = dt_meta.replace(tzinfo=timezone.utc)
    chosen = dt_form or dt_meta
    if isinstance(chosen, datetime) and chosen.tzinfo is None:
        chosen = chosen.replace(tzinfo=timezone.utc)
    return chosen


async def _submission_is_information_form(sub: dict) -> bool:
    """True if this submission uses an information-style template (name or template lookup)."""
    if _information_template_name_matches(sub.get("form_template_name")):
        return True
    tid = sub.get("form_template_id")
    if tid is None:
        return False
    s = str(tid).strip()
    if not s:
        return False
    ors: List[dict] = [{"id": tid}, {"id": s}]
    if len(s) == 24:
        try:
            ors.append({"_id": ObjectId(s)})
        except Exception:
            pass
    tpl = await db.form_templates.find_one({"$or": ors}, {"name": 1})
    return _information_template_name_matches((tpl or {}).get("name"))


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
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%d-%m-%Y",
            "%d.%m.%Y",
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
        # Date-only fields (common on short "information" forms) — used for calendar-day / shift windowing.
        if ft in ("date", "day"):
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

