import React from "react";
import { Calendar, Clock, ListChecks, Loader2, Sparkles } from "lucide-react";
import { Badge } from "../../ui/badge";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useTaskStatusConfig, usePriorityConfig } from "./constants";

export function TaskListView({ tasks, isLoading, onTaskClick, onStatusChange }) {
  const { t } = useLanguage();
  const statusConfigMap = useTaskStatusConfig();
  const priorityConfigMap = usePriorityConfig();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <ListChecks className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">{t("maintenance.noTasksFound")}</p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const statusCfg = statusConfigMap[task.status] || statusConfigMap.draft;
        const priorityCfg = priorityConfigMap[task.priority] || priorityConfigMap.medium;
        const isOverdue = task.is_overdue || task.due_date < today;
        const StatusIcon = statusCfg.icon;

        return (
          <div
            key={task.id}
            className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md
              ${isOverdue && task.status !== "completed" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white hover:border-blue-200"}
            `}
            onClick={() => onTaskClick?.(task)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-lg ${statusCfg.color}`}>
                  <StatusIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{task.task_name}</span>
                    {isOverdue && task.status !== "completed" && (
                      <Badge className="text-[10px] bg-red-500 text-white">{t("maintenance.overdue")}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500">{task.equipment_name}</span>
                    {task.equipment_tag && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {task.equipment_tag}
                      </Badge>
                    )}
                    {task.task_source === "customer_imported" && (
                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                        PM Import
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {task.due_date}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {task.estimated_hours}h
                  </div>
                </div>
                <Badge className={`text-xs ${priorityCfg.color}`}>
                  {priorityCfg.label}
                </Badge>
              </div>
            </div>
            
            {task.ai_reasoning && (
              <div className="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">{task.ai_reasoning}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
