import { formatDateRelative } from "../../lib/dateUtils";

export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "";
  return formatDateRelative(timestamp);
};

export const typeColors = {
  issue: "text-red-500",
  improvement: "text-amber-500",
  general: "text-blue-500",
};

export const statusConfig = {
  new: { color: "bg-slate-400", label: "New" },
  in_review: { color: "bg-amber-500", label: "In Review" },
  resolved: { color: "bg-green-500", label: "Resolved" },
  planned: { color: "bg-blue-500", label: "Planned" },
  wont_fix: { color: "bg-slate-500", label: "Won't Fix" },
  implemented: { color: "bg-emerald-500", label: "Implemented" },
  parked: { color: "bg-orange-400", label: "Parked" },
  rejected: { color: "bg-red-500", label: "Rejected" },
};

export const severityColors = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};
