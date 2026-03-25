import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatAPI, voiceAPI, threatsAPI } from "../lib/api";
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
  MessageSquare,
  MapPin,
  Wrench,
  Activity,
  CheckCircle2,
  Camera,
  Paperclip,
  Trash2,
  Pause,
  Play,
  Square
} from "lucide-react";
import { Button } from "./ui/button";

const ChatSidebar = ({ isOpen, onClose, prefillEquipment = null }) => {
  const [message, setMessage] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioChunks, setAudioChunks] = useState([]);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const queryClient = useQueryClient();

  // Pre-fill message when equipment is provided
  useEffect(() => {
    if (prefillEquipment && isOpen) {
      // More explicit format to help AI extract the asset name correctly
      setMessage(`Reporting issue for equipment "${prefillEquipment}": `);
      // Focus the textarea after a short delay
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [prefillEquipment, isOpen]);

  // Fetch chat history
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chatHistory"],
    queryFn: () => chatAPI.getHistory(100),
    enabled: isOpen,
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: ({ content, image }) => chatAPI.sendMessage(content, image),
    onMutate: () => {
      setIsSending(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setMessage("");
      setImageBase64(null);
      setImagePreview(null);
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail || "Failed to send message";
      toast.error(errorMsg);
    },
    onSettled: () => {
      setIsSending(false);
    },
  });

  // Scroll to bottom when chat opens (instant) and on new messages (smooth)
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      // Use setTimeout to ensure DOM has rendered
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }, 100);
    }
  }, [isOpen]);

  // Scroll to bottom smoothly on new messages
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
        setAudioChunks([...chunks]);
      };
      
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(100); // Collect data every 100ms for waveform
      setMediaRecorder(recorder);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      
      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      toast.error("Could not access microphone");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorder && isRecording) {
      if (isPaused) {
        mediaRecorder.resume();
        recordingTimerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorder.pause();
        clearInterval(recordingTimerRef.current);
      }
      setIsPaused(!isPaused);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setAudioChunks([]);
      setMediaRecorder(null);
    }
  };

  const sendRecording = async () => {
    if (mediaRecorder && audioChunks.length > 0) {
      clearInterval(recordingTimerRef.current);
      mediaRecorder.stop();
      
      setIsTranscribing(true);
      
      // Wait a bit for final chunks
      setTimeout(async () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result.split(",")[1];
          try {
            const result = await voiceAPI.transcribe(base64);
            const transcribedText = result.text;
            
            // Directly submit the transcribed text
            if (transcribedText && transcribedText.trim()) {
              setIsTranscribing(false); // Reset before mutation
              sendMutation.mutate({ content: transcribedText, image: imageBase64 });
            } else {
              toast.error("Could not transcribe voice - no text detected");
              setIsTranscribing(false);
            }
          } catch (error) {
            toast.error("Failed to transcribe voice");
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
        
        setIsRecording(false);
        setIsPaused(false);
        setRecordingTime(0);
        setAudioChunks([]);
        setMediaRecorder(null);
      }, 200);
    }
  };

  // Format recording time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  // Render message content
  const renderMessageContent = (msg) => {
    if (msg.role === "user") {
      return (
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 max-w-[85%] shadow-sm text-sm">
          {msg.has_image && msg.image_data && (
            <div className="mb-2">
              <img 
                src={`data:image/jpeg;base64,${msg.image_data}`}
                alt="Attached"
                className="rounded-lg max-w-full max-h-48 object-cover border border-blue-400"
              />
            </div>
          )}
          {msg.has_image && !msg.image_data && (
            <div className="mb-2 p-3 bg-blue-500/50 rounded-lg flex items-center gap-2 text-blue-100">
              <ImageIcon className="w-4 h-4" />
              <span className="text-xs">Image attached</span>
            </div>
          )}
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      );
    }

    const isFollowUp = msg.question_type || (msg.content.includes("?") && !msg.threat_id);
    
    return (
      <div className={`bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm p-3 max-w-[90%] shadow-sm text-sm ${isFollowUp ? "border-l-4 border-l-blue-400" : ""}`}>
        {/* Show success message for threat creation */}
        {msg.threat_id && (
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <CheckCircle2 className="w-4 h-4" />
            <span className="font-medium">Observation Recorded</span>
          </div>
        )}
        
        {/* Threat Summary Card */}
        {msg.threat_id && (
          <div className="bg-slate-50 rounded-lg p-3 mb-2 border border-slate-200">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-semibold text-slate-900 text-sm leading-tight">
                {msg.threat_title || "Threat Logged"}
              </h4>
              <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                msg.threat_risk_level === "Critical" ? "bg-red-100 text-red-700" :
                msg.threat_risk_level === "High" ? "bg-orange-100 text-orange-700" :
                msg.threat_risk_level === "Medium" ? "bg-yellow-100 text-yellow-700" :
                "bg-green-100 text-green-700"
              }`}>
                {msg.threat_risk_level || "Medium"}
              </span>
            </div>
            
            <div className="space-y-1 text-xs text-slate-600">
              {msg.threat_asset && (
                <div className="flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-slate-400" />
                  <span><strong>Equipment:</strong> {msg.threat_asset}</span>
                </div>
              )}
              {msg.threat_failure_mode && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-slate-400" />
                  <span><strong>Issue:</strong> {msg.threat_failure_mode}</span>
                </div>
              )}
              {msg.threat_location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span><strong>Location:</strong> {msg.threat_location}</span>
                </div>
              )}
              {msg.threat_risk_score && (
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-slate-400" />
                  <span><strong>Risk Score:</strong> {msg.threat_risk_score} • <strong>Rank:</strong> #{msg.threat_rank}</span>
                </div>
              )}
            </div>
            
            <a 
              href={`/threats/${msg.threat_id}`}
              onClick={onClose}
              className="mt-2 inline-flex items-center gap-1 text-blue-600 text-xs font-medium hover:underline"
            >
              View full details
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        )}
        
        {!msg.threat_id && (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}
        
        {/* Equipment Suggestions */}
        {msg.equipment_suggestions && msg.equipment_suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {msg.equipment_suggestions.map((eq) => (
              <button
                key={eq.id}
                onClick={() => {
                  // Directly submit with the selected equipment
                  const equipmentText = eq.tag ? `${eq.name} (${eq.tag})` : eq.name;
                  sendMutation.mutate({ content: equipmentText, image: null });
                }}
                disabled={isSending}
                className="w-full text-left p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-blue-900 text-sm">{eq.name}</span>
                    {eq.tag && (
                      <span className="ml-2 text-blue-600 text-xs">({eq.tag})</span>
                    )}
                  </div>
                  {isSending ? (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-colors" />
                  )}
                </div>
                {eq.equipment_type && (
                  <span className="text-xs text-blue-500">{eq.equipment_type}</span>
                )}
              </button>
            ))}
            
            {/* Cancel option */}
            <button
              onClick={() => {
                setMessage("");
                if (textareaRef.current) {
                  textareaRef.current.focus();
                }
              }}
              disabled={isSending}
              className="w-full text-center p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5 inline mr-1" />
              None of these / Cancel
            </button>
          </div>
        )}
        
        {/* Failure Mode Suggestions */}
        {msg.failure_mode_suggestions && msg.failure_mode_suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {msg.failure_mode_suggestions.map((fm) => (
              <button
                key={fm.id}
                onClick={() => {
                  // Directly submit with the selected failure mode
                  const failureModeText = `Failure mode: ${fm.failure_mode}`;
                  sendMutation.mutate({ content: failureModeText, image: null });
                }}
                disabled={isSending}
                className="w-full text-left p-2.5 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-amber-900 text-sm">{fm.failure_mode}</span>
                  </div>
                  {isSending ? (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-amber-400 group-hover:text-amber-600 transition-colors" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {fm.category && (
                    <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{fm.category}</span>
                  )}
                  {fm.equipment && (
                    <span className="text-xs text-amber-500">{fm.equipment}</span>
                  )}
                  {fm.rpn && (
                    <span className="text-xs text-amber-700 font-medium">RPN: {fm.rpn}</span>
                  )}
                </div>
              </button>
            ))}
            
            {/* Cancel option for failure modes */}
            <button
              onClick={() => {
                setMessage("");
                if (textareaRef.current) {
                  textareaRef.current.focus();
                }
              }}
              disabled={isSending}
              className="w-full text-center p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5 inline mr-1" />
              None of these / Describe differently
            </button>
          </div>
        )}
        
        {isFollowUp && !msg.threat_id && !msg.equipment_suggestions && !msg.failure_mode_suggestions && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-blue-600 text-xs">
            <HelpCircle className="w-3 h-3" />
            <span>Please provide more details</span>
          </div>
        )}
      </div>
    );
  };

  // Don't render anything if not open
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - Click anywhere outside to close */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
        data-testid="chat-backdrop"
      />

      {/* Sidebar */}
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[400px] bg-slate-50 shadow-2xl z-50 flex flex-col"
        data-testid="chat-sidebar"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Report Observation</h2>
              <p className="text-xs text-slate-500">Describe the failure</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            data-testid="close-chat-sidebar"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                Report a Threat
              </h3>
              <p className="text-slate-500 text-sm mb-4">
                Describe any equipment failure or issue.
              </p>
              <div className="text-left bg-white rounded-xl p-3 text-xs text-slate-600 border border-slate-200 w-full">
                <p className="font-medium text-slate-700 mb-2">Try saying:</p>
                <p className="mb-1">"Pump P-104 is leaking from the seal"</p>
                <p className="mb-1">"Bearing noise on compressor C-201"</p>
                <p>"Heat exchanger showing reduced efficiency"</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div
                  key={msg.id || idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {renderMessageContent(msg)}
                </div>
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area - WhatsApp Style */}
        <div className="border-t border-slate-200 bg-slate-100 p-3">
          {/* Image Preview */}
          {imagePreview && (
            <div className="mb-3 px-1">
              <div className="relative inline-block">
                <img src={imagePreview} alt="Upload preview" className="rounded-lg max-h-20 border border-slate-300" />
                <button
                  onClick={() => {
                    setImageBase64(null);
                    setImagePreview(null);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-900 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />

          {/* Recording State */}
          {isRecording ? (
            <div className="flex items-center gap-2 min-w-0">
              {/* Cancel/Delete Button */}
              <button
                onClick={cancelRecording}
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Cancel recording"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              {/* Recording Bar */}
              <div className="flex-1 min-w-0 h-12 bg-slate-800 rounded-full flex items-center px-3 gap-2">
                {/* Recording indicator */}
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                
                {/* Timer */}
                <span className="text-white text-sm font-medium flex-shrink-0">
                  {formatTime(recordingTime)}
                </span>

                {/* Waveform visualization */}
                <div className="flex-1 min-w-0 flex items-center justify-center gap-[2px] h-6 overflow-hidden">
                  {[...Array(30)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-[2px] bg-slate-400 rounded-full flex-shrink-0"
                      animate={{
                        height: isPaused ? 4 : [4, Math.random() * 16 + 4, 4],
                      }}
                      transition={{
                        duration: 0.5,
                        repeat: isPaused ? 0 : Infinity,
                        delay: i * 0.02,
                      }}
                    />
                  ))}
                </div>

                {/* Pause/Play Button */}
                <button
                  onClick={pauseRecording}
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white hover:bg-slate-700 transition-colors"
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? (
                    <Play className="w-4 h-4" />
                  ) : (
                    <Pause className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Send Recording Button */}
              <button
                onClick={sendRecording}
                disabled={isTranscribing || isSending}
                className={`flex-shrink-0 w-11 h-11 rounded-full text-white flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-70 ${
                  isTranscribing || isSending 
                    ? 'bg-blue-400' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                title={isTranscribing ? "Processing voice..." : "Send voice message"}
              >
                {isTranscribing || isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          ) : (
            /* Normal Input State */
            <div className="flex items-end gap-2">
              {/* Attachment Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                title="Attach file"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Input Container */}
              <div className="flex-1 bg-white rounded-3xl border border-slate-200 flex items-end overflow-hidden shadow-sm">
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    // Auto-resize
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 text-sm bg-transparent border-none outline-none resize-none min-h-[44px] max-h-[120px] placeholder:text-slate-400"
                  rows={1}
                  style={{ height: '44px' }}
                  data-testid="sidebar-chat-message-input"
                />
              </div>

              {/* Mic or Send Button */}
              {message.trim() || imageBase64 || isSending ? (
                <button
                  onClick={handleSend}
                  disabled={isSending}
                  className={`flex-shrink-0 w-11 h-11 rounded-full text-white flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-70 ${
                    isSending 
                      ? 'bg-blue-400' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  data-testid="sidebar-send-message-button"
                  title="Send message"
                >
                  {isSending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={isSending}
                  className="flex-shrink-0 w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-70"
                  data-testid="sidebar-voice-record-button"
                  title="Hold to record voice"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ChatSidebar;
