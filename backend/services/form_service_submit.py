"""Form submission validation, threshold evaluation, and persistence."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Awaitable, Callable, Dict, Optional

from bson import ObjectId

from services.form_service_serializers import serialize_submission
from services.form_service_thresholds import (
    check_failure_indicator,
    create_observation_for_breach,
    evaluate_numeric_threshold,
)
from services.tenant_schema import with_tenant_id


async def submit_form(
    *,
    db,
    submissions,
    templates,
    observations,
    efms,
    get_template_by_id: Callable[[str], Awaitable[Optional[Dict[str, Any]]]],
    try_auto_pair_mooney_viscosity: Callable[[Dict[str, Any]], Awaitable[None]],
    after_form_submission_reliability_update: Callable[..., Awaitable[None]],
    data: Dict[str, Any],
    submitted_by: str,
    user: Optional[dict] = None,
) -> Dict[str, Any]:
    """Submit a form with data validation and threshold checking."""
    now = datetime.now(timezone.utc)

    # Get the template
    template = await get_template_by_id(data["form_template_id"])
    if not template:
        raise ValueError("Form template not found")

    # Validate required fields
    field_map = {f["id"]: f for f in template.get("fields", [])}
    values = data.get("values", [])
    value_map = {v["field_id"]: v for v in values}

    if not template.get("allow_partial_submission"):
        for field in template.get("fields", []):
            if field.get("required") and field["id"] not in value_map:
                raise ValueError(f"Required field '{field.get('label', field['id'])}' is missing")

    # Validate no future dates (with 5 minute buffer for clock differences)
    # and reject dates far from today (e.g. OCR year 2016 when submitting in 2026).
    future_buffer = timedelta(minutes=5)
    max_date_drift_days = 31
    max_date_year_gap = 1
    for value in values:
        field_id = value["field_id"]
        field_def = field_map.get(field_id)
        if field_def and field_def.get("field_type") in ["date", "datetime"]:
            date_value = value.get("value")
            if date_value:
                try:
                    from dateutil import parser
                    parsed_date = parser.parse(str(date_value))
                    label = field_def.get("label", field_id)
                    ref_date = now.date()
                    parsed_cal = parsed_date.date()
                    year_gap = abs(parsed_cal.year - ref_date.year)
                    day_gap = abs((parsed_cal - ref_date).days)
                    if year_gap > max_date_year_gap or day_gap > max_date_drift_days:
                        raise ValueError(
                            f"Date '{parsed_cal.isoformat()}' is too far from today for field '{label}'. "
                            "Please verify the reading date."
                        )
                    # For naive datetimes, assume local time and compare date only for "date" fields
                    if field_def.get("field_type") == "date":
                        # For date-only fields, compare just the date part
                        if parsed_cal > ref_date:
                            raise ValueError(f"Future dates are not allowed for field '{label}'")
                    else:
                        # For datetime fields, add buffer for timezone/clock differences
                        if parsed_date.tzinfo is None:
                            parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                        if parsed_date > (now + future_buffer):
                            raise ValueError(f"Future dates are not allowed for field '{label}'")
                except (ValueError, TypeError) as e:
                    if "Future dates" in str(e) or "too far from today" in str(e):
                        raise
                    # Ignore parsing errors for non-date values
                    pass

    # Evaluate thresholds and failure indicators
    evaluated_values = []
    threshold_breaches = []
    failure_indicators = []

    for value in values:
        field_id = value["field_id"]
        field_def = field_map.get(field_id)

        if not field_def:
            continue

        evaluated = {
            "field_id": field_id,
            "field_label": field_def.get("label"),
            "value": value["value"],
            "unit": field_def.get("unit"),
            "threshold_status": "normal",
            "is_failure_indicator": False
        }

        # Evaluate numeric thresholds
        if field_def.get("field_type") == "numeric" and field_def.get("thresholds"):
            threshold_status = evaluate_numeric_threshold(
                value["value"],
                field_def["thresholds"]
            )
            evaluated["threshold_status"] = threshold_status

            if threshold_status in ["warning", "critical"]:
                threshold_breaches.append({
                    "field_id": field_id,
                    "field_label": field_def.get("label"),
                    "value": value["value"],
                    "unit": field_def.get("unit"),
                    "status": threshold_status,
                    "thresholds": field_def["thresholds"]
                })

        # Check dropdown failure indicators
        if field_def.get("field_type") == "dropdown" and field_def.get("options"):
            for option in field_def["options"]:
                if option.get("value") == value["value"] and option.get("is_failure"):
                    evaluated["is_failure_indicator"] = True
                    evaluated["threshold_status"] = option.get("severity", "warning")
                    failure_indicators.append({
                        "field_id": field_id,
                        "field_label": field_def.get("label"),
                        "value": value["value"],
                        "severity": option.get("severity", "warning")
                    })
                    break

        # Check general failure indicator type
        if field_def.get("failure_indicator_type") != "none":
            is_failure = check_failure_indicator(
                value["value"],
                field_def
            )
            if is_failure:
                evaluated["is_failure_indicator"] = True
                failure_indicators.append({
                    "field_id": field_id,
                    "field_label": field_def.get("label"),
                    "value": value["value"],
                    "failure_mode_id": field_def.get("failure_mode_id")
                })

        evaluated_values.append(evaluated)

    # Check signature requirement
    if template.get("require_signature") and not data.get("signature_data"):
        raise ValueError("Signature is required for this form")

    # Resolve equipment name/tag if equipment_id provided
    equipment_name = ""
    equipment_tag = ""
    if data.get("equipment_id"):
        equip = await db.equipment_nodes.find_one(
            {"id": data["equipment_id"]}, {"_id": 0, "name": 1, "tag": 1}
        )
        if equip:
            equipment_name = equip.get("name", "")
            equipment_tag = equip.get("tag", "")

    # Resolve submitted_by_name
    submitted_by_name = ""
    if submitted_by:
        user = await db.users.find_one(
            {"id": submitted_by}, {"_id": 0, "name": 1}
        )
        if user:
            submitted_by_name = user.get("name", "")

    # Create submission document
    label_cfg = template.get("label_print_config") or {}
    label_template_id = label_cfg.get("label_template_id") if isinstance(label_cfg, dict) else None
    doc = {
        "id": str(uuid.uuid4()),  # Custom string ID for consistency
        "form_template_id": data["form_template_id"],
        "form_template_name": template["name"],
        "form_template_version": template.get("version", 1),
        # Freeze the label template used at submission-time so reprints match.
        # If the form template is later reconfigured to a different label template,
        # the submission can still be reprinted identically.
        "label_template_id": label_template_id,
        "task_instance_id": data.get("task_instance_id"),
        "task_template_name": data.get("task_template_name"),
        "equipment_id": data.get("equipment_id"),
        "equipment_name": equipment_name,
        "equipment_tag": equipment_tag,
        "efm_id": data.get("efm_id"),
        "values": evaluated_values,
        "threshold_breaches": threshold_breaches,
        "failure_indicators": failure_indicators,
        "has_warnings": any(v.get("threshold_status") == "warning" for v in evaluated_values),
        "has_critical": any(v.get("threshold_status") == "critical" for v in evaluated_values),
        "has_failures": len(failure_indicators) > 0,
        "notes": data.get("notes"),
        "signature_data": data.get("signature_data"),
        "submitted_by": submitted_by,
        "submitted_by_name": submitted_by_name,
        "submitted_at": now,
        "created_at": now,
    }
    with_tenant_id(doc, user)

    result = await submissions.insert_one(doc)
    doc["_id"] = result.inserted_id

    # Increment template usage count
    await templates.update_one(
        {"_id": ObjectId(data["form_template_id"])},
        {"$inc": {"usage_count": 1}}
    )

    await try_auto_pair_mooney_viscosity(doc)

    # Auto-create observations for critical breaches
    observations_created = []
    for breach in threshold_breaches:
        if breach["status"] == "critical":
            field_def = field_map.get(breach["field_id"])
            if field_def and field_def.get("auto_create_observation"):
                obs = await create_observation_for_breach(
                    observations,
                    efms,
                    doc, breach, field_def, submitted_by
                )
                if obs:
                    observations_created.append(obs)

    await after_form_submission_reliability_update(doc, submitted_by, notes=data.get("notes"))

    try:
        from services.lifecycle_dispatch import publish_form_submission_created

        await publish_form_submission_created(
            doc["id"],
            task_instance_id=doc.get("task_instance_id"),
            equipment_id=doc.get("equipment_id"),
            user=user,
        )
    except Exception:
        pass

    serialized = serialize_submission(doc)
    serialized["observations_created"] = len(observations_created)

    return serialized
