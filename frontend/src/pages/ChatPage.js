import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatAPI, voiceAPI } from "../lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, 
  Mic, 
  MicOff, 
  Image as ImageIcon, 
  X, 
  Loader2,
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  Plus,
  Settings,
  Globe,
  ChevronDown
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import ThreatCard from "../components/ThreatCard";
import { useLanguage } from "../contexts/LanguageContext";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English", flag: "EN" },
  { code: "nl", label: "Nederlands", flag: "NL" },
  { code: "de", label: "Deutsch", flag: "DE" },
  { code: "fr", label: "Francais", flag: "FR" },
];

const ChatPage = () => {
  const { t, language: appLanguage, setLanguage: setAppLanguage } = useLanguage();
  const [message, setMessage] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [showNewFailureModeInput, setShowNewFailureModeInput] = useState(false);
  const [newFailureModeName, setNewFailureModeName] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState(null);
  const [manualLanguage, setManualLanguage] = useState(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const queryClient = useQueryClient();

  // Fetch chat history
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chatHistory"],
    queryFn: () => chatAPI.getHistory(100),
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: ({ content, image }) => chatAPI.sendMessage(content, image, manualLanguage),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setMessage("");
      setImageBase64(null);
      setImagePreview(null);
      if (data?.detected_language) {
        setDetectedLanguage(data.detected_language);
        const lang = data.detected_language;
        if ((lang === "en" || lang === "nl") && lang !== appLanguage) {
          setAppLanguage(lang);
        }
      }
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail || "Failed to send message";
      toast.error(errorMsg);
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle send
  const handleSend = () => {
    if (!message.trim() && !imageBase64) return;
    sendMutation.mutate({ content: message, image: imageBase64 });
  };

  // Handle key press
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      toast.error("Please upload a JPEG, PNG, or WebP image");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(",")[1];
      setImageBase64(base64);
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Handle voice recording
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
      
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result.split(",")[1];
          try {
            const result = await voiceAPI.transcribe(base64);
            setMessage((prev) => prev + (prev ? " " : "") + result.text);
            toast.success("Voice transcribed!");
          } catch (error) {
            toast.error("Failed to transcribe voice");
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  // Handle clicking on a suggestion (equipment or failure mode)
  const handleSuggestionClick = (suggestionText) => {
    setShowNewFailureModeInput(false);
    setNewFailureModeName("");
    sendMutation.mutate({ content: suggestionText, image: null });
  };

  // Handle new failure mode submission
  const handleNewFailureModeSubmit = () => {
    if (newFailureModeName.trim().length >= 3) {
      sendMutation.mutate({ content: `New failure mode: ${newFailureModeName.trim()}`, image: null });
      setShowNewFailureModeInput(false);
      setNewFailureModeName("");
    } else {
      toast.error("Failure mode name must be at least 3 characters");
    }
  };

  // Handle clicking "New Failure Mode" button
  const handleNewFailureModeClick = () => {
    setShowNewFailureModeInput(true);
  };

  // Render message content
  const renderMessageContent = (msg) => {
    if (msg.role === "user") {
      return (
        <div className="chat-bubble-user">
          <p className="whitespace-pre-wrap">{msg.content}</p>
          {msg.has_image && (
            <div className="mt-2 text-blue-200 text-sm flex items-center gap-1">
              <ImageIcon className="w-4 h-4" />
              Image attached
            </div>
          )}
        </div>
      );
    }

    // AI message - check if it's a follow-up question
    const isFollowUp = msg.question_type || msg.content.includes("?");
    const hasEquipmentSuggestions = msg.equipment_suggestions && msg.equipment_suggestions.length > 0;
    const hasFailureModeSuggestions = msg.failure_mode_suggestions && msg.failure_mode_suggestions.length > 0;
    const showNewFailureModeOption = msg.failure_mode_suggestions !== undefined || msg.chat_state === "awaiting_failure_mode";
    const isContextPrompt = msg.chat_state === "awaiting_context" || msg.awaiting_context_for_threat;
    
    return (
      <div className={`chat-bubble-ai ${isFollowUp ? "border-l-4 border-l-blue-400" : ""} ${isContextPrompt ? "border-l-4 border-l-green-400 bg-green-50/50" : ""}`}>
        <p className="whitespace-pre-wrap">{msg.content}</p>
        
        {/* Context Prompt Quick Actions */}
        {isContextPrompt && (
          <div className="mt-3 pt-3 border-t border-green-200">
            <p className="text-sm text-slate-500 mb-2">Quick options:</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-green-600 hover:bg-green-50 border-green-200"
                data-testid="add-photo-btn"
              >
                <ImageIcon className="w-3 h-3 mr-1" />
                Add Photo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSuggestionClick("skip")}
                className="text-slate-500 hover:bg-slate-50 border-slate-200"
                data-testid="skip-context-btn"
              >
                Skip
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Or type your observations (temperature, conditions, notes...)
            </p>
          </div>
        )}
        
        {/* Equipment Suggestions */}
        {hasEquipmentSuggestions && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-sm text-slate-500 mb-2">Select equipment:</p>
            <div className="flex flex-wrap gap-2">
              {msg.equipment_suggestions.map((eq, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuggestionClick(eq.tag ? `${eq.name} (${eq.tag})` : eq.name)}
                  className="text-left justify-start text-blue-600 hover:bg-blue-50 border-blue-200 h-auto py-1.5"
                  data-testid={`equipment-suggestion-${idx}`}
                >
                  <div className="flex flex-col items-start">
                    <div className="flex items-center">
                      <Settings className="w-3 h-3 mr-1 flex-shrink-0" />
                      <span>{eq.name}</span>
                      {eq.tag && <span className="ml-1 text-slate-400">({eq.tag})</span>}
                    </div>
                    {eq.parent_name && (
                      <span className="text-xs text-slate-400 ml-4">in {eq.parent_name}</span>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {/* Failure Mode Suggestions */}
        {hasFailureModeSuggestions && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-sm text-slate-500 mb-2">Select failure mode:</p>
            <div className="flex flex-wrap gap-2">
              {msg.failure_mode_suggestions.map((fm, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuggestionClick(`Failure mode: ${fm.failure_mode}`)}
                  className="text-left justify-start text-blue-600 hover:bg-blue-50 border-blue-200"
                  data-testid={`failure-mode-suggestion-${idx}`}
                >
                  {fm.failure_mode}
                  {fm.rpn && <span className="ml-1 text-xs text-slate-400">(RPN: {fm.rpn})</span>}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {/* New Failure Mode Option */}
        {showNewFailureModeOption && !hasEquipmentSuggestions && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            {!showNewFailureModeInput ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewFailureModeClick}
                className="text-left justify-start text-green-600 hover:bg-green-50 border-green-200"
                data-testid="new-failure-mode-btn"
              >
                <Plus className="w-3 h-3 mr-1" />
                {t("chat.newFailureMode")}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">{t("chat.specifyFailureMode")}</p>
                <div className="flex gap-2">
                  <Input
                    value={newFailureModeName}
                    onChange={(e) => setNewFailureModeName(e.target.value)}
                    placeholder={t("chat.enterFailureModeName")}
                    className="flex-1"
                    data-testid="new-failure-mode-input"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleNewFailureModeSubmit();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleNewFailureModeSubmit}
                    disabled={newFailureModeName.trim().length < 3}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="submit-new-failure-mode-btn"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {msg.threat_id && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <a 
              href={`/threats/${msg.threat_id}`}
              className="inline-flex items-center gap-2 text-blue-600 text-sm font-medium hover:underline"
              data-testid={`view-threat-link-${msg.threat_id}`}
            >
              View threat details
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}
        {isFollowUp && !msg.threat_id && !hasEquipmentSuggestions && !hasFailureModeSuggestions && !showNewFailureModeOption && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-blue-600 text-sm">
            <HelpCircle className="w-4 h-4" />
            <span>{t("chat.provideMoreDetails")}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="chat-container" data-testid="chat-page">
      {/* Messages */}
      <div className="chat-messages">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">
              {t("chat.startCapturing")}
            </h3>
            <p className="text-slate-500 max-w-sm text-center">
              {t("chat.startCapturingDesc")}
            </p>
            <div className="mt-6 space-y-2 text-left bg-slate-100 rounded-xl p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-700">{t("chat.trySaying")}</p>
              <p>"Pump P-104 is leaking from the mechanical seal"</p>
              <p>"Bearing noise on compressor C-201"</p>
              <p>"Heat exchanger HX-301 showing reduced efficiency"</p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div
                key={msg.id || idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`message-group ${msg.role}`}
                data-testid={`chat-message-${msg.role}-${idx}`}
              >
                {renderMessageContent(msg)}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area" data-testid="chat-input-area">
        {/* Language Detection Indicator */}
        {(detectedLanguage || manualLanguage) && (
          <div className="flex items-center gap-2 mb-2">
            <Popover open={showLangPicker} onOpenChange={setShowLangPicker}>
              <PopoverTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-600 transition-colors"
                  data-testid="language-selector"
                >
                  <Globe className="w-3 h-3" />
                  {LANGUAGE_OPTIONS.find(l => l.code === (manualLanguage || detectedLanguage))?.flag || (manualLanguage || detectedLanguage)?.toUpperCase()}
                  {!manualLanguage && <span className="text-slate-400">detected</span>}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-44 p-1" sideOffset={4}>
                {LANGUAGE_OPTIONS.map(lang => (
                  <button
                    key={lang.code}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm hover:bg-slate-100 transition-colors ${
                      (manualLanguage || detectedLanguage) === lang.code ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"
                    }`}
                    onClick={() => {
                      setManualLanguage(lang.code);
                      setShowLangPicker(false);
                      if (lang.code === "en" || lang.code === "nl") {
                        setAppLanguage(lang.code);
                      }
                    }}
                    data-testid={`language-option-${lang.code}`}
                  >
                    <span className="text-xs font-bold w-6">{lang.flag}</span>
                    {lang.label}
                  </button>
                ))}
                {manualLanguage && (
                  <>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-slate-500 hover:bg-slate-100"
                      onClick={() => {
                        setManualLanguage(null);
                        setShowLangPicker(false);
                      }}
                      data-testid="language-auto-detect"
                    >
                      Auto-detect
                    </button>
                  </>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
        {/* Image Preview */}
        <AnimatePresence>
          {imagePreview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3"
            >
              <div className="image-preview" data-testid="image-preview">
                <img src={imagePreview} alt="Upload preview" className="rounded-lg max-h-32" />
                <button
                  onClick={() => {
                    setImageBase64(null);
                    setImagePreview(null);
                  }}
                  className="remove-btn"
                  data-testid="remove-image-button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-3">
          {/* Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageUpload}
            className="hidden"
            data-testid="image-upload-input"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 h-11 w-11 rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50"
            data-testid="upload-image-button"
          >
            <ImageIcon className="w-5 h-5" />
          </Button>

          {/* Voice Button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex-shrink-0 h-11 w-11 rounded-full ${
              isRecording
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
            }`}
            data-testid="voice-record-button"
          >
            {isRecording ? (
              <MicOff className="w-5 h-5 recording-indicator" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </Button>

          {/* Text Input */}
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t("chat.describeIssue")}
            className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500"
            rows={1}
            data-testid="chat-message-input"
          />

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending || (!message.trim() && !imageBase64)}
            className="flex-shrink-0 h-11 w-11 rounded-full bg-blue-600 hover:bg-blue-700"
            data-testid="send-message-button"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>

        {/* Recording Indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex items-center gap-2 text-red-600 text-sm"
              data-testid="recording-indicator"
            >
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Recording... Tap to stop
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ChatPage;
