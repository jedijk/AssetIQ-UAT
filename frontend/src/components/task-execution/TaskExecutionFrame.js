/**
 * TaskExecutionFrame Component
 * Extracted from MyTasksPage.js for better modularity
 * Handles task execution with form fields, attachments, and issue tracking
 */
import { getBackendUrl } from '../../lib/apiConfig';
import { compressImage, formatFileSize, getCompressionPercent } from '../../lib/imageCompression';
import PhotoDataCaptureField from '../forms/PhotoDataCaptureField';
import { useState, useEffect, useRef, useCallback } from "react";
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
  File,
  ImageIcon,
  Trash2,
  PenLine,
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
import { SignaturePad } from "../ui/signature-pad";
import { VoiceInput } from "../ui/voice-input";
import { useIsMobile } from "../../hooks/useIsMobile";
import { imageAnalysisAPI } from "../../lib/api";
import { DocumentViewer } from "../DocumentViewer";

const API_BASE_URL = getBackendUrl();

// Helper to get storage key for a task
const getStorageKey = (taskId) => `task_draft_${taskId}`;

// Helper to save draft to localStorage
const saveDraft = (taskId, data) => {
  try {
    localStorage.setItem(getStorageKey(taskId), JSON.stringify({
      ...data,
      savedAt: new Date().toISOString()
    }));
  } catch (e) {
    console.warn("Could not save draft:", e);
  }
};

// Helper to load draft from localStorage
const loadDraft = (taskId) => {
  try {
    const stored = localStorage.getItem(getStorageKey(taskId));
    if (stored) {
      const data = JSON.parse(stored);
      // Check if draft is less than 24 hours old
      const savedAt = new Date(data.savedAt);
      const hoursSinceSave = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSave < 24) {
        return data;
      } else {
        // Clear old draft
        localStorage.removeItem(getStorageKey(taskId));
      }
    }
  } catch (e) {
    console.warn("Could not load draft:", e);
  }
  return null;
};

// Helper to clear draft
const clearDraft = (taskId) => {
  try {
    localStorage.removeItem(getStorageKey(taskId));
  } catch (e) {
    console.warn("Could not clear draft:", e);
  }
};

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
  const [showDocumentList, setShowDocumentList] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const docDropdownRef = useRef(null);
  const isInitialLoad = useRef(true);
  
  // Close document dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (docDropdownRef.current && !docDropdownRef.current.contains(event.target)) {
        setShowDocumentList(false);
      }
    };
    
    if (showDocumentList) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDocumentList]);
  
  // Get form documents from task template - construct full URLs
  const rawFormDocuments = task?.form_documents || task?.template?.documents || task?.documents || [];
  const formDocuments = rawFormDocuments.map(doc => ({
    ...doc,
    url: doc.url?.startsWith('http') 
      ? doc.url 
      : `${API_BASE_URL}/api/form-documents/${doc.url || doc.storage_path}`
  }));
  
  // Load draft when task changes
  useEffect(() => {
    if (task?.id) {
      isInitialLoad.current = true;
      const draft = loadDraft(task.id);
      if (draft) {
        setFormData(draft.formData || {});
        setCompletionNotes(draft.completionNotes || "");
        // Restore attachments - filter out ones that need re-upload (no data/preview)
        const restoredAttachments = (draft.attachments || []).filter(att => att.url);
        const needsReupload = (draft.attachments || []).filter(att => att.needsReupload || !att.url);
        setAttachments(restoredAttachments);
        setHasDraft(true);
        if (needsReupload.length > 0) {
          toast.info(`Restored draft. ${needsReupload.length} attachment(s) need to be re-added.`, { duration: 4000 });
        } else {
          toast.info("Restored your previous draft", { duration: 3000 });
        }
      } else {
        setFormData({});
        setCompletionNotes("");
        setAttachments([]);
        setHasDraft(false);
      }
      setValidationErrors({});
      setImageAnalysis({});
      setAnalyzingImage(null);
      setUploadingAttachment(false);
      setViewingDocument(null);
      setShowDocumentList(false);
      
      // Mark initial load complete after a tick
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 100);
    }
  }, [task?.id]);
  
  // Auto-save draft when form data changes (debounced)
  useEffect(() => {
    if (!task?.id || isInitialLoad.current) return;
    
    const hasData = Object.keys(formData).length > 0 || completionNotes || attachments.length > 0;
    if (!hasData) return;
    
    const timeout = setTimeout(() => {
      // Filter out large base64 data from attachments (localStorage has size limits)
      // Only keep metadata - files will need to be re-attached after draft restore
      const serializableAttachments = attachments.map(att => ({
        name: att.name,
        type: att.type,
        size: att.size,
        url: att.url, // Keep URL if it was uploaded to server
        // Don't store base64 data/preview - too large for localStorage
        needsReupload: !att.url, // Mark as needing re-upload if no server URL
      }));
      
      saveDraft(task.id, {
        formData,
        completionNotes,
        attachments: serializableAttachments,
      });
      setHasDraft(true);
    }, 1000); // Debounce 1 second
    
    return () => clearTimeout(timeout);
  }, [task?.id, formData, completionNotes, attachments]);
  
  // Build form fields from task template
  const formFields = task?.form_fields || task?.template?.form_fields || [];
  
  // Photo extraction config from form template
  const photoExtractionConfig = task?.photo_extraction_config || task?.template?.photo_extraction_config || null;
  
  // Auto-fill handler for photo extraction
  const [aiFilledFields, setAiFilledFields] = useState({});
  const [aiCorrections, setAiCorrections] = useState({});
  const [extractionImageData, setExtractionImageData] = useState(null);
  const handlePhotoAutoFill = (fills, imageBase64) => {
    console.log("[TaskExec] handlePhotoAutoFill called with", Object.keys(fills).length, "fills:", fills);
    const newData = { ...formData };
    const filled = {};
    for (const [fieldId, info] of Object.entries(fills)) {
      let val = info.value;
      // Convert datetime strings for datetime form fields
      const formField = formFields.find(f => f.id === fieldId);
      if (formField) {
        const ft = formField.field_type || formField.type;
        if (ft === "datetime" && typeof val === "string") {
          try {
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
              val = d.toISOString().slice(0, 16);
            }
          } catch {}
        } else if (ft === "numeric" && val != null) {
          // Ensure numeric fields get a number value
          const num = parseFloat(String(val).replace(/[^0-9.\-]/g, ""));
          if (!isNaN(num)) val = num;
        }
      }
      newData[fieldId] = val;
      filled[fieldId] = { ...info, value: val };
      console.log(`[TaskExec] Fill field="${fieldId}" formField=${formField?.label || 'NOT FOUND'} val=${val}`);
    }
    setFormData(newData);
    setAiFilledFields(prev => ({ ...prev, ...filled }));
    setAiCorrections({});
    if (imageBase64) setExtractionImageData(imageBase64);
    toast.success(`Auto-filled ${Object.keys(fills).length} fields from photo`);
  };

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
    // Track correction if this was an AI-filled field
    if (aiFilledFields[fieldId] && String(value) !== String(aiFilledFields[fieldId].value)) {
      setAiCorrections(prev => ({
        ...prev,
        [fieldId]: { original_ai_value: aiFilledFields[fieldId].value, corrected_value: value },
      }));
    }
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
      // Convert file objects to base64 for upload
      const processedAttachments = await Promise.all(
        attachments.map(async (att) => {
          // If already has data (base64), use it
          if (att.data) {
            return {
              name: att.name,
              data: att.data,
              type: att.type,
              size: att.size,
            };
          }
          // If has file object, convert to base64
          if (att.file) {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve({
                  name: att.name,
                  data: reader.result,
                  type: att.type,
                  size: att.size,
                });
              };
              reader.onerror = () => {
                // On error, return without data
                resolve({
                  name: att.name,
                  type: att.type,
                  size: att.size,
                  error: 'Failed to read file',
                });
              };
              reader.readAsDataURL(att.file);
            });
          }
          // Return as-is if no file or data
          return att;
        })
      );
      
      // Build extraction traceability data
      const hasExtraction = Object.keys(aiFilledFields).length > 0;
      const extractionData = hasExtraction ? {
        extracted_fields: aiFilledFields,
        corrections: aiCorrections,
        has_corrections: Object.keys(aiCorrections).length > 0,
        extraction_timestamp: new Date().toISOString(),
      } : undefined;

      await onComplete({
        form_data: formData,
        completion_notes: completionNotes,
        attachments: processedAttachments.filter(a => a.data),
        ai_extraction: extractionData,
      });

      // Send corrections to backend for learning (fire-and-forget)
      if (hasExtraction && Object.keys(aiCorrections).length > 0 && task?.form_template_id) {
        try {
          const token = localStorage.getItem("token");
          const corrections = Object.entries(aiCorrections).map(([fieldId, c]) => ({
            field_key: fieldId,
            ai_value: c.original_ai_value,
            corrected_value: c.corrected_value,
          }));
          fetch(`${API_BASE_URL}/api/ai/extract/corrections`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ form_template_id: task.form_template_id, corrections }),
          });
        } catch (e) {
          // Non-critical, don't block submission
        }
      }

      // Clear draft on successful submission
      if (task?.id) {
        clearDraft(task.id);
      }
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
    const aiInfo = aiFilledFields[field.id];
    const corrected = aiCorrections[field.id];
    const confThreshold = photoExtractionConfig?.confidence_threshold ?? 0.7;

    // AI confidence badge for fields filled by photo extraction
    const AiBadge = () => {
      if (!aiInfo) return null;
      const conf = aiInfo.confidence;
      const isLow = conf < confThreshold;
      const wasCorrected = !!corrected;
      return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-1.5 ${
          wasCorrected ? "bg-blue-100 text-blue-700" :
          isLow ? "bg-amber-100 text-amber-700" :
          "bg-green-100 text-green-700"
        }`} data-testid={`ai-badge-${field.id}`}>
          {wasCorrected ? "Corrected" : isLow ? `AI ${Math.round(conf * 100)}%` : `AI ${Math.round(conf * 100)}%`}
        </span>
      );
    };
    
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
              <AiBadge />
            </Label>
            <LinkedEquipmentBadge />
            <Input
              type="number"
              inputMode="decimal"
              value={value || ""}
              onChange={(e) => handleNumericChange(field.id, e.target.value, { ...field, min_threshold: minThreshold, max_threshold: maxThreshold })}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              className={cn(
                isExceeded && "border-red-500 bg-red-50",
                aiInfo && !corrected && "ring-1 ring-green-300 bg-green-50/30",
                aiInfo && corrected && "ring-1 ring-blue-300 bg-blue-50/30",
                mobileInputClass
              )}
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
            <div className="flex items-center justify-between">
              <Label className={cn(hasError && "text-red-600", mobileLabelClass)}>
                {field.label} {field.required && <span className="text-red-500">*</span>}
                <AiBadge />
              </Label>
              <VoiceInput 
                size="sm"
                onTranscribe={(text, append) => {
                  const currentValue = value || "";
                  if (append && currentValue) {
                    handleFieldChange(field.id, currentValue + (currentValue.endsWith(' ') ? '' : ' ') + text);
                  } else {
                    handleFieldChange(field.id, text);
                  }
                }}
              />
            </div>
            <LinkedEquipmentBadge />
            <Textarea
              value={value || ""}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}... (or use microphone)`}
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
              <AiBadge />
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
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        let processedFile = file;
                        
                        // Compress images before upload
                        if (file.type.startsWith('image/')) {
                          try {
                            const result = await compressImage(file, {
                              maxWidth: 1920,
                              maxHeight: 1920,
                              quality: 0.8,
                              maxSizeMB: 1,
                            });
                            processedFile = result.file;
                            if (result.wasCompressed) {
                              const savedPercent = getCompressionPercent(result.originalSize, result.compressedSize);
                              toast.success(`Image compressed: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)} (${savedPercent}% smaller)`);
                            }
                          } catch (err) {
                            console.error('Image compression failed:', err);
                            // Continue with original file
                          }
                        }
                        
                        const fileData = {
                          name: processedFile.name,
                          size: processedFile.size,
                          type: processedFile.type,
                          file: processedFile,
                        };
                        if (fieldType === "image") {
                          fileData.preview = URL.createObjectURL(processedFile);
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
              <PenLine className="w-4 h-4 inline mr-1" />
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <LinkedEquipmentBadge />
            <SignaturePad
              value={value}
              onSave={(dataUrl) => handleFieldChange(field.id, dataUrl)}
              onClear={() => handleFieldChange(field.id, null)}
              disabled={false}
            />
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
      "bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-lg relative",
      isMobile ? "mx-0" : "mx-4 mt-4"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-12">
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
        
        {/* Document Icon Button - Top Right */}
        {formDocuments.length > 0 && (
          <div className="absolute top-3 right-3" ref={docDropdownRef}>
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDocumentList(!showDocumentList)}
                className="text-white hover:bg-white/20 h-10 w-10 p-0 rounded-full"
              >
                <FileText className="w-5 h-5" />
                {formDocuments.length > 1 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {formDocuments.length}
                  </span>
                )}
              </Button>
              
              {/* Document Dropdown */}
              {showDocumentList && (
                <div className="absolute right-0 top-12 bg-white rounded-lg shadow-xl border z-50 min-w-[280px] max-w-[350px]">
                  <div className="p-3 border-b bg-slate-50 rounded-t-lg">
                    <h4 className="font-medium text-slate-800 text-sm">Reference Documents</h4>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {formDocuments.map((doc, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-3 hover:bg-slate-50 border-b last:border-b-0 cursor-pointer"
                        onClick={() => {
                          setViewingDocument(doc);
                          setShowDocumentList(false);
                        }}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {doc.name || doc.filename || `Document ${idx + 1}`}
                            </p>
                            <p className="text-xs text-slate-500">
                              {doc.type || doc.name?.split('.').pop()?.toUpperCase() || 'Document'}
                            </p>
                          </div>
                        </div>
                        <Eye className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpandedContext(!expandedContext)}
          className={cn(
            "text-white hover:bg-white/20 -mr-2",
            formDocuments.length > 0 && "mr-8"
          )}
        >
          {expandedContext ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );

  // Form content
  const TaskFormContent = (
    <div className="p-4 space-y-4">
      {/* Photo Data Capture */}
      {photoExtractionConfig?.enabled && (
        <PhotoDataCaptureField
          config={photoExtractionConfig}
          formData={formData}
          onAutoFill={handlePhotoAutoFill}
          formTemplateId={task?.form_template_id}
        />
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
        <div className="flex items-center justify-between">
          <Label className={isMobile ? "text-sm" : ""}>Completion Notes</Label>
          <VoiceInput 
            size="sm"
            onTranscribe={(text, append) => {
              if (append && completionNotes) {
                setCompletionNotes(completionNotes + (completionNotes.endsWith(' ') ? '' : ' ') + text);
              } else {
                setCompletionNotes(text);
              }
            }}
          />
        </div>
        <Textarea
          value={completionNotes}
          onChange={(e) => setCompletionNotes(e.target.value)}
          placeholder="Add any notes about task completion... (or use microphone to dictate)"
          rows={3}
          className="text-sm"
        />
      </div>
      
      {/* Attachments Section - Enhanced with previews */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className={isMobile ? "text-sm" : ""}>
            Attachments
            {attachments.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {attachments.length}
              </Badge>
            )}
          </Label>
          {hasDraft && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              Draft saved
            </span>
          )}
        </div>
        
        {/* Attachment Grid - Show previews */}
        {attachments.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {attachments.map((att, idx) => {
              const isImage = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name);
              // Use blob URL first (for newly added files), then fall back to data/url
              const previewUrl = att.blobUrl || att.preview || att.data || att.url;
              const hasValidPreview = previewUrl && !att.needsReupload;
              
              return (
                <div 
                  key={idx} 
                  className="relative group bg-slate-100 rounded-lg border border-slate-200 overflow-hidden"
                >
                  {isImage && hasValidPreview ? (
                    <div className="aspect-square">
                      <img 
                        src={previewUrl} 
                        alt={att.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Hide broken image and show fallback
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <div className="hidden aspect-square flex-col items-center justify-center p-2 bg-slate-50">
                        <ImageIcon className="w-8 h-8 text-slate-400 mb-1" />
                        <span className="text-[10px] text-amber-600 font-medium">Preview unavailable</span>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-square flex flex-col items-center justify-center p-2 bg-slate-50">
                      {isImage ? (
                        <ImageIcon className="w-8 h-8 text-slate-400 mb-1" />
                      ) : (
                        <File className="w-8 h-8 text-slate-400 mb-1" />
                      )}
                      <span className="text-[10px] text-slate-500 uppercase font-medium">
                        {att.name?.split('.').pop() || 'File'}
                      </span>
                      {att.needsReupload && (
                        <span className="text-[9px] text-amber-600 mt-1">Needs re-upload</span>
                      )}
                    </div>
                  )}
                  
                  {/* File name overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                    <p className="text-[10px] text-white truncate">{att.name}</p>
                  </div>
                  
                  {/* Delete button */}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
                    onClick={() => {
                      // Revoke blob URL to free memory
                      if (att.blobUrl) {
                        URL.revokeObjectURL(att.blobUrl);
                      }
                      setAttachments(prev => prev.filter((_, i) => i !== idx));
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Add Attachment Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={uploadingAttachment}
          className="w-full border-dashed"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt";
            input.onchange = async (e) => {
              const files = Array.from(e.target.files);
              setUploadingAttachment(true);
              try {
                for (const file of files) {
                  let processedFile = file;
                  
                  // Compress images before attaching
                  if (file.type.startsWith('image/')) {
                    try {
                      const result = await compressImage(file, {
                        maxWidth: 1920,
                        maxHeight: 1920,
                        quality: 0.8,
                        maxSizeMB: 1,
                      });
                      processedFile = result.file;
                      if (result.wasCompressed) {
                        const savedPercent = getCompressionPercent(result.originalSize, result.compressedSize);
                        toast.success(`${file.name} compressed: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)} (${savedPercent}% smaller)`);
                      }
                    } catch (err) {
                      console.error('Image compression failed:', err);
                      // Continue with original file
                    }
                  }
                  
                  // Use blob URL for preview (more memory efficient than base64)
                  const isImage = processedFile.type.startsWith('image/');
                  const blobUrl = URL.createObjectURL(processedFile);
                  
                  // Store the file object for later upload, use blob URL for preview
                  setAttachments(prev => [...prev, { 
                    name: processedFile.name, 
                    file: processedFile, // Keep file object for upload
                    type: processedFile.type,
                    preview: isImage ? blobUrl : null,
                    blobUrl: blobUrl, // Track for cleanup
                    size: processedFile.size
                  }]);
                }
                toast.success(`${files.length} file(s) attached`);
              } finally {
                setUploadingAttachment(false);
              }
            };
            input.click();
          }}
        >
          {uploadingAttachment ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {attachments.length > 0 ? "Add More Files" : "Add Attachment"}
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
        {hasDraft && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (task?.id) {
                clearDraft(task.id);
                setFormData({});
                setCompletionNotes("");
                setAttachments([]);
                setHasDraft(false);
                toast.info("Draft cleared");
              }
            }}
            className="text-slate-500 hover:text-red-600 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
        )}
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
