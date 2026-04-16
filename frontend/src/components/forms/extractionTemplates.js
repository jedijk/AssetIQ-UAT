/**
 * Pre-built extraction schema templates for Photo AI Extraction.
 * Users can load these as starting points when configuring a form.
 */

export const EXTRACTION_TEMPLATES = [
  {
    id: "digital_display",
    name: "Digital Display Panel",
    description: "Numeric readings from digital screens, HMIs, control panels",
    mode: "structured",
    label: "Scan Display",
    fields: [
      { key: "reading_1", description: "Primary numeric reading on display", type: "number" },
      { key: "reading_2", description: "Secondary numeric reading on display", type: "number" },
      { key: "reading_3", description: "Third numeric reading if visible", type: "number" },
      { key: "setpoint", description: "Setpoint or target value if shown", type: "number" },
      { key: "unit", description: "Unit of measurement shown on display", type: "string" },
      { key: "status", description: "Status indicator (running, stopped, alarm)", type: "string" },
    ],
  },
  {
    id: "equipment_nameplate",
    name: "Equipment Nameplate",
    description: "Serial numbers, model info, manufacturer data from equipment labels",
    mode: "text",
    label: "Scan Nameplate",
    fields: [
      { key: "manufacturer", description: "Manufacturer or brand name", type: "string" },
      { key: "model", description: "Model number or designation", type: "string" },
      { key: "serial_number", description: "Serial number", type: "string" },
      { key: "year", description: "Year of manufacture", type: "number" },
      { key: "rated_power", description: "Rated power (kW or HP)", type: "string" },
      { key: "rated_voltage", description: "Rated voltage", type: "string" },
      { key: "rated_current", description: "Rated current (Amps)", type: "string" },
      { key: "ip_rating", description: "IP protection rating", type: "string" },
    ],
  },
  {
    id: "gauge_meter",
    name: "Gauge / Meter Reading",
    description: "Pressure gauges, temperature dials, flow meters, analog instruments",
    mode: "structured",
    label: "Scan Gauge",
    fields: [
      { key: "value", description: "Current reading value on the gauge", type: "number" },
      { key: "unit", description: "Unit of measurement (bar, psi, °C, m³/h)", type: "string" },
      { key: "min_scale", description: "Minimum value on the gauge scale", type: "number" },
      { key: "max_scale", description: "Maximum value on the gauge scale", type: "number" },
      { key: "zone", description: "Color zone the needle is in (green, yellow, red)", type: "string" },
    ],
  },
  {
    id: "visual_inspection",
    name: "Visual Inspection",
    description: "Condition assessment, damage detection, corrosion checks",
    mode: "classification",
    label: "Inspect & Classify",
    fields: [
      { key: "overall_condition", description: "Overall condition", type: "enum", enum_values: ["Good", "Acceptable", "Poor", "Critical"] },
      { key: "corrosion", description: "Corrosion level", type: "enum", enum_values: ["None", "Light", "Moderate", "Severe"] },
      { key: "damage_type", description: "Type of damage observed", type: "string" },
      { key: "damage_location", description: "Location of damage on the equipment", type: "string" },
      { key: "leak_detected", description: "Is there any leak visible?", type: "enum", enum_values: ["No", "Minor", "Major"] },
      { key: "notes", description: "Additional observations or comments", type: "string" },
    ],
  },
];
