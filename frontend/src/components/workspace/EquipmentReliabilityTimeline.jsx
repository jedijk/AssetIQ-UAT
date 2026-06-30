import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Cog,
  Eye,
  FileSearch,
  History,
  Loader2,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useLanguage } from "../../contexts/LanguageContext";
import { translateEnum } from "../../lib/translateEnum";
import { equipmentHierarchyAPI } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";

const EVENT_TYPE_ENUM = {
  observation: "Observation",
  failure: "Failure",
  work_order: "Action",
  action: "Action",
  inspection: "Inspection",
  repair: "Repair",
  investigation: "Investigation",
  strategy_change: "Strategy Change",
};

const getEventTypeLabel = (t, type) => translateEnum(t, EVENT_TYPE_ENUM[type] || "Event");

const STATUS_COLORS = {
  completed: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  pending: "bg-amber-100 text-amber-800",
  scheduled: "bg-blue-100 text-blue-800",
  cancelled: "bg-slate-100 text-slate-600",
};

function TimelineEventCard({ event, isCurrent }) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const getEventConfig = (type) => {
    const configs = {
      observation: { icon: AlertTriangle, color: "amber" },
      failure: { icon: XCircle, color: "red" },
      work_order: { icon: Wrench, color: "blue" },
      action: { icon: Wrench, color: "blue" },
      inspection: { icon: Eye, color: "green" },
      repair: { icon: Wrench, color: "purple" },
      investigation: { icon: FileSearch, color: "indigo" },
      strategy_change: { icon: Cog, color: "slate" },
    };
    const base = configs[type] || configs.observation;
    return { ...base, label: getEventTypeLabel(t, type) };
  };

  const config = getEventConfig(event.event_type);
  const Icon = config.icon;
  const isAction = event.event_type === "action" || event.event_type === "work_order";
  const actionType = event.action_type || event.task_type || event.type;

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return format(parseISO(dateStr), "MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  const handleClick = () => {
    if (event.event_type === "observation" && event.id) {
      navigate(`/threats/${event.id}`);
    } else if (event.event_type === "investigation" && event.id) {
      navigate(`/causal-engine?id=${event.id}`);
    }
  };

  const tooltipParts = [];
  if (event.title) tooltipParts.push(event.title);
  if (event.date) {
    try {
      tooltipParts.push(format(parseISO(event.date), "PPP"));
    } catch {
      tooltipParts.push(event.date);
    }
  }
  if (config.label) tooltipParts.push(config.label);
  if (actionType) tooltipParts.push(t("observationWorkspace.eventTypeLabel", { type: actionType }));
  if (event.reference_id) tooltipParts.push(event.reference_id);
  if (event.status) {
    tooltipParts.push(t("observationWorkspace.statusLabel", { status: translateEnum(t, event.status) }));
  }
  if (event.description) tooltipParts.push(event.description);
  const tooltip = tooltipParts.join("\n");

  return (
    <div
      className="flex flex-col items-center cursor-pointer group flex-shrink-0 w-20"
      onClick={handleClick}
      title={tooltip}
    >
      <div className="text-[10px] text-slate-500 mb-1.5 font-medium h-3.5 leading-3.5">
        {formatDate(event.date)}
      </div>
      <div
        className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ring-2 ring-white ${
          isCurrent
            ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
            : `bg-${config.color}-100 text-${config.color}-600`
        }`}
      >
        <Icon className="w-3 h-3" />
      </div>
      {isAction && actionType && (
        <div className="text-[9px] font-semibold mt-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
          {actionType}
        </div>
      )}
      <div
        className={`text-[10px] font-medium ${isAction && actionType ? "mt-1" : "mt-1.5"} text-center max-w-[72px] truncate leading-tight ${
          isCurrent ? "text-blue-700 font-semibold" : "text-slate-700"
        }`}
      >
        {event.title?.substring(0, 22) || config.label}
      </div>
      {event.reference_id && (
        <div className="text-[9px] text-slate-400 mt-0.5 leading-none">{event.reference_id}</div>
      )}
    </div>
  );
}

function PMComplianceDialog({ open, onOpenChange, equipmentId }) {
  const { t } = useLanguage();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.equipmentPmCompliance.detail(equipmentId),
    queryFn: () => equipmentHierarchyAPI.getEquipmentPmCompliance(equipmentId),
    enabled: open && !!equipmentId,
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    try {
      return format(parseISO(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
            {t("observationWorkspace.pmComplianceSummary")}
            {data?.compliance_pct != null && (
              <Badge variant="secondary" className="ml-1 font-semibold">
                {Math.round(data.compliance_pct)}%
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {t("common.loading")}
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-red-500 text-sm">
            Failed to load PM compliance data
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                  {data.ai_summary}
                </p>
              </div>
              {data.overdue_count > 0 && (
                <p className="text-xs text-red-600 mt-2 ml-6">
                  {t("observationWorkspace.overduePmTasks", { count: data.overdue_count })}
                </p>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {t("observationWorkspace.pmExecutions")}
                {data.total_count != null && (
                  <span className="font-normal normal-case ml-1">
                    ({data.completed_count}/{data.total_count})
                  </span>
                )}
              </h4>

              {!data.executions?.length ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  {t("observationWorkspace.noPmExecutions")}
                </p>
              ) : (
                <div className="space-y-2">
                  {data.executions.map((ex) => (
                    <div
                      key={ex.id}
                      className="rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{ex.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {ex.task_type}
                            {ex.scheduled_date && ` · ${formatDate(ex.scheduled_date)}`}
                            {ex.completed_at && ` · ✓ ${formatDate(ex.completed_at)}`}
                          </p>
                        </div>
                        <Badge
                          className={`text-[10px] capitalize flex-shrink-0 ${STATUS_COLORS[ex.status] || STATUS_COLORS.pending}`}
                        >
                          {translateEnum(t, ex.status)}
                        </Badge>
                      </div>
                      {ex.technician_feedback ? (
                        <div className="mt-2 pt-2 border-t border-slate-100">
                          <p className="text-[10px] font-medium text-slate-500 mb-0.5">
                            {t("observationWorkspace.technicianFeedback")}
                          </p>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {ex.technician_feedback}
                          </p>
                        </div>
                      ) : ex.status === "completed" ? (
                        <p className="text-xs text-slate-400 mt-2 italic">
                          {t("observationWorkspace.noCloseOutFeedback")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Equipment Reliability Timeline
 */
export function EquipmentReliabilityTimeline({ events, equipmentId }) {
  const { t } = useLanguage();
  const [pmDialogOpen, setPmDialogOpen] = useState(false);

  const { data: pmPreview } = useQuery({
    queryKey: queryKeys.equipmentPmCompliance.detail(equipmentId),
    queryFn: () => equipmentHierarchyAPI.getEquipmentPmCompliance(equipmentId),
    enabled: !!equipmentId,
    staleTime: 60_000,
  });

  const compliancePct = pmPreview?.compliance_pct;

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-slate-500" />
          <h3 className="font-medium text-xs text-slate-700">{t("observationWorkspace.equipmentHistory")}</h3>
          {events && events.length > 0 && (
            <span className="text-[10px] text-slate-400">({events.length})</span>
          )}
        </div>

        {equipmentId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPmDialogOpen(true)}
            className="h-6 px-2 text-xs font-semibold text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100 max-md:!h-3 max-md:!min-h-[12px] max-md:px-1.5 max-md:py-0 max-md:text-[10px] max-md:leading-3 max-md:font-medium max-md:gap-0.5 max-md:[&_svg]:!size-2.5"
          >
            <CheckCircle2 className="w-3 h-3 mr-1 max-md:w-2.5 max-md:h-2.5 max-md:mr-0" />
            {t("observationWorkspace.pmCompliance")}
            {compliancePct != null ? ` ${Math.round(compliancePct)}%` : ""}
          </Button>
        )}
      </div>

      {events && events.length > 0 ? (
        <div className="relative px-1.5">
          <div
            className="pointer-events-none absolute left-0 right-0 h-px bg-slate-200"
            style={{ top: "32px" }}
          />
          <div className="flex items-start overflow-x-auto pb-1.5 gap-3 scrollbar-thin scrollbar-thumb-slate-300">
            {events.slice(0, 10).map((event, index) => (
              <TimelineEventCard
                key={event.id || index}
                event={event}
                isCurrent={event.is_current}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("observationWorkspace.noHistoricalEvents")}</p>
        </div>
      )}

      <PMComplianceDialog
        open={pmDialogOpen}
        onOpenChange={setPmDialogOpen}
        equipmentId={equipmentId}
      />
    </div>
  );
}
