import React from "react";
import { GanttBar } from "./GanttBar";

export function GanttRow({ rowKey, taskName, occurrences, startDate, dayPx, totalDays, onClick, onReschedule }) {
  return (
    <div
      className="h-10 border-b relative hover:bg-slate-50/50 transition-colors"
      style={{ width: totalDays * dayPx }}
      data-testid={`gantt-row-${rowKey}`}
    >
      {/* Background day grid */}
      {dayPx >= 16 && (
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: totalDays }).map((_, i) => {
            const d = new Date(startDate.getTime() + i * 86400000);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={i}
                className={`border-r ${isWeekend ? "bg-slate-50/60" : ""}`}
                style={{ width: dayPx }}
              />
            );
          })}
        </div>
      )}
      {occurrences.map((occ) => (
        <GanttBar
          key={occ.id}
          task={{ ...occ, task_name: taskName }}
          startDate={startDate}
          dayPx={dayPx}
          totalDays={totalDays}
          onClick={() => onClick?.(occ)}
          onReschedule={onReschedule}
        />
      ))}
    </div>
  );
};
