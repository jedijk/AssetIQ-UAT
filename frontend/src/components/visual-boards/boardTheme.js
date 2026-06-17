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
