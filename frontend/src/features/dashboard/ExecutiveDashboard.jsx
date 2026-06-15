/**
 * Executive Dashboard - Reliability Value Management
 * Provides executives with visibility into production value exposure and reliability controls.
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { api } from "../../lib/apiClient";
import useIsMobile from "../../hooks/useIsMobile";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  ShieldOff,
  AlertTriangle,
  ShieldCheck,
  CircleCheck,
  CheckCircle2,
  ClipboardCheck,
  Activity,
  Sparkles,
  ChevronRight,
  Loader2,
  Info,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../components/ui/hover-card";

// Fetch executive dashboard data
const fetchExecutiveDashboard = async (periodDays) => {
  const response = await api.get("/executive-dashboard", {
    params: { period_days: periodDays },
  });
  return response.data;
};

const REPORT_PERIOD_OPTIONS = [
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
];

// Trend indicator component
const TrendIndicator = ({ trend, changePercent }) => {
  if (!trend || trend === "stable") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Minus className="w-3 h-3" />
        <span>Stable</span>
      </span>
    );
  }

  if (trend === "improving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <TrendingUp className="w-3 h-3" />
        <span>{changePercent > 0 ? "+" : ""}{changePercent?.toFixed(1)}%</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600">
      <TrendingDown className="w-3 h-3" />
      <span>{changePercent > 0 ? "+" : ""}{changePercent?.toFixed(1)}%</span>
    </span>
  );
};

// KPI Card component
const KPICard = ({ title, kpi, icon: Icon, colorClass, onClick, isMobile }) => {
  if (!kpi) return null;

  const iconColorClass =
    colorClass.includes("green") ? "text-green-600"
    : colorClass.includes("red") ? "text-red-600"
    : colorClass.includes("orange") ? "text-orange-600"
    : colorClass.includes("amber") ? "text-amber-600"
    : colorClass.includes("blue") ? "text-blue-600"
    : colorClass.includes("teal") ? "text-teal-600"
    : colorClass.includes("indigo") ? "text-indigo-600"
    : "text-slate-600";

  const cardBody = (
    <motion.div
      whileHover={isMobile ? undefined : { scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`relative bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 transition-all ${colorClass} ${
        onClick ? "cursor-pointer hover:shadow-lg active:shadow-md" : ""
      }`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick(event);
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`p-2 rounded-lg ${colorClass.replace("border-l-4", "bg-opacity-10")}`}>
          <Icon className={`w-5 h-5 ${iconColorClass}`} />
        </div>
        <TrendIndicator trend={kpi.trend} changePercent={kpi.change_percent} />
      </div>

      <div className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
        {kpi.formatted_value}
      </div>

      <div className="text-sm text-slate-600 font-medium">{title}</div>

      {kpi.evidence_count > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <span>
            {kpi.total_submitted_count != null
              ? `${kpi.evidence_count} evidence items`
              : title === "Exposure Coverage"
                ? `${kpi.evidence_count} active maintenance program${kpi.evidence_count === 1 ? "" : "s"}`
                : title === "Uncovered Exposure"
                  ? `${kpi.evidence_count} equipment item${kpi.evidence_count === 1 ? "" : "s"}`
                  : title === "Assessment Coverage"
                    ? `${kpi.evidence_count} unassessed item${kpi.evidence_count === 1 ? "" : "s"}`
                    : title === "Active Exposure" || title === "Controlled Exposure" || title === "Resolved Exposure"
                      ? `${kpi.evidence_count} observation${kpi.evidence_count === 1 ? "" : "s"}`
                  : `${kpi.evidence_count} evidence items`}
          </span>
          {onClick && <ChevronRight className="w-3 h-3" />}
        </div>
      )}

      {isMobile && kpi.tooltip ? (
        <p className="mt-2 text-[11px] leading-snug text-slate-500 line-clamp-3">
          {kpi.tooltip}
        </p>
      ) : null}
    </motion.div>
  );

  if (isMobile) {
    return cardBody;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{cardBody}</HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{kpi.tooltip}</p>
          {kpi.total_submitted_count != null && (
            <>
              <p className="text-xs text-slate-500">
                Total submitted tasks/forms: {Number(kpi.total_submitted_count).toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">
                {kpi.report_period_label
                  ? `This period (${kpi.report_period_label}): ${Number(kpi.week_submitted_count ?? kpi.value).toLocaleString()}`
                  : `This period: ${Number(kpi.week_submitted_count ?? kpi.value).toLocaleString()}`}
              </p>
            </>
          )}
          {kpi.total_submitted_count == null && kpi.previous_value !== null && (
            <p className="text-xs text-slate-500">
              Previous period: {kpi.previous_formatted ?? (
                kpi.formatted_value.includes("%")
                  ? (typeof kpi.previous_value === "number" && kpi.previous_value > 1000
                    ? kpi.formatted_value.replace(/[\d.,]+/, kpi.previous_value.toLocaleString())
                    : `${kpi.previous_value?.toFixed?.(1) ?? kpi.previous_value}%`)
                  : Number(kpi.previous_value).toLocaleString()
              )}
            </p>
          )}
          {kpi.total_submitted_count != null && kpi.previous_value != null && (
            <p className="text-xs text-slate-500">
              {kpi.previous_period_label
                ? `Previous period (${kpi.previous_period_label}): ${Number(kpi.previous_value).toLocaleString()}`
                : `Previous period: ${Number(kpi.previous_value).toLocaleString()}`}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

// Waterfall Chart component
const formatWaterfallCount = (count, unit) => {
  const n = Number(count) || 0;
  if (unit === "observations") {
    return `${n} observation${n === 1 ? "" : "s"}`;
  }
  return `${n} equipment item${n === 1 ? "" : "s"}`;
};

const WaterfallTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
      <p className="text-sm text-slate-700 mt-0.5">{item.formatted}</p>
      <p className="text-xs text-slate-500 mt-1">
        {formatWaterfallCount(item.count, item.count_unit)}
      </p>
    </div>
  );
};

const WaterfallMobileList = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div
          key={item.name}
          className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <div
              className="mt-1 h-3 w-3 shrink-0 rounded"
              style={{ backgroundColor: item.color }}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{item.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {formatWaterfallCount(item.count, item.count_unit)}
              </p>
            </div>
          </div>
          <p className="shrink-0 text-sm font-bold text-slate-900">{item.formatted}</p>
        </div>
      ))}
    </div>
  );
};

const WaterfallChart = ({ data, currencySymbol, isMobile }) => {
  if (!data || data.length === 0) return null;

  if (isMobile) {
    return <WaterfallMobileList data={data} />;
  }

  // Transform data for waterfall visualization
  const waterfallData = data.map((item, index) => {
    let start = 0;
    let end = item.value;
    
    if (index === 0) {
      // Total - full bar
      start = 0;
      end = item.value;
    } else if (index === 1) {
      // Covered - starts at 0, shows covered amount
      start = 0;
      end = item.value;
    } else if (index === 2) {
      // Uncovered - starts after covered
      start = data[1].value;
      end = start + item.value;
    } else {
      // Overlays - use actual values
      start = 0;
      end = item.value;
    }

    return {
      ...item,
      start,
      end,
      displayValue: item.value,
    };
  });

  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={waterfallData}
          layout="vertical"
          margin={{ top: 20, right: 80, left: 20, bottom: 20 }}
        >
          <XAxis
            type="number"
            domain={[0, maxValue * 1.1]}
            tickFormatter={(value) => {
              if (value >= 1e9) return `${currencySymbol}${(value / 1e9).toFixed(1)}B`;
              if (value >= 1e6) return `${currencySymbol}${(value / 1e6).toFixed(1)}M`;
              if (value >= 1e3) return `${currencySymbol}${(value / 1e3).toFixed(0)}K`;
              return `${currencySymbol}${value}`;
            }}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#334155", fontSize: 13, fontWeight: 500 }}
          />
          <Tooltip content={<WaterfallTooltip />} />
          <Bar dataKey="displayValue" radius={[0, 4, 4, 0]}>
            {waterfallData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="formatted"
              position="right"
              fill="#334155"
              fontSize={12}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const OBSERVATION_EVIDENCE_TYPES = new Set([
  "active_threat_exposure",
  "critical_active_exposure",
  "resolved_exposure",
]);

const EQUIPMENT_EVIDENCE_TYPES = new Set([
  "covered_exposure",
  "uncovered_exposure",
  "unassessed_assessments",
]);

const formatEvidenceDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    return format(date, "MMM d, yyyy");
  } catch {
    return "—";
  }
};

const getRpnBadgeClass = (score) => {
  if (score >= 75) return "bg-red-100 text-red-700 border-red-200";
  if (score >= 50) return "bg-orange-100 text-orange-700 border-orange-200";
  if (score >= 25) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

const ObservationEvidenceList = ({ evidence, onNavigate }) => (
  <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 overflow-hidden">
    <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_6rem] gap-3 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <span>Observation</span>
      <span className="text-right">RPN</span>
      <span>Date</span>
      <span className="text-right">Exposure</span>
    </div>
    {evidence.map((item, index) => {
      const rpn = Math.round(item.risk_score || 0);
      const label = item.title || item.failure_mode || item.description || "Untitled Observation";

      return (
        <motion.button
          key={item.id || index}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.03 }}
          onClick={() => item.id && onNavigate(item.id)}
          disabled={!item.id}
          className="w-full text-left bg-white hover:bg-blue-50/70 active:bg-blue-50 transition-colors px-4 py-3 disabled:cursor-default disabled:hover:bg-white"
          data-testid={item.id ? `evidence-observation-${item.id}` : undefined}
        >
          <div className="flex items-start gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_6rem] sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900 break-words line-clamp-2">{label}</div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{item.asset}</div>
              {item.control_status && (
                <Badge variant="outline" className="mt-1.5 text-[10px]">
                  {item.control_status}
                </Badge>
              )}
            </div>
            <div className="shrink-0 sm:text-right">
              <span className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md border px-2 py-0.5 text-sm font-semibold tabular-nums ${getRpnBadgeClass(rpn)}`}>
                {rpn}
              </span>
              <div className="mt-1 text-xs text-slate-500 sm:hidden">{formatEvidenceDate(item.created_at)}</div>
            </div>
            <div className="hidden sm:block text-sm text-slate-600 tabular-nums">
              {formatEvidenceDate(item.created_at)}
            </div>
            <div className="hidden sm:flex items-center justify-end gap-1 text-sm font-semibold text-slate-900 tabular-nums">
              <span>{item.exposure_formatted}</span>
              {item.id && <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between sm:hidden">
            <span className="text-sm font-semibold text-slate-900 tabular-nums">{item.exposure_formatted}</span>
            {item.id && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                Open
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        </motion.button>
      );
    })}
  </div>
);

const formatCriticalityLabel = (criticality) => {
  if (!criticality) return null;
  let raw = criticality;
  if (typeof criticality === "object") {
    raw = criticality.level || criticality.profile_id || criticality.name || null;
  }
  if (raw == null || raw === "") return null;
  const normalized = String(raw).replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const buildEquipmentAssessUrl = (equipmentId) =>
  `/equipment-manager?edit=${equipmentId}&section=criticality`;

const EquipmentEvidenceList = ({ evidence, onNavigate, assessMode = false, coveredMode = false }) => (
  <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 overflow-hidden">
    <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_6rem] gap-3 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <span>Equipment</span>
      <span>Status</span>
      <span className="text-right">{assessMode ? "Action" : "Impact"}</span>
    </div>
    {evidence.map((item, index) => {
      const label = item.asset || "Unnamed equipment";
      const criticalityLabel = formatCriticalityLabel(item.criticality);
      const hoverClass = assessMode
        ? "hover:bg-teal-50/70 active:bg-teal-50"
        : coveredMode
          ? "hover:bg-green-50/70 active:bg-green-50"
          : "hover:bg-amber-50/70 active:bg-amber-50";
      const actionClass = assessMode
        ? "text-teal-700"
        : coveredMode
          ? "text-green-700"
          : "text-amber-700";

      return (
        <motion.button
          key={item.id || index}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.03 }}
          onClick={() => item.id && onNavigate(item.id)}
          disabled={!item.id}
          className={`w-full text-left bg-white transition-colors px-4 py-3 disabled:cursor-default disabled:hover:bg-white ${hoverClass}`}
          data-testid={item.id ? `evidence-equipment-${item.id}` : undefined}
        >
          <div className="flex items-start gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_6rem] sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900 break-words line-clamp-2">{label}</div>
              {item.level_label ? (
                <div className="text-xs text-slate-500 mt-0.5">{item.level_label}</div>
              ) : criticalityLabel ? (
                <div className="text-xs text-slate-500 mt-0.5">{criticalityLabel} criticality</div>
              ) : null}
              {item.tag && (
                <div className="text-xs text-slate-400 mt-0.5">{item.tag}</div>
              )}
            </div>
            <div className="shrink-0">
              <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                {item.control_status || "Uncovered"}
              </Badge>
            </div>
            <div className="hidden sm:flex items-center justify-end gap-1 text-sm font-semibold tabular-nums">
              {assessMode ? (
                item.id && (
                  <span className="inline-flex items-center gap-1 text-teal-700">
                    Assess
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </span>
                )
              ) : (
                <>
                  <span className="text-slate-900">{item.exposure_formatted}</span>
                  {item.id && <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                </>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between sm:hidden">
            {assessMode ? (
              item.id && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                  Assess
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              )
            ) : (
              <>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{item.exposure_formatted}</span>
                {item.id && (
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${actionClass}`}>
                    Open
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </>
            )}
          </div>
        </motion.button>
      );
    })}
  </div>
);

// Evidence Panel component
const EvidencePanel = ({ isOpen, onClose, title, evidence, evidenceType }) => {
  const navigate = useNavigate();

  if (!evidence) return null;

  const isObservationEvidence = OBSERVATION_EVIDENCE_TYPES.has(evidenceType);
  const isEquipmentEvidence = EQUIPMENT_EVIDENCE_TYPES.has(evidenceType);

  const handleObservationNavigate = (observationId) => {
    onClose();
    navigate(`/threats/${observationId}/workspace`);
  };

  const handleEquipmentNavigate = (equipmentId) => {
    onClose();
    navigate(
      evidenceType === "unassessed_assessments"
        ? buildEquipmentAssessUrl(equipmentId)
        : `/equipment-manager?edit=${equipmentId}`
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {evidence.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No evidence items found</p>
        ) : isObservationEvidence ? (
          <ObservationEvidenceList evidence={evidence} onNavigate={handleObservationNavigate} />
        ) : isEquipmentEvidence ? (
          <EquipmentEvidenceList
            evidence={evidence}
            onNavigate={handleEquipmentNavigate}
            assessMode={evidenceType === "unassessed_assessments"}
            coveredMode={evidenceType === "covered_exposure"}
          />
        ) : (
          <p className="text-center text-slate-500 py-8">No evidence items found</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Main Executive Dashboard component
export default function ExecutiveDashboard() {
  const isMobile = useIsMobile();
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ["executive-dashboard", periodDays],
    queryFn: () => fetchExecutiveDashboard(periodDays),
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <AlertTriangle className="w-12 h-12 mb-4 text-red-400" />
        <p>Failed to load executive dashboard</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  const { exposure_metrics, kpi_cards, waterfall_data, ai_summary, evidence_drill_down, report_period } = data;
  const currencySymbol = exposure_metrics?.currency_symbol || "€";

  return (
    <div className="space-y-4 sm:space-y-6 pb-2">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">
            Reliability Value Management
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Executive overview of production value exposure and reliability controls
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
          <div className="inline-flex h-8 items-center rounded-lg bg-slate-100 p-0.5 gap-0.5 self-start sm:self-auto" data-testid="executive-report-period">
            {REPORT_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setPeriodDays(opt.days)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  periodDays === opt.days
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                data-testid={`executive-period-${opt.days}d`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {report_period?.label && (
            <p className="text-xs text-slate-500" data-testid="executive-report-period-label">
              Report period: {report_period.label}
            </p>
          )}
          <Badge variant="outline" className="text-xs">
            Updated {new Date(data.last_updated).toLocaleTimeString()}
          </Badge>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3 sm:gap-4">
        <KPICard
          title="Exposure Coverage"
          kpi={kpi_cards?.exposure_coverage}
          icon={Shield}
          colorClass="border-l-4 border-l-green-500"
          isMobile={isMobile}
          onClick={
            (kpi_cards?.exposure_coverage?.evidence_count ?? 0) > 0
              ? () => setSelectedEvidence({
                  type: "covered_exposure",
                  title: "Covered Exposure Evidence",
                  data: evidence_drill_down?.covered_exposure || [],
                })
              : undefined
          }
        />
        <KPICard
          title="Uncovered Exposure"
          kpi={kpi_cards?.uncovered_exposure}
          icon={ShieldOff}
          colorClass="border-l-4 border-l-amber-500"
          isMobile={isMobile}
          onClick={() => setSelectedEvidence({
            type: "uncovered_exposure",
            title: "Uncovered Exposure Evidence",
            data: evidence_drill_down?.uncovered_exposure || []
          })}
        />
        <KPICard
          title="Assessment Coverage"
          kpi={kpi_cards?.assessment_coverage}
          icon={ClipboardCheck}
          colorClass="border-l-4 border-l-teal-500"
          isMobile={isMobile}
          onClick={
            (kpi_cards?.assessment_coverage?.evidence_count ?? 0) > 0
              ? () => setSelectedEvidence({
                  type: "unassessed_assessments",
                  title: "Unassessed Equipment",
                  data: evidence_drill_down?.unassessed_assessments || [],
                })
              : undefined
          }
        />
        <KPICard
          title="Active Exposure"
          kpi={kpi_cards?.active_threat_exposure}
          icon={AlertTriangle}
          colorClass="border-l-4 border-l-orange-500"
          isMobile={isMobile}
          onClick={() => setSelectedEvidence({
            type: "active_threat_exposure",
            title: "Uncontrolled Active Exposure",
            data: evidence_drill_down?.active_threat_exposure || []
          })}
        />
        <KPICard
          title="Controlled Exposure"
          kpi={kpi_cards?.critical_active_exposure}
          icon={ShieldCheck}
          colorClass="border-l-4 border-l-green-500"
          isMobile={isMobile}
          onClick={() => setSelectedEvidence({
            type: "critical_active_exposure",
            title: "Controlled Exposure Evidence",
            data: evidence_drill_down?.critical_active_exposure || []
          })}
        />
        <KPICard
          title="Resolved Exposure"
          kpi={kpi_cards?.resolved_exposure}
          icon={CircleCheck}
          colorClass="border-l-4 border-l-indigo-500"
          isMobile={isMobile}
          onClick={() => setSelectedEvidence({
            type: "resolved_exposure",
            title: "Resolved Exposure Evidence",
            data: evidence_drill_down?.resolved_exposure || []
          })}
        />
        <KPICard
          title="PM Compliance"
          kpi={kpi_cards?.pm_compliance}
          icon={CheckCircle2}
          colorClass="border-l-4 border-l-blue-500"
          isMobile={isMobile}
        />
        <KPICard
          title="Digital Execution"
          kpi={kpi_cards?.digital_execution_rate}
          icon={Activity}
          colorClass="border-l-4 border-l-purple-500"
          isMobile={isMobile}
        />
      </div>

      {/* Waterfall Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-2 sm:mb-4 flex items-center gap-2">
          <span>Exposure Waterfall</span>
          {!isMobile && (
            <HoverCard>
              <HoverCardTrigger>
                <Info className="w-4 h-4 text-slate-400 cursor-help" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <p className="text-sm text-slate-600">
                  Shows the flow from total assessed exposure to uncontrolled, controlled, and resolved observation exposure.
                  Resolved exposure is production impact from observations marked Mitigated.
                </p>
              </HoverCardContent>
            </HoverCard>
          )}
        </h3>
        {isMobile && (
          <p className="text-xs text-slate-500 mb-3">
            Flow from total assessed exposure to uncontrolled, controlled, and resolved observation exposure.
          </p>
        )}
        <WaterfallChart data={waterfall_data} currencySymbol={currencySymbol} isMobile={isMobile} />
        
        {/* Legend — desktop chart only */}
        {!isMobile && (
        <div className="flex flex-wrap gap-3 sm:gap-4 mt-4 justify-center">
          {waterfall_data?.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-600">{item.name}</span>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* AI Executive Summary */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">
              Executive Summary
            </h3>
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed whitespace-pre-line">
              {ai_summary}
            </p>
          </div>
        </div>
      </div>

      {/* Evidence Panel */}
      <EvidencePanel
        isOpen={!!selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
        title={selectedEvidence?.title}
        evidence={selectedEvidence?.data}
        evidenceType={selectedEvidence?.type}
      />
    </div>
  );
}
