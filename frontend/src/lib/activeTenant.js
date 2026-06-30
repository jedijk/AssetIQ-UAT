export const ACTIVE_TENANT_STORAGE_KEY = "active_tenant_id";
export const ACTIVE_TENANT_NAME_STORAGE_KEY = "active_tenant_name";
export const ACTIVE_TENANT_CHANGED_EVENT = "activeTenantChanged";

/** User-selected active tenant from localStorage, or null if unset (home tenant). */
export function getActiveTenantId() {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
  return value && value.trim() ? value.trim() : null;
}

export function setActiveTenantId(id, name) {
  if (typeof window === "undefined") return;
  if (id && String(id).trim()) {
    localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, String(id).trim());
    if (name && String(name).trim()) {
      localStorage.setItem(ACTIVE_TENANT_NAME_STORAGE_KEY, String(name).trim());
    } else {
      localStorage.removeItem(ACTIVE_TENANT_NAME_STORAGE_KEY);
    }
  } else {
    localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_TENANT_NAME_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(ACTIVE_TENANT_CHANGED_EVENT));
}

export function getActiveTenantName() {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(ACTIVE_TENANT_NAME_STORAGE_KEY);
  return value && value.trim() ? value.trim() : null;
}

export function clearActiveTenantId() {
  setActiveTenantId(null);
}

/** Clear stale tenant override when the signed-in user is not an owner. */
export function enforceActiveTenantForRole(role) {
  if (typeof window === "undefined") return;
  if (role !== "owner" && getActiveTenantId()) {
    clearActiveTenantId();
  }
}

/** Header fragment for auth/API calls when an active tenant is selected. */
export function getActiveTenantHeaders() {
  const tenantId = getActiveTenantId();
  return tenantId ? { "X-Active-Tenant": tenantId } : {};
}
