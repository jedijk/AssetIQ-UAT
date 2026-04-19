import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Upload, FileText, Loader2, CheckCircle2, XCircle, AlertCircle,
  Trash2, ChevronRight, Database, Settings, RefreshCw, Play, Eye, X,
  FileSpreadsheet, Clock, Activity, FolderOpen, BarChart3, Sparkles, TrendingUp,
  CheckSquare, Square, Save, BookOpen, Copy, Check, AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { getBackendUrl } from "../lib/apiConfig";

const API = getBackendUrl();
const getHeaders = () => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  const dbEnv = localStorage.getItem("database_environment");
  if (dbEnv) h["X-Database-Environment"] = dbEnv;
  return h;
};

const STATUS_STYLES = {
  uploaded: { bg: "bg-blue-100", text: "text-blue-700", label: "Uploaded" },
  previewed: { bg: "bg-amber-100", text: "text-amber-700", label: "Previewed" },
  processing: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Processing" },
  completed: { bg: "bg-green-100", text: "text-green-700", label: "Completed" },
  failed: { bg: "bg-red-100", text: "text-red-700", label: "Failed" },
};

const EVENT_COLORS = {
  normal: "bg-green-100 text-green-700",
  downtime: "bg-red-100 text-red-700",
  waste: "bg-orange-100 text-orange-700",
  alarm: "bg-amber-100 text-amber-700",
};

// ======================== Step components ========================

function UploadStep({ onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const inputRef = useRef(null);
  const folderInputRef = useRef(null);

  const VALID_EXT = ["csv", "txt", "log", "zip", "xlsx", "xls"];

  const filterValid = (fileList) => {
    const valid = [];
    for (const f of fileList) {
      const ext = (f.name || "").split(".").pop().toLowerCase();
      if (VALID_EXT.includes(ext)) valid.push(f);
    }
    return valid;
  };

  // Recursively read folder entries from drag & drop
  const readEntries = async (entry) => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((f) => {
          // Attach relative path
          Object.defineProperty(f, "relativePath", { value: entry.fullPath.replace(/^\//, "") });
          resolve([f]);
        }, () => resolve([]));
      });
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const files = [];
      const readBatch = () => new Promise((resolve) => {
        reader.readEntries((entries) => resolve(entries), () => resolve([]));
      });
      let batch = await readBatch();
      while (batch.length > 0) {
        for (const e of batch) {
          const sub = await readEntries(e);
          files.push(...sub);
        }
        batch = await readBatch();
      }
      return files;
    }
    return [];
  };

  const handleFiles = async (fileList, fromFolder = false) => {
    const valid = filterValid(fileList);
    if (!valid.length) {
      toast.error("No valid log files found (CSV, TXT, LOG, XLSX, XLS, ZIP)");
      return;
    }
    setUploading(true);
    setFileCount(valid.length);

    const CHUNK_SIZE = 5;
    let jobId = null;

    try {
      for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
        const chunk = valid.slice(i, i + CHUNK_SIZE);
        setFileCount(valid.length - i);

        const fd = new FormData();
        if (jobId) fd.append("job_id", jobId);
        for (const f of chunk) {
          const path = f.relativePath || f.webkitRelativePath || f.name;
          fd.append("files", f, path);
        }

        const res = await fetch(`${API}/api/production-logs/upload`, {
          method: "POST", headers: getHeaders(), body: fd,
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.detail || "Upload failed");
        }
        const data = await res.json();
        if (!jobId) jobId = data.job_id;
      }

      toast.success(`${valid.length} file(s) uploaded`);
      onUploaded(jobId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      setFileCount(0);
    }
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    // Check for folder drops via webkitGetAsEntry
    const items = e.dataTransfer.items;
    if (items?.length) {
      const allFiles = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.() || item.getAsEntry?.();
        if (entry) {
          const files = await readEntries(entry);
          allFiles.push(...files);
        }
      }
      if (allFiles.length) {
        handleFiles(allFiles, true);
        return;
      }
    }
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  return (
    <div className="space-y-3">
      <div
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors ${
          dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
        }`}
        data-testid="log-upload-dropzone"
      >
        <input ref={inputRef} type="file" multiple accept=".csv,.txt,.log,.zip,.xlsx,.xls" className="hidden"
          onChange={(e) => { handleFiles(Array.from(e.target.files)); e.target.value = ""; }} />
        <input ref={folderInputRef} type="file" className="hidden"
          onChange={(e) => { handleFiles(Array.from(e.target.files), true); e.target.value = ""; }}
          {...{ webkitdirectory: "", directory: "", multiple: true }} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-sm text-slate-600">Uploading {fileCount} file(s)...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-10 h-10 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">Drag & drop files or folders here</p>
              <p className="text-xs text-slate-400 mt-1">CSV, TXT, LOG, XLSX, XLS, ZIP — supports folder structures</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>Browse Files</Button>
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50" data-testid="browse-folder-btn">
                <FolderOpen className="w-3.5 h-3.5 mr-1" /> Browse Folder
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigureStep({ jobId, onPreview, onBack }) {
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const [totalLines, setTotalLines] = useState(0);
  const [delimiter, setDelimiter] = useState(",");
  const [hasHeader, setHasHeader] = useState(true);
  const [skipRows, setSkipRows] = useState(0);
  const [mapping, setMapping] = useState({ timestamp: "", asset_id: "", status: "", metric_columns: [] });
  const [previewing, setPreviewing] = useState(false);

  const detectColumns = useCallback(async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("job_id", jobId);
      fd.append("delimiter", delimiter);
      fd.append("has_header", hasHeader);
      fd.append("skip_rows", skipRows);
      const res = await fetch(`${API}/api/production-logs/detect-columns`, {
        method: "POST", headers: getHeaders(), body: fd,
      });
      if (!res.ok) throw new Error("Detection failed");
      const data = await res.json();
      setColumns(data.columns);
      setSampleRows(data.sample_rows);
      setSuggestions(data.suggestions);
      setTotalLines(data.total_lines);
      if (data.detected_delimiter && data.detected_delimiter !== delimiter) {
        setDelimiter(data.detected_delimiter);
      }
      // Apply suggestions
      setMapping({
        timestamp: data.suggestions.timestamp || "",
        asset_id: data.suggestions.asset_id || "",
        status: data.suggestions.status || "",
        metric_columns: data.suggestions.metrics || [],
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, delimiter, hasHeader, skipRows]);

  useEffect(() => { detectColumns(); }, [detectColumns]);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const template = {
        delimiter, has_header: hasHeader, skip_rows: skipRows,
        column_mapping: mapping,
      };
      const fd = new FormData();
      fd.append("job_id", jobId);
      fd.append("template_json", JSON.stringify(template));
      const res = await fetch(`${API}/api/production-logs/parse-preview`, {
        method: "POST", headers: getHeaders(), body: fd,
      });
      if (!res.ok) throw new Error("Preview failed");
      const data = await res.json();
      onPreview(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPreviewing(false);
    }
  };

  const toggleMetric = (col) => {
    setMapping(prev => ({
      ...prev,
      metric_columns: prev.metric_columns.includes(col)
        ? prev.metric_columns.filter(c => c !== col)
        : [...prev.metric_columns, col],
    }));
  };

  const [aiParsing, setAiParsing] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  
  const runAiParse = async () => {
    setAiParsing(true);
    try {
      const fd = new FormData();
      fd.append("job_id", jobId);
      const res = await fetch(`${API}/api/production-logs/ai-parse`, { method: "POST", headers: getHeaders(), body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "AI analysis failed"); }
      const data = await res.json();
      if (data.success && data.analysis) {
        const a = data.analysis;
        if (a.delimiter) setDelimiter(a.delimiter === "tab" ? "\\t" : a.delimiter);
        if (a.has_header !== undefined) setHasHeader(a.has_header);
        if (a.skip_rows) setSkipRows(a.skip_rows);
        if (a.column_mapping) {
          setMapping({
            timestamp: a.column_mapping.timestamp || "",
            asset_id: a.column_mapping.asset_id || "",
            status: a.column_mapping.status || "",
            metric_columns: a.column_mapping.metric_columns || [],
          });
        }
        toast.success(a.notes || "AI detected structure");
        detectColumns();
      } else {
        toast.error(data.error || "AI could not parse structure");
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAiParsing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400 mr-2" />
        <span className="text-sm text-slate-500">Detecting columns...</span>
      </div>
    );
  }

  const unmappedCols = columns.filter(c => c !== mapping.timestamp && c !== mapping.asset_id && c !== mapping.status);

  return (
    <div className="space-y-6">
      {/* Parser settings */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Delimiter</Label>
          <Select value={delimiter} onValueChange={(v) => setDelimiter(v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value=",">Comma (,)</SelectItem>
              <SelectItem value=";">Semicolon (;)</SelectItem>
              <SelectItem value="\t">Tab</SelectItem>
              <SelectItem value="|">Pipe (|)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Skip Rows</Label>
          <Input type="number" min={0} value={skipRows} onChange={e => setSkipRows(parseInt(e.target.value) || 0)} className="h-9 text-sm" />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Switch checked={hasHeader} onCheckedChange={setHasHeader} id="has-header" />
          <Label htmlFor="has-header" className="text-xs">Has Header Row</Label>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" size="sm" onClick={detectColumns} className="h-9 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Re-detect
          </Button>
          <Button variant="outline" size="sm" onClick={runAiParse} disabled={aiParsing}
            className="h-9 text-xs text-purple-600 border-purple-200 hover:bg-purple-50" data-testid="ai-parse-btn">
            {aiParsing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
            AI Detect
          </Button>
        </div>
      </div>

      {/* Column mapping */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Column Mapping</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Timestamp Column *</Label>
              <Select value={mapping.timestamp || undefined} onValueChange={v => setMapping(p => ({ ...p, timestamp: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{columns.filter(c => c).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Asset/Equipment ID *</Label>
              <Select value={mapping.asset_id || undefined} onValueChange={v => setMapping(p => ({ ...p, asset_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{columns.filter(c => c).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Status Column</Label>
              <Select value={mapping.status || "__none__"} onValueChange={v => setMapping(p => ({ ...p, status: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {columns.filter(c => c).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Metric columns */}
          <div>
            <Label className="text-xs text-slate-500 mb-2 block">Metric Columns (select all that apply)</Label>
            <div className="flex flex-wrap gap-1.5">
              {unmappedCols.map(col => (
                <button key={col} onClick={() => toggleMetric(col)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    mapping.metric_columns.includes(col) ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {col}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sample data preview */}
      {sampleRows.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">Sample Data ({totalLines} rows detected)</p>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>{columns.map(c => <th key={c} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{c}</th>)}</tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t">
                    {columns.map(c => <td key={c} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{row[c] || ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back</Button>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowSaveTemplate(true)}
            disabled={!mapping.timestamp || !mapping.asset_id}
            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
            data-testid="save-template-btn"
          >
            <Save className="w-3.5 h-3.5 mr-1" /> Save as Template
          </Button>
          <Button size="sm" onClick={handlePreview} disabled={!mapping.timestamp || !mapping.asset_id || previewing}
            className="bg-blue-600 hover:bg-blue-700" data-testid="parse-preview-btn">
            {previewing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
            Parse & Preview
          </Button>
        </div>
      </div>

      {/* Save Template Modal */}
      <SaveTemplateModal
        isOpen={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        template={{ delimiter, has_header: hasHeader, skip_rows: skipRows, column_mapping: mapping }}
        columns={columns}
        onSaved={() => toast.success("Template saved! You can use it for bulk uploads.")}
      />
    </div>
  );
}

function PreviewStep({ jobId, previewData, onIngest, onBack }) {
  const [ingesting, setIngesting] = useState(false);
  const d = previewData;

  const handleIngest = async () => {
    setIngesting(true);
    try {
      const res = await fetch(`${API}/api/production-logs/ingest`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Ingestion failed"); }
      toast.success("Ingestion started!");
      onIngest();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-slate-700">{d.total_records}</div>
          <div className="text-[10px] text-slate-500">Total Records</div>
        </div>
        <div className={`rounded-lg p-3 text-center ${d.success_rate >= 95 ? "bg-green-50" : d.success_rate >= 80 ? "bg-amber-50" : "bg-red-50"}`}>
          <div className={`text-xl font-bold ${d.success_rate >= 95 ? "text-green-700" : d.success_rate >= 80 ? "text-amber-700" : "text-red-700"}`}>{d.success_rate}%</div>
          <div className="text-[10px] text-slate-500">Success Rate</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-blue-700">{d.records_with_asset_id}</div>
          <div className="text-[10px] text-slate-500">With Asset ID</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-slate-700">{d.records_with_errors}</div>
          <div className="text-[10px] text-slate-500">Errors</div>
        </div>
      </div>

      {/* Event summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(d.event_summary || {}).map(([type, count]) => (
          <Badge key={type} className={`${EVENT_COLORS[type] || "bg-slate-100 text-slate-700"} text-xs`}>
            {type}: {count}
          </Badge>
        ))}
      </div>

      {/* Preview table */}
      <div className="overflow-x-auto border rounded-lg max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-slate-600">Row</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600">Timestamp</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600">Asset</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600">Status</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600">Event</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600">Metrics</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600"></th>
            </tr>
          </thead>
          <tbody>
            {d.preview?.map((r, i) => (
              <tr key={i} className={`border-t ${r._errors?.length ? "bg-red-50/50" : ""}`}>
                <td className="px-2 py-1.5 text-slate-400">{r._row}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.timestamp || <span className="text-red-400 italic">missing</span>}</td>
                <td className="px-2 py-1.5 font-mono text-slate-700">{r.asset_id || "-"}</td>
                <td className="px-2 py-1.5">{r.status || "-"}</td>
                <td className="px-2 py-1.5"><Badge className={`${EVENT_COLORS[r.event_type] || ""} text-[10px] px-1.5`}>{r.event_type}</Badge></td>
                <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">
                  {Object.entries(r.metrics || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "-"}
                </td>
                <td className="px-2 py-1.5">
                  {r._errors?.length > 0 && (
                    <span className="text-red-500 text-[10px]" title={r._errors.join(", ")}><AlertCircle className="w-3 h-3 inline" /></span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* File stats */}
      {d.file_stats?.length > 0 && (
        <div className="text-xs text-slate-500">
          {d.file_stats.map((f, i) => (
            <span key={i} className="mr-4">{f.filename}: {f.total_rows} rows {f.errors > 0 && `(${f.errors} errors)`}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Reconfigure</Button>
        <Button size="sm" onClick={handleIngest} disabled={ingesting || d.total_records === 0}
          className="bg-green-600 hover:bg-green-700" data-testid="confirm-ingest-btn">
          {ingesting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
          Confirm & Ingest {d.total_records} Records
        </Button>
      </div>
    </div>
  );
}

// ======================== Batch Configure Step ========================

function BatchConfigureStep({ jobIds, jobs, onDone, onBack }) {
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const [delimiter, setDelimiter] = useState(",");
  const [hasHeader, setHasHeader] = useState(true);
  const [skipRows, setSkipRows] = useState(0);
  const [mapping, setMapping] = useState({ timestamp: "", asset_id: "", status: "", metric_columns: [] });
  const [ingesting, setIngesting] = useState(false);
  
  // Template selection
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [useTemplate, setUseTemplate] = useState(false);
  const [previewingMatch, setPreviewingMatch] = useState(false);
  const [matchPreview, setMatchPreview] = useState(null);

  // Fetch available templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch(`${API}/api/production-logs/templates`, { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch {}
    };
    fetchTemplates();
  }, []);

  // Detect columns from the first job's first file
  useEffect(() => {
    const detect = async () => {
      setLoading(true);
      try {
        const fd = new FormData();
        fd.append("job_id", jobIds[0]);
        fd.append("delimiter", delimiter);
        fd.append("has_header", hasHeader);
        fd.append("skip_rows", skipRows);
        const res = await fetch(`${API}/api/production-logs/detect-columns`, {
          method: "POST", headers: getHeaders(), body: fd,
        });
        if (!res.ok) throw new Error("Detection failed");
        const data = await res.json();
        setColumns(data.columns);
        setSampleRows(data.sample_rows);
        setSuggestions(data.suggestions);
        setMapping({
          timestamp: data.suggestions.timestamp || "",
          asset_id: data.suggestions.asset_id || "",
          status: data.suggestions.status || "",
          metric_columns: data.suggestions.metrics || [],
        });
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    };
    detect();
  }, [jobIds, delimiter, hasHeader, skipRows]);

  const toggleMetric = (col) => {
    setMapping(prev => ({
      ...prev,
      metric_columns: prev.metric_columns.includes(col)
        ? prev.metric_columns.filter(c => c !== col)
        : [...prev.metric_columns, col],
    }));
  };

  const handleBatchIngest = async () => {
    setIngesting(true);
    try {
      const template = { delimiter, has_header: hasHeader, skip_rows: skipRows, column_mapping: mapping };
      const res = await fetch(`${API}/api/production-logs/batch-ingest`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: jobIds, template }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Batch ingest failed"); }
      const data = await res.json();
      toast.success(`${data.started} job(s) started`);
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIngesting(false);
    }
  };

  const handleBatchIngestWithTemplate = async () => {
    if (!selectedTemplateId) {
      toast.error("Please select a template");
      return;
    }
    setIngesting(true);
    try {
      const res = await fetch(`${API}/api/production-logs/batch-ingest-with-template`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: jobIds, template_id: selectedTemplateId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Batch ingest failed"); }
      const data = await res.json();
      toast.success(`${data.started} job(s) started with template "${data.template_name}"`);
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIngesting(false);
    }
  };

  const previewTemplateMatch = async () => {
    if (!selectedTemplateId) return;
    setPreviewingMatch(true);
    try {
      const fd = new FormData();
      fd.append("job_id", jobIds[0]);
      fd.append("template_id", selectedTemplateId);
      const res = await fetch(`${API}/api/production-logs/preview-template-match`, {
        method: "POST", headers: getHeaders(), body: fd,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Preview failed"); }
      const data = await res.json();
      setMatchPreview(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPreviewingMatch(false);
    }
  };

  const unmappedCols = columns.filter(c => c !== mapping.timestamp && c !== mapping.asset_id && c !== mapping.status);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400 mr-2" />
        <span className="text-sm text-slate-500">Detecting columns from first file...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
        <p className="text-sm font-medium text-indigo-800">Batch Processing — {jobIds.length} jobs selected</p>
        <p className="text-xs text-indigo-600 mt-0.5">
          Configure the template once below. All {jobs.reduce((s, j) => s + (j.total_files || 0), 0)} files across {jobIds.length} jobs will be parsed and ingested using the same settings.
        </p>
      </div>

      {/* Template Selection Option */}
      {templates.length > 0 && (
        <Card className={useTemplate ? "border-green-300 bg-green-50/50" : ""}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-green-600" />
                Use Saved Template
              </CardTitle>
              <Switch 
                checked={useTemplate} 
                onCheckedChange={(checked) => {
                  setUseTemplate(checked);
                  if (!checked) {
                    setSelectedTemplateId(null);
                    setMatchPreview(null);
                  }
                }} 
                id="use-template" 
              />
            </div>
          </CardHeader>
          {useTemplate && (
            <CardContent className="px-4 pb-4 space-y-3">
              <div>
                <Label className="text-xs text-slate-500">Select Template</Label>
                <Select 
                  value={selectedTemplateId || undefined} 
                  onValueChange={(v) => { setSelectedTemplateId(v); setMatchPreview(null); }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Choose a saved template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.usage_count > 0 && <span className="text-slate-400 ml-1">(used {t.usage_count}x)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedTemplateId && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={previewTemplateMatch}
                    disabled={previewingMatch}
                    className="text-xs"
                  >
                    {previewingMatch ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
                    Preview Column Matching
                  </Button>
                </div>
              )}

              {/* Match Preview Results */}
              {matchPreview && (
                <div className="border rounded-lg p-3 bg-white space-y-2">
                  <div className="flex items-center gap-2">
                    {matchPreview.all_matched ? (
                      <Badge className="bg-green-100 text-green-700 text-xs"><Check className="w-3 h-3 mr-1" /> All columns matched</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 text-xs"><AlertTriangle className="w-3 h-3 mr-1" /> Some columns may not match</Badge>
                    )}
                  </div>
                  <div className="text-xs space-y-1">
                    {matchPreview.match_details?.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${d.success ? "bg-green-500" : "bg-red-500"}`} />
                        <span className="text-slate-600">{d.field}:</span>
                        <span className="font-mono text-slate-800">{d.template_column}</span>
                        <ChevronRight className="w-3 h-3 text-slate-400" />
                        <span className={`font-mono ${d.success ? "text-green-700" : "text-red-600"}`}>
                          {d.matched_to || "NOT FOUND"}
                        </span>
                        {d.match_type === "fuzzy" && d.success && (
                          <Badge variant="outline" className="text-[9px] h-4">fuzzy</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Manual Configuration (shown when not using template) */}
      {!useTemplate && (
        <>
          {/* Parser settings */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Delimiter</Label>
              <Select value={delimiter} onValueChange={setDelimiter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Comma (,)</SelectItem>
                  <SelectItem value=";">Semicolon (;)</SelectItem>
                  <SelectItem value="\t">Tab</SelectItem>
                  <SelectItem value="|">Pipe (|)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Skip Rows</Label>
              <Input type="number" min={0} value={skipRows} onChange={e => setSkipRows(parseInt(e.target.value) || 0)} className="h-9 text-sm" />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={hasHeader} onCheckedChange={setHasHeader} id="batch-has-header" />
              <Label htmlFor="batch-has-header" className="text-xs">Has Header Row</Label>
            </div>
          </div>

          {/* Column mapping */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Column Mapping</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Timestamp Column *</Label>
                  <Select value={mapping.timestamp || undefined} onValueChange={v => setMapping(p => ({ ...p, timestamp: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{columns.filter(c => c).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Asset/Equipment ID *</Label>
                  <Select value={mapping.asset_id || undefined} onValueChange={v => setMapping(p => ({ ...p, asset_id: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{columns.filter(c => c).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Status Column</Label>
                  <Select value={mapping.status || "__none__"} onValueChange={v => setMapping(p => ({ ...p, status: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {columns.filter(c => c).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-2 block">Metric Columns</Label>
                <div className="flex flex-wrap gap-1.5">
                  {unmappedCols.map(col => (
                    <button key={col} onClick={() => toggleMetric(col)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        mapping.metric_columns.includes(col) ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}>
                      {col}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sample preview */}
          {sampleRows.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>{columns.map(c => <th key={c} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {sampleRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t">
                      {columns.map(c => <td key={c} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{row[c] || ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back</Button>
        {useTemplate ? (
          <Button 
            size="sm" 
            onClick={handleBatchIngestWithTemplate}
            disabled={!selectedTemplateId || ingesting}
            className="bg-green-600 hover:bg-green-700" 
            data-testid="batch-template-btn"
          >
            {ingesting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Ingest {jobIds.length} Jobs with Template
          </Button>
        ) : (
          <Button 
            size="sm" 
            onClick={handleBatchIngest}
            disabled={!mapping.timestamp || !mapping.asset_id || ingesting}
            className="bg-green-600 hover:bg-green-700" 
            data-testid="batch-confirm-btn"
          >
            {ingesting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Ingest All {jobIds.length} Jobs
          </Button>
        )}
      </div>
    </div>
  );
}


// ======================== Save Template Modal ========================

function SaveTemplateModal({ isOpen, onClose, template, columns, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [aliases, setAliases] = useState({});  // {column: "alias1, alias2"}

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      // Initialize aliases for mapped columns
      const initialAliases = {};
      if (template?.column_mapping?.timestamp) initialAliases[template.column_mapping.timestamp] = "";
      if (template?.column_mapping?.asset_id) initialAliases[template.column_mapping.asset_id] = "";
      if (template?.column_mapping?.status) initialAliases[template.column_mapping.status] = "";
      (template?.column_mapping?.metric_columns || []).forEach(col => {
        initialAliases[col] = "";
      });
      setAliases(initialAliases);
    }
  }, [isOpen, template]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    setSaving(true);
    try {
      // Convert comma-separated aliases to arrays
      const columnAliases = {};
      Object.entries(aliases).forEach(([col, aliasStr]) => {
        if (aliasStr.trim()) {
          columnAliases[col] = aliasStr.split(",").map(a => a.trim()).filter(Boolean);
        }
      });

      const res = await fetch(`${API}/api/production-logs/templates`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          template,
          column_aliases: columnAliases,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || "Failed to save template");
      }
      const data = await res.json();
      toast.success(`Template "${name}" saved!`);
      onSaved?.(data);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const mappedColumns = [
    template?.column_mapping?.timestamp,
    template?.column_mapping?.asset_id,
    template?.column_mapping?.status,
    ...(template?.column_mapping?.metric_columns || []),
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Save className="w-4 h-4 text-indigo-600" />
            Save as Template
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-sm font-medium">Template Name *</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Production Line A Logs"
              className="mt-1"
              data-testid="template-name-input"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Description</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="mt-1"
            />
          </div>

          {/* Column Aliases Section */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Column Aliases (for fuzzy matching)</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Add alternative column names that should map to each field. This helps when different files use slightly different column names.
            </p>
            <div className="space-y-2">
              {mappedColumns.map(col => (
                <div key={col} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600 min-w-[100px] truncate" title={col}>
                    {col}
                  </span>
                  <Input
                    value={aliases[col] || ""}
                    onChange={e => setAliases(prev => ({ ...prev, [col]: e.target.value }))}
                    placeholder="alias1, alias2, ..."
                    className="flex-1 h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Template Preview */}
          <div className="bg-slate-50 rounded-lg p-3 text-xs">
            <div className="font-medium text-slate-700 mb-2">Template Configuration:</div>
            <div className="grid grid-cols-2 gap-1 text-slate-600">
              <span>Delimiter:</span><span className="font-mono">{template?.delimiter === "\t" ? "Tab" : template?.delimiter}</span>
              <span>Has Header:</span><span>{template?.has_header ? "Yes" : "No"}</span>
              <span>Skip Rows:</span><span>{template?.skip_rows || 0}</span>
              <span>Timestamp:</span><span className="truncate">{template?.column_mapping?.timestamp || "-"}</span>
              <span>Asset ID:</span><span className="truncate">{template?.column_mapping?.asset_id || "-"}</span>
              <span>Metrics:</span><span className="truncate">{(template?.column_mapping?.metric_columns || []).length} columns</span>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Save Template
          </Button>
        </div>
      </div>
    </div>
  );
}


// ======================== Templates Panel ========================

function TemplatesPanel() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/production-logs/templates`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDelete = async (templateId, name) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    setDeleting(templateId);
    try {
      const res = await fetch(`${API}/api/production-logs/templates/${templateId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Template deleted");
      fetchTemplates();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No saved templates yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Configure and save a template during the ingestion process to reuse it for bulk uploads
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{templates.length} saved template(s)</p>
        <Button variant="outline" size="sm" onClick={fetchTemplates}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>
      <div className="grid gap-3">
        {templates.map(t => (
          <Card key={t.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    {t.name}
                  </h4>
                  {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px]">
                      Delimiter: {t.template?.delimiter === "\t" ? "Tab" : t.template?.delimiter || ","}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Timestamp: {t.template?.column_mapping?.timestamp || "N/A"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Asset: {t.template?.column_mapping?.asset_id || "N/A"}
                    </Badge>
                    {(t.template?.column_mapping?.metric_columns?.length > 0) && (
                      <Badge variant="outline" className="text-[10px]">
                        {t.template.column_mapping.metric_columns.length} metrics
                      </Badge>
                    )}
                  </div>
                  {Object.keys(t.column_aliases || {}).length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      {Object.keys(t.column_aliases).length} column aliases defined
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                    Used {t.usage_count || 0}x
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(t.id, t.name)}
                    disabled={deleting === t.id}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                  >
                    {deleting === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}


// ======================== Dashboard Component ========================

function LogDashboard() {
  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState("");
  const [timeseries, setTimeseries] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aggregating, setAggregating] = useState(false);
  const [showDataTable, setShowDataTable] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const canvasRef = useRef(null);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/production-logs/assets`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
        if (data.assets?.length && !selectedAsset) setSelectedAsset(data.assets[0].asset_id);
      }
    } catch {}
  }, [selectedAsset]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/production-logs/stats`, { headers: getHeaders() });
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  const fetchTimeseries = useCallback(async () => {
    if (!selectedAsset) return;
    try {
      const res = await fetch(`${API}/api/production-logs/timeseries?asset_id=${encodeURIComponent(selectedAsset)}`, { headers: getHeaders() });
      if (res.ok) setTimeseries(await res.json());
    } catch {}
  }, [selectedAsset]);

  const fetchEntries = useCallback(async () => {
    if (!selectedAsset) return;
    setLoadingEntries(true);
    try {
      const res = await fetch(`${API}/api/production-logs/entries?asset_id=${encodeURIComponent(selectedAsset)}&limit=50`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {} finally { setLoadingEntries(false); }
  }, [selectedAsset]);

  useEffect(() => { fetchAssets(); fetchStats(); }, [fetchAssets, fetchStats]);
  useEffect(() => { if (selectedAsset) { fetchTimeseries(); fetchEntries(); } }, [selectedAsset, fetchTimeseries, fetchEntries]);
  useEffect(() => { setLoading(false); }, []);

  const runAggregation = async () => {
    setAggregating(true);
    try {
      const res = await fetch(`${API}/api/production-logs/aggregate`, { method: "POST", headers: getHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Failed"); }
      toast.success("Aggregation started");
      setTimeout(() => { fetchTimeseries(); fetchStats(); setAggregating(false); }, 3000);
    } catch (err) {
      toast.error(err.message);
      setAggregating(false);
    }
  };

  // Simple canvas chart renderer
  useEffect(() => {
    if (!canvasRef.current || !timeseries?.timestamps?.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.offsetWidth;
    const h = 280;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    const ts = timeseries.timestamps;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Draw grid
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke();
    }

    // Draw metrics
    const colors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#06b6d4"];
    const metricKeys = Object.keys(timeseries.metrics || {});

    if (metricKeys.length > 0) {
      // Find global min/max
      let globalMin = Infinity, globalMax = -Infinity;
      for (const mk of metricKeys) {
        const vals = timeseries.metrics[mk].avg;
        for (const v of vals) { if (v != null) { globalMin = Math.min(globalMin, v); globalMax = Math.max(globalMax, v); } }
      }
      if (globalMin === globalMax) { globalMin -= 1; globalMax += 1; }
      const range = globalMax - globalMin || 1;

      // Draw Y axis labels
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      for (let i = 0; i <= 4; i++) {
        const val = globalMax - (range / 4) * i;
        const y = padding.top + (chartH / 4) * i;
        ctx.fillText(val.toFixed(1), padding.left - 5, y + 4);
      }

      // Draw lines
      metricKeys.forEach((mk, mi) => {
        const vals = timeseries.metrics[mk].avg;
        ctx.beginPath();
        ctx.strokeStyle = colors[mi % colors.length];
        ctx.lineWidth = 2;
        let started = false;
        for (let i = 0; i < vals.length; i++) {
          if (vals[i] == null) continue;
          const x = padding.left + (i / Math.max(vals.length - 1, 1)) * chartW;
          const y = padding.top + chartH - ((vals[i] - globalMin) / range) * chartH;
          if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
      });

      // Legend
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      metricKeys.forEach((mk, mi) => {
        const lx = padding.left + mi * 100;
        ctx.fillStyle = colors[mi % colors.length];
        ctx.fillRect(lx, h - 15, 12, 3);
        ctx.fillStyle = "#475569";
        ctx.fillText(mk, lx + 16, h - 10);
      });
    }

    // X axis labels (show a few timestamps)
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(ts.length / 6));
    for (let i = 0; i < ts.length; i += step) {
      const x = padding.left + (i / Math.max(ts.length - 1, 1)) * chartW;
      const label = ts[i]?.substring(5, 16).replace("T", " ");
      ctx.fillText(label, x, h - padding.bottom + 15);
    }
  }, [timeseries]);

  // Event bar chart
  const eventBarRef = useRef(null);
  useEffect(() => {
    if (!eventBarRef.current || !timeseries?.timestamps?.length) return;
    const canvas = eventBarRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.offsetWidth;
    const h = 160;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const ts = timeseries.timestamps;
    const padding = { top: 15, right: 20, bottom: 30, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.max(2, chartW / ts.length - 1);

    const eventColors = { normal: "#22c55e", downtime: "#ef4444", waste: "#f97316", alarm: "#eab308" };
    let maxEvents = 1;
    for (let i = 0; i < ts.length; i++) {
      let sum = 0;
      for (const et of ["normal", "downtime", "waste", "alarm"]) sum += (timeseries.events[et]?.[i] || 0);
      maxEvents = Math.max(maxEvents, sum);
    }

    for (let i = 0; i < ts.length; i++) {
      const x = padding.left + (i / Math.max(ts.length - 1, 1)) * chartW - barW / 2;
      let yOffset = 0;
      for (const et of ["normal", "downtime", "waste", "alarm"]) {
        const val = timeseries.events[et]?.[i] || 0;
        if (val === 0) continue;
        const barH = (val / maxEvents) * chartH;
        ctx.fillStyle = eventColors[et];
        ctx.fillRect(x, padding.top + chartH - yOffset - barH, barW, barH);
        yOffset += barH;
      }
    }

    // Legend
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    let lx = padding.left;
    for (const [et, color] of Object.entries(eventColors)) {
      ctx.fillStyle = color;
      ctx.fillRect(lx, h - 12, 10, 3);
      ctx.fillStyle = "#475569";
      ctx.fillText(et, lx + 14, h - 7);
      lx += 70;
    }
  }, [timeseries]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={selectedAsset || undefined} onValueChange={setSelectedAsset}>
            <SelectTrigger className="w-[200px] h-9 text-sm" data-testid="asset-selector">
              <SelectValue placeholder="Select Asset" />
            </SelectTrigger>
            <SelectContent>
              {assets.map(a => (
                <SelectItem key={a.asset_id} value={a.asset_id}>{a.asset_id} ({a.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={runAggregation} disabled={aggregating} data-testid="run-aggregation-btn">
          {aggregating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
          {aggregating ? "Aggregating..." : "Rebuild Aggregations"}
        </Button>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-slate-700">{stats.total_entries?.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Log Entries</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{stats.unique_assets}</div>
            <div className="text-[10px] text-slate-500">Assets</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-red-600">{stats.events?.downtime || 0}</div>
            <div className="text-[10px] text-slate-500">Downtime Events</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-amber-600">{stats.events?.alarm || 0}</div>
            <div className="text-[10px] text-slate-500">Alarms</div>
          </div>
        </div>
      )}

      {/* Metrics Chart */}
      {timeseries?.total_points > 0 ? (
        <>
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                Metrics — {selectedAsset}
                <span className="text-xs text-slate-400 font-normal ml-auto">{timeseries.total_points} data points</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <canvas ref={canvasRef} data-testid="metrics-chart" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-600" />
                Events Timeline — {selectedAsset}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <canvas ref={eventBarRef} data-testid="events-chart" />
            </CardContent>
          </Card>

          {/* Data Table Toggle */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  Raw Data — {selectedAsset}
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { 
                    if (!showDataTable) fetchEntries();
                    setShowDataTable(!showDataTable); 
                  }}
                  data-testid="toggle-data-table-btn"
                >
                  {showDataTable ? "Hide Data" : "View Data"}
                </Button>
              </div>
            </CardHeader>
            {showDataTable && (
              <CardContent className="px-4 pb-4">
                {loadingEntries ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : entries.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No data entries found</p>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Timestamp</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
                          {entries[0]?.metrics && Object.keys(entries[0].metrics).slice(0, 8).map(k => (
                            <th key={k} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e, i) => (
                          <tr key={e.id || i} className="border-t hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                              {new Date(e.timestamp).toLocaleString()}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                e.event_type === 'downtime' ? 'bg-red-100 text-red-700' :
                                e.event_type === 'alarm' ? 'bg-amber-100 text-amber-700' :
                                e.event_type === 'waste' ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {e.event_type || 'normal'}
                              </span>
                            </td>
                            {e.metrics && Object.keys(entries[0].metrics).slice(0, 8).map(k => (
                              <td key={k} className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                {typeof e.metrics[k] === 'number' ? e.metrics[k].toFixed(2) : e.metrics[k] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No aggregated data yet</p>
            <p className="text-xs text-slate-400 mt-1">Ingest logs and click "Rebuild Aggregations" to generate charts</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// ======================== Main Page ========================

export default function SettingsLogIngestionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // Wizard state
  const [step, setStep] = useState("list"); // list, upload, configure, preview, batch-configure
  const [activeJobId, setActiveJobId] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [selectedJobs, setSelectedJobs] = useState(new Set());

  const isOwner = user?.role === "owner";

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/production-logs/jobs`, { headers: getHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {} finally { setJobsLoading(false); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/production-logs/stats`, { headers: getHeaders() });
      if (!res.ok) return;
      setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => { if (isOwner) { fetchJobs(); fetchStats(); } else { setJobsLoading(false); } }, [isOwner, fetchJobs, fetchStats]);

  const deleteJob = async (jobId) => {
    if (!window.confirm("Delete this job and all its ingested data?")) return;
    try {
      const res = await fetch(`${API}/api/production-logs/jobs/${jobId}`, { method: "DELETE", headers: getHeaders() });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Job deleted");
      fetchJobs();
      fetchStats();
    } catch (err) { toast.error(err.message); }
  };

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-slate-500">Owner access required</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto" data-testid="log-ingestion-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            Production Log Ingestion
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Upload, parse, and analyze production logs</p>
        </div>
      </div>

      <Tabs defaultValue="ingestion" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="ingestion" className="text-xs"><Upload className="w-3.5 h-3.5 mr-1" /> Ingestion</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs"><BookOpen className="w-3.5 h-3.5 mr-1" /> Templates</TabsTrigger>
          <TabsTrigger value="dashboard" className="text-xs"><BarChart3 className="w-3.5 h-3.5 mr-1" /> Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="ingestion">
          {/* Cancel button when in wizard */}
          {step !== "list" && (
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={() => { setStep("list"); setActiveJobId(null); setPreviewData(null); fetchJobs(); fetchStats(); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
            </div>
          )}

      {/* Stats bar */}
      {stats && step === "list" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-slate-700">{stats.total_entries}</div>
            <div className="text-[10px] text-slate-500">Total Log Entries</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{stats.unique_assets}</div>
            <div className="text-[10px] text-slate-500">Unique Assets</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-green-600">{stats.jobs_completed}</div>
            <div className="text-[10px] text-slate-500">Jobs Completed</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="flex justify-center gap-2 text-xs">
              {Object.entries(stats.events || {}).map(([k, v]) => (
                <Badge key={k} className={`${EVENT_COLORS[k] || "bg-slate-100 text-slate-700"} text-[10px]`}>{k}: {v}</Badge>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Events</div>
          </div>
        </div>
      )}

      {/* Step: List / Job History */}
      {step === "list" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setStep("upload")} className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-ingestion-btn">
              <Upload className="w-4 h-4 mr-2" /> New Log Ingestion
            </Button>
            {selectedJobs.size > 0 && (
              <Button onClick={() => setStep("batch-configure")}
                className="bg-green-600 hover:bg-green-700" data-testid="batch-ingest-btn">
                <Play className="w-4 h-4 mr-2" /> Batch Parse & Ingest ({selectedJobs.size} jobs)
              </Button>
            )}
          </div>

          {jobsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : jobs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No ingestion jobs yet</p>
                <p className="text-xs text-slate-400 mt-1">Upload production logs to get started</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {/* Select all uploaded */}
              {jobs.some(j => j.status === "uploaded" || j.status === "previewed") && (
                <div className="flex items-center gap-2 px-1">
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => {
                      const uploadedIds = jobs.filter(j => j.status === "uploaded" || j.status === "previewed").map(j => j.id);
                      setSelectedJobs(prev => {
                        const allSelected = uploadedIds.every(id => prev.has(id));
                        if (allSelected) return new Set();
                        return new Set(uploadedIds);
                      });
                    }}>
                    {jobs.filter(j => j.status === "uploaded" || j.status === "previewed").every(j => selectedJobs.has(j.id))
                      ? "Deselect All" : "Select All Pending"}
                  </button>
                </div>
              )}
              {jobs.map(job => {
                const st = STATUS_STYLES[job.status] || STATUS_STYLES.uploaded;
                const canSelect = job.status === "uploaded" || job.status === "previewed";
                const isSelected = selectedJobs.has(job.id);
                return (
                  <Card key={job.id} className={`hover:shadow-sm transition-shadow ${isSelected ? "ring-2 ring-blue-300" : ""}`}>
                    <CardContent className="p-4 flex items-center gap-3">
                      {/* Checkbox */}
                      {canSelect ? (
                        <button className="flex-shrink-0" onClick={() => {
                          setSelectedJobs(prev => {
                            const next = new Set(prev);
                            if (next.has(job.id)) next.delete(job.id); else next.add(job.id);
                            return next;
                          });
                        }} data-testid={`select-job-${job.id}`}>
                          {isSelected
                            ? <CheckSquare className="w-5 h-5 text-blue-600" />
                            : <Square className="w-5 h-5 text-slate-300" />}
                        </button>
                      ) : <div className="w-5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-700 truncate">
                            {job.files?.map(f => f.filename).join(", ") || "Unknown files"}
                          </span>
                          <Badge className={`${st.bg} ${st.text} text-[10px]`}>{st.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span><Clock className="w-3 h-3 inline mr-0.5" />{new Date(job.created_at).toLocaleDateString()}</span>
                          <span>{job.total_files} file(s)</span>
                          {job.records_ingested > 0 && <span className="text-green-600">{job.records_ingested} ingested</span>}
                          {job.records_failed > 0 && <span className="text-red-500">{job.records_failed} failed</span>}
                          <span className="text-slate-400">by {job.created_by_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {job.status === "uploaded" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Configure & Parse"
                            onClick={() => { setActiveJobId(job.id); setStep("configure"); }}>
                            <Settings className="w-4 h-4 text-blue-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600"
                          onClick={() => deleteJob(job.id)} title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <UploadStep onUploaded={(jobId) => { setActiveJobId(jobId); setStep("configure"); }} />
      )}

      {/* Step: Configure */}
      {step === "configure" && activeJobId && (
        <ConfigureStep
          jobId={activeJobId}
          onPreview={(data) => { setPreviewData(data); setStep("preview"); }}
          onBack={() => setStep("list")}
        />
      )}

      {/* Step: Preview & Ingest */}
      {step === "preview" && activeJobId && previewData && (
        <PreviewStep
          jobId={activeJobId}
          previewData={previewData}
          onIngest={() => { setStep("list"); setActiveJobId(null); setPreviewData(null); fetchJobs(); fetchStats(); }}
          onBack={() => setStep("configure")}
        />
      )}

      {/* Step: Batch Configure */}
      {step === "batch-configure" && selectedJobs.size > 0 && (
        <BatchConfigureStep
          jobIds={[...selectedJobs]}
          jobs={jobs.filter(j => selectedJobs.has(j.id))}
          onDone={() => { setStep("list"); setSelectedJobs(new Set()); fetchJobs(); fetchStats(); }}
          onBack={() => setStep("list")}
        />
      )}
        </TabsContent>

        <TabsContent value="templates">
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Parse Templates
              </h3>
              <p className="text-xs text-green-600 mt-1">
                Save column mappings from a training file to reuse for bulk uploads. Templates support fuzzy column matching for files with slightly different column names.
              </p>
            </div>
            <TemplatesPanel />
          </div>
        </TabsContent>

        <TabsContent value="dashboard">
          <LogDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
