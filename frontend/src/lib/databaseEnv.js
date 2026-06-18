export const DATABASE_ENV_STORAGE_KEY = "database_environment";

export function isUatHostname() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host.includes("-uat") || host.includes("uat.");
}

/** User-selected DB env from localStorage, or null if unset. */
export function getStoredDatabaseEnvironment() {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(DATABASE_ENV_STORAGE_KEY);
  return value === "uat" || value === "production" ? value : null;
}

/** Default DB env when nothing is stored (UAT host → UAT, else production). */
export function getInferredDatabaseEnvironment() {
  return isUatHostname() ? "uat" : "production";
}

/** Clear invalid UAT preference for non-owners after auth (not on UAT deployments). */
export function enforceDatabaseEnvironmentForRole(role) {
  if (typeof window === "undefined") return;
  if (isUatHostname()) return;
  const stored = getStoredDatabaseEnvironment();
  if (stored === "uat" && role !== "owner") {
    localStorage.setItem(DATABASE_ENV_STORAGE_KEY, "production");
  }
}

/** Effective DB env for API calls and UI (stored preference, else inferred default). */
export function getDatabaseEnvironment() {
  return getStoredDatabaseEnvironment() || getInferredDatabaseEnvironment();
}
