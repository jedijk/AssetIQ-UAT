/**
 * TaskCard Component
 * Displays a single task in the task list with priority, status, and actions
 */
import { format, isToday, isBefore, startOfDay, parseISO } from "date-fns";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  MapPin,
  Play,
  Eye,
  Trash2,
  Zap,
  Target,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { priorityColors, taskTypeIcons, sourceBadges } from "./taskConstants";

export const TaskCard = ({ task, onOpen, onQuickComplete, onDelete, t }) => {
  const isOverdue = task.status === "overdue" || (task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())));
  const isDueToday = task.due_date && isToday(parseISO(task.due_date));
  const isAction = task.source_type === "action";
  const isTask = task.source_type === "task";
  const canDelete = isTask && task.status === "in_progress";
  
  const TypeIcon = isAction 
    ? Zap
    : (taskTypeIcons[task.task_type] || taskTypeIcons.scheduled);

  const SourceIcon = sourceBadges[task.source_type]?.icon || Target;

  return (
    <div
      className={`bg-white rounded-xl border p-4 transition-all hover:shadow-md cursor-pointer ${
        isOverdue ? "border-red-200 bg-red-50/30" : isDueToday ? "border-amber-200 bg-amber-50/30" : "border-slate-200"
      }`}
      onClick={() => onOpen(task)}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isAction ? "bg-purple-100" : "bg-blue-100"
        }`}>
          <TypeIcon className={`h-5 w-5 ${isAction ? "text-purple-600" : "text-blue-600"}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900 truncate">{task.name || task.title}</h3>
              {task.equipment_name && (
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {task.equipment_name}
                </p>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Source badge */}
            <Badge variant="outline" className={`text-xs ${sourceBadges[task.source_type]?.color || ""}`}>
              <SourceIcon className="w-3 h-3 mr-1" />
              {sourceBadges[task.source_type]?.label || task.source_type}
            </Badge>

            {/* Priority */}
            {task.priority && (
              <Badge className={`text-xs ${priorityColors[task.priority] || priorityColors.medium}`}>
                {task.priority}
              </Badge>
            )}

            {/* Due date */}
            {task.due_date && (
              <Badge variant="outline" className={`text-xs ${
                isOverdue ? "text-red-600 border-red-200" : isDueToday ? "text-amber-600 border-amber-200" : ""
              }`}>
                <Clock className="w-3 h-3 mr-1" />
                {isOverdue ? t?.("tasks.overdue") || "Overdue" : isDueToday ? t?.("tasks.dueToday") || "Due Today" : format(parseISO(task.due_date), "MMM d")}
              </Badge>
            )}

            {/* Status */}
            {task.status === "completed" && (
              <Badge className="text-xs bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {t?.("common.completed") || "Completed"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
        {task.status !== "completed" && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(task);
              }}
            >
              <Eye className="w-4 h-4 mr-1" />
              {t?.("common.view") || "View"}
            </Button>
            {!isAction && task.form_template_id && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(task);
                }}
              >
                <Play className="w-4 h-4 mr-1" />
                {t?.("tasks.execute") || "Execute"}
              </Button>
            )}
            {isAction && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickComplete?.(task);
                }}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {t?.("common.complete") || "Complete"}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(task);
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
