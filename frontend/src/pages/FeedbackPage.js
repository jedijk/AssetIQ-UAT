import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { feedbackAPI } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
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
  Upload,
  Image as ImageIcon,
  MessageSquare,
} from "lucide-react";

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

  // State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  
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
      let screenshotUrl = null;
      
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

    submitMutation.mutate(data);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be less than 5MB");
        return;
      }
      setScreenshotFile(file);
      // Create preview
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

  const feedbackItems = feedbackData?.items || [];

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
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="add-feedback-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("feedback.sendFeedback") || "Send feedback"}
            </Button>
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
              onClick={() => setIsModalOpen(true)}
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
              
              return (
                <div
                  key={item.id}
                  onClick={() => openFeedbackDetail(item)}
                  className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all duration-150"
                  data-testid={`feedback-item-${item.id}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Type Icon */}
                    <div className={`mt-0.5 ${typeColors[item.type]}`}>
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 line-clamp-2 text-sm">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        {/* Status indicator */}
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${statusCfg.color}`} />
                          <span className="text-xs text-slate-500">{statusCfg.label}</span>
                        </div>
                        {/* Timestamp */}
                        <span className="text-xs text-slate-400">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit Feedback Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("feedback.newFeedback") || "Send Feedback"}</DialogTitle>
            <DialogDescription>
              {t("feedback.newFeedbackDesc") || "Share your thoughts, report an issue, or suggest an improvement."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("feedback.messagePlaceholder") || "Describe your feedback..."}
                rows={4}
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
                    onClick={clearScreenshot}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
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

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setIsModalOpen(false);
              }}
            >
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || isUploading}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="submit-feedback-btn"
            >
              {(submitMutation.isPending || isUploading) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {t("feedback.submit") || "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Detail Sheet (Bottom Sheet) */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl">
          {selectedFeedback && (
            <>
              <SheetHeader className="pb-4 border-b border-slate-200">
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
              </SheetHeader>

              <div className="py-6 space-y-6 overflow-y-auto">
                {/* Status Badge */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-600">Status:</span>
                  {(() => {
                    const statusCfg = statusConfig[selectedFeedback.status] || statusConfig.new;
                    return (
                      <Badge variant="outline" className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${statusCfg.color}`} />
                        {statusCfg.label}
                      </Badge>
                    );
                  })()}
                </div>

                {/* Severity (if issue) */}
                {selectedFeedback.type === "issue" && selectedFeedback.severity && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">Severity:</span>
                    <Badge className={severityColors[selectedFeedback.severity]}>
                      {selectedFeedback.severity.charAt(0).toUpperCase() + selectedFeedback.severity.slice(1)}
                    </Badge>
                  </div>
                )}

                {/* Full Message */}
                <div>
                  <h4 className="text-sm font-medium text-slate-600 mb-2">Message</h4>
                  <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedFeedback.message}
                  </p>
                </div>

                {/* Screenshot */}
                {selectedFeedback.screenshot_url && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-600 mb-2">Screenshot</h4>
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
                    <h4 className="text-sm font-medium text-blue-800 mb-2">Response</h4>
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
    </div>
  );
};

export default FeedbackPage;
