import { useState, useRef } from "react";
import { Camera, Loader2, CheckCircle, AlertTriangle, RotateCcw, X } from "lucide-react";
import { Button } from "../ui/button";
import { getApiUrl } from "../../lib/apiConfig";
import { compressImage } from "../../lib/imageCompression";

const CONFIDENCE_COLORS = {
  high: "ring-green-400 bg-green-50",
  low: "ring-amber-400 bg-amber-50",
  missing: "ring-red-300 bg-red-50",
};

const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"

function getCookie(name) {
  try {
    const cookies = document.cookie ? document.cookie.split(";") : [];
    for (const c of cookies) {
      const [k, ...rest] = c.trim().split("=");
      if (k === name) return decodeURIComponent(rest.join("=") || "");
    }
  } catch (_e) {}
  return null;
}

export default function PhotoDataCaptureField({ config, formData, onAutoFill, formTemplateId }) {
  const [status, setStatus] = useState("idle"); // idle, processing, success, error
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  if (!config?.enabled) return null;

  const handleCapture = () => {
    inputRef.current?.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const url = URL.createObjectURL(file);
    setPreview(url);
    setStatus("processing");
    setError(null);
    setResults([]);

    // Compress image before sending to AI
    let fileToSend = file;
    if (file.type.startsWith("image/")) {
      try {
        const compressed = await compressImage(file, { maxSizeMB: 1.5, maxWidthOrHeight: 2560, quality: 0.92 });
        fileToSend = compressed.file;
        console.log(`[PhotoCapture] Compressed: ${(file.size/1024).toFixed(0)}KB → ${(compressed.compressedSize/1024).toFixed(0)}KB`);
      } catch (e) {
        console.warn("[PhotoCapture] Compression failed, using original:", e);
      }
    }

    // Build schema for the API
    const schema = {
      fields: (config.extraction_fields || []).map((f) => ({
        key: f.key,
        description: f.description,
        type: f.type || "string",
        unit: f.unit || null,
        required: f.required || false,
        enum_values: f.enum_values || null,
      })),
      mode: config.mode || "hybrid",
      prompt_template: config.prompt_template || null,
      confidence_threshold: config.confidence_threshold ?? 0.7,
    };

    const fd = new FormData();
    fd.append("image", fileToSend);
    fd.append("schema_json", JSON.stringify(schema));
    if (formTemplateId) fd.append("form_template_id", formTemplateId);
    // Anchor AI date/datetime extraction to when the photo was taken (browser clock, ISO UTC).
    fd.append("captured_at_iso", new Date().toISOString());

    try {
      const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
      const headers = {};
      if (AUTH_MODE !== "cookie" && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (AUTH_MODE === "cookie") {
        const csrf = getCookie("assetiq_csrf");
        if (csrf) headers["X-CSRF-Token"] = csrf;
      }

      const resp = await fetch(`${getApiUrl()}/ai/extract`, {
        method: "POST",
        headers,
        // Cookie auth must include credentials (Safari/iOS especially)
        credentials: AUTH_MODE === "cookie" ? "include" : "omit",
        body: fd,
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        let detail = errBody.detail;
        if (Array.isArray(detail)) {
          detail = detail.map(d => d.msg || d.message || JSON.stringify(d)).join(", ");
        } else if (typeof detail === 'object' && detail !== null) {
          detail = detail.msg || detail.message || JSON.stringify(detail);
        }
        throw new Error(detail || `HTTP ${resp.status}`);
      }

      const data = await resp.json();

      if (!data.success) {
        setStatus("error");
        setError(data.message || "Extraction failed");
        return;
      }

      setResults(data.extracted || []);
      setStatus("success");

      // Auto-fill form fields
      const fills = {};
      const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const item of data.extracted) {
        if (item.value == null) continue;
        // Find matching extraction field config — try exact match first, then normalized
        const fieldCfg = (config.extraction_fields || []).find(
          (f) => f.key === item.key || normalize(f.key) === normalize(item.key)
        );
        const targetId = fieldCfg?.target_field_id || item.key;
        console.log(`[PhotoCapture] AI key="${item.key}" → config match=${!!fieldCfg} → target="${targetId}" value=${item.value}`);
        fills[targetId] = {
          value: item.value,
          confidence: item.confidence,
          raw_text: item.raw_text,
          source: "ai_extraction",
          date_adjusted: item.date_adjusted === true,
        };
      }
      // Include stored photo path
      if (data.photo_path) {
        fills["__ai_scan_photo"] = {
          value: data.photo_path,
          source: "ai_extraction_photo",
        };
      }
      console.log("[PhotoCapture] Total fills:", Object.keys(fills).length, fills);
      onAutoFill(fills);
    } catch (err) {
      setStatus("error");
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || "Failed to extract data");
      setError(msg);
    }

    // Reset input
    if (inputRef.current) inputRef.current.value = "";
  };

  const threshold = config.confidence_threshold ?? 0.7;

  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-4 mb-4 bg-slate-50/50" data-testid="photo-data-capture">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
        data-testid="photo-capture-input"
      />

      {/* Idle */}
      {status === "idle" && !preview && (
        <button
          onClick={handleCapture}
          className="w-full flex flex-col items-center gap-2 py-6 text-slate-500 hover:text-blue-600 transition-colors"
          data-testid="photo-capture-btn"
        >
          <Camera className="w-8 h-8" />
          <span className="text-sm font-medium">{config.label || "Capture Photo"}</span>
          <span className="text-xs text-slate-400">Tap to open camera</span>
        </button>
      )}

      {/* Processing */}
      {status === "processing" && (
        <div className="flex flex-col items-center gap-3 py-4">
          {preview && (
            <img src={preview} alt="Captured" className="w-24 h-24 object-cover rounded-lg border" />
          )}
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Analyzing image...</span>
          </div>
        </div>
      )}

      {/* Success */}
      {status === "success" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {results.filter((r) => r.value != null).length} fields filled
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleCapture} data-testid="photo-retake-btn">
                <RotateCcw className="w-3 h-3" /> Retake
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setStatus("idle"); setPreview(null); setResults([]); }}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {preview && (
            <img src={preview} alt="Captured" className="w-full max-h-32 object-contain rounded-lg border" />
          )}
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="flex flex-col items-center gap-3 py-4">
          {preview && (
            <img src={preview} alt="Captured" className="w-24 h-24 object-cover rounded-lg border opacity-60" />
          )}
          <div className="text-center">
            <p className="text-sm text-red-600 font-medium">{error || "Extraction failed"}</p>
            <p className="text-xs text-slate-400 mt-1">You can retry or fill fields manually</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleCapture} data-testid="photo-retry-btn">
            <RotateCcw className="w-3 h-3" /> Retry
          </Button>
        </div>
      )}
    </div>
  );
}
