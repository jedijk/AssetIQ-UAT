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

export default function MergedViscosityChart({ entries, selectedAsset }) {
  const [activeSeries, setActiveSeries] = useState({ rpm: false, feed: false, mp4: false, t_product_ir: false, magnetCleaning: false });

  const chartData = useMemo(() => {
    return entries
      .slice()
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
      .map(e => {
        const m = e.metrics || {};
        const time = new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const visc = e.mooney_viscosity ? parseFloat(e.mooney_viscosity) : null;
        const hasMagnet = e.clean_magnet_status === 'DONE';
        return {
          time,
          viscosity: visc,
          rpm: typeof m['RPM'] === 'number' ? m['RPM'] : (parseFloat(m['RPM']) || null),
          feed: typeof m['FEED'] === 'number' ? m['FEED'] : (parseFloat(m['FEED']) || null),
          mp4: typeof m['MP4'] === 'number' ? m['MP4'] : (parseFloat(m['MP4']) || null),
          t_product_ir: typeof m['T Product IR'] === 'number' ? m['T Product IR'] : (parseFloat(m['T Product IR']) || null),
          magnetCleaning: hasMagnet ? visc : null,
        };
      });
  }, [entries]);

  const hasRightAxis = activeSeries.rpm || activeSeries.feed || activeSeries.mp4 || activeSeries.t_product_ir;

  const viscValues = chartData.map(d => d.viscosity).filter(v => v != null);
  const avgVisc = viscValues.length > 0 ? (viscValues.reduce((s, v) => s + v, 0) / viscValues.length).toFixed(1) : '0';

  if (chartData.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="viscosity-chart">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Mooney Viscosity</h3>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap" data-testid="chart-toggles">
          {CHART_SERIES.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSeries(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border transition-colors ${
                activeSeries[s.key]
                  ? "border-transparent text-white"
                  : "border-slate-200 text-slate-500 bg-white hover:bg-slate-50"
              }`}
              style={activeSeries[s.key] ? { backgroundColor: s.color } : undefined}
              data-testid={`toggle-${s.key}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeSeries[s.key] ? "#fff" : s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <ReferenceArea yAxisId="left" y1={50} y2={60} fill="#22c55e" fillOpacity={0.1} />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
          <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[48, 62]} label={{ value: "MU", position: "insideTopLeft", offset: -5, fontSize: 10 }} />
          {hasRightAxis && (
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
          )}
          <Tooltip
            content={({ active, payload, label }) => {
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
                  {d.magnetCleaning != null && (
                    <div className="flex items-center gap-2 mt-1"><span className="w-2 h-2 rounded-full bg-[#ec4899]" /><span className="text-ec4899 font-medium">Magnet Cleaned</span></div>
                  )}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line yAxisId="left" type="monotone" dataKey="viscosity" name="Viscosity (MU)" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4, fill: "#8b5cf6" }} connectNulls activeDot={{ r: 6, stroke: "#7c3aed", strokeWidth: 2, fill: "#fff" }} />
          {activeSeries.rpm && <Line yAxisId="right" type="monotone" dataKey="rpm" name="RPM" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
          {activeSeries.feed && <Line yAxisId="right" type="monotone" dataKey="feed" name="Feed (kg)" stroke="#f97316" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
          {activeSeries.mp4 && <Line yAxisId="right" type="monotone" dataKey="mp4" name="MP4" stroke="#14b8a6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
          {activeSeries.t_product_ir && <Line yAxisId="right" type="monotone" dataKey="t_product_ir" name="T Product IR" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />}
          {activeSeries.magnetCleaning && <Line yAxisId="left" type="monotone" dataKey="magnetCleaning" name="Magnet Cleaning" stroke="#ec4899" strokeWidth={0} dot={{ r: 6, fill: "#ec4899", strokeWidth: 2, stroke: "#fff" }} connectNulls={false} legendType="diamond" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}


// ======================== Dashboard Component ========================
