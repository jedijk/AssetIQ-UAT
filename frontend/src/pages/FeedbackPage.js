import { useState, useRef, useEffect } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { useAuth } from "../contexts/AuthContext";
import { feedbackAPI, getErrorMessage } from "../lib/api";
import { formatDateRelative } from "../lib/dateUtils";
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
  Snowflake,
  List,
  LayoutGrid,
  Archive,
  Ban,
  Mic,
  MicOff,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import { Checkbox } from "../components/ui/checkbox";

// Format relative time using user preferences
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "";
  return formatDateRelative(timestamp);
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

// Status indicators - expanded with new statuses
const statusConfig = {
  new: { icon: Circle, color: "bg-slate-400", label: "New" },
  in_review: { icon: Clock, color: "bg-amber-500", label: "In Review" },
  resolved: { icon: CheckCircle2, color: "bg-green-500", label: "Resolved" },
  planned: { icon: Clock, color: "bg-blue-500", label: "Planned" },
  wont_fix: { icon: X, color: "bg-slate-500", label: "Won't Fix" },
  implemented: { icon: CheckCircle2, color: "bg-emerald-500", label: "Implemented" },
  parked: { icon: Clock, color: "bg-orange-400", label: "Parked" },
  rejected: { icon: X, color: "bg-red-500", label: "Rejected" },
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
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  // Permission checks
  const canWrite = hasPermission("feedback", "write");
  const canDelete = hasPermission("feedback", "delete");
  // Owners, admins, and managers can view all feedback
  const canViewAll = ["owner", "admin", "manager"].includes(user?.role);

  const isMobile = useIsMobile();

  // State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState(null);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [viewMode, setViewMode] = useState('my'); // 'my' or 'all' (for admins)
  const [ownerResponse, setOwnerResponse] = useState(''); // Owner's response to feedback
  const [isSavingResponse, setIsSavingResponse] = useState(false);
  
  // Timeline view mode: 'list' | 'snowflake'
  const [timelineView, setTimelineView] = useState(() => {
    return localStorage.getItem('feedback_timeline_view') || 'list';
  });
  
  // Status filter
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Selection state for AI prompt generation
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  
  // Persist timeline view preference
  useEffect(() => {
    localStorage.setItem('feedback_timeline_view', timelineView);
  }, [timelineView]);
  
  // Form state
  const [feedbackType, setFeedbackType] = useState("general");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("");
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);

  // Query: Get feedback based on view mode
  const { data: feedbackData, isLoading } = useQuery({
    queryKey: ["feedback", viewMode],
    queryFn: () => viewMode === 'all' && canViewAll ? feedbackAPI.getAllFeedback() : feedbackAPI.getMyFeedback(),
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
          setIsUploading(false);
          // Provide more specific error messages
          if (error.code === 'ERR_NETWORK' || error.message?.includes('network')) {
            throw new Error("Network error - please check your connection and try again");
          }
          if (error.response?.status === 413) {
            throw new Error("Screenshot file is too large. Please use a smaller image.");
          }
          throw new Error("Failed to upload screenshot. Please try again.");
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
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success(t("feedback.submitted") || "Feedback submitted successfully");
      resetForm();
      setIsModalOpen(false);
    },
    onError: (error) => {
      // More specific error handling
      let errorMessage = "Failed to submit feedback";
      if (error.code === 'ERR_NETWORK' || error.message?.includes('network')) {
        errorMessage = "Network error - please check your connection and try again";
      } else if (error.response?.status === 401) {
        errorMessage = "Session expired - please log in again";
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast.error(errorMessage);
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
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
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

  // Mutation: Delete feedback (use admin endpoint for owner/admin/manager)
  const deleteMutation = useMutation({
    mutationFn: ({ id, useAdmin }) => {
      if (useAdmin) {
        return feedbackAPI.adminDelete(id);
      }
      return feedbackAPI.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success(t("feedback.deleted") || "Feedback deleted");
      setDeleteConfirmId(null);
      setIsSheetOpen(false);
      setSelectedFeedback(null);
    },
    onError: () => {
      toast.error("Failed to delete feedback");
    },
  });

  // Mutation: Update status (use admin endpoint when viewing all feedback)
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => {
      // Use admin endpoint when owner/admin/manager is viewing all feedback
      if (viewMode === 'all' && canViewAll) {
        return feedbackAPI.adminUpdate(id, { status });
      }
      return feedbackAPI.update(id, { status });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      setSelectedFeedback(data);
      toast.success(t("feedback.statusUpdated") || "Status updated");
    },
    onError: () => {
      toast.error("Failed to update status");
    },
  });

  // Mutation: Save owner response
  const saveResponseMutation = useMutation({
    mutationFn: ({ id, response }) => feedbackAPI.adminUpdate(id, { user_visible_response: response }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      setSelectedFeedback(data);
      setIsSavingResponse(false);
      toast.success("Response saved");
    },
    onError: () => {
      setIsSavingResponse(false);
      toast.error("Failed to save response");
    },
  });

  // Handler to save owner response
  const handleSaveResponse = () => {
    if (!selectedFeedback) return;
    setIsSavingResponse(true);
    saveResponseMutation.mutate({ id: selectedFeedback.id, response: ownerResponse });
  };

  // Mutation: Bulk update status
  const bulkUpdateStatusMutation = useMutation({
    mutationFn: ({ feedbackIds, status }) => feedbackAPI.bulkUpdateStatus(feedbackIds, status),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success(t("feedback.bulkStatusUpdated")?.replace("{count}", data.updated_count) || `Updated ${data.updated_count} items`);
      cancelSelection();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to update status"));
    },
  });

  const handleBulkStatusUpdate = (status) => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one feedback item");
      return;
    }
    bulkUpdateStatusMutation.mutate({
      feedbackIds: Array.from(selectedIds),
      status: status
    });
  };

  const resetForm = () => {
    setFeedbackType("general");
    setMessage("");
    setSeverity("");
    setScreenshotFile(null);
    setScreenshotPreview(null);
    clearRecording();
    setTranscribedText("");
  };

  const handleSubmit = () => {
    if (!message.trim() && !audioBlob) {
      toast.error(t("feedback.messageRequired") || "Please enter a message or record audio");
      return;
    }

    const data = {
      type: feedbackType,
      message: message.trim(),
      severity: feedbackType === "issue" ? severity || "medium" : null,
      has_audio: !!audioBlob,
    };
    
    // If there's audio, we need to convert it to base64 and include it
    if (audioBlob) {
      const reader = new FileReader();
      reader.onloadend = () => {
        data.audio_data = reader.result;
        if (isEditMode && editingFeedback) {
          updateMutation.mutate({ id: editingFeedback.id, data });
        } else {
          submitMutation.mutate(data);
        }
      };
      reader.readAsDataURL(audioBlob);
    } else {
      if (isEditMode && editingFeedback) {
        updateMutation.mutate({ id: editingFeedback.id, data });
      } else {
        submitMutation.mutate(data);
      }
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
      deleteMutation.mutate({ id: deleteConfirmId, useAdmin: canViewAll });
    }
  };

  const handleStatusChange = (status) => {
    if (selectedFeedback) {
      updateStatusMutation.mutate({ id: selectedFeedback.id, status });
    }
  };

  // Quick status change from dropdown menu
  const handleQuickStatusChange = (itemId, status, e) => {
    if (e) e.stopPropagation();
    updateStatusMutation.mutate({ id: itemId, status });
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
    setOwnerResponse(feedback.user_visible_response || '');
    setIsSheetOpen(true);
  };

  const openNewFeedbackModal = () => {
    // Reset mutation state first
    submitMutation.reset();
    updateMutation.reset();
    // Then reset form
    resetForm();
    setIsEditMode(false);
    setEditingFeedback(null);
    setIsModalOpen(true);
  };

  const allFeedbackItems = feedbackData?.items || [];
  
  // Filter feedback items by status
  const feedbackItems = statusFilter === 'all' 
    ? allFeedbackItems 
    : allFeedbackItems.filter(item => item.status === statusFilter);

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
      toast.error(getErrorMessage(error, "Failed to generate prompt"));
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

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try to use a supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start duration counter
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error(t("feedback.microphoneError") || "Could not access microphone. Please check permissions.");
    }
  };
  
  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };
  
  // Auto-transcribe when audio blob is set
  useEffect(() => {
    const transcribeAudio = async () => {
      if (audioBlob && !transcribedText && !isTranscribing) {
        setIsTranscribing(true);
        try {
          const result = await feedbackAPI.transcribeAudio(audioBlob);
          if (result.success && result.text) {
            setTranscribedText(result.text);
            // Append transcribed text to the message if message is empty
            if (!message.trim()) {
              setMessage(result.text);
            } else {
              // Optionally append to existing message
              setMessage(prev => prev + "\n\n[Voice transcription]: " + result.text);
            }
            toast.success(t("feedback.transcriptionComplete") || "Voice message transcribed!");
          }
        } catch (error) {
          console.error('Transcription failed:', error);
          toast.error(t("feedback.transcriptionFailed") || "Could not transcribe voice message. You can still submit with audio attached.");
        } finally {
          setIsTranscribing(false);
        }
      }
    };
    
    transcribeAudio();
  }, [audioBlob]); // eslint-disable-line
  
  const clearRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingDuration(0);
    setTranscribedText("");
  };
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

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

      {/* Voice Recording */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">
          {t("feedback.voiceMessage") || "Voice Message"} <span className="text-slate-400 font-normal">({t("common.optional") || "optional"})</span>
        </label>
        
        {audioUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Volume2 className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700">{t("feedback.voiceRecorded") || "Voice message recorded"}</p>
                <p className="text-xs text-slate-500">{formatDuration(recordingDuration)}</p>
              </div>
              <audio src={audioUrl} controls className="h-8 w-32" />
              <button
                type="button"
                onClick={clearRecording}
                className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                data-testid="clear-recording-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Transcription status/result */}
            {isTranscribing ? (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-700">{t("feedback.transcribing") || "Transcribing voice message..."}</span>
              </div>
            ) : transcribedText ? (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-green-700">{t("feedback.transcribedText") || "Transcribed text added to message"}</span>
                </div>
                <p className="text-xs text-green-600 line-clamp-2">{transcribedText}</p>
              </div>
            ) : null}
          </div>
        ) : isRecording ? (
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="flex-shrink-0 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700">{t("feedback.recording") || "Recording..."}</p>
              <p className="text-xs text-red-600">{formatDuration(recordingDuration)}</p>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
              data-testid="stop-recording-btn"
            >
              <MicOff className="w-4 h-4" />
              {t("feedback.stopRecording") || "Stop"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
            data-testid="start-recording-btn"
          >
            <Mic className="w-5 h-5" />
            <span className="text-sm">{t("feedback.recordVoice") || "Record voice message (auto-transcribed)"}</span>
          </button>
        )}
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
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Header - Mobile Optimized */}
        <div className="mb-4 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-shrink-0">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
                {t("feedback.title") || "Feedback"}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {viewMode === 'all' ? "All user submissions" : (t("feedback.subtitle") || "Your submissions")}
              </p>
            </div>
            
            {/* View Mode Toggle for admins/owners */}
            {canViewAll && (
              <div className="flex items-center gap-1 bg-slate-200 rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('my')}
                  className={`text-xs h-7 px-3 ${viewMode === 'my' ? 'bg-white shadow-sm text-slate-900 hover:bg-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                  data-testid="view-my-feedback-btn"
                >
                  My Feedback
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('all')}
                  className={`text-xs h-7 px-3 ${viewMode === 'all' ? 'bg-white shadow-sm text-slate-900 hover:bg-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                  data-testid="view-all-feedback-btn"
                >
                  All Feedback
                </Button>
              </div>
            )}
            
            {/* Action buttons - responsive layout */}
            {allFeedbackItems.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {isSelectionMode ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAll}
                      className="text-xs sm:text-sm"
                      data-testid="select-all-btn"
                    >
                      {selectedIds.size === feedbackItems.length ? (
                        <>
                          <Square className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Deselect All</span>
                          <span className="sm:hidden">Deselect</span>
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Select All</span>
                          <span className="sm:hidden">Select</span>
                        </>
                      )}
                    </Button>
                    {/* Bulk Complete Button */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={selectedIds.size === 0 || bulkUpdateStatusMutation.isPending}
                          className="text-xs sm:text-sm text-green-600 hover:text-green-700 border-green-200"
                          data-testid="bulk-status-btn"
                        >
                          {bulkUpdateStatusMutation.isPending ? (
                            <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                          )}
                          <span className="hidden sm:inline">Bulk Status</span>
                          <span className="sm:hidden">Status</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("implemented")} className="text-emerald-600">
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Mark as Implemented
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("resolved")} className="text-green-600">
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Mark as Resolved
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("in_review")} className="text-amber-600">
                          <Clock className="w-4 h-4 mr-2" />
                          Mark as In Review
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("parked")} className="text-orange-500">
                          <Archive className="w-4 h-4 mr-2" />
                          Mark as Parked
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleBulkStatusUpdate("rejected")} className="text-red-600">
                          <Ban className="w-4 h-4 mr-2" />
                          Mark as Rejected
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      onClick={handleGeneratePrompt}
                      disabled={selectedIds.size === 0 || isGeneratingPrompt}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-xs sm:text-sm"
                      data-testid="generate-prompt-btn"
                    >
                      {isGeneratingPrompt ? (
                        <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      )}
                      <span className="hidden sm:inline">Generate Prompt</span>
                      <span className="sm:hidden">Generate</span>
                      <span className="ml-1">({selectedIds.size})</span>
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
                      size="sm"
                      onClick={() => setIsSelectionMode(true)}
                      className="text-xs sm:text-sm"
                      data-testid="start-selection-btn"
                    >
                      <CheckSquare className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Select
                    </Button>
                    <Button
                      onClick={openNewFeedbackModal}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm"
                      data-testid="add-feedback-btn"
                    >
                      <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{t("feedback.sendFeedback") || "Send feedback"}</span>
                      <span className="sm:hidden">New</span>
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Filters and View Controls Row */}
          {allFeedbackItems.length > 0 && !isSelectionMode && (
            <div className="flex items-center justify-between mt-4 gap-2">
              {/* Status Filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32 sm:w-40 h-8 text-xs sm:text-sm" data-testid="status-filter">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        New
                      </div>
                    </SelectItem>
                    <SelectItem value="in_review">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        In Review
                      </div>
                    </SelectItem>
                    <SelectItem value="implemented">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Implemented
                      </div>
                    </SelectItem>
                    <SelectItem value="parked">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-orange-400" />
                        Parked
                      </div>
                    </SelectItem>
                    <SelectItem value="rejected">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Rejected
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
                
                {statusFilter !== 'all' && (
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {feedbackItems.length} of {allFeedbackItems.length}
                  </span>
                )}
              </div>
              
              {/* Timeline View Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
                <button
                  onClick={() => setTimelineView('list')}
                  className={`p-1.5 rounded-md transition-colors ${
                    timelineView === 'list' 
                      ? 'bg-white shadow-sm text-slate-900' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  title="List view"
                  data-testid="view-list-btn"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTimelineView('snowflake')}
                  className={`p-1.5 rounded-md transition-colors ${
                    timelineView === 'snowflake' 
                      ? 'bg-white shadow-sm text-blue-600' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  title="Snowflake view (grouped by status)"
                  data-testid="view-snowflake-btn"
                >
                  <Snowflake className="w-4 h-4" />
                </button>
              </div>
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
          <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" />
            </div>
            <h3 className="text-base sm:text-lg font-medium text-slate-800 mb-2">
              {statusFilter !== 'all' 
                ? `No ${statusConfig[statusFilter]?.label || statusFilter} feedback`
                : (t("feedback.noFeedbackYet") || "No feedback yet")
              }
            </h3>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              {statusFilter !== 'all'
                ? "Try selecting a different status filter."
                : (t("feedback.noFeedbackDesc") || "Share your thoughts, report issues, or suggest improvements.")
              }
            </p>
            {statusFilter === 'all' && (
              <Button
                onClick={openNewFeedbackModal}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="send-feedback-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("feedback.sendFeedback") || "Send feedback"}
              </Button>
            )}
          </div>
        )}

        {/* Feedback List - List View */}
        {!isLoading && feedbackItems.length > 0 && timelineView === 'list' && (
          <div className="space-y-2 sm:space-y-3">
            {feedbackItems.map((item) => {
              const TypeIcon = typeIcons[item.type] || MessageCircle;
              const statusCfg = statusConfig[item.status] || statusConfig.new;
              const isSelected = selectedIds.has(item.id);
              
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-lg sm:rounded-xl border p-3 sm:p-4 transition-all duration-150 ${
                    isSelected 
                      ? "border-purple-400 bg-purple-50/50" 
                      : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  } ${!isSelectionMode ? 'cursor-pointer active:bg-slate-50' : ''}`}
                  data-testid={`feedback-item-${item.id}`}
                  onClick={!isSelectionMode ? () => openFeedbackDetail(item) : (e) => toggleSelection(item.id, e)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && (!isSelectionMode ? openFeedbackDetail(item) : toggleSelection(item.id, e))}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    {/* Checkbox in selection mode */}
                    {isSelectionMode && (
                      <div 
                        className="mt-0.5 flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); toggleSelection(item.id, e); }}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                        />
                      </div>
                    )}
                    
                    {/* Type Icon */}
                    <div className={`mt-0.5 flex-shrink-0 ${typeColors[item.type]}`}>
                      <TypeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 line-clamp-2 text-xs sm:text-sm">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2 flex-wrap">
                        {/* Status indicator */}
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${statusCfg.color}`} />
                          <span className="text-[10px] sm:text-xs text-slate-500">{statusCfg.label}</span>
                        </div>
                        {/* Submitted by - only show in All Feedback view */}
                        {viewMode === 'all' && (
                          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-blue-600 font-medium">
                            <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            <span className="truncate max-w-[100px] sm:max-w-none">{item.user_name || "Unknown"}</span>
                          </div>
                        )}
                        {/* Timestamp */}
                        <span className="text-[10px] sm:text-xs text-slate-400">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Actions Menu - hide in selection mode */}
                    {!isSelectionMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 sm:h-8 sm:w-8 text-slate-400 hover:text-slate-600 flex-shrink-0"
                            data-testid={`feedback-menu-${item.id}`}
                          >
                            <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* Quick status changes for owner/admin/manager */}
                          {canViewAll && (
                            <>
                              <DropdownMenuItem 
                                onClick={(e) => handleQuickStatusChange(item.id, 'in_review', e)}
                                className="text-amber-600"
                              >
                                <Clock className="w-4 h-4 mr-2" />
                                Mark In Review
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => handleQuickStatusChange(item.id, 'implemented', e)}
                                className="text-emerald-600"
                              >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Mark Implemented
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {canWrite && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(item, e); }}>
                            <Pencil className="w-4 h-4 mr-2" />
                            {t("common.edit") || "Edit"}
                          </DropdownMenuItem>
                          )}
                          {(canDelete || canViewAll) && (
                          <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id, e); }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("common.delete") || "Delete"}
                          </DropdownMenuItem>
                          </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Feedback List - Snowflake View (Grouped by Status) */}
        {!isLoading && feedbackItems.length > 0 && timelineView === 'snowflake' && (
          <div className="space-y-6">
            {/* Group items by status */}
            {Object.entries(
              feedbackItems.reduce((groups, item) => {
                const status = item.status || 'new';
                if (!groups[status]) groups[status] = [];
                groups[status].push(item);
                return groups;
              }, {})
            )
            .sort(([a], [b]) => {
              // Sort order: new, in_review, implemented, parked, rejected, resolved
              const order = ['new', 'in_review', 'implemented', 'parked', 'rejected', 'resolved', 'planned', 'wont_fix'];
              return order.indexOf(a) - order.indexOf(b);
            })
            .map(([status, items]) => {
              const statusCfg = statusConfig[status] || statusConfig.new;
              const StatusIcon = statusCfg.icon;
              
              return (
                <div key={status} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* Status Header */}
                  <div className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 bg-slate-50`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${statusCfg.color}`} />
                    <span className="text-sm font-medium text-slate-700">{statusCfg.label}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {items.length}
                    </Badge>
                  </div>
                  
                  {/* Items */}
                  <div className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const TypeIcon = typeIcons[item.type] || MessageCircle;
                      const isSelected = selectedIds.has(item.id);
                      
                      return (
                        <div
                          key={item.id}
                          className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 hover:bg-slate-50 transition-colors ${
                            isSelected ? "bg-purple-50/50" : ""
                          } ${!isSelectionMode ? 'cursor-pointer' : ''}`}
                          onClick={isSelectionMode 
                            ? (e) => toggleSelection(item.id, e) 
                            : () => openFeedbackDetail(item)
                          }
                          data-testid={`feedback-item-${item.id}`}
                        >
                          {isSelectionMode && (
                            <div className="mt-0.5 flex-shrink-0">
                              <Checkbox
                                checked={isSelected}
                                className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                              />
                            </div>
                          )}
                          
                          <div className={`mt-0.5 flex-shrink-0 ${typeColors[item.type]}`}>
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm text-slate-800 line-clamp-2">{item.message}</p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] sm:text-xs text-slate-400">
                              {viewMode === 'all' && (
                                <>
                                  <span className="text-blue-600 font-medium">{item.user_name || "Unknown"}</span>
                                  <span>•</span>
                                </>
                              )}
                              <span>{formatRelativeTime(item.timestamp)}</span>
                            </div>
                          </div>
                          
                          {!isSelectionMode && (canWrite || canDelete || canViewAll) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 flex-shrink-0">
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {/* Quick status changes for owner/admin/manager */}
                                {canViewAll && (
                                  <>
                                    <DropdownMenuItem 
                                      onClick={(e) => handleQuickStatusChange(item.id, 'in_review', e)}
                                      className="text-amber-600"
                                    >
                                      <Clock className="w-4 h-4 mr-2" />
                                      Mark In Review
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={(e) => handleQuickStatusChange(item.id, 'implemented', e)}
                                      className="text-emerald-600"
                                    >
                                      <CheckCircle2 className="w-4 h-4 mr-2" />
                                      Mark Implemented
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {canWrite && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(item, e); }}>
                                  <Pencil className="w-4 h-4 mr-2" />Edit
                                </DropdownMenuItem>
                                )}
                                {(canDelete || canViewAll) && (
                                <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(item.id, e); }} className="text-red-600">
                                  <Trash2 className="w-4 h-4 mr-2" />Delete
                                </DropdownMenuItem>
                                </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })}
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
                      <SelectItem value="in_review">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          In Review
                        </div>
                      </SelectItem>
                      <SelectItem value="implemented">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Implemented
                        </div>
                      </SelectItem>
                      <SelectItem value="parked">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-orange-400" />
                          Parked
                        </div>
                      </SelectItem>
                      <SelectItem value="rejected">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Rejected
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

                {/* Full Message - Improved sizing for long content */}
                <div>
                  <h4 className="text-sm font-medium text-slate-600 mb-2">{t("feedback.message") || "Message"}</h4>
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 sm:p-4 max-h-[200px] overflow-y-auto">
                    <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {selectedFeedback.message}
                    </p>
                  </div>
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

                {/* Owner Response Section */}
                {canViewAll && viewMode === 'all' ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">
                      {t("feedback.ownerResponse") || "Owner Response"}
                    </h4>
                    <textarea
                      value={ownerResponse}
                      onChange={(e) => setOwnerResponse(e.target.value)}
                      placeholder="Add a response to this feedback..."
                      className="w-full min-h-[80px] p-2 text-sm border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                      data-testid="owner-response-input"
                    />
                    <div className="flex justify-end mt-2">
                      <Button
                        size="sm"
                        onClick={handleSaveResponse}
                        disabled={isSavingResponse || ownerResponse === (selectedFeedback.user_visible_response || '')}
                        data-testid="save-response-btn"
                      >
                        {isSavingResponse ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Response"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : selectedFeedback.user_visible_response ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">{t("feedback.response") || "Response"}</h4>
                    <p className="text-blue-700 text-sm leading-relaxed">
                      {selectedFeedback.user_visible_response}
                    </p>
                  </div>
                ) : null}
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
