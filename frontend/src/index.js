import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { installGlobalDebugHooks, debugLog } from "./lib/debug";
import { installPerfObservers, PERF_ENABLED } from "./lib/perf";

// Patch ResizeObserver to prevent "loop completed with undelivered notifications" errors
// This is a known issue with cmdk, Radix UI, and other libraries that use ResizeObserver
if (typeof window !== 'undefined') {
  const OriginalResizeObserver = window.ResizeObserver;
  
  window.ResizeObserver = class PatchedResizeObserver extends OriginalResizeObserver {
    constructor(callback) {
      const patchedCallback = (entries, observer) => {
        // Wrap callback in requestAnimationFrame to prevent loop errors
        window.requestAnimationFrame(() => {
          if (typeof callback === 'function') {
            callback(entries, observer);
          }
        });
      };
      super(patchedCallback);
    }
  };
  
  // Suppress console.error for ResizeObserver messages
  const originalError = console.error;
  console.error = (...args) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
      return; // Suppress ResizeObserver loop errors
    }
    originalError.apply(console, args);
  };
  
  // Suppress window.onerror for ResizeObserver
  const originalOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (message && message.toString().includes('ResizeObserver loop')) {
      return true; // Prevent default handling
    }
    if (originalOnError) {
      return originalOnError(message, source, lineno, colno, error);
    }
    return false;
  };
  
  // Suppress unhandled error events for ResizeObserver
  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('ResizeObserver loop')) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return false;
    }
  }, true);
}

// Install global debug hooks (opt-in via REACT_APP_DEBUG=true)
installGlobalDebugHooks();
// Install perf observers (opt-in via REACT_APP_DEBUG_PERF=true)
try {
  if (PERF_ENABLED) installPerfObservers();
} catch (_e) {}

function isIOSWebAppStandalone() {
  try {
    const ua = typeof navigator !== "undefined" ? (navigator.userAgent || "") : "";
    const isIOSLike = /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document); // iPadOS desktop mode
    if (!isIOSLike) return false;
    const navStandalone = typeof navigator !== "undefined" && navigator.standalone === true; // iOS Safari A2HS
    const mqlStandalone =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches;
    return !!(navStandalone || mqlStandalone);
  } catch (_e) {
    return false;
  }
}

function showBootError(message) {
  try {
    const el = document.getElementById("root");
    if (!el) return;
    el.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#ffffff;color:#0f172a;padding:24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:520px;width:100%;">
          <div style="font-weight:800;font-size:18px;margin-bottom:8px;">App failed to load</div>
          <div style="font-size:13px;line-height:1.4;color:#475569;margin-bottom:14px;">${message || "Please refresh the page."}</div>
          <button id="assetiq-hard-reload" style="padding:10px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#0f172a;color:#fff;font-weight:700;cursor:pointer;">Reload</button>
          <div style="margin-top:10px;font-size:12px;color:#94a3b8;">If this keeps happening on iOS, it is usually a cached update. Reload will clear local caches.</div>
        </div>
      </div>
    `;
    const btn = document.getElementById("assetiq-hard-reload");
    if (btn) {
      btn.onclick = async () => {
        try {
          if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
          if ("caches" in window) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
          }
        } catch (_e) {}
        window.location.reload();
      };
    }
  } catch (_e) {
    // ignore
  }
}

const IOS_WEBAPP_STANDALONE = isIOSWebAppStandalone();
try {
  if (IOS_WEBAPP_STANDALONE) {
    debugLog("ios_webapp_standalone", { standalone: true });
  }
} catch (_e) {}

// Register Service Worker for PWA (OFF by default: avoids mobile white-screen
// issues due to stale caches / SW update races). Enable explicitly by setting:
// REACT_APP_ENABLE_SERVICE_WORKER=true at build time.
const ENABLE_SERVICE_WORKER = process.env.REACT_APP_ENABLE_SERVICE_WORKER === "true";

// If SW is disabled, actively unregister any previously installed SW and clear caches.
// This prevents iOS Safari getting stuck on white screens after chunking changes.
if ("serviceWorker" in navigator && !ENABLE_SERVICE_WORKER) {
  try {
    navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (regs?.length) {
        debugLog("sw_unreg_start", { count: regs.length });
      }
      await Promise.all((regs || []).map((r) => r.unregister()));
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if (regs?.length) debugLog("sw_unreg_done", {});
    });
  } catch (_e) {}
}

if ('serviceWorker' in navigator && ENABLE_SERVICE_WORKER) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('ServiceWorker registered: ', registration.scope);
        debugLog("sw_registered", { scope: registration.scope });
        
        // Force update check on every page load
        registration.update();
        
        // Listen for new service worker installing
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available.
              // Do NOT interrupt the user with confirm/reload while typing.
              // The app-level version checker will show a banner when applicable.
              console.log('New version available (service worker).');
              debugLog("sw_update_available", {});
            }
          });
        });
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed: ', error);
        debugLog("sw_register_failed", { error: String(error) });
      });
  });
  
  // Also check for updates when the page becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
        debugLog("sw_update_check_visibility", {});
      });
    }
  });
}

// Catch chunk-load failures (common after deploy on iOS) and show a recovery UI.
window.addEventListener("error", (e) => {
  const msg = String(e?.message || "");
  if (msg.includes("Loading chunk") || msg.includes("ChunkLoadError")) {
    debugLog("chunk_load_error", { message: msg });
    showBootError("A new version was deployed while your browser cached an older one. Tap Reload.");
  }

  // iOS Safari sometimes reports minified runtime TypeErrors that otherwise surface as a blank screen.
  // Show the recovery UI so users can reload and clear caches, and log a fingerprint for debugging.
  if (msg.includes("undefined is not an object") && msg.includes("t[e]")) {
    try {
      debugLog("runtime_typeerror_te", {
        message: msg,
        href: typeof window !== "undefined" ? window.location.href : "",
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
        stack: String(e?.error?.stack || ""),
      });
    } catch (_e2) {}
    showBootError("The app hit a runtime error. Tap Reload to recover.");
  }
});

// Some chunk-load failures arrive as unhandled promise rejections.
window.addEventListener("unhandledrejection", (e) => {
  const reason = e?.reason;
  const msg = String(reason?.message || reason || "");
  if (msg.includes("Loading chunk") || msg.includes("ChunkLoadError")) {
    debugLog("chunk_load_rejection", { message: msg });
    showBootError("A new version was deployed while your browser cached an older one. Tap Reload.");
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));

// iOS standalone webapps are more sensitive to timing/memory edge cases; avoid
// StrictMode double-invocation to reduce “random white screen” reports.
const appTree = IOS_WEBAPP_STANDALONE ? <App /> : (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
root.render(appTree);

// Boot watchdog: if the app fails to mount, show the recovery UI instead of a blank screen.
try {
  if (typeof window !== "undefined") {
    setTimeout(() => {
      const el = document.getElementById("root");
      const hasContent = !!(el && el.childNodes && el.childNodes.length > 0);
      if (!hasContent) {
        debugLog("boot_blank_screen", { ios_webapp: IOS_WEBAPP_STANDALONE });
        showBootError("The app started but did not render. Tap Reload to recover.");
      }
    }, IOS_WEBAPP_STANDALONE ? 4500 : 6500);
  }
} catch (_e) {}
