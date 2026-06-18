import { debugLog } from "./debug";

const CHUNK_RELOAD_KEY = "assetiq_chunk_reload_attempted";
const CHUNK_RELOAD_COUNT_KEY = "assetiq_chunk_reload_count";
const STALE_BUILD_KEY = "assetiq_stale_build_reload";
const MAX_CHUNK_RELOAD_ATTEMPTS = 2;

export function isChunkLoadFailure(message) {
  const msg = String(message || "");
  return (
    msg.includes("Loading chunk") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("dynamically imported module") ||
    msg.includes("Failed to fetch dynamically imported module")
  );
}

export function isStaticJsAssetUrl(url) {
  return String(url || "").includes("/static/js/");
}

export async function clearAppCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch (_e) {
    // ignore
  }
}

export async function hardReloadWithCacheBust() {
  await clearAppCaches();
  const url = new URL(window.location.href);
  url.searchParams.delete("_cb");
  url.searchParams.set("_cb", String(Date.now()));
  window.location.replace(url.href);
}

export async function attemptChunkRecovery(source) {
  let attempt = 1;
  try {
    const count = Number.parseInt(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) || "0", 10);
    if (count >= MAX_CHUNK_RELOAD_ATTEMPTS) return false;
    attempt = count + 1;
    sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, String(attempt));
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "true");
  } catch (_e) {
    return false;
  }
  debugLog("chunk_error_autoreload", { source, attempt });
  await hardReloadWithCacheBust();
  return true;
}

export function clearChunkRecoveryFlags() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    sessionStorage.removeItem(CHUNK_RELOAD_COUNT_KEY);
    sessionStorage.removeItem(STALE_BUILD_KEY);
  } catch (_e) {
    // ignore
  }
}

export async function ensureFreshBuild() {
  try {
    if (sessionStorage.getItem(STALE_BUILD_KEY) === "1") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("_cb")) return;
    const res = await fetch(`${window.location.origin}/index.html?_=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return;
    const html = await res.text();
    const serverMatch = html.match(/\/static\/js\/main\.([a-f0-9]+)\.js/);
    if (!serverMatch) return;
    const script = document.querySelector('script[src*="/static/js/main."]');
    const loadedMatch = script?.src?.match(/main\.([a-f0-9]+)\.js/);
    if (loadedMatch && loadedMatch[1] !== serverMatch[1]) {
      sessionStorage.setItem(STALE_BUILD_KEY, "1");
      debugLog("stale_main_bundle_reload", {
        loaded: loadedMatch[1],
        expected: serverMatch[1],
      });
      await hardReloadWithCacheBust();
    }
  } catch (_e) {
    // ignore
  }
}

export function installChunkRecoveryHandlers({ onRecoveryFailed } = {}) {
  window.addEventListener(
    "error",
    (e) => {
      const target = e?.target;
      const src = target?.src || "";
      if (target?.tagName === "SCRIPT" && isStaticJsAssetUrl(src)) {
        debugLog("static_js_load_error", { src });
        attemptChunkRecovery("script_load_error").then((reloading) => {
          if (!reloading) onRecoveryFailed?.();
        });
        return;
      }

      const msg = String(e?.message || "");
      if (isChunkLoadFailure(msg)) {
        debugLog("chunk_load_error", { message: msg });
        attemptChunkRecovery("window_error").then((reloading) => {
          if (!reloading) onRecoveryFailed?.();
        });
      }
    },
    true
  );

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e?.reason;
    const msg = String(reason?.message || reason || "");
    if (isChunkLoadFailure(msg)) {
      debugLog("chunk_load_rejection", { message: msg });
      attemptChunkRecovery("unhandled_rejection").then((reloading) => {
        if (!reloading) onRecoveryFailed?.();
      });
    }
  });
}

export function scheduleChunkRecoveryFlagClear() {
  setTimeout(() => {
    const el = document.getElementById("root");
    const hasContent = !!(el && el.childNodes && el.childNodes.length > 0);
    if (hasContent) {
      clearChunkRecoveryFlags();
    }
  }, 5000);
}
