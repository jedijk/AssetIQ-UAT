"""
Production dashboard scope — date/shift windows, Line-90 equipment, submission queries.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from database import db
from services.tenant_schema import merge_tenant_filter
from services.tenant_scope import scoped
from services.production_helpers import (
    SHIFTS,
    EQUIPMENT_NAME,
    INFORMATION_TEMPLATE_NAME_REGEX,
    _waste_reporting_template_name_matches,
    _information_template_name_matches,
    _normalize_shift_keys,
    _shift_windows_for_day,
    _envelope_windows,
)

logger = logging.getLogger(__name__)


@dataclass
class ProductionDashboardScope:
    current_user: dict
    now: datetime
    shift_keys: List[str]
    shift_param: str
    range_start: datetime
    range_end: datetime
    target_date: datetime
    is_range: bool
    filter_windows: List[Tuple[datetime, datetime]]
    shift_label: str
    shift_hours: str
    cal_env_start: datetime
    cal_env_end: datetime
    line90_subtree_asset_tokens: set
    equipment_ids: List[str]
    query: dict
    extruder_tpl_ids_str: set = field(default_factory=set)
    viscosity_tpl_ids_str: set = field(default_factory=set)
    big_bag_tpl_ids_str: set = field(default_factory=set)
    screen_tpl_ids_str: set = field(default_factory=set)
    magnet_tpl_ids_str: set = field(default_factory=set)
    eos_tpl_ids_str: set = field(default_factory=set)
    waste_reporting_tpl_ids_str: set = field(default_factory=set)
    information_tpl_ids_str: set = field(default_factory=set)
    all_subs: List[dict] = field(default_factory=list)


async def resolve_production_dashboard_scope(
    current_user: dict,
    *,
    date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    shift: Optional[str] = None,
) -> ProductionDashboardScope:
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
        scoped(current_user, {"$or": [
            {"name": _line90_pat},
            {"tag": _line90_pat},
            {"tag_number": _line90_pat},
        ]}),
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
                scoped(current_user, {"id": root["parent_id"]}), {"_id": 0, "parent_id": 1}
            )
            if parent and parent.get("parent_id"):
                _add_eq_id(parent["parent_id"])

        children = await db.equipment_nodes.find(
            scoped(current_user, {"parent_id": rid}), {"_id": 0, "id": 1}
        ).to_list(80)
        child_ids = [c["id"] for c in children if c.get("id")]
        for cid in child_ids:
            _add_eq_id(cid)

        if child_ids:
            grandchildren = await db.equipment_nodes.find(
                scoped(current_user, {"parent_id": {"$in": child_ids}}), {"_id": 0, "id": 1}
            ).to_list(300)
            for gc in grandchildren:
                _add_eq_id(gc.get("id"))

    # Tags/names under Line-90 (e.g. EXU, 1U-20) for matching form `equipment_name`
    # and ingested `production_logs.asset_id` — CSVs rarely use the literal "Line-90" string.
    line90_subtree_asset_tokens = set()
    if equipment_ids:
        subtree_nodes = await db.equipment_nodes.find(
            scoped(current_user, {"id": {"$in": list(dict.fromkeys(equipment_ids))}}),
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
                {"form_template_name": {"$regex": "waste", "$options": "i"}},
                {"form_template_name": {"$regex": "report", "$options": "i"}},
            ]},
            {"$and": [
                {"form_template_name": {"$regex": INFORMATION_TEMPLATE_NAME_REGEX, "$options": "i"}},
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
                {"$and": [
                    {"form_template_name": {"$regex": "waste", "$options": "i"}},
                    {"form_template_name": {"$regex": "report", "$options": "i"}},
                ]},
                # Big Bag Loading is often submitted without a linked equipment row
                {"$and": [
                    {"form_template_name": {"$regex": "big", "$options": "i"}},
                    {"form_template_name": {"$regex": "bag", "$options": "i"}},
                ]},
                {"$and": [
                    {"form_template_name": {"$regex": INFORMATION_TEMPLATE_NAME_REGEX, "$options": "i"}},
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
    waste_reporting_tpl_ids_str = set()
    information_tpl_ids_str = set()

    prod_tpl_id_values = []
    try:
        tpl_rows = await db.form_templates.find(
            scoped(current_user, {"$or": flex_production_template["$or"]}),
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
                if _waste_reporting_template_name_matches(nm):
                    waste_reporting_tpl_ids_str.add(sid)
                if _information_template_name_matches(nm):
                    information_tpl_ids_str.add(sid)
    except Exception as e:
        logger.warning("production dashboard: form_templates lookup failed: %s", e)

    # Information (and other production) rows still require Line-90 equipment signals in Mongo,
    # except the explicit `forms_without_equipment` branch (empty equipment_id) mirroring Big Bag.
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

    submissions_query = merge_tenant_filter(
        {
            "$and": [
                query,
                {"$or": time_window_or},
            ]
        },
        current_user,
    )

    all_subs = await db.form_submissions.find(
        submissions_query,
        {"_id": 0},
    ).sort([("submitted_at", -1), ("created_at", -1)]).to_list(15000)


    return ProductionDashboardScope(
        current_user=current_user,
        now=now,
        shift_keys=shift_keys,
        shift_param=shift_param,
        range_start=range_start,
        range_end=range_end,
        target_date=target_date,
        is_range=is_range,
        filter_windows=filter_windows,
        shift_label=shift_label,
        shift_hours=shift_hours,
        cal_env_start=cal_env_start,
        cal_env_end=cal_env_end,
        line90_subtree_asset_tokens=line90_subtree_asset_tokens,
        equipment_ids=equipment_ids,
        query=query,
        extruder_tpl_ids_str=extruder_tpl_ids_str,
        viscosity_tpl_ids_str=viscosity_tpl_ids_str,
        big_bag_tpl_ids_str=big_bag_tpl_ids_str,
        screen_tpl_ids_str=screen_tpl_ids_str,
        magnet_tpl_ids_str=magnet_tpl_ids_str,
        eos_tpl_ids_str=eos_tpl_ids_str,
        waste_reporting_tpl_ids_str=waste_reporting_tpl_ids_str,
        information_tpl_ids_str=information_tpl_ids_str,
        all_subs=all_subs,
    )
