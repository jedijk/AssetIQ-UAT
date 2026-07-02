export const MATURITY_LEVELS = [
  {
    id: "optimized",
    label: "Strong",
    min: 80,
    max: 100,
    description: "Your organization shows strong readiness to maximize performance with AssetIQ.",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    textClass: "text-emerald-700",
  },
  {
    id: "established",
    label: "Moderate",
    min: 60,
    max: 79,
    description: "Your organization shows moderate readiness to maximize performance with AssetIQ.",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    textClass: "text-amber-700",
  },
  {
    id: "developing",
    label: "Developing",
    min: 40,
    max: 59,
    description: "Your organization is developing readiness — several areas need focused improvement.",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    textClass: "text-amber-700",
  },
  {
    id: "emerging",
    label: "Early",
    min: 1,
    max: 39,
    description: "Your organization is in early rollout — significant readiness work is still ahead.",
    badgeClass: "bg-red-100 text-red-800 border-red-200",
    textClass: "text-red-700",
  },
  {
    id: "not_started",
    label: "Not started",
    min: null,
    max: null,
    description: "No measurement recorded yet for this area.",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    textClass: "text-slate-500",
  },
];

export function getMaturityLevel(score) {
  if (score == null || Number.isNaN(Number(score))) {
    return MATURITY_LEVELS.find((level) => level.id === "not_started");
  }

  const value = Math.min(100, Math.max(0, Math.round(Number(score))));
  if (value === 0) {
    return MATURITY_LEVELS.find((level) => level.id === "not_started");
  }

  return (
    MATURITY_LEVELS.find((level) => level.min != null && value >= level.min && value <= level.max) ||
    MATURITY_LEVELS[0]
  );
}
