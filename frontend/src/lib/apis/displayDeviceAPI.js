import { api } from "../apiClient";
import { getBackendUrl } from "../apiConfig";
import { getDatabaseEnvironment } from "../databaseEnv";

const publicBase = () => getBackendUrl();

function adminDbParams() {
  const dbEnv = getDatabaseEnvironment();
  return dbEnv ? { db_env: dbEnv } : undefined;
}

function publicDisplayQuery(extraParams) {
  const params = extraParams instanceof URLSearchParams ? extraParams : new URLSearchParams();
  const dbEnv = getDisplayDbEnv();
  if (dbEnv) {
    params.set("db_env", dbEnv);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const DISPLAY_DEVICE_TOKEN_KEY = "assetiq_display_device_token";
export const DISPLAY_DEVICE_ID_KEY = "assetiq_display_device_id";
export const DISPLAY_FINGERPRINT_KEY = "assetiq_display_fingerprint";
export const DISPLAY_DB_ENV_KEY = "assetiq_display_db_env";

/** Display kiosk DB env: URL override, paired-device storage, else hostname default. */
export function getDisplayDbEnv() {
  if (typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("db_env");
    if (fromUrl === "uat" || fromUrl === "production") return fromUrl;
  } catch (_e) {}
  try {
    const stored = localStorage.getItem(DISPLAY_DB_ENV_KEY);
    if (stored === "uat" || stored === "production") return stored;
  } catch (_e) {}
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("-uat") || host.includes("uat.")) return "uat";
  }
  return "production";
}

export function setDisplayDbEnv(dbEnv) {
  if (dbEnv !== "uat" && dbEnv !== "production") return;
  try {
    localStorage.setItem(DISPLAY_DB_ENV_KEY, dbEnv);
  } catch (_e) {}
}

export function getOrCreateDeviceFingerprint() {
  try {
    let fp = localStorage.getItem(DISPLAY_FINGERPRINT_KEY);
    if (fp) return fp;
    fp = `fp_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    localStorage.setItem(DISPLAY_FINGERPRINT_KEY, fp);
    return fp;
  } catch {
    return `fp_${Date.now()}`;
  }
}

export function getStoredDeviceToken() {
  try {
    return localStorage.getItem(DISPLAY_DEVICE_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function getStoredDeviceId() {
  try {
    return localStorage.getItem(DISPLAY_DEVICE_ID_KEY) || "";
  } catch {
    return "";
  }
}

function deviceAuthHeaders(deviceToken) {
  const token = deviceToken || getStoredDeviceToken();
  if (!token) return {};
  return { Authorization: `DeviceToken ${token}` };
}

async function deviceFetch(path, { method = "GET", body, deviceToken, queryParams } = {}) {
  const params = queryParams instanceof URLSearchParams ? queryParams : new URLSearchParams(queryParams || {});
  const response = await fetch(`${publicBase()}/api/display${path}${publicDisplayQuery(params)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...deviceAuthHeaders(deviceToken),
    },
    credentials: "omit",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Display API failed (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const displayDeviceAPI = {
  requestPairing: async (payload) => {
    const response = await fetch(`${publicBase()}/api/display/request-pairing${publicDisplayQuery()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to request pairing");
    }
    return response.json();
  },

  pollPairingStatus: async (pairCode, deviceFingerprint) => {
    const params = new URLSearchParams({ device_fingerprint: deviceFingerprint });
    const response = await fetch(
      `${publicBase()}/api/display/pairing/${encodeURIComponent(pairCode)}/status${publicDisplayQuery(params)}`,
      { credentials: "omit" },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to check pairing status");
    }
    return response.json();
  },

  previewPairing: async (pairCode) => {
    const response = await api.get(`/display/pairing/${encodeURIComponent(pairCode)}`, {
      params: adminDbParams(),
    });
    return response.data;
  },

  listNearbyPairings: async (localSubnet) => {
    const params = { ...adminDbParams() };
    if (localSubnet) params.local_subnet = localSubnet;
    const response = await api.get("/display/pairing/nearby", { params });
    return response.data;
  },

  completePairing: async (payload) => {
    const response = await api.post("/display/pairing/complete", payload, {
      params: adminDbParams(),
    });
    return response.data;
  },

  listDevices: async () => {
    const response = await api.get("/display/devices", { params: adminDbParams() });
    return response.data;
  },

  getDevice: async (deviceId) => {
    const response = await api.get(`/display/devices/${encodeURIComponent(deviceId)}`, { params: adminDbParams() });
    return response.data;
  },

  updateDevice: async (deviceId, payload) => {
    const response = await api.patch(`/display/devices/${encodeURIComponent(deviceId)}`, payload, {
      params: adminDbParams(),
    });
    return response.data;
  },

  reassignBoard: async (deviceId, payload) => {
    const response = await api.post(`/display/devices/${encodeURIComponent(deviceId)}/reassign-board`, payload, {
      params: adminDbParams(),
    });
    return response.data;
  },

  disableDevice: async (deviceId) => {
    const response = await api.post(`/display/devices/${encodeURIComponent(deviceId)}/disable`, null, {
      params: adminDbParams(),
    });
    return response.data;
  },

  enableDevice: async (deviceId) => {
    const response = await api.post(`/display/devices/${encodeURIComponent(deviceId)}/enable`, null, {
      params: adminDbParams(),
    });
    return response.data;
  },

  rotateDeviceToken: async (deviceId) => {
    const response = await api.post(`/display/devices/${encodeURIComponent(deviceId)}/rotate-token`, null, {
      params: adminDbParams(),
    });
    return response.data;
  },

  deleteDevice: async (deviceId) => {
    await api.delete(`/display/devices/${encodeURIComponent(deviceId)}`, { params: adminDbParams() });
  },

  listDeviceEvents: async (deviceId, limit = 50) => {
    const response = await api.get(`/display/devices/${encodeURIComponent(deviceId)}/events`, {
      params: { ...adminDbParams(), limit },
    });
    return response.data;
  },

  acceptTokenRotation: async (deviceToken) =>
    deviceFetch("/accept-token-rotation", { method: "POST", deviceToken }),

  listBoardsForPairing: async () => {
    const response = await api.get("/display/pairing-boards", { params: adminDbParams() });
    return response.data;
  },

  connect: async (deviceToken) => {
    return deviceFetch("/connect", {
      method: "POST",
      deviceToken,
      body: { device_token: deviceToken || getStoredDeviceToken() },
    });
  },

  getConfig: async (deviceToken) => deviceFetch("/config", { deviceToken }),

  getBoardLayout: async (deviceToken) => deviceFetch("/board/layout", { deviceToken }),

  getBoardData: async (deviceToken, periodDays = 30) => {
    const params = new URLSearchParams();
    if (periodDays != null) params.set("period_days", String(periodDays));
    return deviceFetch("/board/data", { deviceToken, queryParams: params });
  },

  sendHeartbeat: async (deviceId, deviceToken) => {
    return deviceFetch("/heartbeat", {
      method: "POST",
      deviceToken,
      body: { device_id: deviceId || getStoredDeviceId() },
    });
  },
};
