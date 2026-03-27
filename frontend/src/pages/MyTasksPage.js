import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { format, isToday, isBefore, startOfDay, parseISO } from "date-fns";
import {
  Calendar as CalendarIcon,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Wrench,
  Repeat,
  Timer,
  Search,
  Filter,
  MapPin,
  Play,
  Check,
  X,
  Camera,
  Plus,
  Minus,
  FileText,
  ChevronDown,
  Loader2,
  ArrowLeft,
  Upload,
  Zap,
  Target,
  Eye,
  Users,
  Trash2,
  ChevronUp,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "../components/ui/sheet";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { Calendar } from "../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { cn } from "../lib/utils";
import { useIsMobile } from "../hooks/useIsMobile";

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

// API functions for My Tasks
const myTasksAPI = {
  getTasks: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.filter) queryParams.append("filter", params.filter);
    if (params.date) queryParams.append("date", params.date);
    if (params.status) queryParams.append("status", params.status);
    if (params.discipline) queryParams.append("discipline", params.discipline);
    
    const response = await fetch(`${API_BASE_URL}/api/my-tasks?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch tasks");
    return response.json();
  },
  
  getAdhocPlans: async () => {
    const response = await fetch(`${API_BASE_URL}/api/adhoc-plans`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch ad-hoc plans");
    return response.json();
  },
  
  executeAdhocPlan: async (planId) => {
    const response = await fetch(`${API_BASE_URL}/api/adhoc-plans/${planId}/execute`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to execute ad-hoc plan");
    return response.json();
  },
  
  getTaskDetail: async (taskId) => {
    const response = await fetch(`${API_BASE_URL}/api/my-tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch task details");
    return response.json();
  },
  
  startTask: async (taskId, isAction = false) => {
    const endpoint = isAction 
      ? `${API_BASE_URL}/api/my-tasks/action/${taskId}/start`
      : `${API_BASE_URL}/api/task-instances/${taskId}/start`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to start task");
    return response.json();
  },
  
  completeTask: async ({ taskId, data, isAction = false }) => {
    if (isAction) {
      // Complete action via the action endpoint
      const response = await fetch(`${API_BASE_URL}/api/my-tasks/action/${taskId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("Failed to complete action");
      return response.json();
    } else {
      // Complete task instance
      const response = await fetch(`${API_BASE_URL}/api/task-instances/${taskId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("Failed to complete task");
      return response.json();
    }
  },
  
  deleteTask: async (taskId) => {
    const response = await fetch(`${API_BASE_URL}/api/task-instances/${taskId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to delete task");
    return response.json();
  },
};

// Priority colors
const priorityColors = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

// Task type icons
const taskTypeIcons = {
  preventive: Wrench,
  corrective: AlertTriangle,
  inspection: Eye,
  predictive: Target,
  detective: Search,
};

// Source badges
const sourceBadges = {
  fmea: { label: "FMEA", color: "bg-purple-100 text-purple-700" },
  observation: { label: "Observation", color: "bg-blue-100 text-blue-700" },
  investigation: { label: "Investigation", color: "bg-indigo-100 text-indigo-700" },
  threat: { label: "Threat", color: "bg-orange-100 text-orange-700" },
  manual: { label: "Manual", color: "bg-slate-100 text-slate-700" },
  recurring: { label: "Recurring", color: "bg-emerald-100 text-emerald-700" },
};

// Task Card Component
const TaskCard = ({ task, onOpen, onQuickComplete, onDelete }) => {
  const isOverdue = task.status === "overdue" || (task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date())));
  const isDueToday = task.due_date && isToday(parseISO(task.due_date));
  const isAction = task.source_type === "action";
  const isTask = task.source_type === "task";
  const canDelete = isTask && task.status === "in_progress";
  const TypeIcon = isAction 
    ? (task.action_type === "PM" ? Wrench : task.action_type === "PDM" ? Target : AlertTriangle)
    : (taskTypeIcons[task.mitigation_strategy] || ClipboardList);
  
  return (
    <div
      className={cn(
        "bg-white rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md",
        isOverdue && "border-l-4 border-l-red-500 bg-red-50/30",
        isDueToday && !isOverdue && "border-l-4 border-l-blue-500",
        task.status === "in_progress" && "border-l-4 border-l-amber-500 bg-amber-50/30",
        isAction && !isOverdue && task.status !== "in_progress" && "border-l-4 border-l-indigo-400"
      )}
      onClick={() => onOpen(task)}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className={cn("w-4 h-4 flex-shrink-0", isAction ? "text-indigo-500" : "text-slate-500")} />
            <h3 className="font-medium text-slate-900 truncate">{task.title}</h3>
            {isAction && (
              <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                Action
              </Badge>
            )}
          </div>
          
          {/* Asset / Location */}
          <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{task.equipment_name || task.asset || (isAction ? "From " + (task.source || "observation") : "Unknown Asset")}</span>
          </div>
          
          {/* Tags Row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Priority Badge */}
            <Badge variant="outline" className={cn("text-xs", priorityColors[task.priority])}>
              {task.priority}
            </Badge>
            
            {/* Action Type (CM/PM/PDM) for actions */}
            {isAction && task.action_type && (
              <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                {task.action_type}
              </Badge>
            )}
            
            {/* Task Type / Discipline */}
            {!isAction && (
              <Badge variant="outline" className="text-xs bg-slate-50">
                {task.mitigation_strategy || task.type || "Task"}
              </Badge>
            )}
            
            {/* Discipline for actions */}
            {isAction && task.discipline && (
              <Badge variant="outline" className="text-xs bg-slate-50">
                {task.discipline}
              </Badge>
            )}
            
            {/* Recurring Indicator */}
            {task.is_recurring && (
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                <Repeat className="w-3 h-3 mr-1" />
                Recurring
              </Badge>
            )}
            
            {/* Source */}
            {task.source && sourceBadges[task.source] && (
              <Badge variant="outline" className={cn("text-xs", sourceBadges[task.source].color)}>
                {sourceBadges[task.source].label}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Right Side - Time & Actions */}
        <div className="flex flex-col items-end gap-2">
          {/* Due Time */}
          <div className={cn(
            "text-xs font-medium flex items-center gap-1",
            isOverdue ? "text-red-600" : "text-slate-500"
          )}>
            <Clock className="w-3.5 h-3.5" />
            {task.due_date ? format(parseISO(task.due_date), "HH:mm") : "No time"}
          </div>
          
          {/* Status Badge */}
          {task.status === "in_progress" && (
            <Badge className="bg-amber-500 text-white text-xs">In Progress</Badge>
          )}
          
          {/* Quick Complete Button */}
          {task.can_quick_complete && (
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

// Task Execution Dialog Component - Mobile Responsive
const TaskExecutionDialog = ({ task, open, onClose, onComplete }) => {
  const isMobile = useIsMobile();
  const [formData, setFormData] = useState({});
  const [issueFound, setIssueFound] = useState(false);
  const [issueDetails, setIssueDetails] = useState({ severity: "medium", description: "", photo: null });
  const [completionNotes, setCompletionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [showIssuePrompt, setShowIssuePrompt] = useState(false);
  const [issueAction, setIssueAction] = useState(null);
  const [expandedContext, setExpandedContext] = useState(!isMobile);
  
  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setFormData({});
      setIssueFound(false);
      setIssueDetails({ severity: "medium", description: "", photo: null });
      setCompletionNotes("");
      setValidationErrors({});
      setShowIssuePrompt(false);
      setIssueAction(null);
    }
  }, [task?.id]);
  
  // Build form fields from task template
  const formFields = task?.form_fields || task?.template?.form_fields || [];
  
  // Check if all required fields are filled
  const validateForm = () => {
    const errors = {};
    formFields.forEach(field => {
      const fieldType = field.type || field.field_type;
      if (field.required && !formData[field.id] && formData[field.id] !== false) {
        errors[field.id] = "This field is required";
      }
      // Check thresholds for numeric fields
      if (fieldType === "numeric" && formData[field.id]) {
        const value = parseFloat(formData[field.id]);
        const thresholds = field.thresholds || {};
        const minThreshold = field.min_threshold ?? thresholds.critical_low ?? thresholds.warning_low;
        const maxThreshold = field.max_threshold ?? thresholds.critical_high ?? thresholds.warning_high;
        
        if (minThreshold != null && value < minThreshold) {
          errors[field.id] = `Value below minimum threshold (${minThreshold})`;
        }
        if (maxThreshold != null && value > maxThreshold) {
          errors[field.id] = `Value exceeds maximum threshold (${maxThreshold})`;
        }
      }
    });
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Check if any numeric field exceeds threshold
  const checkThresholds = () => {
    let exceeded = false;
    formFields.forEach(field => {
      const fieldType = field.type || field.field_type;
      if (fieldType === "numeric" && formData[field.id]) {
        const value = parseFloat(formData[field.id]);
        const thresholds = field.thresholds || {};
        const minThreshold = field.min_threshold ?? thresholds.critical_low ?? thresholds.warning_low;
        const maxThreshold = field.max_threshold ?? thresholds.critical_high ?? thresholds.warning_high;
        
        if ((minThreshold != null && value < minThreshold) ||
            (maxThreshold != null && value > maxThreshold)) {
          exceeded = true;
        }
      }
    });
    if (exceeded && !issueFound) {
      setIssueFound(true);
    }
  };
  
  // Handle field value change
  const handleFieldChange = (fieldId, value) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    // Clear validation error for this field
    if (validationErrors[fieldId]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[fieldId];
        return updated;
      });
    }
  };
  
  // Handle numeric field with threshold check
  const handleNumericChange = (fieldId, value, field) => {
    handleFieldChange(fieldId, value);
    // Auto-set issue if threshold exceeded
    if (value && field.max_threshold && parseFloat(value) > field.max_threshold) {
      setIssueFound(true);
    }
    if (value && field.min_threshold && parseFloat(value) < field.min_threshold) {
      setIssueFound(true);
    }
  };
  
  // Handle checklist item toggle
  const handleChecklistToggle = (fieldId, itemIndex, items) => {
    const currentValues = formData[fieldId] || items.map(() => false);
    const newValues = [...currentValues];
    newValues[itemIndex] = !newValues[itemIndex];
    handleFieldChange(fieldId, newValues);
  };
  
  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    // If issue found, show decision prompt
    if (issueFound && !showIssuePrompt) {
      setShowIssuePrompt(true);
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onComplete({
        form_data: formData,
        completion_notes: completionNotes,
        issues_found: issueFound ? [issueDetails.description] : [],
        follow_up_required: issueAction === "create_task",
        follow_up_notes: issueAction === "create_task" ? issueDetails.description : null,
        issue_severity: issueFound ? issueDetails.severity : null,
        create_observation: issueAction === "log_observation" || issueAction === "create_task",
      });
      onClose();
    } catch (error) {
      toast.error(error.message || "Failed to complete task");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Render form field based on type - Mobile Optimized
  const renderField = (field) => {
    const hasError = validationErrors[field.id];
    const value = formData[field.id];
    
    // Handle both 'type' and 'field_type' from different sources
    const fieldType = field.type || field.field_type;
    
    // Handle thresholds - can be object or individual fields
    const thresholds = field.thresholds || {};
    const minThreshold = field.min_threshold ?? thresholds.critical_low ?? thresholds.warning_low;
    const maxThreshold = field.max_threshold ?? thresholds.critical_high ?? thresholds.warning_high;
    
    // Mobile-friendly input classes
    const mobileInputClass = isMobile ? "h-12 text-base" : "";
    const mobileLabelClass = isMobile ? "text-base mb-2" : "";
    const mobileTextareaRows = isMobile ? 4 : 3;
    
    switch (fieldType) {
      case "boolean":
        // Single checkbox/toggle for boolean fields - larger on mobile
        return (
          <div key={field.id} className="space-y-2">
            <div className={cn(
              "flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200",
              isMobile && "min-h-[60px]"
            )}>
              <Checkbox
                id={field.id}
                checked={value === true}
                onCheckedChange={(checked) => handleFieldChange(field.id, checked)}
                className={cn(isMobile && "h-6 w-6")}
              />
              <div className="flex-1">
                <label htmlFor={field.id} className={cn(
                  "font-medium cursor-pointer",
                  hasError && "text-red-600",
                  isMobile ? "text-base" : "text-sm"
                )}>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                {field.description && (
                  <p className={cn("text-slate-500 mt-0.5", isMobile ? "text-sm" : "text-xs")}>{field.description}</p>
                )}
              </div>
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "checklist":
        return (
          <div key={field.id} className="space-y-3">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className="space-y-2">
              {(field.items || []).map((item, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200",
                    isMobile && "min-h-[52px]"
                  )}
                >
                  <Checkbox
                    id={`${field.id}-${idx}`}
                    checked={value?.[idx] || false}
                    onCheckedChange={() => handleChecklistToggle(field.id, idx, field.items)}
                    className={cn(isMobile && "h-6 w-6")}
                  />
                  <label 
                    htmlFor={`${field.id}-${idx}`} 
                    className={cn("flex-1 cursor-pointer", isMobile ? "text-base" : "text-sm")}
                  >
                    {item}
                  </label>
                </div>
              ))}
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
        
      case "numeric":
        const isExceeded = value && (
          (maxThreshold != null && parseFloat(value) > maxThreshold) ||
          (minThreshold != null && parseFloat(value) < minThreshold)
        );
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn((hasError || isExceeded) && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
              {field.unit && <span className="text-slate-400 font-normal ml-1">({field.unit})</span>}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              value={value || ""}
              onChange={(e) => handleNumericChange(field.id, e.target.value, { ...field, min_threshold: minThreshold, max_threshold: maxThreshold })}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              className={cn(
                isExceeded && "border-red-500 bg-red-50",
                mobileInputClass
              )}
            />
            {(minThreshold != null || maxThreshold != null) && (
              <p className={cn("text-slate-500", isMobile ? "text-sm" : "text-xs")}>
                {minThreshold != null && maxThreshold != null 
                  ? `Range: ${minThreshold} - ${maxThreshold}` 
                  : minThreshold != null 
                    ? `Min: ${minThreshold}` 
                    : `Max: ${maxThreshold}`
                } {field.unit}
              </p>
            )}
            {isExceeded && (
              <p className="text-sm text-red-600 flex items-center gap-1 bg-red-50 p-2 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
                Value outside threshold - issue detected
              </p>
            )}
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
        
      case "text":
      case "textarea":
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <Textarea
              value={value || ""}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              rows={mobileTextareaRows}
              className={cn(isMobile && "text-base")}
            />
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
        
      case "select":
      case "multiple_choice":
        return (
          <div key={field.id} className="space-y-3">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className={cn(
              "grid gap-2",
              isMobile ? "grid-cols-1" : "flex flex-wrap"
            )}>
              {(field.options || ["Good", "Warning", "Bad"]).map((option) => {
                const optionValue = typeof option === 'object' ? option.value : option;
                const optionLabel = typeof option === 'object' ? option.label : option;
                return (
                  <Button
                    key={optionValue}
                    type="button"
                    variant={value === optionValue ? "default" : "outline"}
                    size={isMobile ? "lg" : "sm"}
                    onClick={() => handleFieldChange(field.id, optionValue)}
                    className={cn(
                      isMobile && "h-14 text-base justify-start px-4",
                      value === optionValue && optionLabel === "Good" && "bg-green-600 hover:bg-green-700",
                      value === optionValue && optionLabel === "Warning" && "bg-amber-500 hover:bg-amber-600",
                      value === optionValue && optionLabel === "Bad" && "bg-red-600 hover:bg-red-700"
                    )}
                  >
                    {value === optionValue && <Check className="w-4 h-4 mr-2" />}
                    {optionLabel}
                  </Button>
                );
              })}
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
        
      case "photo":
      case "file":
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className={cn(
              "border-2 border-dashed border-slate-300 rounded-xl text-center",
              isMobile ? "p-6" : "p-4"
            )}>
              {value ? (
                <div className="space-y-3">
                  <img src={value} alt="Uploaded" className="max-h-40 mx-auto rounded-lg" />
                  <Button
                    variant="outline"
                    size={isMobile ? "lg" : "sm"}
                    onClick={() => handleFieldChange(field.id, null)}
                    className={cn(isMobile && "h-12 text-base")}
                  >
                    <X className="w-4 h-4 mr-2" /> Remove
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => handleFieldChange(field.id, e.target?.result);
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <div className={cn("py-6", isMobile && "py-8")}>
                    <Camera className={cn("mx-auto text-slate-400 mb-3", isMobile ? "w-12 h-12" : "w-8 h-8")} />
                    <p className={cn("text-slate-600 font-medium", isMobile ? "text-base" : "text-sm")}>
                      {isMobile ? "Tap to take photo" : "Tap to add photo"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">or choose from gallery</p>
                  </div>
                </label>
              )}
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
        
      default:
        // Default to text input for unknown types
        return (
          <div key={field.id} className="space-y-2">
            <Label className={mobileLabelClass}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <Input
              value={value || ""}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              className={mobileInputClass}
            />
          </div>
        );
    }
  };
  
  if (!task) return null;
  
  // Issue Decision Prompt - Mobile Optimized
  if (showIssuePrompt) {
    const IssuePromptContent = (
      <>
        <div className={cn("space-y-4", isMobile && "pb-20")}>
          {!isMobile && (
            <p className="text-sm text-slate-600">
              An issue was found during task execution. What would you like to do?
            </p>
          )}
          
          <div className="space-y-3">
            <Button
              variant={issueAction === "create_task" ? "default" : "outline"}
              className={cn("w-full justify-start h-auto", isMobile ? "py-4 px-4" : "py-3")}
              onClick={() => setIssueAction("create_task")}
            >
              <div className="text-left">
                <div className={cn("font-medium flex items-center gap-2", isMobile && "text-base")}>
                  <Plus className="w-4 h-4" />
                  Create follow-up task
                </div>
                <p className={cn("text-muted-foreground font-normal mt-1", isMobile ? "text-sm" : "text-xs")}>
                  Create a corrective task and log observation
                </p>
              </div>
            </Button>
            
            <Button
              variant={issueAction === "log_observation" ? "default" : "outline"}
              className={cn("w-full justify-start h-auto", isMobile ? "py-4 px-4" : "py-3")}
              onClick={() => setIssueAction("log_observation")}
            >
              <div className="text-left">
                <div className={cn("font-medium flex items-center gap-2", isMobile && "text-base")}>
                  <FileText className="w-4 h-4" />
                  Log observation only
                </div>
                <p className={cn("text-muted-foreground font-normal mt-1", isMobile ? "text-sm" : "text-xs")}>
                  Record the issue without creating a task
                </p>
              </div>
            </Button>
            
            <Button
              variant={issueAction === "ignore" ? "default" : "outline"}
              className={cn("w-full justify-start h-auto", isMobile ? "py-4 px-4" : "py-3")}
              onClick={() => setIssueAction("ignore")}
            >
              <div className="text-left">
                <div className={cn("font-medium flex items-center gap-2", isMobile && "text-base")}>
                  <X className="w-4 h-4" />
                  Ignore
                </div>
                <p className={cn("text-muted-foreground font-normal mt-1", isMobile ? "text-sm" : "text-xs")}>
                  Complete without logging the issue
                </p>
              </div>
            </Button>
          </div>
          
          {/* Issue Details */}
          {(issueAction === "create_task" || issueAction === "log_observation") && (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <Label className={isMobile ? "text-base" : ""}>Severity</Label>
                <Select
                  value={issueDetails.severity}
                  onValueChange={(v) => setIssueDetails(prev => ({ ...prev, severity: v }))}
                >
                  <SelectTrigger className={isMobile ? "h-12 text-base" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className={isMobile ? "text-base" : ""}>
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  value={issueDetails.description}
                  onChange={(e) => setIssueDetails(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the issue..."
                  rows={isMobile ? 4 : 3}
                  className={isMobile ? "text-base" : ""}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Footer Actions */}
        <div className={cn(
          "flex gap-3",
          isMobile ? "fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200" : "mt-6"
        )}>
          <Button 
            variant="outline" 
            onClick={() => setShowIssuePrompt(false)}
            className={cn("flex-1", isMobile && "h-12 text-base")}
          >
            Back
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || ((issueAction === "create_task" || issueAction === "log_observation") && !issueDetails.description)}
            className={cn("flex-1", isMobile && "h-12 text-base")}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Complete Task
          </Button>
        </div>
      </>
    );
    
    if (isMobile) {
      return (
        <Sheet open={open} onOpenChange={onClose}>
          <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl overflow-y-auto p-6">
            <SheetHeader className="text-left mb-4">
              <SheetTitle className="flex items-center gap-2 text-amber-600 text-xl">
                <AlertTriangle className="w-6 h-6" />
                Issue Detected
              </SheetTitle>
              <SheetDescription>
                An issue was found during task execution. What would you like to do?
              </SheetDescription>
            </SheetHeader>
            {IssuePromptContent}
          </SheetContent>
        </Sheet>
      );
    }
    
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Issue Detected
            </DialogTitle>
            <DialogDescription>
              An issue was found during task execution. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          {IssuePromptContent}
        </DialogContent>
      </Dialog>
    );
  }
  
  // Main Task Execution Form Content
  const TaskFormContent = (
    <>
      {/* Context Block - Collapsible on mobile */}
      <div className={cn(
        "bg-slate-50 rounded-xl border border-slate-200",
        isMobile ? "p-4" : "p-3"
      )}>
        {isMobile ? (
          <button 
            className="w-full flex items-center justify-between"
            onClick={() => setExpandedContext(!expandedContext)}
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-500" />
              <span className="font-medium text-slate-700">{task.equipment_name || task.asset}</span>
            </div>
            {expandedContext ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
        ) : (
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Asset / Location</span>
            <span className="font-medium">{task.equipment_name || task.asset}</span>
          </div>
        )}
        
        {(expandedContext || !isMobile) && (
          <div className={cn("space-y-2", isMobile ? "mt-4 pt-4 border-t border-slate-200 text-sm" : "text-sm mt-2")}>
            {task.last_completed && (
              <div className="flex justify-between">
                <span className="text-slate-500">Last completed</span>
                <span>{format(parseISO(task.last_completed), "MMM d, yyyy")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Task type</span>
              <span className="capitalize">{task.mitigation_strategy || task.type}</span>
            </div>
            {task.frequency && (
              <div className="flex justify-between">
                <span className="text-slate-500">Frequency</span>
                <span>{task.frequency}</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Form Fields */}
      <div className={cn("space-y-5", isMobile && "pb-28")}>
        {formFields.length > 0 ? (
          <>
            <h4 className={cn("font-semibold text-slate-900", isMobile ? "text-lg" : "text-base")}>
              Execution Form
            </h4>
            {formFields.map(renderField)}
          </>
        ) : (
          <div className="space-y-3">
            <Label className={isMobile ? "text-base" : ""}>Completion Notes</Label>
            <Textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Enter any notes about the task execution..."
              rows={isMobile ? 5 : 4}
              className={isMobile ? "text-base" : ""}
            />
          </div>
        )}
        
        {/* Issue Toggle - More touch-friendly on mobile */}
        <div className={cn(
          "flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200",
          isMobile && "flex-col gap-4 items-stretch"
        )}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn("text-amber-600", isMobile ? "w-6 h-6" : "w-5 h-5")} />
            <span className={cn("font-medium text-amber-900", isMobile && "text-base")}>Issue Found?</span>
          </div>
          <div className={cn("flex gap-2", isMobile && "w-full")}>
            <Button
              variant={!issueFound ? "default" : "outline"}
              size={isMobile ? "lg" : "sm"}
              onClick={() => setIssueFound(false)}
              className={cn(
                !issueFound ? "bg-green-600 hover:bg-green-700" : "",
                isMobile && "flex-1 h-12 text-base"
              )}
            >
              <Check className="w-4 h-4 mr-1" /> No
            </Button>
            <Button
              variant={issueFound ? "default" : "outline"}
              size={isMobile ? "lg" : "sm"}
              onClick={() => setIssueFound(true)}
              className={cn(
                issueFound ? "bg-red-600 hover:bg-red-700" : "",
                isMobile && "flex-1 h-12 text-base"
              )}
            >
              <AlertCircle className="w-4 h-4 mr-1" /> Yes
            </Button>
          </div>
        </div>
      </div>
      
      {/* Footer Actions */}
      <div className={cn(
        "flex gap-3",
        isMobile ? "fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-lg" : "mt-6"
      )}>
        <Button 
          variant="outline" 
          onClick={onClose}
          className={cn("flex-1", isMobile && "h-12 text-base")}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={isSubmitting}
          className={cn("flex-1", isMobile && "h-12 text-base")}
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
          Complete Task
        </Button>
      </div>
    </>
  );
  
  // Render as Sheet on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent 
          side="bottom" 
          className="h-[95vh] rounded-t-2xl overflow-y-auto"
          data-testid="task-execution-sheet"
        >
          <SheetHeader className="text-left mb-4">
            <SheetTitle className="text-xl">{task.title}</SheetTitle>
            <SheetDescription>{task.equipment_name || task.asset}</SheetDescription>
          </SheetHeader>
          {TaskFormContent}
        </SheetContent>
      </Sheet>
    );
  }
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="task-execution-dialog">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>{task.equipment_name || task.asset}</DialogDescription>
        </DialogHeader>
        {TaskFormContent}
      </DialogContent>
    </Dialog>
  );
};

// Main My Tasks Page Component
const MyTasksPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState("open");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [selectedDiscipline, setSelectedDiscipline] = useState("");
  
  // Available disciplines for filtering
  const disciplines = [
    { value: "Mechanical", label: "Mechanical" },
    { value: "Electrical", label: "Electrical" },
    { value: "Instrumentation", label: "Instrumentation" },
    { value: "Operations", label: "Operations" },
    { value: "Process", label: "Process" },
    { value: "Safety", label: "Safety" },
    { value: "Reliability", label: "Reliability" },
  ];
  
  // Fetch tasks
  const { data: tasksData, isLoading: tasksLoading, error: tasksError } = useQuery({
    queryKey: ["my-tasks", activeFilter, selectedDate, selectedDiscipline],
    queryFn: () => myTasksAPI.getTasks({
      filter: activeFilter,
      date: activeFilter === "open" ? format(selectedDate, "yyyy-MM-dd") : undefined,
      discipline: selectedDiscipline || undefined,
    }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Complete task mutation
  const completeMutation = useMutation({
    mutationFn: myTasksAPI.completeTask,
    onSuccess: () => {
      toast.success("Task completed successfully!");
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-instances"] });
      setExecutionDialogOpen(false);
      setSelectedTask(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to complete task");
    },
  });
  
  // Start task mutation
  const startMutation = useMutation({
    mutationFn: ({ taskId, isAction }) => myTasksAPI.startTask(taskId, isAction),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      setSelectedTask(data);
    },
  });
  
  // Fetch ad-hoc plans (only when adhoc tab is active)
  const { data: adhocPlansData, isLoading: adhocPlansLoading } = useQuery({
    queryKey: ["adhoc-plans"],
    queryFn: () => myTasksAPI.getAdhocPlans(),
    enabled: activeFilter === "adhoc",
    refetchInterval: 30000,
  });
  
  // Execute ad-hoc plan mutation
  const executeAdhocMutation = useMutation({
    mutationFn: (planId) => myTasksAPI.executeAdhocPlan(planId),
    onSuccess: (newTask) => {
      toast.success("Task started! Redirecting to execution...");
      queryClient.invalidateQueries({ queryKey: ["adhoc-plans"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      // Open the new task for execution
      setSelectedTask(newTask);
      setExecutionDialogOpen(true);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to execute ad-hoc plan");
    },
  });
  
  // Delete task state and mutation
  const [deleteTaskId, setDeleteTaskId] = useState(null);
  const [deleteTaskName, setDeleteTaskName] = useState("");
  
  const deleteMutation = useMutation({
    mutationFn: (taskId) => myTasksAPI.deleteTask(taskId),
    onSuccess: () => {
      toast.success("Task deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-instances"] });
      setDeleteTaskId(null);
      setDeleteTaskName("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete task");
    },
  });
  
  // Handle delete task
  const handleDeleteTask = (task) => {
    setDeleteTaskId(task.id);
    setDeleteTaskName(task.title);
  };
  
  // Handle task open
  const handleOpenTask = async (task) => {
    setSelectedTask(task);
    const isAction = task.source_type === "action";
    // Start task if not already started
    if (task.status !== "in_progress") {
      startMutation.mutate({ taskId: task.id, isAction });
    }
    setExecutionDialogOpen(true);
  };
  
  // Handle quick complete
  const handleQuickComplete = async (task) => {
    const isAction = task.source_type === "action";
    completeMutation.mutate({
      taskId: task.id,
      isAction,
      data: {
        completion_notes: "Quick completed",
        issues_found: [],
        follow_up_required: false,
      }
    });
  };
  
  // Handle task completion
  const handleCompleteTask = async (data) => {
    if (!selectedTask) return;
    const isAction = selectedTask.source_type === "action";
    await completeMutation.mutateAsync({
      taskId: selectedTask.id,
      isAction,
      data,
    });
  };
  
  // Filter tasks based on search
  const tasks = tasksData?.tasks || [];
  const filteredTasks = tasks.filter(task => 
    !searchQuery || 
    task.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.equipment_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Sort tasks: Overdue -> High Priority -> Due Soon -> Others
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // Overdue first
    const aOverdue = a.status === "overdue" || (a.due_date && isBefore(parseISO(a.due_date), startOfDay(new Date())));
    const bOverdue = b.status === "overdue" || (b.due_date && isBefore(parseISO(b.due_date), startOfDay(new Date())));
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    
    // Then by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    
    // Then by due date
    if (a.due_date && b.due_date) {
      return new Date(a.due_date) - new Date(b.due_date);
    }
    
    return 0;
  });
  
  // Calculate stats
  const stats = {
    total: tasks.length,
    overdue: tasks.filter(t => t.status === "overdue").length,
    today: tasks.filter(t => t.due_date && isToday(parseISO(t.due_date))).length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    open: tasks.filter(t => t.source_type === "action" || (t.source_type === "task" && t.status === "in_progress")).length,
  };
  
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">My Tasks</h1>
        <p className="text-slate-500">Execute and complete your assigned tasks</p>
      </div>
      
      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Discipline/Role Filter */}
        <Select value={selectedDiscipline || "all"} onValueChange={(v) => setSelectedDiscipline(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="discipline-filter">
            <Users className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="All Disciplines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Disciplines</SelectItem>
            {disciplines.map((disc) => (
              <SelectItem key={disc.value} value={disc.value}>
                {disc.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Date Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full sm:w-[200px] justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
              data-testid="date-filter"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="task-search"
          />
        </div>
      </div>
      
      {/* Quick Filter Tabs */}
      <Tabs value={activeFilter} onValueChange={setActiveFilter} className="mb-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="open" className="flex items-center gap-1.5" data-testid="filter-open">
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">Open</span>
            {stats.today > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">{stats.today}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex items-center gap-1.5" data-testid="filter-overdue">
            <AlertCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Overdue</span>
            {stats.overdue > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">{stats.overdue}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="recurring" className="flex items-center gap-1.5" data-testid="filter-recurring">
            <Repeat className="w-4 h-4" />
            <span className="hidden sm:inline">Recurring</span>
          </TabsTrigger>
          <TabsTrigger value="adhoc" className="flex items-center gap-1.5" data-testid="filter-adhoc">
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Adhoc</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-slate-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-slate-900">{stats.total}</div>
          <div className="text-xs text-slate-500">Total</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-amber-600">{stats.inProgress}</div>
          <div className="text-xs text-slate-500">In Progress</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-red-600">{stats.overdue}</div>
          <div className="text-xs text-slate-500">Overdue</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-blue-600">{stats.open}</div>
          <div className="text-xs text-slate-500">Open</div>
        </div>
      </div>
      
      {/* Task List or Ad-hoc Plans */}
      <div className="space-y-3">
        {activeFilter === "adhoc" ? (
          // Ad-hoc Plans View
          adhocPlansLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500">Loading ad-hoc plans...</p>
            </div>
          ) : (adhocPlansData?.plans || []).length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <Zap className="w-12 h-12 mx-auto text-amber-400 mb-3" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No ad-hoc plans available</h3>
              <p className="text-slate-500 mb-4">Create ad-hoc task plans in the Task Planner</p>
              <Button variant="outline" onClick={() => setActiveFilter("today")}>
                View scheduled tasks
              </Button>
            </div>
          ) : (
            (adhocPlansData?.plans || []).map((plan) => (
              <div
                key={plan.id}
                className="bg-white rounded-lg border border-amber-200 p-4 hover:shadow-md transition-all"
                data-testid={`adhoc-plan-${plan.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 flex-shrink-0 text-amber-500" />
                      <h3 className="font-medium text-slate-900 truncate">{plan.title}</h3>
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        Ad-hoc
                      </Badge>
                    </div>
                    
                    {/* Equipment */}
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="truncate">{plan.equipment_name}</span>
                    </div>
                    
                    {/* Tags Row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {plan.discipline && (
                        <Badge variant="outline" className="text-xs bg-slate-50">
                          {plan.discipline}
                        </Badge>
                      )}
                      {plan.has_form && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          <FileText className="w-3 h-3 mr-1" />
                          Form
                        </Badge>
                      )}
                      {plan.execution_count > 0 && (
                        <span className="text-xs text-slate-400">
                          Executed {plan.execution_count}x
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Right Side - Execute Button */}
                  <div className="flex flex-col items-end gap-2">
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={() => executeAdhocMutation.mutate(plan.id)}
                      disabled={executeAdhocMutation.isPending}
                      data-testid={`execute-adhoc-${plan.id}`}
                    >
                      {executeAdhocMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Execute
                        </>
                      )}
                    </Button>
                    {plan.last_executed_at && (
                      <span className="text-xs text-slate-400">
                        Last: {format(parseISO(plan.last_executed_at), "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )
        ) : (
          // Regular Tasks View
          tasksLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500">Loading tasks...</p>
            </div>
          ) : tasksError ? (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
              <p className="text-red-600">Failed to load tasks</p>
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-400 mb-3" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No tasks for {activeFilter}</h3>
              <p className="text-slate-500 mb-4">You're all caught up!</p>
              <Button variant="outline" onClick={() => setActiveFilter("open")}>
                View open tasks
              </Button>
            </div>
          ) : (
            sortedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={handleOpenTask}
                onQuickComplete={handleQuickComplete}
                onDelete={handleDeleteTask}
              />
            ))
          )
        )}
      </div>
      
      {/* Task Execution Dialog */}
      <TaskExecutionDialog
        task={selectedTask}
        open={executionDialogOpen}
        onClose={() => {
          setExecutionDialogOpen(false);
          setSelectedTask(null);
        }}
        onComplete={handleCompleteTask}
      />
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTaskId} onOpenChange={(open) => !open && setDeleteTaskId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTaskName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setDeleteTaskId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteMutation.mutate(deleteTaskId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyTasksPage;
