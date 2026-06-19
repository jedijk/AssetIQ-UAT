import { isLegacyDisplayBrowser, legacyWidgetFontVars } from "../../lib/kioskCompat";

export function boardSurfaceClass(theme) {
  return theme === "light"
    ? "bg-slate-100 text-slate-900"
    : "bg-slate-950 text-white";
}

export function vmbCardRadiusClass() {
  return isLegacyDisplayBrowser() ? "rounded-[10px]" : "rounded-[length:var(--vmb-radius,1rem)]";
}

export function vmbInsetRadiusClass() {
  return isLegacyDisplayBrowser() ? "rounded-[8px]" : "rounded-lg";
}

export function vmbCardShadowClass() {
  return isLegacyDisplayBrowser() ? "vmb-card-elevated" : "shadow-md";
}

export function boardCardClass(theme) {
  const radius = vmbCardRadiusClass();
  const shadow = vmbCardShadowClass();
  if (isLegacyDisplayBrowser()) {
    return theme === "light"
      ? `vmb-card ${radius} ${shadow} overflow-hidden bg-white border border-slate-200 text-slate-900`
      : `vmb-card ${radius} ${shadow} overflow-hidden bg-slate-900 border border-slate-600 text-white`;
  }
  const palette =
    theme === "light"
      ? "bg-white border border-slate-200 text-slate-900"
      : "bg-slate-900/80 border border-slate-700/50 text-white";
  return `${palette} ${radius} ${shadow}`;
}

export function boardMutedText(theme) {
  return theme === "light" ? "text-slate-500" : "text-slate-400";
}

export function boardSubtleText(theme) {
  return theme === "light" ? "text-slate-400" : "text-slate-500";
}

export const FONT_SIZE_OPTIONS = [
  { value: "xs", label: "Extra small" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
];

const FONT_BASE_PX = { xs: 10, sm: 11, md: 12, lg: 14, xl: 16 };

/** Shared layout shell — clips content to the grid cell. */
export function vmbWidgetShell() {
  return isLegacyDisplayBrowser()
    ? "vmb-widget-shell h-full min-h-0 min-w-0 overflow-hidden flex flex-col"
    : "h-full min-h-0 min-w-0 overflow-hidden flex flex-col";
}

export function vmbWidgetPad() {
  return isLegacyDisplayBrowser()
    ? "vmb-widget-pad box-border"
    : "p-[length:var(--vmb-pad,0.5rem)] box-border";
}

export function vmbTitleGapClass() {
  return isLegacyDisplayBrowser() ? "vmb-title-gap shrink-0" : "shrink-0 mb-1";
}

export function vmbStackClass({ tight = false } = {}) {
  const base = "flex-1 min-h-0 overflow-y-auto";
  if (isLegacyDisplayBrowser()) {
    return `${base} ${tight ? "vmb-widget-stack-tight" : "vmb-widget-stack"}`;
  }
  return `${base} ${tight ? "space-y-1" : "space-y-1.5"}`;
}

export function vmbFlexGapClass(size = "sm") {
  if (!isLegacyDisplayBrowser()) {
    return size === "md" ? "gap-2" : "gap-1";
  }
  return size === "md" ? "vmb-flex-gap-md" : "vmb-flex-gap-sm";
}

export function vmbInsetPadClass() {
  return isLegacyDisplayBrowser() ? "" : "p-2";
}

/**
 * Typography + chrome scale with card size (cqmin) and user font_size preference.
 * Legacy TV browsers get fixed px variables (no clamp/cqmin).
 */
export function widgetFontVars(config) {
  if (isLegacyDisplayBrowser()) {
    return legacyWidgetFontVars(config);
  }

  const key = config?.font_size || "md";
  const base = FONT_BASE_PX[key] ?? FONT_BASE_PX.md;
  const scale = base / 12;
  const titleMax = Math.round(base * 1.1);
  const valueMax = Math.round(base * 1.35);
  const smallMax = Math.max(8, Math.round(base * 0.85));
  const statusMax = Math.round(base * 1.25);

  const cq = (n) => `${(n * scale).toFixed(2)}cqmin`;

  return {
    "--vmb-fs": `clamp(0.5rem, ${cq(2.2)}, ${base}px)`,
    "--vmb-fs-title": `clamp(0.6rem, ${cq(3.2)}, ${titleMax}px)`,
    "--vmb-fs-value": `clamp(0.65rem, ${cq(5.8)}, ${valueMax}px)`,
    "--vmb-fs-small": `clamp(0.5rem, ${cq(2)}, ${smallMax}px)`,
    "--vmb-fs-status": `clamp(0.7rem, ${cq(4.5)}, ${statusMax}px)`,
    "--vmb-chart-fs": `clamp(6px, ${cq(1.8)}, ${Math.max(8, Math.round(base * 0.85))}px)`,
    "--vmb-pad": `clamp(0.35rem, ${cq(2.5)}, 0.875rem)`,
    "--vmb-radius": `clamp(0.625rem, ${cq(4)}, 1.25rem)`,
    fontSize: "var(--vmb-fs)",
  };
}

export function widgetChartFontSize(config) {
  const key = config?.font_size || "md";
  const base = FONT_BASE_PX[key] ?? FONT_BASE_PX.md;
  return Math.max(8, Math.round(base * 0.85));
}

const LEGACY_VMB_TEXT = {
  title: "vmb-text-title truncate",
  value: "vmb-text-value truncate",
  body: "vmb-text-body",
  small: "vmb-text-small",
  status: "vmb-text-status",
  label: "vmb-text-label truncate",
};

const MODERN_VMB_TEXT = {
  title: "text-[length:var(--vmb-fs-title)] font-semibold leading-tight truncate",
  value: "text-[length:var(--vmb-fs-value)] font-bold tabular-nums leading-none truncate",
  body: "text-[length:var(--vmb-fs)] leading-snug",
  small: "text-[length:var(--vmb-fs-small)] leading-snug",
  status: "text-[length:var(--vmb-fs-status)] font-bold leading-none",
  label: "text-[length:var(--vmb-fs-small)] uppercase tracking-wide leading-tight truncate",
};

export function vmbText(role) {
  const map = isLegacyDisplayBrowser() ? LEGACY_VMB_TEXT : MODERN_VMB_TEXT;
  return map[role] || map.body;
}
