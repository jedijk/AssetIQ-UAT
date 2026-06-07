import React from "react";
import { Package, Trash2, TrendingUp, FlaskConical, Sigma, Clock } from "lucide-react";
import { KPICard, formatHoursMinutes } from "./productionDashboardShared";

const PRODUCTION_KPI_CALCULATIONS = {
  totalInput: "Sum of material input weights (kg) from production form submissions in the selected date range.",
  waste: "Sum of waste reporting weights (kg) in the selected range. Waste % = waste ÷ total input × 100.",
  yield: "Yield % = (total input − waste) ÷ total input × 100, compared to the configured target.",
  avgMooney: "Mean Mooney viscosity (MU) across viscosity samples in the selected range.",
  rsd: "Relative standard deviation of Mooney viscosity samples in the selected range.",
  runtime: "Total machine runtime hours aggregated from production submissions in the selected range.",
};

export function ProductionDashboardKPIs({ kpis }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3" data-testid="kpi-grid">
        <KPICard
          icon={Package}
          iconColor="bg-blue-50 text-blue-600"
          label="Total Input"
          value={kpis.total_input?.toLocaleString() || "0"}
          unit="kg"
          detail={kpis.lot_info || ""}
          detail2={`${kpis.sample_count || 0} samples`}
          calculation={PRODUCTION_KPI_CALCULATIONS.totalInput}
        />
        <KPICard
          icon={Trash2}
          iconColor="bg-red-50 text-red-500"
          label="Waste"
          value={kpis.waste?.toLocaleString() || "0"}
          unit="kg"
          detail={`${kpis.waste_pct || 0}% of input`}
          detail2={`${kpis.waste_reporting_count ?? 0} entries`}
          calculation={PRODUCTION_KPI_CALCULATIONS.waste}
        />
        <KPICard
          icon={TrendingUp}
          iconColor="bg-emerald-50 text-emerald-600"
          label="Yield"
          value={kpis.yield_pct || "0"}
          unit="%"
          detail={`Target: ${kpis.yield_target || 92}%`}
          calculation={PRODUCTION_KPI_CALCULATIONS.yield}
        />
        <KPICard
          icon={FlaskConical}
          iconColor="bg-purple-50 text-purple-600"
          label="Avg Mooney"
          value={kpis.avg_viscosity ?? "0"}
          unit="MU"
          detail={`Range: ${kpis.viscosity_range || "55-60"}`}
          detail2={`${kpis.viscosity_sample_count || 0} samples`}
          calculation={PRODUCTION_KPI_CALCULATIONS.avgMooney}
        />
        <KPICard
          icon={Sigma}
          iconColor="bg-amber-50 text-amber-600"
          label="RSD"
          value={kpis.rsd || "0"}
          unit="%"
          detail={`Target: < ${kpis.rsd_target || 7}`}
          calculation={PRODUCTION_KPI_CALCULATIONS.rsd}
        />
        <KPICard
          icon={Clock}
          iconColor="bg-slate-100 text-slate-600"
          label="Runtime"
          value={formatHoursMinutes(kpis.runtime_hours)}
          unit=""
          calculation={PRODUCTION_KPI_CALCULATIONS.runtime}
        />
      </div>
    </>
  );
}
