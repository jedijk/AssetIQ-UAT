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
  BookOpen,
  MessageSquareHeart,
} from "lucide-react";

export const SUCCESS_READINESS_BASE = "/settings/success-readiness";

export const SUCCESS_READINESS_NAV = [
  { path: "", label: "Dashboard", icon: LayoutDashboard, end: true },
  { path: "people", label: "People", icon: Users },
  { path: "process", label: "Process", icon: GitBranch },
  { path: "technology", label: "Technology", icon: Cpu },
  { path: "assessments", label: "Assessments", icon: ClipboardCheck },
  { path: "registers", label: "Registers", icon: BookOpen },
  { path: "pulse-surveys", label: "Pulse Surveys", icon: MessageSquareHeart },
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
  excluded: "bg-slate-100 text-slate-500 border-slate-200",
};

export const STATUS_LABELS = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  not_started: "Not started",
  excluded: "Not in scope",
};

export const PULSE_STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  closed: "bg-violet-100 text-violet-800 border-violet-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
};

export const PULSE_STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  closed: "Closed",
  archived: "Archived",
};
