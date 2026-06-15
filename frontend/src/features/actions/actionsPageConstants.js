import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Target,
  GitBranch,
  Brain,
  FileText,
} from "lucide-react";

export const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "bg-blue-500", textColor: "text-blue-700", bgColor: "bg-blue-100" },
  { value: "in_progress", label: "In Progress", color: "bg-amber-500", textColor: "text-amber-700", bgColor: "bg-amber-100" },
  { value: "completed", label: "Completed", color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-100" },
];

export const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical", color: "bg-red-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "medium", label: "Medium", color: "bg-yellow-500" },
  { value: "low", label: "Low", color: "bg-green-500" },
];

export const RISK_OPTIONS = [
  { value: "Critical", label: "Critical", color: "bg-red-500" },
  { value: "High", label: "High", color: "bg-orange-500" },
  { value: "Medium", label: "Medium", color: "bg-yellow-500" },
  { value: "Low", label: "Low", color: "bg-green-500" },
];

export const statusConfig = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
};

export const priorityConfig = {
  critical: { label: "Critical", color: "bg-red-100 text-red-700", iconBg: "bg-red-50", iconColor: "text-red-600" },
  high: { label: "High", color: "bg-orange-100 text-orange-700", iconBg: "bg-orange-50", iconColor: "text-orange-600" },
  medium: { label: "Medium", color: "bg-yellow-100 text-yellow-700", iconBg: "bg-yellow-50", iconColor: "text-yellow-600" },
  low: { label: "Low", color: "bg-slate-100 text-slate-600", iconBg: "bg-slate-50", iconColor: "text-slate-600" },
};

export const sourceConfig = {
  threat: { label: "Threat", icon: Target, color: "text-amber-600" },
  investigation: { label: "Investigation", icon: GitBranch, color: "text-blue-600" },
  ai_recommendation: { label: "AI", icon: Brain, color: "text-purple-600" },
};

export function actionSourceLabel(action) {
  return (
    action?.source_name
    || action?.equipment_name
    || action?.threat_asset
    || action?.assignee
    || "No source"
  );
}

export function getStatusDisplayText(statusFilter) {
  if (statusFilter.length === 0) return "All Status";
  if (statusFilter.length === 1) {
    return STATUS_OPTIONS.find((s) => s.value === statusFilter[0])?.label || statusFilter[0];
  }
  return `${statusFilter.length} selected`;
}
