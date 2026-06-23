import { Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

export function actionRequiresDowntime(action) {
  return typeof action === "object" && action != null && !!action.requires_downtime;
}

export function taskRequiresDowntime(task) {
  return task != null && !!task.requires_downtime;
}

function actionDescription(action) {
  if (typeof action === "string") return action.trim();
  if (action == null || typeof action !== "object") return "";
  return String(action.description || action.text || "").trim();
}

/** Resolve downtime from task field or linked library failure-mode recommended actions. */
export function resolveTaskRequiresDowntime(task, libraryFmsById) {
  if (taskRequiresDowntime(task)) return true;
  if (!task?.name || !libraryFmsById) return false;

  const taskName = task.name.trim().toLowerCase();
  const fmIds = (task.failure_mode_ids || []).map(String);

  for (const fmId of fmIds) {
    const fm = libraryFmsById[fmId];
    for (const action of fm?.recommended_actions || []) {
      const text = actionDescription(action).toLowerCase();
      if (!text) continue;
      if (
        text.startsWith(taskName)
        || taskName.startsWith(text.slice(0, 100))
        || text.slice(0, 100) === taskName
      ) {
        if (actionRequiresDowntime(action)) return true;
      }
    }
  }
  return false;
}

/** Resolve downtime for a scheduled task (field, strategy template, or library FM actions). */
export function resolveScheduledTaskRequiresDowntime(
  task,
  { libraryFmsById, strategyTemplatesById } = {},
) {
  if (task?.requires_downtime) return true;

  const templateIds = [
    task?.strategy_task_id,
    task?.template_id,
    task?.task_template_id,
    task?.v2_task_id,
  ]
    .filter(Boolean)
    .map(String);

  for (const tid of templateIds) {
    const template = strategyTemplatesById?.[tid];
    if (template && resolveTaskRequiresDowntime(template, libraryFmsById)) {
      return true;
    }
  }

  if (task?.task_name) {
    const fmIds = task.failure_mode_id ? [String(task.failure_mode_id)] : [];
    if (
      resolveTaskRequiresDowntime(
        { name: task.task_name, failure_mode_ids: fmIds },
        libraryFmsById,
      )
    ) {
      return true;
    }
  }

  return false;
}

export default function ActionDowntimeBadge({
  action,
  requiresDowntime,
  className,
  showLabel = false,
  size = "sm",
}) {
  const { t } = useLanguage();
  const active =
    requiresDowntime !== undefined
      ? !!requiresDowntime
      : actionRequiresDowntime(action);
  if (!active) return null;

  const iconClass = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  const badge = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-100 text-amber-800",
        showLabel ? "px-2 py-0.5 text-xs font-medium" : "p-0.5",
        className,
      )}
      aria-label={t("library.downtimeRequired")}
    >
      <Clock className={iconClass} />
      {showLabel ? t("library.downtimeRequired") : null}
    </span>
  );

  if (showLabel) return badge;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{t("library.downtimeRequired")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
