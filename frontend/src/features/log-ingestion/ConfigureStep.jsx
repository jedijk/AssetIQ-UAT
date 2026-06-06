import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Upload, FileText, Loader2, CheckCircle2, XCircle, AlertCircle,
  Trash2, ChevronLeft, ChevronRight, Database, Settings, RefreshCw, Play, Eye, X,
  FileSpreadsheet, Clock, Activity, FolderOpen, BarChart3, Sparkles, TrendingUp,
  CheckSquare, Square, Save, BookOpen, Copy, Check, AlertTriangle, FlaskConical, Package, Sigma
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { toast } from "sonner";
import { productionLogsAPI } from "../../lib/apis/productionLogsAPI";
import { STATUS_STYLES, EVENT_COLORS } from "./constants";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Line, ComposedChart, ReferenceLine, ReferenceArea,
} from "recharts";
import SaveTemplateModal from "./SaveTemplateModal";

export default function ConfigureStep({ jobId, onPreview, onBack, onIngestDone }) {
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

  // Template selection
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [ingestingWithTemplate, setIngestingWithTemplate] = useState(false);
  const [matchPreview, setMatchPreview] = useState(null);
  const [previewingMatch, setPreviewingMatch] = useState(false);

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const data = await productionLogsAPI.listTemplates();
          setTemplates(data.templates || []);
      } catch {}
    };
    fetchTemplates();
  }, []);

  const detectColumns = useCallback(async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("job_id", jobId);
      fd.append("delimiter", delimiter);
      fd.append("has_header", hasHeader);
      fd.append("skip_rows", skipRows);
      const data = await productionLogsAPI.detectColumns(fd);
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
      const data = await productionLogsAPI.parsePreview(fd);
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
      const data = await productionLogsAPI.aiParse(fd);
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

  const handleIngestWithTemplate = async () => {
    if (!selectedTemplateId) { toast.error("Select a template"); return; }
    setIngestingWithTemplate(true);
    try {
      const data = await productionLogsAPI.batchIngestWithTemplate({ job_ids: [jobId], template_id: selectedTemplateId });
      toast.success(`Ingestion started with template "${data.template_name}"`);
      onIngestDone?.();
    } catch (err) { toast.error(err.message); }
    finally { setIngestingWithTemplate(false); }
  };

  const handlePreviewMatch = async () => {
    if (!selectedTemplateId) return;
    setPreviewingMatch(true);
    try {
      const fd = new FormData();
      fd.append("job_id", jobId);
      fd.append("template_id", selectedTemplateId);
      setMatchPreview(await productionLogsAPI.previewTemplateMatch(fd));
    } catch (err) { toast.error(err.message); }
    finally { setPreviewingMatch(false); }
  };

  return (
    <div className="space-y-6">
      {/* Template Quick Ingest */}
      {templates.length > 0 && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-green-600" />
              Quick Ingest with Template
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs text-slate-500">Select Template</Label>
                <Select value={selectedTemplateId || undefined} onValueChange={(v) => { setSelectedTemplateId(v); setMatchPreview(null); }}>
                  <SelectTrigger className="h-9 text-sm" data-testid="template-select">
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
                <Button variant="outline" size="sm" onClick={handlePreviewMatch} disabled={previewingMatch} className="h-9 text-xs">
                  {previewingMatch ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
                  Preview
                </Button>
              )}
              <Button size="sm" onClick={handleIngestWithTemplate} disabled={!selectedTemplateId || ingestingWithTemplate}
                className="h-9 bg-green-600 hover:bg-green-700" data-testid="template-ingest-btn">
                {ingestingWithTemplate ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                Ingest with Template
              </Button>
            </div>
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
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-slate-400">Or configure manually below</p>
          </CardContent>
        </Card>
      )}

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
