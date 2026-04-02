import * as React from "react";
import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Eraser, Check, X } from "lucide-react";

/**
 * SignaturePad - Canvas-based signature capture component
 * 
 * @param {Object} props
 * @param {function} props.onSave - Callback with base64 data URL when signature is saved
 * @param {function} props.onClear - Callback when signature is cleared
 * @param {string} props.value - Current signature data URL (for display)
 * @param {string} props.className - Additional class names
 * @param {boolean} props.disabled - Whether the pad is disabled
 */
export function SignaturePad({
  onSave,
  onClear,
  value,
  className,
  disabled = false,
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(!value);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isCapturing) return;

    const ctx = canvas.getContext("2d");
    
    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
      
      // Set drawing style
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [isCapturing]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    if (disabled || !isCapturing) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoordinates(e);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e) => {
    if (!isDrawing || disabled || !isCapturing) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoordinates(e);
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    e?.preventDefault();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onClear?.();
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    
    // Get the data URL
    const dataUrl = canvas.toDataURL("image/png");
    onSave?.(dataUrl);
    setIsCapturing(false);
  };

  const startNewSignature = () => {
    setIsCapturing(true);
    setHasDrawn(false);
    onClear?.();
  };

  // If we have a saved signature, show it
  if (value && !isCapturing) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="border-2 border-green-300 bg-green-50 rounded-lg p-3">
          <img 
            src={value} 
            alt="Signature" 
            className="max-h-24 mx-auto"
          />
        </div>
        <div className="flex gap-2 justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startNewSignature}
            disabled={disabled}
          >
            <Eraser className="w-4 h-4 mr-1" />
            Clear & Re-sign
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div 
        className={cn(
          "relative border-2 border-dashed rounded-lg bg-white overflow-hidden",
          hasDrawn ? "border-blue-300" : "border-slate-300",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        style={{ height: "120px", touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-slate-400">Draw your signature here</p>
          </div>
        )}
      </div>
      
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearCanvas}
          disabled={disabled || !hasDrawn}
        >
          <X className="w-4 h-4 mr-1" />
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={saveSignature}
          disabled={disabled || !hasDrawn}
          className="bg-green-600 hover:bg-green-700"
        >
          <Check className="w-4 h-4 mr-1" />
          Save Signature
        </Button>
      </div>
    </div>
  );
}

export default SignaturePad;
