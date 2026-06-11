export const DATABASE_ENV_STORAGE_KEY = "database_environment";

/** User-selected DB env from localStorage, or null if unset. */
export function getStoredDatabaseEnvironment() {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(DATABASE_ENV_STORAGE_KEY);
  return value === "uat" || value === "production" ? value : null;
}

/** Default DB env when nothing is stored (always production). */
export function getInferredDatabaseEnvironment() {
  return "production";
}

/** Clear invalid UAT preference for non-owners after auth. */
export function enforceDatabaseEnvironmentForRole(role) {
  if (typeof window === "undefined") return;
  const stored = getStoredDatabaseEnvironment();
  if (stored === "uat" && role !== "owner") {
    localStorage.setItem(DATABASE_ENV_STORAGE_KEY, "production");
  }
}

/** Effective DB env for API calls and UI (stored owner preference or production default). */
export function getDatabaseEnvironment() {
  return getStoredDatabaseEnvironment() || getInferredDatabaseEnvironment();
}
