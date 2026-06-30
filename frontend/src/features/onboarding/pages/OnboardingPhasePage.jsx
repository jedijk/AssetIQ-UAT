import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { onboardingAPI } from "../../../lib/apis/onboarding";
import { getPhaseConfig } from "../config/phases";
import { OnboardingStepPage } from "../components/OnboardingStepPage";

export default function OnboardingPhasePage() {
  const { phaseId } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const phaseConfig = getPhaseConfig(phaseId);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["onboarding", "phase", phaseId],
    queryFn: () => onboardingAPI.getPhase(phaseId),
    enabled: isAdmin && Boolean(phaseId) && Boolean(phaseConfig),
  });

  if (!phaseConfig) {
    return <Navigate to="/settings/onboarding" replace />;
  }

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

  const showGoLiveComplete =
    phaseId === "go_live" && data?.validation?.status === "passed";

  return (
    <OnboardingStepPage
      phaseId={phaseId}
      phaseDetail={data}
      onRefresh={refetch}
      isRefreshing={isFetching}
      showGoLiveComplete={showGoLiveComplete}
    />
  );
}
