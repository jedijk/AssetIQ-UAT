/**
 * TemplateCard Component
 * Displays a single form template in the list
 */
import { useState } from "react";
import {
  FileText,
  Edit,
  Trash2,
  Eye,
  MoreVertical,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export const TemplateCard = ({ template, onEdit, onDelete, onView }) => {
  return (
    <div 
      className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer group"
      onClick={() => onView(template)}
      data-testid={`template-card-${template.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
            <FileText className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{template.name}</h3>
            <p className="text-sm text-slate-500 line-clamp-2">{template.description || "No description"}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(template); }}>
              <Eye className="w-4 h-4 mr-2" /> View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(template); }}>
              <Edit className="w-4 h-4 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-red-600" 
              onClick={(e) => { e.stopPropagation(); onDelete(template); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {template.discipline || "General"}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {template.fields?.length || 0} fields
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {template.is_active ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3 h-3" /> Inactive
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateCard;
