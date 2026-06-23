export const DATABASE_ENV_STORAGE_KEY = "database_environment";
export const DATABASE_ENV_EXPLICIT_KEY = "database_environment_explicit";

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

/** True when the owner explicitly switched DB env via the header switcher or Settings. */
export function isExplicitDatabaseEnvironmentChoice() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DATABASE_ENV_EXPLICIT_KEY) === "true";
  } catch {
    return false;
  }
}

/** Mark DB env as an intentional owner choice (not a stale value from another deployment). */
export function markDatabaseEnvironmentExplicit() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DATABASE_ENV_EXPLICIT_KEY, "true");
  } catch {}
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
  const stored = getStoredDatabaseEnvironment();
  if (isUatHostname()) {
    // Ignore production left in localStorage from the prod site unless the owner
    // explicitly switched on this UAT deployment (prevents post-login 401s).
    if (stored === "production" && !isExplicitDatabaseEnvironmentChoice()) {
      return "uat";
    }
    return stored || "uat";
  }
  return stored || getInferredDatabaseEnvironment();
}
