/**
 * Form Designer Constants
 * Field types and configurations
 */
import {
  Hash,
  Type,
  FileText,
  List,
  ToggleLeft,
  SlidersHorizontal,
  Calendar,
  Upload,
  Signature,
  Building2,
} from "lucide-react";

export const FIELD_TYPES = [
  { value: "numeric", label: "Numeric", icon: Hash, description: "Number with optional thresholds" },
  { value: "text", label: "Text", icon: Type, description: "Single line text" },
  { value: "textarea", label: "Text Area", icon: FileText, description: "Multi-line text" },
  { value: "dropdown", label: "Dropdown", icon: List, description: "Single select from options" },
  { value: "multi_select", label: "Multi-select", icon: List, description: "Multiple selections" },
  { value: "boolean", label: "Yes/No", icon: ToggleLeft, description: "Checkbox toggle" },
  { value: "range", label: "Range Slider", icon: SlidersHorizontal, description: "Slider with min/max" },
  { value: "date", label: "Date", icon: Calendar, description: "Date picker" },
  { value: "datetime", label: "Date & Time", icon: Calendar, description: "Date + time picker" },
  { value: "file", label: "File Upload", icon: Upload, description: "File attachment" },
  { value: "image", label: "Image", icon: Upload, description: "Image upload" },
  { value: "signature", label: "Signature", icon: Signature, description: "Digital signature" },
  { value: "equipment", label: "Equipment Link", icon: Building2, description: "Link to equipment hierarchy" },
];

export const DEFAULT_TEMPLATE_STATE = {
  name: "",
  description: "",
  discipline: "maintenance",
  fields: [],
  is_active: true,
  pendingDocuments: [],
};

export const DEFAULT_FIELD_STATE = {
  id: "",
  label: "",
  type: "text",
  required: false,
  description: "",
  placeholder: "",
  // Numeric thresholds
  min_value: "",
  max_value: "",
  warning_low: "",
  warning_high: "",
  critical_low: "",
  critical_high: "",
  unit: "",
  // Dropdown/multi-select options
  options: [],
  // Range slider
  range_min: 0,
  range_max: 100,
  range_step: 1,
  // Equipment link
  equipment_levels: ["equipment", "component"],
};

export const getFieldTypeConfig = (type) => {
  return FIELD_TYPES.find(f => f.value === type) || FIELD_TYPES[0];
};
