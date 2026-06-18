import { api } from "../apiClient";
import { getBackendUrl } from "../apiConfig";

const publicBase = () => getBackendUrl();

/** UAT kiosk pages should write/read pairing codes in the UAT database. */
export function getDisplayDbEnv() {
  if (typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("db_env");
    if (fromUrl === "uat" || fromUrl === "production") return fromUrl;
  } catch (_e) {}
  const host = window.location.hostname.toLowerCase();
  if (host.includes("-uat") || host.includes("uat.")) return "uat";
  return null;
}

function publicDisplayQuery(extraParams) {
  const params = extraParams instanceof URLSearchParams ? extraParams : new URLSearchParams();
  const dbEnv = getDisplayDbEnv();
  if (dbEnv && dbEnv !== "production") {
    params.set("db_env", dbEnv);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const DISPLAY_DEVICE_TOKEN_KEY = "assetiq_display_device_token";
export const DISPLAY_DEVICE_ID_KEY = "assetiq_display_device_id";
export const DISPLAY_FINGERPRINT_KEY = "assetiq_display_fingerprint";

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
    const response = await api.get(`/display/pairing/${encodeURIComponent(pairCode)}`);
    return response.data;
  },

  completePairing: async (payload) => {
    const response = await api.post("/display/pairing/complete", payload);
    return response.data;
  },

  listDevices: async () => {
    const response = await api.get("/display/devices");
    return response.data;
  },
};
