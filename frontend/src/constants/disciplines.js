/**
 * Unified Discipline Constants
 * Used across the application for consistency in Actions, Tasks, AI Recommendations, and FMEA.
 * 
 * CONFIGURATION: To change disciplines, update:
 * 1. This file (frontend constants)
 * 2. Backend: /app/backend/iso14224_models.py (Discipline enum)
 * 3. EquipmentTypeItem.jsx DISCIPLINE_COLORS for visual styling
 */

// Standard disciplines - aligned across the application
export const DISCIPLINES = [
  { value: "rotating", label: "Rotating", color: "bg-blue-100 text-blue-700" },
  { value: "static", label: "Static", color: "bg-slate-100 text-slate-700" },
  { value: "piping", label: "Piping", color: "bg-teal-100 text-teal-700" },
  { value: "electrical", label: "Electrical", color: "bg-amber-100 text-amber-700" },
  { value: "instrumentation", label: "Instrumentation", color: "bg-purple-100 text-purple-700" },
  { value: "civil", label: "Civil", color: "bg-orange-100 text-orange-700" },
  { value: "operations", label: "Operations", color: "bg-green-100 text-green-700" },
  { value: "laboratory", label: "Laboratory", color: "bg-cyan-100 text-cyan-700" },
  { value: "multi_discipline", label: "Multi-discipline", color: "bg-pink-100 text-pink-700" },
];

// Simple list of discipline values
export const DISCIPLINE_VALUES = DISCIPLINES.map(d => d.value);

// Simple list of discipline labels (for dropdowns)
export const DISCIPLINE_LABELS = DISCIPLINES.map(d => d.label);

// Get color class for a discipline
export const getDisciplineColor = (discipline) => {
  const found = DISCIPLINES.find(d => 
    d.value.toLowerCase() === (discipline || "").toLowerCase() ||
    d.label.toLowerCase() === (discipline || "").toLowerCase()
  );
  return found?.color || "bg-slate-100 text-slate-700";
};

// Get discipline label from value
export const getDisciplineLabel = (value) => {
  const found = DISCIPLINES.find(d => 
    d.value.toLowerCase() === (value || "").toLowerCase() ||
    d.label.toLowerCase() === (value || "").toLowerCase()
  );
  return found?.label || value;
};

/** Resolve a translated discipline label for UI selects and badges. */
export const translateDiscipline = (t, discipline) => {
  if (!discipline) return "";
  const normalized = normalizeDiscipline(discipline);
  const found = DISCIPLINES.find(
    (d) =>
      d.value === discipline ||
      d.value === normalized ||
      d.label.toLowerCase() === String(discipline).toLowerCase()
  );
  const keys = [
    found?.value,
    found?.label,
    discipline,
    normalized,
    String(discipline).replace(/[\s-]+/g, "_").toLowerCase(),
  ].filter(Boolean);
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const translated = t(`disciplines.${key}`);
    if (typeof translated === "string" && translated !== `disciplines.${key}`) {
      return translated;
    }
  }
  return found?.label || getDisciplineLabel(discipline) || discipline;
};

// Normalize a discipline value (handle legacy/case variations)
export const normalizeDiscipline = (value) => {
  if (!value) return "";
  
  // Direct match by value or label
  const direct = DISCIPLINES.find(d => 
    d.value === value || 
    d.label === value ||
    d.value.toLowerCase() === value.toLowerCase() ||
    d.label.toLowerCase() === value.toLowerCase()
  );
  if (direct) return direct.value;
  
  // Legacy mappings for backward compatibility
  const legacyMap = {
    // Old discipline names mapped to new ones
    "mechanical": "rotating",
    "rotating equipment": "rotating",
    "static equipment": "static",
    "process": "operations",
    "maintenance": "operations",
    "safety": "operations",
    "inspection": "laboratory",
    "lab": "laboratory",
    "reliability": "operations",
    "multi-discipline": "multi_discipline",
    "multi_discipline": "multi_discipline",
    "engineering": "operations",
  };
  
  const mapped = legacyMap[value.toLowerCase()];
  if (mapped) return mapped;
  
  // Return lowercase as fallback
  return value.toLowerCase().replace(/[\s-]/g, "_");
};
