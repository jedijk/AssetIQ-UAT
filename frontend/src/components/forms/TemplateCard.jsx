/**
 * TemplateCard Component
 * Displays a single form template - supports both card and compact list view
 */
import {
  FileText,
  Edit,
  Trash2,
  Eye,
  MoreVertical,
  Clock,
  CheckCircle2,
  Tag as LabelIcon,
  ChevronRight,
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
import { useLanguage } from "../../contexts/LanguageContext";
import { getDisciplineLabel, translateDiscipline } from "../../constants/disciplines";

// Compact list row variant
export const TemplateRow = ({ template, onEdit, onDelete, onView }) => {
  const { t } = useLanguage();
  const disciplineLabel = getDisciplineLabel(template.discipline);
  
  return (
    <div 
      className="bg-white border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer group flex items-center gap-3"
      onClick={() => onView(template)}
      data-testid={`template-row-${template.id}`}
    >
      {/* Icon */}
      <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
        <FileText className="h-4 w-4 text-indigo-600" />
      </div>
      
      {/* Name & Description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-slate-900 text-sm truncate">{template.name}</h3>
          {template.is_active ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">{template.description || t("forms.noDescription")}</p>
      </div>
      
      {/* Badges - hidden on mobile */}
      <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {translateDiscipline(t, template.discipline || disciplineLabel)}
        </Badge>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {t("forms.fieldCount", { count: template.fields?.length || 0 })}
        </Badge>
        <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-200">
          v{template.version || 1}
        </Badge>
        {template.label_print_config?.enabled && (
          <Badge className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 border-violet-200">
            <LabelIcon className="w-2.5 h-2.5 mr-0.5" /> {t("forms.print")}
          </Badge>
        )}
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(template); }}>
              <Eye className="w-4 h-4 mr-2" /> {t("common.view")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(template); }}>
              <Edit className="w-4 h-4 mr-2" /> {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-red-600" 
              onClick={(e) => { e.stopPropagation(); onDelete(template); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
};

// Original card variant
export const TemplateCard = ({ template, onEdit, onDelete, onView }) => {
  const { t } = useLanguage();
  const disciplineLabel = getDisciplineLabel(template.discipline);

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
            <p className="text-sm text-slate-500 line-clamp-2">{template.description || t("forms.noDescription")}</p>
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
              <Eye className="w-4 h-4 mr-2" /> {t("common.view")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(template); }}>
              <Edit className="w-4 h-4 mr-2" /> {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-red-600" 
              onClick={(e) => { e.stopPropagation(); onDelete(template); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {translateDiscipline(t, template.discipline || disciplineLabel)}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {t("forms.fieldCount", { count: template.fields?.length || 0 })}
          </Badge>
          <Badge className="text-xs bg-slate-100 text-slate-700 border-slate-200">
            v{template.version || 1}
          </Badge>
          {template.label_print_config?.enabled && (
            <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200">
              <LabelIcon className="w-3 h-3 mr-1" /> {t("forms.print")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {template.is_active ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> {t("common.active")}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3 h-3" /> {t("common.inactive")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateCard;
