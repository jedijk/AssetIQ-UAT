import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { PILLAR_LABELS, PILLAR_WEIGHTS } from "../config/nav";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { KpiTable, PillarCard, ScoreDisplay } from "../components/SuccessReadinessShared";

export default function SuccessReadinessDashboardPage() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["success-readiness", "dashboard"],
    queryFn: successReadinessAPI.getDashboard,
  });

  if (isLoading) return <SuccessReadinessLoading />;

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        Failed to load dashboard.{" "}
        <Button variant="link" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const pillars = data?.pillars || {};

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Overall readiness</p>
          <ScoreDisplay score={data?.overall_score} />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(PILLAR_LABELS).map(([key, label]) => (
          <PillarCard
            key={key}
            title={label}
            weight={PILLAR_WEIGHTS[key]}
            score={pillars[key]?.score}
          />
        ))}
      </div>

      {data?.kpi_summary && (
        <div className="flex flex-wrap gap-3 text-sm text-slate-600">
          <span>{data.kpi_summary.on_track} on track</span>
          <span>{data.kpi_summary.at_risk} at risk</span>
          <span>{data.kpi_summary.off_track} off track</span>
          <span>{data.kpi_summary.not_started} not started</span>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">All KPIs</h2>
        <KpiTable kpis={data?.kpis} />
      </div>
    </div>
  );
}
