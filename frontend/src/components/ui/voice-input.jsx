/**
 * VoiceInput Component
 * Adds voice transcription capability to any text input/textarea
 * Uses Whisper API for speech-to-text
 */
import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Square } from "lucide-react";
import { Button } from "./button";
import { toast } from "sonner";
import { voiceAPI } from "../../lib/api";
import { cn } from "../../lib/utils";

export const VoiceInput = ({ 
  onTranscribe, 
  disabled = false,
  className = "",
  size = "default", // "default" | "sm" | "lg"
  appendMode = true, // If true, appends to existing text. If false, replaces
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : 'audio/mp4';
      
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        // Process audio
        if (audioChunksRef.current.length > 0) {
          setIsTranscribing(true);
          try {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            
            // Convert to base64
            const reader = new FileReader();
            reader.onloadend = async () => {
              try {
                const base64 = reader.result;
                const result = await voiceAPI.transcribe(base64);
                const transcribedText = result.text;
                
                if (transcribedText && transcribedText.trim()) {
                  onTranscribe(transcribedText.trim(), appendMode);
                  toast.success("Voice transcribed successfully");
                } else {
                  toast.error("Could not transcribe voice - no text detected");
                }
              } catch (error) {
                console.error("Transcription error:", error);
                toast.error("Failed to transcribe voice");
              } finally {
                setIsTranscribing(false);
                setRecordingDuration(0);
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch (error) {
            console.error("Audio processing error:", error);
            toast.error("Failed to process audio");
            setIsTranscribing(false);
            setRecordingDuration(0);
          }
        }
      };
      
      mediaRecorderRef.current = recorder;
      recorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("Microphone access error:", error);
      if (error.name === 'NotAllowedError') {
        toast.error("Microphone access denied. Please allow microphone access.");
      } else {
        toast.error("Could not access microphone");
      }
    }
  }, [onTranscribe, appendMode]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const sizeClasses = {
    sm: "h-8 w-8",
    default: "h-9 w-9",
    lg: "h-10 w-10",
  };

  const iconSizeClasses = {
    sm: "h-3.5 w-3.5",
    default: "h-4 w-4",
    lg: "h-5 w-5",
  };

  if (isTranscribing) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled
        className={cn(sizeClasses[size], "relative", className)}
        title="Transcribing..."
      >
        <Loader2 className={cn(iconSizeClasses[size], "animate-spin text-blue-500")} />
      </Button>
    );
  }

  return (
    <div className={cn("relative inline-flex items-center gap-1", className)}>
      {isRecording && (
        <span className="text-xs font-medium text-red-600 animate-pulse mr-1">
          {formatDuration(recordingDuration)}
        </span>
      )}
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="icon"
        onClick={toggleRecording}
        disabled={disabled}
        className={cn(
          sizeClasses[size],
          isRecording && "animate-pulse",
          !isRecording && "hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
        )}
        title={isRecording ? "Stop recording" : "Record voice note"}
        data-testid="voice-input-button"
      >
        {isRecording ? (
          <Square className={cn(iconSizeClasses[size], "fill-current")} />
        ) : (
          <Mic className={iconSizeClasses[size]} />
        )}
      </Button>
    </div>
  );
};

export default VoiceInput;
