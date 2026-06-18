import { api } from "../apiClient";
import { getBackendUrl } from "../apiConfig";

const publicBase = () => getBackendUrl();

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
    const response = await fetch(`${publicBase()}/api/display/request-pairing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      `${publicBase()}/api/display/pairing/${encodeURIComponent(pairCode)}/status?${params}`,
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
