export function boardSurfaceClass(theme) {
  return theme === "light"
    ? "bg-slate-100 text-slate-900"
    : "bg-slate-950 text-white";
}

export function boardCardClass(theme) {
  return theme === "light"
    ? "bg-white border border-slate-200 text-slate-900"
    : "bg-slate-900/80 border border-slate-700/50 text-white";
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

/** Shared layout shell — clip content to grid cell bounds. */
export const vmbWidgetShell =
  "h-full min-h-0 min-w-0 overflow-hidden @container flex flex-col";

export const vmbWidgetPad = "p-2 sm:p-3";

/** CSS variables for scalable widget typography (inherits to children). */
export function widgetFontVars(config) {
  const key = config?.font_size || "md";
  const base = FONT_BASE_PX[key] ?? FONT_BASE_PX.md;
  const chart = Math.max(8, Math.round(base * 0.85));
  const titlePx = Math.round(base * 1.1);
  const valuePx = Math.round(base * 1.35);
  const smallPx = Math.max(8, Math.round(base * 0.85));
  const statusPx = Math.round(base * 1.25);
  return {
    "--vmb-fs": `${base}px`,
    "--vmb-fs-title": `clamp(0.625rem, ${titlePx}px, ${titlePx}px)`,
    "--vmb-fs-value": `clamp(0.65rem, ${Math.max(10, valuePx - 2)}px, ${valuePx}px)`,
    "--vmb-fs-small": `clamp(0.5rem, ${smallPx}px, ${smallPx}px)`,
    "--vmb-fs-status": `clamp(0.75rem, ${statusPx}px, ${statusPx}px)`,
    "--vmb-chart-fs": `${chart}px`,
    fontSize: "var(--vmb-fs)",
  };
}

export function widgetChartFontSize(config) {
  const key = config?.font_size || "md";
  const base = FONT_BASE_PX[key] ?? FONT_BASE_PX.md;
  return Math.max(8, Math.round(base * 0.85));
}

export const vmbText = {
  title: "text-[length:var(--vmb-fs-title)] font-semibold leading-tight truncate",
  value: "text-[length:var(--vmb-fs-value)] font-bold tabular-nums leading-none truncate",
  body: "text-[length:var(--vmb-fs)] leading-snug",
  small: "text-[length:var(--vmb-fs-small)] leading-snug",
  status: "text-[length:var(--vmb-fs-status)] font-bold leading-none",
  label: "text-[length:var(--vmb-fs-small)] uppercase tracking-wide leading-tight truncate",
};
