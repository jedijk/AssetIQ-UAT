import React from "react";
import { Badge } from "../../ui/badge";
import { usePriorityConfig } from "./constants";

export function PlannerTaskMini({ task, compact = false, onClick }) {
  const priorityConfigMap = usePriorityConfig();
  const priorityCfg = priorityConfigMap[task.priority] || priorityConfigMap.medium;
  return (
    <div
      className="p-1.5 bg-white border border-slate-100 rounded text-xs hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
      onClick={() => onClick?.(task)}
      data-testid={`planner-task-${task.id}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-medium text-[11px]">{task.task_name}</span>
        <div className="flex items-center gap-1 shrink-0">
          {task.task_source === "customer_imported" && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 bg-purple-50 text-purple-700 border-purple-200">
              PM
            </Badge>
          )}
          <Badge className={`text-[9px] px-1 py-0 ${priorityCfg.color}`}>
            {priorityCfg.label.charAt(0)}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
        <span className="truncate">{task.equipment_name}</span>
        {task.equipment_tag && (
          <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">
            {task.equipment_tag}
          </Badge>
        )}
        {!compact && (
          <span className="ml-auto whitespace-nowrap">{task.estimated_hours}h</span>
        )}
      </div>
    </div>
  );
};
