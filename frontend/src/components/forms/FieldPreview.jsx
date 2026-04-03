/**
 * FieldPreview Component
 * Displays a preview of a form field with edit/delete options
 */
import { Edit, Trash2, GripVertical } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { FIELD_TYPES } from "./formConstants";

export const ThresholdBadge = ({ status }) => {
  const config = {
    normal: { color: "bg-emerald-100 text-emerald-700", label: "Normal" },
    warning: { color: "bg-amber-100 text-amber-700", label: "Warning" },
    critical: { color: "bg-red-100 text-red-700", label: "Critical" },
  };
  const c = config[status] || config.normal;
  return <span className={`text-xs px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span>;
};

export const FieldTypeIcon = ({ type }) => {
  const fieldType = FIELD_TYPES.find(f => f.value === type);
  if (!fieldType) return null;
  const Icon = fieldType.icon;
  return <Icon className="h-4 w-4 text-slate-400" />;
};

export const FieldPreview = ({ field, onEdit, onDelete, isDraggable = false }) => {
  // Support both field_type (frontend) and type (backend) for compatibility
  const fieldType = field.field_type || field.type;
  const thresholds = field.thresholds || {};
  
  return (
    <div 
      className="bg-white border border-slate-200 rounded-lg p-3 group hover:border-indigo-300 transition-colors"
      data-testid={`field-preview-${field.id}`}
    >
      <div className="flex items-start gap-2">
        {isDraggable && (
          <GripVertical className="h-4 w-4 text-slate-300 cursor-grab mt-1" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FieldTypeIcon type={fieldType} />
            <span className="font-medium text-slate-900 truncate">{field.label}</span>
            {field.required && (
              <Badge variant="destructive" className="text-xs">Required</Badge>
            )}
          </div>
          {field.description && (
            <p className="text-xs text-slate-500 mt-1 truncate">{field.description}</p>
          )}
          {fieldType === "numeric" && (thresholds.warning_low || thresholds.warning_high || thresholds.critical_low || thresholds.critical_high) && (
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-slate-400">Thresholds:</span>
              {(thresholds.critical_low || thresholds.critical_high) && <ThresholdBadge status="critical" />}
              {(thresholds.warning_low || thresholds.warning_high) && <ThresholdBadge status="warning" />}
            </div>
          )}
          {(fieldType === "dropdown" || fieldType === "multi_select") && field.options?.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              <span className="text-xs text-slate-400">Options:</span>
              {field.options.slice(0, 3).map((opt, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {typeof opt === 'string' ? opt : opt.label || opt.value}
                </Badge>
              ))}
              {field.options.length > 3 && (
                <Badge variant="outline" className="text-xs">+{field.options.length - 3} more</Badge>
              )}
            </div>
          )}
          {fieldType === "equipment" && (
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-slate-400">Equipment levels:</span>
              {(field.equipment_levels || ["equipment"]).map((level, i) => (
                <Badge key={i} variant="outline" className="text-xs capitalize">{level}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onEdit(field); }}
            data-testid={`edit-field-${field.id}`}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-red-600 hover:text-red-700"
            onClick={(e) => { e.stopPropagation(); onDelete(field.id); }}
            data-testid={`delete-field-${field.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FieldPreview;
