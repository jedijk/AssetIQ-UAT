import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatAPI, voiceAPI } from "../lib/api";
import { pickAudioMimeType } from "../lib/mediaRecorderUtils";
import { queryKeys } from "../lib/queryKeys";
import { ChatMessageList } from "./chat/ChatMessageContent";
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
  Globe,
  ChevronDown,
  FileUp,
  ImagePlus,
  Sparkles,
  Zap
} from "lucide-react";
import { Button } from "./ui/button";
import { useLanguage } from "../contexts/LanguageContext";
import { translateEnum } from "../lib/translateEnum";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English", flag: "EN" },
  { code: "nl", label: "Nederlands", flag: "NL" },
  { code: "de", label: "Deutsch", flag: "DE" },
];

const ChatSidebar = ({ isOpen, onClose, prefillEquipment = null, prefillMessage = null }) => {
  const { t, language: appLanguage, setLanguage: setAppLanguage } = useLanguage();
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
  const [detectedLanguage, setDetectedLanguage] = useState(null);
  const [manualLanguage, setManualLanguage] = useState(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isListening, setIsListening] = useState(false); // Real-time speech recognition
  const [interimTranscript, setInterimTranscript] = useState(""); // Partial transcript while speaking
  const [autoSkipCountdown, setAutoSkipCountdown] = useState(null); // Countdown timer for auto-skip
  const [aiModeEnabled, setAiModeEnabled] = useState(false); // AI mode for better descriptions (slower)
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const textareaRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recognitionRef = useRef(null); // Speech recognition instance
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
      const prefillText = t("chat.reportingForEquipment", { equipment: prefillEquipment });
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
    queryKey: queryKeys.chat.history(),
    queryFn: () => chatAPI.getHistory(100),
    enabled: isOpen,
  });
  
  /**
   * Auto-skip on close: when the user closes the chat window while:
   * 1) A skip countdown is actively running (autoSkipCountdown > 0), OR
   * 2) The assistant is awaiting more context AND the Skip button is the active option
   * 
   * Fire a "skip" message in the background so the conversation is finalized rather
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
    
    // Also auto-skip if countdown is actively running (regardless of other conditions)
    const countdownIsRunning = autoSkipCountdown !== null && autoSkipCountdown > 0;
    
    // 5-second cooldown: if a skip was already fired (manual button, timer, etc.)
    // very recently, don't fire another one. Prevents race conditions where
    // `messages` hasn't yet refetched after the previous skip's "Got it!" reply.
    const recentlyFired = Date.now() - lastSkipFiredAtRef.current < 5000;
    
    // Fire auto-skip if: (skipIsTheOption OR countdownIsRunning) AND not in-flight AND not recently fired
    if ((skipIsTheOption || countdownIsRunning) && !contextSkipInFlightRef.current && !recentlyFired) {
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
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.history() });
          queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
          queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
        })
        .catch(() => { /* silently ignore — user is closing the window */ })
        .finally(() => {
          contextSkipInFlightRef.current = false;
        });
    }
    
    onClose();
  };
  
  /**
   * Close and clear timer without triggering auto-skip.
   * Used when user intentionally navigates away (e.g., clicking "View Full Details").
   */
  const handleCloseAndClearTimer = () => {
    // Clear the timer without firing auto-skip
    if (autoSkipTimerRef.current) {
      clearInterval(autoSkipTimerRef.current);
      autoSkipTimerRef.current = null;
    }
    setAutoSkipCountdown(null);
    contextSkipDeadlineMsRef.current = null;
    contextSkipTrackedMessageIdRef.current = null;
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
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.history() });
          queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
          queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
        })
        .catch((err) => {
          const msg = err?.response?.data?.detail || t("chat.autoSkipFailed");
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
    mutationFn: ({ content, image }) => chatAPI.sendMessage(content, image, manualLanguage, aiModeEnabled),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.history() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
      
      // Detect database environment mismatch
      // If user sent what looks like an equipment selection but got equipment options back
      const sentContent = variables?.content || "";
      const looksLikeEquipmentSelection = /\([A-Z0-9-]+\)/.test(sentContent);
      const gotEquipmentOptionsBack = data?.equipment_suggestions?.length > 0;
      
      if (looksLikeEquipmentSelection && gotEquipmentOptionsBack) {
        // This likely means the chat state was lost (database environment changed)
        toast.warning(t("chat.chatStateReset"), {
          duration: 5000,
        });
        // Force refetch chat history to sync with current database
        queryClient.refetchQueries({ queryKey: queryKeys.chat.history() });
      }
      
      setMessage("");
      setImageBase64(null);
      setImagePreview(null);
      if (data?.detected_language) {
        setDetectedLanguage(data.detected_language);
        const lang = data.detected_language;
        if (!data?.is_mixed_language && (lang === "en" || lang === "nl") && lang !== appLanguage) {
          setAppLanguage(lang);
        }
      }
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail || t("chat.sendFailed");
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
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.history() });
      toast.success(t("chat.chatCleared"));
    },
    onError: () => {
      toast.error(t("chat.clearChatFailed"));
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
    } else {
      setShowLangPicker(false);
      setShowAttachMenu(false);
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
      toast.error(t("chat.imageTypeError"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("chat.imageSizeError"));
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
      
      const mimeType = pickAudioMimeType();
      
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
      toast.error(t("chat.micAccessError"));
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
      // Get transcription from voice. Pass active language (manual > detected > app default) so Whisper uses the right hint.
      const activeLang = manualLanguage || detectedLanguage || appLanguage || null;
      const result = await voiceAPI.sendVoice(blob, activeLang, true); // true = transcribe only, don't process chat
      
      if (result?.detected_language) {
        setDetectedLanguage(result.detected_language);
        const lang = result.detected_language;
        if (!result?.is_mixed_language && (lang === "en" || lang === "nl") && lang !== appLanguage) {
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
        toast.error(t("chat.noTextFromVoice"));
      }
    } catch (error) {
      toast.error(t("chat.voiceTranscribeFailed"));
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

  // Real-time speech recognition replaced with Whisper-based recording.
  // The mic button toggles a lightweight inline recording — the audio is sent to the backend
  // (OpenAI Whisper) which transcribes the original spoken language(s), including mixed
  // Dutch + English in the same utterance. The browser's built-in SpeechRecognition is
  // locale-locked and would mistranscribe mixed-language speech.
  const inlineRecorderRef = useRef(null);
  const inlineChunksRef = useRef([]);
  const inlineStreamRef = useRef(null);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      inlineStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      inlineChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) inlineChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        // Release mic
        try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
        inlineStreamRef.current = null;
        const chunks = inlineChunksRef.current;
        inlineChunksRef.current = [];
        if (!chunks.length) {
          setIsTranscribing(false);
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        setIsTranscribing(true);
        try {
          const activeLang = manualLanguage || detectedLanguage || appLanguage || null;
          const result = await voiceAPI.sendVoice(blob, activeLang, true);
          if (result?.detected_language) {
            setDetectedLanguage(result.detected_language);
            const lang = result.detected_language;
            if (!result?.is_mixed_language && (lang === "en" || lang === "nl") && lang !== appLanguage) {
              setAppLanguage(lang);
            }
          }
          if (result?.transcribed_text) {
            const transcribedText = result.transcribed_text.trim();
            setMessage(prev => (prev.trim() ? prev.trim() + " " : "") + transcribedText);
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.focus();
                const len = textareaRef.current.value.length;
                try { textareaRef.current.setSelectionRange(len, len); } catch (_) {}
                resizeAndScrollTextarea();
              }
            }, 50);
          } else {
            toast.error(t("chat.noSpeechDetected"));
          }
        } catch (e) {
          toast.error(t("chat.voiceTranscribeFailed"));
        } finally {
          setIsTranscribing(false);
        }
      };
      inlineRecorderRef.current = recorder;
      recorder.start(250);
      setIsListening(true);
      setInterimTranscript("");
      // Focus textarea so the input feels active
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          try { textareaRef.current.setSelectionRange(len, len); } catch (_) {}
        }
      }, 50);
    } catch (error) {
      toast.error(t("chat.micAccessError"));
      setIsListening(false);
    }
  };

  const stopListening = () => {
    const recorder = inlineRecorderRef.current;
    inlineRecorderRef.current = null;
    setIsListening(false);
    setInterimTranscript("");
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch (_) {}
    } else if (inlineStreamRef.current) {
      try { inlineStreamRef.current.getTracks().forEach((t) => t.stop()); } catch (_) {}
      inlineStreamRef.current = null;
    }
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

  const chatMessageProps = {
    variant: "sidebar",
    t,
    isSending,
    autoSkipCountdown,
    onSendMessage: (content, image = null) => sendMutation.mutate({ content, image }),
    onReviseInput: () => {
      textareaRef.current?.focus();
      setMessage(t("chat.changePrefix"));
    },
    onCancelFlow: async () => {
      try {
        setIsSending(true);
        await chatAPI.cancelFlow();
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.history() });
        queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      } catch {
        toast.error(t("chat.cancelFailed"));
      } finally {
        setIsSending(false);
      }
    },
    onAddPhoto: () => fileInputRef.current?.click(),
    onSkip: () => {
      if (autoSkipTimerRef.current) {
        clearInterval(autoSkipTimerRef.current);
      }
      setAutoSkipCountdown(null);
      lastSkipFiredAtRef.current = Date.now();
      sendMutation.mutate({ content: "skip", image: null });
    },
    onThreatLinkClick: handleCloseAndClearTimer,
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
        className="fixed right-0 top-0 h-[100dvh] w-full sm:w-[400px] bg-slate-50 shadow-2xl z-[220] flex flex-col min-h-0"
        data-testid="chat-sidebar"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 sm:p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900 text-sm sm:text-base truncate">{t("chat.title")}</h2>
              <p className="text-[10px] sm:text-xs text-slate-500">{t("chat.headerSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {/* Fast / AI mode — segmented control (touch-friendly) */}
            <div
              role="group"
              aria-label={t("chat.responseMode")}
              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 p-0.5 shrink-0"
              data-testid="chat-response-mode-toggle"
            >
              <button
                type="button"
                onClick={() => setAiModeEnabled(false)}
                className={`flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-medium transition-all min-h-9 min-w-[4.25rem] sm:min-w-0 justify-center touch-manipulation ${
                  !aiModeEnabled
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 active:bg-slate-200/80"
                }`}
                aria-pressed={!aiModeEnabled}
                title={t("chat.modeFastHint")}
                data-testid="chat-fast-mode-btn"
              >
                <Zap className="w-3 h-3 flex-shrink-0" />
                <span>{t("chat.modeFast")}</span>
              </button>
              <button
                type="button"
                onClick={() => setAiModeEnabled(true)}
                className={`flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-medium transition-all min-h-9 min-w-[3.5rem] sm:min-w-0 justify-center touch-manipulation ${
                  aiModeEnabled
                    ? "bg-white text-purple-700 shadow-sm"
                    : "text-slate-500 active:bg-slate-200/80"
                }`}
                aria-pressed={aiModeEnabled}
                title={t("chat.modeAiHint")}
                data-testid="chat-ai-mode-btn"
              >
                <Sparkles className="w-3 h-3 flex-shrink-0" />
                <span>{t("chat.modeAi")}</span>
              </button>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => clearChatMutation.mutate()}
                disabled={clearChatMutation.isPending}
                className="w-8 h-8 sm:w-9 sm:h-9 text-slate-400 hover:text-red-500 hover:bg-red-50"
                title={t("chat.clearChatHistory")}
                data-testid="clear-chat-btn"
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCloseWithAutoSkip}
              className="w-8 h-8 sm:w-9 sm:h-9 text-slate-400 hover:text-slate-600"
              data-testid="close-chat-sidebar"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 min-h-0 mobile-scroll-pane px-2 py-3 sm:p-4 space-y-3 sm:space-y-4 custom-scrollbar">
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
                {t("chat.title")}
              </h3>
              <p className="text-slate-500 text-sm mb-4">
                {t("chat.emptyStateDesc")}
              </p>
              <div className="text-left bg-white rounded-xl p-3 text-xs text-slate-600 border border-slate-200 w-full">
                <p className="font-medium text-slate-700 mb-2">{t("chat.examples")}</p>
                <p className="mb-1">• {t("chat.example1")}</p>
                <p className="mb-1">• {t("chat.example2")}</p>
                <p>• {t("chat.example3")}</p>
              </div>
            </div>
          ) : (
            <>
              <ChatMessageList messages={messages} messageProps={chatMessageProps} />
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
                          {isTranscribing ? t("chat.transcribingTranslating") : t("chat.aiProcessing")}
                        </p>
                        <p className="text-xs text-blue-500">{t("chat.mayTakeSeconds")}</p>
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
        <div className="flex-shrink-0 border-t border-slate-200 bg-slate-100 px-2 py-2 sm:p-3">
          {/* Image Preview */}
          {imagePreview && (
            <div className="mb-2 sm:mb-3 px-1">
              <div className="relative inline-block">
                <img src={imagePreview} alt="Upload preview" className="rounded-lg max-h-16 sm:max-h-20 border border-slate-300" />
                <button
                  onClick={() => {
                    setImageBase64(null);
                    setImagePreview(null);
                  }}
                  className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-900 transition-colors"
                >
                  <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
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
                title={t("chat.cancelRecordingTitle")}
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
                  title={isPaused ? t("chat.resumeRecordingTitle") : t("chat.pauseRecordingTitle")}
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
                title={isTranscribing ? t("chat.processingVoiceTitle") : t("chat.sendVoiceTitle")}
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
            {/* Language Selector — always visible so user can pick EN/NL before dictating */}
            <div className="relative mb-1.5 sm:mb-2 h-7">
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  setShowLangPicker((open) => !open);
                }}
                className="inline-flex items-center justify-center gap-1.5 h-7 w-[5.5rem] px-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-600 transition-colors"
                data-testid="chat-language-selector"
                title={t("chat.languageDictationTitle")}
                aria-label={t("chat.languageDictationTitle")}
                aria-expanded={showLangPicker}
                aria-haspopup="menu"
              >
                <Globe className="w-3 h-3 shrink-0" />
                <span className="w-6 text-center text-[11px] font-bold leading-none tabular-nums">
                  {(() => {
                    const active = manualLanguage || detectedLanguage || appLanguage || "en";
                    return LANGUAGE_OPTIONS.find((l) => l.code === active)?.flag || active.toUpperCase();
                  })()}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    !manualLanguage && detectedLanguage ? "bg-blue-400" : "bg-transparent"
                  }`}
                  title={!manualLanguage && detectedLanguage ? t("chat.detected") : undefined}
                  aria-hidden="true"
                />
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
              {showLangPicker && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    aria-hidden="true"
                    onClick={() => setShowLangPicker(false)}
                  />
                  <div
                    role="menu"
                    className="absolute bottom-full left-0 z-50 mb-2 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                    data-testid="chat-language-menu"
                  >
                    {LANGUAGE_OPTIONS.map((lang) => {
                      const active = manualLanguage || detectedLanguage || appLanguage;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          role="menuitem"
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm hover:bg-slate-100 transition-colors ${
                            active === lang.code ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"
                          }`}
                          onClick={() => {
                            setManualLanguage(lang.code);
                            setShowLangPicker(false);
                            if (lang.code === "en" || lang.code === "nl" || lang.code === "de") {
                              setAppLanguage(lang.code);
                            }
                          }}
                          data-testid={`chat-language-option-${lang.code}`}
                        >
                          <span className="text-xs font-bold w-6 shrink-0">{lang.flag}</span>
                          {lang.label}
                        </button>
                      );
                    })}
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      type="button"
                      role="menuitem"
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm hover:bg-slate-100 transition-colors ${
                        manualLanguage ? "text-slate-700" : "text-slate-400 cursor-default"
                      }`}
                      disabled={!manualLanguage}
                      onClick={() => {
                        if (!manualLanguage) return;
                        setManualLanguage(null);
                        setShowLangPicker(false);
                      }}
                    >
                      {t("chat.autoDetect")}
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {/* Recording indicator */}
            {isRecording && (
              <div className="mb-1.5 sm:mb-2 p-1.5 sm:p-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 sm:gap-3">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                <span className="text-xs sm:text-sm text-red-700 font-medium flex-1 min-w-0 truncate">{t("chat.recording")} {formatTime(recordingTime)}</span>
                <button
                  onClick={cancelRecording}
                  className="ml-auto px-2 py-0.5 sm:px-3 sm:py-1 bg-red-600 text-white text-[10px] sm:text-xs font-medium rounded-lg hover:bg-red-700 transition-colors flex-shrink-0"
                >
                  {t("chat.stop")}
                </button>
              </div>
            )}
            
            {/* Transcribing indicator */}
            {isTranscribing && (
              <div className="mb-1.5 sm:mb-2 p-1.5 sm:p-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 sm:gap-3">
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 animate-spin flex-shrink-0" />
                <span className="text-xs sm:text-sm text-blue-700">{t("chat.transcribing")}</span>
              </div>
            )}
            
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Attachment Button with Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowLangPicker(false);
                    setShowAttachMenu(!showAttachMenu);
                  }}
                  className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                  title={t("chat.attachFileTitle")}
                >
                  <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                {showAttachMenu && (
                  <>
                    {/* Backdrop to close menu */}
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowAttachMenu(false)}
                    />
                    {/* Menu - positioned to fit on mobile */}
                    <div className="absolute bottom-12 left-0 z-50 w-44 sm:w-48 bg-white rounded-lg border border-slate-200 shadow-lg p-1">
                      <button
                        onClick={() => {
                          setShowAttachMenu(false);
                          cameraInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-2 sm:py-2.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Camera className="w-4 h-4 text-blue-600" />
                        <span>{t("chat.takePhoto")}</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowAttachMenu(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-2 sm:py-2.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <ImagePlus className="w-4 h-4 text-green-600" />
                        <span>{t("chat.fromLibrary")}</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowAttachMenu(false);
                          documentInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-2 sm:py-2.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <FileUp className="w-4 h-4 text-purple-600" />
                        <span>{t("chat.addFile")}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Input Container */}
              <div className={`relative flex-1 min-w-0 bg-white rounded-3xl border flex items-center overflow-visible shadow-sm min-h-[40px] sm:min-h-[44px] transition-all ${
                isListening 
                  ? 'border-red-400 ring-2 ring-red-200' 
                  : 'border-slate-200 focus-within:border-slate-300'
              }`}>
                <textarea
                  ref={textareaRef}
                  id="sidebar-chat-message-input"
                  name="sidebar-chat-message-input"
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
                  placeholder={isListening ? t("chat.recording") : (isTranscribing ? t("chat.transcribing") : t("chat.inputPlaceholder"))}
                  disabled={isTranscribing}
                  className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 text-sm bg-transparent border-none outline-none resize-none placeholder:text-slate-400 leading-5 scrollbar-thin focus:ring-0 focus:outline-none disabled:opacity-60"
                  rows={1}
                  style={{ 
                    minHeight: '36px',
                    maxHeight: '150px',
                    overflowY: (message.length + interimTranscript.length) > 100 ? 'auto' : 'hidden'
                  }}
                  data-testid="sidebar-chat-message-input"
                />
                {/* Listening / Transcribing pill above input */}
                {isListening && (
                  <div className="absolute -top-6 sm:-top-7 left-2 sm:left-3 flex items-center gap-1 sm:gap-1.5 bg-red-500 text-white text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    {t("chat.recording")}
                  </div>
                )}
                {!isListening && isTranscribing && (
                  <div className="absolute -top-6 sm:-top-7 left-2 sm:left-3 flex items-center gap-1 sm:gap-1.5 bg-blue-600 text-white text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full shadow-sm">
                    <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" />
                    {t("chat.transcribing")}
                  </div>
                )}
                {/* Mic button inside input - records audio, sent to backend Whisper on stop */}
                <button
                  onClick={toggleListening}
                  disabled={isSending || isTranscribing}
                  className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 mr-1.5 sm:mr-2 rounded-full flex items-center justify-center transition-all ${
                    isListening 
                      ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-300' 
                      : isTranscribing
                        ? 'bg-blue-100 text-blue-600'
                        : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                  title={isListening ? t("chat.stopTranscribeTitle") : (isTranscribing ? t("chat.transcribing") : t("chat.tapToRecordTitle"))}
                  data-testid="sidebar-voice-record-button"
                >
                  {isListening ? (
                    <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
                  ) : isTranscribing ? (
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                </button>
              </div>

              {/* Send Button - always visible */}
              <button
                onClick={handleSend}
                disabled={isSending || (!message.trim() && !imageBase64)}
                className={`flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-full text-white flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 ${
                  isSending 
                    ? 'bg-blue-400' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                data-testid="sidebar-send-message-button"
                title={t("chat.sendMessageTitle")}
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
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
