/**
 * Unified Discipline Constants
 * Used across the application for consistency in Actions, Tasks, AI Recommendations, and FMEA.
 */

export const DISCIPLINES = [
  { value: "Mechanical", label: "Mechanical", color: "bg-blue-100 text-blue-700" },
  { value: "Electrical", label: "Electrical", color: "bg-yellow-100 text-yellow-700" },
  { value: "Instrumentation", label: "Instrumentation", color: "bg-purple-100 text-purple-700" },
  { value: "Process", label: "Process", color: "bg-green-100 text-green-700" },
  { value: "Operations", label: "Operations", color: "bg-orange-100 text-orange-700" },
  { value: "Maintenance", label: "Maintenance", color: "bg-slate-100 text-slate-700" },
  { value: "Safety", label: "Safety", color: "bg-red-100 text-red-700" },
  { value: "Inspection", label: "Inspection", color: "bg-cyan-100 text-cyan-700" },
  { value: "Reliability", label: "Reliability", color: "bg-indigo-100 text-indigo-700" },
  { value: "Rotating Equipment", label: "Rotating Equipment", color: "bg-teal-100 text-teal-700" },
  { value: "Static Equipment", label: "Static Equipment", color: "bg-amber-100 text-amber-700" },
  { value: "Multi-discipline", label: "Multi-discipline", color: "bg-pink-100 text-pink-700" },
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
  
  // Legacy mappings
  const legacyMap = {
    "lab": "Inspection",
    "laboratory": "Inspection",
    "engineering": "Reliability",
    "piping": "Static Equipment",
  };
  
  const mapped = legacyMap[value.toLowerCase()];
  if (mapped) return mapped;
  
  // Return title-cased as fallback
  return value.charAt(0).toUpperCase() + value.slice(1);
};
