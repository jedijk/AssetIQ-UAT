import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  ChevronRight,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { intelligenceContextAPI } from "../../lib/apis/intelligenceContext";
import { useLanguage } from "../../contexts/LanguageContext";

const PANEL_WIDTH = 460;

function Section({ title, children, className = "" }) {
  return (
    <section className={`border-b border-slate-200 pb-4 mb-4 last:border-0 last:mb-0 ${className}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function MetricRow({ label, value, onClick }) {
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
        clickable ? "hover:bg-slate-100 text-left" : "cursor-default text-left"
      }`}
    >
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
    </button>
  );
}

function CriticalityBadges({ distribution = {} }) {
  const entries = [
    ["high", "High", "bg-red-100 text-red-800"],
    ["medium", "Medium", "bg-amber-100 text-amber-800"],
    ["low", "Low", "bg-green-100 text-green-800"],
  ];
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {entries.map(([key, label, cls]) =>
        (distribution[key] || 0) > 0 ? (
          <Badge key={key} variant="outline" className={`text-[10px] ${cls}`}>
            {label}: {distribution[key]}
          </Badge>
        ) : null,
      )}
    </div>
  );
}

function IntelligenceFlow({ nodes = [], onNodeClick }) {
  return (
    <div className="space-y-1">
      {nodes.map((node, index) => (
        <div key={node.key}>
          <button
            type="button"
            onClick={() => onNodeClick?.(node)}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
              node.active
                ? "border-violet-300 bg-violet-50 text-violet-900"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-800"
            }`}
          >
            <span className="font-medium">
              {node.active ? "▶ " : ""}
              {node.label}
            </span>
            <span className="tabular-nums font-semibold">{node.count?.toLocaleString?.() ?? node.count}</span>
          </button>
          {index < nodes.length - 1 && (
            <div className="flex justify-center py-0.5 text-slate-300 text-xs">↓</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function IntelligenceContextPanel({
  open,
  onOpenChange,
  objectType = "strategy",
  objectId,
  equipmentTypeName,
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["intelligence-context", objectType, objectId],
    queryFn: () => intelligenceContextAPI.getStrategyContext(objectId),
    enabled: open && objectType === "strategy" && !!objectId,
    staleTime: 30_000,
  });

  const nav = useMemo(
    () => ({
      failureModes: (fmId) => {
        if (fmId) navigate(`/library?tab=failure-modes&fm_id=${encodeURIComponent(fmId)}`);
        else navigate("/library?tab=failure-modes");
      },
      equipmentTypes: () => navigate("/library?tab=libraries"),
      strategy: () => navigate(`/library?tab=maintenance&filter=with_strategy`),
      programs: () =>
        navigate(
          `/library?tab=maintenance${objectId ? `&equipmentType=${encodeURIComponent(objectId)}` : ""}`,
        ),
      schedules: () => navigate("/tasks"),
      plannedWork: () => navigate("/tasks"),
    }),
    [navigate, objectId],
  );

  const onFlowNodeClick = (node) => {
    switch (node.key) {
      case "failure_modes":
        nav.failureModes();
        break;
      case "equipment_types":
        nav.equipmentTypes();
        break;
      case "strategy":
        nav.strategy();
        break;
      case "programs":
        nav.programs();
        break;
      case "schedules":
        nav.schedules();
        break;
      case "planned_work":
        nav.plannedWork();
        break;
      default:
        break;
    }
  };

  const riskClass =
    data?.business_impact?.risk_reduction === "High"
      ? "text-red-700 bg-red-50 border-red-200"
      : data?.business_impact?.risk_reduction === "Medium"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-green-700 bg-green-50 border-green-200";

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="intelligence-context-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: PANEL_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeInOut" }}
          className="shrink-0 overflow-hidden border-l border-slate-200 bg-slate-50/80"
          style={{ maxWidth: PANEL_WIDTH }}
          data-testid="intelligence-context-panel"
        >
          <div className="flex h-full flex-col" style={{ width: PANEL_WIDTH }}>
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <Brain className="h-5 w-5 shrink-0 text-violet-600" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 truncate">
                    {t("intelligenceContext.title")}
                  </h2>
                  <p className="text-xs text-slate-500 truncate">
                    {equipmentTypeName || data?.summary?.name || objectId}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onOpenChange?.(false)}
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 px-4 py-4">
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-600 mb-3" />
                  <p className="text-sm">{t("intelligenceContext.loading")}</p>
                </div>
              )}

              {isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <div className="flex items-center gap-2 font-medium mb-2">
                    <AlertCircle className="h-4 w-4" />
                    {t("intelligenceContext.loadFailed")}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => refetch()}>
                    {t("intelligenceContext.retry")}
                  </Button>
                </div>
              )}

              {data && !isLoading && (
                <div className="pb-6">
                  <Section title={t("intelligenceContext.strategySummary")}>
                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">{t("intelligenceContext.strategyName")}</p>
                        <p className="font-medium text-slate-900">{data.summary?.name}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-slate-500">{t("intelligenceContext.strategyType")}</p>
                          <p className="font-medium capitalize">{data.summary?.strategy_type}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">{t("intelligenceContext.status")}</p>
                          <p className="font-medium capitalize">{data.summary?.status}</p>
                        </div>
                      </div>
                      {data.summary?.last_updated && (
                        <div>
                          <p className="text-xs text-slate-500">{t("intelligenceContext.lastUpdated")}</p>
                          <p className="font-medium">{data.summary.last_updated}</p>
                        </div>
                      )}
                    </div>
                  </Section>

                  <Section title={data.origin?.heading || t("intelligenceContext.originHeading")}>
                    <p className="text-xs text-slate-500 mb-2">
                      {t("intelligenceContext.totalFailureModes")}:{" "}
                      <span className="font-semibold text-slate-800">
                        {data.origin?.total_failure_modes ?? 0}
                      </span>
                    </p>
                    <CriticalityBadges distribution={data.origin?.criticality_distribution} />
                    <ul className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                      {(data.origin?.failure_modes || []).slice(0, 12).map((fm) => (
                        <li key={fm.id || fm.name}>
                          <button
                            type="button"
                            onClick={() => fm.id && nav.failureModes(fm.id)}
                            className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-sm text-slate-700 hover:bg-white hover:text-violet-700"
                          >
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{fm.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {(data.origin?.failure_modes?.length || 0) > 12 && (
                      <p className="text-xs text-slate-400 mt-1">
                        +{(data.origin.failure_modes.length - 12).toLocaleString()} more
                      </p>
                    )}
                  </Section>

                  <Section title={data.equipment_coverage?.heading || t("intelligenceContext.coverageHeading")}>
                    <ul className="space-y-1 mb-3">
                      {(data.equipment_coverage?.equipment_types || []).map((et) => (
                        <li key={et.id}>
                          <button
                            type="button"
                            onClick={() => nav.equipmentTypes()}
                            className="text-sm font-medium text-violet-700 hover:underline"
                          >
                            {et.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <MetricRow
                      label={t("intelligenceContext.assetsCovered")}
                      value={data.equipment_coverage?.assets_count ?? 0}
                      onClick={() => navigate("/equipment-manager")}
                    />
                    <MetricRow
                      label={t("intelligenceContext.systemsCovered")}
                      value={data.equipment_coverage?.systems_count ?? 0}
                    />
                  </Section>

                  <Section title={data.downstream?.heading || t("intelligenceContext.downstreamHeading")}>
                    <MetricRow
                      label={t("intelligenceContext.programs")}
                      value={data.downstream?.programs_count ?? 0}
                      onClick={nav.programs}
                    />
                    <MetricRow
                      label={t("intelligenceContext.schedules")}
                      value={data.downstream?.schedules_count ?? 0}
                      onClick={nav.schedules}
                    />
                    <MetricRow
                      label={t("intelligenceContext.plannedWorkPerYear")}
                      value={(data.downstream?.planned_work_per_year ?? 0).toLocaleString()}
                      onClick={nav.plannedWork}
                    />
                  </Section>

                  <Section title={data.intelligence_flow?.heading || t("intelligenceContext.flowHeading")}>
                    <IntelligenceFlow
                      nodes={data.intelligence_flow?.nodes || []}
                      onNodeClick={onFlowNodeClick}
                    />
                  </Section>

                  <Section title={data.business_impact?.heading || t("intelligenceContext.outcomeHeading")}>
                    <MetricRow
                      label={t("intelligenceContext.assetsCovered")}
                      value={data.business_impact?.assets_covered ?? 0}
                    />
                    <MetricRow
                      label={t("intelligenceContext.plannedWorkGenerated")}
                      value={`${(data.business_impact?.planned_work_per_year ?? 0).toLocaleString()}/yr`}
                    />
                    <MetricRow
                      label={t("intelligenceContext.estimatedLabor")}
                      value={`${(data.business_impact?.estimated_labor_hours_per_year ?? 0).toLocaleString()} hrs/yr`}
                    />
                    <MetricRow
                      label={t("intelligenceContext.failureModesControlled")}
                      value={data.business_impact?.failure_modes_controlled ?? 0}
                    />
                    <div className="mt-3 rounded-lg border px-3 py-2 text-sm font-medium capitalize">
                      <span className="text-slate-600">{t("intelligenceContext.riskReduction")}: </span>
                      <Badge variant="outline" className={riskClass}>
                        {data.business_impact?.risk_reduction}
                      </Badge>
                    </div>
                  </Section>
                </div>
              )}
            </ScrollArea>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function IntelligenceContextToggle({ open, onToggle, disabled }) {
  const { t } = useLanguage();
  const label = t("intelligenceContext.toggleLabel");
  return (
    <Button
      type="button"
      size="sm"
      variant={open ? "default" : "outline"}
      className={`shrink-0 ${
        open
          ? "bg-violet-600 hover:bg-violet-700 text-white"
          : "text-violet-700 border-violet-300 bg-violet-50 hover:bg-violet-100"
      }`}
      onClick={onToggle}
      disabled={disabled}
      data-testid="intelligence-context-toggle"
      aria-label={label}
    >
      <Brain className="h-3.5 w-3.5 mr-1.5" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{t("intelligenceContext.toggleShort")}</span>
    </Button>
  );
}
