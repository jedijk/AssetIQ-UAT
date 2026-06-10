import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Volume2,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

export function FeedbackFormContent({
  isFullScreen = false,
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
}) {
  return (

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
}
