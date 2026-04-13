import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productionAPI } from "../lib/api";
import api from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
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
  CheckCircle2,
  Search,
  X,
  Pencil,
  Settings,
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
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
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
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-medium text-slate-800">{entry.value}</span>
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
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#8b5cf6]" /><span className="text-slate-600">Viscosity:</span><span className="font-medium text-slate-800">{d.viscosity} MU</span></div>
      )}
      {d.rpm != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#3b82f6]" /><span className="text-slate-600">RPM:</span><span className="font-medium text-slate-800">{d.rpm}</span></div>
      )}
      {d.feed != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#f97316]" /><span className="text-slate-600">Feed:</span><span className="font-medium text-slate-800">{d.feed} kg</span></div>
      )}
      {d.mp4 != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#14b8a6]" /><span className="text-slate-600">MP4:</span><span className="font-medium text-slate-800">{d.mp4}</span></div>
      )}
      {d.t_product_ir != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ef4444]" /><span className="text-slate-600">T Product IR:</span><span className="font-medium text-slate-800">{d.t_product_ir}</span></div>
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
  <div className="flex items-center gap-1.5 flex-wrap" data-testid="chart-toggles">
    {OPTIONAL_SERIES.map((s) => (
      <button
        key={s.key}
        onClick={() => onToggle(s.key)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
          active[s.key]
            ? "border-transparent text-white"
            : "border-slate-200 text-slate-500 bg-white hover:bg-slate-50"
        }`}
        style={active[s.key] ? { backgroundColor: s.color } : undefined}
        data-testid={`toggle-${s.key}`}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active[s.key] ? "#fff" : s.color }} />
        {s.label}
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

const FormExecutionDialog = ({ open, onClose, templateId, templateName, equipmentId, equipmentName, equipmentTag, onSuccess }) => {
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
      // Set defaults
      const defaults = {};
      f.forEach((field) => {
        const ft = field.type || field.field_type || "text";
        if (ft === "datetime") defaults[field.id] = new Date().toISOString().slice(0, 16);
        else if (ft === "date") defaults[field.id] = new Date().toISOString().slice(0, 10);
        else defaults[field.id] = "";
        // Collect dropdown options
        if (ft === "dropdown" && field.options) {
          setDropdownOptions((prev) => ({ ...prev, [field.id]: field.options }));
        }
      });
      setFormData(defaults);
    }).catch(() => toast.error("Failed to load form")).finally(() => setLoading(false));
  }, [open, templateId]);

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
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="form-execution-dialog">
        <DialogHeader>
          <DialogTitle>{templateName}</DialogTitle>
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
                      className="h-9 mt-1"
                      value={formData[field.id] ?? ""}
                      onChange={(e) => setFormData((p) => ({ ...p, [field.id]: e.target.value }))}
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

  // State
  const [period, setPeriod] = useState("1d");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [shift, setShift] = useState("day");
  const [logSearch, setLogSearch] = useState("");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", type: "action", severity: "info" });
  const [chartSeries, setChartSeries] = useState({ rpm: false, feed: false, mp4: false, t_product_ir: false, screenChange: false, magnetCleaning: false });
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [formExec, setFormExec] = useState(null); // { templateId, templateName }
  const [selectedTime, setSelectedTime] = useState(null); // highlighted time from chart click

  // Template IDs (fetched once)
  const { data: formTemplates } = useQuery({
    queryKey: ["production-form-templates"],
    queryFn: async () => {
      const res = await api.get("/form-templates");
      const list = Array.isArray(res.data) ? res.data : res.data.templates || [];
      const bigBag = list.find((t) => t.name === "Big Bag Loading");
      const extruder = list.find((t) => t.name === "Extruder settings sample");
      const viscosity = list.find((t) => /mooney viscosity/i.test(t.name));
      return { bigBag, extruder, viscosity };
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

  // Date navigation (day mode only)
  const prevDay = () => { const d = new Date(fromDate.getTime() - 86400000); setFromDate(d); setToDate(d); };
  const nextDay = () => { const d = new Date(fromDate.getTime() + 86400000); setFromDate(d); setToDate(d); };

  // Filtered production log
  const filteredLog = useMemo(() => {
    if (!data?.production_log) return [];
    if (!logSearch) return data.production_log;
    const s = logSearch.toLowerCase();
    return data.production_log.filter(
      (e) =>
        e.time?.toLowerCase().includes(s) ||
        e.submitted_by?.toLowerCase().includes(s) ||
        String(e.rpm).includes(s) ||
        String(e.feed).includes(s)
    );
  }, [data?.production_log, logSearch]);

  // Combined time series for Mooney Viscosity chart (merges viscosity + production log data)
  const combinedSeries = useMemo(() => {
    const log = data?.production_log || [];
    const viscSeries = data?.viscosity_series || [];
    const viscVals = data?.viscosity_values || [];
    const screenChanges = chartSeries.screenChange ? new Set((data?.screen_changes || []).map(s => s.time)) : new Set();
    const magnetCleanings = chartSeries.magnetCleaning ? new Set((data?.magnet_cleanings || []).map(s => s.time)) : new Set();
    // Build a time-indexed map from production log
    const timeMap = {};
    log.forEach((entry, i) => {
      timeMap[entry.time] = {
        time: entry.time,
        rpm: entry.rpm,
        feed: entry.feed,
        mp4: entry.mp4,
        t_product_ir: entry.t_product_ir,
        viscosity: i < viscVals.length ? viscVals[i] : null,
        screenChange: null,
        magnetCleaning: null,
      };
    });
    // Also add any viscosity entries not already covered
    viscSeries.forEach((v) => {
      if (!timeMap[v.time]) {
        timeMap[v.time] = { time: v.time, viscosity: v.viscosity, rpm: null, feed: null, mp4: null, t_product_ir: null, screenChange: null, magnetCleaning: null };
      } else if (timeMap[v.time].viscosity == null) {
        timeMap[v.time].viscosity = v.viscosity;
      }
    });
    // Add screen change and magnet cleaning events as reference points
    // We place them at the nearest time slot, or create a new one
    const addEvent = (timeSet, fieldName) => {
      timeSet.forEach((t) => {
        if (timeMap[t]) {
          timeMap[t][fieldName] = timeMap[t].viscosity || 0;
        } else {
          timeMap[t] = { time: t, viscosity: null, rpm: null, feed: null, mp4: null, t_product_ir: null, screenChange: null, magnetCleaning: null, [fieldName]: 0 };
        }
      });
    };
    addEvent(screenChanges, "screenChange");
    addEvent(magnetCleanings, "magnetCleaning");
    // For event markers, use the viscosity value at that point so the marker sits on the line
    const sorted = Object.values(timeMap).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    // Fill event marker values to match viscosity for visual alignment
    sorted.forEach((p) => {
      if (p.screenChange !== null) p.screenChange = p.viscosity || p.screenChange;
      if (p.magnetCleaning !== null) p.magnetCleaning = p.viscosity || p.magnetCleaning;
    });
    return sorted;
  }, [data?.production_log, data?.viscosity_series, data?.viscosity_values, data?.screen_changes, data?.magnet_cleanings, chartSeries.screenChange, chartSeries.magnetCleaning]);

  const kpis = data?.kpis || {};

  // Anomaly highlight row
  const isAnomalyRow = (entry) => {
    if (!data?.viscosity_values?.length) return false;
    const avgVisc = kpis.avg_viscosity || 0;
    const idx = data.production_log?.indexOf(entry);
    if (idx >= 0 && idx < data.viscosity_values.length) {
      return Math.abs(data.viscosity_values[idx] - avgVisc) > 4;
    }
    return entry.waste > 200;
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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period quick filters */}
          <div className="inline-flex h-8 items-center rounded-lg bg-slate-100 p-0.5 gap-0.5" data-testid="period-selector">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handlePeriod(opt.key)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  period === opt.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                data-testid={`period-${opt.key}`}
              >
                {opt.label}
              </button>
            ))}
            {/* Custom date gear toggle */}
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
          </div>

          {/* Custom date pickers (unfold) */}
          {showCustomDate && (
            <>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-500">From</label>
                <input
                  type="date"
                  value={fromStr}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const d = new Date(v + "T00:00:00");
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
                    const d = new Date(v + "T00:00:00");
                    if (!isNaN(d)) { setToDate(d); setPeriod("custom"); }
                  }}
                  className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white"
                  data-testid="to-date"
                />
              </div>
            </>
          )}

          {/* Day-mode prev/next arrows */}
          {period === "1d" && (
            <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={prevDay} data-testid="prev-day">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={nextDay} data-testid="next-day">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Shift selector */}
          <Select value={shift} onValueChange={setShift}>
            <SelectTrigger className="w-[180px] h-8 text-sm bg-white" data-testid="shift-selector">
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

          {/* Date display */}
          <span className="text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 h-8 flex items-center tabular-nums whitespace-nowrap" data-testid="date-display">
            {fromStr === toStr ? displayDate(fromDate) : `${displayDate(fromDate)} — ${displayDate(toDate)}`}
          </span>
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
          <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="viscosity-chart">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Mooney Viscosity</h3>
              <ChartSeriesToggles active={chartSeries} onToggle={(k) => setChartSeries(prev => ({ ...prev, [k]: !prev[k] }))} />
            </div>
            {combinedSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={combinedSeries} onClick={(e) => {
                  if (e?.activeLabel) setSelectedTime((prev) => prev === e.activeLabel ? null : e.activeLabel);
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <ReferenceArea yAxisId="left" y1={50} y2={60} fill="#22c55e" fillOpacity={0.1} />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[48, 62]} label={{ value: "MU", position: "insideTopLeft", offset: -5, fontSize: 11 }} />
                  {(chartSeries.rpm || chartSeries.feed || chartSeries.mp4 || chartSeries.t_product_ir) && (
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  )}
                  <Tooltip content={<ViscosityTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
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
              <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">
                No viscosity data for this period
              </div>
            )}
          </div>

          {/* ── Waste & Downtime + Actions + Insights Row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Waste & Downtime */}
            <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="waste-chart">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Waste & Downtime</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" data-testid="waste-add-btn">
                      <Plus className="w-3 h-3" /> Add
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowAddEvent(true)} data-testid="add-event-option">
                      Event
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {data?.waste_downtime_series?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={data.waste_downtime_series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="waste" name="Waste (kg)" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={14} />
                    <Bar dataKey="downtime" name="Downtime" fill="#475569" radius={[3, 3, 0, 0]} barSize={14} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-slate-400">
                  No data
                </div>
              )}
            </div>

            {/* Input Material / Big Bag Loading */}
            <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="big-bag-panel">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Input Material</h3>
                <div className="flex items-center gap-2">
                  {data?.big_bag_entries?.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{data.big_bag_entries.length}</Badge>
                  )}
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
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {data?.big_bag_entries?.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Material</th>
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Supplier</th>
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Bag No.</th>
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Lot No.</th>
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Prod. Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.big_bag_entries.map((bag, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-1.5 px-1 text-slate-700">{bag.material}</td>
                          <td className="py-1.5 px-1 text-slate-700">{bag.supplier}</td>
                          <td className="py-1.5 px-1 text-slate-700 tabular-nums">{bag.bag_no}</td>
                          <td className="py-1.5 px-1 text-slate-700">{bag.lot_no}</td>
                          <td className="py-1.5 px-1 text-slate-700 tabular-nums">{bag.production_date || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No input material data</p>
                )}
              </div>
            </div>

            {/* Daily Insights */}
            <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="insights-panel">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Daily Insights</h3>
                {data?.insights?.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{data.insights.length}</Badge>
                )}
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
          <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="production-log">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Production Log</h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    placeholder="Search..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-8 h-8 w-44 text-sm"
                    data-testid="log-search"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" data-testid="log-add-btn">
                      <Plus className="w-3 h-3" /> Add
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
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="production-log-table">
                <thead>
                  <tr className="border-b border-slate-200">
                    {["#", "Time", "RPM", "Feed", "M%", "Energy", "MT1", "MT2", "MT3", "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR", "Viscosity", "Remarks", "By", ""].map((h) => (
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
                      return (
                        <tr
                          key={`${entry.time}-${i}`}
                          className={`border-b border-slate-50 transition-colors ${isHighlighted ? "bg-purple-50 ring-1 ring-purple-300" : anomaly ? "bg-amber-50" : "hover:bg-slate-50"}`}
                          data-testid={`log-row-${entry.time}`}
                          ref={isHighlighted ? (el) => el?.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined}
                        >
                          <td className="py-2 px-2 text-slate-400 text-xs tabular-nums">{i + 1}</td>
                          <td className="py-2 px-2 font-medium text-slate-700 tabular-nums">{entry.time}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.rpm}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.feed}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.moisture}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.energy}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mt1}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mt2}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mt3}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mp1}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mp2}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mp3}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mp4}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.co2_feed_p}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.t_product_ir}</td>
                          <td className="py-2 px-2 tabular-nums">{data?.viscosity_values?.[i] !== undefined ? data.viscosity_values[i] : "-"}</td>
                          <td className="py-2 px-2 text-slate-500 text-xs truncate max-w-[120px]" title={entry.remarks || ""}>{entry.remarks || ""}</td>
                          <td className="py-2 px-2 text-slate-500 text-xs truncate max-w-[80px]">{entry.submitted_by}</td>
                          <td className="py-1.5 px-2">
                            <button
                              onClick={() => setEditEntry({ ...entry, _index: i })}
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              data-testid={`edit-row-${entry.time}`}
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
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

            {filteredLog.length > 0 && (
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500">{filteredLog.length} entries</span>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Screen changes: {data?.screen_changes?.length || 0}</span>
                  <span className="text-slate-300">|</span>
                  <span>Magnet cleanings: {data?.magnet_cleanings?.length || 0}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

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
        <DialogContent className="max-w-lg" data-testid="edit-entry-dialog">
          <DialogHeader>
            <DialogTitle>Edit Log Entry — {editEntry?.time}</DialogTitle>
          </DialogHeader>
          {editEntry && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
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
              <div className="col-span-2">
                <Label className="text-xs">Remarks</Label>
                <Input
                  className="h-9 mt-1"
                  value={editEntry.remarks ?? ""}
                  onChange={(e) => setEditEntry((prev) => ({ ...prev, remarks: e.target.value }))}
                  data-testid="edit-remarks"
                />
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditEntry(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateSubmissionMutation.isPending}
                  onClick={() => {
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
                    updateSubmissionMutation.mutate({ id: editEntry.submission_id, values });
                  }}
                  data-testid="save-edit-btn"
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
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["production-dashboard"] })}
      />
    </div>
  );
}
