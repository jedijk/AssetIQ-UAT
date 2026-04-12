/**
 * TaskCard Component
 * Displays a single task/action item in a card format
 * Supports quick complete, delete, and click to open task details
 */
import { format, parseISO, isToday, isBefore, startOfDay } from "date-fns";
import { 
  Clock, 
  Check, 
  MapPin, 
  Trash2, 
  ClipboardList, 
  Wrench, 
  Target, 
  AlertTriangle 
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

// Priority color mapping
const priorityColors = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-green-100 text-green-800 border-green-300",
};

// Task type icon mapping
const taskTypeIcons = {
  inspection: ClipboardList,
  maintenance: Wrench,
  monitoring: Target,
  corrective: AlertTriangle,
};

const TaskCard = ({ task, onOpen, onQuickComplete, onDelete }) => {
  const isOverdue = task.status === "overdue" || (task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())));
  const isDueToday = task.due_date && isToday(parseISO(task.due_date));
  const isAction = task.source_type === "action";
  const isTask = task.source_type === "task";
  const isCompleted = task.status === "completed";
  
  // Allow deletion of: tasks with in_progress status OR any action that's not completed
  const canDelete = (isTask && task.status === "in_progress") || 
                    (isAction && task.status !== "completed");
                    
  const TypeIcon = isAction 
    ? (task.action_type === "PM" ? Wrench : task.action_type === "PDM" ? Target : AlertTriangle)
    : (taskTypeIcons[task.mitigation_strategy] || ClipboardList);
  
  return (
    <div
      className={cn(
        "bg-white rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md",
        isOverdue && !isCompleted && "border-l-4 border-l-red-500 bg-red-50/30",
        isDueToday && !isOverdue && !isCompleted && "border-l-4 border-l-blue-500",
        task.status === "in_progress" && "border-l-4 border-l-amber-500 bg-amber-50/30",
        isAction && !isOverdue && task.status !== "in_progress" && !isCompleted && "border-l-4 border-l-indigo-400",
        isCompleted && "border-l-4 border-l-green-500 bg-green-50/50 opacity-75"
      )}
      onClick={() => onOpen(task)}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className={cn(
              "w-4 h-4 flex-shrink-0", 
              isCompleted ? "text-green-500" : isAction ? "text-indigo-500" : "text-slate-500"
            )} />
            <h3 className={cn(
              "font-medium truncate",
              isCompleted ? "text-slate-500 line-through" : "text-slate-900"
            )}>
              {task.title}
            </h3>
            {/* Action badge - Desktop only */}
            {isAction && !isCompleted && (
              <Badge variant="outline" className="hidden sm:flex text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                Action
              </Badge>
            )}
            {/* Completed badge */}
            {isCompleted && (
              <Badge className="text-xs bg-green-100 text-green-700 border-green-300">
                <Check className="w-3 h-3 mr-1" />
                Completed
              </Badge>
            )}
          </div>
          
          {/* Asset / Location */}
          {task.equipment_tag && (
            <div className="text-xs text-slate-400 font-mono mb-1 ml-6">{task.equipment_tag}</div>
          )}
          <div className={cn(
            "flex items-center gap-1.5 text-sm mb-2",
            isCompleted ? "text-slate-400" : "text-slate-500"
          )}>
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{task.equipment_name || task.asset || (isAction ? "From " + (task.source || "observation") : "Unknown Asset")}</span>
          </div>
          
          {/* Tags Row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Priority Badge - Hide "medium" on mobile, always show high/critical */}
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs", 
                priorityColors[task.priority],
                task.priority === "medium" && "hidden sm:flex"
              )}
            >
              {task.priority}
            </Badge>
            
            {/* Action Type (CM/PM/PDM) for actions - Desktop only */}
            {isAction && task.action_type && (
              <Badge variant="outline" className="hidden sm:flex text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                {task.action_type}
              </Badge>
            )}
            
            {/* Task Type / Discipline - Desktop only */}
            {!isAction && (
              <Badge variant="outline" className="hidden sm:flex text-xs bg-slate-50">
                {task.mitigation_strategy || task.type || "Task"}
              </Badge>
            )}
            
            {/* Discipline for actions - Desktop only */}
            {isAction && task.discipline && (
              <Badge variant="outline" className="hidden sm:flex text-xs bg-slate-50">
                {task.discipline}
              </Badge>
            )}
            
            {/* Risk Score - Compact on mobile */}
            {(task.risk_score !== undefined && task.risk_score !== null) && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                <span className="hidden sm:inline">Risk: </span>{task.risk_score}
              </Badge>
            )}
            
            {/* RPN (Risk Priority Number) - Compact on mobile */}
            {(task.rpn !== undefined && task.rpn !== null) && (
              <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 border-rose-200">
                <span className="hidden sm:inline">RPN: </span>{task.rpn}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Right Side - Time & Actions */}
        <div className="flex flex-col items-end gap-2">
          {/* Due Time or Completion Time */}
          <div className={cn(
            "text-xs font-medium flex items-center gap-1",
            isCompleted ? "text-green-600" : isOverdue ? "text-red-600" : "text-slate-500"
          )}>
            <Clock className="w-3.5 h-3.5" />
            {isCompleted && task.completed_at 
              ? format(parseISO(task.completed_at), "HH:mm")
              : task.due_date 
                ? format(parseISO(task.due_date), "HH:mm") 
                : "No time"
            }
          </div>
          
          {/* Status Badge */}
          {task.status === "in_progress" && (
            <Badge className="bg-amber-500 text-white text-xs">In Progress</Badge>
          )}
          
          {/* Quick Complete Button - Hide for completed */}
          {task.can_quick_complete && !isCompleted && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-green-600 hover:bg-green-50 border-green-200"
              onClick={(e) => {
                e.stopPropagation();
                onQuickComplete(task);
              }}
              data-testid={`quick-complete-${task.id}`}
            >
              <Check className="w-4 h-4" />
            </Button>
          )}
          
          {/* Delete Button for in-progress tasks */}
          {canDelete && onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task);
              }}
              data-testid={`delete-task-${task.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
export { TaskCard, priorityColors, taskTypeIcons };
