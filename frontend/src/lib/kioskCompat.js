import { isSamsungTVBrowser } from "./deviceUtils";

/** Cached hardware/CSS capability — does not change when preview adds vmb-legacy-tv. */
let legacyHardwareBrowser = null;

function detectLegacyHardwareBrowser() {
  if (legacyHardwareBrowser !== null) return legacyHardwareBrowser;
  if (typeof window === "undefined") return false;

  if (isSamsungTVBrowser()) {
    legacyHardwareBrowser = true;
    return true;
  }

  try {
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
      if (!CSS.supports("width", "clamp(1px, 2px, 3px)")) {
        legacyHardwareBrowser = true;
        return true;
      }
      if (!CSS.supports("container-type", "inline-size")) {
        legacyHardwareBrowser = true;
        return true;
      }
    }
  } catch (_e) {
    legacyHardwareBrowser = true;
    return true;
  }

  legacyHardwareBrowser = false;
  return false;
}

/**
 * Embedded TV browsers (Samsung Tizen, etc.) often lack container queries,
 * clamp(), and modern grid gap. Use fixed px/rem layout when true.
 * Preview/TV parity adds vmb-legacy-tv on desktop too — that is layout-only.
 */
export function isLegacyDisplayBrowser() {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("vmb-legacy-tv")) {
    return true;
  }
  return detectLegacyHardwareBrowser();
}

/** Table chart fallback on TV kiosks and browsers missing ES2019 Array methods. */
export function useLegacyChartFallback() {
  if (typeof window !== "undefined" && window.__ASSETIQ_REACT_KIOSK__) return true;
  if (isSamsungTVBrowser()) return true;
  if (typeof Array.prototype.flatMap !== "function") return true;
  return isLegacyDisplayBrowser();
}

export function applyKioskCompatClasses() {
  if (typeof document === "undefined") return;
  if (isLegacyDisplayBrowser()) {
    document.documentElement.classList.add("vmb-legacy-tv");
  }
}

const FONT_BASE_PX = { xs: 10, sm: 11, md: 12, lg: 14, xl: 16 };

/** Fixed px font variables — safe on Tizen / older Chromium. */
export function legacyWidgetFontVars(config) {
  const key = config?.font_size || "md";
  const base = FONT_BASE_PX[key] ?? FONT_BASE_PX.md;
  const pad = Math.max(10, Math.round(base * 0.95));
  const gap = Math.max(4, Math.round(base * 0.4));
  const stackGap = Math.max(6, Math.round(base * 0.55));
  const insetPad = Math.max(8, Math.round(base * 0.65));
  return {
    "--vmb-fs": `${base}px`,
    "--vmb-fs-title": `${Math.round(base * 1.15)}px`,
    "--vmb-fs-value": `${Math.round(base * 1.35)}px`,
    "--vmb-fs-small": `${Math.max(9, Math.round(base * 0.9))}px`,
    "--vmb-fs-status": `${Math.round(base * 1.25)}px`,
    "--vmb-chart-fs": `${Math.max(9, Math.round(base * 0.9))}px`,
    "--vmb-pad": `${pad}px`,
    "--vmb-gap": `${gap}px`,
    "--vmb-stack-gap": `${stackGap}px`,
    "--vmb-inset-pad": `${insetPad}px`,
    "--vmb-radius": "10px",
    fontSize: `${base}px`,
  };
}

/** Inline styles for vmb text roles when Tailwind arbitrary properties are unreliable. */
export function legacyVmbTextStyle(role) {
  const map = {
    title: { fontSize: "var(--vmb-fs-title)", fontWeight: 600, lineHeight: 1.25 },
    value: { fontSize: "var(--vmb-fs-value)", fontWeight: 700, lineHeight: 1 },
    body: { fontSize: "var(--vmb-fs)", lineHeight: 1.35 },
    small: { fontSize: "var(--vmb-fs-small)", lineHeight: 1.35 },
    status: { fontSize: "var(--vmb-fs-status)", fontWeight: 700, lineHeight: 1 },
    label: {
      fontSize: "var(--vmb-fs-small)",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      lineHeight: 1.25,
    },
  };
  return map[role] || map.body;
}
