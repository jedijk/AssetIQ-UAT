import { getActiveTenantId } from "./activeTenant";
import { getEquipmentUnitFilterHeaders } from "./equipmentUnitFilter";

export const DISCIPLINE_FILTER_CHANGED_EVENT = "disciplineFilterChanged";
const STORAGE_PREFIX = "assetiq.disciplineFilter.";

function storageKey(tenantId) {
  const tenant = tenantId || getActiveTenantId() || "default";
  return `${STORAGE_PREFIX}${tenant}`;
}

export function getDisciplineFilterIds(tenantId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function setDisciplineFilterIds(tenantId, ids) {
  if (typeof window === "undefined") return;
  const key = storageKey(tenantId);
  const normalized = Array.isArray(ids) ? [...new Set(ids.filter(Boolean))] : [];
  if (normalized.length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(normalized));
  }
  window.dispatchEvent(new CustomEvent(DISCIPLINE_FILTER_CHANGED_EVENT));
}

export function clearDisciplineFilterIds(tenantId) {
  setDisciplineFilterIds(tenantId, []);
}

export function getDisciplineFilterHeaders(tenantId) {
  const ids = getDisciplineFilterIds(tenantId);
  if (!ids.length) return {};
  return { "X-Discipline-Ids": ids.join(",") };
}

export function getGlobalScopeFilterHeaders(tenantId) {
  return {
    ...getEquipmentUnitFilterHeaders(tenantId),
    ...getDisciplineFilterHeaders(tenantId),
  };
}
