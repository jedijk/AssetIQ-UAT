/**
 * Executive Dashboard - Reliability Value Management
 * Provides executives with visibility into production value exposure and reliability controls.
 */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { queryKeys } from "../../lib/queryKeys";
import { useLanguage } from "../../contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Activity,
  Sparkles,
  ChevronRight,
  X,
  ExternalLink,
  Loader2,
  Info,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../components/ui/hover-card";

// Fetch executive dashboard data
const fetchExecutiveDashboard = async () => {
  const response = await api.get("/executive-dashboard");
  return response.data;
};

// Trend indicator component
const TrendIndicator = ({ trend, changePercent }) => {
  if (!trend || trend === "stable") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Minus className="w-3 h-3" />
        <span>Stable</span>
      </span>
    );
  }

  if (trend === "improving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <TrendingUp className="w-3 h-3" />
        <span>{changePercent > 0 ? "+" : ""}{changePercent?.toFixed(1)}%</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600">
      <TrendingDown className="w-3 h-3" />
      <span>{changePercent > 0 ? "+" : ""}{changePercent?.toFixed(1)}%</span>
    </span>
  );
};

// KPI Card component
const KPICard = ({ title, kpi, icon: Icon, colorClass, onClick }) => {
  if (!kpi) return null;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`relative bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-lg transition-all ${colorClass}`}
          onClick={onClick}
        >
          <div className="flex items-start justify-between mb-2">
            <div className={`p-2 rounded-lg ${colorClass.replace("border-l-4", "bg-opacity-10")}`}>
              <Icon className={`w-5 h-5 ${colorClass.includes("green") ? "text-green-600" : colorClass.includes("red") ? "text-red-600" : colorClass.includes("orange") ? "text-orange-600" : colorClass.includes("blue") ? "text-blue-600" : "text-slate-600"}`} />
            </div>
            <TrendIndicator trend={kpi.trend} changePercent={kpi.change_percent} />
          </div>
          
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {kpi.formatted_value}
          </div>
          
          <div className="text-sm text-slate-600 font-medium">{title}</div>
          
          {kpi.evidence_count > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
              <span>{kpi.evidence_count} evidence items</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          )}
        </motion.div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{kpi.tooltip}</p>
          {kpi.total_submitted_count != null && (
            <>
              <p className="text-xs text-slate-500">
                Total submitted tasks/forms: {Number(kpi.total_submitted_count).toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">
                This week: {Number(kpi.week_submitted_count ?? kpi.value).toLocaleString()}
              </p>
            </>
          )}
          {kpi.total_submitted_count == null && kpi.previous_value !== null && (
            <p className="text-xs text-slate-500">
              Previous period: {kpi.formatted_value.includes('%')
                ? (typeof kpi.previous_value === 'number' && kpi.previous_value > 1000
                  ? kpi.formatted_value.replace(/[\d.,]+/, kpi.previous_value.toLocaleString())
                  : `${kpi.previous_value?.toFixed?.(1) ?? kpi.previous_value}%`)
                : Number(kpi.previous_value).toLocaleString()}
            </p>
          )}
          {kpi.total_submitted_count != null && kpi.previous_value != null && (
            <p className="text-xs text-slate-500">
              Last week: {Number(kpi.previous_value).toLocaleString()}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

// Waterfall Chart component
const formatWaterfallCount = (count, unit) => {
  const n = Number(count) || 0;
  if (unit === "observations") {
    return `${n} observation${n === 1 ? "" : "s"}`;
  }
  return `${n} equipment item${n === 1 ? "" : "s"}`;
};

const WaterfallTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
      <p className="text-sm text-slate-700 mt-0.5">{item.formatted}</p>
      <p className="text-xs text-slate-500 mt-1">
        {formatWaterfallCount(item.count, item.count_unit)}
      </p>
    </div>
  );
};

const WaterfallChart = ({ data, currencySymbol }) => {
  if (!data || data.length === 0) return null;

  // Transform data for waterfall visualization
  const waterfallData = data.map((item, index) => {
    let start = 0;
    let end = item.value;
    
    if (index === 0) {
      // Total - full bar
      start = 0;
      end = item.value;
    } else if (index === 1) {
      // Covered - starts at 0, shows covered amount
      start = 0;
      end = item.value;
    } else if (index === 2) {
      // Uncovered - starts after covered
      start = data[1].value;
      end = start + item.value;
    } else {
      // Overlays - use actual values
      start = 0;
      end = item.value;
    }

    return {
      ...item,
      start,
      end,
      displayValue: item.value,
    };
  });

  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={waterfallData}
          layout="vertical"
          margin={{ top: 20, right: 80, left: 20, bottom: 20 }}
        >
          <XAxis
            type="number"
            domain={[0, maxValue * 1.1]}
            tickFormatter={(value) => {
              if (value >= 1e9) return `${currencySymbol}${(value / 1e9).toFixed(1)}B`;
              if (value >= 1e6) return `${currencySymbol}${(value / 1e6).toFixed(1)}M`;
              if (value >= 1e3) return `${currencySymbol}${(value / 1e3).toFixed(0)}K`;
              return `${currencySymbol}${value}`;
            }}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#334155", fontSize: 13, fontWeight: 500 }}
          />
          <Tooltip content={<WaterfallTooltip />} />
          <Bar dataKey="displayValue" radius={[0, 4, 4, 0]}>
            {waterfallData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="formatted"
              position="right"
              fill="#334155"
              fontSize={12}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Evidence Panel component
const EvidencePanel = ({ isOpen, onClose, title, evidence, metricType }) => {
  if (!evidence) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4 space-y-3">
          {evidence.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No evidence items found</p>
          ) : (
            evidence.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-slate-50 rounded-lg p-4 border border-slate-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">{item.asset}</div>
                    {item.tag && (
                      <div className="text-xs text-slate-500 font-mono">{item.tag}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900">
                      {item.exposure_formatted}
                    </div>
                    {item.observation_count > 0 && (
                      <Badge variant="secondary" className="mt-1">
                        {item.observation_count} observations
                      </Badge>
                    )}
                  </div>
                </div>
                
                {item.control_status && (
                  <div className="mt-2">
                    <Badge variant="destructive">{item.control_status}</Badge>
                  </div>
                )}
                
                {item.observations && item.observations.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-xs font-medium text-slate-600">Related Observations:</div>
                    {item.observations.map((obs, obsIdx) => (
                      <div key={obsIdx} className="flex items-center gap-2 text-sm text-slate-700 pl-2">
                        <span className={`w-2 h-2 rounded-full ${
                          obs.risk_level === "Critical" ? "bg-red-500" :
                          obs.risk_level === "High" ? "bg-orange-500" :
                          "bg-yellow-500"
                        }`} />
                        <span className="truncate">{obs.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Main Executive Dashboard component
export default function ExecutiveDashboard() {
  const { t } = useLanguage();
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["executive-dashboard"],
    queryFn: fetchExecutiveDashboard,
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <AlertTriangle className="w-12 h-12 mb-4 text-red-400" />
        <p>Failed to load executive dashboard</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  const { exposure_metrics, kpi_cards, waterfall_data, ai_summary, evidence_drill_down } = data;
  const currencySymbol = exposure_metrics?.currency_symbol || "€";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Reliability Value Management
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Executive overview of production value exposure and reliability controls
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Updated {new Date(data.last_updated).toLocaleTimeString()}
        </Badge>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Exposure Coverage"
          kpi={kpi_cards?.exposure_coverage}
          icon={Shield}
          colorClass="border-l-4 border-l-green-500"
        />
        <KPICard
          title="Active Threat Exposure"
          kpi={kpi_cards?.active_threat_exposure}
          icon={AlertTriangle}
          colorClass="border-l-4 border-l-orange-500"
          onClick={() => setSelectedEvidence({
            type: "active_threat_exposure",
            title: "Active Threat Exposure Evidence",
            data: evidence_drill_down?.active_threat_exposure || []
          })}
        />
        <KPICard
          title="Critical Active Exposure"
          kpi={kpi_cards?.critical_active_exposure}
          icon={AlertOctagon}
          colorClass="border-l-4 border-l-red-500"
          onClick={() => setSelectedEvidence({
            type: "critical_active_exposure",
            title: "Critical Active Exposure Evidence",
            data: evidence_drill_down?.critical_active_exposure || []
          })}
        />
        <KPICard
          title="PM Compliance"
          kpi={kpi_cards?.pm_compliance}
          icon={CheckCircle2}
          colorClass="border-l-4 border-l-blue-500"
        />
        <KPICard
          title="Digital Execution"
          kpi={kpi_cards?.digital_execution_rate}
          icon={Activity}
          colorClass="border-l-4 border-l-purple-500"
        />
      </div>

      {/* Waterfall Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span>Exposure Waterfall</span>
          <HoverCard>
            <HoverCardTrigger>
              <Info className="w-4 h-4 text-slate-400 cursor-help" />
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <p className="text-sm text-slate-600">
                Shows the flow from total assessed exposure to actively managed and unmanaged exposure.
                Uncovered exposure is assessed production impact for equipment without a maintenance program.
              </p>
            </HoverCardContent>
          </HoverCard>
        </h3>
        <WaterfallChart data={waterfall_data} currencySymbol={currencySymbol} />
        
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 justify-center">
          {waterfall_data?.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-600">{item.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Executive Summary */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Executive Summary
            </h3>
            <p className="text-slate-700 leading-relaxed whitespace-pre-line">
              {ai_summary}
            </p>
          </div>
        </div>
      </div>

      {/* Evidence Panel */}
      <EvidencePanel
        isOpen={!!selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
        title={selectedEvidence?.title}
        evidence={selectedEvidence?.data}
        metricType={selectedEvidence?.type}
      />
    </div>
  );
}
