import axios from "axios";
import { getApiUrl, getBackendUrl, AUTH_MODE, getCsrfToken, setCsrfToken } from "./apiConfig";
import { debugLog } from "./debug";
import { getDatabaseEnvironment } from "./databaseEnv";
import { isPublicKioskPath } from "./publicRoutes";

// Get API URL at initialization for static uses
export const API_URL = getApiUrl();

function applyCookieAuthHeaders(config) {
  const m = (config.method || "get").toLowerCase();
  const unsafe = !["get", "head", "options"].includes(m);
  if (unsafe) {
    const csrf = getCsrfToken();
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  const dbEnv = getDatabaseEnvironment();
  if (dbEnv) config.headers["X-Database-Environment"] = dbEnv;
  return config;
}

function buildSessionCheckHeaders() {
  const headers = {};
  if (AUTH_MODE !== "cookie") {
    const token = localStorage.getItem("token");
    if (token) headers.Authorization = `Bearer ${token}`;
    const dbEnv = getDatabaseEnvironment();
    if (dbEnv) headers["X-Database-Environment"] = dbEnv;
  } else {
    const dbEnv = getDatabaseEnvironment();
    if (dbEnv) headers["X-Database-Environment"] = dbEnv;
  }
  return headers;
}

function isPreLoginAuthUrl(url) {
  const u = url || "";
  return (
    u.includes("/auth/login") ||
    u.includes("/auth/2fa/verify") ||
    u.includes("/auth/2fa/resend") ||
    u.includes("/auth/register") ||
    u.includes("/auth/forgot-password") ||
    u.includes("/auth/reset-password") ||
    u.includes("/auth/verify-reset-token")
  );
}

// Separate client so session checks do not recurse through 401 interceptors.
const sessionCheckClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: AUTH_MODE === "cookie",
});

let sessionVerifyInFlight = null;
let lastAuthExpiredDispatchAt = 0;
let sessionExpiryConfirmed = false;
const AUTH_EXPIRED_DEBOUNCE_MS = 3000;

/** Reset after a fresh login so 401 handling works again. */
export function resetSessionExpiryState() {
  sessionExpiryConfirmed = false;
  lastAuthExpiredDispatchAt = 0;
  sessionVerifyInFlight = null;
}

function dispatchAuthExpiredEvent() {
  const now = Date.now();
  if (now - lastAuthExpiredDispatchAt < AUTH_EXPIRED_DEBOUNCE_MS) {
    try {
      debugLog("auth_expired_dispatch_debounced", { msSinceLast: now - lastAuthExpiredDispatchAt });
    } catch (_e) {}
    return;
  }
  lastAuthExpiredDispatchAt = now;
  sessionExpiryConfirmed = true;
  try {
    window.dispatchEvent(new CustomEvent("assetiq:auth-expired"));
  } catch (_e) {}
}

async function isSessionActuallyExpired() {
  if (sessionVerifyInFlight) return sessionVerifyInFlight;

  sessionVerifyInFlight = (async () => {
    try {
      await sessionCheckClient.get("/auth/me", {
        headers: buildSessionCheckHeaders(),
      });
      return false;
    } catch (e) {
      return e?.response?.status === 401;
    } finally {
      sessionVerifyInFlight = null;
    }
  })();

  return sessionVerifyInFlight;
}

function handleUnauthorizedResponse(error) {
  if (sessionExpiryConfirmed) return;

  const url = `${error.config?.baseURL || ""}${error.config?.url || ""}`;
  if (isPreLoginAuthUrl(url)) return;
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path.includes("/login") || isPublicKioskPath(path)) return;
  }

  try {
    debugLog("api_401", { url });
  } catch (_e) {}

  isSessionActuallyExpired().then((expired) => {
    if (sessionExpiryConfirmed) return;
    if (!expired) {
      try {
        debugLog("api_401_ignored", { url, reason: "session_still_valid" });
      } catch (_e) {}
      return;
    }
    if (AUTH_MODE !== "cookie") {
      localStorage.removeItem("token");
    }
    dispatchAuthExpiredEvent();
  });
}

function captureCsrfFromResponse(response) {
  const csrf =
    response?.headers?.["x-csrf-token"] ||
    response?.headers?.["X-CSRF-Token"];
  if (csrf) setCsrfToken(csrf);
}

// Global axios defaults for cookie-auth (AuthContext and legacy raw axios calls).
if (AUTH_MODE === "cookie") {
  axios.defaults.withCredentials = true;
  axios.interceptors.request.use((config) => {
    config.headers = config.headers || {};
    return applyCookieAuthHeaders(config);
  });
  axios.interceptors.response.use(
    (response) => {
      captureCsrfFromResponse(response);
      return response;
    },
    (error) => Promise.reject(error)
  );
}

// Log API configuration at startup (development only)
if (process.env.NODE_ENV === "development") {
  // eslint-disable-next-line no-console
  console.log("[API] Backend URL:", getBackendUrl());
  // eslint-disable-next-line no-console
  console.log("[API] Full API URL:", API_URL);
  // eslint-disable-next-line no-console
  console.log("[API] Auth mode:", AUTH_MODE);
}

// Primary API client
export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  withCredentials: AUTH_MODE === "cookie",
});

api.interceptors.request.use((config) => {
  // Validate the URL includes /api
  if (!config.baseURL?.includes("/api")) {
    // eslint-disable-next-line no-console
    console.error("[API] WARNING: API URL does not include /api prefix:", config.baseURL);
  }

  config.headers = config.headers || {};
  if (AUTH_MODE !== "cookie") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const dbEnv = getDatabaseEnvironment();
    if (dbEnv) {
      config.headers["X-Database-Environment"] = dbEnv;
    }
  } else {
    applyCookieAuthHeaders(config);
  }

  try {
    debugLog("api_request", {
      method: config.method,
      url: `${config.baseURL || ""}${config.url || ""}`,
    });
  } catch (_e) {}
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (AUTH_MODE === "cookie") {
      captureCsrfFromResponse(response);
    }
    try {
      debugLog("api_response", {
        status: response.status,
        url: `${response.config?.baseURL || ""}${response.config?.url || ""}`,
      });
    } catch (_e) {}
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      handleUnauthorizedResponse(error);
    }

    if (error.code === "ECONNABORTED") {
      error.message = "Request timeout - please try again";
    } else if (!error.response && error.message === "Network Error") {
      error.code = "ERR_NETWORK";
      error.message = "Network error - please check your connection";
    }
    try {
      debugLog("api_error", {
        code: error.code,
        status: error.response?.status,
        message: error.message,
        url: `${error.config?.baseURL || ""}${error.config?.url || ""}`,
      });
    } catch (_e) {}
    return Promise.reject(error);
  }
);

// Extended-timeout client for AI operations (2 minutes)
export const aiApi = axios.create({
  baseURL: API_URL,
  timeout: 120000,
  withCredentials: AUTH_MODE === "cookie",
});

aiApi.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  if (AUTH_MODE !== "cookie") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const dbEnv = getDatabaseEnvironment();
    if (dbEnv) {
      config.headers["X-Database-Environment"] = dbEnv;
    }
  } else {
    applyCookieAuthHeaders(config);
  }
  return config;
});

aiApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      handleUnauthorizedResponse(error);
    }

    if (error.code === "ECONNABORTED") {
      error.message = "AI analysis taking longer than expected. Please try again.";
      error.isTimeout = true;
    } else if (!error.response && error.message === "Network Error") {
      error.code = "ERR_NETWORK";
      error.message = "Network error - please check your connection";
    }
    return Promise.reject(error);
  }
);

