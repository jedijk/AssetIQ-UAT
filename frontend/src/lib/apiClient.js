import axios from "axios";
import { getApiUrl, getBackendUrl } from "./apiConfig";
import { debugLog } from "./debug";

// Get API URL at initialization for static uses
export const API_URL = getApiUrl();

// Log API configuration at startup (development only)
if (process.env.NODE_ENV === "development") {
  // eslint-disable-next-line no-console
  console.log("[API] Backend URL:", getBackendUrl());
  // eslint-disable-next-line no-console
  console.log("[API] Full API URL:", API_URL);
}

// Primary API client
export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  // Validate the URL includes /api
  if (!config.baseURL?.includes("/api")) {
    // eslint-disable-next-line no-console
    console.error("[API] WARNING: API URL does not include /api prefix:", config.baseURL);
  }

  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const dbEnv = localStorage.getItem("database_environment");
  if (dbEnv) {
    config.headers["X-Database-Environment"] = dbEnv;
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
      try {
        debugLog("api_401", {
          url: `${error.config?.baseURL || ""}${error.config?.url || ""}`,
        });
      } catch (_e) {}
      localStorage.removeItem("token");
      try {
        window.dispatchEvent(new CustomEvent("assetiq:auth-expired"));
      } catch (_e) {}
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
});

aiApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

aiApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      try {
        window.dispatchEvent(new CustomEvent("assetiq:auth-expired"));
      } catch (_e) {}
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

