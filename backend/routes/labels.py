"""
Smart Labeling System - Sprint 1 MVP
- Template CRUD (preset-based layouts)
- PDF preview & render (single + bulk)
- Print job history
- QR workflow with configurable target
"""
import uuid
import io
from datetime import datetime, timezone
from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import qrcode
from reportlab.lib.pagesizes import portrait, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from database import db
from routes.auth import get_current_user

router = APIRouter(prefix="/labels", tags=["Labels"])


# ==================== MODELS ====================

ALLOWED_PRESETS = ["standard", "compact", "qr_only", "with_logo", "title_date_time", "blank"]
ALLOWED_ASSET_FIELDS = [
    "asset_id", "asset_name", "serial_number", "location",
    "department", "status", "inspection_date", "asset_type",
    "print_date", "print_time",
    "custom"
]


class FieldBinding(BaseModel):
    source: str  # "asset_id", "asset_name", ..., "form_field", "custom"
    label: Optional[str] = None  # shown for custom or to override
    value: Optional[str] = None  # used only when source == "custom"
    form_field_id: Optional[str] = None  # used only when source == "form_field"


class QRConfig(BaseModel):
    target_type: Literal["asset_page", "inspection_form", "maintenance_request", "custom_url"] = "asset_page"
    form_id: Optional[str] = None
    custom_url: Optional[str] = None
    base_url: Optional[str] = None  # public app URL; defaults to backend resolved value


class LabelTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    width_mm: float = 50.0
    height_mm: float = 30.0
    orientation: Literal["portrait", "landscape"] = "portrait"
    preset: Literal["standard", "compact", "qr_only", "with_logo", "title_date_time", "blank"] = "standard"
    field_bindings: List[FieldBinding] = Field(default_factory=list)
    qr_config: QRConfig = Field(default_factory=QRConfig)
    default_equipment_type_id: Optional[str] = None
    source_form_template_ids: List[str] = Field(default_factory=list)
    printer_type: Optional[str] = None
    status: Literal["draft", "published", "archived"] = "draft"


class LabelTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    orientation: Optional[Literal["portrait", "landscape"]] = None
    preset: Optional[Literal["standard", "compact", "qr_only", "with_logo", "title_date_time", "blank"]] = None
    field_bindings: Optional[List[FieldBinding]] = None
    qr_config: Optional[QRConfig] = None
    default_equipment_type_id: Optional[str] = None
    source_form_template_ids: Optional[List[str]] = None
    printer_type: Optional[str] = None
    status: Optional[Literal["draft", "published", "archived"]] = None


class PreviewRequest(BaseModel):
    template: Optional[LabelTemplateCreate] = None   # for live designer preview
    template_id: Optional[str] = None                 # or an existing saved template
    asset_id: Optional[str] = None                    # equipment_node id (optional; uses sample if missing)
    submission_id: Optional[str] = None               # include form submission values
    sample_data: Optional[dict] = None


class PrintRequest(BaseModel):
    template_id: str
    asset_ids: List[str] = Field(default_factory=list)  # empty => single sample label
    submission_id: Optional[str] = None               # single-label print for one submission
    copies: int = 1
    printer_name: Optional[str] = None
    margin_offset_mm: float = 0.0


# ==================== HELPERS ====================

def _now():
    return datetime.now(timezone.utc)


def _strip_mongo_id(doc):
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def _serialize_dt(d):
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


async def _load_asset(asset_id: str) -> dict:
    """Resolve an equipment_node to a label-friendly dict."""
    node = await db.equipment_nodes.find_one({"id": asset_id}, {"_id": 0})
    if not node:
        # fall back to find by _id string
        node = await db.equipment_nodes.find_one({"name": asset_id}, {"_id": 0})
    if not node:
        return {}
    return {
        "asset_id": node.get("id") or node.get("asset_tag") or "",
        "asset_name": node.get("name") or "",
        "serial_number": node.get("serial_number") or node.get("asset_tag") or "",
        "location": node.get("location") or "",
        "department": node.get("department") or "",
        "status": node.get("status") or "",
        "inspection_date": node.get("last_inspection_date") or "",
        "asset_type": node.get("equipment_type_name") or node.get("type") or "",
    }


async def _load_submission_data(submission_id: str) -> dict:
    """Load a form submission and return a dict of values keyed as `form.<field_id>`
    plus any fields whose key looks like an asset identifier."""
    sub = await db.form_submissions.find_one({"id": submission_id}, {"_id": 0})
    if not sub:
        return {}
    out: dict = {}
    values = sub.get("values") or sub.get("responses") or {}
    # Values can be either dict {field_id: value} or list of {field_id, value, ...}
    pairs = []
    if isinstance(values, dict):
        pairs = list(values.items())
    elif isinstance(values, list):
        for item in values:
            if isinstance(item, dict):
                k = item.get("field_id") or item.get("field_key") or item.get("key") or item.get("id")
                v = item.get("value")
                if k is not None:
                    pairs.append((k, v))
    for k, v in pairs:
        if v is None:
            continue
        if isinstance(v, list):
            str_val = ", ".join(map(str, v))
        elif isinstance(v, dict):
            str_val = ""
        else:
            str_val = str(v)
        out[f"form.{k}"] = str_val
        out.setdefault(k, str_val)
    # Submission-level metadata
    out["submission_id"] = str(sub.get("id", ""))
    if sub.get("submitted_at"):
        try:
            dt = sub["submitted_at"]
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
            out["form.submitted_at"] = dt.strftime("%Y-%m-%d %H:%M")
            out.setdefault("submission_date", dt.strftime("%Y-%m-%d"))
            out.setdefault("submission_time", dt.strftime("%H:%M"))
        except (ValueError, TypeError, AttributeError):
            pass
    # Linked equipment
    eq_id = sub.get("equipment_id") or sub.get("linked_equipment_id")
    if eq_id:
        out["_linked_equipment_id"] = eq_id
    return out


SAMPLE_DATA = {
    "asset_id": "EQ-00123",
    "asset_name": "Extruder Unit 1",
    "serial_number": "SN-2025-0042",
    "location": "Line 90 / Bay A",
    "department": "Production",
    "status": "Active",
    "inspection_date": "2026-04-20",
    "asset_type": "Extruder",
}


def _inject_print_datetime(data: dict) -> dict:
    """Add print_date / print_time based on current UTC time if missing."""
    now = datetime.now(timezone.utc)
    out = dict(data)
    out.setdefault("print_date", now.strftime("%Y-%m-%d"))
    out.setdefault("print_time", now.strftime("%H:%M"))
    return out


def _resolve_field_value(binding: FieldBinding, data: dict) -> tuple[str, str]:
    """Return (label, value) for a binding given asset data.

    Custom bindings support placeholder substitution, e.g. value="Lot {form.lot_no}"
    will substitute data["form.lot_no"] if present.
    """
    source = binding.source
    if source == "custom":
        raw_value = binding.value or ""
        # Placeholder substitution: replace {key} with data[key]
        def _sub(match):
            key = match.group(1).strip()
            return str(data.get(key, f"{{{key}}}"))
        import re
        val = re.sub(r"\{([^{}]+)\}", _sub, raw_value)
        return (binding.label or "Info", val)
    if source == "form_field":
        field_id = binding.form_field_id or ""
        value = data.get(f"form.{field_id}") or data.get(field_id) or ""
        return (binding.label or field_id or "Field", str(value))
    pretty = {
        "asset_id": "Asset ID",
        "asset_name": "Name",
        "serial_number": "Serial",
        "location": "Location",
        "department": "Dept",
        "status": "Status",
        "inspection_date": "Insp.",
        "asset_type": "Type",
        "print_date": "Date",
        "print_time": "Time",
    }
    label = binding.label or pretty.get(source, source)
    value = str(data.get(source, "") or "")
    return (label, value)


def _build_qr_payload(qr: QRConfig, asset_data: dict) -> str:
    """Build the URL/text encoded in the QR."""
    base = (qr.base_url or "").rstrip("/")
    asset_id = asset_data.get("asset_id", "")
    if qr.target_type == "asset_page":
        return f"{base}/equipment/{asset_id}" if base else f"assetiq://equipment/{asset_id}"
    if qr.target_type == "inspection_form":
        fid = qr.form_id or ""
        return f"{base}/forms/{fid}?asset={asset_id}" if base else f"assetiq://form/{fid}?asset={asset_id}"
    if qr.target_type == "maintenance_request":
        return f"{base}/maintenance/new?asset={asset_id}" if base else f"assetiq://maintenance?asset={asset_id}"
    if qr.target_type == "custom_url":
        url = (qr.custom_url or "").replace("{asset_id}", asset_id).replace("{asset_name}", asset_data.get("asset_name", ""))
        return url
    return asset_id


def _qr_image(payload: str):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(payload or " ")
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white")


def _render_single_label(c: canvas.Canvas, tpl: dict, data: dict, origin=(0, 0), margin_offset_mm: float = 0.0):
    """Draw one label on the canvas at origin (x0, y0) in points."""
    data = _inject_print_datetime(data)
    x0, y0 = origin
    width_mm = float(tpl.get("width_mm", 50))
    height_mm = float(tpl.get("height_mm", 30))
    w = width_mm * mm
    h = height_mm * mm
    pad = 2 * mm + margin_offset_mm * mm
    preset = tpl.get("preset", "standard")

    # Build QR
    qr_cfg = QRConfig(**(tpl.get("qr_config") or {}))
    qr_payload = _build_qr_payload(qr_cfg, data)
    qr_img = _qr_image(qr_payload)
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)
    qr_reader = ImageReader(qr_buf)

    # Bindings
    bindings = [FieldBinding(**b) if isinstance(b, dict) else b for b in (tpl.get("field_bindings") or [])]
    lines = [_resolve_field_value(b, data) for b in bindings]

    # Draw border (subtle)
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setLineWidth(0.3)
    c.rect(x0, y0, w, h)

    c.setFillColorRGB(0, 0, 0)
    c.setStrokeColorRGB(0, 0, 0)

    if preset == "qr_only":
        qr_size = min(w, h) - 2 * pad - 4 * mm
        qx = x0 + (w - qr_size) / 2
        qy = y0 + (h - qr_size) / 2 + 2 * mm
        c.drawImage(qr_reader, qx, qy, qr_size, qr_size, preserveAspectRatio=True, mask="auto")
        # one line below (asset_id by default)
        caption = next((v for (_, v) in lines if v), data.get("asset_id", ""))
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(x0 + w / 2, y0 + pad, caption[:32])

    elif preset == "compact":
        # QR left, text right
        qr_size = h - 2 * pad
        qx = x0 + pad
        qy = y0 + pad
        c.drawImage(qr_reader, qx, qy, qr_size, qr_size, preserveAspectRatio=True, mask="auto")
        tx = qx + qr_size + 2 * mm
        tw = w - (tx - x0) - pad
        title = data.get("asset_name", "")
        c.setFont("Helvetica-Bold", 8)
        c.drawString(tx, y0 + h - pad - 8, title[:int(tw / mm * 0.9)])
        c.setFont("Helvetica", 6.5)
        y_cursor = y0 + h - pad - 15
        for label, val in lines[:3]:
            if not val:
                continue
            c.drawString(tx, y_cursor, f"{label}: {val}"[:int(tw / mm * 1.1)])
            y_cursor -= 8
            if y_cursor < y0 + pad:
                break

    elif preset == "with_logo":
        # Top: name (we don't have a logo upload yet in MVP - reserve left top for logo placeholder)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x0 + pad, y0 + h - pad - 8, (data.get("asset_name") or "")[:28])
        # Placeholder logo box
        c.setStrokeColorRGB(0.8, 0.8, 0.8)
        c.rect(x0 + pad, y0 + h - pad - 8 - 10, 8 * mm, 8 * mm)
        c.setFont("Helvetica-Oblique", 5)
        c.drawString(x0 + pad + 0.5 * mm, y0 + h - pad - 8 - 5, "LOGO")
        # QR bottom-left
        qr_size = min(w, h) / 2 - pad
        qx = x0 + pad
        qy = y0 + pad
        c.setStrokeColorRGB(0, 0, 0)
        c.drawImage(qr_reader, qx, qy, qr_size, qr_size, preserveAspectRatio=True, mask="auto")
        # Info bottom-right
        tx = qx + qr_size + 2 * mm
        c.setFont("Helvetica", 6.5)
        y_cursor = qy + qr_size - 6
        for label, val in lines[:4]:
            if not val:
                continue
            c.drawString(tx, y_cursor, f"{label}: {val}"[:30])
            y_cursor -= 8
            if y_cursor < y0 + pad:
                break

    elif preset == "title_date_time":
        # Long landscape label (e.g. 90.3×29mm): Title on top (bold, centered),
        # QR on the left bottom, Date + Time stacked on the right bottom.
        # Other bindings (beyond title/date/time) appear as small extra lines between.
        bindings_map = {}
        for b in bindings:
            bindings_map.setdefault(b.source, b)
        # Title line
        title_binding = bindings_map.get("asset_name")
        title_value = ""
        if title_binding:
            _, title_value = _resolve_field_value(title_binding, data)
        if not title_value:
            title_value = data.get("asset_name", "")
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(x0 + w / 2, y0 + h - pad - 10, title_value[:40])

        # QR code bottom-left
        qr_size = min(h - pad * 2 - 12, w * 0.28)
        qx = x0 + pad
        qy = y0 + pad
        c.drawImage(qr_reader, qx, qy, qr_size, qr_size, preserveAspectRatio=True, mask="auto")

        # Date + Time on the right
        date_binding = bindings_map.get("print_date")
        time_binding = bindings_map.get("print_time")
        date_label, date_value = ("Date", data.get("print_date", ""))
        time_label, time_value = ("Time", data.get("print_time", ""))
        if date_binding:
            date_label, date_value = _resolve_field_value(date_binding, data)
        if time_binding:
            time_label, time_value = _resolve_field_value(time_binding, data)

        right_x = x0 + w - pad
        mid_y = y0 + h / 2 - 8
        c.setFont("Helvetica", 8)
        c.drawRightString(right_x, mid_y, f"{date_label}: {date_value}")
        c.drawRightString(right_x, mid_y - 10, f"{time_label}: {time_value}")

        # Any additional bindings (beyond asset_name/print_date/print_time) printed small above QR baseline
        extras = [b for b in bindings if b.source not in ("asset_name", "print_date", "print_time")]
        if extras:
            c.setFont("Helvetica", 6.5)
            ex_y = y0 + pad
            for b in extras[:2]:
                label, val = _resolve_field_value(b, data)
                if val:
                    c.drawRightString(right_x, ex_y, f"{label}: {val}"[:40])
                    ex_y += 8

    elif preset == "blank":
        # Truly minimal layout: tiny QR bottom-right, all bindings flow as "Label: value" lines
        # from top-left. Lets the user place anything they want without a predefined theme.
        qr_size = min(w, h) * 0.35
        qx = x0 + w - pad - qr_size
        qy = y0 + pad
        c.drawImage(qr_reader, qx, qy, qr_size, qr_size, preserveAspectRatio=True, mask="auto")

        # Flow bindings line-by-line starting top-left
        text_area_w = w - qr_size - 3 * pad
        c.setFont("Helvetica", 8)
        y_cursor = y0 + h - pad - 9
        for b in bindings:
            if y_cursor < y0 + pad:
                break
            label, val = _resolve_field_value(b, data)
            if not val and b.source != "custom":
                continue
            line = f"{label}: {val}" if label and val else (val or label or "")
            # naive character-based truncation to fit text_area_w
            max_chars = max(8, int(text_area_w / mm * 1.9))
            c.drawString(x0 + pad, y_cursor, line[:max_chars])
            y_cursor -= 10

    else:  # standard
        # Top: asset name bold, centered
        title = data.get("asset_name", "")
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(x0 + w / 2, y0 + h - pad - 9, title[:28])
        # Middle: QR code
        qr_size = min(w, h) * 0.5
        qx = x0 + (w - qr_size) / 2
        qy = y0 + (h - qr_size) / 2 - 1 * mm
        c.drawImage(qr_reader, qx, qy, qr_size, qr_size, preserveAspectRatio=True, mask="auto")
        # Bottom: first 2 text bindings, centered
        c.setFont("Helvetica", 6.5)
        y_cursor = y0 + pad + 7
        for label, val in lines[:2][::-1]:  # reverse so first binding sits higher
            if not val:
                continue
            c.drawCentredString(x0 + w / 2, y_cursor, f"{label}: {val}"[:42])
            y_cursor -= 7
            if y_cursor < y0 + pad:
                break


def _render_pdf(tpl: dict, datasets: List[dict], copies: int = 1, margin_offset_mm: float = 0.0) -> bytes:
    """Render a single-label-per-page PDF."""
    w_mm = float(tpl.get("width_mm", 50))
    h_mm = float(tpl.get("height_mm", 30))
    orientation = tpl.get("orientation", "portrait")
    page_w, page_h = w_mm * mm, h_mm * mm
    if orientation == "landscape" and page_w < page_h:
        page_w, page_h = page_h, page_w

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))

    records = datasets if datasets else [SAMPLE_DATA]
    for rec in records:
        for _ in range(max(1, int(copies))):
            c.setPageSize((page_w, page_h))
            _render_single_label(c, tpl, rec, origin=(0, 0), margin_offset_mm=margin_offset_mm)
            c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()


def _qr_data_uri(payload: str) -> str:
    """Return the QR as a data: PNG URI usable in <img src>."""
    import base64
    img = _qr_image(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _html_escape(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _render_label_html(tpl: dict, datasets: List[dict], copies: int = 1, auto_print: bool = True) -> str:
    """Render a print-ready HTML page mirroring the PDF layout.

    Used on mobile where browsers can invoke the native print sheet on HTML
    content via window.print() (but not on PDF blobs).
    Layout uses absolute mm units so CSS @page keeps the print dialog paper size.
    """
    w_mm = float(tpl.get("width_mm", 50))
    h_mm = float(tpl.get("height_mm", 30))
    orientation = tpl.get("orientation", "portrait")
    preset = tpl.get("preset", "standard")
    bindings = [FieldBinding(**b) if isinstance(b, dict) else b for b in (tpl.get("field_bindings") or [])]
    qr_cfg = QRConfig(**(tpl.get("qr_config") or {}))

    labels_html = []
    records = datasets if datasets else [SAMPLE_DATA]
    for rec in records:
        rec2 = _inject_print_datetime(rec)
        qr_src = _qr_data_uri(_build_qr_payload(qr_cfg, rec2))
        lines = [_resolve_field_value(b, rec2) for b in bindings]

        if preset == "qr_only":
            caption = next((v for (_, v) in lines if v), rec2.get("asset_id", ""))
            inner = f"""
              <div class="lbl-qr-only">
                <img src="{qr_src}" alt="qr" />
                <div class="cap">{_html_escape(caption[:32])}</div>
              </div>
            """
        elif preset == "compact":
            title = rec2.get("asset_name", "")
            rows = "".join(
                f'<div class="row"><b>{_html_escape(lbl)}:</b> {_html_escape(val)}</div>'
                for (lbl, val) in lines[:3] if val
            )
            inner = f"""
              <div class="lbl-compact">
                <img class="qr" src="{qr_src}" alt="qr" />
                <div class="side">
                  <div class="title">{_html_escape(title[:32])}</div>
                  {rows}
                </div>
              </div>
            """
        elif preset == "with_logo":
            rows = "".join(
                f'<div class="row"><b>{_html_escape(lbl)}:</b> {_html_escape(val)}</div>'
                for (lbl, val) in lines[:4] if val
            )
            inner = f"""
              <div class="lbl-logo">
                <div class="top">
                  <div class="logo">LOGO</div>
                  <div class="title">{_html_escape(rec2.get('asset_name','')[:28])}</div>
                </div>
                <div class="bottom">
                  <img class="qr" src="{qr_src}" alt="qr" />
                  <div class="side">{rows}</div>
                </div>
              </div>
            """
        elif preset == "title_date_time":
            bmap = {b.source: b for b in bindings}
            title_val = rec2.get("asset_name", "")
            if "asset_name" in bmap:
                _, title_val = _resolve_field_value(bmap["asset_name"], rec2)
            date_lbl, date_val = ("Date", rec2.get("print_date", ""))
            time_lbl, time_val = ("Time", rec2.get("print_time", ""))
            if "print_date" in bmap:
                date_lbl, date_val = _resolve_field_value(bmap["print_date"], rec2)
            if "print_time" in bmap:
                time_lbl, time_val = _resolve_field_value(bmap["print_time"], rec2)
            extras = [b for b in bindings if b.source not in ("asset_name", "print_date", "print_time")]
            extras_html = "".join(
                f'<div class="ext">{_html_escape(lbl)}: {_html_escape(val)}</div>'
                for (lbl, val) in [_resolve_field_value(e, rec2) for e in extras[:2]] if val
            )
            inner = f"""
              <div class="lbl-tdt">
                <div class="title">{_html_escape(title_val[:40])}</div>
                <div class="body">
                  <img class="qr" src="{qr_src}" alt="qr" />
                  <div class="meta">
                    <div>{_html_escape(date_lbl)}: {_html_escape(date_val)}</div>
                    <div>{_html_escape(time_lbl)}: {_html_escape(time_val)}</div>
                    {extras_html}
                  </div>
                </div>
              </div>
            """
        elif preset == "blank":
            rows = "".join(
                f'<div class="row">{_html_escape(lbl)}: {_html_escape(val)}</div>'
                for (lbl, val) in lines if val
            )
            inner = f"""
              <div class="lbl-blank">
                <div class="lines">{rows}</div>
                <img class="qr" src="{qr_src}" alt="qr" />
              </div>
            """
        else:  # standard
            title = rec2.get("asset_name", "")
            rows = "".join(
                f'<div class="row">{_html_escape(lbl)}: {_html_escape(val)}</div>'
                for (lbl, val) in lines[:2] if val
            )
            inner = f"""
              <div class="lbl-std">
                <div class="title">{_html_escape(title[:28])}</div>
                <img class="qr" src="{qr_src}" alt="qr" />
                <div class="foot">{rows}</div>
              </div>
            """

        for _ in range(max(1, copies)):
            labels_html.append(f'<div class="label">{inner}</div>')

    # Swap page dimensions for landscape
    if orientation == "landscape" and w_mm < h_mm:
        page_w_mm, page_h_mm = h_mm, w_mm
    else:
        page_w_mm, page_h_mm = w_mm, h_mm

    auto_print_js = """
      <script>
        window.addEventListener('load', function(){
          setTimeout(function(){ try{ window.focus(); window.print(); }catch(e){} }, 300);
        });
      </script>
    """ if auto_print else ""

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Label</title>
<style>
  @page {{ size: {page_w_mm}mm {page_h_mm}mm; margin: 0; }}
  * {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; background: #fff; }}
  body {{ font-family: Helvetica, Arial, sans-serif; color: #000; }}
  .label {{
    width: {page_w_mm}mm; height: {page_h_mm}mm;
    box-sizing: border-box; padding: 1.5mm;
    position: relative;
    page-break-after: always;
    overflow: hidden;
  }}
  .label:last-child {{ page-break-after: auto; }}
  img {{ display: block; }}

  /* standard */
  .lbl-std {{ display: flex; flex-direction: column; align-items: center; height: 100%; gap: 0.5mm; }}
  .lbl-std .title {{ font-weight: bold; font-size: 9pt; text-align: center; line-height: 1.1; }}
  .lbl-std .qr   {{ flex: 1 1 auto; max-height: 70%; width: auto; margin: auto; object-fit: contain; }}
  .lbl-std .foot {{ font-size: 6.5pt; text-align: center; line-height: 1.2; }}

  /* compact */
  .lbl-compact {{ display: flex; gap: 1.5mm; height: 100%; align-items: center; }}
  .lbl-compact .qr {{ height: 100%; width: auto; max-width: 40%; object-fit: contain; }}
  .lbl-compact .side {{ flex: 1; min-width: 0; }}
  .lbl-compact .title {{ font-weight: bold; font-size: 8pt; line-height: 1.1; }}
  .lbl-compact .row {{ font-size: 6.5pt; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}

  /* qr only */
  .lbl-qr-only {{ display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 0.5mm; }}
  .lbl-qr-only img {{ max-width: 75%; max-height: 80%; object-fit: contain; }}
  .lbl-qr-only .cap {{ font-size: 7pt; font-weight: bold; text-align: center; }}

  /* with logo */
  .lbl-logo {{ display: flex; flex-direction: column; height: 100%; gap: 1mm; }}
  .lbl-logo .top {{ display: flex; gap: 2mm; align-items: center; flex: 0 0 auto; }}
  .lbl-logo .logo {{ width: 7mm; height: 7mm; border: 0.3mm solid #888; display:flex;align-items:center;justify-content:center;font-size:5pt;color:#888; }}
  .lbl-logo .title {{ font-weight: bold; font-size: 8pt; line-height: 1.1; }}
  .lbl-logo .bottom {{ display: flex; gap: 2mm; flex: 1; min-height: 0; }}
  .lbl-logo .qr {{ height: 100%; width: auto; max-width: 40%; object-fit: contain; }}
  .lbl-logo .side {{ flex: 1; min-width: 0; }}
  .lbl-logo .row {{ font-size: 6.5pt; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}

  /* title + date + time */
  .lbl-tdt {{ display: flex; flex-direction: column; height: 100%; gap: 0.5mm; }}
  .lbl-tdt .title {{ text-align: center; font-weight: bold; font-size: 10pt; line-height: 1.1; flex: 0 0 auto; }}
  .lbl-tdt .body {{ display: flex; gap: 2mm; flex: 1; min-height: 0; align-items: flex-end; }}
  .lbl-tdt .qr {{ height: 100%; width: auto; max-width: 30%; object-fit: contain; }}
  .lbl-tdt .meta {{ flex: 1; text-align: right; font-size: 7.5pt; line-height: 1.3; }}
  .lbl-tdt .ext {{ font-size: 6.5pt; }}

  /* blank */
  .lbl-blank {{ display: flex; gap: 1.5mm; height: 100%; align-items: stretch; }}
  .lbl-blank .lines {{ flex: 1; min-width: 0; font-size: 7.5pt; line-height: 1.25; display: flex; flex-direction: column; justify-content: flex-start; }}
  .lbl-blank .row {{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .lbl-blank .qr {{ height: 100%; width: auto; max-width: 28%; object-fit: contain; align-self: center; }}
</style>
</head>
<body>
  {"".join(labels_html)}
  {auto_print_js}
</body>
</html>"""
    return html


# ==================== TEMPLATE CRUD ====================

@router.get("/templates")
async def list_templates(
    status: Optional[str] = Query(None, regex="^(draft|published|archived)$"),
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$ne": "archived"}
    docs = await db.label_templates.find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)
    for d in docs:
        _serialize_dt(d)
    return {"templates": docs, "total": len(docs)}


@router.get("/templates/{template_id}")
async def get_template(template_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.label_templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    return _serialize_dt(doc)


@router.post("/templates")
async def create_template(
    body: LabelTemplateCreate,
    current_user: dict = Depends(get_current_user),
):
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        **body.dict(),
        "version": 1,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": now,
        "updated_at": now,
    }
    await db.label_templates.insert_one(doc)
    _strip_mongo_id(doc)
    return _serialize_dt(doc)


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    body: LabelTemplateUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.label_templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if not updates:
        return _serialize_dt(existing)
    updates["updated_at"] = _now()
    updates["version"] = int(existing.get("version", 1)) + 1
    await db.label_templates.update_one({"id": template_id}, {"$set": updates})
    doc = await db.label_templates.find_one({"id": template_id}, {"_id": 0})
    return _serialize_dt(doc)


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.label_templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.label_templates.update_one(
        {"id": template_id},
        {"$set": {"status": "archived", "updated_at": _now()}},
    )
    return {"success": True, "id": template_id, "status": "archived"}


@router.post("/templates/{template_id}/duplicate")
async def duplicate_template(template_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.label_templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    now = _now()
    new_doc = {
        **existing,
        "id": str(uuid.uuid4()),
        "name": f"{existing.get('name', 'Template')} (copy)",
        "status": "draft",
        "version": 1,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": now,
        "updated_at": now,
    }
    new_doc.pop("_id", None)
    await db.label_templates.insert_one(new_doc)
    _strip_mongo_id(new_doc)
    return _serialize_dt(new_doc)


# ==================== PREVIEW & PRINT ====================

@router.post("/preview")
async def preview_label(body: PreviewRequest, current_user: dict = Depends(get_current_user)):
    """Return a PDF preview. Accepts either a transient template (designer) or a saved template_id."""
    if body.template_id:
        tpl_doc = await db.label_templates.find_one({"id": body.template_id}, {"_id": 0})
        if not tpl_doc:
            raise HTTPException(status_code=404, detail="Template not found")
        tpl = tpl_doc
    elif body.template:
        tpl = body.template.dict()
    else:
        raise HTTPException(status_code=400, detail="Provide template or template_id")

    if body.asset_id:
        data = await _load_asset(body.asset_id)
        if not data:
            data = SAMPLE_DATA.copy()
    elif body.sample_data:
        data = {**SAMPLE_DATA, **body.sample_data}
    else:
        data = SAMPLE_DATA.copy()

    # Merge form submission values (if provided) so bindings can reference them
    if body.submission_id:
        sub_data = await _load_submission_data(body.submission_id)
        # If no explicit asset was supplied, try using the submission's linked equipment
        if not body.asset_id and sub_data.get("_linked_equipment_id"):
            asset_d = await _load_asset(sub_data["_linked_equipment_id"])
            if asset_d:
                data = {**SAMPLE_DATA, **asset_d}
        data.update(sub_data)

    pdf_bytes = _render_pdf(tpl, [data], copies=1)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="label-preview.pdf"'},
    )


@router.post("/print")
async def print_labels(body: PrintRequest, current_user: dict = Depends(get_current_user)):
    """Render a print-ready PDF for one or many assets and record the job."""
    tpl_doc = await db.label_templates.find_one({"id": body.template_id}, {"_id": 0})
    if not tpl_doc:
        raise HTTPException(status_code=404, detail="Template not found")

    datasets: List[dict] = []
    resolved_assets: List[str] = []

    # Submission-based single label: load submission, merge with linked asset
    if body.submission_id:
        sub_data = await _load_submission_data(body.submission_id)
        if not sub_data:
            raise HTTPException(status_code=404, detail="Submission not found")
        base = SAMPLE_DATA.copy()
        eq_id = sub_data.pop("_linked_equipment_id", None) if "_linked_equipment_id" in sub_data else None
        if body.asset_ids and body.asset_ids[0]:
            a = await _load_asset(body.asset_ids[0])
            if a:
                base.update(a)
                resolved_assets.append(body.asset_ids[0])
        elif eq_id:
            a = await _load_asset(eq_id)
            if a:
                base.update(a)
                resolved_assets.append(eq_id)
        base.update(sub_data)
        datasets.append(base)
    elif body.asset_ids:
        for aid in body.asset_ids[:500]:  # cap at 500 per job
            d = await _load_asset(aid)
            if d:
                datasets.append(d)
                resolved_assets.append(aid)
    if not datasets:
        datasets = [SAMPLE_DATA.copy()]

    pdf_bytes = _render_pdf(tpl_doc, datasets, copies=body.copies, margin_offset_mm=body.margin_offset_mm)

    # Record print job
    job = {
        "id": str(uuid.uuid4()),
        "template_id": body.template_id,
        "template_name": tpl_doc.get("name"),
        "user_id": current_user.get("id"),
        "user_name": current_user.get("name") or current_user.get("email"),
        "printer_name": body.printer_name or "browser",
        "asset_ids": resolved_assets,
        "qty": len(datasets) * max(1, int(body.copies)),
        "copies": body.copies,
        "status": "success",
        "created_at": _now(),
    }
    await db.label_print_jobs.insert_one(job)

    filename = f"labels-{tpl_doc.get('name', 'print').replace(' ', '_')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "X-Print-Job-Id": job["id"],
        },
    )


# ==================== HTML RENDER (for mobile print) ====================

from fastapi.responses import HTMLResponse


async def _resolve_datasets_for_render(
    template_id: str,
    asset_ids: List[str],
    submission_id: Optional[str],
) -> tuple[dict, List[dict], List[str]]:
    tpl_doc = await db.label_templates.find_one({"id": template_id}, {"_id": 0})
    if not tpl_doc:
        raise HTTPException(status_code=404, detail="Template not found")
    datasets: List[dict] = []
    resolved: List[str] = []
    if submission_id:
        sub_data = await _load_submission_data(submission_id)
        if not sub_data:
            raise HTTPException(status_code=404, detail="Submission not found")
        base = SAMPLE_DATA.copy()
        eq_id = sub_data.pop("_linked_equipment_id", None) if "_linked_equipment_id" in sub_data else None
        if asset_ids and asset_ids[0]:
            a = await _load_asset(asset_ids[0])
            if a:
                base.update(a)
                resolved.append(asset_ids[0])
        elif eq_id:
            a = await _load_asset(eq_id)
            if a:
                base.update(a)
                resolved.append(eq_id)
        base.update(sub_data)
        datasets.append(base)
    elif asset_ids:
        for aid in asset_ids[:500]:
            d = await _load_asset(aid)
            if d:
                datasets.append(d)
                resolved.append(aid)
    if not datasets:
        datasets = [SAMPLE_DATA.copy()]
    return tpl_doc, datasets, resolved


class RenderHtmlRequest(BaseModel):
    template_id: str
    asset_ids: List[str] = Field(default_factory=list)
    submission_id: Optional[str] = None
    copies: int = 1
    auto_print: bool = True


@router.post("/render-html")
async def render_label_html(
    body: RenderHtmlRequest,
    current_user: dict = Depends(get_current_user),
):
    """Return the label as a standalone print-ready HTML page.

    Used on mobile where browsers can trigger native print only on HTML
    (not on PDF blobs). The page auto-calls window.print() on load by default.
    """
    tpl_doc, datasets, resolved = await _resolve_datasets_for_render(
        body.template_id, body.asset_ids, body.submission_id
    )
    html = _render_label_html(tpl_doc, datasets, copies=body.copies, auto_print=body.auto_print)

    # Record a print job so history still shows it (printer_name marks it as mobile)
    job = {
        "id": str(uuid.uuid4()),
        "template_id": body.template_id,
        "template_name": tpl_doc.get("name"),
        "user_id": current_user.get("id"),
        "user_name": current_user.get("name") or current_user.get("email"),
        "printer_name": "mobile-html",
        "asset_ids": resolved,
        "qty": len(datasets) * max(1, int(body.copies)),
        "copies": body.copies,
        "status": "success",
        "created_at": _now(),
    }
    await db.label_print_jobs.insert_one(job)
    return HTMLResponse(content=html, headers={"X-Print-Job-Id": job["id"]})


@router.get("/jobs")
async def list_jobs(
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    jobs = await db.label_print_jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for j in jobs:
        _serialize_dt(j)
    return {"jobs": jobs, "total": len(jobs)}


# ==================== HELPERS FOR UI ====================

@router.get("/presets")
async def list_presets(current_user: dict = Depends(get_current_user)):
    """Return the list of available preset layouts + default sizes for the UI."""
    return {
        "presets": [
            {
                "key": "standard",
                "name": "Standard",
                "description": "Asset name on top, QR in center, info below",
                "default_size": {"width_mm": 50, "height_mm": 30},
                "max_bindings": 2,
            },
            {
                "key": "compact",
                "name": "Compact",
                "description": "QR on left, text on right — best for narrow labels",
                "default_size": {"width_mm": 60, "height_mm": 25},
                "max_bindings": 3,
            },
            {
                "key": "qr_only",
                "name": "QR Only",
                "description": "Large QR code with a single caption line",
                "default_size": {"width_mm": 40, "height_mm": 40},
                "max_bindings": 1,
            },
            {
                "key": "with_logo",
                "name": "With Logo",
                "description": "Logo + name on top, QR + info at bottom",
                "default_size": {"width_mm": 60, "height_mm": 30},
                "max_bindings": 4,
            },
            {
                "key": "title_date_time",
                "name": "Title + Date + Time",
                "description": "Wide label: title on top, QR bottom-left, date & time bottom-right",
                "default_size": {"width_mm": 90.3, "height_mm": 29},
                "max_bindings": 5,
            },
            {
                "key": "blank",
                "name": "Blank",
                "description": "Empty canvas: compact QR bottom-right, your bindings flow as lines",
                "default_size": {"width_mm": 90.3, "height_mm": 29},
                "max_bindings": 8,
            },
        ],
        "asset_fields": [
            {"key": "asset_id", "label": "Asset ID"},
            {"key": "asset_name", "label": "Asset Name (Title)"},
            {"key": "serial_number", "label": "Serial Number"},
            {"key": "location", "label": "Location"},
            {"key": "department", "label": "Department"},
            {"key": "status", "label": "Status"},
            {"key": "inspection_date", "label": "Inspection Date"},
            {"key": "asset_type", "label": "Asset Type"},
            {"key": "print_date", "label": "Print Date (auto)"},
            {"key": "print_time", "label": "Print Time (auto)"},
            {"key": "custom", "label": "Custom Text"},
        ],
    }
