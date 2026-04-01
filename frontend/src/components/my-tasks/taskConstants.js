/**
 * My Tasks Constants
 * Colors, icons, and configuration for task display
 */
import {
  ClipboardList,
  Wrench,
  Repeat,
  Timer,
  Zap,
  Target,
} from "lucide-react";

export const priorityColors = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

export const taskTypeIcons = {
  scheduled: ClipboardList,
  recurring: Repeat,
  ad_hoc: Timer,
  corrective: Wrench,
  preventive: ClipboardList,
};

export const sourceBadges = {
  action: { icon: Zap, color: "bg-purple-100 text-purple-700", label: "Action" },
  task: { icon: Target, color: "bg-blue-100 text-blue-700", label: "Task" },
  adhoc: { icon: Timer, color: "bg-amber-100 text-amber-700", label: "Ad-hoc" },
};

export const statusColors = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export const getTaskIcon = (taskType) => {
  return taskTypeIcons[taskType] || ClipboardList;
};

export const getPriorityColor = (priority) => {
  return priorityColors[priority] || priorityColors.medium;
};

export const getSourceBadge = (sourceType) => {
  return sourceBadges[sourceType] || sourceBadges.task;
};
