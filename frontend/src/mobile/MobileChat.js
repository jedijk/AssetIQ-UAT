import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatAPI, voiceAPI } from "../lib/api";
import { X, Send, Mic, MicOff, Image, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MobileChat = ({ onClose }) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ["chatHistory"],
    queryFn: () => chatAPI.getHistory(100),
  });

  const sendMutation = useMutation({
    mutationFn: ({ content }) => chatAPI.sendMessage(content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      setMessage("");
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to send");
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
          } catch {
            toast.error("Failed to transcribe");
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch {
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const renderMessage = (msg) => {
    const isUser = msg.role === "user";
    
    return (
      <div key={msg.id} className={`chat-message ${isUser ? "user" : "assistant"}`}>
        <div className="message-bubble">
          <p>{msg.content}</p>
          
          {/* Equipment Suggestions */}
          {msg.equipment_suggestions?.length > 0 && (
            <div className="suggestions">
              {msg.equipment_suggestions.slice(0, 5).map((eq, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(eq.name)}
                  className="suggestion-btn"
                >
                  {eq.name}
                </button>
              ))}
            </div>
          )}

          {/* Failure Mode Suggestions */}
          {msg.failure_mode_suggestions?.length > 0 && (
            <div className="suggestions">
              {msg.failure_mode_suggestions.slice(0, 5).map((fm, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(fm.failure_mode)}
                  className="suggestion-btn"
                >
                  {fm.failure_mode}
                </button>
              ))}
            </div>
          )}

          {/* Threat Created */}
          {msg.threat_summary && (
            <div className="threat-card">
              <div className="threat-header">
                <span className="threat-icon">✓</span>
                <span>Observation Recorded</span>
              </div>
              <p className="threat-title">{msg.threat_title}</p>
              <div className="threat-meta">
                <span>Risk: {msg.threat_risk_level}</span>
                <span>Score: {msg.threat_risk_score}</span>
                <span>Rank: #{msg.threat_rank}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mobile-chat" data-testid="mobile-chat">
      {/* Header */}
      <header className="chat-header">
        <button onClick={onClose} className="close-btn" data-testid="close-chat">
          <X size={24} />
        </button>
        <h1>Report Observation</h1>
        <div style={{ width: 40 }} />
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>Describe the issue you observed</p>
            <p className="hint">e.g., "pump is leaking" or "motor overheating"</p>
          </div>
        ) : (
          messages.map(renderMessage)
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
            placeholder="Describe the failure..."
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
          background: #0a0a0a;
          display: flex;
          flex-direction: column;
          z-index: 200;
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #1a1a1a;
          border-bottom: 1px solid #333;
        }

        .chat-header h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }

        .close-btn {
          background: none;
          border: none;
          color: #fff;
          padding: 8px;
          cursor: pointer;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .chat-empty {
          text-align: center;
          padding: 60px 20px;
          color: #888;
        }

        .chat-empty .hint {
          font-size: 13px;
          color: #666;
          margin-top: 8px;
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
          padding: 12px 16px;
          border-radius: 16px;
        }

        .chat-message.user .message-bubble {
          background: #3b82f6;
          border-bottom-right-radius: 4px;
        }

        .chat-message.assistant .message-bubble {
          background: #1a1a1a;
          border-bottom-left-radius: 4px;
        }

        .message-bubble p {
          margin: 0;
          font-size: 15px;
          line-height: 1.4;
        }

        .suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .suggestion-btn {
          padding: 8px 12px;
          background: #222;
          border: 1px solid #444;
          border-radius: 8px;
          color: #fff;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .suggestion-btn:hover {
          background: #333;
          border-color: #3b82f6;
        }

        .threat-card {
          margin-top: 12px;
          padding: 12px;
          background: #14532d;
          border-radius: 8px;
        }

        .threat-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #86efac;
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
          font-weight: 500;
          margin: 0 0 8px 0;
          color: #fff;
        }

        .threat-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #86efac;
        }

        .chat-input-container {
          padding: 12px 16px;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          background: #1a1a1a;
          border-top: 1px solid #333;
        }

        .chat-input {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #222;
          border-radius: 24px;
          padding: 4px 8px 4px 16px;
        }

        .chat-input input {
          flex: 1;
          background: none;
          border: none;
          color: #fff;
          font-size: 15px;
          padding: 12px 0;
          outline: none;
        }

        .chat-input input::placeholder {
          color: #666;
        }

        .voice-btn, .send-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .voice-btn {
          background: #333;
          color: #fff;
        }

        .voice-btn.recording {
          background: #ef4444;
          animation: pulse 1s infinite;
        }

        .send-btn {
          background: #3b82f6;
          color: #fff;
        }

        .send-btn:disabled {
          background: #333;
          color: #666;
          cursor: not-allowed;
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
