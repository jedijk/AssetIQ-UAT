/**
 * InvestigationCard Component
 * Displays a single investigation in the list
 */
import { format, parseISO } from "date-fns";
import {
  FileSearch,
  Calendar,
  Users,
  ChevronRight,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
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

const statusConfig = {
  draft: { color: "bg-slate-100 text-slate-700", icon: Clock, label: "Draft" },
  in_progress: { color: "bg-blue-100 text-blue-700", icon: FileSearch, label: "In Progress" },
  completed: { color: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Completed" },
  closed: { color: "bg-slate-100 text-slate-500", icon: CheckCircle2, label: "Closed" },
};

export const InvestigationCard = ({ investigation, onOpen, onEdit, onDelete, t }) => {
  const status = statusConfig[investigation.status] || statusConfig.draft;
  const StatusIcon = status.icon;

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer group"
      onClick={() => onOpen(investigation)}
      data-testid={`investigation-card-${investigation.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center flex-shrink-0">
            <FileSearch className="h-5 w-5 text-violet-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{investigation.title}</h3>
            <p className="text-sm text-slate-500 line-clamp-2">{investigation.description || "No description"}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(investigation); }}>
              <Eye className="w-4 h-4 mr-2" /> {t?.("common.view") || "View"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(investigation); }}>
              <Edit className="w-4 h-4 mr-2" /> {t?.("common.edit") || "Edit"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-red-600" 
              onClick={(e) => { e.stopPropagation(); onDelete(investigation); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> {t?.("common.delete") || "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-xs ${status.color}`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {status.label}
          </Badge>
          {investigation.event_count > 0 && (
            <Badge variant="outline" className="text-xs">
              {investigation.event_count} events
            </Badge>
          )}
          {investigation.cause_count > 0 && (
            <Badge variant="outline" className="text-xs">
              {investigation.cause_count} causes
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="w-3 h-3" />
          {investigation.created_at ? format(parseISO(investigation.created_at), "MMM d, yyyy") : "—"}
        </div>
      </div>

      {/* Linked threats/equipment */}
      {(investigation.threat_title || investigation.equipment_name) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
          {investigation.threat_title && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {investigation.threat_title}
            </Badge>
          )}
          {investigation.equipment_name && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {investigation.equipment_name}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};

export default InvestigationCard;
