import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, CalendarDays, CalendarRange, Loader2, Users } from "lucide-react";
import { Button } from "../../ui/button";
import { maintenanceSchedulerAPI } from "../../../lib/api";
import { DailyPlanner } from "./DailyPlanner";
import { WeeklyGrid } from "./WeeklyGrid";
import { FourteenDayGrid } from "./FourteenDayGrid";
import { NinetyDayGrid } from "./NinetyDayGrid";
import { useLanguage } from "../../../contexts/LanguageContext";

export function PlannerView({ equipmentTypeId, onTaskClick, filteredEquipmentIds }) {
  const { t } = useLanguage();
  const [horizon, setHorizon] = useState("daily"); // daily | weekly | "14" | "90"

  // Apply the Equipment Unit filter to a list of tasks. `filteredEquipmentIds`
  // is a Set<string> | null — null means no filter.
  const filterTasksByUnit = (list) => {
    if (!filteredEquipmentIds || !Array.isArray(list)) return list;
    return list.filter((t) => t && filteredEquipmentIds.has(t.equipment_id));
  };

  // ---- Daily uses dedicated endpoint (overdue / today / tomorrow buckets) ----
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ["maintenance-scheduler-daily-planner", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getDailyPlanner(),
    enabled: horizon === "daily",
    staleTime: 60_000,
  });

  // ---- Weekly uses dedicated endpoint (7-day grid with technicians) ----
  const { data: weeklyData, isLoading: weeklyLoading } = useQuery({
    queryKey: ["maintenance-scheduler-weekly-planner", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getWeeklyPlanner(),
    enabled: horizon === "weekly",
    staleTime: 60_000,
  });

  // ---- 14-day & 90-day use /tasks with from/to + frontend grouping ----
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const rangeDays = horizon === "14" ? 14 : horizon === "90" ? 90 : 0;
  const endDate = new Date(today.getTime() + rangeDays * 86400000)
    .toISOString()
    .split("T")[0];

  const { data: rangeData, isLoading: rangeLoading } = useQuery({
    queryKey: ["maintenance-scheduler-range", horizon, equipmentTypeId || "all"],
    queryFn: () =>
      maintenanceSchedulerAPI.getTasks({
        from_date: todayStr,
        to_date: endDate,
        ...(equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {}),
      }),
    enabled: horizon === "14" || horizon === "90",
    staleTime: 60_000,
  });

  // Technician capacity for the look-ahead views
  const { data: techData } = useQuery({
    queryKey: ["maintenance-scheduler-technicians"],
    queryFn: () => maintenanceSchedulerAPI.getTechnicians(),
  });

  const technicians = techData?.technicians || [];
  const totalDailyCapacityHours = technicians.reduce(
    (sum, t) => sum + (t.daily_available_hours || 8),
    0,
  );

  // ---- Group tasks by day for 14-day, by week for 90-day ----
  const groupedRange = useMemo(() => {
    if (!rangeData?.tasks) return [];
    const tasks = filterTasksByUnit(rangeData.tasks);

    if (horizon === "14") {
      // 14 daily buckets
      const buckets = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today.getTime() + i * 86400000);
        const iso = d.toISOString().split("T")[0];
        buckets.push({
          key: iso,
          label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
          date: iso,
          dayName: d.toLocaleDateString(undefined, { weekday: "short" }),
          tasks: [],
          hours: 0,
          capacityHours: totalDailyCapacityHours,
        });
      }
      const byDate = Object.fromEntries(buckets.map((b) => [b.key, b]));
      tasks.forEach((t) => {
        const d = t.planned_date || t.due_date;
        if (byDate[d]) {
          byDate[d].tasks.push(t);
          byDate[d].hours += t.estimated_hours || 1;
        }
      });
      return buckets;
    }

    if (horizon === "90") {
      // ~13 weekly buckets
      const buckets = [];
      const numWeeks = Math.ceil(90 / 7);
      for (let w = 0; w < numWeeks; w++) {
        const start = new Date(today.getTime() + w * 7 * 86400000);
        const end = new Date(start.getTime() + 6 * 86400000);
        const startIso = start.toISOString().split("T")[0];
        const endIso = end.toISOString().split("T")[0];
        buckets.push({
          key: startIso,
          label: `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
          startDate: startIso,
          endDate: endIso,
          tasks: [],
          hours: 0,
          capacityHours: totalDailyCapacityHours * 5, // assume 5 working days
        });
      }
      tasks.forEach((t) => {
        const d = t.planned_date || t.due_date;
        const bucket = buckets.find((b) => d >= b.startDate && d <= b.endDate);
        if (bucket) {
          bucket.tasks.push(t);
          bucket.hours += t.estimated_hours || 1;
        }
      });
      return buckets;
    }

    return [];
  }, [rangeData, horizon, totalDailyCapacityHours, filteredEquipmentIds]);

  // ---- Renderers ----
  const isLoading =
    (horizon === "daily" && dailyLoading) ||
    (horizon === "weekly" && weeklyLoading) ||
    ((horizon === "14" || horizon === "90") && rangeLoading);

  return (
    <div className="space-y-4">
      {/* Horizon selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "daily", label: t("maintenance.plannerHorizonDaily"), icon: CalendarDays },
          { key: "weekly", label: t("maintenance.plannerHorizonWeekly"), icon: CalendarRange },
          { key: "14", label: t("maintenance.plannerHorizon14"), icon: Calendar },
          { key: "90", label: t("maintenance.plannerHorizon90"), icon: Calendar },
        ].map((opt) => {
          const Icon = opt.icon;
          const isActive = horizon === opt.key;
          return (
            <Button
              key={opt.key}
              size="sm"
              variant={isActive ? "default" : "outline"}
              onClick={() => setHorizon(opt.key)}
              className="text-xs"
              data-testid={`planner-horizon-${opt.key}`}
            >
              <Icon className="w-3.5 h-3.5 mr-1.5" />
              {opt.label}
            </Button>
          );
        })}
        {technicians.length > 0 && (
          <div className="ml-auto text-xs text-slate-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {technicians.length}{" "}
            {technicians.length === 1
              ? t("maintenance.plannerTechSingular")
              : t("maintenance.plannerTechPlural")}{" "}
            · {totalDailyCapacityHours}
            {t("maintenance.plannerCapacityPerDay")}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {horizon === "daily" && (
            <DailyPlanner
              data={
                dailyData && filteredEquipmentIds
                  ? {
                      ...dailyData,
                      overdue: dailyData.overdue
                        ? { ...dailyData.overdue, tasks: filterTasksByUnit(dailyData.overdue.tasks || []) }
                        : dailyData.overdue,
                      today: dailyData.today
                        ? { ...dailyData.today, tasks: filterTasksByUnit(dailyData.today.tasks || []) }
                        : dailyData.today,
                      tomorrow: dailyData.tomorrow
                        ? { ...dailyData.tomorrow, tasks: filterTasksByUnit(dailyData.tomorrow.tasks || []) }
                        : dailyData.tomorrow,
                    }
                  : dailyData
              }
              onTaskClick={onTaskClick}
            />
          )}
          {horizon === "weekly" && (
            <WeeklyGrid
              days={
                filteredEquipmentIds
                  ? (weeklyData?.days || []).map((d) => ({
                      ...d,
                      tasks: filterTasksByUnit(d.tasks || []),
                      total_hours: (filterTasksByUnit(d.tasks || []) || []).reduce(
                        (sum, t) => sum + (t.estimated_hours || 1),
                        0,
                      ),
                    }))
                  : weeklyData?.days || []
              }
              capacityHours={totalDailyCapacityHours}
              onTaskClick={onTaskClick}
            />
          )}
          {horizon === "14" && (
            <FourteenDayGrid buckets={groupedRange} totalTasks={rangeData?.total || 0} />
          )}
          {horizon === "90" && (
            <NinetyDayGrid buckets={groupedRange} totalTasks={rangeData?.total || 0} />
          )}
        </>
      )}
    </div>
  );
}
