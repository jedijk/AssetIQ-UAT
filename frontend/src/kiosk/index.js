import "../lib/polyfills";
import "../lib/apiClient";
import "../styles/kiosk-compat.css";

import React from "react";
import ReactDOM from "react-dom/client";
import KioskApp from "./KioskApp";
import KioskErrorBoundary from "../components/KioskErrorBoundary";
import { applyKioskCompatClasses } from "../lib/kioskCompat";

if (typeof document !== "undefined") {
  try {
    document.documentElement.classList.add("display-kiosk");
    applyKioskCompatClasses();
  } catch (_e) {}
}

if ("serviceWorker" in navigator) {
  try {
    navigator.serviceWorker.getRegistrations().then(async (regs) => {
      const cacheRegs = (regs || []).filter((r) => {
        const script = r.active?.scriptURL || r.installing?.scriptURL || "";
        return !script.includes("push-sw.js");
      });
      await Promise.all(cacheRegs.map((r) => r.unregister()));
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    });
  } catch (_e) {}
}

function showKioskBootError(message) {
  try {
    const el = document.getElementById("root");
    if (!el) return;
    el.textContent = "";
    const outer = document.createElement("div");
    outer.style.cssText =
      "min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif";
    const inner = document.createElement("div");
    inner.style.cssText = "max-width:420px;width:100%;text-align:center";
    const title = document.createElement("h1");
    title.textContent = "Display could not load";
    title.style.cssText = "margin:0 0 8px;font-size:20px;font-weight:700";
    const msg = document.createElement("p");
    msg.textContent = message || "Please reload this page.";
    msg.style.cssText = "margin:0 0 16px;font-size:14px;line-height:1.5;color:#94a3b8";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Reload";
    btn.style.cssText =
      "padding:12px 20px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:600;cursor:pointer";
    btn.onclick = function () {
      window.location.reload();
    };
    inner.appendChild(title);
    inner.appendChild(msg);
    inner.appendChild(btn);
    outer.appendChild(inner);
    el.appendChild(outer);
  } catch (_e) {}
}

window.addEventListener("error", (e) => {
  const msg = String(e?.message || "");
  if (msg.includes("Loading chunk") || msg.includes("ChunkLoadError")) {
    showKioskBootError("This TV browser cached an older version. Tap Reload.");
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <KioskErrorBoundary>
    <KioskApp />
  </KioskErrorBoundary>,
);

setTimeout(() => {
  const el = document.getElementById("root");
  const hasContent = !!(el && el.childNodes && el.childNodes.length > 0);
  if (!hasContent) {
    showKioskBootError("The display started but did not render. Tap Reload.");
  }
}, 5000);
