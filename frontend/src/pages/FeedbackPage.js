import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { feedbackAPI } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  AlertCircle,
  Lightbulb,
  MessageCircle,
  Plus,
  Camera,
  X,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquare,
  MoreVertical,
  Pencil,
  Trash2,
  User,
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  Square,
  CheckSquare,
} from "lucide-react";
import { Checkbox } from "../components/ui/checkbox";

// Format relative time (e.g., "2d ago")
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "";
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// Type icons
const typeIcons = {
  issue: AlertCircle,
  improvement: Lightbulb,
  general: MessageCircle,
};

// Type colors
const typeColors = {
  issue: "text-red-500",
  improvement: "text-amber-500",
  general: "text-blue-500",
};

// Status indicators
const statusConfig = {
  new: { icon: Circle, color: "bg-slate-400", label: "New" },
  in_review: { icon: Clock, color: "bg-amber-500", label: "In Review" },
  resolved: { icon: CheckCircle2, color: "bg-green-500", label: "Resolved" },
  planned: { icon: Clock, color: "bg-blue-500", label: "Planned" },
  wont_fix: { icon: X, color: "bg-slate-500", label: "Won't Fix" },
};

// Severity badge colors
const severityColors = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const FeedbackPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  // Check if mobile viewport
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState(null);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // Selection state for AI prompt generation
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  
  // Form state
  const [feedbackType, setFeedbackType] = useState("general");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("");
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Query: Get user's feedback
  const { data: feedbackData, isLoading } = useQuery({
    queryKey: ["my-feedback"],
    queryFn: feedbackAPI.getMyFeedback,
  });

  // Mutation: Submit feedback
  const submitMutation = useMutation({
    mutationFn: async (data) => {
      let screenshotUrl = data.screenshot_url || null;
      
      // Upload screenshot first if present
      if (screenshotFile) {
        setIsUploading(true);
        try {
          const uploadResult = await feedbackAPI.uploadScreenshot(screenshotFile);
          screenshotUrl = uploadResult.url;
        } catch (error) {
          throw new Error("Failed to upload screenshot");
        }
        setIsUploading(false);
      }
      
      // Submit feedback with screenshot URL
      return feedbackAPI.submit({
        ...data,
        screenshot_url: screenshotUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["my-feedback"]);
      toast.success(t("feedback.submitted") || "Feedback submitted successfully");
      resetForm();
      setIsModalOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit feedback");
      setIsUploading(false);
    },
  });

  // Mutation: Update feedback
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      let screenshotUrl = data.screenshot_url;
      
      // Upload new screenshot if present
      if (screenshotFile) {
        setIsUploading(true);
        try {
          const uploadResult = await feedbackAPI.uploadScreenshot(screenshotFile);
          screenshotUrl = uploadResult.url;
        } catch (error) {
          throw new Error("Failed to upload screenshot");
        }
        setIsUploading(false);
      }
      
      return feedbackAPI.update(id, {
        ...data,
        screenshot_url: screenshotUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["my-feedback"]);
      toast.success(t("feedback.updated") || "Feedback updated successfully");
      resetForm();
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingFeedback(null);
      setIsSheetOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update feedback");
      setIsUploading(false);
    },
  });

  // Mutation: Delete feedback
  const deleteMutation = useMutation({
    mutationFn: (id) => feedbackAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["my-feedback"]);
      toast.success(t("feedback.deleted") || "Feedback deleted");
      setDeleteConfirmId(null);
      setIsSheetOpen(false);
      setSelectedFeedback(null);
    },
    onError: () => {
      toast.error("Failed to delete feedback");
    },
  });

  // Mutation: Update status
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => feedbackAPI.update(id, { status }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(["my-feedback"]);
      setSelectedFeedback(data);
      toast.success(t("feedback.statusUpdated") || "Status updated");
    },
    onError: () => {
      toast.error("Failed to update status");
    },
  });

  const resetForm = () => {
    setFeedbackType("general");
    setMessage("");
    setSeverity("");
    setScreenshotFile(null);
    setScreenshotPreview(null);
  };

  const handleSubmit = () => {
    if (!message.trim()) {
      toast.error(t("feedback.messageRequired") || "Please enter a message");
      return;
    }

    const data = {
      type: feedbackType,
      message: message.trim(),
      severity: feedbackType === "issue" ? severity || "medium" : null,
    };

    if (isEditMode && editingFeedback) {
      updateMutation.mutate({ id: editingFeedback.id, data });
    } else {
      submitMutation.mutate(data);
    }
  };

  const handleEdit = (feedback, e) => {
    if (e) e.stopPropagation();
    setEditingFeedback(feedback);
    setFeedbackType(feedback.type);
    setMessage(feedback.message);
    setSeverity(feedback.severity || "");
    setScreenshotPreview(feedback.screenshot_url);
    setIsEditMode(true);
    setIsModalOpen(true);
    setIsSheetOpen(false);
  };

  const handleDelete = (id, e) => {
    if (e) e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId);
    }
  };

  const handleStatusChange = (status) => {
    if (selectedFeedback) {
      updateStatusMutation.mutate({ id: selectedFeedback.id, status });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be less than 5MB");
        return;
      }
      setScreenshotFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setScreenshotPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const clearScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openFeedbackDetail = (feedback) => {
    setSelectedFeedback(feedback);
    setIsSheetOpen(true);
  };

  const openNewFeedbackModal = () => {
    resetForm();
    setIsEditMode(false);
    setEditingFeedback(null);
    setIsModalOpen(true);
  };

  const feedbackItems = feedbackData?.items || [];

  // Selection handlers
  const toggleSelection = (id, e) => {
    if (e) e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === feedbackItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(feedbackItems.map(item => item.id)));
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleGeneratePrompt = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one feedback item");
      return;
    }
    
    setIsGeneratingPrompt(true);
    try {
      const result = await feedbackAPI.generatePrompt(Array.from(selectedIds));
      setGeneratedPrompt(result.prompt);
      setIsPromptDialogOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to generate prompt");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const copyPromptToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopiedPrompt(true);
      toast.success("Prompt copied to clipboard!");
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (error) {
      toast.error("Failed to copy prompt");
    }
  };

  // Inline form content render function
  const renderFormContent = (isFullScreen = false) => (
    <div className={`space-y-4 ${isFullScreen ? 'p-4' : 'py-4'}`}>
      {/* Type Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">
          {t("feedback.type") || "Type"}
        </label>
        <div className="flex gap-2">
          {[
            { value: "issue", label: t("feedback.typeIssue") || "Issue", Icon: AlertCircle, color: "text-red-500 border-red-200 bg-red-50" },
            { value: "improvement", label: t("feedback.typeImprovement") || "Improvement", Icon: Lightbulb, color: "text-amber-500 border-amber-200 bg-amber-50" },
            { value: "general", label: t("feedback.typeGeneral") || "General", Icon: MessageCircle, color: "text-blue-500 border-blue-200 bg-blue-50" },
          ].map(({ value, label, Icon, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFeedbackType(value)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border-2 transition-all ${
                feedbackType === value
                  ? color
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
              data-testid={`feedback-type-${value}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Severity (only for issues) */}
      {feedbackType === "issue" && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            {t("feedback.severity") || "Severity"}
          </label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger data-testid="feedback-severity-select">
              <SelectValue placeholder={t("feedback.selectSeverity") || "Select severity"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("common.low") || "Low"}</SelectItem>
              <SelectItem value="medium">{t("common.medium") || "Medium"}</SelectItem>
              <SelectItem value="high">{t("common.high") || "High"}</SelectItem>
              <SelectItem value="critical">{t("common.critical") || "Critical"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Message */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">
          {t("feedback.message") || "Message"}
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("feedback.messagePlaceholder") || "Describe your feedback..."}
          rows={isFullScreen ? 6 : 4}
          className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          data-testid="feedback-message-input"
        />
      </div>

      {/* Screenshot Upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">
          {t("feedback.screenshot") || "Screenshot"} <span className="text-slate-400 font-normal">({t("common.optional") || "optional"})</span>
        </label>
        
        {screenshotPreview ? (
          <div className="relative inline-block">
            <img
              src={screenshotPreview}
              alt="Screenshot preview"
              className="max-h-32 rounded-lg border border-slate-200"
            />
            <button
              type="button"
              onClick={clearScreenshot}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-slate-300 hover:text-slate-600 transition-colors"
            data-testid="upload-screenshot-btn"
          >
            <Camera className="w-5 h-5" />
            <span className="text-sm">{t("feedback.attachScreenshot") || "Attach screenshot"}</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );

  // Mobile Full-Screen Form View
  if (isMobile && isModalOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                resetForm();
                setIsEditMode(false);
                setEditingFeedback(null);
                setIsModalOpen(false);
              }}
              className="p-1 -ml-1"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {isEditMode 
                  ? (t("feedback.editFeedback") || "Edit Feedback")
                  : (t("feedback.newFeedback") || "New Feedback")
                }
              </h1>
            </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || updateMutation.isPending || isUploading}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="submit-feedback-btn"
          >
            {(submitMutation.isPending || updateMutation.isPending || isUploading) && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            {isEditMode ? (t("common.save") || "Save") : (t("feedback.submit") || "Submit")}
          </Button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {renderFormContent(true)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {t("feedback.title") || "Feedback"}
            </h1>
            <p className="text-slate-500 mt-1">
              {t("feedback.subtitle") || "Your submissions"}
            </p>
          </div>
          {feedbackItems.length > 0 && (
            <div className="flex items-center gap-2">
              {isSelectionMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    data-testid="select-all-btn"
                  >
                    {selectedIds.size === feedbackItems.length ? (
                      <>
                        <Square className="w-4 h-4 mr-2" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-4 h-4 mr-2" />
                        Select All
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleGeneratePrompt}
                    disabled={selectedIds.size === 0 || isGeneratingPrompt}
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="generate-prompt-btn"
                  >
                    {isGeneratingPrompt ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Generate Prompt ({selectedIds.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelSelection}
                    data-testid="cancel-selection-btn"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsSelectionMode(true)}
                    data-testid="start-selection-btn"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI Prompt
                  </Button>
                  <Button
                    onClick={openNewFeedbackModal}
                    className="bg-blue-600 hover:bg-blue-700"
                    data-testid="add-feedback-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t("feedback.sendFeedback") || "Send feedback"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && feedbackItems.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-2">
              {t("feedback.noFeedbackYet") || "No feedback yet"}
            </h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              {t("feedback.noFeedbackDesc") || "Share your thoughts, report issues, or suggest improvements."}
            </p>
            <Button
              onClick={openNewFeedbackModal}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="send-feedback-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("feedback.sendFeedback") || "Send feedback"}
            </Button>
          </div>
        )}

        {/* Feedback List */}
        {!isLoading && feedbackItems.length > 0 && (
          <div className="space-y-3">
            {feedbackItems.map((item) => {
              const TypeIcon = typeIcons[item.type] || MessageCircle;
              const statusCfg = statusConfig[item.status] || statusConfig.new;
              const isSelected = selectedIds.has(item.id);
              
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all duration-150 ${
                    isSelected 
                      ? "border-purple-400 bg-purple-50/50" 
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  data-testid={`feedback-item-${item.id}`}
                  onClick={isSelectionMode ? (e) => toggleSelection(item.id, e) : undefined}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox in selection mode */}
                    {isSelectionMode && (
                      <div 
                        className="mt-0.5 flex-shrink-0"
                        onClick={(e) => toggleSelection(item.id, e)}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                        />
                      </div>
                    )}
                    
                    {/* Type Icon */}
                    <div 
                      className={`mt-0.5 ${typeColors[item.type]} ${!isSelectionMode ? 'cursor-pointer' : ''}`}
                      onClick={!isSelectionMode ? () => openFeedbackDetail(item) : undefined}
                    >
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    
                    {/* Content */}
                    <div 
                      className={`flex-1 min-w-0 ${!isSelectionMode ? 'cursor-pointer' : ''}`}
                      onClick={!isSelectionMode ? () => openFeedbackDetail(item) : undefined}
                    >
                      <p className="text-slate-800 line-clamp-2 text-sm">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {/* Status indicator */}
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${statusCfg.color}`} />
                          <span className="text-xs text-slate-500">{statusCfg.label}</span>
                        </div>
                        {/* Submitted by */}
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <User className="w-3 h-3" />
                          <span>{item.user_name || "Unknown"}</span>
                        </div>
                        {/* Timestamp */}
                        <span className="text-xs text-slate-400">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Actions Menu - hide in selection mode */}
                    {!isSelectionMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-slate-600"
                            data-testid={`feedback-menu-${item.id}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => handleEdit(item, e)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            {t("common.edit") || "Edit"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={(e) => handleDelete(item.id, e)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("common.delete") || "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit/Edit Feedback Modal - Desktop Only */}
      {!isMobile && (
        <Dialog open={isModalOpen} onOpenChange={(open) => {
          if (!open) {
            resetForm();
            setIsEditMode(false);
            setEditingFeedback(null);
          }
          setIsModalOpen(open);
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {isEditMode 
                  ? (t("feedback.editFeedback") || "Edit Feedback")
                  : (t("feedback.newFeedback") || "Send Feedback")
                }
              </DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? (t("feedback.editFeedbackDesc") || "Update your feedback details.")
                  : (t("feedback.newFeedbackDesc") || "Share your thoughts, report an issue, or suggest an improvement.")
                }
              </DialogDescription>
            </DialogHeader>

            {renderFormContent(false)}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  setIsEditMode(false);
                  setEditingFeedback(null);
                  setIsModalOpen(false);
                }}
              >
                {t("common.cancel") || "Cancel"}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || updateMutation.isPending || isUploading}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="submit-feedback-btn"
              >
                {(submitMutation.isPending || updateMutation.isPending || isUploading) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {isEditMode 
                  ? (t("common.save") || "Save")
                  : (t("feedback.submit") || "Submit")
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("feedback.deleteConfirm") || "Delete Feedback?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("feedback.deleteConfirmDesc") || "This action cannot be undone. This will permanently delete your feedback."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel") || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {t("common.delete") || "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feedback Detail Sheet (Bottom Sheet) */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl">
          {selectedFeedback && (
            <>
              <SheetHeader className="pb-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Type Icon */}
                    {(() => {
                      const TypeIcon = typeIcons[selectedFeedback.type] || MessageCircle;
                      return (
                        <div className={`${typeColors[selectedFeedback.type]} p-2 bg-slate-100 rounded-lg`}>
                          <TypeIcon className="w-5 h-5" />
                        </div>
                      );
                    })()}
                    <div>
                      <SheetTitle className="text-left capitalize">
                        {selectedFeedback.type} Feedback
                      </SheetTitle>
                      <SheetDescription className="text-left">
                        {formatRelativeTime(selectedFeedback.timestamp)}
                      </SheetDescription>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(selectedFeedback)}
                      data-testid="sheet-edit-btn"
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      {t("common.edit") || "Edit"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(selectedFeedback.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid="sheet-delete-btn"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      {t("common.delete") || "Delete"}
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <div className="py-6 space-y-6 overflow-y-auto">
                {/* Submitted by */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-600">{t("feedback.submittedBy") || "Submitted by"}:</span>
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-800">{selectedFeedback.user_name || "Unknown"}</span>
                  </div>
                </div>

                {/* Status with change option */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-600">{t("common.status") || "Status"}:</span>
                  <Select 
                    value={selectedFeedback.status} 
                    onValueChange={handleStatusChange}
                  >
                    <SelectTrigger className="w-40" data-testid="status-select">
                      <SelectValue>
                        {(() => {
                          const statusCfg = statusConfig[selectedFeedback.status] || statusConfig.new;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${statusCfg.color}`} />
                              <span>{statusCfg.label}</span>
                            </div>
                          );
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          New
                        </div>
                      </SelectItem>
                      <SelectItem value="resolved">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Resolved
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Severity (if issue) */}
                {selectedFeedback.type === "issue" && selectedFeedback.severity && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">{t("feedback.severity") || "Severity"}:</span>
                    <Badge className={severityColors[selectedFeedback.severity]}>
                      {selectedFeedback.severity.charAt(0).toUpperCase() + selectedFeedback.severity.slice(1)}
                    </Badge>
                  </div>
                )}

                {/* Full Message */}
                <div>
                  <h4 className="text-sm font-medium text-slate-600 mb-2">{t("feedback.message") || "Message"}</h4>
                  <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedFeedback.message}
                  </p>
                </div>

                {/* Screenshot */}
                {selectedFeedback.screenshot_url && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-600 mb-2">{t("feedback.screenshot") || "Screenshot"}</h4>
                    <img
                      src={selectedFeedback.screenshot_url}
                      alt="Feedback screenshot"
                      className="max-w-full rounded-lg border border-slate-200"
                    />
                  </div>
                )}

                {/* System Response */}
                {selectedFeedback.user_visible_response && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">{t("feedback.response") || "Response"}</h4>
                    <p className="text-blue-700 text-sm leading-relaxed">
                      {selectedFeedback.user_visible_response}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Generated Prompt Dialog */}
      <Dialog open={isPromptDialogOpen} onOpenChange={setIsPromptDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Generated AI Prompt
            </DialogTitle>
            <DialogDescription>
              Copy this prompt and paste it directly to your Emergent Agent to implement the selected feedback items.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto my-4">
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
              {generatedPrompt}
            </div>
          </div>
          
          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsPromptDialogOpen(false);
                setGeneratedPrompt("");
                cancelSelection();
              }}
            >
              Close
            </Button>
            <Button
              onClick={copyPromptToClipboard}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="copy-prompt-btn"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Prompt
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeedbackPage;
