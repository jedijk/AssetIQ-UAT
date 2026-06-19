import { isSamsungTVBrowser } from "./deviceUtils";

/** Cached result — TV UA and CSS capabilities do not change at runtime. */
let legacyDisplayBrowser = null;

/**
 * Embedded TV browsers (Samsung Tizen, etc.) often lack container queries,
 * clamp(), and modern grid gap. Use fixed px/rem layout when true.
 */
export function isLegacyDisplayBrowser() {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("vmb-legacy-tv")) {
    return true;
  }
  if (legacyDisplayBrowser !== null) return legacyDisplayBrowser;
  if (typeof window === "undefined") return false;

  if (isSamsungTVBrowser()) {
    legacyDisplayBrowser = true;
    return true;
  }

  try {
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
      if (!CSS.supports("width", "clamp(1px, 2px, 3px)")) {
        legacyDisplayBrowser = true;
        return true;
      }
      if (!CSS.supports("container-type", "inline-size")) {
        legacyDisplayBrowser = true;
        return true;
      }
    }
  } catch (_e) {
    legacyDisplayBrowser = true;
    return true;
  }

  legacyDisplayBrowser = false;
  return false;
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
  return {
    "--vmb-fs": `${base}px`,
    "--vmb-fs-title": `${Math.round(base * 1.15)}px`,
    "--vmb-fs-value": `${Math.round(base * 1.35)}px`,
    "--vmb-fs-small": `${Math.max(9, Math.round(base * 0.9))}px`,
    "--vmb-fs-status": `${Math.round(base * 1.25)}px`,
    "--vmb-chart-fs": `${Math.max(9, Math.round(base * 0.9))}px`,
    "--vmb-pad": "8px",
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
