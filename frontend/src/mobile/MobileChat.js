import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatAPI, voiceAPI } from "../lib/api";
import { pickAudioMimeType } from "../lib/mediaRecorderUtils";
import { queryKeys } from "../lib/queryKeys";
import { X, Send, Mic, MicOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { ChatMessageList } from "../components/chat/ChatMessageContent";

const MobileChat = ({ onClose, prefillMessage, onPrefillConsumed }) => {
  const { t } = useLanguage();
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (prefillMessage) {
      setMessage(prefillMessage);
      onPrefillConsumed?.();
    }
  }, [prefillMessage, onPrefillConsumed]);

  const { data: messages = [] } = useQuery({
    queryKey: queryKeys.chat.history(),
    queryFn: () => chatAPI.getHistory(100),
  });

  const sendMutation = useMutation({
    mutationFn: ({ content }) => chatAPI.sendMessage(content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.history() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      setMessage("");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || t("chat.sendFailed"));
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => chatAPI.clearHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.history() });
      toast.success(t("chat.chatCleared"));
    },
    onError: () => {
      toast.error(t("chat.clearChatFailed"));
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate({ content: message });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = pickAudioMimeType();
      
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
            toast.success(t("chat.voiceTranscribed"));
          } catch {
            toast.error(t("chat.voiceTranscribeFailed"));
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch {
      toast.error(t("chat.micAccessError"));
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const chatMessageProps = {
    variant: "mobile",
    t,
    isSending: sendMutation.isPending,
    onSendMessage: (content) => sendMutation.mutate({ content }),
    onEquipmentPrefill: (name) => setMessage(name),
  };

  return (
    <div className="mobile-chat" data-testid="mobile-chat">
      {/* Header */}
      <header className="chat-header">
        <button onClick={onClose} className="close-btn" data-testid="close-chat">
          <X size={24} />
        </button>
        <div className="header-text">
          <h1>{t("chat.title")}</h1>
          <p>{t("chat.subtitle")}</p>
        </div>
        {messages.length > 0 ? (
          <button 
            onClick={() => clearMutation.mutate()} 
            className="clear-btn"
            disabled={clearMutation.isPending}
            data-testid="clear-chat"
          >
            <Trash2 size={20} />
          </button>
        ) : (
          <div style={{ width: 40 }} />
        )}
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="empty-icon">💬</div>
            <p>{t("chat.startConversation")}</p>
            <p className="hint">{t("chat.example1")} · {t("chat.example3")}</p>
          </div>
        ) : (
          <ChatMessageList messages={messages} messageProps={chatMessageProps} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-container">
        <div className="chat-input">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder={t("chat.inputPlaceholder")}
            data-testid="chat-input"
          />
          
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`voice-btn ${isRecording ? "recording" : ""}`}
            data-testid="voice-btn"
          >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="send-btn"
            data-testid="send-btn"
          >
            {sendMutation.isPending ? (
              <Loader2 size={20} className="spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
      </div>

      <style>{`
        .mobile-chat {
          position: fixed;
          inset: 0;
          height: 100dvh;
          background: #f1f5f9;
          display: flex;
          flex-direction: column;
          min-height: 0;
          z-index: 200;
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          padding: 16px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
        }

        .header-text {
          text-align: center;
        }

        .chat-header h1 {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          color: #0f172a;
        }

        .chat-header p {
          font-size: 12px;
          color: #64748b;
          margin: 2px 0 0 0;
        }

        .close-btn {
          background: none;
          border: none;
          color: #64748b;
          padding: 8px;
          cursor: pointer;
          border-radius: 8px;
        }

        .close-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .clear-btn {
          background: none;
          border: none;
          color: #94a3b8;
          padding: 8px;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .clear-btn:hover {
          background: #fef2f2;
          color: #ef4444;
        }

        .clear-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-messages {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-y: contain;
          touch-action: pan-y;
          padding: 16px;
        }

        .chat-empty {
          text-align: center;
          padding: 60px 20px;
          color: #64748b;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .chat-empty p {
          margin: 0;
          font-weight: 500;
        }

        .chat-empty .hint {
          font-size: 13px;
          color: #94a3b8;
          margin-top: 8px;
          font-weight: 400;
        }

        .chat-message {
          margin-bottom: 16px;
          display: flex;
        }

        .chat-message.user {
          justify-content: flex-end;
        }

        .chat-message.assistant {
          justify-content: flex-start;
        }

        .message-bubble {
          max-width: 85%;
          padding: 14px 16px;
          border-radius: 18px;
        }

        .chat-message.user .message-bubble {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: #ffffff;
          border-bottom-right-radius: 4px;
        }

        .chat-message.assistant .message-bubble {
          background: #ffffff;
          color: #0f172a;
          border-bottom-left-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .message-bubble p {
          margin: 0;
          font-size: 15px;
          line-height: 1.4;
        }

        .issue-confirm-intro {
          color: #1e293b;
          white-space: pre-wrap;
          margin-bottom: 8px;
        }

        .issue-confirm-summary {
          color: #16a34a;
          font-weight: 600;
          font-size: 15px;
          line-height: 1.45;
          margin: 4px 0 8px;
        }

        .issue-confirm-prompt {
          color: #475569;
          font-size: 13px;
          white-space: pre-wrap;
          margin-bottom: 10px;
        }

        .issue-confirm-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 4px;
        }

        .issue-confirm-yes {
          padding: 10px 18px;
          border-radius: 10px;
          border: none;
          background: #16a34a;
          color: #fff;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        }

        .issue-confirm-yes:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .issue-confirm-revise {
          padding: 10px 18px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #334155;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        }

        .issue-confirm-revise:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .issue-confirm-hint {
          margin: 10px 0 0;
          font-size: 12px;
          color: #64748b;
          line-height: 1.35;
        }

        .suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .suggestion-btn {
          padding: 8px 14px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          color: #1e293b;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .suggestion-btn:hover {
          background: #e2e8f0;
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .suggestion-btn-muted {
          background: #fafafa;
          border-color: #cbd5e1;
          color: #475569;
        }

        .suggestion-btn-muted:hover {
          border-color: #64748b;
          color: #334155;
          background: #f1f5f9;
        }

        .threat-card {
          margin-top: 12px;
          padding: 14px;
          background: #f0fdf4;
          border-radius: 12px;
          border: 1px solid #bbf7d0;
        }

        .threat-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #16a34a;
          font-weight: 600;
          font-size: 13px;
          margin-bottom: 8px;
        }

        .threat-icon {
          width: 20px;
          height: 20px;
          background: #22c55e;
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }

        .threat-title {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #166534;
        }

        .threat-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #16a34a;
        }

        .chat-input-container {
          flex-shrink: 0;
          padding: 12px 16px;
          padding-bottom: max(16px, env(safe-area-inset-bottom));
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
        }

        .chat-input {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f1f5f9;
          border-radius: 28px;
          padding: 6px 8px 6px 18px;
          border: 1px solid #e2e8f0;
        }

        .chat-input:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .chat-input input {
          flex: 1;
          background: none;
          border: none;
          color: #0f172a;
          font-size: 15px;
          padding: 10px 0;
          outline: none;
        }

        .chat-input input::placeholder {
          color: #94a3b8;
        }

        .voice-btn, .send-btn {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .voice-btn {
          background: #f1f5f9;
          color: #64748b;
        }

        .voice-btn:hover {
          background: #e2e8f0;
          color: #3b82f6;
        }

        .voice-btn.recording {
          background: #fef2f2;
          color: #ef4444;
          animation: pulse 1s infinite;
        }

        .send-btn {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: #fff;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
        }

        .send-btn:hover {
          transform: scale(1.05);
        }

        .send-btn:disabled {
          background: #e2e8f0;
          color: #94a3b8;
          box-shadow: none;
          cursor: not-allowed;
          transform: none;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default MobileChat;
