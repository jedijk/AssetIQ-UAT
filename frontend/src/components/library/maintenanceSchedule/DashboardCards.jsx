import React from "react";
import { ListChecks, AlertTriangle, Calendar, Target } from "lucide-react";
import { Card, CardContent } from "../../ui/card";
import KpiCalculationTooltip from "../../ui/KpiCalculationTooltip";
import { useLanguage } from "../../../contexts/LanguageContext";

function KpiCard({ calculation, children, className = "" }) {
  return (
    <KpiCalculationTooltip calculation={calculation}>
      <Card className={className}>{children}</Card>
    </KpiCalculationTooltip>
  );
}

export function DashboardCards({ dashboard, isLoading }) {
  const { t } = useLanguage();
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-8 bg-slate-200 rounded mb-2" />
              <div className="h-4 bg-slate-100 rounded w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const backlog = dashboard?.backlog || {};
  const compliance = dashboard?.compliance || {};
  const calculations = dashboard?.calculations || {};

  const complianceCalculation =
    calculations.compliance ||
    (compliance.total_completed === 0
      ? t("maintenance.complianceTooltipEmpty")
      : t("maintenance.complianceTooltipFormula")
          .replace("{onTime}", String(compliance.completed_on_time ?? 0))
          .replace("{total}", String(compliance.total_completed ?? 0))
          .replace("{rate}", String(compliance.rate ?? 100)));

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        calculation={calculations.open_tasks || t("maintenance.openTasksCalculation")}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t("maintenance.openTasks")}</p>
              <p className="text-2xl font-bold">{backlog.open_tasks || 0}</p>
            </div>
            <ListChecks className="w-8 h-8 text-blue-500" />
          </div>
        </CardContent>
      </KpiCard>

      <KpiCard
        calculation={calculations.overdue_tasks || t("maintenance.overdueTasksCalculation")}
        className={backlog.overdue_tasks > 0 ? "border-red-200 bg-red-50" : ""}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t("maintenance.overdue")}</p>
              <p className={`text-2xl font-bold ${backlog.overdue_tasks > 0 ? "text-red-600" : ""}`}>
                {backlog.overdue_tasks || 0}
              </p>
            </div>
            <AlertTriangle className={`w-8 h-8 ${backlog.overdue_tasks > 0 ? "text-red-500" : "text-slate-300"}`} />
          </div>
        </CardContent>
      </KpiCard>

      <KpiCard
        calculation={calculations.upcoming_tasks || t("maintenance.upcomingTasksCalculation")}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t("maintenance.upcoming7Days")}</p>
              <p className="text-2xl font-bold">{backlog.upcoming_tasks || 0}</p>
            </div>
            <Calendar className="w-8 h-8 text-amber-500" />
          </div>
        </CardContent>
      </KpiCard>

      <KpiCard calculation={complianceCalculation}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t("maintenance.compliance")}</p>
              <p className={`text-2xl font-bold ${compliance.rate >= 90 ? "text-green-600" : compliance.rate >= 70 ? "text-amber-600" : "text-red-600"}`}>
                {compliance.rate ?? 100}%
              </p>
            </div>
            <Target className="w-8 h-8 text-green-500" />
          </div>
        </CardContent>
      </KpiCard>
    </div>
  );
}
