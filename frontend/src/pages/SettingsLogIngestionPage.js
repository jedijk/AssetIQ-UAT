import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Upload, FileText, Loader2, CheckCircle2, XCircle, AlertCircle,
  Trash2, ChevronRight, Database, Settings, RefreshCw, Play, Eye, X,
  FileSpreadsheet, Clock, Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
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
  const inputRef = useRef(null);

  const handleFiles = async (fileList) => {
    if (!fileList?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of fileList) fd.append("files", f);
      const res = await fetch(`${API}/api/production-logs/upload`, {
        method: "POST", headers: getHeaders(), body: fd,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Upload failed"); }
      const data = await res.json();
      toast.success(`${data.files_uploaded} file(s) uploaded`);
      onUploaded(data.job_id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); };
  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  return (
    <div
      onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors cursor-pointer ${
        dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
      }`}
      onClick={() => inputRef.current?.click()}
      data-testid="log-upload-dropzone"
    >
      <input ref={inputRef} type="file" multiple accept=".csv,.txt,.log,.zip" className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-600">Uploading files...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Upload className="w-10 h-10 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-700">Drag & drop log files here</p>
            <p className="text-xs text-slate-400 mt-1">CSV, TXT, LOG, ZIP — up to 100MB</p>
          </div>
          <Button variant="outline" size="sm" className="mt-2">Browse Files</Button>
        </div>
      )}
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
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={detectColumns} className="w-full h-9 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Re-detect
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
              <Select value={mapping.timestamp} onValueChange={v => setMapping(p => ({ ...p, timestamp: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Asset/Equipment ID *</Label>
              <Select value={mapping.asset_id} onValueChange={v => setMapping(p => ({ ...p, asset_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Status Column</Label>
              <Select value={mapping.status || "__none__"} onValueChange={v => setMapping(p => ({ ...p, status: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
        <Button size="sm" onClick={handlePreview} disabled={!mapping.timestamp || !mapping.asset_id || previewing}
          className="bg-blue-600 hover:bg-blue-700" data-testid="parse-preview-btn">
          {previewing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
          Parse & Preview
        </Button>
      </div>
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

// ======================== Main Page ========================

export default function SettingsLogIngestionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // Wizard state
  const [step, setStep] = useState("list"); // list, upload, configure, preview
  const [activeJobId, setActiveJobId] = useState(null);
  const [previewData, setPreviewData] = useState(null);

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            Production Log Ingestion
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Upload and parse historical production logs</p>
        </div>
        {step !== "list" && (
          <Button variant="outline" size="sm" onClick={() => { setStep("list"); setActiveJobId(null); setPreviewData(null); fetchJobs(); fetchStats(); }}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
        )}
      </div>

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
          <Button onClick={() => setStep("upload")} className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-ingestion-btn">
            <Upload className="w-4 h-4 mr-2" /> New Log Ingestion
          </Button>

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
              {jobs.map(job => {
                const st = STATUS_STYLES[job.status] || STATUS_STYLES.uploaded;
                return (
                  <Card key={job.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4 flex items-center gap-4">
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
    </div>
  );
}
