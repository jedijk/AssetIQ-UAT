import React, { useState } from "react";
import { Badge } from "../../ui/badge";
import { useLanguage } from "../../../contexts/LanguageContext";
import { usePriorityConfig } from "./constants";
import { isMaintenanceImportTask } from "./taskSourceFilter";

export function GanttBar({ task, startDate, dayPx, totalDays, onClick, onReschedule }) {
  const { t } = useLanguage();
  const priorityConfigMap = usePriorityConfig();
  const [drag, setDrag] = useState(null);
  const isDisabledInProgram = task.disabled_in_program === true;
  const disabledLabel = t("maintenance.disabledInProgram") || "Disabled in program";

  const taskStart = task.planned_date || task.due_date;
  if (!taskStart) return null;

  const startIdx = Math.floor(
    (new Date(taskStart).getTime() - startDate.getTime()) / 86400000,
  );
  const durationDays = Math.max(1, Math.ceil((task.estimated_hours || 1) / 8));

  // Bars outside the visible window: skip render (cheap perf for long ranges)
  if (startIdx + durationDays < 0 || startIdx > totalDays) return null;

  const priorityCfg = priorityConfigMap[task.priority] || priorityConfigMap.medium;
  const isImported = isMaintenanceImportTask(task);

  let barColor = "bg-blue-500";
  if (isDisabledInProgram) barColor = "bg-slate-300";
  else if (task.is_overdue) barColor = "bg-red-500";
  else if (task.status === "completed") barColor = "bg-green-500";
  else if (task.status === "in_progress") barColor = "bg-amber-500";
  else if (task.status === "assigned") barColor = "bg-purple-500";
  else if (isImported) barColor = "bg-purple-500";

  const deltaDays = drag?.deltaDays || 0;
  const visibleLeft = (startIdx + deltaDays) * dayPx;
  const visibleWidth = durationDays * dayPx;

  const handlePointerDown = (e) => {
    e.stopPropagation();
    if (isDisabledInProgram) {
      onClick?.();
      return;
    }
    e.preventDefault();
    const startX = e.clientX;
    setDrag({ startX, deltaDays: 0 });

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dd = Math.round(dx / dayPx);
      setDrag({ startX, deltaDays: dd });
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const dx = ev.clientX - startX;
      const dd = Math.round(dx / dayPx);
      setDrag(null);
      if (dd !== 0 && onReschedule) {
        const newDate = new Date(new Date(taskStart).getTime() + dd * 86400000);
        const iso = newDate.toISOString().split("T")[0];
        onReschedule(task.id, iso);
      } else if (dd === 0) {
        onClick?.();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <div
        className={`absolute top-1.5 h-7 rounded-md ${barColor} ${
          isDisabledInProgram
            ? "opacity-60 cursor-not-allowed"
            : drag
              ? "opacity-70 cursor-grabbing ring-2 ring-blue-300"
              : "cursor-grab"
        } shadow-sm ${isDisabledInProgram ? "" : "hover:brightness-110"} transition-[filter,opacity] z-[1] flex items-center px-2 overflow-hidden`}
        style={{ left: visibleLeft, width: visibleWidth }}
        onPointerDown={handlePointerDown}
        title={
          isDisabledInProgram
            ? `${task.task_name} · ${taskStart} · ${disabledLabel}`
            : `${task.task_name} · ${taskStart}${deltaDays !== 0 ? ` → ${new Date(new Date(taskStart).getTime() + deltaDays * 86400000).toISOString().split("T")[0]}` : ""} · ${task.estimated_hours}h`
        }
      >
        {dayPx >= 30 && (
          <Badge className={`ml-auto text-[9px] py-0 px-1 ${priorityCfg.color} pointer-events-none`}>
            {priorityCfg.label.charAt(0)}
          </Badge>
        )}
      </div>
      {drag && drag.deltaDays !== 0 && (
        <div
          className="absolute -top-3 text-[9px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded pointer-events-none z-20"
          style={{ left: visibleLeft }}
        >
          {drag.deltaDays > 0 ? `+${drag.deltaDays}` : drag.deltaDays}d
        </div>
      )}
    </>
  );
};
