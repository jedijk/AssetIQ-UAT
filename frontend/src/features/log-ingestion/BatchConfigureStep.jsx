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

export default function BatchConfigureStep({ jobIds, jobs, onDone, onBack }) {
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
        const data = await productionLogsAPI.listTemplates();
          setTemplates(data.templates || []);
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
        const data = await productionLogsAPI.detectColumns(fd);
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
      const data = await productionLogsAPI.batchIngest({ job_ids: jobIds, template });
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
      const data = await productionLogsAPI.batchIngestWithTemplate({ job_ids: jobIds, template_id: selectedTemplateId });
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
      setMatchPreview(await productionLogsAPI.previewTemplateMatch(fd));
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
