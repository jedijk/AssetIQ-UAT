import React, { useState, useMemo } from "react";
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { ScrollArea } from "../../ui/scroll-area";
import { useLanguage } from "../../../contexts/LanguageContext";
import { getISOWeek } from "./ganttUtils";
import { GanttRow } from "./GanttRow";
import {
  maintenanceTimelineRowKey,
  dedupeTimelineOccurrences,
} from "../../../lib/maintenanceTimelineUtils";
import { isMaintenanceImportTask } from "./taskSourceFilter";

export function TimelineView({ timeline, isLoading, onTaskClick, onTaskReschedule }) {
  const { t } = useLanguage();
  const [zoom, setZoom] = useState("week"); // "day" | "week" | "month"

  const ZOOM_CONFIG = useMemo(
    () => ({
      day:   { dayPx: 40, viewSpan: 30,  panDays: 7  },
      week:  { dayPx: 16, viewSpan: 84,  panDays: 28 },
      month: { dayPx: 6,  viewSpan: 365, panDays: 90 },
    }),
    [],
  );
  const { dayPx: DAY_PX, viewSpan: VIEW_SPAN, panDays: PAN_DAYS } = ZOOM_CONFIG[zoom];

  // viewStart drifts independently of task data — anchored to "today minus a bit"
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 7);
    return d;
  });

  // Group by equipment + normalized task name so duplicate programs for the same
  // logical task show multiple bars on ONE row.
  const rows = useMemo(() => {
    if (!timeline?.timeline) return [];
    const map = new Map();
    for (const equipment of timeline.timeline) {
      for (const t of equipment.tasks || []) {
        const key = maintenanceTimelineRowKey(equipment.equipment_id, t);
        if (!map.has(key)) {
          map.set(key, {
            id: key,
            task_name: t.task_name,
            equipment_id: equipment.equipment_id,
            _equipmentName: equipment.equipment_name,
            _equipmentTag: equipment.equipment_tag,
            _isImported: isMaintenanceImportTask(t),
            occurrences: [],
          });
        }
        const row = map.get(key);
        row._isImported = row._isImported || isMaintenanceImportTask(t);
        row._disabledInProgram =
          row._disabledInProgram || t.disabled_in_program === true;
        row.occurrences.push(t);
      }
    }
    // Dedupe merged occurrences; sort each row chronologically; sort rows by first occurrence
    const list = Array.from(map.values());
    for (const r of list) {
      r.occurrences = dedupeTimelineOccurrences(r.occurrences);
      r.occurrences.sort((a, b) =>
        (a.planned_date || a.due_date || "").localeCompare(
          b.planned_date || b.due_date || "",
        ),
      );
    }
    list.sort((a, b) => {
      const ao = a.occurrences[0]?.planned_date || a.occurrences[0]?.due_date || "";
      const bo = b.occurrences[0]?.planned_date || b.occurrences[0]?.due_date || "";
      return ao.localeCompare(bo);
    });
    return list;
  }, [timeline]);

  const startDate = viewStart;
  const endDate = useMemo(() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + VIEW_SPAN - 1);
    return d;
  }, [startDate, VIEW_SPAN]);
  const totalDays = VIEW_SPAN;

  const dayDelta = (d) =>
    Math.floor((new Date(d).getTime() - startDate.getTime()) / 86400000);

  // Header markers
  const headers = useMemo(() => {
    const months = [];
    const cur = new Date(startDate);
    let curMonth = -1;
    let monthAcc = { label: "", days: 0, key: "" };
    for (let i = 0; i < totalDays; i++) {
      const m = cur.getMonth();
      if (m !== curMonth) {
        if (monthAcc.days > 0) months.push(monthAcc);
        monthAcc = {
          label: cur.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
          days: 0,
          key: `${cur.getFullYear()}-${m}`,
        };
        curMonth = m;
      }
      monthAcc.days += 1;
      cur.setDate(cur.getDate() + 1);
    }
    if (monthAcc.days > 0) months.push(monthAcc);
    return { months };
  }, [startDate, totalDays]);

  const pan = (deltaDays) => {
    setViewStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + deltaDays);
      return next;
    });
  };
  const goToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 7);
    setViewStart(d);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (!timeline?.timeline || timeline.timeline.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">{t("maintenance.noScheduledTasks")}</p>
        <p className="text-sm text-slate-400 mt-1">{t("maintenance.runSchedulerHint")}</p>
      </div>
    );
  }

  const todayDelta = dayDelta(new Date());
  const gridWidth = totalDays * DAY_PX;
  const viewStartIso = startDate.toISOString().split("T")[0];
  const viewEndIso = endDate.toISOString().split("T")[0];

  return (
    <div className="space-y-3" data-testid="timeline-gantt">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 mr-2">{t("maintenance.zoom")}</span>
        {[
          { k: "day", label: t("maintenance.zoomDay") },
          { k: "week", label: t("maintenance.zoomWeek") },
          { k: "month", label: t("maintenance.zoomMonth") },
        ].map((opt) => (
          <Button
            key={opt.k}
            size="sm"
            variant={zoom === opt.k ? "default" : "outline"}
            onClick={() => setZoom(opt.k)}
            className="h-7 text-xs px-2.5"
            data-testid={`timeline-zoom-${opt.k}`}
          >
            {opt.label}
          </Button>
        ))}

        {/* Pan controls */}
        <div className="ml-2 flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => pan(-PAN_DAYS)}
            title={`${t("maintenance.panBackTitle")} ${PAN_DAYS} ${t("maintenance.daysSuffix")}`}
            data-testid="timeline-pan-prev"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={goToToday}
            data-testid="timeline-today"
          >
            {t("maintenance.todayNav")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => pan(PAN_DAYS)}
            title={`${t("maintenance.panForwardTitle")} ${PAN_DAYS} ${t("maintenance.daysSuffix")}`}
            data-testid="timeline-pan-next"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        <span className="text-xs text-slate-500 ml-2">
          {viewStartIso} → {viewEndIso}
        </span>
        <span className="ml-auto text-xs text-slate-500">
          {rows.length}{" "}
          {rows.length === 1 ? t("maintenance.timelineTaskOne") : t("maintenance.timelineTasksMany")}{" "}
          · {t("maintenance.dragToReschedule")}
        </span>
      </div>

      {/* Gantt chart */}
      <Card className="overflow-hidden">
        <div className="flex">
          {/* Left: sticky task names */}
          <div className="flex-shrink-0 w-64 border-r bg-slate-50">
            <div className="h-12 border-b flex items-center px-3 text-xs font-medium text-slate-600">
              {t("maintenance.taskEquipmentColumn")}
            </div>
            <div>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="h-10 border-b px-3 flex items-center text-xs cursor-pointer hover:bg-slate-100"
                  onClick={() => onTaskClick?.(r)}
                  data-testid={`gantt-row-label-${r.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`truncate font-medium ${r._disabledInProgram ? "text-slate-400" : "text-slate-900"}`}>
                      {r.task_name}
                    </div>
                    <div className="truncate text-[10px] text-slate-500 flex items-center gap-1">
                      <span className="truncate">
                        {r._equipmentName}
                        {r._equipmentTag && ` · ${r._equipmentTag}`}
                      </span>
                      {r._isImported && (
                        <Badge
                          variant="outline"
                          className="text-[8px] px-1 py-0 bg-purple-50 text-purple-700 border-purple-200 font-medium uppercase tracking-wide"
                          data-testid={`gantt-row-import-badge-${r.id}`}
                        >
                          Import
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: scrollable grid */}
          <ScrollArea className="flex-1">
            <div style={{ width: gridWidth, minWidth: "100%" }}>
              {/* Header */}
              <div className="h-12 border-b relative">
                {/* Month strip */}
                <div className="flex h-6 border-b bg-slate-50">
                  {headers.months.map((m) => (
                    <div
                      key={m.key}
                      className="border-r text-[10px] flex items-center justify-center text-slate-700 font-medium overflow-hidden"
                      style={{ width: m.days * DAY_PX }}
                    >
                      {m.days * DAY_PX > 60 ? m.label : ""}
                    </div>
                  ))}
                </div>
                {/* Day/week strip */}
                <div className="flex h-6 relative">
                  {zoom === "day" &&
                    Array.from({ length: totalDays }).map((_, i) => {
                      const d = new Date(startDate.getTime() + i * 86400000);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div
                          key={i}
                          className={`border-r text-[10px] flex items-center justify-center ${
                            isWeekend ? "bg-slate-100 text-slate-400" : "text-slate-600"
                          }`}
                          style={{ width: DAY_PX }}
                        >
                          {d.getDate()}
                        </div>
                      );
                    })}
                  {zoom === "week" && (
                    <>
                      {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, i) => (
                        <div
                          key={i}
                          className="border-r text-[10px] flex items-center justify-center text-slate-600"
                          style={{ width: DAY_PX * 7 }}
                        >
                          W{getISOWeek(new Date(startDate.getTime() + i * 7 * 86400000))}
                        </div>
                      ))}
                    </>
                  )}
                  {zoom === "month" && <div className="flex-1" />}
                </div>
              </div>

              {/* Task rows */}
              <div className="relative">
                {/* Today line */}
                {todayDelta >= 0 && todayDelta < totalDays && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400 pointer-events-none z-10"
                    style={{ left: todayDelta * DAY_PX + DAY_PX / 2 }}
                  >
                    <div className="absolute -top-5 -left-3 text-[9px] text-red-500 font-semibold">
                      {t("maintenance.timelineTodayMarker")}
                    </div>
                  </div>
                )}

                {rows.map((r) => (
                  <GanttRow
                    key={r.id}
                    rowKey={r.id}
                    taskName={r.task_name}
                    occurrences={r.occurrences}
                    startDate={startDate}
                    dayPx={DAY_PX}
                    totalDays={totalDays}
                    onClick={(occ) => onTaskClick?.(occ)}
                    onReschedule={onTaskReschedule}
                  />
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      </Card>
    </div>
  );
}
