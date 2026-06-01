import React from "react";
import { Card, CardContent, CardHeader } from "../../ui/card";
import { ScrollArea } from "../../ui/scroll-area";
import { useLanguage } from "../../../contexts/LanguageContext";
import { PlannerTaskMini } from "./PlannerTaskMini";

export function WeeklyGrid({ days, capacityHours, onTaskClick }) {
  const { t } = useLanguage();
  if (!days?.length) {
    return <div className="text-center py-12 text-sm text-slate-500">{t("maintenance.noScheduledTasksThisWeek")}</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-2" data-testid="weekly-planner-grid">
      {days.map((d) => {
        const utilization = capacityHours > 0 ? Math.min(100, (d.total_hours / capacityHours) * 100) : 0;
        const isOver = d.total_hours > capacityHours && capacityHours > 0;
        return (
          <Card key={d.date} className="overflow-hidden">
            <CardHeader className="py-2 px-3 bg-slate-50">
              <div className="text-xs font-medium text-slate-700">{d.day_name.slice(0, 3)}</div>
              <div className="text-[10px] text-slate-400">{d.date.slice(5)}</div>
            </CardHeader>
            <CardContent className="p-2">
              <div className="text-xs font-semibold mb-1">
                {d.total_hours.toFixed(1)}h
                {capacityHours > 0 && <span className="text-slate-400 font-normal">/{capacityHours}h</span>}
              </div>
              {capacityHours > 0 && (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full ${isOver ? "bg-red-500" : utilization > 80 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${utilization}%` }}
                  />
                </div>
              )}
              <ScrollArea className="h-[200px]">
                <div className="space-y-1">
                  {d.tasks.length === 0 ? (
                    <p className="text-[10px] text-slate-300 text-center py-2">—</p>
                  ) : (
                    d.tasks.map((t) => (
                      <PlannerTaskMini key={t.id} task={t} compact onClick={onTaskClick} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
