// Lightweight client-side debugging (opt-in)
// Enable by setting: REACT_APP_DEBUG=true

export const DEBUG_ENABLED = String(process.env.REACT_APP_DEBUG || "").toLowerCase() === "true";

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function debugLog(event, data = {}) {
  if (!DEBUG_ENABLED) return;
  const entry = { t: nowIso(), event, ...data };
  // eslint-disable-next-line no-console
  console.log("[AssetIQ][DBG]", entry);
  try {
    const key = "assetiq_debug_log_v1";
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    prev.push(entry);
    while (prev.length > 200) prev.shift();
    localStorage.setItem(key, JSON.stringify(prev));
  } catch {
    // ignore storage errors
  }
}

export function installGlobalDebugHooks() {
  if (!DEBUG_ENABLED) return;
  if (typeof window === "undefined") return;
  if (window.__assetiqDebugInstalled) return;
  window.__assetiqDebugInstalled = true;

  window.__assetiqDebug = {
    enabled: true,
    dump: () => {
      try {
        const key = "assetiq_debug_log_v1";
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    },
    clear: () => {
      try {
        localStorage.removeItem("assetiq_debug_log_v1");
      } catch {
        // ignore
      }
    },
  };

  debugLog("debug_enabled", {
    href: window.location.href,
    ua: navigator.userAgent,
  });

  window.addEventListener("error", (e) => {
    debugLog("window_error", {
      message: e?.message,
      filename: e?.filename,
      lineno: e?.lineno,
      colno: e?.colno,
      error: e?.error ? String(e.error) : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    debugLog("unhandled_rejection", {
      reason: e?.reason ? safeJson(e.reason) : undefined,
    });
  });

  document.addEventListener("visibilitychange", () => {
    debugLog("visibility_change", { state: document.visibilityState });
  });

  window.addEventListener("pageshow", (e) => {
    debugLog("pageshow", { persisted: !!e?.persisted });
  });

  window.addEventListener("pagehide", (e) => {
    debugLog("pagehide", { persisted: !!e?.persisted });
  });
}

