import { isUatEnvironment } from "./envDetection";

export const DATABASE_ENV_STORAGE_KEY = "database_environment";

/** User-selected DB env from localStorage, or null if unset. */
export function getStoredDatabaseEnvironment() {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(DATABASE_ENV_STORAGE_KEY);
  return value === "uat" || value === "production" ? value : null;
}

/** Host-appropriate default when nothing is stored. */
export function getInferredDatabaseEnvironment() {
  return isUatEnvironment() ? "uat" : "production";
}

/** Effective DB env for API calls and UI (stored preference or host default). */
export function getDatabaseEnvironment() {
  return getStoredDatabaseEnvironment() || getInferredDatabaseEnvironment();
}
