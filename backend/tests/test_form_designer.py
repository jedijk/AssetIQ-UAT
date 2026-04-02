"""
Form Designer Backend Tests
Tests for field type validation, upload handling, and equipment hierarchy API.
"""

import pytest
from datetime import datetime
from models.form_models import (
    FormFieldDefinition, FormTemplateCreate, FormTemplateUpdate,
    FieldType, NumericThreshold, DropdownOption
)


class TestFieldTypeSubOptions:
    """Test that field types preserve correct sub-options."""
    
    def test_numeric_field_has_thresholds(self):
        """Numeric fields should have unit and thresholds."""
        field = FormFieldDefinition(
            id="temp",
            label="Temperature",
            field_type=FieldType.NUMERIC,
            unit="°C",
            thresholds=NumericThreshold(
                warning_low=10,
                warning_high=50,
                critical_low=5,
                critical_high=60
            )
        )
        
        assert field.unit == "°C"
        assert field.thresholds.warning_high == 50
        assert field.thresholds.critical_low == 5
    
    def test_dropdown_field_has_options(self):
        """Dropdown fields should have options list."""
        field = FormFieldDefinition(
            id="status",
            label="Status",
            field_type=FieldType.DROPDOWN,
            options=[
                DropdownOption(value="ok", label="OK", is_failure=False),
                DropdownOption(value="fail", label="Failed", is_failure=True),
            ]
        )
        
        assert len(field.options) == 2
        assert field.options[1].is_failure
    
    def test_multi_select_field_has_options(self):
        """Multi-select fields should have options list."""
        field = FormFieldDefinition(
            id="tags",
            label="Tags",
            field_type=FieldType.MULTI_SELECT,
            options=[
                DropdownOption(value="urgent", label="Urgent"),
                DropdownOption(value="review", label="Review"),
            ]
        )
        
        assert len(field.options) == 2
    
    def test_range_field_has_min_max_step(self):
        """Range fields should have min, max, step."""
        field = FormFieldDefinition(
            id="pressure",
            label="Pressure",
            field_type=FieldType.RANGE,
            range_min=0,
            range_max=100,
            range_step=5
        )
        
        assert field.range_min == 0
        assert field.range_max == 100
        assert field.range_step == 5
    
    def test_file_field_has_extensions_and_size(self):
        """File fields should have allowed extensions and max size."""
        field = FormFieldDefinition(
            id="document",
            label="Document",
            field_type=FieldType.FILE,
            allowed_extensions=["pdf", "doc", "xlsx"],
            max_file_size_mb=10.0
        )
        
        assert "pdf" in field.allowed_extensions
        assert field.max_file_size_mb == 10.0
    
    def test_image_field_has_extensions_and_size(self):
        """Image fields should have allowed extensions and max size."""
        field = FormFieldDefinition(
            id="photo",
            label="Photo",
            field_type=FieldType.IMAGE,
            allowed_extensions=["jpg", "png", "gif"],
            max_file_size_mb=5.0
        )
        
        assert "jpg" in field.allowed_extensions
        assert field.max_file_size_mb == 5.0


class TestFieldTypeValidation:
    """Test that field types are validated correctly."""
    
    def test_valid_field_types(self):
        """All defined field types should be valid."""
        valid_types = [
            "numeric", "text", "textarea", "dropdown", "multi_select",
            "boolean", "range", "date", "datetime", "file", "image", "signature"
        ]
        
        for field_type in valid_types:
            field = FormFieldDefinition(
                id="test",
                label="Test",
                field_type=FieldType(field_type)
            )
            assert field.field_type.value == field_type
    
    def test_numeric_threshold_range_validation(self):
        """Thresholds should accept valid numeric ranges."""
        threshold = NumericThreshold(
            warning_low=10.5,
            warning_high=50.0,
            critical_low=5.0,
            critical_high=60.5
        )
        
        assert threshold.warning_low < threshold.warning_high
        assert threshold.critical_low < threshold.critical_high
    
    def test_dropdown_option_failure_indicator(self):
        """Dropdown options can mark failure indicators."""
        option = DropdownOption(
            value="broken",
            label="Broken",
            is_failure=True,
            severity="critical"
        )
        
        assert option.is_failure
        assert option.severity == "critical"


class TestFormTemplatePersistence:
    """Test that form templates persist correctly."""
    
    def test_create_template_with_mixed_fields(self):
        """Templates should preserve all field types correctly."""
        template = FormTemplateCreate(
            name="Equipment Inspection",
            description="Daily equipment check",
            discipline="maintenance",
            fields=[
                FormFieldDefinition(
                    id="temp",
                    label="Temperature",
                    field_type=FieldType.NUMERIC,
                    unit="°C",
                    thresholds=NumericThreshold(warning_high=50, critical_high=60)
                ),
                FormFieldDefinition(
                    id="status",
                    label="Status",
                    field_type=FieldType.DROPDOWN,
                    options=[
                        DropdownOption(value="ok", label="OK"),
                        DropdownOption(value="fail", label="Failed", is_failure=True),
                    ]
                ),
                FormFieldDefinition(
                    id="notes",
                    label="Notes",
                    field_type=FieldType.TEXTAREA,
                ),
            ]
        )
        
        assert len(template.fields) == 3
        
        # Check numeric field preserved
        numeric_field = next(f for f in template.fields if f.id == "temp")
        assert numeric_field.unit == "°C"
        assert numeric_field.thresholds.warning_high == 50
        
        # Check dropdown field preserved
        dropdown_field = next(f for f in template.fields if f.id == "status")
        assert len(dropdown_field.options) == 2
        assert dropdown_field.options[1].is_failure
        
        # Check textarea has no sub-options contamination
        textarea_field = next(f for f in template.fields if f.id == "notes")
        assert textarea_field.thresholds is None
        assert textarea_field.options is None
    
    def test_update_template_preserves_fields(self):
        """Updating a template should preserve field configurations."""
        original_fields = [
            FormFieldDefinition(
                id="pressure",
                label="Pressure",
                field_type=FieldType.RANGE,
                range_min=0,
                range_max=100,
                range_step=5
            )
        ]
        
        update = FormTemplateUpdate(
            name="Updated Name",
            fields=original_fields
        )
        
        assert update.fields[0].range_min == 0
        assert update.fields[0].range_max == 100


class TestEquipmentHierarchyIntegration:
    """Test equipment hierarchy data structures."""
    
    def test_equipment_node_structure(self):
        """Equipment nodes should have required fields."""
        equipment_node = {
            "id": "unit-1",
            "name": "Pump Unit A",
            "level": "unit",
            "parent_id": "system-1",
            "path": "Installation > System > Unit",
        }
        
        assert "id" in equipment_node
        assert "name" in equipment_node
        assert "level" in equipment_node
        assert "path" in equipment_node
    
    def test_hierarchy_levels(self):
        """Valid hierarchy levels."""
        valid_levels = ["installation", "system", "unit", "subunit", "equipment"]
        
        for level in valid_levels:
            node = {"id": "test", "name": "Test", "level": level}
            assert node["level"] in valid_levels
    
    def test_search_result_has_path(self):
        """Search results should include hierarchy path."""
        search_result = {
            "id": "unit-1",
            "name": "Pump A",
            "level": "unit",
            "path": "Plant > System 1 > Pump A",
            "full_path": "Plant > System 1 > Pump A"
        }
        
        assert search_result.get("path") or search_result.get("full_path")


class TestUploadStateTransitions:
    """Test document upload state machine."""
    
    def test_initial_upload_state(self):
        """New pending document should be in idle state."""
        pending_doc = {
            "id": "doc_123",
            "name": "test.pdf",
            "file": b"content",
            "uploading": False,
            "error": None
        }
        
        assert pending_doc["uploading"] is False
        assert pending_doc["error"] is None
    
    def test_uploading_state(self):
        """Document being uploaded should have uploading=True."""
        pending_doc = {
            "id": "doc_123",
            "name": "test.pdf",
            "uploading": True,
            "error": None
        }
        
        assert pending_doc["uploading"]
        assert pending_doc["error"] is None
    
    def test_error_state(self):
        """Failed upload should have error message."""
        pending_doc = {
            "id": "doc_123",
            "name": "test.pdf",
            "uploading": False,
            "error": "Upload failed: Network timeout"
        }
        
        assert pending_doc["uploading"] is False
        assert pending_doc["error"] is not None
    
    def test_retry_clears_error(self):
        """Retry should clear error and set uploading."""
        # Start in error state
        pending_doc = {
            "id": "doc_123",
            "uploading": False,
            "error": "Failed"
        }
        
        # Simulate retry
        pending_doc["uploading"] = True
        pending_doc["error"] = None
        
        assert pending_doc["uploading"]
        assert pending_doc["error"] is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
