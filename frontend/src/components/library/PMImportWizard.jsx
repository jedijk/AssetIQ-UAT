import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../../contexts/LanguageContext";
import { pmImportAPI } from "../../lib/apis/pmImport";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Image,
  X,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Loader2,
  Sparkles,
  Zap,
  FileCheck,
  Brain,
  Library,
  ClipboardCheck,
  Download,
  Check,
  XCircle,
  Edit2,
  Info,
  AlertCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

// Task type colors
const TASK_TYPE_COLORS = {
  Inspection: "bg-blue-100 text-blue-700",
  Lubrication: "bg-amber-100 text-amber-700",
  Calibration: "bg-purple-100 text-purple-700",
  Replacement: "bg-red-100 text-red-700",
  Cleaning: "bg-cyan-100 text-cyan-700",
  Adjustment: "bg-indigo-100 text-indigo-700",
  Monitoring: "bg-green-100 text-green-700",
  Unknown: "bg-slate-100 text-slate-600",
};

// Confidence badge
const ConfidenceBadge = ({ score }) => {
  let color = "bg-red-100 text-red-700 border-red-200";
  let label = "Low";
  
  if (score >= 90) {
    color = "bg-green-100 text-green-700 border-green-200";
    label = "High";
  } else if (score >= 70) {
    color = "bg-yellow-100 text-yellow-700 border-yellow-200";
    label = "Medium";
  }
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-sm font-medium ${color}`}>
      <span className="text-lg">{score}%</span>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  );
};

// Library match badge
const LibraryMatchBadge = ({ match }) => {
  const status = match?.status || "pending";
  
  const configs = {
    existing_match: { color: "bg-green-100 text-green-700", label: "Existing Match", icon: CheckCircle },
    new_proposed: { color: "bg-blue-100 text-blue-700", label: "New Proposed", icon: Sparkles },
    multiple_possible: { color: "bg-amber-100 text-amber-700", label: "Review Required", icon: AlertCircle },
    weak_match: { color: "bg-slate-100 text-slate-600", label: "Weak Match", icon: Info },
    pending: { color: "bg-slate-100 text-slate-500", label: "Pending", icon: Loader2 },
  };
  
  const config = configs[status] || configs.pending;
  const Icon = config.icon;
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </div>
  );
};

// Processing step indicator
const ProcessingStep = ({ step, currentStep, label }) => {
  const isActive = step === currentStep;
  const isComplete = step < currentStep;
  
  return (
    <div className={`flex items-center gap-2 ${isActive ? "text-blue-600" : isComplete ? "text-green-600" : "text-slate-400"}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
        isComplete ? "bg-green-100" : isActive ? "bg-blue-100" : "bg-slate-100"
      }`}>
        {isComplete ? (
          <Check className="w-4 h-4" />
        ) : isActive ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <span className="text-xs">{step}</span>
        )}
      </div>
      <span className={`text-sm ${isActive ? "font-medium" : ""}`}>{label}</span>
    </div>
  );
};

// KPI Card
const KPICard = ({ label, value, icon: Icon, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
    slate: "bg-slate-50 text-slate-600",
  };
  
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
};

// Task row component
const TaskRow = ({ task, onAccept, onReject, onEdit, onSelect, isSelected }) => {
  const [expanded, setExpanded] = useState(false);
  
  const statusColors = {
    pending: "border-l-slate-300",
    accepted: "border-l-green-500",
    rejected: "border-l-red-400",
    edited: "border-l-blue-500",
  };
  
  return (
    <div 
      className={`bg-white rounded-lg border transition-all ${
        isSelected ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"
      } ${statusColors[task.review_status] || statusColors.pending} border-l-4`}
    >
      <div 
        className="p-4 cursor-pointer"
        onClick={() => onSelect(task)}
      >
        <div className="flex items-start gap-4">
          {/* Task info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-900 line-clamp-2 mb-2">{task.original_task}</p>
            <div className="flex flex-wrap gap-2 items-center">
              {task.component && (
                <Badge variant="outline" className="text-xs">
                  {task.component}
                </Badge>
              )}
              <Badge className={`text-xs ${TASK_TYPE_COLORS[task.task_type] || TASK_TYPE_COLORS.Unknown}`}>
                {task.task_type}
              </Badge>
              {task.frequency && (
                <Badge variant="outline" className="text-xs bg-slate-50">
                  {task.frequency}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Metrics */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <ConfidenceBadge score={task.confidence_score} />
            <LibraryMatchBadge match={task.library_match} />
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {task.review_status === "pending" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-green-600 hover:bg-green-50"
                  onClick={(e) => { e.stopPropagation(); onAccept(task.task_id); }}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:bg-red-50"
                  onClick={(e) => { e.stopPropagation(); onReject(task.task_id); }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
            {task.review_status === "accepted" && (
              <Badge className="bg-green-100 text-green-700">
                <Check className="w-3 h-3 mr-1" />
                Accepted
              </Badge>
            )}
            {task.review_status === "rejected" && (
              <Badge className="bg-red-100 text-red-700">
                <X className="w-3 h-3 mr-1" />
                Rejected
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="p-4 bg-slate-50 space-y-3">
              {/* Failure Modes */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Suggested Failure Modes</p>
                <div className="flex flex-wrap gap-1">
                  {(task.suggested_failure_modes || []).map((fm, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-white">
                      {typeof fm === "string" ? fm : fm.name}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {/* Mechanisms */}
              {task.failure_mechanisms?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Failure Mechanisms</p>
                  <p className="text-sm text-slate-600">{task.failure_mechanisms.join(", ")}</p>
                </div>
              )}
              
              {/* Detection Methods */}
              {task.detection_methods?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Detection Methods</p>
                  <p className="text-sm text-slate-600">{task.detection_methods.join(", ")}</p>
                </div>
              )}
              
              {/* AI Reasoning */}
              {task.ai_reasoning && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-start gap-2">
                    <Brain className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-blue-700 mb-1">AI Reasoning</p>
                      <p className="text-sm text-blue-800">{task.ai_reasoning}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Library Match Info */}
              {task.library_match?.matched_name && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-700 mb-1">
                    Matched to Existing: {task.library_match.matched_name}
                  </p>
                  <p className="text-xs text-green-600">
                    Match Score: {task.library_match.match_score}%
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Main PM Import Wizard Component
export const PMImportWizard = ({ isOpen, onClose, onImportComplete }) => {
  const { t } = useLanguage();
  const [step, setStep] = useState(1); // 1: Upload, 2: Processing, 3: Review, 4: Import Summary
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [processingStep, setProcessingStep] = useState(1);
  const [selectedTask, setSelectedTask] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);
  
  // Supported file types
  const supportedTypes = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  
  const supportedExtensions = [".xlsx", ".xls", ".pdf", ".png", ".jpg", ".jpeg", ".webp"];
  
  // Reset state on close
  const handleClose = () => {
    setStep(1);
    setSelectedFile(null);
    setSessionId(null);
    setSession(null);
    setProcessingStep(1);
    setSelectedTask(null);
    setImportResult(null);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    onClose();
  };
  
  // File drop handling
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer?.files?.[0];
    if (file) validateAndSetFile(file);
  };
  
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };
  
  const validateAndSetFile = (file) => {
    const extension = "." + file.name.split(".").pop().toLowerCase();
    if (!supportedExtensions.includes(extension)) {
      toast.error("Unsupported file type. Please use Excel, PDF, or image files.");
      return;
    }
    
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 20MB.");
      return;
    }
    
    setSelectedFile(file);
  };
  
  // Upload and start processing
  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setStep(2);
    setProcessingStep(1);
    
    try {
      const result = await pmImportAPI.upload(selectedFile);
      setSessionId(result.session_id);
      
      // Poll for results
      pollSession(result.session_id);
      
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.detail || "Failed to upload file");
      setStep(1);
    }
  };
  
  // Poll session status
  const pollSession = async (sid) => {
    const poll = async () => {
      try {
        const sess = await pmImportAPI.getSession(sid);
        setSession(sess);
        
        // Update processing step based on progress
        if (sess.progress < 30) setProcessingStep(1);
        else if (sess.progress < 50) setProcessingStep(2);
        else if (sess.progress < 80) setProcessingStep(3);
        else if (sess.progress < 95) setProcessingStep(4);
        else setProcessingStep(5);
        
        // Check if done
        if (sess.status === "ready_for_review") {
          clearInterval(pollingRef.current);
          setStep(3);
        } else if (sess.status === "error") {
          clearInterval(pollingRef.current);
          toast.error(sess.error_message || "Processing failed");
          setStep(1);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };
    
    // Initial call
    await poll();
    
    // Set up polling
    pollingRef.current = setInterval(poll, 2000);
  };
  
  // Task actions
  const handleAcceptTask = async (taskId) => {
    try {
      const result = await pmImportAPI.acceptTask(sessionId, taskId);
      setSession(prev => ({
        ...prev,
        tasks_extracted: prev.tasks_extracted.map(t => 
          t.task_id === taskId ? { ...t, review_status: "accepted" } : t
        ),
        stats: result.stats,
      }));
    } catch (error) {
      toast.error("Failed to accept task");
    }
  };
  
  const handleRejectTask = async (taskId) => {
    try {
      const result = await pmImportAPI.rejectTask(sessionId, taskId);
      setSession(prev => ({
        ...prev,
        tasks_extracted: prev.tasks_extracted.map(t => 
          t.task_id === taskId ? { ...t, review_status: "rejected" } : t
        ),
        stats: result.stats,
      }));
    } catch (error) {
      toast.error("Failed to reject task");
    }
  };
  
  const handleAcceptAllHighConfidence = async () => {
    try {
      const result = await pmImportAPI.acceptAllHighConfidence(sessionId);
      toast.success(`Accepted ${result.accepted_count} high confidence tasks`);
      
      // Refresh session
      const sess = await pmImportAPI.getSession(sessionId);
      setSession(sess);
    } catch (error) {
      toast.error("Failed to accept tasks");
    }
  };
  
  // Final import
  const handleImport = async () => {
    setImporting(true);
    
    try {
      const result = await pmImportAPI.importToLibrary(sessionId, true);
      setImportResult(result);
      setStep(4);
      toast.success("Import complete!");
      
      if (onImportComplete) {
        onImportComplete(result);
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error(error.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };
  
  // Export review
  const handleExport = async () => {
    try {
      const blob = await pmImportAPI.exportReview(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pm_import_review_${sessionId.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("Review exported");
    } catch (error) {
      toast.error("Export failed");
    }
  };
  
  // Get file icon
  const getFileIcon = (file) => {
    if (!file) return FileText;
    const ext = file.name.split(".").pop().toLowerCase();
    if (["xlsx", "xls"].includes(ext)) return FileSpreadsheet;
    if (ext === "pdf") return FileText;
    return Image;
  };
  
  const FileIcon = getFileIcon(selectedFile);
  
  // Calculate accepted count
  const acceptedCount = session?.tasks_extracted?.filter(t => 
    t.review_status === "accepted" || t.review_status === "edited"
  ).length || 0;
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Import Maintenance Plan
          </DialogTitle>
          <DialogDescription>
            Upload an existing preventive maintenance plan and AssetIQ will extract failure mode intelligence automatically.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="p-6 space-y-6">
              {/* Drop zone */}
              <div
                className={`relative border-2 border-dashed rounded-xl p-12 transition-all ${
                  dragActive 
                    ? "border-blue-500 bg-blue-50" 
                    : selectedFile 
                      ? "border-green-300 bg-green-50" 
                      : "border-slate-300 hover:border-slate-400"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={supportedExtensions.join(",")}
                  onChange={handleFileSelect}
                />
                
                <div className="text-center">
                  {selectedFile ? (
                    <>
                      <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-xl flex items-center justify-center">
                        <FileIcon className="w-8 h-8 text-green-600" />
                      </div>
                      <p className="text-lg font-medium text-slate-900 mb-1">{selectedFile.name}</p>
                      <p className="text-sm text-slate-500 mb-4">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedFile(null)}
                      >
                        Choose Different File
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-xl flex items-center justify-center">
                        <Upload className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-lg font-medium text-slate-700 mb-1">
                        Drag and drop your maintenance plan
                      </p>
                      <p className="text-sm text-slate-500 mb-4">
                        or click to browse
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Browse Files
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Supported formats */}
              <div className="flex items-center justify-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel (.xlsx, .xls)
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  PDF
                </div>
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Images (.png, .jpg)
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  disabled={!selectedFile}
                  onClick={handleUpload}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
          
          {/* Step 2: Processing */}
          {step === 2 && (
            <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
              {/* Animated loader */}
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Brain className="w-10 h-10 text-blue-600" />
                </div>
              </div>
              
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Analyzing Maintenance Plan
              </h3>
              <p className="text-slate-500 mb-8">
                {session?.progress_message || "Processing your file..."}
              </p>
              
              {/* Progress bar */}
              <div className="w-full max-w-md mb-8">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>Progress</span>
                  <span>{session?.progress || 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${session?.progress || 0}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              
              {/* Processing steps */}
              <div className="space-y-3">
                <ProcessingStep step={1} currentStep={processingStep} label="Reading maintenance plan" />
                <ProcessingStep step={2} currentStep={processingStep} label="Extracting maintenance tasks" />
                <ProcessingStep step={3} currentStep={processingStep} label="Identifying components" />
                <ProcessingStep step={4} currentStep={processingStep} label="Mapping failure modes" />
                <ProcessingStep step={5} currentStep={processingStep} label="Matching library entries" />
              </div>
            </div>
          )}
          
          {/* Step 3: Review */}
          {step === 3 && session && (
            <div className="flex flex-col h-full max-h-[70vh]">
              {/* KPI Cards */}
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <div className="grid grid-cols-6 gap-3">
                  <KPICard 
                    label="Tasks Extracted" 
                    value={session.stats?.total_tasks || 0} 
                    icon={ClipboardCheck} 
                    color="blue" 
                  />
                  <KPICard 
                    label="Failure Modes" 
                    value={session.stats?.failure_modes_identified || 0} 
                    icon={Zap} 
                    color="purple" 
                  />
                  <KPICard 
                    label="Existing Matches" 
                    value={session.stats?.existing_matches || 0} 
                    icon={Library} 
                    color="green" 
                  />
                  <KPICard 
                    label="New Proposed" 
                    value={session.stats?.new_proposed || 0} 
                    icon={Sparkles} 
                    color="blue" 
                  />
                  <KPICard 
                    label="Low Confidence" 
                    value={session.stats?.low_confidence_items || 0} 
                    icon={AlertTriangle} 
                    color="amber" 
                  />
                  <KPICard 
                    label="Manual Review" 
                    value={session.stats?.manual_review_required || 0} 
                    icon={Edit2} 
                    color="red" 
                  />
                </div>
              </div>
              
              {/* Bulk actions */}
              <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAcceptAllHighConfidence}
                    className="text-green-600 border-green-200 hover:bg-green-50"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Accept All High Confidence
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExport}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export Review
                  </Button>
                </div>
                <div className="text-sm text-slate-500">
                  <span className="font-medium text-green-600">{acceptedCount}</span> of {session.tasks_extracted?.length || 0} tasks accepted
                </div>
              </div>
              
              {/* Task list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {session.tasks_extracted?.map((task) => (
                  <TaskRow
                    key={task.task_id}
                    task={task}
                    onAccept={handleAcceptTask}
                    onReject={handleRejectTask}
                    onEdit={() => {}}
                    onSelect={setSelectedTask}
                    isSelected={selectedTask?.task_id === task.task_id}
                  />
                ))}
              </div>
              
              {/* Footer actions */}
              <div className="p-4 border-t border-slate-200 bg-white flex justify-between">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    disabled={acceptedCount === 0 || importing}
                    onClick={handleImport}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        Import to Library
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Step 4: Import Summary */}
          {step === 4 && importResult && (
            <div className="p-12 text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              
              <h3 className="text-2xl font-semibold text-slate-900 mb-2">
                Import Complete!
              </h3>
              <p className="text-slate-500 mb-8 max-w-md mx-auto">
                Your maintenance plan has been converted to failure mode intelligence.
              </p>
              
              {/* Summary stats */}
              <div className="max-w-lg mx-auto bg-slate-50 rounded-xl p-6 mb-8">
                <div className="grid grid-cols-2 gap-4 text-left">
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-3xl font-bold text-blue-600">{importResult.total_imported}</p>
                    <p className="text-sm text-slate-500">Total Imported</p>
                  </div>
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-3xl font-bold text-green-600">{importResult.linked_to_existing}</p>
                    <p className="text-sm text-slate-500">Linked to Existing</p>
                  </div>
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-3xl font-bold text-purple-600">{importResult.new_created}</p>
                    <p className="text-sm text-slate-500">New Created</p>
                  </div>
                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-3xl font-bold text-slate-400">{importResult.skipped}</p>
                    <p className="text-sm text-slate-500">Skipped</p>
                  </div>
                </div>
                
                {importResult.low_confidence_imported > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    {importResult.low_confidence_imported} low confidence items were imported with warnings
                  </div>
                )}
              </div>
              
              <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700">
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PMImportWizard;
