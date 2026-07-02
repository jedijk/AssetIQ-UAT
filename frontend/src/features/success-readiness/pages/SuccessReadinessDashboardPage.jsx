import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cpu,
  Database,
  GitBranch,
  Info,
  LayoutGrid,
  Lightbulb,
  List,
  RefreshCw,
  Star,
  Users,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Progress } from "../../../components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SUCCESS_READINESS_BASE, PILLAR_LABELS } from "../config/nav";
import { getMaturityLevel, MATURITY_LEVELS } from "../config/maturityLevels";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { KpiTable, MaturityBadge } from "../components/SuccessReadinessShared";
import SuccessReadinessSnowflake, {
  PILLAR_BG_COLORS,
  PILLAR_DESCRIPTIONS,
  PILLAR_ORDER,
  PILLAR_SNOWFLAKE_COLORS,
  buildAllKpiDimensions,
} from "../components/SuccessReadinessSnowflake";

function pillarSectionId(pillar) {
  return `success-readiness-pillar-${pillar}`;
}

function scrollToPillarSection(pillar) {
  document.getElementById(pillarSectionId(pillar))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const PILLAR_ICONS = {
  people: Users,
  process: GitBranch,
  technology: Cpu,
};

function scoredKpis(kpis) {
  return (kpis || []).filter((kpi) => typeof kpi.score === "number");
}

function getHighlightKpi(kpis, direction) {
  const rows = scoredKpis(kpis);
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (direction === "high" ? b.score - a.score : a.score - b.score))[0];
}

function PillarScoreCard({ pillar, score, onNavigate }) {
  const Icon = PILLAR_ICONS[pillar];
  const color = PILLAR_SNOWFLAKE_COLORS[pillar];
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(pillar)}
      className={`w-full rounded-xl border border-slate-100 p-3 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer ${PILLAR_BG_COLORS[pillar]}`}
      style={{ "--tw-ring-color": color }}
      aria-label={`Go to ${PILLAR_LABELS[pillar]} KPIs`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm"
            style={{ color }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{PILLAR_LABELS[pillar]}</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">{PILLAR_DESCRIPTIONS[pillar]}</p>
          </div>
        </div>
        <p className="text-xl font-bold tabular-nums shrink-0" style={{ color }}>
          {score == null ? "—" : `${score}%`}
        </p>
      </div>
    </button>
  );
}

function SummaryPillarCard({ pillar, score, onNavigate }) {
  const Icon = PILLAR_ICONS[pillar];
  const color = PILLAR_SNOWFLAKE_COLORS[pillar];
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(pillar)}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left w-full transition-shadow hover:shadow-md hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer"
      style={{ "--tw-ring-color": color }}
      aria-label={`Go to ${PILLAR_LABELS[pillar]} KPIs`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{PILLAR_LABELS[pillar]}</p>
          <p className="text-lg font-bold tabular-nums" style={{ color }}>
            {score == null ? "—" : `${score}%`}
          </p>
        </div>
      </div>
      <Progress value={score ?? 0} className="h-2" />
    </button>
  );
}

function PillarKpiSections({ kpis, pillars }) {
  return (
    <div className="space-y-8">
      {PILLAR_ORDER.map((pillar) => {
        const pillarKpis = (kpis || []).filter((kpi) => kpi.pillar === pillar);
        const Icon = PILLAR_ICONS[pillar];
        const color = PILLAR_SNOWFLAKE_COLORS[pillar];
        const score = pillars[pillar]?.score;

        return (
          <section
            key={pillar}
            id={pillarSectionId(pillar)}
            aria-labelledby={`${pillarSectionId(pillar)}-heading`}
            className="scroll-mt-24"
          >
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${color}18`, color }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id={`${pillarSectionId(pillar)}-heading`}
                  className="text-lg font-semibold text-slate-900"
                >
                  {PILLAR_LABELS[pillar]}
                </h3>
                <p className="text-sm text-slate-500">{PILLAR_DESCRIPTIONS[pillar]}</p>
              </div>
              <p className="text-2xl font-bold tabular-nums" style={{ color }}>
                {score == null ? "—" : `${score}%`}
              </p>
            </div>
            <KpiTable kpis={pillarKpis} />
          </section>
        );
      })}
    </div>
  );
}

export default function SuccessReadinessDashboardPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState("snowflake");

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["success-readiness", "dashboard"],
    queryFn: successReadinessAPI.getDashboard,
    staleTime: 0,
    structuralSharing: false,
  });

  const refreshDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["success-readiness", "dashboard"] });
  }, [queryClient]);

  const collectMutation = useMutation({
    mutationFn: successReadinessAPI.collectMeasurements,
    onSuccess: (result) => {
      queryClient.setQueryData(["success-readiness", "dashboard"], result);
      toast.success(
        `Measurements collected (${result.collection?.history_records || 0} history records)`
      );
    },
    onError: () => toast.error("Failed to collect measurements"),
  });

  const maturity = useMemo(() => getMaturityLevel(data?.overall_score), [data?.overall_score]);
  const dimensions = useMemo(() => buildAllKpiDimensions(data?.kpis), [data?.kpis]);
  const topStrength = useMemo(() => getHighlightKpi(data?.kpis, "high"), [data?.kpis]);
  const biggestOpportunity = useMemo(() => getHighlightKpi(data?.kpis, "low"), [data?.kpis]);
  const pillars = data?.pillars || {};

  if (isLoading) return <SuccessReadinessLoading />;

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        Failed to load dashboard.{" "}
        <Button variant="link" onClick={() => refreshDashboard()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">Overall Readiness</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-5xl font-bold tabular-nums text-emerald-800">
              {data?.overall_score == null ? "—" : `${data.overall_score}%`}
            </p>
            <div className="flex items-center gap-1.5">
              <MaturityBadge score={data?.overall_score} className="text-sm px-3 py-1" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                    <Info className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72">
                  <p className="text-sm font-medium text-slate-900 mb-2">Maturity levels</p>
                  <div className="space-y-2">
                    {MATURITY_LEVELS.map((level) => (
                      <div key={level.id} className="text-xs text-slate-600">
                        {level.min != null ? (
                          <span className="font-medium text-slate-800">
                            {level.min}–{level.max}% {level.label}
                          </span>
                        ) : (
                          <span className="font-medium text-slate-800">{level.label}</span>
                        )}
                        <span className="block mt-0.5">{level.description}</span>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{maturity.description}</p>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => collectMutation.mutate()}
              disabled={collectMutation.isPending || isFetching}
            >
              <Database className={`w-4 h-4 mr-2 ${collectMutation.isPending ? "animate-pulse" : ""}`} />
              Collect measurements
            </Button>
            <Button variant="outline" onClick={() => refreshDashboard()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {data?.generated_at && (
            <p className="text-xs text-slate-400">
              Last updated: {new Date(data.generated_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 md:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Readiness Snowflake</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              All fifteen KPIs across People, Process, and Technology.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setViewMode("snowflake")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "snowflake"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Snowflake
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <List className="h-4 w-4" />
              List view
            </button>
          </div>
        </div>

        {viewMode === "snowflake" ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-0">
            <div className="p-4 md:p-6 border-b xl:border-b-0 xl:border-r border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
              <SuccessReadinessSnowflake
                dimensions={dimensions}
                centerScore={data?.overall_score}
              />
            </div>

            <div className="p-4 md:p-5 space-y-4 bg-slate-50/40">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">How is this score calculated?</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Each KPI is scored from 0–100. Your overall readiness is the weighted average across
                  all fifteen KPIs in People, Process, and Technology.
                </p>
              </div>

              <div className="space-y-2">
                {PILLAR_ORDER.map((pillar) => (
                  <PillarScoreCard
                    key={pillar}
                    pillar={pillar}
                    score={pillars[pillar]?.score}
                    onNavigate={scrollToPillarSection}
                  />
                ))}
              </div>

              <Link
                to={`${SUCCESS_READINESS_BASE}/ai-recommendations`}
                className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-sm text-sky-900 hover:bg-sky-100/80 transition-colors"
              >
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-sky-600" />
                <span>
                  <span className="font-semibold block">Improve your score</span>
                  <span className="text-xs text-sky-700 mt-0.5 block">
                    View AI recommendations and prioritized actions.
                  </span>
                </span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-4 md:p-6">
            <PillarKpiSections kpis={data?.kpis} pillars={pillars} />
          </div>
        )}
      </div>

      {viewMode === "snowflake" && (
        <PillarKpiSections kpis={data?.kpis} pillars={pillars} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {PILLAR_ORDER.map((pillar) => (
          <SummaryPillarCard
            key={pillar}
            pillar={pillar}
            score={pillars[pillar]?.score}
            onNavigate={scrollToPillarSection}
          />
        ))}

        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-slate-900">Top Strength</p>
          </div>
          {topStrength ? (
            <>
              <p className="text-sm font-medium text-slate-800">
                {topStrength.name} ({topStrength.score}%)
              </p>
              <p className="text-xs text-slate-600 mt-1">Keep up the good work!</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No scored KPIs yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-semibold text-slate-900">Biggest Opportunity</p>
          </div>
          {biggestOpportunity ? (
            <>
              <p className="text-sm font-medium text-slate-800">
                {biggestOpportunity.name} ({biggestOpportunity.score}%)
              </p>
              <p className="text-xs text-slate-600 mt-1">Focus here for the biggest impact.</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No scored KPIs yet.</p>
          )}
        </div>
      </div>

      {data?.kpi_summary && (
        <div className="flex flex-wrap gap-3 text-sm text-slate-600 px-1">
          <span>{data.kpi_summary.on_track} on track</span>
          <span>{data.kpi_summary.at_risk} at risk</span>
          <span>{data.kpi_summary.off_track} off track</span>
          <span>{data.kpi_summary.not_started} not started</span>
        </div>
      )}
    </div>
  );
}
