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
  CheckCircle2
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

const ChatSidebar = ({ isOpen, onClose, prefillEquipment = null }) => {
  const [message, setMessage] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
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
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

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

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
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

  // Render message content
  const renderMessageContent = (msg) => {
    if (msg.role === "user") {
      return (
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 max-w-[85%] shadow-sm text-sm">
          <p className="whitespace-pre-wrap">{msg.content}</p>
          {msg.has_image && (
            <div className="mt-2 text-blue-200 text-xs flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              Image attached
            </div>
          )}
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
            <span className="font-medium">Threat Recorded</span>
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
                  <span><strong>Asset:</strong> {msg.threat_asset}</span>
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
              {msg.threat_equipment_criticality && (
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    msg.threat_equipment_criticality === "safety_critical" ? "bg-red-100 text-red-700" :
                    msg.threat_equipment_criticality === "production_critical" ? "bg-orange-100 text-orange-700" :
                    msg.threat_equipment_criticality === "medium" ? "bg-yellow-100 text-yellow-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {msg.threat_equipment_criticality === "safety_critical" ? "⚠️ Safety Critical Equipment" :
                     msg.threat_equipment_criticality === "production_critical" ? "🏭 Production Critical" :
                     msg.threat_equipment_criticality === "medium" ? "Medium Criticality" : "Low Criticality"}
                  </span>
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
        
        {isFollowUp && !msg.threat_id && (
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
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
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
              <h2 className="font-semibold text-slate-900">Report Threat</h2>
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

        {/* Input Area */}
        <div className="border-t border-slate-200 bg-white p-4">
          {imagePreview && (
            <div className="mb-3">
              <div className="relative inline-block">
                <img src={imagePreview} alt="Upload preview" className="rounded-lg max-h-24" />
                <button
                  onClick={() => {
                    setImageBase64(null);
                    setImagePreview(null);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 h-10 w-10 rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50"
              data-testid="sidebar-upload-image-button"
            >
              <ImageIcon className="w-5 h-5" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex-shrink-0 h-10 w-10 rounded-full ${
                isRecording
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
              }`}
              data-testid="sidebar-voice-record-button"
            >
              {isRecording ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </Button>

            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Describe the issue..."
              className="flex-1 min-h-[40px] max-h-24 resize-none rounded-xl border-slate-200 text-sm"
              rows={1}
              data-testid="sidebar-chat-message-input"
            />

            <Button
              onClick={handleSend}
              disabled={sendMutation.isPending || (!message.trim() && !imageBase64)}
              className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700"
              data-testid="sidebar-send-message-button"
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>

          {isRecording && (
            <div className="mt-2 flex items-center gap-2 text-red-600 text-xs">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Recording... Tap to stop
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ChatSidebar;
