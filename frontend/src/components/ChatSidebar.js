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
  Square,
  Plus,
  Globe,
  ChevronDown,
  FileUp,
  ImagePlus
} from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useLanguage } from "../contexts/LanguageContext";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English", flag: "EN" },
  { code: "nl", label: "Nederlands", flag: "NL" },
];

const ChatSidebar = ({ isOpen, onClose, prefillEquipment = null, prefillMessage = null }) => {
  const { language: appLanguage, setLanguage: setAppLanguage } = useLanguage();
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
  const [showNewFailureModeInput, setShowNewFailureModeInput] = useState(false);
  const [newFailureModeName, setNewFailureModeName] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState(null);
  const [manualLanguage, setManualLanguage] = useState(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isListening, setIsListening] = useState(false); // Real-time speech recognition
  const [interimTranscript, setInterimTranscript] = useState(""); // Partial transcript while speaking
  const [autoSkipCountdown, setAutoSkipCountdown] = useState(null); // Countdown timer for auto-skip
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const textareaRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recognitionRef = useRef(null); // Speech recognition instance
  const newFailureModeInputRef = useRef(null);
  const autoSkipTimerRef = useRef(null);
  /** Wall-clock deadline (ms) for auto-skip; survives closing/reopening the sidebar for the same prompt. */
  const contextSkipDeadlineMsRef = useRef(null);
  const contextSkipTrackedMessageIdRef = useRef(null);
  const contextSkipInFlightRef = useRef(false);
  /** Timestamp (ms) of the most recent "skip" fired from ANY source — manual button, 60s timer, or close handler. */
  const lastSkipFiredAtRef = useRef(0);
  const queryClient = useQueryClient();

  // Pre-fill message when equipment is provided
  useEffect(() => {
    if (prefillEquipment && isOpen) {
      // More explicit format to help AI extract the asset name correctly
      const prefillText = `Reporting issue for equipment "${prefillEquipment}": `;
      setMessage(prefillText);
      // Focus the textarea and resize after a short delay
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          const newHeight = Math.max(40, Math.min(textareaRef.current.scrollHeight, 150));
          textareaRef.current.style.height = newHeight + 'px';
          textareaRef.current.focus();
          // Place cursor at end
          textareaRef.current.setSelectionRange(prefillText.length, prefillText.length);
        }
      }, 100);
    }
  }, [prefillEquipment, isOpen]);
  
  // Pre-fill message from tour or external source
  useEffect(() => {
    if (prefillMessage !== null && prefillMessage !== undefined) {
      setMessage(prefillMessage);
      // Trigger auto-resize of textarea after DOM update
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          const newHeight = Math.max(40, Math.min(textareaRef.current.scrollHeight, 150));
          textareaRef.current.style.height = newHeight + 'px';
          // Scroll to bottom of textarea to show all content
          textareaRef.current.scrollTop = 0;
        }
      }, 100);
    }
  }, [prefillMessage]);

  // Fetch chat history
  const { data: messages = [], isLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["chatHistory"],
    queryFn: () => chatAPI.getHistory(100),
    enabled: isOpen,
  });
  
  /**
   * Auto-skip on close: when the user closes the chat window while the assistant
   * is awaiting more context AND the Skip button is the active option, fire a
   * "skip" message in the background so the conversation is finalized rather
   * than left in limbo. Otherwise just close.
   */
  const handleCloseWithAutoSkip = () => {
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
    
    // Skip button is only visible when:
    //   1) the message is in awaiting_context state, AND
    //   2) no competing interactive prompt is shown (issue_confirm, equipment
    //      suggestions, failure-mode input, etc.). Otherwise the user has a
    //      Yes/Revise/Select choice and we must NOT silently skip.
    const isAwaitingContext = lastAssistantMsg?.chat_state === "awaiting_context"
      || lastAssistantMsg?.awaiting_context_for_threat;
    const hasIssueConfirm = lastAssistantMsg?.question_type === "issue_confirm"
      && lastAssistantMsg?.issue_summary;
    const hasEquipmentSuggestions = (lastAssistantMsg?.equipment_suggestions || []).length > 0;
    const hasFailureModeSuggestions = (lastAssistantMsg?.failure_mode_suggestions || []).length > 0;
    const hasMultipleMatches = (lastAssistantMsg?.matches || []).length > 0;
    
    const skipIsTheOption = isAwaitingContext
      && !hasIssueConfirm
      && !hasEquipmentSuggestions
      && !hasFailureModeSuggestions
      && !hasMultipleMatches;
    
    // 5-second cooldown: if a skip was already fired (manual button, timer, etc.)
    // very recently, don't fire another one. Prevents race conditions where
    // `messages` hasn't yet refetched after the previous skip's "Got it!" reply.
    const recentlyFired = Date.now() - lastSkipFiredAtRef.current < 5000;
    
    if (skipIsTheOption && !contextSkipInFlightRef.current && !recentlyFired) {
      contextSkipInFlightRef.current = true;
      lastSkipFiredAtRef.current = Date.now();
      if (autoSkipTimerRef.current) {
        clearInterval(autoSkipTimerRef.current);
        autoSkipTimerRef.current = null;
      }
      setAutoSkipCountdown(null);
      contextSkipDeadlineMsRef.current = null;
      // Fire-and-forget — no need to await before closing the UI
      chatAPI
        .sendMessage("skip", null, manualLanguageRef.current)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
          queryClient.invalidateQueries({ queryKey: ["threats"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
        })
        .catch(() => { /* silently ignore — user is closing the window */ })
        .finally(() => {
          contextSkipInFlightRef.current = false;
        });
    }
    
    onClose();
  };
  
  // Track database environment changes
  useEffect(() => {
    if (isOpen) {
      // Force refetch when sidebar opens to ensure we have fresh data for current database
      refetchHistory();
    }
  }, [isOpen, refetchHistory]);

  // Auto-skip context prompt after 60 seconds
  // Derive the awaiting-context message id so this effect only restarts when a NEW
  // awaiting-context message appears (not on every React Query refetch).
  const awaitingContextMessageId = (() => {
    const lastAssistantMsg = messages.filter(m => m.role === "assistant").pop();
    const isAwaitingContext = lastAssistantMsg?.chat_state === "awaiting_context" || lastAssistantMsg?.awaiting_context_for_threat;
    return isAwaitingContext ? (lastAssistantMsg?.id || lastAssistantMsg?._id || lastAssistantMsg?.timestamp || "awaiting") : null;
  })();

  // Keep a ref to the latest manualLanguage so the interval callback always uses the current value
  const manualLanguageRef = useRef(manualLanguage);
  useEffect(() => { manualLanguageRef.current = manualLanguage; }, [manualLanguage]);

  useEffect(() => {
    const clearTimer = () => {
      if (autoSkipTimerRef.current) {
        clearInterval(autoSkipTimerRef.current);
        autoSkipTimerRef.current = null;
      }
    };

    const remainingSeconds = () => {
      const d = contextSkipDeadlineMsRef.current;
      if (!d) return 0;
      return Math.max(0, Math.ceil((d - Date.now()) / 1000));
    };

    const fireAutoSkip = () => {
      if (contextSkipInFlightRef.current) return;
      contextSkipInFlightRef.current = true;
      lastSkipFiredAtRef.current = Date.now();
      clearTimer();
      setAutoSkipCountdown(null);
      setIsSending(true);
      chatAPI
        .sendMessage("skip", null, manualLanguageRef.current)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
          queryClient.invalidateQueries({ queryKey: ["threats"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
        })
        .catch((err) => {
          const msg = err?.response?.data?.detail || "Auto-skip failed";
          toast.error(msg);
        })
        .finally(() => {
          setIsSending(false);
          contextSkipInFlightRef.current = false;
          contextSkipDeadlineMsRef.current = null;
          contextSkipTrackedMessageIdRef.current = null;
        });
    };

    if (!awaitingContextMessageId) {
      contextSkipDeadlineMsRef.current = null;
      contextSkipTrackedMessageIdRef.current = null;
      contextSkipInFlightRef.current = false;
      setAutoSkipCountdown(null);
      clearTimer();
      return;
    }

    if (contextSkipInFlightRef.current) {
      clearTimer();
      return;
    }

    // New awaiting-context assistant message → full 60s from first time we see this id
    if (contextSkipTrackedMessageIdRef.current !== awaitingContextMessageId) {
      contextSkipTrackedMessageIdRef.current = awaitingContextMessageId;
      contextSkipDeadlineMsRef.current = Date.now() + 60_000;
    }

    if (!isOpen) {
      // Plain open/close: keep the same deadline; only pause the interval (no reset to 60s).
      clearTimer();
      const rem = remainingSeconds();
      setAutoSkipCountdown(rem > 0 ? rem : null);
      if (rem <= 0) {
        fireAutoSkip();
      }
      return;
    }

    const tick = () => {
      const rem = remainingSeconds();
      setAutoSkipCountdown(rem);
      if (rem <= 0) {
        fireAutoSkip();
      }
    };

    tick();
    autoSkipTimerRef.current = setInterval(tick, 1000);
    return () => {
      clearTimer();
    };
  }, [awaitingContextMessageId, isOpen, queryClient]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: ({ content, image }) => chatAPI.sendMessage(content, image, manualLanguage),
    onMutate: () => {
      setIsSending(true);
      // Clear auto-skip timer when user sends any message
      if (autoSkipTimerRef.current) {
        clearInterval(autoSkipTimerRef.current);
        autoSkipTimerRef.current = null;
      }
      contextSkipDeadlineMsRef.current = null;
      contextSkipTrackedMessageIdRef.current = null;
      contextSkipInFlightRef.current = false;
      setAutoSkipCountdown(null);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      
      // Detect database environment mismatch
      // If user sent what looks like an equipment selection but got equipment options back
      const sentContent = variables?.content || "";
      const looksLikeEquipmentSelection = /\([A-Z0-9-]+\)/.test(sentContent);
      const gotEquipmentOptionsBack = data?.equipment_suggestions?.length > 0;
      
      if (looksLikeEquipmentSelection && gotEquipmentOptionsBack) {
        // This likely means the chat state was lost (database environment changed)
        toast.warning("Chat state was reset. Your previous session may have been in a different database environment.", {
          duration: 5000,
        });
        // Force refetch chat history to sync with current database
        queryClient.refetchQueries({ queryKey: ["chatHistory"] });
      }
      
      setMessage("");
      setImageBase64(null);
      setImagePreview(null);
      setShowNewFailureModeInput(false);
      setNewFailureModeName("");
      if (data?.detected_language) {
        setDetectedLanguage(data.detected_language);
        // Sync app language if detected language is supported (en/nl)
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
    onSettled: () => {
      setIsSending(false);
    },
  });

  // Clear chat history mutation
  const clearChatMutation = useMutation({
    mutationFn: () => chatAPI.clearHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
      toast.success("Chat history cleared");
    },
    onError: () => {
      toast.error("Failed to clear chat");
    },
  });

  // Scroll to bottom helper
  const scrollToBottom = (behavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  };

  // Scroll to bottom when chat opens (instant)
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => scrollToBottom("instant"), 100);
    }
  }, [isOpen]);

  // Scroll to bottom smoothly on new messages
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      scrollToBottom("smooth");
    }
  }, [isOpen, messages]);

  useEffect(() => {
    if (isOpen && (isSending || isTranscribing)) {
      scrollToBottom("smooth");
    }
  }, [isOpen, isSending, isTranscribing]);

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
      
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
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
    if (!mediaRecorder || audioChunks.length === 0) return;
    
    clearInterval(recordingTimerRef.current);
    setIsTranscribing(true);
    
    // Build blob immediately from current chunks
    const mimeType = mediaRecorder.mimeType || "audio/webm";
    const blob = new Blob(audioChunks, { type: mimeType });
    
    // Stop recorder and clean up state
    mediaRecorder.stop();
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setAudioChunks([]);
    setMediaRecorder(null);
    
    try {
      // Get transcription from voice
      const result = await voiceAPI.sendVoice(blob, manualLanguage, true); // true = transcribe only, don't process chat
      
      if (result?.detected_language) {
        setDetectedLanguage(result.detected_language);
        const lang = result.detected_language;
        if ((lang === "en" || lang === "nl") && lang !== appLanguage) {
          setAppLanguage(lang);
        }
      }
      
      if (result?.transcribed_text) {
        const transcribedText = result.transcribed_text.trim();
        // Append directly to message so user immediately sees it
        setMessage(prev => (prev.trim() ? prev.trim() + " " : "") + transcribedText);
        // Focus textarea and scroll to bottom so latest text is visible
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const len = textareaRef.current.value.length;
            try { textareaRef.current.setSelectionRange(len, len); } catch (_) {}
            resizeAndScrollTextarea();
          }
        }, 50);
      } else {
        toast.error("Could not transcribe voice - no text detected");
      }
    } catch (error) {
      toast.error("Failed to transcribe voice");
    } finally {
      setIsTranscribing(false);
    }
  };

  // Helper: resize textarea to fit content and scroll caret-end into view
  const resizeAndScrollTextarea = () => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    ta.style.height = 'auto';
    const newHeight = Math.max(40, Math.min(ta.scrollHeight, 150));
    ta.style.height = newHeight + 'px';
    // Scroll to bottom so newly transcribed text is always visible
    ta.scrollTop = ta.scrollHeight;
  };

  // Real-time speech recognition (types as you speak)
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = manualLanguage === 'nl' ? 'nl-NL' : 'en-US';
    
    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript("");
      // Focus the textarea so user sees the cursor & growing text
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Move caret to end
          const len = textareaRef.current.value.length;
          try { textareaRef.current.setSelectionRange(len, len); } catch (_) {}
          resizeAndScrollTextarea();
        }
      }, 50);
    };
    
    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      
      // Update interim transcript for display
      setInterimTranscript(interim);
      
      // Add final transcript to message
      if (final) {
        setMessage(prev => prev + final);
      }
      
      // Always resize + scroll textarea to bottom so user sees latest words
      requestAnimationFrame(resizeAndScrollTextarea);
    };
    
    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== 'no-speech') {
        toast.error("Speech recognition error: " + event.error);
      }
      setIsListening(false);
      setInterimTranscript("");
    };
    
    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
      recognitionRef.current = null;
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  };
  
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  };
  
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
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

  // Keep textarea auto-sized & scrolled-to-bottom whenever message or interim transcript changes
  // so dictated words are always visible to the user.
  useEffect(() => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    ta.style.height = 'auto';
    const newHeight = Math.max(40, Math.min(ta.scrollHeight, 150));
    ta.style.height = newHeight + 'px';
    if (isListening) {
      ta.scrollTop = ta.scrollHeight;
    }
  }, [message, interimTranscript, isListening]);

  // Render message content
  const renderMessageContent = (msg, isInteractive = true) => {
    if (msg.role === "user") {
      return (
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 max-w-[85%] shadow-sm text-sm">
          {msg.has_image && msg.image_data && (
            <div className="mb-2 -mx-1 -mt-1">
              <img 
                src={msg.image_data.startsWith("data:") ? msg.image_data : `data:image/jpeg;base64,${msg.image_data}`}
                alt="Attached"
                className="rounded-lg w-full max-h-60 object-contain bg-black/10"
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
        {/* Combined Observation Card with Context Prompt */}
        {msg.threat_id && (
          <div className="bg-gradient-to-b from-green-50 to-white rounded-lg border border-green-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 text-green-700 px-3 py-2 bg-green-100/50 border-b border-green-200">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-semibold text-sm">Observation Recorded</span>
            </div>
            
            {/* Threat Details */}
            <div className="p-3">
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
              
              <div className="space-y-1 text-xs text-slate-600 mb-3">
                {msg.threat_asset && (
                  <div className="flex items-center gap-1.5">
                    <Wrench className="w-3 h-3 text-slate-400" />
                    <span><strong>Equipment:</strong> {msg.threat_asset}</span>
                  </div>
                )}
                {msg.threat_equipment_tag && (
                  <div className="flex items-center gap-1.5 ml-[18px]">
                    <span className="text-slate-400 font-mono">{msg.threat_equipment_tag}</span>
                  </div>
                )}
                {msg.threat_failure_mode && (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-slate-400" />
                    <span><strong>Issue:</strong> {msg.threat_failure_mode}</span>
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
                className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium hover:underline"
              >
                View full details
                <ArrowRight className="w-3 h-3" />
              </a>
            </div>
            
            {/* Context Prompt - Inside the same card */}
            {(msg.chat_state === "awaiting_context" || msg.awaiting_context_for_threat) && (
              <div className="px-3 pb-3 pt-2 border-t border-slate-200 bg-slate-50/50">
                <p className="text-xs text-slate-600 mb-2">
                  Would you like to add more details? (temperature, conditions, photos) — add your comments in the chat below ↓
                  {" "}
                  <span className="text-slate-500">
                    Closing and reopening the chat does not reset the auto-skip timer.
                  </span>
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors text-xs font-medium disabled:opacity-50"
                    data-testid="add-photo-btn"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Add Photo
                  </button>
                  <button
                    onClick={() => {
                      if (autoSkipTimerRef.current) {
                        clearInterval(autoSkipTimerRef.current);
                      }
                      setAutoSkipCountdown(null);
                      lastSkipFiredAtRef.current = Date.now();
                      sendMutation.mutate({ content: "skip", image: null });
                    }}
                    disabled={isSending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-500 rounded-lg hover:bg-slate-100 transition-colors text-xs font-medium disabled:opacity-50"
                    data-testid="skip-context-btn"
                  >
                    Skip {autoSkipCountdown && `(${autoSkipCountdown}s)`}
                  </button>
                  {autoSkipCountdown && (
                    <span className="text-xs text-slate-400 ml-1">
                      Auto-skip in {autoSkipCountdown}s
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Issue summary confirm — structured summary + Accept / Revise / Cancel */}
        {!msg.threat_id && msg.question_type === "issue_confirm" && msg.issue_summary && (
          <div className="bg-gradient-to-b from-orange-50 to-white rounded-lg border border-orange-200 overflow-hidden">
            {/* Header - Draft indicator */}
            <div className="flex items-center gap-2 text-orange-700 px-3 py-2 bg-orange-100/50 border-b border-orange-200">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold text-sm">{msg.issue_confirm_language === "nl" ? "Concept Observatie" : "Draft Observation"}</span>
              <span className="ml-auto text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-medium">
                {msg.issue_confirm_language === "nl" ? "Te bevestigen" : "Pending"}
              </span>
            </div>
            
            {/* Observation Details */}
            <div className="p-3">
              {(() => {
                const isNl = msg.issue_confirm_language === "nl";
                const content = msg.content || "";
                const summary = msg.issue_summary || "";
                
                // Parse the summary to extract Equipment, Issue Type, Description
                const lines = summary.split('\n');
                let equipment = "";
                let issueType = "";
                let description = "";
                
                lines.forEach(line => {
                  if (line.includes('**Equipment:**') || line.includes('**Apparatuur:**')) {
                    equipment = line.replace(/\*\*Equipment:\*\*|\*\*Apparatuur:\*\*/g, '').trim();
                  } else if (line.includes('**Issue Type:**') || line.includes('**Type storing:**') || line.includes('**Storingstype:**')) {
                    issueType = line.replace(/\*\*Issue Type:\*\*|\*\*Type storing:\*\*|\*\*Storingstype:\*\*/g, '').trim();
                  } else if (line.includes('**Description:**') || line.includes('**Beschrijving:**')) {
                    description = line.replace(/\*\*Description:\*\*|\*\*Beschrijving:\*\*/g, '').trim();
                  }
                });
                
                return (
                  <>
                    {/* Title/Issue Type */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-semibold text-slate-900 text-sm leading-tight">
                        {issueType || (isNl ? "Nieuwe Observatie" : "New Observation")}
                      </h4>
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                        {isNl ? "Concept" : "Draft"}
                      </span>
                    </div>
                    
                    {/* Details */}
                    <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                      {equipment && (
                        <div className="flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-orange-400" />
                          <span><strong>{isNl ? "Apparatuur:" : "Equipment:"}</strong> {equipment}</span>
                        </div>
                      )}
                      {issueType && (
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                          <span><strong>{isNl ? "Storingstype:" : "Issue Type:"}</strong> {issueType}</span>
                        </div>
                      )}
                      {description && (
                        <div className="flex items-start gap-1.5 mt-2">
                          <MessageSquare className="w-3.5 h-3.5 text-orange-400 mt-0.5" />
                          <div>
                            <strong>{isNl ? "Beschrijving:" : "Description:"}</strong>
                            <p className="text-slate-700 mt-0.5">{description}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    {isInteractive && (
                      <div className="flex gap-2 pt-2 border-t border-orange-100">
                        <button
                          type="button"
                          onClick={() => sendMutation.mutate({ content: "accept", image: null })}
                          disabled={isSending}
                          className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                          data-testid="issue-confirm-accept-btn"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          {isNl ? "Accepteren" : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            textareaRef.current?.focus();
                            setMessage(isNl ? "Wijzig: " : "Change: ");
                          }}
                          disabled={isSending}
                          className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-white border border-orange-300 text-orange-700 text-xs font-medium hover:bg-orange-50 disabled:opacity-50 transition-colors"
                          data-testid="issue-confirm-revise-btn"
                        >
                          {isNl ? "Aanpassen" : "Revise"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setIsSending(true);
                              await chatAPI.cancelFlow();
                              queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
                              queryClient.invalidateQueries({ queryKey: ["threats"] });
                            } catch (e) {
                              toast.error("Cancel failed");
                            } finally {
                              setIsSending(false);
                            }
                          }}
                          disabled={isSending}
                          className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-white border border-red-300 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                          data-testid="issue-confirm-cancel-btn"
                        >
                          {isNl ? "Annuleren" : "Cancel"}
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
        {/* Show content for non-threat messages */}
        {!msg.threat_id && !(msg.question_type === "issue_confirm" && msg.issue_summary) && (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}
        
        {/* Context Prompt for non-threat messages (e.g., after adding context) */}
        {!msg.threat_id && isInteractive && (msg.chat_state === "awaiting_context" || msg.awaiting_context_for_threat) && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-500 mb-2">
              Closing and reopening the chat does not reset the auto-continue timer.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors text-xs font-medium disabled:opacity-50"
                data-testid="add-more-photo-btn"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Add Photo
              </button>
              <button
                onClick={() => {
                  if (autoSkipTimerRef.current) {
                    clearInterval(autoSkipTimerRef.current);
                  }
                  setAutoSkipCountdown(null);
                  lastSkipFiredAtRef.current = Date.now();
                  sendMutation.mutate({ content: "skip", image: null });
                }}
                disabled={isSending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-500 rounded-lg hover:bg-slate-100 transition-colors text-xs font-medium disabled:opacity-50"
                data-testid="skip-more-context-btn"
              >
                Done {autoSkipCountdown && `(${autoSkipCountdown}s)`}
              </button>
              {autoSkipCountdown && (
                <span className="text-xs text-slate-400 ml-1">
                  Auto-continue in {autoSkipCountdown}s
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Equipment Suggestions - only on latest message */}
        {isInteractive && msg.equipment_suggestions && msg.equipment_suggestions.length > 0 && (
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-blue-900 text-sm">{eq.name}</span>
                      {eq.tag && (
                        <span className="text-blue-600 text-xs">({eq.tag})</span>
                      )}
                    </div>
                    {/* Show parent subunit for maintainable items */}
                    {eq.parent_name && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        <span className="text-slate-400">in</span> {eq.parent_name}
                      </div>
                    )}
                  </div>
                  {isSending ? (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
                  )}
                </div>
                {eq.equipment_type && (
                  <span className="text-xs text-blue-500">{eq.equipment_type}</span>
                )}
              </button>
            ))}
            
            <button
              onClick={() => {
                sendMutation.mutate({ content: "Equipment: I don't know", image: null });
              }}
              disabled={isSending}
              className="w-full text-left p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="equipment-unknown-btn"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-700 text-sm">I don&apos;t know</span>
                </div>
                {isSending ? (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0" />
                )}
              </div>
              <span className="text-xs text-slate-500 ml-6">Continue without selecting equipment</span>
            </button>
            
            {/* Cancel option */}
            <button
              onClick={async () => {
                await chatAPI.cancelFlow();
                queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
              }}
              className="w-full text-center p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm"
            >
              <X className="w-3.5 h-3.5 inline mr-1" />
              None of these / Cancel
            </button>
          </div>
        )}
        
        {/* Failure Mode Suggestions - only on latest message */}
        {isInteractive && msg.failure_mode_suggestions && msg.failure_mode_suggestions.length > 0 && (
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
            
            <button
              onClick={() => {
                sendMutation.mutate({ content: "Failure mode: I don't know", image: null });
              }}
              disabled={isSending}
              className="w-full text-left p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="failure-mode-unknown-btn"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-slate-700 text-sm">I don&apos;t know</span>
                </div>
                {isSending ? (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                )}
              </div>
              <span className="text-xs text-slate-500 ml-6">Record without a specific failure mode</span>
            </button>
            
            {/* New Failure Mode option */}
            <button
              onClick={() => {
                setShowNewFailureModeInput(true);
                setNewFailureModeName("");
                setTimeout(() => {
                  newFailureModeInputRef.current?.focus();
                }, 100);
              }}
              disabled={isSending}
              className="w-full text-left p-2.5 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="new-failure-mode-option"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-900 text-sm">New Failure Mode</span>
                </div>
                <ArrowRight className="w-4 h-4 text-green-400 group-hover:text-green-600 transition-colors" />
              </div>
              <span className="text-xs text-green-600 ml-6">Specify a custom failure mode</span>
            </button>
            
            {/* Cancel option for failure modes */}
            <button
              onClick={async () => {
                setShowNewFailureModeInput(false);
                setNewFailureModeName("");
                await chatAPI.cancelFlow();
                queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
              }}
              className="w-full text-center p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm"
            >
              <X className="w-3.5 h-3.5 inline mr-1" />
              None of these / Describe differently
            </button>
          </div>
        )}
        
        {/* New Failure Mode Input - shown when user clicks "New Failure Mode" */}
        {showNewFailureModeInput && (
          <div className="mt-3 space-y-2">
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <label className="block text-sm font-medium text-green-800 mb-2">
                Enter failure mode name:
              </label>
              <div className="flex gap-2">
                <input
                  ref={newFailureModeInputRef}
                  type="text"
                  value={newFailureModeName}
                  onChange={(e) => setNewFailureModeName(e.target.value)}
                  placeholder="e.g., Bearing wear, Seal leak..."
                  className="flex-1 px-3 py-2 text-sm border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFailureModeName.trim().length >= 3) {
                      sendMutation.mutate({ content: `New failure mode: ${newFailureModeName.trim()}`, image: null });
                      setShowNewFailureModeInput(false);
                      setNewFailureModeName("");
                    }
                  }}
                  disabled={isSending}
                  data-testid="new-failure-mode-input"
                />
                <button
                  onClick={() => {
                    if (newFailureModeName.trim().length >= 3) {
                      sendMutation.mutate({ content: `New failure mode: ${newFailureModeName.trim()}`, image: null });
                      setShowNewFailureModeInput(false);
                      setNewFailureModeName("");
                    } else {
                      toast.error("Failure mode name must be at least 3 characters");
                    }
                  }}
                  disabled={isSending || newFailureModeName.trim().length < 3}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  data-testid="submit-new-failure-mode"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-green-600 mt-1">Min. 3 characters required</p>
            </div>
            <button
              onClick={() => {
                setShowNewFailureModeInput(false);
                setNewFailureModeName("");
              }}
              className="w-full text-center p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-sm"
            >
              <X className="w-3.5 h-3.5 inline mr-1" />
              Cancel
            </button>
          </div>
        )}
        
        {/* Show "New Failure Mode" option when no failure modes found (empty array) */}
        {/* New failure mode option - only on latest message */}
        {isInteractive && msg.failure_mode_suggestions && msg.failure_mode_suggestions.length === 0 && !showNewFailureModeInput && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-amber-700">No matching failure modes found in the library.</p>
            <button
              onClick={() => {
                setShowNewFailureModeInput(true);
                setNewFailureModeName("");
                setTimeout(() => {
                  newFailureModeInputRef.current?.focus();
                }, 100);
              }}
              disabled={isSending}
              className="w-full text-left p-2.5 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="new-failure-mode-empty-option"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-900 text-sm">New Failure Mode</span>
                </div>
                <ArrowRight className="w-4 h-4 text-green-400 group-hover:text-green-600 transition-colors" />
              </div>
              <span className="text-xs text-green-600 ml-6">Specify the failure mode name</span>
            </button>
          </div>
        )}
        
        {/* Skip context - only on latest message */}
        {isInteractive && isFollowUp && !msg.threat_id && !msg.equipment_suggestions && !msg.failure_mode_suggestions && !showNewFailureModeInput && (
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
        onClick={handleCloseWithAutoSkip}
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[210]"
        data-testid="chat-backdrop"
      />

      {/* Sidebar */}
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[400px] bg-slate-50 shadow-2xl z-[220] flex flex-col"
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
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => clearChatMutation.mutate()}
                disabled={clearChatMutation.isPending}
                className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                title="Clear chat history"
                data-testid="clear-chat-btn"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCloseWithAutoSkip}
              className="text-slate-400 hover:text-slate-600"
              data-testid="close-chat-sidebar"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
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
              {messages.map((msg, idx) => {
                // Hide "skip" user messages — they're internal signals to advance the
                // conversation, not real content the user wants to see.
                if (msg.role === "user" && (msg.content || "").trim().toLowerCase() === "skip") {
                  return null;
                }
                const isLastAssistant = msg.role === "assistant" && 
                  !messages.slice(idx + 1).some(m => m.role === "assistant");
                return (
                  <div
                    key={msg.id || idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {renderMessageContent(msg, isLastAssistant)}
                  </div>
                );
              })}
              {/* AI Processing Indicator */}
              {(isSending || isTranscribing) && (
                <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 bg-blue-50 border border-blue-200">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                        </div>
                        <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-30" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-blue-800">
                          {isTranscribing ? "Transcribing & translating..." : "AI is processing..."}
                        </p>
                        <p className="text-xs text-blue-500">This may take a few seconds</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageUpload}
            className="hidden"
          />
          <input
            ref={documentInputRef}
            type="file"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
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
            <>
            {/* Language Detection Badge */}
            {(detectedLanguage || manualLanguage) && (
              <div className="flex items-center mb-2">
                <Popover open={showLangPicker} onOpenChange={setShowLangPicker}>
                  <PopoverTrigger asChild>
                    <button
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-600 transition-colors"
                      data-testid="chat-language-selector"
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
                        data-testid={`chat-language-option-${lang.code}`}
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
                        >
                          Auto-detect
                        </button>
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            )}
            
            {/* Recording indicator */}
            {isRecording && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-red-700 font-medium">Recording... {formatTime(recordingTime)}</span>
                <button
                  onClick={cancelRecording}
                  className="ml-auto px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  Stop
                </button>
              </div>
            )}
            
            {/* Transcribing indicator */}
            {isTranscribing && (
              <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-700">Transcribing voice…</span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              {/* Attachment Button with Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                  title="Attach file"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                {showAttachMenu && (
                  <>
                    {/* Backdrop to close menu */}
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowAttachMenu(false)}
                    />
                    {/* Menu */}
                    <div className="absolute bottom-12 left-0 z-50 w-48 bg-white rounded-lg border border-slate-200 shadow-lg p-1">
                      <button
                        onClick={() => {
                          setShowAttachMenu(false);
                          cameraInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Camera className="w-4 h-4 text-blue-600" />
                        <span>Take Photo</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowAttachMenu(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <ImagePlus className="w-4 h-4 text-green-600" />
                        <span>Attach from Library</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowAttachMenu(false);
                          documentInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <FileUp className="w-4 h-4 text-purple-600" />
                        <span>Add File</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Input Container */}
              <div className={`relative flex-1 bg-white rounded-3xl border flex items-center overflow-visible shadow-sm min-h-[44px] transition-all ${
                isListening 
                  ? 'border-red-400 ring-2 ring-red-200' 
                  : 'border-slate-200 focus-within:border-slate-300'
              }`}>
                <textarea
                  ref={textareaRef}
                  value={message + (interimTranscript ? interimTranscript : "")}
                  onChange={(e) => {
                    // Only update if not from interim transcript
                    if (!isListening) {
                      setMessage(e.target.value);
                    } else {
                      // When listening, only update the non-interim part
                      const newValue = e.target.value;
                      const interimLength = interimTranscript.length;
                      setMessage(newValue.slice(0, -interimLength || undefined));
                    }
                    // Auto-resize to fit content
                    e.target.style.height = 'auto';
                    const newHeight = Math.max(40, Math.min(e.target.scrollHeight, 150));
                    e.target.style.height = newHeight + 'px';
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder={isListening ? "Listening… speak now" : "Type or tap mic to dictate..."}
                  className="flex-1 px-4 py-3 text-sm bg-transparent border-none outline-none resize-none placeholder:text-slate-400 leading-5 scrollbar-thin focus:ring-0 focus:outline-none"
                  rows={1}
                  style={{ 
                    minHeight: '40px',
                    maxHeight: '150px',
                    overflowY: (message.length + interimTranscript.length) > 100 ? 'auto' : 'hidden'
                  }}
                  data-testid="sidebar-chat-message-input"
                />
                {/* Listening pill above input */}
                {isListening && (
                  <div className="absolute -top-7 left-3 flex items-center gap-1.5 bg-red-500 text-white text-[11px] font-medium px-2 py-0.5 rounded-full shadow-sm">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    Listening
                  </div>
                )}
                {/* Mic button inside input - real-time speech */}
                <button
                  onClick={toggleListening}
                  disabled={isSending}
                  className={`flex-shrink-0 w-8 h-8 mr-2 rounded-full flex items-center justify-center transition-all ${
                    isListening 
                      ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-300' 
                      : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                  title={isListening ? "Stop dictation" : "Start dictation"}
                  data-testid="sidebar-voice-record-button"
                >
                  {isListening ? (
                    <Square className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Send Button - always visible */}
              <button
                onClick={handleSend}
                disabled={isSending || (!message.trim() && !imageBase64)}
                className={`flex-shrink-0 w-11 h-11 rounded-full text-white flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 ${
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
            </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ChatSidebar;
