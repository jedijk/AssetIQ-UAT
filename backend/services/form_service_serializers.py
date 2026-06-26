"""Serialization helpers for form templates and submissions."""
from typing import Any, Dict


def serialize_datetime(dt) -> str:
    """Serialize datetime to ISO format with UTC timezone suffix."""
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        iso_str = dt.isoformat()
        if not iso_str.endswith("Z") and "+" not in iso_str and "-" not in iso_str[-6:]:
            iso_str += "+00:00"
        return iso_str
    return dt


def serialize_template(doc: Dict) -> Dict[str, Any]:
    """Serialize template document."""
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "description": doc.get("description"),
        "discipline": doc.get("discipline"),
        "failure_mode_ids": doc.get("failure_mode_ids", []),
        "equipment_type_ids": doc.get("equipment_type_ids", []),
        "fields": doc.get("fields", []),
        "field_count": len(doc.get("fields", [])),
        "documents": doc.get("documents", []),
        "allow_partial_submission": doc.get("allow_partial_submission", False),
        "require_signature": doc.get("require_signature", False),
        "tags": doc.get("tags", []),
        "photo_extraction_config": doc.get("photo_extraction_config"),
        "label_print_config": doc.get("label_print_config"),
        "version": doc.get("version", 1),
        "is_active": doc.get("is_active", True),
        "is_latest": doc.get("is_latest", True),
        "usage_count": doc.get("usage_count", 0),
        "created_at": serialize_datetime(doc.get("created_at")),
        "updated_at": serialize_datetime(doc.get("updated_at")),
    }


def serialize_submission(doc: Dict) -> Dict[str, Any]:
    """Serialize submission document."""
    values = doc.get("values", [])
    doc_id = doc.get("id") or (str(doc["_id"]) if doc.get("_id") else None)

    raw_attachments = doc.get("attachments", [])
    processed_attachments = []
    for att in raw_attachments:
        processed = {
            "name": att.get("name"),
            "type": att.get("type"),
            "size": att.get("size"),
        }
        if att.get("url"):
            processed["url"] = att["url"]
        elif att.get("data"):
            data = att.get("data", "")
            if len(data) < 50000:
                processed["data"] = data
            else:
                processed["error"] = "Legacy attachment - file too large to display inline"
                processed["needs_migration"] = True
        elif att.get("error"):
            processed["error"] = att["error"]
        processed_attachments.append(processed)

    return {
        "id": doc_id,
        "form_template_id": doc["form_template_id"],
        "form_template_name": doc.get("form_template_name"),
        "template_name": doc.get("form_template_name"),
        "form_template_version": doc.get("form_template_version"),
        "label_template_id": doc.get("label_template_id"),
        "task_instance_id": doc.get("task_instance_id"),
        "equipment_id": doc.get("equipment_id"),
        "equipment_name": doc.get("equipment_name"),
        "equipment_path": doc.get("equipment_path"),
        "efm_id": doc.get("efm_id"),
        "values": values,
        "responses": values,
        "attachments": processed_attachments,
        "threshold_breaches": doc.get("threshold_breaches", []),
        "failure_indicators": doc.get("failure_indicators", []),
        "has_warnings": doc.get("has_warnings", False),
        "has_critical": doc.get("has_critical", False),
        "has_failures": doc.get("has_failures", False),
        "notes": doc.get("notes"),
        "has_signature": doc.get("signature_data") is not None,
        "submitted_by": doc.get("submitted_by"),
        "submitted_by_name": doc.get("submitted_by_name"),
        "submitted_by_photo": doc.get("submitted_by_photo"),
        "submitted_at": serialize_datetime(doc.get("submitted_at")),
        "created_at": serialize_datetime(doc.get("created_at")),
        "status": doc.get("status", "completed"),
        "task_template_name": doc.get("task_template_name"),
        "discipline": doc.get("discipline"),
    }
