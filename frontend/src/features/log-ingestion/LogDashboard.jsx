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
import MergedViscosityChart from "./MergedViscosityChart";

export default function LogDashboard() {
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

  // Date navigation
  const [availableDates, setAvailableDates] = useState([]); // sorted desc
  const [selectedDate, setSelectedDate] = useState(""); // YYYY-MM-DD

  const fetchAssets = useCallback(async () => {
    try {
      const data = await productionLogsAPI.listAssets();
      setAssets(data.assets || []);
      if (data.assets?.length && !selectedAsset) setSelectedAsset(data.assets[0].asset_id);
    } catch {}
  }, [selectedAsset]);

  // Fetch available dates for the selected asset
  const fetchDates = useCallback(async () => {
    if (!selectedAsset) return;
    try {
      const data = await productionLogsAPI.getAvailableDates(selectedAsset);
      const dates = data.dates || [];
      setAvailableDates(dates);
      if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
    } catch {}
  }, [selectedAsset, selectedDate]);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await productionLogsAPI.getStats());
    } catch {}
  }, []);

  const fetchTimeseries = useCallback(async () => {
    if (!selectedAsset) return;
    try {
      setTimeseries(await productionLogsAPI.getTimeseries(selectedAsset));
    } catch {}
  }, [selectedAsset]);

  const fetchEntries = useCallback(async () => {
    if (!selectedAsset || !selectedDate) return;
    setLoadingEntries(true);
    try {
      const startTs = `${selectedDate}T00:00:00`;
      const endTs = `${selectedDate}T23:59:59`;
      const data = await productionLogsAPI.getEntries({ assetId: selectedAsset, start: startTs, end: endTs, limit: 100 });
      setEntries(data.entries || []);
    } catch {} finally { setLoadingEntries(false); }
  }, [selectedAsset, selectedDate]);

  useEffect(() => { fetchAssets(); fetchStats(); }, [fetchAssets, fetchStats]);
  useEffect(() => { if (selectedAsset) { fetchDates(); fetchTimeseries(); } }, [selectedAsset, fetchDates, fetchTimeseries]);
  useEffect(() => { if (selectedAsset && selectedDate) { fetchEntries(); } }, [selectedAsset, selectedDate, fetchEntries]);
  useEffect(() => { setLoading(false); }, []);

  // Reset date when asset changes
  useEffect(() => { setSelectedDate(""); }, [selectedAsset]);

  // Date navigation helpers
  const currentDateIndex = availableDates.indexOf(selectedDate);
  const hasPrevDay = currentDateIndex >= 0 && currentDateIndex < availableDates.length - 1;
  const hasNextDay = currentDateIndex > 0;
  const prevDay = () => { if (hasPrevDay) setSelectedDate(availableDates[currentDateIndex + 1]); };
  const nextDay = () => { if (hasNextDay) setSelectedDate(availableDates[currentDateIndex - 1]); };

  const displayDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const runAggregation = async () => {
    setAggregating(true);
    try {
      await productionLogsAPI.aggregate();
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
      {/* Controls — Day Navigation matching Production Dashboard */}
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

          {/* Day navigation arrows */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={prevDay} disabled={!hasPrevDay} data-testid="prev-day">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={nextDay} disabled={!hasNextDay} data-testid="next-day">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Date picker */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setSelectedDate(v);
            }}
            className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white"
            data-testid="date-picker"
          />

          {/* Display date label */}
          {selectedDate && (
            <span className="text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 h-9 flex items-center tabular-nums whitespace-nowrap gap-2" data-testid="date-display">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {displayDate(selectedDate)}
              {entries.length > 0 && (() => {
                const startTime = entries[0]?.production_start_time || '';
                const stopTime = entries[0]?.production_stop_time || '';
                const shift = startTime && stopTime ? `${startTime.slice(0,5)} – ${stopTime.slice(0,5)}` : '';
                return shift ? <span className="text-xs text-slate-400 ml-1">({shift})</span> : null;
              })()}
            </span>
          )}

          {loadingEntries && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
        </div>
        <Button variant="outline" size="sm" onClick={runAggregation} disabled={aggregating} data-testid="run-aggregation-btn">
          {aggregating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
          {aggregating ? "Aggregating..." : "Rebuild Aggregations"}
        </Button>
      </div>

      {/* KPI Cards — matching Production Dashboard */}
      {entries.length > 0 && (() => {
        // Total Input = sum of FEED values (FEED is kg/h rate, each entry ~ 1 hour interval)
        const feedValues = entries.map(e => parseFloat(e.metrics?.['FEED'])).filter(v => !isNaN(v));
        const totalInput = feedValues.reduce((s, v) => s + v, 0);

        // Waste is a per-day value from the header, take from first entry that has it
        const wasteEntry = entries.find(e => e.total_waste && parseFloat(e.total_waste) > 0);
        const wasteVal = wasteEntry ? parseFloat(wasteEntry.total_waste) : 0;
        const wastePct = totalInput > 0 ? ((wasteVal / totalInput) * 100).toFixed(1) : '0';
        const yieldPct = totalInput > 0 ? (((totalInput - wasteVal) / totalInput) * 100).toFixed(1) : '0';

        // Viscosity stats
        const viscValues = entries.map(e => parseFloat(e.mooney_viscosity)).filter(v => !isNaN(v));
        const avgVisc = viscValues.length > 0 ? (viscValues.reduce((s, v) => s + v, 0) / viscValues.length).toFixed(1) : '0';
        const minVisc = viscValues.length > 0 ? Math.min(...viscValues).toFixed(1) : '0';
        const maxVisc = viscValues.length > 0 ? Math.max(...viscValues).toFixed(1) : '0';
        const mean = viscValues.length > 0 ? viscValues.reduce((s, v) => s + v, 0) / viscValues.length : 0;
        const stdDev = viscValues.length > 1 ? Math.sqrt(viscValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (viscValues.length - 1)) : 0;
        const rsd = mean > 0 ? ((stdDev / mean) * 100).toFixed(1) : '0';

        // Runtime = difference between first and last actual data timestamp
        const timestamps = entries.map(e => e.timestamp).filter(Boolean).sort();
        let runtimeHours = '0';
        if (timestamps.length >= 2) {
          const t1 = new Date(timestamps[0]);
          const t2 = new Date(timestamps[timestamps.length - 1]);
          runtimeHours = ((t2 - t1) / 3600000).toFixed(1);
        } else if (timestamps.length === 1) {
          runtimeHours = '0';
        }
        const lotInfo = entries[0]?.lot_no ? `Lot: ${entries[0].lot_no}` : '';

        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="kpi-grid">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 min-w-0" data-testid="kpi-total-input">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600"><Package className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Throughput</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{totalInput.toLocaleString()}</span>
                <span className="text-sm text-slate-500">kg</span>
              </div>
              {lotInfo && <p className="text-xs text-slate-500 truncate">{lotInfo}</p>}
              <p className="text-xs text-slate-400 truncate">{entries.length} samples</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 min-w-0" data-testid="kpi-waste">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Waste</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{wasteVal.toLocaleString()}</span>
                <span className="text-sm text-slate-500">kg</span>
              </div>
              <p className="text-xs text-slate-500 truncate">{wastePct}% of input</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 min-w-0" data-testid="kpi-yield">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Yield</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{yieldPct}</span>
                <span className="text-sm text-slate-500">%</span>
              </div>
              <p className="text-xs text-slate-500 truncate">Target: 92%</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 min-w-0" data-testid="kpi-avg-mooney">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-50 text-purple-600"><FlaskConical className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avg Mooney</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{avgVisc}</span>
                <span className="text-sm text-slate-500">MU</span>
              </div>
              <p className="text-xs text-slate-500 truncate">Range: {minVisc}–{maxVisc}</p>
              <p className="text-xs text-slate-400 truncate">{viscValues.length} samples</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 min-w-0" data-testid="kpi-rsd">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600"><Sigma className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">RSD</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{rsd}</span>
                <span className="text-sm text-slate-500">%</span>
              </div>
              <p className="text-xs text-slate-500 truncate">Target: &lt; 7</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 min-w-0" data-testid="kpi-runtime">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600"><Clock className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Runtime</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{runtimeHours}</span>
                <span className="text-sm text-slate-500">hours</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Merged Mooney Viscosity + Metrics Chart — matching Production Dashboard */}
      {entries.length > 0 ? (
        <>
          <MergedViscosityChart entries={entries} selectedAsset={selectedAsset} />

          {/* Input Material card — separate from production log, matching Production Dashboard */}
          {(() => {
            const materials = entries.filter(e => e.input_material || e.supplier || e.lot_no);
            return materials.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="input-material-panel">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">Input Material</h3>
                  <Badge variant="secondary" className="text-xs">{materials.length}</Badge>
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Material</th>
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Supplier</th>
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Bag No.</th>
                        <th className="text-left py-1.5 px-1 font-semibold text-slate-500 uppercase tracking-wider">Lot No.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((e, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-1.5 px-1 text-slate-700">{e.input_material || "—"}</td>
                          <td className="py-1.5 px-1 text-slate-700">{e.supplier || "—"}</td>
                          <td className="py-1.5 px-1 text-slate-700 tabular-nums">{e.bag_no || "—"}</td>
                          <td className="py-1.5 px-1 text-slate-700">{e.lot_no || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null;
          })()}

          {/* Production Log table — matching Production Dashboard format */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  Production Log — {selectedAsset}
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
                    <table className="w-full text-sm" data-testid="production-log-table">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {["#", "Time", "RPM", "Feed", "M%", "Energy", "MT1", "MT2", "MT3", "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR", "Viscosity", "Remarks"].map((h) => (
                            <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2 px-2 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e, i) => {
                          const m = e.metrics || {};
                          const formatVal = (val) => {
                            if (val === null || val === undefined || val === '' || val === '-') return <span className="text-slate-300">—</span>;
                            if (typeof val === 'number') return val.toFixed(val % 1 === 0 ? 0 : 2);
                            return val;
                          };
                          const formatPercent = (val) => {
                            if (val === null || val === undefined || val === '') return <span className="text-slate-300">—</span>;
                            if (typeof val === 'number') return val < 1 ? (val * 100).toFixed(1) : val.toFixed(1);
                            const num = parseFloat(val);
                            if (!isNaN(num)) return num < 1 ? (num * 100).toFixed(1) : num.toFixed(1);
                            return val;
                          };
                          const time = new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                          return (
                            <tr key={e.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="py-2 px-2 text-slate-400 text-xs tabular-nums">{i + 1}</td>
                              <td className="py-2 px-2 font-medium text-slate-700 tabular-nums">{time}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['RPM'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['FEED'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatPercent(m['M%'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['ENERGY'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['MT1'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['MT2'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['MT3'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['MP1'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['MP2'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['MP3'])}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['MP4'])}</td>
                              <td className="py-2 px-2 tabular-nums">{m['CO2 Feed/P'] || <span className="text-slate-300">—</span>}</td>
                              <td className="py-2 px-2 tabular-nums">{formatVal(m['T Product IR'])}</td>
                              <td className="py-2 px-2 tabular-nums">{e.mooney_viscosity ? e.mooney_viscosity : <span className="text-amber-500 font-medium">TBD</span>}</td>
                              <td className="py-2 px-2 text-slate-500 text-xs truncate max-w-[120px]" title={e.status || ""}>{e.status || ""}</td>
                            </tr>
                          );
                        })}
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

