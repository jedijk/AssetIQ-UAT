/**
 * ActionCard Component
 * Displays a single action in the list
 */
import { format, parseISO, isPast } from "date-fns";
import {
  Zap,
  Calendar,
  User,
  ChevronRight,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const priorityConfig = {
  critical: { color: "bg-red-100 text-red-700 border-red-200", label: "Critical" },
  high: { color: "bg-orange-100 text-orange-700 border-orange-200", label: "High" },
  medium: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Medium" },
  low: { color: "bg-blue-100 text-blue-700 border-blue-200", label: "Low" },
};

const statusConfig = {
  open: { color: "bg-blue-100 text-blue-700", icon: Clock, label: "Open" },
  in_progress: { color: "bg-purple-100 text-purple-700", icon: Zap, label: "In Progress" },
  completed: { color: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Completed" },
  cancelled: { color: "bg-slate-100 text-slate-500", icon: null, label: "Cancelled" },
};

export const ActionCard = ({ action, onOpen, onEdit, onDelete, onComplete, t }) => {
  const priority = priorityConfig[action.priority] || priorityConfig.medium;
  const status = statusConfig[action.status] || statusConfig.open;
  const StatusIcon = status.icon;
  const isOverdue = action.due_date && isPast(parseISO(action.due_date)) && action.status !== "completed";

  return (
    <div
      className={`bg-white border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer group ${
        isOverdue ? "border-red-200 bg-red-50/30" : "border-slate-200"
      }`}
      onClick={() => onOpen(action)}
      data-testid={`action-card-${action.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-100 to-violet-100 flex items-center justify-center flex-shrink-0">
            <Zap className="h-5 w-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{action.title}</h3>
            <p className="text-sm text-slate-500 line-clamp-2">{action.description || "No description"}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(action); }}>
              <Edit className="w-4 h-4 mr-2" /> {t?.("common.edit") || "Edit"}
            </DropdownMenuItem>
            {action.status !== "completed" && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onComplete(action); }}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> {t?.("common.complete") || "Complete"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-red-600" 
              onClick={(e) => { e.stopPropagation(); onDelete(action); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> {t?.("common.delete") || "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-xs ${status.color}`}>
            {StatusIcon && <StatusIcon className="w-3 h-3 mr-1" />}
            {status.label}
          </Badge>
          <Badge className={`text-xs ${priority.color}`}>
            {priority.label}
          </Badge>
          {isOverdue && (
            <Badge className="text-xs bg-red-100 text-red-700">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Overdue
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {action.assignee_name && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {action.assignee_name}
            </span>
          )}
          {action.due_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(parseISO(action.due_date), "MMM d")}
            </span>
          )}
        </div>
      </div>

      {/* Linked threat */}
      {action.threat_title && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
            <Target className="w-3 h-3 mr-1" />
            {action.threat_title}
          </Badge>
        </div>
      )}
    </div>
  );
};

export default ActionCard;
