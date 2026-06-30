import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import {
  Rocket,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { onboardingAPI } from "../../lib/apis/onboarding";
import { BuildMyPlantWizard } from "../components/BuildMyPlantWizard";
import { ONBOARDING_PHASES } from "../config/phases";

function ReadinessCard({ label, value, description }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value ?? 0}%</CardTitle>
      </CardHeader>
      {description && <CardContent className="text-xs text-slate-500 pt-0">{description}</CardContent>}
    </Card>
  );
}

export default function OnboardingWorkspacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["onboarding", "status"],
    queryFn: onboardingAPI.getStatus,
    enabled: isAdmin,
  });

  const selectPathMutation = useMutation({
    mutationFn: onboardingAPI.selectEntryPath,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      if (result?.start_phase) {
        navigate(`/settings/onboarding/phases/${result.start_phase}`);
      }
    },
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-slate-500">
        Onboarding Workspace is available to Owner and Admin users only.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">Failed to load onboarding status.</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const readiness = data?.readiness || {};
  const showWizard = !data?.entry_path;

  if (showWizard) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <BuildMyPlantWizard
          options={data?.entry_path_options}
          onSelect={(path) => selectPathMutation.mutate(path)}
          isLoading={selectPathMutation.isPending}
        />
        <div className="text-center mt-6">
          <Button variant="link" onClick={() => navigate("/settings/onboarding/phases/company")}>
            Skip wizard — start from Company setup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Welcome to AssetIQ</h1>
          </div>
          <p className="text-slate-600">Let&apos;s build your reliability system.</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-0">
        <CardContent className="pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-emerald-100 text-sm">Overall completion</p>
            <p className="text-4xl font-bold">{readiness.overall ?? 0}%</p>
          </div>
          <div className="flex items-center gap-2 text-emerald-50">
            <Clock className="w-5 h-5" />
            <span>~{data?.estimated_time_remaining_minutes ?? 0} min remaining</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ReadinessCard label="Reliability Readiness" value={readiness.reliability} />
        <ReadinessCard label="Maintenance Readiness" value={readiness.maintenance} />
        <ReadinessCard label="Data Quality" value={readiness.data_quality} />
        <ReadinessCard label="Go-Live Readiness" value={readiness.go_live} />
      </div>

      {(data?.outstanding_actions?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Outstanding actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.outstanding_actions.slice(0, 8).map((action, i) => (
              <button
                key={`${action.code}-${i}`}
                type="button"
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-left text-sm"
                onClick={() => navigate(`/settings/onboarding/phases/${action.phase}`)}
              >
                <span>
                  <Badge variant="outline" className="mr-2">{action.phase_label}</Badge>
                  {action.message}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Onboarding phases</CardTitle>
          <CardDescription>Continue where you left off</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ONBOARDING_PHASES.map((phase) => {
            const live = data?.phases?.find((p) => p.id === phase.id) || {};
            return (
              <button
                key={phase.id}
                type="button"
                onClick={() => navigate(`/settings/onboarding/phases/${phase.id}`)}
                className="p-4 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-left transition-colors"
              >
                <p className="font-medium text-slate-900">{phase.label}</p>
                <p className="text-sm text-slate-500 mt-1">{live.score ?? 0}% · {live.status || "pending"}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
