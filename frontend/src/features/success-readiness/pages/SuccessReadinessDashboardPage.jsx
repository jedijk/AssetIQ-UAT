import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { KpiTable, ScoreDisplay } from "../components/SuccessReadinessShared";
import { SuccessReadinessSnowflakeChart } from "../components/SuccessReadinessSnowflake";

export default function SuccessReadinessDashboardPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["success-readiness", "dashboard"],
    queryFn: successReadinessAPI.getDashboard,
  });

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

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Overall readiness</p>
          <ScoreDisplay score={data?.overall_score} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => collectMutation.mutate()}
            disabled={collectMutation.isPending || isFetching}
          >
            <Database className={`w-4 h-4 mr-2 ${collectMutation.isPending ? "animate-pulse" : ""}`} />
            Collect measurements
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-1">Readiness snowflake</h2>
        <p className="text-sm text-slate-500 mb-4">
          All fifteen KPIs across People, Process, and Technology.
        </p>
        <SuccessReadinessSnowflakeChart kpis={data?.kpis} overallScore={data?.overall_score} />
      </div>

      {data?.generated_at && (
        <p className="text-xs text-slate-500">Last calculated: {new Date(data.generated_at).toLocaleString()}</p>
      )}

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
