import { useState, useRef } from "react";
import { Camera, Loader2, CheckCircle, AlertTriangle, RotateCcw, X } from "lucide-react";
import { Button } from "../ui/button";
import { getBackendUrl } from "../../lib/apiConfig";

const CONFIDENCE_COLORS = {
  high: "ring-green-400 bg-green-50",
  low: "ring-amber-400 bg-amber-50",
  missing: "ring-red-300 bg-red-50",
};

export default function PhotoDataCaptureField({ config, formData, onAutoFill }) {
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
    fd.append("image", file);
    fd.append("schema_json", JSON.stringify(schema));

    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${getBackendUrl()}/api/ai/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
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
      for (const item of data.extracted) {
        if (item.value == null) continue;
        // Find the extraction field config to get target_field_id
        const fieldCfg = (config.extraction_fields || []).find((f) => f.key === item.key);
        const targetId = fieldCfg?.target_field_id || item.key;
        fills[targetId] = {
          value: item.value,
          confidence: item.confidence,
          raw_text: item.raw_text,
          source: "ai_extraction",
        };
      }
      onAutoFill(fills);
    } catch (err) {
      setStatus("error");
      setError(err.message || "Failed to extract data");
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {results.filter((r) => r.value != null).length} fields extracted
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
            <img src={preview} alt="Captured" className="w-full max-h-40 object-contain rounded-lg border" />
          )}

          {/* Extraction results summary */}
          <div className="grid grid-cols-2 gap-2">
            {results.map((r) => {
              const level = r.value == null ? "missing" : r.confidence >= threshold ? "high" : "low";
              return (
                <div key={r.key} className={`text-xs p-2 rounded-lg ring-1 ${CONFIDENCE_COLORS[level]}`}>
                  <div className="text-slate-500 truncate">{r.key}</div>
                  <div className="font-medium text-slate-800 truncate">
                    {r.value != null ? String(r.value) : "—"}
                  </div>
                  {level === "low" && (
                    <div className="flex items-center gap-1 mt-0.5 text-amber-600">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Low confidence</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
