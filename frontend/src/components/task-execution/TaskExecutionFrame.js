/**
 * TaskExecutionFrame Component
 * Extracted from MyTasksPage.js for better modularity
 * Handles task execution with form fields, attachments, and issue tracking
 */
import { getBackendUrl } from '../../lib/apiConfig';
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ChevronRight,
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
  Eye,
  Sparkles,
  ScanEye,
  Paperclip,
  Image,
  Building2,
  Download,
  ChevronUp,
  Signature,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { imageAnalysisAPI } from "../../lib/api";
import { DocumentViewer } from "../DocumentViewer";

const API_BASE_URL = getBackendUrl();

const TaskExecutionFrame = ({ task, onBack, onComplete }) => {
  const isMobile = useIsMobile();
  const [formData, setFormData] = useState({});
  const [completionNotes, setCompletionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [expandedContext, setExpandedContext] = useState(!isMobile);
  const [imageAnalysis, setImageAnalysis] = useState({});
  const [analyzingImage, setAnalyzingImage] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [equipmentSearch, setEquipmentSearch] = useState({});
  const [equipmentResults, setEquipmentResults] = useState({});
  const [searchingEquipment, setSearchingEquipment] = useState(null);
  const [viewingDocument, setViewingDocument] = useState(null);
  
  // Get form documents from task template - construct full URLs
  const rawFormDocuments = task?.form_documents || task?.template?.documents || task?.documents || [];
  const formDocuments = rawFormDocuments.map(doc => ({
    ...doc,
    url: doc.url?.startsWith('http') 
      ? doc.url 
      : `${API_BASE_URL}/api/form-documents/${doc.url || doc.storage_path}`
  }));
  
  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setFormData({});
      setCompletionNotes("");
      setValidationErrors({});
      setImageAnalysis({});
      setAnalyzingImage(null);
      setAttachments([]);
      setUploadingAttachment(false);
      setViewingDocument(null);
    }
  }, [task?.id]);
  
  // Build form fields from task template
  const formFields = task?.form_fields || task?.template?.form_fields || [];
  
  // Search equipment by name
  const searchEquipment = async (fieldId, query) => {
    if (!query || query.length < 2) {
      setEquipmentResults(prev => ({ ...prev, [fieldId]: [] }));
      return;
    }
    
    setSearchingEquipment(fieldId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/equipment-hierarchy/search?q=${encodeURIComponent(query)}&limit=10`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setEquipmentResults(prev => ({ ...prev, [fieldId]: data.results || data.nodes || [] }));
      }
    } catch (error) {
      console.error("Equipment search failed:", error);
    } finally {
      setSearchingEquipment(null);
    }
  };
  
  // Check if all required fields are filled
  const validateForm = () => {
    const errors = {};
    formFields.forEach(field => {
      if (field.required && !formData[field.id] && formData[field.id] !== false && formData[field.id] !== 0) {
        errors[field.id] = "This field is required";
      }
    });
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Handle field value change
  const handleFieldChange = (fieldId, value) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
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
    
    setIsSubmitting(true);
    try {
      await onComplete({
        form_data: formData,
        completion_notes: completionNotes,
        attachments: attachments,
      });
      toast.success("Task completed successfully");
      onBack();
    } catch (error) {
      console.error("Task completion error:", error);
      const errorMsg = error?.response?.data?.detail || error.message || "Failed to complete task. Please try again.";
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render form field based on type
  const renderField = (field) => {
    const hasError = validationErrors[field.id];
    const value = formData[field.id];
    const fieldType = field.type || field.field_type;
    
    const thresholds = field.thresholds || {};
    const minThreshold = field.min_threshold ?? thresholds.critical_low ?? thresholds.warning_low;
    const maxThreshold = field.max_threshold ?? thresholds.critical_high ?? thresholds.warning_high;
    
    const mobileInputClass = isMobile ? "h-10 text-sm" : "";
    const mobileLabelClass = isMobile ? "text-sm mb-1.5" : "";
    
    const LinkedEquipmentBadge = () => {
      if (!field.linked_equipment) return null;
      return (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded w-fit mb-1.5">
          <Building2 className="w-3 h-3" />
          <span>{field.linked_equipment.name}</span>
        </div>
      );
    };
    
    switch (fieldType) {
      case "boolean":
        return (
          <div key={field.id} className="space-y-2">
            <div className={cn(
              "flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200",
              isMobile && "min-h-[48px]"
            )}>
              <Checkbox
                id={field.id}
                checked={value === true}
                onCheckedChange={(checked) => handleFieldChange(field.id, checked)}
                className={cn(isMobile && "h-5 w-5")}
              />
              <div className="flex-1">
                <label htmlFor={field.id} className={cn(
                  "font-medium cursor-pointer text-sm",
                  hasError && "text-red-600"
                )}>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                {field.description && (
                  <p className="text-xs text-slate-500 mt-0.5">{field.description}</p>
                )}
              </div>
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "checklist":
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className="space-y-1.5">
              {(field.items || []).map((item, idx) => (
                <div 
                  key={`${field.id}-item-${idx}`} 
                  className={cn(
                    "flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200",
                    isMobile && "min-h-[44px]"
                  )}
                >
                  <Checkbox
                    id={`${field.id}-${idx}`}
                    checked={value?.[idx] || false}
                    onCheckedChange={() => handleChecklistToggle(field.id, idx, field.items)}
                    className={cn(isMobile && "h-5 w-5")}
                  />
                  <label htmlFor={`${field.id}-${idx}`} className="flex-1 cursor-pointer text-sm">
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
          <div key={field.id} className="space-y-1.5">
            <Label className={cn((hasError || isExceeded) && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
              {field.unit && <span className="text-slate-400 font-normal ml-1">({field.unit})</span>}
            </Label>
            <LinkedEquipmentBadge />
            <Input
              type="number"
              inputMode="decimal"
              value={value || ""}
              onChange={(e) => handleNumericChange(field.id, e.target.value, { ...field, min_threshold: minThreshold, max_threshold: maxThreshold })}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              className={cn(isExceeded && "border-red-500 bg-red-50", mobileInputClass)}
            />
            {(minThreshold != null || maxThreshold != null) && (
              <p className="text-xs text-slate-500">
                {minThreshold != null && maxThreshold != null 
                  ? `Range: ${minThreshold} - ${maxThreshold}` 
                  : minThreshold != null ? `Min: ${minThreshold}` : `Max: ${maxThreshold}`
                } {field.unit}
              </p>
            )}
            {isExceeded && (
              <p className="text-xs text-red-600 flex items-center gap-1 bg-red-50 p-2 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                Value outside threshold - issue detected
              </p>
            )}
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
        
      case "text":
      case "textarea":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <Textarea
              value={value || ""}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              rows={3}
              className="text-sm"
            />
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
        
      case "select":
      case "multiple_choice":
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <div className={cn("grid gap-1.5", isMobile ? "grid-cols-1" : "flex flex-wrap")}>
              {(field.options || ["Good", "Warning", "Bad"]).map((option) => {
                const optionValue = typeof option === 'object' ? option.value : option;
                const optionLabel = typeof option === 'object' ? option.label : option;
                return (
                  <Button
                    key={optionValue}
                    type="button"
                    variant={value === optionValue ? "default" : "outline"}
                    size={isMobile ? "default" : "sm"}
                    onClick={() => handleFieldChange(field.id, optionValue)}
                    className={cn(
                      "text-sm",
                      isMobile && "h-10 justify-start px-3",
                      value === optionValue && optionLabel === "Good" && "bg-green-600 hover:bg-green-700",
                      value === optionValue && optionLabel === "Warning" && "bg-amber-500 hover:bg-amber-600",
                      value === optionValue && optionLabel === "Bad" && "bg-red-600 hover:bg-red-700"
                    )}
                  >
                    {value === optionValue && <Check className="w-3.5 h-3.5 mr-1.5" />}
                    {optionLabel}
                  </Button>
                );
              })}
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "dropdown":
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <Select
              value={value || ""}
              onValueChange={(v) => handleFieldChange(field.id, v)}
            >
              <SelectTrigger className={cn(mobileInputClass, hasError && "border-red-500")}>
                <SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((option) => {
                  const optionValue = typeof option === 'object' ? option.value : option;
                  const optionLabel = typeof option === 'object' ? option.label : option;
                  return (
                    <SelectItem key={optionValue} value={optionValue}>
                      {optionLabel}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "multi_select":
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <div className="space-y-2">
              {(field.options || []).map((option) => {
                const optionValue = typeof option === 'object' ? option.value : option;
                const optionLabel = typeof option === 'object' ? option.label : option;
                const isSelected = selectedValues.includes(optionValue);
                return (
                  <div
                    key={optionValue}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      isSelected 
                        ? "bg-indigo-50 border-indigo-300" 
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100",
                      isMobile && "min-h-[48px]"
                    )}
                    onClick={() => {
                      const newValues = isSelected
                        ? selectedValues.filter(v => v !== optionValue)
                        : [...selectedValues, optionValue];
                      handleFieldChange(field.id, newValues);
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      className={cn(isMobile && "h-5 w-5")}
                    />
                    <span className="text-sm">{optionLabel}</span>
                  </div>
                );
              })}
            </div>
            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedValues.map(v => {
                  const opt = (field.options || []).find(o => 
                    (typeof o === 'object' ? o.value : o) === v
                  );
                  const label = typeof opt === 'object' ? opt.label : opt;
                  return (
                    <Badge key={v} variant="secondary" className="text-xs">
                      {label || v}
                    </Badge>
                  );
                })}
              </div>
            )}
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "date":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <Input
              type="date"
              value={value || ""}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              className={cn(mobileInputClass, hasError && "border-red-500")}
            />
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "datetime":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <Input
              type="datetime-local"
              value={value || ""}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              className={cn(mobileInputClass, hasError && "border-red-500")}
            />
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "range":
        const rangeMin = field.range_min ?? 0;
        const rangeMax = field.range_max ?? 100;
        const rangeStep = field.range_step ?? 1;
        const rangeValue = value ?? rangeMin;
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </Label>
              <span className="text-sm font-medium text-indigo-600">{rangeValue}</span>
            </div>
            <LinkedEquipmentBadge />
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{rangeMin}</span>
              <input
                type="range"
                min={rangeMin}
                max={rangeMax}
                step={rangeStep}
                value={rangeValue}
                onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <span className="text-xs text-slate-500">{rangeMax}</span>
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "file":
      case "image":
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-4">
              {value ? (
                <div className="flex items-center gap-3">
                  {fieldType === "image" && value.preview ? (
                    <img src={value.preview} alt="Preview" className="w-16 h-16 object-cover rounded" />
                  ) : (
                    <FileText className="w-10 h-10 text-slate-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{value.name || "Uploaded file"}</p>
                    <p className="text-xs text-slate-500">{value.size ? `${(value.size / 1024).toFixed(1)} KB` : ""}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFieldChange(field.id, null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  <span className="text-sm text-slate-600">
                    {fieldType === "image" ? "Upload image" : "Upload file"}
                  </span>
                  <span className="text-xs text-slate-400 mt-1">
                    {field.allowed_types || (fieldType === "image" ? "jpg, png, gif" : "Any file")}
                  </span>
                  <input
                    type="file"
                    accept={fieldType === "image" ? "image/*" : field.allowed_types || "*"}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const fileData = {
                          name: file.name,
                          size: file.size,
                          type: file.type,
                          file: file,
                        };
                        if (fieldType === "image") {
                          fileData.preview = URL.createObjectURL(file);
                        }
                        handleFieldChange(field.id, fileData);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      case "signature":
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <div className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center",
              value ? "border-green-300 bg-green-50" : "border-slate-300"
            )}>
              {value ? (
                <div className="space-y-2">
                  <img src={value} alt="Signature" className="max-h-20 mx-auto" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleFieldChange(field.id, null)}
                  >
                    Clear Signature
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Signature className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm text-slate-600">Tap to sign</p>
                  <p className="text-xs text-slate-400">Signature capture coming soon</p>
                </div>
              )}
            </div>
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
        
      case "equipment":
        const searchQuery = equipmentSearch[field.id] || "";
        const results = equipmentResults[field.id] || [];
        const isSearching = searchingEquipment === field.id;
        
        return (
          <div key={field.id} className="space-y-2">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className="relative">
              <Input
                value={value?.name || searchQuery}
                onChange={(e) => {
                  setEquipmentSearch(prev => ({ ...prev, [field.id]: e.target.value }));
                  handleFieldChange(field.id, null);
                  searchEquipment(field.id, e.target.value);
                }}
                placeholder="Search equipment..."
                className={cn(mobileInputClass)}
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
              )}
            </div>
            {results.length > 0 && !value && (
              <div className="border rounded-lg max-h-40 overflow-y-auto">
                {results.map((eq) => (
                  <button
                    key={eq.id}
                    type="button"
                    onClick={() => {
                      handleFieldChange(field.id, eq);
                      setEquipmentSearch(prev => ({ ...prev, [field.id]: "" }));
                      setEquipmentResults(prev => ({ ...prev, [field.id]: [] }));
                    }}
                    className="w-full text-left p-2 hover:bg-slate-50 border-b last:border-b-0"
                  >
                    <div className="font-medium text-sm">{eq.name}</div>
                    <div className="text-xs text-slate-500">{eq.path || eq.level}</div>
                  </button>
                ))}
              </div>
            )}
            {value && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">{value.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange(field.id, null)}
                  className="ml-auto h-6 w-6 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
      
      default:
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <Input
              value={value || ""}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              className={cn(mobileInputClass)}
            />
            {hasError && <p className="text-xs text-red-600">{hasError}</p>}
          </div>
        );
    }
  };

  // Task context section
  const TaskContext = (
    <div className={cn(
      "bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-lg",
      isMobile ? "mx-0" : "mx-4 mt-4"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{task?.title || task?.task_template_name || "Task"}</h3>
          {task?.equipment_name && (
            <p className="text-sm text-white/80 mt-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              {task.equipment_name}
            </p>
          )}
          {task?.description && expandedContext && (
            <p className="text-sm text-white/70 mt-2">{task.description}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpandedContext(!expandedContext)}
          className="text-white hover:bg-white/20 -mr-2"
        >
          {expandedContext ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>
      
      {/* Documents Badge */}
      {formDocuments.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Badge variant="secondary" className="bg-white/20 text-white border-0">
            <FileText className="w-3 h-3 mr-1" />
            {formDocuments.length} Document{formDocuments.length > 1 ? 's' : ''}
          </Badge>
        </div>
      )}
    </div>
  );

  // Form content
  const TaskFormContent = (
    <div className="p-4 space-y-4">
      {/* Documents Section */}
      {formDocuments.length > 0 && (
        <div className="border rounded-lg p-3 bg-blue-50/50">
          <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            Reference Documents
          </h4>
          <div className="space-y-2">
            {formDocuments.map((doc, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm truncate">{doc.name || doc.filename || `Document ${idx + 1}`}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingDocument(doc)}
                    className="h-8 px-2"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(doc.url, '_blank')}
                    className="h-8 px-2"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Form Fields */}
      {formFields.length > 0 ? (
        <div className="space-y-4">
          {formFields.map(field => renderField(field))}
        </div>
      ) : (
        <div className="text-center py-6 text-slate-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No form fields for this task</p>
        </div>
      )}
      
      {/* Completion Notes */}
      <div className="space-y-2 pt-4 border-t">
        <Label className={isMobile ? "text-sm" : ""}>Completion Notes</Label>
        <Textarea
          value={completionNotes}
          onChange={(e) => setCompletionNotes(e.target.value)}
          placeholder="Add any notes about task completion..."
          rows={3}
          className="text-sm"
        />
      </div>
      
      {/* Attachments Section */}
      <div className="space-y-2">
        <Label className={isMobile ? "text-sm" : ""}>Attachments</Label>
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 bg-slate-100 rounded-lg">
              <Paperclip className="w-4 h-4 text-slate-500" />
              <span className="text-sm truncate max-w-[150px]">{att.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                className="h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={uploadingAttachment}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.onchange = async (e) => {
              const files = Array.from(e.target.files);
              setUploadingAttachment(true);
              try {
                for (const file of files) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    setAttachments(prev => [...prev, { name: file.name, data: reader.result, type: file.type }]);
                  };
                  reader.readAsDataURL(file);
                }
              } finally {
                setUploadingAttachment(false);
              }
            };
            input.click();
          }}
        >
          {uploadingAttachment ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
          Add Attachment
        </Button>
      </div>
      
      {/* Submit Button */}
      <div className="pt-4">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full h-12 text-base"
          data-testid="complete-task-btn"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Completing...
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Complete Task
            </>
          )}
        </Button>
      </div>
    </div>
  );

  // Document Viewer Modal - Use authenticated DocumentViewer component
  if (viewingDocument) {
    // Prepare document object for DocumentViewer with proper type extraction
    const docName = viewingDocument.name || "Document";
    const docUrl = viewingDocument.url || viewingDocument.storage_path || "";
    const docType = docName.split('.').pop()?.toLowerCase() || 
                    docUrl.split('.').pop()?.toLowerCase() || "unknown";
    
    const documentForViewer = {
      name: docName,
      url: docUrl,
      type: docType
    };
    
    return (
      <DocumentViewer
        document={documentForViewer}
        onBack={() => setViewingDocument(null)}
        onClose={() => setViewingDocument(null)}
        showBackButton={true}
      />
    );
  }

  // Main Task Execution View
  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="back-btn">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-slate-800 truncate">Execute Task</h2>
          {task?.form_template_name && (
            <p className="text-xs text-slate-500 truncate">Form: {task.form_template_name}</p>
          )}
        </div>
        {formDocuments.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewingDocument(formDocuments[0])}
            className="gap-1"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">View Doc</span>
          </Button>
        )}
      </div>
      
      {/* Task Context */}
      <div className="flex-shrink-0">
        {TaskContext}
      </div>
      
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto">
        {TaskFormContent}
      </div>
    </div>
  );
};

export default TaskExecutionFrame;
