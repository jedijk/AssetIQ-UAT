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

export default function PreviewStep({ jobId, previewData, onIngest, onBack }) {
  const [ingesting, setIngesting] = useState(false);
  const d = previewData;

  const handleIngest = async () => {
    setIngesting(true);
    try {
      await productionLogsAPI.ingest({ job_id: jobId });
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
