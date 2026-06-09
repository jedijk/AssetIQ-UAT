import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  Gauge,
  Loader2,
} from "lucide-react";
import { rilDashboardAPI } from "../lib/apis/rilAPI";
import { queryKeys } from "../lib/queryKeys";

const KPICard = ({ icon: Icon, label, value, sub, color = "blue" }) => {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className="metric-card" data-testid={`exec-kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`metric-icon ${colorClasses[color] || colorClasses.blue}`}>
        <Icon size={18} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
};

const MobileExecutiveKPIs = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.mobile.executiveKpis(),
    queryFn: () => rilDashboardAPI.getExecutive(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="exec-kpi-strip loading" data-testid="mobile-exec-kpis-loading">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto" />
      </div>
    );
  }

  if (isError || !data) {
    return null;
  }

  const overdueTotal = data.overdue_pm?.total ?? 0;
  const mtbfDays = data.mtbf_proxy?.fleet_mean_days;

  return (
    <section className="exec-kpi-strip" data-testid="mobile-exec-kpis">
      <h3 className="exec-kpi-title">Executive KPIs</h3>
      <div className="exec-kpi-grid">
        <KPICard
          icon={Gauge}
          label="Reliability"
          value={data.reliability_score ?? "—"}
          sub="Score / 100"
          color="green"
        />
        <KPICard
          icon={ClipboardCheck}
          label="Overdue PM"
          value={overdueTotal}
          sub={`${data.overdue_pm?.scheduled_tasks ?? 0} sched · ${data.overdue_pm?.task_instances ?? 0} inst`}
          color={overdueTotal > 0 ? "amber" : "green"}
        />
        <KPICard
          icon={AlertTriangle}
          label="High-risk threats"
          value={data.high_risk_threats ?? 0}
          sub={`${data.open_threats ?? 0} open`}
          color={(data.high_risk_threats ?? 0) > 0 ? "red" : "blue"}
        />
        <KPICard
          icon={Activity}
          label="MTBF proxy"
          value={mtbfDays != null ? `${mtbfDays}d` : "—"}
          sub={`${data.mtbf_proxy?.sample_equipment_count ?? 0} assets · 90d`}
          color="blue"
        />
      </div>

      <style>{`
        .exec-kpi-strip {
          padding: 12px 16px 4px;
          background: #fff;
          border-bottom: 1px solid #e2e8f0;
        }
        .exec-kpi-strip.loading {
          padding: 20px;
          text-align: center;
        }
        .exec-kpi-title {
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          margin: 0 0 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .exec-kpi-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .exec-kpi-grid .metric-card {
          padding: 12px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .exec-kpi-grid .metric-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }
        .exec-kpi-grid .metric-value {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
        }
        .exec-kpi-grid .metric-label {
          font-size: 11px;
          color: #64748b;
          margin-top: 2px;
        }
      `}</style>
    </section>
  );
};

export default MobileExecutiveKPIs;
