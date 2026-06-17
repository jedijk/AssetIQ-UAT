export function boardSurfaceClass(theme) {
  return theme === "light"
    ? "bg-slate-100 text-slate-900"
    : "bg-slate-950 text-white";
}

export function boardCardClass(theme) {
  const palette =
    theme === "light"
      ? "bg-white border border-slate-200 text-slate-900"
      : "bg-slate-900/80 border border-slate-700/50 text-white";
  return `${palette} rounded-[length:var(--vmb-radius,1rem)] shadow-sm`;
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

/** Shared layout shell — clips content to the grid cell; parent cell is the @container. */
export const vmbWidgetShell =
  "h-full min-h-0 min-w-0 overflow-hidden flex flex-col";

export const vmbWidgetPad = "p-[length:var(--vmb-pad,0.5rem)]";

/**
 * Typography + chrome scale with card size (cqmin) and user font_size preference.
 * Applied on the grid cell so all descendants inherit variables.
 */
export function widgetFontVars(config) {
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

export const vmbText = {
  title: "text-[length:var(--vmb-fs-title)] font-semibold leading-tight truncate",
  value: "text-[length:var(--vmb-fs-value)] font-bold tabular-nums leading-none truncate",
  body: "text-[length:var(--vmb-fs)] leading-snug",
  small: "text-[length:var(--vmb-fs-small)] leading-snug",
  status: "text-[length:var(--vmb-fs-status)] font-bold leading-none",
  label: "text-[length:var(--vmb-fs-small)] uppercase tracking-wide leading-tight truncate",
};
