import { useQuery } from "@tanstack/react-query";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { PILLAR_LABELS, PILLAR_WEIGHTS } from "../config/nav";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { KpiTable, ScoreDisplay } from "../components/SuccessReadinessShared";

export default function SuccessReadinessPillarPage({ pillar }) {
  const label = PILLAR_LABELS[pillar] || pillar;

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ["success-readiness", "dashboard"],
    queryFn: successReadinessAPI.getDashboard,
  });

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ["success-readiness", "kpis", pillar],
    queryFn: () => successReadinessAPI.getKpis(pillar),
  });

  if (dashLoading || kpisLoading) return <SuccessReadinessLoading />;

  const pillarScore = dashboard?.pillars?.[pillar]?.score;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <p className="text-sm text-slate-500">{label} pillar · {PILLAR_WEIGHTS[pillar]}% of overall</p>
        <ScoreDisplay score={pillarScore} label={label} showMaturity />
      </div>
      <KpiTable kpis={kpis} />
    </div>
  );
}
