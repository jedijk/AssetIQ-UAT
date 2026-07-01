import {
  LayoutDashboard,
  Users,
  GitBranch,
  Cpu,
  ClipboardCheck,
  FileCheck,
  History,
  Sparkles,
  Settings,
} from "lucide-react";

export const SUCCESS_READINESS_BASE = "/settings/success-readiness";

export const SUCCESS_READINESS_NAV = [
  { path: "", label: "Dashboard", icon: LayoutDashboard, end: true },
  { path: "people", label: "People", icon: Users },
  { path: "process", label: "Process", icon: GitBranch },
  { path: "technology", label: "Technology", icon: Cpu },
  { path: "assessments", label: "Assessments", icon: ClipboardCheck },
  { path: "evidence", label: "Evidence", icon: FileCheck },
  { path: "history", label: "History", icon: History },
  { path: "ai-recommendations", label: "AI Recommendations", icon: Sparkles },
  { path: "configuration", label: "Configuration", icon: Settings, ownerOnly: true },
];

export const PILLAR_LABELS = {
  people: "People",
  process: "Process",
  technology: "Technology",
};

export const PILLAR_WEIGHTS = {
  people: 33,
  process: 33,
  technology: 34,
};

export const STATUS_STYLES = {
  on_track: "bg-emerald-100 text-emerald-800 border-emerald-200",
  at_risk: "bg-amber-100 text-amber-800 border-amber-200",
  off_track: "bg-red-100 text-red-800 border-red-200",
  not_started: "bg-slate-100 text-slate-600 border-slate-200",
};

export const STATUS_LABELS = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  not_started: "Not started",
};
