import { normalizeDiscipline } from "../constants/disciplines";

/** Default My Tasks discipline filters by role (when no saved preference). */
export const MAINTENANCE_DEFAULT_DISCIPLINES = [
  "rotating",
  "instrumentation",
  "static",
  "piping",
  "electrical",
  "civil",
];

/** Role-based default discipline filter for My Tasks. */
export function defaultDisciplinesForRole(role) {
  if (role === "operations") return ["operations"];
  if (role === "maintenance") return [...MAINTENANCE_DEFAULT_DISCIPLINES];
  return [];
}

/** Map stored preference to My Tasks multi-select state. */
export function disciplinesFromPreference(discipline) {
  if (!discipline) return [];
  const normalized = normalizeDiscipline(discipline);
  return normalized ? [normalized] : [discipline];
}

/** Resolve discipline filter: saved preference wins; otherwise role defaults. */
export function resolveMyTasksDisciplines(role, preferenceDiscipline) {
  if (preferenceDiscipline) {
    return disciplinesFromPreference(preferenceDiscipline);
  }
  return defaultDisciplinesForRole(role);
}

/** Map My Tasks selection to preference API value; undefined = skip persist (multi-select). */
export function preferenceFromDisciplines(selectedDisciplines) {
  if (!selectedDisciplines?.length) return "all";
  if (selectedDisciplines.length === 1) return selectedDisciplines[0];
  return undefined;
}

export function itemMatchesDisciplines(item, selectedDisciplines) {
  if (!selectedDisciplines?.length) return true;
  const disc = (
    normalizeDiscipline(item?.discipline) ||
    item?.discipline ||
    item?.mitigation_strategy ||
    ""
  ).toLowerCase();
  return selectedDisciplines.some((d) => {
    const dl = d.toLowerCase();
    return disc.includes(dl) || dl.includes(disc) || disc === dl;
  });
}

export function filterActiveWorkItems(items, selectedDisciplines) {
  return (items || []).filter((item) => {
    if (["completed", "cancelled", "completed_offline"].includes(item?.status)) {
      return false;
    }
    return itemMatchesDisciplines(item, selectedDisciplines);
  });
}

/** API accepts a single discipline; multi-select is applied client-side. */
export function getApiDisciplineParam(selectedDisciplines) {
  return selectedDisciplines?.length === 1 ? selectedDisciplines[0] : undefined;
}
