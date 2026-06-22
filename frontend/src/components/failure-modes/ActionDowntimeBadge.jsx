import { Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

export function actionRequiresDowntime(action) {
  return typeof action === "object" && action != null && !!action.requires_downtime;
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
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{t("library.downtimeRequired")}</TooltipContent>
    </Tooltip>
  );
}
