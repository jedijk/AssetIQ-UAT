import { getActiveTenantId } from "./activeTenant";

export const EQUIPMENT_UNIT_FILTER_CHANGED_EVENT = "equipmentUnitFilterChanged";
const STORAGE_PREFIX = "assetiq.equipmentUnitFilter.";

function storageKey(tenantId) {
  const tenant = tenantId || getActiveTenantId() || "default";
  return `${STORAGE_PREFIX}${tenant}`;
}

export function getEquipmentUnitFilterIds(tenantId) {
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

export function setEquipmentUnitFilterIds(tenantId, ids) {
  if (typeof window === "undefined") return;
  const key = storageKey(tenantId);
  const normalized = Array.isArray(ids) ? [...new Set(ids.filter(Boolean))] : [];
  if (normalized.length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(normalized));
  }
  window.dispatchEvent(new CustomEvent(EQUIPMENT_UNIT_FILTER_CHANGED_EVENT));
}

export function clearEquipmentUnitFilterIds(tenantId) {
  setEquipmentUnitFilterIds(tenantId, []);
}

export function getEquipmentUnitFilterHeaders(tenantId) {
  const ids = getEquipmentUnitFilterIds(tenantId);
  if (!ids.length) return {};
  return { "X-Equipment-Unit-Ids": ids.join(",") };
}

/** Descendant equipment node ids for selected equipment_unit nodes. */
export function expandEquipmentUnitDescendants(allNodes, unitIds) {
  if (!unitIds?.length || !allNodes?.length) return null;

  const childrenByParent = {};
  for (const node of allNodes) {
    if (!node?.parent_id) continue;
    (childrenByParent[node.parent_id] = childrenByParent[node.parent_id] || []).push(node.id);
  }

  const included = new Set();
  const stack = [...unitIds];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || included.has(cur)) continue;
    included.add(cur);
    for (const child of childrenByParent[cur] || []) {
      if (!included.has(child)) stack.push(child);
    }
  }
  return included;
}
