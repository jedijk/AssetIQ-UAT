import { useState, useRef, useEffect } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import { useAuth } from "../../contexts/AuthContext";
import { feedbackAPI, getErrorMessage } from "../../lib/api";
import { formatRelativeTime, severityColors, statusConfig, typeColors } from "../../features/feedback/feedbackShared";
import { FeedbackFormContent } from "./FeedbackFormContent";
import { FeedbackPageHeader } from "./FeedbackPageHeader";
import { FeedbackListView } from "./FeedbackListView";
import { FeedbackSnowflakeView } from "./FeedbackSnowflakeView";
import { AuthenticatedImage } from "../../components/AuthenticatedMedia";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../../components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
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
import { Checkbox } from "../../components/ui/checkbox";

export default function FeedbackPage() {
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
  const { data: feedbackData, isLoading, error: feedbackError, refetch } = useQuery({
    queryKey: ["feedback", viewMode],
    queryFn: () => viewMode === 'all' && canViewAll ? feedbackAPI.getAllFeedback() : feedbackAPI.getMyFeedback(),
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
    retry: 2,
  });

  // Mark responses as seen when user views their feedback (not for admins viewing all)
  useEffect(() => {
    if (viewMode === 'my' && !canViewAll && feedbackData?.items?.length > 0) {
      // Check if any feedback has unread responses
      const hasUnreadResponses = feedbackData.items.some(
        item => item.user_visible_response && !item.response_seen_by_user
      );
      if (hasUnreadResponses) {
        feedbackAPI.markResponsesSeen().then(() => {
          queryClient.invalidateQueries({ queryKey: ["unread-responses-count"] });
        }).catch(err => console.error("Failed to mark responses as seen:", err));
      }
    }
  }, [feedbackData, viewMode, canViewAll, queryClient]);

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
    onSuccess: (created) => {
      const prependCreated = (old) => {
        const prevItems = old?.items || [];
        const withoutDup = prevItems.filter((item) => item.id !== created.id);
        return {
          items: [created, ...withoutDup],
          total: withoutDup.length + 1,
        };
      };
      queryClient.setQueryData(["feedback", "my"], prependCreated);
      if (canViewAll) {
        queryClient.setQueryData(["feedback", "all"], prependCreated);
      }
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      queryClient.invalidateQueries({ queryKey: ["unread-feedback-count"] });
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
      // Invalidate notification counts so users see the new response
      queryClient.invalidateQueries({ queryKey: ["unread-responses-count"] });
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

  const submitFeedbackData = (data) => {
    if (isEditMode && editingFeedback) {
      updateMutation.mutate({ id: editingFeedback.id, data });
    } else {
      submitMutation.mutate(data);
    }
  };

  const handleSubmit = () => {
    if (!message.trim() && !audioBlob && !screenshotFile) {
      toast.error(
        t("feedback.messageRequired")
          || "Please enter a message, record audio, or attach a screenshot"
      );
      return;
    }

    const data = {
      type: feedbackType,
      message: message.trim(),
      severity: feedbackType === "issue" ? severity || "medium" : null,
    };

    if (audioBlob) {
      const reader = new FileReader();
      reader.onerror = () => {
        toast.error(
          t("feedback.audioReadFailed")
            || "Could not read the voice recording. Please try recording again."
        );
      };
      reader.onloadend = () => {
        if (!reader.result) {
          toast.error(
            t("feedback.audioReadFailed")
              || "Could not read the voice recording. Please try recording again."
          );
          return;
        }
        submitFeedbackData({ ...data, audio_data: reader.result });
      };
      reader.readAsDataURL(audioBlob);
      return;
    }

    submitFeedbackData(data);
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
  const formContentProps = {
    t,
    feedbackType,
    setFeedbackType,
    severity,
    setSeverity,
    message,
    setMessage,
    screenshotPreview,
    clearScreenshot,
    fileInputRef,
    handleFileSelect,
    audioUrl,
    isRecording,
    recordingDuration,
    formatDuration,
    isTranscribing,
    transcribedText,
    clearRecording,
    stopRecording,
    startRecording,
  };

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
          <FeedbackFormContent isFullScreen {...formContentProps} />
        </div>
      </div>
    );
  }

  // Show error state if query failed
  if (feedbackError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            {t("feedback.loadError") || "Unable to load feedback"}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {feedbackError?.message || "An error occurred while loading feedback data."}
          </p>
          <Button onClick={() => refetch()} className="w-full">
            {t("common.retry") || "Try Again"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <FeedbackPageHeader
          t={t}
          viewMode={viewMode}
          setViewMode={setViewMode}
          canViewAll={canViewAll}
          allFeedbackItems={allFeedbackItems}
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          feedbackItems={feedbackItems}
          bulkUpdateStatusMutation={bulkUpdateStatusMutation}
          toggleSelectAll={toggleSelectAll}
          handleBulkStatusUpdate={handleBulkStatusUpdate}
          handleGeneratePrompt={handleGeneratePrompt}
          isGeneratingPrompt={isGeneratingPrompt}
          cancelSelection={cancelSelection}
          setIsSelectionMode={setIsSelectionMode}
          openNewFeedbackModal={openNewFeedbackModal}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          timelineView={timelineView}
          setTimelineView={setTimelineView}
        />

        {/* Loading State */}        {/* Loading State */}
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

        {!isLoading && feedbackItems.length > 0 && timelineView === 'list' && (
          <FeedbackListView
            t={t}
            feedbackItems={feedbackItems}
            viewMode={viewMode}
            selectedIds={selectedIds}
            isSelectionMode={isSelectionMode}
            canViewAll={canViewAll}
            canWrite={canWrite}
            canDelete={canDelete}
            openFeedbackDetail={openFeedbackDetail}
            toggleSelection={toggleSelection}
            handleQuickStatusChange={handleQuickStatusChange}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
          />
        )}

        {!isLoading && feedbackItems.length > 0 && timelineView === 'snowflake' && (
          <FeedbackSnowflakeView
            feedbackItems={feedbackItems}
            viewMode={viewMode}
            selectedIds={selectedIds}
            isSelectionMode={isSelectionMode}
            canViewAll={canViewAll}
            canWrite={canWrite}
            canDelete={canDelete}
            openFeedbackDetail={openFeedbackDetail}
            toggleSelection={toggleSelection}
            handleQuickStatusChange={handleQuickStatusChange}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
          />
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
          <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
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

            <div className="flex-1 overflow-y-auto py-2">
              <FeedbackFormContent {...formContentProps} />
            </div>

            <DialogFooter className="flex-shrink-0 pt-4 border-t">
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
        <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl flex flex-col">
          {selectedFeedback && (
            <>
              <SheetHeader className="pb-4 border-b border-slate-200 flex-shrink-0 pr-10">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Type Icon */}
                    {(() => {
                      const TypeIcon = ({ issue: AlertCircle, improvement: Lightbulb, general: MessageCircle })[selectedFeedback.type] || MessageCircle;
                      return (
                        <div className={`${typeColors[selectedFeedback.type]} p-2 bg-slate-100 rounded-lg flex-shrink-0`}>
                          <TypeIcon className="w-5 h-5" />
                        </div>
                      );
                    })()}
                    <div className="min-w-0">
                      <SheetTitle className="text-left capitalize">
                        {selectedFeedback.type} Feedback
                      </SheetTitle>
                      <SheetDescription className="text-left">
                        {formatRelativeTime(selectedFeedback.timestamp)}
                      </SheetDescription>
                    </div>
                  </div>
                  {/* Action buttons - wrap on mobile */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(selectedFeedback)}
                      data-testid="sheet-edit-btn"
                      className="h-8 px-2 sm:px-3"
                    >
                      <Pencil className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">{t("common.edit") || "Edit"}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(selectedFeedback.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2 sm:px-3"
                      data-testid="sheet-delete-btn"
                    >
                      <Trash2 className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">{t("common.delete") || "Delete"}</span>
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <div className="py-6 space-y-6 flex-1 overflow-y-auto min-h-0">
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
                    <AuthenticatedImage
                      src={selectedFeedback.screenshot_url.startsWith('/api/') 
                        ? selectedFeedback.screenshot_url 
                        : `/api/storage/${selectedFeedback.screenshot_url}`}
                      alt="Feedback screenshot"
                      className="max-w-full rounded-lg border border-slate-200"
                    />
                  </div>
                )}

                {/* Owner Response Section */}
                {canViewAll ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">
                      {t("feedback.ownerResponse") || "Response to User"}
                    </h4>
                    <textarea
                      value={ownerResponse}
                      onChange={(e) => setOwnerResponse(e.target.value)}
                      placeholder="Add a response to let the user know what was done about their feedback..."
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
                    <h4 className="text-sm font-medium text-blue-800 mb-2">{t("feedback.responseFromTeam") || "Response from Team"}</h4>
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

