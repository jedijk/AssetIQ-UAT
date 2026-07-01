"""Tests for Success Readiness assessment templates."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017/test")

from services.success_readiness_assessments import (
    ASSESSMENT_TEMPLATES,
    _merge_field_metadata,
)


def test_all_assessment_fields_have_intent():
    for template in ASSESSMENT_TEMPLATES:
        for field in template["fields"]:
            assert field.get("intent"), f"Missing intent for {template['template_id']}.{field['id']}"


def test_merge_field_metadata_adds_intent_from_template():
    assessment = {
        "template_id": "training_review",
        "fields": [
            {"id": "required_users", "label": "Required users", "type": "number"},
        ],
    }
    merged = _merge_field_metadata(assessment)
    assert merged["fields"][0]["intent"]
    assert "training" in merged["fields"][0]["intent"].lower()
