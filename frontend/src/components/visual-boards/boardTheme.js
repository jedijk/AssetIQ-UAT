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

/** CSS variables for scalable widget typography (inherits to children). */
export function widgetFontVars(config) {
  const key = config?.font_size || "md";
  const base = FONT_BASE_PX[key] ?? FONT_BASE_PX.md;
  const chart = Math.max(8, Math.round(base * 0.85));
  return {
    "--vmb-fs": `${base}px`,
    "--vmb-fs-title": `${Math.round(base * 1.15)}px`,
    "--vmb-fs-value": `${Math.round(base * 1.85)}px`,
    "--vmb-fs-small": `${Math.max(8, Math.round(base * 0.85))}px`,
    "--vmb-fs-status": `${Math.round(base * 1.65)}px`,
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
  title: "text-[length:var(--vmb-fs-title)] font-semibold",
  value: "text-[length:var(--vmb-fs-value)] font-bold tabular-nums",
  body: "text-[length:var(--vmb-fs)]",
  small: "text-[length:var(--vmb-fs-small)]",
  status: "text-[length:var(--vmb-fs-status)] font-bold",
  label: "text-[length:var(--vmb-fs-small)] uppercase tracking-wide",
};
