/**
 * Maintenance schedule UI — split from MaintenanceScheduleManager.jsx
 */
import { useMemo } from "react";
import {
  Clock,
  Calendar,
  Users,
  PlayCircle,
  CheckCircle,
  PauseCircle,
  XCircle,
} from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import { getTaskStatusConfig, getPriorityConfig } from "../../../lib/maintenanceTaskLabels";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-700",
  assigned: "bg-purple-100 text-purple-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  deferred: "bg-orange-100 text-orange-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_ICONS = {
  draft: Clock,
  scheduled: Calendar,
  assigned: Users,
  in_progress: PlayCircle,
  completed: CheckCircle,
  deferred: PauseCircle,
  cancelled: XCircle,
};

const PRIORITY_STYLE = {
  critical: { color: "bg-red-500 text-white", textColor: "text-red-600" },
  high: { color: "bg-orange-500 text-white", textColor: "text-orange-600" },
  medium: { color: "bg-yellow-500 text-white", textColor: "text-yellow-600" },
  low: { color: "bg-green-500 text-white", textColor: "text-green-600" },
};

export function useTaskStatusConfig() {
  const { t } = useLanguage();
  return useMemo(() => {
    const labels = getTaskStatusConfig(t);
    return Object.fromEntries(
      Object.entries(STATUS_ICONS).map(([key, icon]) => [
        key,
        {
          label: labels[key]?.label ?? key,
          color: STATUS_COLORS[key],
          icon,
        },
      ])
    );
  }, [t]);
}

export function usePriorityConfig() {
  const { t } = useLanguage();
  return useMemo(() => {
    const labels = getPriorityConfig(t);
    return Object.fromEntries(
      Object.entries(PRIORITY_STYLE).map(([key, style]) => [
        key,
        { label: labels[key]?.label ?? key, ...style },
      ])
    );
  }, [t]);
}
