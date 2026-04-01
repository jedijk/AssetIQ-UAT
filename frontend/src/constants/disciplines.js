/**
 * Unified Discipline Constants
 * Used across the application for consistency in Actions, Tasks, AI Recommendations, and FMEA.
 */

export const DISCIPLINES = [
  { value: "mechanical", label: "Mechanical", color: "bg-blue-100 text-blue-700" },
  { value: "electrical", label: "Electrical", color: "bg-yellow-100 text-yellow-700" },
  { value: "instrumentation", label: "Instrumentation", color: "bg-purple-100 text-purple-700" },
  { value: "process", label: "Process", color: "bg-green-100 text-green-700" },
  { value: "operations", label: "Operations", color: "bg-orange-100 text-orange-700" },
  { value: "maintenance", label: "Maintenance", color: "bg-slate-100 text-slate-700" },
  { value: "safety", label: "Safety", color: "bg-red-100 text-red-700" },
  { value: "inspection", label: "Inspection", color: "bg-cyan-100 text-cyan-700" },
  { value: "reliability", label: "Reliability", color: "bg-indigo-100 text-indigo-700" },
  { value: "rotating_equipment", label: "Rotating Equipment", color: "bg-teal-100 text-teal-700" },
  { value: "static_equipment", label: "Static Equipment", color: "bg-amber-100 text-amber-700" },
  { value: "multi_discipline", label: "Multi-discipline", color: "bg-pink-100 text-pink-700" },
];

// Simple list of discipline values
export const DISCIPLINE_VALUES = DISCIPLINES.map(d => d.value);

// Get color class for a discipline
export const getDisciplineColor = (discipline) => {
  const found = DISCIPLINES.find(d => 
    d.value.toLowerCase() === (discipline || "").toLowerCase()
  );
  return found?.color || "bg-slate-100 text-slate-700";
};

// Normalize a discipline value (handle legacy/case variations)
export const normalizeDiscipline = (value) => {
  if (!value) return "";
  
  // Direct match
  const direct = DISCIPLINES.find(d => d.value === value);
  if (direct) return direct.value;
  
  // Case-insensitive match
  const found = DISCIPLINES.find(d => 
    d.value.toLowerCase() === value.toLowerCase() ||
    d.value.toLowerCase().replace(/[\s-]/g, "_") === value.toLowerCase().replace(/[\s-]/g, "_")
  );
  if (found) return found.value;
  
  // Legacy mappings (capitalized versions)
  const legacyMap = {
    "mechanical": "mechanical",
    "electrical": "electrical",
    "instrumentation": "instrumentation",
    "process": "process",
    "operations": "operations",
    "maintenance": "maintenance",
    "safety": "safety",
    "inspection": "inspection",
    "reliability": "reliability",
    "rotating equipment": "rotating_equipment",
    "static equipment": "static_equipment",
    "multi-discipline": "multi_discipline",
    "lab": "inspection",
    "laboratory": "inspection",
    "engineering": "reliability",
    "piping": "static_equipment",
  };
  
  const mapped = legacyMap[value.toLowerCase()];
  if (mapped) return mapped;
  
  // Return lowercase with underscores as fallback
  return value.toLowerCase().replace(/[\s-]/g, "_");
};
