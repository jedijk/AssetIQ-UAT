import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productionAPI } from "../lib/api";
import api from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { formatDateTime } from "../lib/dateUtils";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  Package,
  Trash2,
  TrendingUp,
  FlaskConical,
  Sigma,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Search,
  X,
  Pencil,
  Settings,
  Sparkles,
  Download,
  Brain,
  Target,
  Gauge,
  Zap,
  MessageCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Tooltip as RadixTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  Line,
  ComposedChart,
  ReferenceArea,
} from "recharts";
import { toast } from "sonner";

// ──────────────────────────────────────────
// Date helpers (timezone-safe: use local date strings, not UTC)
// ──────────────────────────────────────────
const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const displayDate = (d) => {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};
const today = () => { const d = new Date(); d.setHours(12,0,0,0); return d; };
const daysAgo = (n) => { const d = today(); d.setDate(d.getDate() - n); return d; };
const monthsAgo = (n) => { const d = today(); d.setMonth(d.getMonth() - n); return d; };
const startOfYear = () => { const d = today(); d.setMonth(0, 1); return d; };

const PERIOD_OPTIONS = [
  { key: "1d", label: "1D" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "ytd", label: "YTD" },
];

// ──────────────────────────────────────────
// Machine Analysis Panel
// ──────────────────────────────────────────
function MachineAnalysisPanel({ fromDate, toDate, period }) {
  const [analysis, setAnalysis] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [createdAt, setCreatedAt] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [analysisRange, setAnalysisRange] = useState(null);
  const [error, setError] = useState(null);

  const periodLabel = { "1d": "day", "1w": "week", "1m": "month", "3m": "3 months", "6m": "6 months", "1y": "year", "ytd": "YTD" }[period] || period;

  const fetchAnalysis = async () => {
    try {
      setError(null);
      const res = await api.get(`/production/machine-analysis?start=${fromDate}&end=${toDate}`);
      if (res.data?.status === "ok") {
        setAnalysis(res.data.analysis);
        setStats(res.data.stats);
        setCreatedAt(res.data.created_at);
        setAnalysisRange(res.data.date_range);
      } else if (res.data?.status === "error") {
        setError(res.data.error);
        setAnalysis(null);
      }
    } catch {}
  };

  useEffect(() => { fetchAnalysis(); }, [fromDate, toDate]);

  const runAnalysis = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.post("/production/machine-analysis", { start: fromDate, end: toDate });
      if (res.data?.status === "ok") {
        setAnalysis(res.data.analysis);
        setStats(res.data.stats);
        setCreatedAt(new Date().toISOString());
        setAnalysisRange({ start: fromDate, end: toDate });
        setError(null);
      } else if (res.data?.status === "error") {
        setError(res.data.error);
        setAnalysis(null);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to run analysis. Please try again.");
    } finally { setGenerating(false); }
  };

  const opt = analysis?.optimal_settings || {};

  const fmtDate = (d) => {
    if (!d || d === 'all') return '';
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };
  const rangeBadge = (() => {
    const r = analysisRange || (fromDate && toDate ? { start: fromDate, end: toDate } : null);
    if (!r) return null;
    const s = fmtDate(r.start);
    const e = fmtDate(r.end);
    if (s && e && s !== e) return `${s} — ${e}`;
    if (s) return s;
    return null;
  })();

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5" data-testid="machine-analysis">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-600" />
            AI Machine Settings Analysis
          </h3>
          {analysis && rangeBadge && (
            <Badge className="bg-indigo-100 text-indigo-700 text-[10px] font-medium border-0" data-testid="analysis-date-range">
              {rangeBadge}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {createdAt && (
            <span className="text-[10px] text-slate-400">
              {new Date(createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={runAnalysis} disabled={generating} data-testid="run-analysis-btn">
            {generating ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
            {generating ? "Analyzing..." : analysis ? "Re-analyze" : `Analyze ${periodLabel}`}
          </Button>
        </div>
      </div>

      {generating && (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
          Analyzing {stats?.total_samples || "all"} samples across {stats?.total_days || "all"} production days...
        </div>
      )}

      {!generating && !analysis && !error && (
        <div className="text-center py-8">
          <Brain className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Run analysis to get AI-powered recommendations</p>
          <p className="text-xs text-slate-400 mt-1">Based on all historical production data</p>
        </div>
      )}

      {!generating && error && (
        <div className="text-center py-8" data-testid="analysis-error">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">Not enough data for analysis</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
          <p className="text-xs text-slate-400 mt-2">Try selecting a longer time period or ensure production data has been uploaded.</p>
        </div>
      )}

      {!generating && analysis && (
        <div className="space-y-4">
          {/* Summary */}
          <p className="text-sm text-slate-600 bg-indigo-50 rounded-lg p-3 leading-relaxed" data-testid="analysis-summary">
            {analysis.summary}
          </p>

          {/* Stats bar */}
          {stats && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="bg-slate-50 px-2 py-1 rounded">{stats.total_samples} samples</span>
              <span className="bg-slate-50 px-2 py-1 rounded">{stats.total_days} days</span>
              <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded">{stats.in_target_pct}% in target</span>
              <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded">{stats.good_days} good days</span>
              <span className="bg-red-50 text-red-600 px-2 py-1 rounded">{stats.bad_days} problem days</span>
            </div>
          )}

          {/* Optimal Settings Grid */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-600" /> Optimal Settings
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {Object.entries(opt).map(([key, val]) => (
                <div key={key} className="bg-gradient-to-b from-slate-50 to-white border border-slate-200 rounded-lg p-3 text-center" data-testid={`setting-${key.toLowerCase()}`}>
                  <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">{key}</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums">{val.recommended}</div>
                  <div className="text-[10px] text-slate-400">{val.unit}</div>
                  {val.range && (
                    <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{val.range[0]}–{val.range[1]}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Expandable details */}
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
            {expanded ? "Hide details" : "Show detailed findings"}
            <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>

          {expanded && (
            <div className="space-y-4 animate-in fade-in">
              {/* Key Findings */}
              {analysis.key_findings?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" /> Key Findings
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.key_findings.map((f, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Correlations */}
              {analysis.correlations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-500" /> Correlations
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.correlations.map((c, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risk Factors */}
              {analysis.risk_factors?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Risk Factors
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.risk_factors.map((r, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {analysis.improvement_recommendations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Recommendations
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.improvement_recommendations.map((r, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ──────────────────────────────────────────
// KPI Card
// ──────────────────────────────────────────
const KPICard = ({ icon: Icon, iconColor, label, value, unit, detail, detail2, trend, trendDirection }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 min-w-0" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
    <div className="flex items-center gap-2 mb-1">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor || 'bg-slate-100'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
    <div className="flex items-baseline gap-1.5">
      <span className="text-2xl font-bold text-slate-900 tabular-nums">{value}</span>
      {unit && <span className="text-sm text-slate-500">{unit}</span>}
    </div>
    {detail && <p className="text-xs text-slate-500 truncate">{detail}</p>}
    {detail2 && <p className="text-xs text-slate-400 truncate">{detail2}</p>}
    {trend !== undefined && (
      <span className={`text-xs font-medium ${trendDirection === 'up' ? 'text-emerald-600' : trendDirection === 'down' ? 'text-red-500' : 'text-slate-500'}`}>
        {trendDirection === 'up' ? '+' : ''}{trend}
      </span>
    )}
  </div>
);

// ──────────────────────────────────────────
// Severity icon helper
// ──────────────────────────────────────────
const SeverityIcon = ({ severity }) => {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    default:
      return <Clock className="w-4 h-4 text-slate-400" />;
  }
};

// ──────────────────────────────────────────
// Event Card (Actions / Insights)
// ──────────────────────────────────────────
const EventCard = ({ event }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0" data-testid={`event-${event.id}`}>
    <div className="mt-0.5">
      <SeverityIcon severity={event.severity} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-slate-800 leading-tight">{event.title}</p>
      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{event.description}</p>
    </div>
    <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">{event.time}</span>
  </div>
);

// ──────────────────────────────────────────
// Custom chart tooltip
// ──────────────────────────────────────────
const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : v);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-medium text-slate-800">{fmt1(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

// Viscosity chart tooltip — always shows RPM, Feed, MP4, T Product IR
const ViscosityTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[150px]">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {d.viscosity != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#8b5cf6]" /><span className="text-slate-600">Viscosity:</span><span className="font-medium text-slate-800">{fmt1(d.viscosity)} MU</span></div>
      )}
      {d.rpm != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#3b82f6]" /><span className="text-slate-600">RPM:</span><span className="font-medium text-slate-800">{fmt1(d.rpm)}</span></div>
      )}
      {d.feed != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#f97316]" /><span className="text-slate-600">Feed:</span><span className="font-medium text-slate-800">{fmt1(d.feed)} kg</span></div>
      )}
      {d.mp4 != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#14b8a6]" /><span className="text-slate-600">MP4:</span><span className="font-medium text-slate-800">{fmt1(d.mp4)}</span></div>
      )}
      {d.t_product_ir != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ef4444]" /><span className="text-slate-600">T Product IR:</span><span className="font-medium text-slate-800">{fmt1(d.t_product_ir)}</span></div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Chart series toggle buttons
// ──────────────────────────────────────────
const OPTIONAL_SERIES = [
  { key: "rpm", label: "RPM", color: "#3b82f6" },
  { key: "feed", label: "Feed", color: "#f97316" },
  { key: "mp4", label: "MP4", color: "#14b8a6" },
  { key: "t_product_ir", label: "T Product IR", color: "#ef4444" },
  { key: "screenChange", label: "Screen Change", color: "#a855f7" },
  { key: "magnetCleaning", label: "Magnet Cleaning", color: "#ec4899" },
];

const ChartSeriesToggles = ({ active, onToggle }) => (
  <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap" data-testid="chart-toggles">
    {OPTIONAL_SERIES.map((s) => (
      <button
        key={s.key}
        onClick={() => onToggle(s.key)}
        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border transition-colors ${
          active[s.key]
            ? "border-transparent text-white"
            : "border-slate-200 text-slate-500 bg-white hover:bg-slate-50"
        }`}
        style={active[s.key] ? { backgroundColor: s.color } : undefined}
        data-testid={`toggle-${s.key}`}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active[s.key] ? "#fff" : s.color }} />
        <span className="hidden sm:inline">{s.label}</span>
        <span className="sm:hidden">{s.label.length > 4 ? s.label.substring(0, 4) : s.label}</span>
      </button>
    ))}
  </div>
);

// ──────────────────────────────────────────
// Form Execution Dialog
// ──────────────────────────────────────────
const FIELD_TYPE_MAP = {
  text: "text", numeric: "number", number: "number",
  date: "date", datetime: "datetime-local", dropdown: "text",
};

const FormExecutionDialog = ({ open, onClose, templateId, templateName, equipmentId, equipmentName, equipmentTag, onSuccess, submissionId, initialValues }) => {
  const [fields, setFields] = useState([]);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dropdownOptions, setDropdownOptions] = useState({});

  // Fetch template fields when dialog opens
  useEffect(() => {
    if (!open || !templateId) return;
    setLoading(true);
    api.get(`/form-templates/${templateId}`).then((res) => {
      const t = res.data;
      const f = t.fields || [];
      setFields(f);
      // Set defaults (or prefill from initialValues in edit mode)
      const defaults = {};
      const now = new Date();
      const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
      f.forEach((field) => {
        const ft = field.type || field.field_type || "text";
        const prefill = initialValues?.[field.id];
        if (prefill !== undefined && prefill !== null && prefill !== "") {
          defaults[field.id] = String(prefill);
        } else if (ft === "datetime") defaults[field.id] = localISO.slice(0, 16);
        else if (ft === "date") defaults[field.id] = localISO.slice(0, 10);
        else defaults[field.id] = "";
        // Collect dropdown options
        if (ft === "dropdown" && field.options) {
          setDropdownOptions((prev) => ({ ...prev, [field.id]: field.options }));
        }
      });
      setFormData(defaults);
    }).catch(() => toast.error("Failed to load form")).finally(() => setLoading(false));
  }, [open, templateId, submissionId]);

  const handleSubmit = async () => {
    // Validate required
    for (const field of fields) {
      if (field.required && !formData[field.id] && formData[field.id] !== 0) {
        toast.error(`${field.label} is required`);
        return;
      }
    }
    setSubmitting(true);
    try {
      if (submissionId) {
        // Edit mode: send values keyed by field_label (matches productionAPI.updateSubmission)
        const valuesByLabel = {};
        fields.forEach((f) => {
          valuesByLabel[f.label] = String(formData[f.id] ?? "");
        });
        await api.patch(`/production/submission/${submissionId}`, { values: valuesByLabel });
        toast.success(`${templateName} updated`);
      } else {
        const values = fields.map((f) => ({
          field_id: f.id,
          field_label: f.label,
          value: String(formData[f.id] ?? ""),
        }));
        await api.post("/form-submissions", {
          form_template_id: templateId,
          equipment_id: equipmentId || "",
          values,
          notes: "",
        });
        toast.success(`${templateName} submitted`);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(submissionId ? "Update failed" : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="form-execution-dialog">
        <DialogHeader>
          <DialogTitle>{submissionId ? `Edit ${templateName}` : templateName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-blue-500" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pt-2">
            {fields.map((field) => {
              const ft = field.type || field.field_type || "text";
              const inputType = FIELD_TYPE_MAP[ft] || "text";
              const opts = dropdownOptions[field.id];
              return (
                <div key={field.id} className={ft === "datetime" ? "col-span-2" : ""}>
                  <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  {opts ? (
                    <Select value={formData[field.id] || ""} onValueChange={(v) => setFormData((p) => ({ ...p, [field.id]: v }))}>
                      <SelectTrigger className="h-9 mt-1" data-testid={`form-field-${field.id}`}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {opts.map((o) => (
                          <SelectItem key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>
                            {typeof o === "string" ? o : o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={inputType}
                      step={inputType === "number" ? "any" : undefined}
                      max={(() => {
                        if (inputType === "date") {
                          const now = new Date();
                          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        }
                        if (inputType === "datetime-local") {
                          const now = new Date();
                          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                        }
                        return undefined;
                      })()}
                      className="h-9 mt-1"
                      value={formData[field.id] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Prevent future dates (using local timezone)
                        const now = new Date();
                        const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        const nowLocal = `${todayLocal}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                        
                        if (inputType === "date" && val > todayLocal) {
                          toast.error("Future dates are not allowed");
                          return;
                        }
                        if (inputType === "datetime-local" && val > nowLocal) {
                          toast.error("Future dates are not allowed");
                          return;
                        }
                        setFormData((p) => ({ ...p, [field.id]: val }));
                      }}
                      onMouseDown={(e) => {
                        // Prevent dialog from capturing date picker clicks
                        if (inputType === "date" || inputType === "datetime-local") {
                          e.stopPropagation();
                        }
                      }}
                      data-testid={`form-field-${field.id}`}
                    />
                  )}
                </div>
              );
            })}
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={submitting} onClick={handleSubmit} data-testid="form-submit-btn">
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ──────────────────────────────────────────
// Main component
// ──────────────────────────────────────────
export default function ProductionDashboardPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // State
  const [period, setPeriod] = useState("1d");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [shift, setShift] = useState("day");
  const [logSearch, setLogSearch] = useState("");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", type: "action", severity: "info" });
  const [chartSeries, setChartSeries] = useState({ rpm: false, feed: false, mp4: false, t_product_ir: false, screenChange: false, magnetCleaning: false });
  const [expandedEosNotes, setExpandedEosNotes] = useState(null); // Track which EOS row has notes expanded (for mobile)
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [formExec, setFormExec] = useState(null); // { templateId, templateName }
  const [selectedTime, setSelectedTime] = useState(null); // highlighted time from chart click

  // Force period to "1d" on mobile
  useEffect(() => {
    if (isMobile && period !== "1d") {
      setPeriod("1d");
      setShowCustomDate(false);
    }
  }, [isMobile, period]);

  // Template IDs (fetched once)
  const { data: formTemplates } = useQuery({
    queryKey: ["production-form-templates"],
    queryFn: async () => {
      const res = await api.get("/form-templates");
      const list = Array.isArray(res.data) ? res.data : res.data.templates || [];
      const bigBag = list.find((t) => t.name === "Big Bag Loading");
      const extruder = list.find((t) => t.name === "Extruder settings sample");
      const viscosity = list.find((t) => /mooney viscosity/i.test(t.name));
      const endOfShift = list.find((t) => /end of shift/i.test(t.name));
      return { bigBag, extruder, viscosity, endOfShift };
    },
    staleTime: 600000,
  });

  // Fetch Line-90 equipment ID for form submissions
  const { data: line90Equipment } = useQuery({
    queryKey: ["line90-equipment"],
    queryFn: async () => {
      const res = await api.get("/equipment-hierarchy/search?q=Line-90&limit=1");
      const results = res.data?.results || res.data?.nodes || [];
      return results[0] || null;
    },
    staleTime: 600000,
  });

  // Period change handler
  const handlePeriod = (p) => {
    setPeriod(p);
    setShowCustomDate(false);
    const t = today();
    setToDate(t);
    switch (p) {
      case "1d": setFromDate(t); break;
      case "1w": setFromDate(daysAgo(7)); break;
      case "1m": setFromDate(monthsAgo(1)); break;
      case "3m": setFromDate(monthsAgo(3)); break;
      case "6m": setFromDate(monthsAgo(6)); break;
      case "1y": setFromDate(monthsAgo(12)); break;
      case "ytd": setFromDate(startOfYear()); break;
      default: setFromDate(t);
    }
  };

  const fromStr = fmtDate(fromDate);
  const toStr = fmtDate(toDate);

  // Build query params
  const queryParams = period === "1d"
    ? { date: fromStr, shift }
    : { from_date: fromStr, to_date: toStr, shift };

  // Fetch dashboard data
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["production-dashboard", fromStr, toStr, shift],
    queryFn: () => productionAPI.getDashboard(queryParams),
    refetchInterval: 60000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  // Mutation for creating events
  const createEventMutation = useMutation({
    mutationFn: (eventData) => productionAPI.createEvent(eventData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-dashboard"] });
      setShowAddEvent(false);
      setNewEvent({ title: "", description: "", type: "action", severity: "info" });
      toast.success("Event created");
    },
    onError: () => toast.error("Failed to create event"),
  });

  // Edit log entry state
  const [editEntry, setEditEntry] = useState(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type, ids[], label }

  // Mutation for updating a submission
  const updateSubmissionMutation = useMutation({
    mutationFn: ({ id, values }) => productionAPI.updateSubmission(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-dashboard"] });
      setEditEntry(null);
      toast.success("Entry updated");
    },
    onError: () => toast.error("Failed to update entry"),
  });

  // Mutation for deleting a submission
  const deleteSubmissionMutation = useMutation({
    mutationFn: (id) => productionAPI.deleteSubmission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-dashboard"] });
      toast.success("Entry deleted");
    },
    onError: (error) => {
      // 404 means already deleted - treat as success
      if (error?.response?.status === 404) {
        queryClient.invalidateQueries({ queryKey: ["production-dashboard"] });
        toast.success("Entry already deleted");
      } else {
        toast.error("Failed to delete entry");
      }
    },
  });

  // Edit state for big bag entries
  const [editBigBag, setEditBigBag] = useState(null);

  // Mutation for AI insights generation
  const aiInsightsMutation = useMutation({
    mutationFn: () => productionAPI.generateAiInsights({
      date: fromStr,
      production_log: data?.production_log || [],
      viscosity_values: data?.viscosity_values || [],
      kpis: data?.kpis || {},
      actions: data?.actions || [],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-dashboard"] });
      toast.success("AI insights generated");
    },
    onError: () => toast.error("Failed to generate insights"),
  });

  // Export to Excel
  const exportToExcel = () => {
    if (!data) return;
    import("xlsx").then((XLSX) => {
      import("file-saver").then(({ saveAs }) => {
        const wb = XLSX.utils.book_new();

        // Sheet 1: KPIs
        const kpiRows = [
          ["KPI", "Value", "Unit", "Detail"],
          ["Total Input", kpis.total_input, "kg", kpis.lot_info || ""],
          ["Waste", kpis.waste, "kg", `${kpis.waste_pct}% of input`],
          ["Yield", kpis.yield_pct, "%", `Target: ${kpis.yield_target}%`],
          ["Avg Mooney Viscosity", kpis.avg_viscosity, "MU", `Range: ${kpis.viscosity_range}`],
          ["RSD", kpis.rsd, "%", `Target: < ${kpis.rsd_target}`],
          ["Runtime", kpis.runtime_hours, "hours", ""],
        ];
        const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
        wsKpi["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(wb, wsKpi, "KPIs");

        // Sheet 2: Production Log
        const logHeader = ["#", "Date", "Time", "RPM", "Feed", "M%", "Energy", "MT1", "MT2", "MT3", "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR", "Viscosity", "Remarks", "By"];
        const logRows = [logHeader];
        const viscMap = {};
        (data.viscosity_series || []).forEach((v) => { if (v.time) viscMap[v.time] = v.viscosity; });
        (data.production_log || []).forEach((e, i) => {
          const dateStr = e.datetime ? new Date(e.datetime).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}) : '';
          logRows.push([
            i + 1, dateStr, e.time, e.rpm, e.feed, e.moisture, e.energy,
            e.mt1, e.mt2, e.mt3, e.mp1, e.mp2, e.mp3, e.mp4,
            e.co2_feed_p, e.t_product_ir,
            viscMap[e.time] !== undefined ? viscMap[e.time] : "TBD",
            e.remarks || "", e.submitted_by || "",
          ]);
        });
        const wsLog = XLSX.utils.aoa_to_sheet(logRows);
        wsLog["!cols"] = logHeader.map(() => ({ wch: 12 }));
        XLSX.utils.book_append_sheet(wb, wsLog, "Production Log");

        // Sheet 3: Viscosity Samples
        const viscHeader = ["Time", "Sample No.", "Viscosity (MU)"];
        const viscRows = [viscHeader];
        (data.viscosity_series || []).forEach((v) => {
          viscRows.push([v.time, v.sample || "", v.viscosity]);
        });
        const wsVisc = XLSX.utils.aoa_to_sheet(viscRows);
        wsVisc["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, wsVisc, "Viscosity Samples");

        // Sheet 4: Input Material
        const bagHeader = ["Material", "Supplier", "Bag No.", "Lot No.", "Production Date"];
        const bagRows = [bagHeader];
        (data.big_bag_entries || []).forEach((b) => {
          bagRows.push([b.material, b.supplier, b.bag_no, b.lot_no, b.production_date || ""]);
        });
        const wsBag = XLSX.utils.aoa_to_sheet(bagRows);
        wsBag["!cols"] = bagHeader.map(() => ({ wch: 16 }));
        XLSX.utils.book_append_sheet(wb, wsBag, "Input Material");

        // Sheet 5: Waste & Downtime
        const wasteHeader = ["Time", "Waste (kg)", "Downtime", "Feed (kg)", "RPM"];
        const wasteRows = [wasteHeader];
        (data.waste_downtime_series || []).forEach((w) => {
          wasteRows.push([w.time, w.waste, w.downtime, w.feed, w.rpm]);
        });
        const wsWaste = XLSX.utils.aoa_to_sheet(wasteRows);
        wsWaste["!cols"] = wasteHeader.map(() => ({ wch: 14 }));
        XLSX.utils.book_append_sheet(wb, wsWaste, "Waste & Downtime");

        // Sheet 6: Actions
        const actHeader = ["Time", "Severity", "Title", "Description"];
        const actRows = [actHeader];
        (data.actions || []).forEach((ev) => {
          actRows.push([ev.time, ev.severity, ev.title, ev.description]);
        });
        const wsAct = XLSX.utils.aoa_to_sheet(actRows);
        wsAct["!cols"] = [{ wch: 8 }, { wch: 10 }, { wch: 30 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, wsAct, "Actions");

        // Sheet 7: Insights
        const insHeader = ["Time", "Severity", "Title", "Description"];
        const insRows = [insHeader];
        (data.insights || []).forEach((ev) => {
          insRows.push([ev.time, ev.severity, ev.title, ev.description]);
        });
        const wsIns = XLSX.utils.aoa_to_sheet(insRows);
        wsIns["!cols"] = [{ wch: 8 }, { wch: 10 }, { wch: 30 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, wsIns, "Insights");

        // Save
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        saveAs(blob, `Production_Log_${fromStr}.xlsx`);
        toast.success("Excel exported");
      });
    });
  };

  // Date navigation (day mode only)
  const prevDay = () => { const d = new Date(fromDate.getTime() - 86400000); setFromDate(d); setToDate(d); };
  const nextDay = () => { const d = new Date(fromDate.getTime() + 86400000); setFromDate(d); setToDate(d); };

  // Period-aware navigation (month/year stepping)
  const stepPeriod = (direction) => {
    const dir = direction; // -1 or +1
    const from = new Date(fromDate);
    const to = new Date(toDate);

    switch (period) {
      case "1w": {
        from.setDate(from.getDate() + dir * 7);
        to.setDate(to.getDate() + dir * 7);
        break;
      }
      case "1m": {
        from.setMonth(from.getMonth() + dir);
        to.setMonth(to.getMonth() + dir);
        break;
      }
      case "3m": {
        from.setMonth(from.getMonth() + dir * 3);
        to.setMonth(to.getMonth() + dir * 3);
        break;
      }
      case "6m": {
        from.setMonth(from.getMonth() + dir * 6);
        to.setMonth(to.getMonth() + dir * 6);
        break;
      }
      case "1y": {
        from.setFullYear(from.getFullYear() + dir);
        to.setFullYear(to.getFullYear() + dir);
        break;
      }
      case "ytd": {
        // Step by year
        from.setFullYear(from.getFullYear() + dir);
        to.setFullYear(to.getFullYear() + dir);
        from.setMonth(0, 1); // Jan 1
        break;
      }
      default:
        // custom or unknown — step by the current range size
        const rangeMs = to.getTime() - from.getTime();
        from.setTime(from.getTime() + dir * rangeMs);
        to.setTime(to.getTime() + dir * rangeMs);
    }
    setFromDate(from);
    setToDate(to);
  };

  // Filtered production log
  const filteredLog = useMemo(() => {
    if (!data?.production_log) return [];

    // Merge standalone viscosity entries (no matching extruder time) as separate rows
    const logTimes = new Set((data.production_log || []).map((e) => e.time));
    const standaloneVisc = (data?.viscosity_series || [])
      .filter((v) => v.time && !logTimes.has(v.time))
      .map((v) => ({
        time: v.time,
        datetime: "",
        submitted_by: "",
        rpm: null, feed: null, moisture: null, energy: null,
        mt1: null, mt2: null, mt3: null,
        mp1: null, mp2: null, mp3: null, mp4: null,
        co2_feed_p: null, t_product_ir: null,
        remarks: "", waste: null,
        submission_id: "",
        _viscosity_only: true,
        _viscosity_value: v.viscosity,
        _viscosity_submission_id: v.submission_id,
      }));

    const merged = [...data.production_log, ...standaloneVisc].sort((a, b) =>
      (a.datetime || a.time || "").localeCompare(b.datetime || b.time || "")
    );

    if (!logSearch) return merged;
    const s = logSearch.toLowerCase();
    return merged.filter(
      (e) =>
        e.time?.toLowerCase().includes(s) ||
        e.submitted_by?.toLowerCase().includes(s) ||
        String(e.rpm).includes(s) ||
        String(e.feed).includes(s)
    );
  }, [data?.production_log, data?.viscosity_series, logSearch]);

  // Combined time series for Mooney Viscosity chart (merges viscosity + production log data)
  const isMultiDay = period !== "1d";

  const combinedSeries = useMemo(() => {
    const log = data?.production_log || [];
    const viscSeries = data?.viscosity_series || [];
    const viscVals = data?.viscosity_values || [];
    const screenChanges = chartSeries.screenChange ? new Set((data?.screen_changes || []).map(s => s.time)) : new Set();
    const magnetCleanings = chartSeries.magnetCleaning ? new Set((data?.magnet_cleanings || []).map(s => s.time)) : new Set();

    if (!isMultiDay) {
      // Single day: use time (HH:MM) as key
      // Build viscosity lookup by time
      const viscByTime = {};
      viscSeries.forEach((v) => { if (v.time) viscByTime[v.time] = v.viscosity; });

      const timeMap = {};
      log.forEach((entry) => {
        timeMap[entry.time] = {
          time: entry.time,
          rpm: entry.rpm, feed: entry.feed, mp4: entry.mp4, t_product_ir: entry.t_product_ir,
          viscosity: viscByTime[entry.time] ?? null,
          screenChange: null, magnetCleaning: null,
        };
      });
      viscSeries.forEach((v) => {
        if (!timeMap[v.time]) {
          timeMap[v.time] = { time: v.time, viscosity: v.viscosity, rpm: null, feed: null, mp4: null, t_product_ir: null, screenChange: null, magnetCleaning: null };
        }
      });
      const addEvent = (timeSet, fieldName) => {
        timeSet.forEach((t) => {
          if (timeMap[t]) timeMap[t][fieldName] = timeMap[t].viscosity || 0;
          else timeMap[t] = { time: t, viscosity: null, rpm: null, feed: null, mp4: null, t_product_ir: null, screenChange: null, magnetCleaning: null, [fieldName]: 0 };
        });
      };
      addEvent(screenChanges, "screenChange");
      addEvent(magnetCleanings, "magnetCleaning");
      const sorted = Object.values(timeMap).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      sorted.forEach((p) => {
        if (p.screenChange !== null) p.screenChange = p.viscosity || p.screenChange;
        if (p.magnetCleaning !== null) p.magnetCleaning = p.viscosity || p.magnetCleaning;
      });
      return sorted;
    }

    // Multi-day: aggregate per day (1W, 1M, 3M) or per month (6M, 1Y, YTD)
    const useMonthBucket = false; // Always show per-day data points
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const getBucket = (dt) => {
      if (!dt) return null;
      const dateStr = dt.substring(0, 10); // YYYY-MM-DD
      if (useMonthBucket) return dateStr.substring(0, 7); // YYYY-MM
      return dateStr; // YYYY-MM-DD
    };

    const formatBucket = (bucket) => {
      // YYYY-MM-DD → compact label based on period
      try {
        const d = new Date(bucket + "T12:00:00");
        if (["6m", "1y", "ytd"].includes(period)) {
          return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        }
        return `${d.getDate()} ${months[d.getMonth()]}`;
      } catch { return bucket; }
    };

    // Build viscosity lookup by datetime for multi-day
    const viscByDatetime = {};
    viscSeries.forEach((v) => {
      if (v.datetime) viscByDatetime[v.datetime] = v.viscosity;
      else if (v.time) viscByDatetime[v.time] = v.viscosity;
    });

    // Aggregate into buckets
    const buckets = {};
    log.forEach((entry) => {
      const dt = entry.datetime || "";
      const bucket = getBucket(dt);
      if (!bucket) return;
      if (!buckets[bucket]) {
        buckets[bucket] = { rpms: [], feeds: [], mp4s: [], t_irs: [], viscosities: [], hasScreen: false, hasMagnet: false };
      }
      if (entry.rpm) buckets[bucket].rpms.push(entry.rpm);
      if (entry.feed) buckets[bucket].feeds.push(entry.feed);
      if (entry.mp4) buckets[bucket].mp4s.push(entry.mp4);
      if (entry.t_product_ir) buckets[bucket].t_irs.push(entry.t_product_ir);
      // Match viscosity by datetime
      const visc = viscByDatetime[dt] ?? null;
      if (visc != null) buckets[bucket].viscosities.push(visc);
    });
    // Add viscosity from series not in log
    viscSeries.forEach((v) => {
      const dt = v.datetime || "";
      const bucket = getBucket(dt) || getBucket(v.time);
      if (!bucket || !v.viscosity) return;
      if (!buckets[bucket]) {
        buckets[bucket] = { rpms: [], feeds: [], mp4s: [], t_irs: [], viscosities: [], hasScreen: false, hasMagnet: false };
      }
      buckets[bucket].viscosities.push(v.viscosity);
    });
    // Mark screen change and magnet events
    (data?.screen_changes || []).forEach((s) => {
      const dt = s.datetime || "";
      const bucket = getBucket(dt) || getBucket(s.time);
      if (bucket && buckets[bucket]) buckets[bucket].hasScreen = true;
    });
    (data?.magnet_cleanings || []).forEach((s) => {
      const dt = s.datetime || "";
      const bucket = getBucket(dt) || getBucket(s.time);
      if (bucket && buckets[bucket]) buckets[bucket].hasMagnet = true;
    });

    const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const sorted = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, b]) => {
        const avgVisc = avg(b.viscosities);
        return {
          time: formatBucket(bucket),
          rpm: avg(b.rpms),
          feed: avg(b.feeds),
          mp4: avg(b.mp4s),
          t_product_ir: avg(b.t_irs),
          viscosity: avgVisc != null ? Math.round(avgVisc * 100) / 100 : null,
          screenChange: (chartSeries.screenChange && b.hasScreen) ? avgVisc : null,
          magnetCleaning: (chartSeries.magnetCleaning && b.hasMagnet) ? avgVisc : null,
        };
      });
    return sorted;
  }, [data?.production_log, data?.viscosity_series, data?.viscosity_values, data?.screen_changes, data?.magnet_cleanings, chartSeries.screenChange, chartSeries.magnetCleaning, isMultiDay, period]);

  const kpis = data?.kpis || {};

  // Build time-to-viscosity map for accurate matching
  const viscosityByTime = useMemo(() => {
    const map = {};
    (data?.viscosity_series || []).forEach((v) => {
      if (v.time) map[v.time] = { value: v.viscosity, submission_id: v.submission_id };
    });
    return map;
  }, [data?.viscosity_series]);

  // Anomaly highlight row
  const isAnomalyRow = (entry) => {
    const avgVisc = kpis.avg_viscosity || 0;
    const visc = viscosityByTime[entry.time]?.value;
    if (visc !== undefined) {
      return Math.abs(visc - avgVisc) > 4;
    }
    return false;
  };

  // ──────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-48px)] bg-slate-50 p-4 md:p-6 space-y-5" data-testid="production-dashboard">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900" data-testid="production-title">
            Production Overview
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track performance, monitor trends, and take action
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period quick filters - hide entirely on mobile (forced to 1D) */}
            <div className={`inline-flex h-8 items-center rounded-lg bg-slate-100 p-0.5 gap-0.5 flex-wrap sm:flex-nowrap ${isMobile ? "hidden" : ""}`} data-testid="period-selector">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handlePeriod(opt.key)}
                  className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    opt.key !== "1d" && isMobile ? "hidden" : ""
                  } ${
                    period === opt.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  data-testid={`period-${opt.key}`}
                >
                  {opt.label}
                </button>
              ))}
              {/* Custom date gear toggle - hide on mobile */}
              {!isMobile && (
                <button
                  onClick={() => { setShowCustomDate(!showCustomDate); if (!showCustomDate) setPeriod("custom"); }}
                  className={`px-1.5 py-1.5 rounded-md transition-colors ${
                    showCustomDate ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  }`}
                  data-testid="custom-date-toggle"
                  title="Custom date range"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Day-mode prev/next arrows and date picker */}
            {period === "1d" && (
              <div className="flex items-center gap-1 sm:gap-0 flex-1 sm:flex-none">
                <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-8 sm:w-8 rounded-none touch-manipulation" onClick={prevDay} data-testid="prev-day">
                    <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-8 sm:w-8 rounded-none touch-manipulation" onClick={nextDay} data-testid="next-day">
                    <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
                  </Button>
                </div>
                {/* Mobile date picker */}
                {isMobile && (
                  <input
                    type="date"
                    value={fromStr}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const d = new Date(v + "T12:00:00");
                      if (!isNaN(d)) { setFromDate(d); setToDate(d); }
                    }}
                    className="h-8 flex-1 px-2 text-sm border border-slate-200 rounded-lg bg-white ml-1"
                    data-testid="mobile-date-picker"
                  />
                )}
              </div>
            )}

            {/* Period navigation arrows for non-day modes */}
            {period !== "1d" && !showCustomDate && (
              <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => stepPeriod(-1)} data-testid="prev-period">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => stepPeriod(1)} data-testid="next-period">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Shift selector - hide on mobile */}
            <Select value={shift} onValueChange={setShift}>
              <SelectTrigger className={`w-[140px] sm:w-[180px] h-8 text-xs sm:text-sm bg-white ${isMobile ? "hidden" : ""}`} data-testid="shift-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day (06:00 - 22:00)</SelectItem>
                <SelectItem value="night">Night (22:00 - 06:00)</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh */}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => refetch()} data-testid="refresh-btn">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>

            {/* Date display - desktop only */}
            <span className="hidden sm:flex text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 sm:px-3 h-8 items-center tabular-nums whitespace-nowrap" data-testid="date-display">
              {fromStr === toStr ? displayDate(fromDate) : `${displayDate(fromDate)} — ${displayDate(toDate)}`}
            </span>

            {/* Export - hidden on mobile */}
            <Button variant="outline" size="sm" className="h-8 gap-1 hidden sm:flex" onClick={exportToExcel} disabled={!data?.production_log?.length} data-testid="export-btn">
              <Download className="w-3.5 h-3.5" /> <span>Export</span>
            </Button>
          </div>

          {/* Custom date pickers (unfold below) - hidden on mobile */}
          {showCustomDate && !isMobile && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-500">From</label>
                <input
                  type="date"
                  value={fromStr}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const d = new Date(v + "T12:00:00");
                    if (!isNaN(d)) { setFromDate(d); setPeriod("custom"); }
                  }}
                  className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white"
                  data-testid="from-date"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-500">To</label>
                <input
                  type="date"
                  value={toStr}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const d = new Date(v + "T12:00:00");
                    if (!isNaN(d)) { setToDate(d); setPeriod("custom"); }
                  }}
                  className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white"
                  data-testid="to-date"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Loading state ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-slate-500">Loading dashboard...</span>
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="kpi-grid">
            <KPICard
              icon={Package}
              iconColor="bg-blue-50 text-blue-600"
              label="Total Input"
              value={kpis.total_input?.toLocaleString() || "0"}
              unit="kg"
              detail={kpis.lot_info || ""}
              detail2={`${kpis.sample_count || 0} samples`}
            />
            <KPICard
              icon={Trash2}
              iconColor="bg-red-50 text-red-500"
              label="Waste"
              value={kpis.waste?.toLocaleString() || "0"}
              unit="kg"
              detail={`${kpis.waste_pct || 0}% of input`}
            />
            <KPICard
              icon={TrendingUp}
              iconColor="bg-emerald-50 text-emerald-600"
              label="Yield"
              value={kpis.yield_pct || "0"}
              unit="%"
              detail={`Target: ${kpis.yield_target || 92}%`}
            />
            <KPICard
              icon={FlaskConical}
              iconColor="bg-purple-50 text-purple-600"
              label="Avg Mooney"
              value={kpis.avg_viscosity || "0"}
              unit="MU"
              detail={`Range: ${kpis.viscosity_range || "55-60"}`}
              detail2={`${kpis.viscosity_sample_count || 0} samples`}
            />
            <KPICard
              icon={Sigma}
              iconColor="bg-amber-50 text-amber-600"
              label="RSD"
              value={kpis.rsd || "0"}
              unit="%"
              detail={`Target: < ${kpis.rsd_target || 7}`}
            />
            <KPICard
              icon={Clock}
              iconColor="bg-slate-100 text-slate-600"
              label="Runtime"
              value={kpis.runtime_hours || "0"}
              unit="hours"
            />
          </div>

          {/* ── Mooney Viscosity Chart (full width) ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="viscosity-chart">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Mooney Viscosity</h3>
              <ChartSeriesToggles active={chartSeries} onToggle={(k) => setChartSeries(prev => ({ ...prev, [k]: !prev[k] }))} />
            </div>
            {combinedSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={250} className="sm:!h-[300px]">
                <ComposedChart data={combinedSeries} onClick={(e) => {
                  if (e?.activeLabel) setSelectedTime((prev) => prev === e.activeLabel ? null : e.activeLabel);
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <ReferenceArea yAxisId="left" y1={50} y2={60} fill="#22c55e" fillOpacity={0.1} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[48, 62]} label={{ value: "MU", position: "insideTopLeft", offset: -5, fontSize: 10 }} />
                  {(chartSeries.rpm || chartSeries.feed || chartSeries.mp4 || chartSeries.t_product_ir) && (
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  )}
                  <Tooltip content={<ViscosityTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="left" type="monotone" dataKey="viscosity" name="Viscosity (MU)" stroke="#8b5cf6" strokeWidth={2.5} dot={(props) => {
                    const isSelected = props.payload?.time === selectedTime;
                    return <circle cx={props.cx} cy={props.cy} r={isSelected ? 7 : 4} fill={isSelected ? "#7c3aed" : "#8b5cf6"} stroke={isSelected ? "#fff" : "none"} strokeWidth={isSelected ? 2 : 0} style={{ cursor: "pointer" }} />;
                  }} connectNulls activeDot={{ r: 6, stroke: "#7c3aed", strokeWidth: 2, fill: "#fff", cursor: "pointer" }} />
                  {chartSeries.rpm && <Line yAxisId="right" type="monotone" dataKey="rpm" name="RPM" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
                  {chartSeries.feed && <Line yAxisId="right" type="monotone" dataKey="feed" name="Feed (kg)" stroke="#f97316" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
                  {chartSeries.mp4 && <Line yAxisId="right" type="monotone" dataKey="mp4" name="MP4" stroke="#14b8a6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
                  {chartSeries.t_product_ir && <Line yAxisId="right" type="monotone" dataKey="t_product_ir" name="T Product IR" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
                  {chartSeries.screenChange && <Line yAxisId="left" type="monotone" dataKey="screenChange" name="Screen Change" stroke="#a855f7" strokeWidth={0} dot={{ r: 6, fill: "#a855f7", strokeWidth: 2, stroke: "#fff" }} connectNulls={false} legendType="diamond" />}
                  {chartSeries.magnetCleaning && <Line yAxisId="left" type="monotone" dataKey="magnetCleaning" name="Magnet Cleaning" stroke="#ec4899" strokeWidth={0} dot={{ r: 6, fill: "#ec4899", strokeWidth: 2, stroke: "#fff" }} connectNulls={false} legendType="diamond" />}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] sm:h-[300px] text-sm text-slate-400">
                No viscosity data for this period
              </div>
            )}
          </div>

          {/* ── End of Shift Details + Input Material + Insights Row ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* End of Shift Details */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="end-of-shift-panel">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">End of Shift Details</h3>
                <div className="flex items-center gap-2">
                  {data?.end_of_shift_entries?.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{data.end_of_shift_entries.length}</Badge>
                  )}
                  {!isMobile && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        if (formTemplates?.endOfShift) {
                          setFormExec({
                            templateId: formTemplates.endOfShift.id,
                            templateName: "End of Shift",
                            equipmentId: line90Equipment?.id,
                          });
                        } else {
                          toast.error("End of shift template not found");
                        }
                      }}
                      data-testid="end-of-shift-add-btn"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-[240px] overflow-y-auto">
                {data?.end_of_shift_entries?.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Date & Time</th>
                        <th className="text-right py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Input (kg)</th>
                        <th className="text-right py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Waste (kg)</th>
                        <th className="w-14"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.end_of_shift_entries.map((eos, i) => {
                        let displayDT = "";
                        const raw = eos.date_time_raw || eos.datetime;
                        if (raw) {
                          try {
                            const d = new Date(raw);
                            if (!isNaN(d.getTime())) {
                              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                              const hh = String(d.getHours()).padStart(2, "0");
                              const mm = String(d.getMinutes()).padStart(2, "0");
                              displayDT = `${d.getDate()} ${months[d.getMonth()]} ${hh}:${mm}`;
                            } else {
                              displayDT = String(raw);
                            }
                          } catch {
                            displayDT = String(raw);
                          }
                        }
                        const hasNotes = eos.notes && eos.notes.trim().length > 0;
                        const isExpanded = expandedEosNotes === (eos.submission_id || i);
                        return (
                          <React.Fragment key={eos.submission_id || i}>
                            <TooltipProvider delayDuration={200}>
                              <RadixTooltip>
                                <TooltipTrigger asChild>
                                  <tr 
                                    className={`border-b border-slate-50 hover:bg-slate-50 group cursor-default ${hasNotes ? "bg-amber-50/30" : ""} ${isExpanded ? "bg-amber-100/50" : ""}`} 
                                    data-testid={`eos-row-${i}`}
                                    onClick={() => {
                                      // Toggle notes expansion on mobile (click)
                                      if (hasNotes) {
                                        setExpandedEosNotes(isExpanded ? null : (eos.submission_id || i));
                                      }
                                    }}
                                  >
                                    <td className="py-1.5 px-1 text-slate-700 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5">
                                        {displayDT || "—"}
                                        {hasNotes && (
                                          <MessageCircle className={`w-3 h-3 flex-shrink-0 ${isExpanded ? "text-amber-600" : "text-amber-500"}`} />
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-1 text-right tabular-nums text-slate-700">{Number(eos.total_input || 0).toLocaleString()}</td>
                                    <td className="py-1.5 px-1 text-right tabular-nums text-red-600 font-medium">{Number(eos.total_waste || 0).toLocaleString()}</td>
                                    <td className="py-1 px-1">
                                      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (formTemplates?.endOfShift && eos.submission_id) {
                                              setFormExec({
                                                templateId: formTemplates.endOfShift.id,
                                                templateName: "End of Shift",
                                                equipmentId: line90Equipment?.id,
                                                submissionId: eos.submission_id,
                                                initialValues: {
                                                  "date_&_time": eos.date_time_raw || "",
                                                  "total_input": eos.total_input ?? "",
                                                  "total_wast": eos.total_waste ?? "",
                                                },
                                              });
                                            }
                                          }}
                                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                          title="Edit"
                                          data-testid={`edit-eos-${i}`}
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (eos.submission_id) {
                                              setDeleteConfirm({ ids: [eos.submission_id], label: `end of shift entry (${displayDT || "item"})` });
                                            }
                                          }}
                                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                                          title="Delete"
                                          data-testid={`delete-eos-${i}`}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                </TooltipTrigger>
                                {/* Desktop hover tooltip */}
                                {hasNotes && (
                                  <TooltipContent side="top" className="max-w-xs bg-slate-800 text-white px-3 py-2 rounded-lg shadow-lg hidden sm:block">
                                    <div className="text-xs">
                                      <span className="font-semibold text-amber-300">Completion Comments:</span>
                                      <p className="mt-1 whitespace-pre-wrap">{eos.notes}</p>
                                    </div>
                                  </TooltipContent>
                                )}
                              </RadixTooltip>
                            </TooltipProvider>
                            {/* Mobile expanded notes row */}
                            {hasNotes && isExpanded && (
                              <tr className="bg-amber-50 border-b border-amber-100">
                                <td colSpan={4} className="px-2 py-2">
                                  <div className="text-xs">
                                    <span className="font-semibold text-amber-700">Completion Comments:</span>
                                    <p className="mt-1 text-slate-600 whitespace-pre-wrap">{eos.notes}</p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-slate-400 py-8 text-center">No end of shift data</p>
                )}
              </div>
            </div>

            {/* Input Material / Big Bag Loading */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="big-bag-panel">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Input Material</h3>
                <div className="flex items-center gap-2">
                  {data?.big_bag_entries?.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{data.big_bag_entries.length}</Badge>
                  )}
                  {/* Hide Add button on mobile (view only) */}
                  {!isMobile && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" data-testid="big-bag-add-btn">
                          <Plus className="w-3 h-3" /> Add
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          if (formTemplates?.bigBag) setFormExec({ templateId: formTemplates.bigBag.id, templateName: "Big Bag Loading", equipmentId: line90Equipment?.id });
                          else toast.error("Big Bag Loading template not found");
                        }} data-testid="add-bigbag-option">
                          Big Bag Loading
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {data?.big_bag_entries?.length > 0 ? (
                  isMobile ? (
                    /* Mobile Card View for Big Bag */
                    <div className="space-y-2">
                      {data.big_bag_entries.map((bag, i) => (
                        <div key={bag.submission_id || i} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                          <div className="font-medium text-slate-900">{bag.material || "—"}</div>
                          <div className="flex flex-wrap gap-x-3 text-slate-600 mt-1">
                            <span>Supplier: {bag.supplier || "—"}</span>
                            <span>Bag: {bag.bag_no || "—"}</span>
                            <span>Lot: {bag.lot_no || "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Desktop Table View for Big Bag */
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Material</th>
                          <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Supplier</th>
                          <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Bag No.</th>
                          <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Lot No.</th>
                          <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Prod. Date</th>
                          <th className="w-14"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.big_bag_entries.map((bag, i) => (
                          <tr key={bag.submission_id || i} className="border-b border-slate-50 hover:bg-slate-50 group">
                            <td className="py-1.5 px-1 text-slate-700">{bag.material}</td>
                            <td className="py-1.5 px-1 text-slate-700">{bag.supplier}</td>
                            <td className="py-1.5 px-1 text-slate-700 tabular-nums">{bag.bag_no}</td>
                            <td className="py-1.5 px-1 text-slate-700">{bag.lot_no}</td>
                            <td className="py-1.5 px-1 text-slate-700 tabular-nums">{bag.production_date || ""}</td>
                            <td className="py-1 px-1">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setEditBigBag({ ...bag, _index: i })}
                                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                  title="Edit"
                                  data-testid={`edit-bag-${i}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (bag.submission_id) {
                                      setDeleteConfirm({ ids: [bag.submission_id], label: `big bag entry (${bag.material || bag.lot_no || "item"})` });
                                    }
                                  }}
                                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                                  title="Delete"
                                  data-testid={`delete-bag-${i}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No input material data</p>
                )}
              </div>
            </div>

            {/* Daily Insights */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="insights-panel">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Insights</h3>
                <div className="flex items-center gap-2">
                  {data?.insights?.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{data.insights.length}</Badge>
                  )}
                  {/* Hide AI Refresh button on mobile (view only) */}
                  {!isMobile && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={aiInsightsMutation.isPending || !data?.production_log?.length}
                      onClick={() => aiInsightsMutation.mutate()}
                      data-testid="ai-insights-btn"
                    >
                      <Sparkles className={`w-3 h-3 ${aiInsightsMutation.isPending ? "animate-spin" : ""}`} />
                      {aiInsightsMutation.isPending ? "Analyzing..." : "AI Refresh"}
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {data?.insights?.length > 0 ? (
                  data.insights.map((ev) => <EventCard key={ev.id} event={ev} />)
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No insights recorded</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Production Log Table ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="production-log">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Production Log</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    placeholder="Search..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-8 h-8 w-32 sm:w-44 text-sm"
                    data-testid="log-search"
                  />
                </div>
                {/* Hide Add button on mobile (view only) */}
                {!isMobile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" data-testid="log-add-btn">
                        <Plus className="w-3 h-3" /> <span className="hidden xs:inline">Add</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          if (formTemplates?.extruder) setFormExec({ templateId: formTemplates.extruder.id, templateName: "Extruder Settings", equipmentId: line90Equipment?.id });
                          else toast.error("Extruder template not found");
                        }}
                        data-testid="add-extruder-option"
                      >
                        Extruder Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (formTemplates?.viscosity) setFormExec({ templateId: formTemplates.viscosity.id, templateName: "Viscosity Sample", equipmentId: line90Equipment?.id });
                          else toast.error("Viscosity template not found");
                        }}
                        data-testid="add-viscosity-option"
                      >
                        Viscosity Sample
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Mobile Card View */}
            {isMobile ? (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {filteredLog.length > 0 ? (
                  filteredLog.map((entry, i) => {
                    const anomaly = isAnomalyRow(entry);
                    const isViscOnly = entry._viscosity_only;
                    const viscValue = isViscOnly
                      ? entry._viscosity_value
                      : viscosityByTime[entry.time]?.value;
                    const viscSubId = isViscOnly
                      ? entry._viscosity_submission_id
                      : viscosityByTime[entry.time]?.submission_id;
                    const openEdit = () => {
                      if (isViscOnly) {
                        setEditEntry({ ...entry, _index: i, viscosity: entry._viscosity_value ?? "", _viscosity_submission_id: entry._viscosity_submission_id || "", _viscosity_only: true });
                      } else {
                        const viscData = viscosityByTime[entry.time];
                        setEditEntry({ ...entry, _index: i, viscosity: viscData?.value ?? "", _viscosity_submission_id: viscData?.submission_id || "" });
                      }
                    };
                    return (
                      <div
                        key={`${entry.time}-${i}`}
                        className={`p-3 rounded-lg border ${isViscOnly ? "bg-blue-50/40 border-blue-100" : anomaly ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}
                        data-testid={`mobile-log-${entry.time}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-slate-900">{entry.time}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs">
                              {entry.submitted_by || "—"}
                            </Badge>
                            <button
                              type="button"
                              onClick={openEdit}
                              className="p-1 rounded-md bg-white border border-slate-200 text-slate-500 active:bg-slate-100"
                              data-testid={`mobile-edit-${entry.time}`}
                              aria-label="Edit entry"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {isViscOnly ? (
                          <button
                            type="button"
                            onClick={openEdit}
                            className="w-full text-left text-sm text-slate-600"
                            data-testid={`mobile-visc-edit-${entry.time}`}
                          >
                            <span className="font-medium">Viscosity:</span> {viscValue ?? "—"}
                          </button>
                        ) : (
                          <div className="text-xs">
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              <span><span className="text-slate-500">RPM:</span> <span className="font-medium">{entry.rpm}</span></span>
                              <span><span className="text-slate-500">Feed:</span> <span className="font-medium">{entry.feed}</span></span>
                              <span><span className="text-slate-500">MP4:</span> <span className="font-medium">{entry.mp4}</span></span>
                              <span><span className="text-slate-500">T Product IR:</span> <span className="font-medium">{entry.t_product_ir}</span></span>
                            </div>
                            <div className="mt-1">
                              <span className="text-slate-500">Visc:</span>{" "}
                              <button
                                type="button"
                                onClick={openEdit}
                                className="font-medium underline underline-offset-2 decoration-dotted decoration-slate-300"
                                data-testid={`mobile-visc-edit-${entry.time}`}
                              >
                                {viscValue ?? <span className="text-amber-500">TBD</span>}
                              </button>
                            </div>
                          </div>
                        )}
                        {entry.remarks && !isViscOnly && (
                          <p className="mt-2 text-xs text-slate-500 truncate" title={entry.remarks}>
                            {entry.remarks}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    {data?.production_log?.length === 0
                      ? "No production data for this date/shift."
                      : "No matching results"}
                  </div>
                )}
              </div>
            ) : (
              /* Desktop Table View */
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="production-log-table">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {["#", "Date", "Time", "RPM", "Feed", "M%", "Energy", "MT1", "MT2", "MT3", "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR", "Viscosity", "Remarks", "By", ""].map((h) => (
                        <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2 px-2 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                <tbody>
                  {filteredLog.length > 0 ? (
                    filteredLog.map((entry, i) => {
                      const anomaly = isAnomalyRow(entry);
                      const isHighlighted = selectedTime && entry.time === selectedTime;
                      const isViscOnly = entry._viscosity_only;
                      const viscValue = isViscOnly
                        ? entry._viscosity_value
                        : viscosityByTime[entry.time]?.value;
                      const viscSubId = isViscOnly
                        ? entry._viscosity_submission_id
                        : viscosityByTime[entry.time]?.submission_id;
                      const tbdCell = <span className="text-slate-300">—</span>;
                      return (
                        <tr
                          key={`${entry.time}-${i}`}
                          className={`border-b border-slate-50 transition-colors ${isHighlighted ? "bg-purple-50 ring-1 ring-purple-300" : isViscOnly ? "bg-blue-50/40" : anomaly ? "bg-amber-50" : "hover:bg-slate-50"}`}
                          data-testid={`log-row-${entry.time}`}
                          ref={isHighlighted ? (el) => el?.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined}
                        >
                          <td className="py-2 px-2 text-slate-400 text-xs tabular-nums">{i + 1}</td>
                          <td className="py-2 px-2 text-slate-500 text-xs tabular-nums whitespace-nowrap">{entry.datetime ? new Date(entry.datetime).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}) : ''}</td>
                          <td className="py-2 px-2 font-medium text-slate-700 tabular-nums">{entry.time}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.rpm}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.feed}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.moisture}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.energy}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mt1}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mt2}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mt3}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mp1}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mp2}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mp3}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mp4}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.co2_feed_p}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.t_product_ir}</td>
                          <td className="py-2 px-2 tabular-nums">{viscValue !== undefined ? viscValue : <span className="text-amber-500 font-medium">TBD</span>}</td>
                          <td className="py-2 px-2 text-slate-500 text-xs truncate max-w-[120px]" title={entry.remarks || ""}>{isViscOnly ? "" : entry.remarks || ""}</td>
                          <td className="py-2 px-2 text-slate-500 text-xs truncate max-w-[80px]">{entry.submitted_by}</td>
                          <td className="py-1.5 px-2 flex items-center gap-0.5">
                            <button
                              onClick={() => {
                                if (isViscOnly) {
                                  setEditEntry({ ...entry, _index: i, viscosity: entry._viscosity_value ?? "", _viscosity_submission_id: entry._viscosity_submission_id || "", _viscosity_only: true });
                                } else {
                                  const viscData = viscosityByTime[entry.time];
                                  setEditEntry({ ...entry, _index: i, viscosity: viscData?.value ?? "", _viscosity_submission_id: viscData?.submission_id || "" });
                                }
                              }}
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              data-testid={`edit-row-${entry.time}`}
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (isViscOnly) {
                                  setDeleteConfirm({ ids: [entry._viscosity_submission_id].filter(Boolean), label: `viscosity sample at ${entry.time}` });
                                } else {
                                  const ids = [entry.submission_id, viscosityByTime[entry.time]?.submission_id].filter(Boolean);
                                  setDeleteConfirm({ ids, label: `log entry at ${entry.time}` });
                                }
                              }}
                              className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                              data-testid={`delete-row-${entry.time}`}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={19} className="py-8 text-center text-slate-400 text-sm">
                        {data?.production_log?.length === 0
                          ? "No production data for this date/shift. Submit Extruder settings samples to see data here."
                          : "No matching results"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            )}

            {filteredLog.length > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{filteredLog.length} entries</span>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Screen changes: {data?.screen_changes?.length || 0}</span>
                    <span className="text-slate-300">|</span>
                    <span>Magnet cleanings: {data?.magnet_cleanings?.length || 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-amber-50 border border-amber-200" /><span className="text-slate-500">Viscosity anomaly (&gt;4 MU from avg)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-purple-50 border border-purple-300" /><span className="text-slate-500">Selected point</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-blue-50 border border-blue-100" /><span className="text-slate-500">Viscosity-only sample</span></div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Machine Settings Analysis ── */}
      <MachineAnalysisPanel fromDate={fromStr} toDate={toStr} period={period} />

      {/* ── Add Event Dialog ── */}
      <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
        <DialogContent className="max-w-md" data-testid="add-event-dialog">
          <DialogHeader>
            <DialogTitle>Add Production Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={newEvent.type} onValueChange={(v) => setNewEvent({ ...newEvent, type: v })}>
                <SelectTrigger className="h-9 mt-1" data-testid="event-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="action">Action</SelectItem>
                  <SelectItem value="insight">Insight</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Severity</Label>
              <Select value={newEvent.severity} onValueChange={(v) => setNewEvent({ ...newEvent, severity: v })}>
                <SelectTrigger className="h-9 mt-1" data-testid="event-severity-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                className="h-9 mt-1"
                placeholder="e.g. Sheet breaking + downtime"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                data-testid="event-title-input"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                className="mt-1"
                placeholder="Details..."
                rows={3}
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                data-testid="event-description-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddEvent(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newEvent.title || createEventMutation.isPending}
                onClick={() =>
                  createEventMutation.mutate({
                    ...newEvent,
                    date: fromStr,
                    time: new Date().toTimeString().slice(0, 5),
                  })
                }
                data-testid="submit-event-btn"
              >
                {createEventMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Log Entry Dialog ── */}
      <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-hidden flex flex-col" data-testid="edit-entry-dialog">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editEntry?._viscosity_only ? `Edit Viscosity — ${editEntry?.time}` : `Edit Log Entry — ${editEntry?.time}`}</DialogTitle>
          </DialogHeader>
          {editEntry && (
            <>
              <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-2">
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* Viscosity at the top for mobile visibility */}
                  <div className="col-span-2">
                    <Label className="text-xs font-semibold text-blue-700">Viscosity (MU)</Label>
                    <Input
                      type="number"
                      step="any"
                      className="h-10 mt-1 tabular-nums border-blue-200 focus:border-blue-400"
                      placeholder={editEntry._viscosity_submission_id ? "" : "No viscosity sample at this time"}
                      value={editEntry.viscosity ?? ""}
                      onChange={(e) => setEditEntry((prev) => ({ ...prev, viscosity: e.target.value }))}
                      data-testid="edit-viscosity"
                    />
                  </div>
                  {!editEntry._viscosity_only && [
                    { key: "rpm", label: "RPM" },
                    { key: "feed", label: "Feed" },
                    { key: "moisture", label: "M%" },
                    { key: "energy", label: "Energy" },
                    { key: "mt1", label: "MT1" },
                    { key: "mt2", label: "MT2" },
                    { key: "mt3", label: "MT3" },
                    { key: "mp1", label: "MP1" },
                    { key: "mp2", label: "MP2" },
                    { key: "mp3", label: "MP3" },
                    { key: "mp4", label: "MP4" },
                    { key: "co2_feed_p", label: "CO2 Feed/P" },
                    { key: "t_product_ir", label: "T Product IR" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        step="any"
                        className="h-9 mt-1 tabular-nums"
                        value={editEntry[key] ?? ""}
                        onChange={(e) => setEditEntry((prev) => ({ ...prev, [key]: e.target.value }))}
                        data-testid={`edit-${key}`}
                      />
                    </div>
                  ))}
                  {!editEntry._viscosity_only && (
                  <div className="col-span-2">
                    <Label className="text-xs">Remarks</Label>
                    <Input
                      className="h-9 mt-1"
                      value={editEntry.remarks ?? ""}
                      onChange={(e) => setEditEntry((prev) => ({ ...prev, remarks: e.target.value }))}
                      data-testid="edit-remarks"
                    />
                  </div>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 flex justify-end gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setEditEntry(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateSubmissionMutation.isPending}
                  onClick={async () => {
                    const refresh = () => {
                      queryClient.invalidateQueries({ queryKey: ["production-dashboard"] });
                      setEditEntry(null);
                      toast.success("Entry updated");
                    };

                    // Viscosity-only row: only update viscosity
                    if (editEntry._viscosity_only) {
                      if (editEntry._viscosity_submission_id && editEntry.viscosity !== "") {
                        productionAPI.updateSubmission(editEntry._viscosity_submission_id, { Measurement: editEntry.viscosity }).then(refresh).catch(() => toast.error("Failed to update viscosity"));
                      } else {
                        toast.error("No viscosity submission to update");
                      }
                      return;
                    }

                    // Regular row: update extruder submission
                    const fieldMap = {
                      rpm: "RPM", feed: "FEED", moisture: "M%", energy: "ENERGY",
                      mt1: "MT1", mt2: "MT2", mt3: "MT3",
                      mp1: "MP1", mp2: "MP2", mp3: "MP3", mp4: "MP4",
                      co2_feed_p: "CO2 Feed/P", t_product_ir: "T Product IR",
                      remarks: "Remarks",
                    };
                    const values = {};
                    Object.entries(fieldMap).forEach(([k, fieldLabel]) => {
                      if (editEntry[k] !== undefined && editEntry[k] !== "") {
                        values[fieldLabel] = editEntry[k];
                      }
                    });

                    if (editEntry.submission_id) {
                      productionAPI.updateSubmission(editEntry.submission_id, values).then(refresh).catch(() => toast.error("Failed to update extruder entry"));
                    }

                    if (editEntry._viscosity_submission_id && editEntry.viscosity !== "") {
                      productionAPI.updateSubmission(editEntry._viscosity_submission_id, { Measurement: editEntry.viscosity }).then(refresh).catch(() => toast.error("Failed to update viscosity"));
                    }
                  }}
                  data-testid="save-edit-btn"
                >
                  {updateSubmissionMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Big Bag Dialog ── */}
      <Dialog open={!!editBigBag} onOpenChange={(open) => { if (!open) setEditBigBag(null); }}>
        <DialogContent className="max-w-md" data-testid="edit-bigbag-dialog">
          <DialogHeader>
            <DialogTitle>Edit Input Material</DialogTitle>
          </DialogHeader>
          {editBigBag && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                { key: "material", label: "Input Material" },
                { key: "supplier", label: "Supplier" },
                { key: "bag_no", label: "Bag No." },
                { key: "lot_no", label: "Lot No." },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    className="h-9 mt-1"
                    value={editBigBag[key] ?? ""}
                    onChange={(e) => setEditBigBag((prev) => ({ ...prev, [key]: e.target.value }))}
                    data-testid={`edit-bag-${key}`}
                  />
                </div>
              ))}
              <div className="col-span-2">
                <Label className="text-xs">Production Date</Label>
                <Input
                  type="date"
                  className="h-9 mt-1"
                  value={editBigBag.production_date ?? ""}
                  onChange={(e) => setEditBigBag((prev) => ({ ...prev, production_date: e.target.value }))}
                  data-testid="edit-bag-production_date"
                />
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditBigBag(null)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={updateSubmissionMutation.isPending}
                  onClick={() => {
                    const values = {
                      "Input material": editBigBag.material,
                      "Supplier": editBigBag.supplier,
                      "Bag No.": editBigBag.bag_no,
                      "Lot No.": editBigBag.lot_no,
                      "Production Date": editBigBag.production_date,
                    };
                    updateSubmissionMutation.mutate({ id: editBigBag.submission_id, values });
                    setEditBigBag(null);
                  }}
                  data-testid="save-bag-edit-btn"
                >
                  {updateSubmissionMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Form Execution Dialog ── */}
      <FormExecutionDialog
        open={!!formExec}
        onClose={() => setFormExec(null)}
        templateId={formExec?.templateId}
        templateName={formExec?.templateName || ""}
        equipmentId={formExec?.equipmentId || ""}
        submissionId={formExec?.submissionId}
        initialValues={formExec?.initialValues}
                onSuccess={() => {
          // Invalidate and refetch the production dashboard data
          queryClient.invalidateQueries({ 
            predicate: (query) => query.queryKey[0] === "production-dashboard"
          });
          queryClient.refetchQueries({
            predicate: (query) => query.queryKey[0] === "production-dashboard"
          });
        }}
      />

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open && !deleteSubmissionMutation.isPending) setDeleteConfirm(null); }}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the {deleteConfirm?.label || "entry"}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-cancel-btn" disabled={deleteSubmissionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              data-testid="delete-confirm-btn"
              disabled={deleteSubmissionMutation.isPending}
              onClick={() => {
                (deleteConfirm?.ids || []).forEach((id) => deleteSubmissionMutation.mutate(id));
                setDeleteConfirm(null);
              }}
            >
              {deleteSubmissionMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
