import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productionAPI } from "../lib/api";
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  Line,
  ComposedChart,
} from "recharts";
import { toast } from "sonner";

// ──────────────────────────────────────────
// Date helpers
// ──────────────────────────────────────────
const fmtDate = (d) => d.toISOString().slice(0, 10);
const displayDate = (d) => {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const startOfMonth = () => { const d = today(); d.setDate(1); return d; };
const startOfYear = () => { const d = today(); d.setMonth(0, 1); return d; };

const PERIOD_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "month", label: "Month" },
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

// ──────────────────────────────────────────
// Chart series toggle buttons
// ──────────────────────────────────────────
const OPTIONAL_SERIES = [
  { key: "rpm", label: "RPM", color: "#3b82f6" },
  { key: "feed", label: "Feed", color: "#f97316" },
  { key: "mt4", label: "MT4", color: "#14b8a6" },
  { key: "temperature", label: "Temperature", color: "#ef4444" },
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
// Main component
// ──────────────────────────────────────────
export default function ProductionDashboardPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  // State
  const [period, setPeriod] = useState("day");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [shift, setShift] = useState("day");
  const [logSearch, setLogSearch] = useState("");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", type: "action", severity: "info" });
  const [chartSeries, setChartSeries] = useState({ rpm: false, feed: false, mt4: false, temperature: false });

  // Period change handler
  const handlePeriod = (p) => {
    setPeriod(p);
    const t = today();
    if (p === "day") { setFromDate(t); setToDate(t); }
    else if (p === "month") { setFromDate(startOfMonth()); setToDate(t); }
    else if (p === "ytd") { setFromDate(startOfYear()); setToDate(t); }
  };

  const fromStr = fmtDate(fromDate);
  const toStr = fmtDate(toDate);

  // Build query params
  const queryParams = period === "day"
    ? { date: fromStr, shift }
    : { from_date: fromStr, to_date: toStr, shift };

  // Fetch dashboard data
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["production-dashboard", fromStr, toStr, period, shift],
    queryFn: () => productionAPI.getDashboard(queryParams),
    refetchInterval: 60000,
    staleTime: 30000,
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
    // Build a time-indexed map from production log
    const timeMap = {};
    log.forEach((entry, i) => {
      timeMap[entry.time] = {
        time: entry.time,
        rpm: entry.rpm,
        feed: entry.feed,
        mt4: entry.mt4,
        temperature: entry.mt1,
        viscosity: i < viscVals.length ? viscVals[i] : null,
      };
    });
    // Also add any viscosity entries not already covered
    viscSeries.forEach((v) => {
      if (!timeMap[v.time]) {
        timeMap[v.time] = { time: v.time, viscosity: v.viscosity, rpm: null, feed: null, mt4: null, temperature: null };
      } else if (timeMap[v.time].viscosity == null) {
        timeMap[v.time].viscosity = v.viscosity;
      }
    });
    return Object.values(timeMap).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }, [data?.production_log, data?.viscosity_series, data?.viscosity_values]);

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
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  period === opt.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                data-testid={`period-${opt.key}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* From date */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500">From</label>
            <input
              type="date"
              value={fromStr}
              onChange={(e) => { setFromDate(new Date(e.target.value + "T00:00:00")); setPeriod(""); }}
              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white"
              data-testid="from-date"
            />
          </div>

          {/* To date */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500">To</label>
            <input
              type="date"
              value={toStr}
              onChange={(e) => { setToDate(new Date(e.target.value + "T00:00:00")); setPeriod(""); }}
              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white"
              data-testid="to-date"
            />
          </div>

          {/* Day-mode prev/next arrows */}
          {period === "day" && (
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

          {/* Add Event */}
          <Button size="sm" className="h-8 gap-1" onClick={() => setShowAddEvent(true)} data-testid="add-event-btn">
            <Plus className="w-3.5 h-3.5" /> Add Log
          </Button>
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
              detail={kpis.shift_hours || ""}
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
                <ComposedChart data={combinedSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#94a3b8" domain={['auto', 'auto']} label={{ value: "MU", position: "insideTopLeft", offset: -5, fontSize: 11 }} />
                  {(chartSeries.rpm || chartSeries.feed || chartSeries.mt4 || chartSeries.temperature) && (
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  )}
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="viscosity" name="Viscosity (MU)" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4, fill: "#8b5cf6" }} connectNulls />
                  {chartSeries.rpm && <Line yAxisId="right" type="monotone" dataKey="rpm" name="RPM" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
                  {chartSeries.feed && <Line yAxisId="right" type="monotone" dataKey="feed" name="Feed (kg)" stroke="#f97316" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
                  {chartSeries.mt4 && <Line yAxisId="right" type="monotone" dataKey="mt4" name="MT4" stroke="#14b8a6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
                  {chartSeries.temperature && <Line yAxisId="right" type="monotone" dataKey="temperature" name="Temperature (MT1)" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
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
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowAddEvent(true)} data-testid="waste-add-btn">
                  <Plus className="w-3 h-3" /> Add
                </Button>
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

            {/* Actions */}
            <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="actions-panel">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Actions</h3>
                {data?.actions?.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{data.actions.length}</Badge>
                )}
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {data?.actions?.length > 0 ? (
                  data.actions.map((ev) => <EventCard key={ev.id} event={ev} />)
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No actions recorded</p>
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
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="production-log-table">
                <thead>
                  <tr className="border-b border-slate-200">
                    {["Time", "RPM", "Feed (kg)", "Viscosity", "Energy", "MT1", "MT2", "MT3", "MT4", "CO2", "Waste", "By"].map((h) => (
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
                      return (
                        <tr
                          key={`${entry.time}-${i}`}
                          className={`border-b border-slate-50 ${anomaly ? "bg-amber-50" : "hover:bg-slate-50"}`}
                          data-testid={`log-row-${entry.time}`}
                        >
                          <td className="py-2 px-2 font-medium text-slate-700 tabular-nums">{entry.time}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.rpm}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.feed}</td>
                          <td className="py-2 px-2 tabular-nums">
                            {data?.viscosity_values?.[i] !== undefined
                              ? data.viscosity_values[i]
                              : "-"}
                          </td>
                          <td className="py-2 px-2 tabular-nums">{entry.energy}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mt1}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mt2}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mt3}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.mt4}</td>
                          <td className="py-2 px-2 tabular-nums">{entry.co2_feeds}</td>
                          <td className="py-2 px-2 tabular-nums">
                            {anomaly ? (
                              <span className="text-red-600 font-semibold">{entry.waste}</span>
                            ) : (
                              entry.waste
                            )}
                          </td>
                          <td className="py-2 px-2 text-slate-500 text-xs truncate max-w-[80px]">{entry.submitted_by}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-slate-400 text-sm">
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
                  <span>Screen changes: {data?.screen_changes || 0}</span>
                  <span className="text-slate-300">|</span>
                  <span>Magnet cleanings: {data?.magnet_cleanings || 0}</span>
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
    </div>
  );
}
