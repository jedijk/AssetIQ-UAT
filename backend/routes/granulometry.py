"""
Granulometry routes.

Manual-entry granulometric analysis records (sieve weights) + image attachment.
"""

from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone, date as _date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db
from services.storage_service import put_object_async, get_object_async, MIME_TYPES

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Granulometry"])

FORM_TEMPLATE_NAME = "Granulometric analysis"


def _parse_date(d: str) -> _date:
    try:
        return datetime.strptime(d, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")


def _to_utc_midnight(day: _date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)


def _compute_percent_passing(sieves: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert sieve retained weights into % passing per sieve size.

    Assumption:
    - Each row is "weight retained on that sieve".
    - % passing at sieve size S = 100 * (1 - cumulative_retained_up_to_S / total_weight)
    - Sieve sizes are sorted ascending for charting.
    """
    rows = []
    for r in sieves or []:
        try:
            size = float(r.get("sieveSize"))
        except Exception:
            size = None
        try:
            w = float(r.get("weight"))
        except Exception:
            w = 0.0
        if size is None:
            continue
        rows.append({"sieveSize": size, "weight": max(0.0, w)})
    rows.sort(key=lambda x: x["sieveSize"])

    total = sum(r["weight"] for r in rows)
    if total <= 0:
        return [{"sieveSize": r["sieveSize"], "percentPassing": 0.0} for r in rows]

    cum_retained = 0.0
    out = []
    for r in rows:
        cum_retained += r["weight"]
        pct = max(0.0, min(100.0, 100.0 * (1.0 - (cum_retained / total))))
        out.append({"sieveSize": r["sieveSize"], "percentPassing": round(pct, 2)})
    return out


class SieveRow(BaseModel):
    sieveSize: float = Field(..., description="Sieve size (e.g. mm or µm) as numeric")
    weight: float = Field(..., ge=0, description="Weight retained on this sieve")


class GranulometryCreate(BaseModel):
    recordedDate: str = Field(..., description="YYYY-MM-DD")
    sampleDate: str = Field(..., description="YYYY-MM-DD")
    bigBagNo: str = Field(..., min_length=1, max_length=120)
    sieves: List[SieveRow] = Field(default_factory=list)
    imageUrl: Optional[str] = Field(default=None, description="Optional image URL/path")


class GranulometryUpdate(BaseModel):
    recordedDate: Optional[str] = None
    sampleDate: Optional[str] = None
    bigBagNo: Optional[str] = None
    sieves: Optional[List[SieveRow]] = None
    imageUrl: Optional[str] = None


def _serialize_record(doc: Dict[str, Any]) -> Dict[str, Any]:
    sieves = doc.get("sieves") or []
    percent_passing = _compute_percent_passing(sieves)
    return {
        "id": doc.get("id"),
        "recordedDate": doc.get("recorded_date"),
        "sampleDate": doc.get("sample_date"),
        "bigBagNo": doc.get("big_bag_no"),
        "sieves": sieves,
        "percentPassing": percent_passing,
        "imageUrl": doc.get("image_url") or "",
        "createdAt": doc.get("created_at"),
        "createdByName": doc.get("created_by_name") or "",
        "updatedAt": doc.get("updated_at"),
    }

def _extract_submission_field(sub: Dict[str, Any], wanted_labels: List[str]) -> Optional[Any]:
    wl = {str(x).strip().lower() for x in wanted_labels if x}

    def _norm(s: Any) -> str:
        return str(s or "").strip().lower()

    def _unwrap(val: Any) -> Any:
        # Some frontends store structured values (e.g. { value: "BB-1" })
        if isinstance(val, dict) and "value" in val:
            return val.get("value")
        return val

    for v in (sub.get("values") or sub.get("responses") or []) or []:
        label = _norm(v.get("field_label", ""))
        fid = _norm(v.get("field_id", ""))

        # Exact match
        if label in wl or fid in wl:
            return _unwrap(v.get("value"))

        # Fuzzy match: allow partials (e.g. "Big Bag No." vs "Big Bag No")
        if any(w and (w in label or w in fid) for w in wl):
            return _unwrap(v.get("value"))

    return None


def _parse_dt_any(raw: Any) -> Optional[datetime]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    s = str(raw).strip()
    if not s:
        return None
    try:
        # Accept "YYYY-MM-DD" and ISO datetimes
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _serialize_form_record(sub: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    # Date of test: required-ish
    dt_raw = _extract_submission_field(sub, ["Date of test", "date of test", "date"])
    dt = _parse_dt_any(dt_raw) or _parse_dt_any(sub.get("submitted_at")) or _parse_dt_any(sub.get("created_at"))
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    # Big bag is sometimes stored with different punctuation/spacing; fall back to a broad contains-match.
    big_bag = _extract_submission_field(sub, ["Big Bag No.", "Big Bag No", "big bag no", "bigbagno", "big_bag", "bigbag"])
    if not big_bag:
        # last-resort scan
        for v in (sub.get("values") or sub.get("responses") or []) or []:
            label = str(v.get("field_label", "")).strip().lower()
            fid = str(v.get("field_id", "")).strip().lower()
            if ("big" in label and "bag" in label) or ("big" in fid and "bag" in fid):
                big_bag = v.get("value")
                if isinstance(big_bag, dict) and "value" in big_bag:
                    big_bag = big_bag.get("value")
                break
    big_bag_no = str(big_bag or "").strip()

    sieves = []
    for v in (sub.get("values") or sub.get("responses") or []) or []:
        label_raw = str(v.get("field_label", "")).strip()
        fid_raw = str(v.get("field_id", "")).strip()
        label = label_raw or fid_raw
        if not label:
            continue
        key = label.strip().upper()
        if key in ("DATE OF TEST", "BIG BAG NO.", "BIG BAG NO"):
            continue

        sieve_size = None
        if key == "PAN":
            sieve_size = 0.0
        else:
            try:
                # labels are often like "0.250"
                sieve_size = float(label.strip())
            except Exception:
                sieve_size = None

        if sieve_size is None:
            continue

        raw_val = v.get("value")
        try:
            w = float(raw_val) if raw_val not in (None, "") else 0.0
        except Exception:
            w = 0.0
        sieves.append({"sieveSize": sieve_size, "weight": max(0.0, w)})

    sieves.sort(key=lambda x: x["sieveSize"])

    sample_day = dt.date().isoformat()
    return {
        "id": sub.get("id") or "",
        "recordedDate": sample_day,
        "sampleDate": sample_day,
        "bigBagNo": big_bag_no or "Unknown",
        "sieves": sieves,
        "percentPassing": _compute_percent_passing(sieves),
        "imageUrl": "",
        "createdAt": str(sub.get("submitted_at") or sub.get("created_at") or ""),
        "createdByName": str(sub.get("submitted_by_name") or sub.get("submitted_by") or ""),
        "updatedAt": str(sub.get("updated_at") or ""),
    }


@router.get("/granulometry/form-records")
async def list_granulometry_form_records(
    from_date: Optional[str] = Query(None, description="YYYY-MM-DD (filter by submitted_at date)"),
    to_date: Optional[str] = Query(None, description="YYYY-MM-DD (filter by submitted_at date)"),
    bigBagNo: Optional[List[str]] = Query(None, description="Repeatable bag filter"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=250),
    current_user: dict = Depends(get_current_user),
):
    # IMPORTANT:
    # Filter semantics should follow the *form's* "Date of test", not submitted_at.
    # Operators can submit later/retroactively, which breaks submitted_at-based ranges.
    query: Dict[str, Any] = {"form_template_name": {"$regex": f"^{FORM_TEMPLATE_NAME}.*$", "$options": "i"}}

    start_day = _parse_date(from_date) if from_date else None
    end_day = _parse_date(to_date) if to_date else None
    if start_day and end_day and end_day < start_day:
        raise HTTPException(status_code=400, detail="to_date must be >= from_date")

    # Fetch a bounded window of recent submissions, then filter strictly in Python using extracted Date of test.
    # This trades some DB efficiency for correctness across mixed submitted_at types and retro-entry.
    raw = await db.form_submissions.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(5000)

    cleaned_bags = None
    if bigBagNo:
        cleaned_bags = {str(b or "").strip() for b in bigBagNo if str(b or "").strip()}

    filtered: List[Dict[str, Any]] = []
    for s in raw:
        rec = _serialize_form_record(s)
        if not rec:
            continue

        # Date range filter on extracted sampleDate
        if start_day or end_day:
            try:
                rday = _parse_date(str(rec.get("sampleDate") or rec.get("recordedDate") or ""))
            except HTTPException:
                continue
            if start_day and rday < start_day:
                continue
            if end_day and rday > end_day:
                continue

        # Optional big bag filter
        if cleaned_bags and rec.get("bigBagNo") not in cleaned_bags:
            continue

        filtered.append(rec)

    total = len(filtered)
    page = filtered[skip: skip + limit]
    return {"total": total, "records": page, "skip": skip, "limit": limit}


@router.get("/granulometry/form-big-bags")
async def list_granulometry_form_big_bags(
    from_date: Optional[str] = Query(None, description="YYYY-MM-DD (filter by submitted_at date)"),
    to_date: Optional[str] = Query(None, description="YYYY-MM-DD (filter by submitted_at date)"),
    current_user: dict = Depends(get_current_user),
):
    res = await list_granulometry_form_records(
        from_date=from_date,
        to_date=to_date,
        bigBagNo=None,
        skip=0,
        limit=250,
        current_user=current_user,
    )
    bags = sorted({r.get("bigBagNo") for r in (res.get("records") or []) if r.get("bigBagNo")})
    return {"bigBags": bags}


@router.post("/granulometry/records")
async def create_granulometry_record(
    data: GranulometryCreate,
    current_user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc).isoformat()
    rid = str(uuid.uuid4())

    recorded_day = _parse_date(data.recordedDate)
    sample_day = _parse_date(data.sampleDate)

    sieves = [r.model_dump() for r in (data.sieves or [])]
    sieves.sort(key=lambda x: float(x.get("sieveSize", 0)))

    doc = {
        "id": rid,
        "recorded_date": recorded_day.isoformat(),
        "sample_date": sample_day.isoformat(),
        "sample_date_dt": _to_utc_midnight(sample_day),
        "big_bag_no": data.bigBagNo.strip(),
        "sieves": sieves,
        "image_url": (data.imageUrl or "").strip(),
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name", "Unknown"),
    }
    await db.granulometry_records.insert_one(doc)
    return _serialize_record(doc)


@router.get("/granulometry/records")
async def list_granulometry_records(
    from_date: Optional[str] = Query(None, description="YYYY-MM-DD (filter by sampleDate)"),
    to_date: Optional[str] = Query(None, description="YYYY-MM-DD (filter by sampleDate)"),
    bigBagNo: Optional[List[str]] = Query(None, description="Repeatable bag filter"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=250),
    current_user: dict = Depends(get_current_user),
):
    query: Dict[str, Any] = {}
    if bigBagNo:
        cleaned = [b.strip() for b in bigBagNo if str(b or "").strip()]
        if cleaned:
            query["big_bag_no"] = {"$in": cleaned}

    if from_date or to_date:
        start = _to_utc_midnight(_parse_date(from_date)) if from_date else None
        end = _to_utc_midnight(_parse_date(to_date)) if to_date else None
        if start and end and end < start:
            raise HTTPException(status_code=400, detail="to_date must be >= from_date")
        dt_q = {}
        if start:
            dt_q["$gte"] = start
        if end:
            # inclusive end-of-day
            dt_q["$lte"] = end.replace(hour=23, minute=59, second=59)
        query["sample_date_dt"] = dt_q

    cursor = db.granulometry_records.find(query, {"_id": 0}).sort("sample_date_dt", -1).skip(skip).limit(limit)
    items = [ _serialize_record(doc) async for doc in cursor ]
    total = await db.granulometry_records.count_documents(query)
    return {"total": total, "records": items, "skip": skip, "limit": limit}


@router.get("/granulometry/records/{record_id}")
async def get_granulometry_record(
    record_id: str,
    current_user: dict = Depends(get_current_user),
):
    doc = await db.granulometry_records.find_one({"id": record_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return _serialize_record(doc)


@router.patch("/granulometry/records/{record_id}")
async def update_granulometry_record(
    record_id: str,
    data: GranulometryUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.granulometry_records.find_one({"id": record_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")

    set_ops: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.recordedDate:
        set_ops["recorded_date"] = _parse_date(data.recordedDate).isoformat()
    if data.sampleDate:
        sd = _parse_date(data.sampleDate)
        set_ops["sample_date"] = sd.isoformat()
        set_ops["sample_date_dt"] = _to_utc_midnight(sd)
    if data.bigBagNo is not None:
        set_ops["big_bag_no"] = (data.bigBagNo or "").strip()
    if data.sieves is not None:
        sieves = [r.model_dump() for r in (data.sieves or [])]
        sieves.sort(key=lambda x: float(x.get("sieveSize", 0)))
        set_ops["sieves"] = sieves
    if data.imageUrl is not None:
        set_ops["image_url"] = (data.imageUrl or "").strip()

    await db.granulometry_records.update_one({"id": record_id}, {"$set": set_ops})
    doc = await db.granulometry_records.find_one({"id": record_id}, {"_id": 0})
    return _serialize_record(doc)


@router.delete("/granulometry/records/{record_id}")
async def delete_granulometry_record(
    record_id: str,
    current_user: dict = Depends(get_current_user),
):
    res = await db.granulometry_records.delete_one({"id": record_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"status": "deleted", "id": record_id}


@router.get("/granulometry/big-bags")
async def list_big_bags(
    from_date: Optional[str] = Query(None, description="YYYY-MM-DD (filter by sampleDate)"),
    to_date: Optional[str] = Query(None, description="YYYY-MM-DD (filter by sampleDate)"),
    current_user: dict = Depends(get_current_user),
):
    query: Dict[str, Any] = {}
    if from_date or to_date:
        start = _to_utc_midnight(_parse_date(from_date)) if from_date else None
        end = _to_utc_midnight(_parse_date(to_date)) if to_date else None
        dt_q = {}
        if start:
            dt_q["$gte"] = start
        if end:
            dt_q["$lte"] = end.replace(hour=23, minute=59, second=59)
        query["sample_date_dt"] = dt_q

    # Distinct isn't supported via proxy in some environments; do aggregation.
    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$group": {"_id": "$big_bag_no"}},
        {"$project": {"_id": 0, "bigBagNo": "$_id"}},
        {"$sort": {"bigBagNo": 1}},
        {"$limit": 500},
    ]
    rows = await db.granulometry_records.aggregate(pipeline).to_list(500)
    bags = [r.get("bigBagNo") for r in rows if r.get("bigBagNo")]
    return {"bigBags": bags}


MAX_IMAGE_SIZE = 8 * 1024 * 1024  # 8 MB


@router.post("/granulometry/images/upload")
async def upload_granulometry_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    ext = file.filename.split(".")[-1].lower() if file.filename else "png"
    if ext not in ["jpg", "jpeg", "png", "gif", "webp"]:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: jpg, jpeg, png, gif, webp")
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Image exceeds 8 MB limit")

    content_type = MIME_TYPES.get(ext, "image/png")
    image_id = str(uuid.uuid4())
    storage_path = f"granulometry/images/{current_user.get('id','anon')}/{image_id}.{ext}"
    await put_object_async(storage_path, content, content_type)

    await db.granulometry_images.insert_one({
        "id": image_id,
        "storage_path": storage_path,
        "content_type": content_type,
        "size": len(content),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get("id"),
        "uploaded_by_name": current_user.get("name", "Unknown"),
    })

    return {"imageId": image_id, "imageUrl": f"/api/granulometry/images/{image_id}"}


@router.get("/granulometry/images/{image_id}")
async def view_granulometry_image(
    image_id: str,
    current_user: dict = Depends(get_current_user),
):
    doc = await db.granulometry_images.find_one({"id": image_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")

    from fastapi.responses import Response
    content, ct = await get_object_async(doc["storage_path"])
    return Response(content=content, media_type=ct)

