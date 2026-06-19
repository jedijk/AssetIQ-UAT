const PRIVATE_IP =
  /^(?:10\.(?:\d{1,3}\.){2}\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.\d{1,3}|192\.168\.(?:\d{1,3})\.\d{1,3})$/;

function subnetFromIp(ip) {
  if (!ip || !PRIVATE_IP.test(ip)) return null;
  const parts = ip.split(".");
  return parts.length === 4 ? parts.slice(0, 3).join(".") : null;
}

/**
 * Best-effort private /24 subnet via WebRTC (same WiFi hint for pairing discovery).
 * Returns e.g. "192.168.1" or null when unavailable.
 */
export function detectLocalSubnet() {
  if (typeof window === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        pc.close();
      } catch (_e) {}
      resolve(value);
    };

    const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!RTCPeer) {
      finish(null);
      return;
    }

    const pc = new RTCPeer({ iceServers: [] });
    pc.createDataChannel("assetiq-pairing");

    pc.onicecandidate = (event) => {
      const candidate = event?.candidate?.candidate || "";
      const match = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        const subnet = subnetFromIp(match[1]);
        if (subnet) finish(subnet);
      }
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish(null));

    setTimeout(() => finish(null), 2500);
  });
}

export function rememberDismissedPairing(pairingId) {
  if (!pairingId || typeof sessionStorage === "undefined") return;
  try {
    const key = "assetiq_dismissed_pairings";
    const existing = JSON.parse(sessionStorage.getItem(key) || "[]");
    if (!existing.includes(pairingId)) {
      existing.push(pairingId);
      sessionStorage.setItem(key, JSON.stringify(existing.slice(-20)));
    }
  } catch (_e) {}
}

export function isPairingDismissed(pairingId) {
  if (!pairingId || typeof sessionStorage === "undefined") return false;
  try {
    const existing = JSON.parse(sessionStorage.getItem("assetiq_dismissed_pairings") || "[]");
    return existing.includes(pairingId);
  } catch (_e) {
    return false;
  }
}
