import { normalizeDiscipline } from "../constants/disciplines";

export const TECHNICAL_DISCIPLINES = [
  "rotating",
  "static",
  "piping",
  "electrical",
  "instrumentation",
  "civil",
  "laboratory",
];

/** Default discipline filter for a user (matches My Tasks auto-seed). */
export function getDefaultDisciplinesForUser(user) {
  const raw = (user?.discipline || user?.department || user?.position || "")
    .toString()
    .trim()
    .toLowerCase();
  const isMaintenance = !!raw && /maintenance|onderhoud|wartung/.test(raw);
  if (isMaintenance) return [...TECHNICAL_DISCIPLINES];
  if (!raw) return [];
  const normalized = normalizeDiscipline(raw);
  return normalized ? [normalized] : [];
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
