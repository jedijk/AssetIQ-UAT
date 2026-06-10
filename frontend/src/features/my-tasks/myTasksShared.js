export const sourceBadges = {
  fmea: { label: "FMEA", color: "bg-purple-100 text-purple-700" },
  observation: { label: "Observation", color: "bg-blue-100 text-blue-700" },
  investigation: { label: "Investigation", color: "bg-indigo-100 text-indigo-700" },
  threat: { label: "Threat", color: "bg-orange-100 text-orange-700" },
  manual: { label: "Manual", color: "bg-slate-100 text-slate-700" },
  recurring: { label: "Recurring", color: "bg-emerald-100 text-emerald-700" },
};

export function taskPriorityRank(p) {
  const key = String(p ?? "").toLowerCase();
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return Object.prototype.hasOwnProperty.call(order, key) ? order[key] : 99;
}
