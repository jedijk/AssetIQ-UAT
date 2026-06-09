/**
 * ObservationWorkspacePage - Reliability Intelligence Workspace
 * 
 * A redesigned observation detail page that tells the story:
 * Asset History → Reliability Intelligence → Exposure → Recommended Actions → Action Plan → ALARP → Learning
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  DollarSign,
  Users,
  Leaf,
  Target,
  Brain,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Plus,
  Eye,
  List,
  Calendar,
  Activity,
  Wrench,
  FileSearch,
  Shield,
  Star,
  Cog,
  Sparkles,
  TrendingUp,
  BarChart3,
  Lightbulb,
  ClipboardList,
  Check,
  X,
  ExternalLink,
  History,
  Zap,
  CircleDot,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { observationWorkspaceAPI, actionsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import RiskBadge from "../components/RiskBadge";
import ObservationDetailsSection from "../components/workspace/ObservationDetailsSection";
import AIInsightsPanel from "../components/AIInsightsPanel";
import CausalIntelligencePanel from "../components/CausalIntelligencePanel";

const interpolate = (template, vars = {}) => {
  if (!template || typeof template !== "string") return template;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? "")),
    template
  );
};

const useTranslateEnum = () => {
  const { t } = useLanguage();
  return (value) => {
    if (!value) return value;
    const key = `enums.${value}`;
    const out = t(key);
    return out && out !== key ? out : value;
  };
};

const DIMENSION_LABEL_KEYS = {
  production: "observations.production",
  safety: "observations.safety",
  environmental: "observations.environment",
  reputation: "observations.reputation",
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Exposure Card - Shows production, safety, environmental exposure
 */
const ExposureCard = ({ type, data, icon: Icon, color, dimension, score, criticalityDefs }) => {
  const { t } = useLanguage();
  const translateEnum = useTranslateEnum();
  const [popup, setPopup] = useState({ show: false, x: 0, y: 0 });
  const popupRef = useRef(null);

  useEffect(() => {
    if (!popup.show) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopup({ show: false, x: 0, y: 0 });
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popup.show]);

  const colorClasses = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    green: "bg-green-50 border-green-200 text-green-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };

  // The field name on each criticality definition row that holds this dimension's description.
  const fieldByDim = { safety: "safety", production: "production", environmental: "environment", reputation: "reputation" };
  const field = fieldByDim[dimension];

  // Sorted list of all 5 rank rows for the popover.
  const scaleRows = (criticalityDefs || [])
    .slice()
    .sort((a, b) => (a.rank || 0) - (b.rank || 0))
    .filter((d) => field && d[field]);

  const isNotAssessed = data?.not_assessed === true || (dimension && (score === null || score === undefined || score === 0));

  return (
    <>
      <div
        className={`rounded-xl border px-3 py-2 ${dimension ? "cursor-context-menu" : ""} ${isNotAssessed ? "bg-slate-50 border-slate-200 text-slate-500" : colorClasses[color]}`}
        onContextMenu={dimension ? (e) => {
          e.preventDefault();
          setPopup({ show: true, x: e.clientX, y: e.clientY });
        } : undefined}
        title={dimension ? t("observationWorkspace.criticalityRightClick") : undefined}
        data-testid={dimension ? `exposure-card-${dimension}` : undefined}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon className="w-3.5 h-3.5" />
          <span className="text-[10px] font-medium uppercase tracking-wide">{type}</span>
        </div>
        {isNotAssessed ? (
          <div className="text-sm font-semibold leading-tight italic">{t("observationWorkspace.notAssessed")}</div>
        ) : (
          <>
            {data.primary && (
              <div className="text-lg font-bold leading-tight">{data.primary}</div>
            )}
            {data.secondary && (
              <div className="text-[11px] opacity-80 leading-tight">{data.secondary}</div>
            )}
            {data.tertiary && (
              <div className="text-[11px] opacity-70 leading-tight">{data.tertiary}</div>
            )}
          </>
        )}
      </div>

      {/* Criticality definition popover (right-click) — only shows the current rank's definition */}
      {popup.show && (() => {
        const currentRow = scaleRows.find((d) => d.rank === score);
        return (
          <div
            ref={popupRef}
            className="fixed z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl"
            style={{
              left: Math.min(Math.max(popup.x, 16), window.innerWidth - 336),
              top: Math.min(Math.max(popup.y, 16), window.innerHeight - 100),
            }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <h3 className="font-semibold text-sm text-slate-800 capitalize">
                {interpolate(t("observationWorkspace.criticalityTitle"), {
                  dimension: t(DIMENSION_LABEL_KEYS[dimension] || dimension),
                })}
              </h3>
              <button onClick={() => setPopup({ show: false, x: 0, y: 0 })} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-3">
              {currentRow ? (
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                    {currentRow.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">
                      {currentRow.label || interpolate(t("observationWorkspace.levelN"), { rank: currentRow.rank })}
                    </div>
                    <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap mt-1">{currentRow[field]}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="text-sm text-slate-500 italic">{t("observationWorkspace.notAssessed")}</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
};

/**
 * ALARP Progress Card
 */
const ALARPCard = ({ alarp }) => {
  const { t } = useLanguage();
  const translateEnum = useTranslateEnum();
  const percentage = alarp?.percentage || 0;
  const status = translateEnum(alarp?.status || "Not Started");
  
  const getStatusColor = () => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 70) return "text-blue-600";
    if (percentage >= 40) return "text-amber-600";
    return "text-slate-500";
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-indigo-600" />
          <span className="text-[10px] font-medium text-indigo-700 uppercase tracking-wide">{t("observationWorkspace.mitigated")}</span>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor()}`}>
          {status}
        </Badge>
      </div>
      <div className="text-lg font-bold text-indigo-700 leading-tight mb-1">{percentage}%</div>
      <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Risk Summary Card
 */
const RiskSummaryCard = ({ riskSummary }) => {
  const { t } = useLanguage();
  const translateEnum = useTranslateEnum();
  const riskScore = riskSummary?.risk_score || 0;
  const rawRiskLevel = riskSummary?.risk_level || "Low";
  const riskLevel = translateEnum(rawRiskLevel);
  const rpn = riskSummary?.rpn;

  const getRiskColor = () => {
    if (rawRiskLevel === "Critical") return "border-red-300 bg-red-50";
    if (rawRiskLevel === "High") return "border-orange-300 bg-orange-50";
    if (rawRiskLevel === "Medium") return "border-yellow-300 bg-yellow-50";
    return "border-green-300 bg-green-50";
  };

  return (
    <div
      className={`rounded-xl border px-3 py-2 cursor-context-menu ${getRiskColor()}`}
      onContextMenu={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workspace:show-score-calc", {
          detail: { x: e.clientX, y: e.clientY },
        }));
      }}
      title={t("observationWorkspace.riskRightClick")}
      data-testid="kpi-risk-card"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">{t("observationWorkspace.risk")}</span>
      </div>
      <div className="flex items-baseline gap-2 leading-tight">
        <span className="text-lg font-bold">{riskScore}</span>
        <RiskBadge level={riskLevel} size="sm" />
      </div>
      {rpn && (
        <div className="text-[11px] mt-0.5 opacity-70 leading-tight">RPN: {rpn}</div>
      )}
    </div>
  );
};

/**
 * Timeline Event Card
 */
const TimelineEventCard = ({ event, isCurrent }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const translateEnum = useTranslateEnum();
  
  const getEventConfig = (type) => {
    const configs = {
      observation: { icon: AlertTriangle, color: "amber", labelKey: "enums.Observation" },
      failure: { icon: XCircle, color: "red", labelKey: "enums.Failure" },
      work_order: { icon: Wrench, color: "blue", labelKey: "enums.Work Order" },
      inspection: { icon: Eye, color: "green", labelKey: "enums.Inspection" },
      repair: { icon: Wrench, color: "purple", labelKey: "enums.Repair" },
      investigation: { icon: FileSearch, color: "indigo", labelKey: "enums.Investigation" },
      strategy_change: { icon: Cog, color: "slate", labelKey: "enums.Strategy Change" },
    };
    const cfg = configs[type] || configs.observation;
    return { ...cfg, label: t(cfg.labelKey) };
  };

  const config = getEventConfig(event.event_type);
  const Icon = config.icon;
  
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return format(parseISO(dateStr), "MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  const handleClick = () => {
    if (event.event_type === "observation" && event.id) {
      navigate(`/threats/${event.id}`);
    } else if (event.event_type === "investigation" && event.id) {
      navigate(`/causal-engine?id=${event.id}`);
    }
  };

  // Compose a full tooltip showing all available context for the event.
  const tooltipParts = [];
  if (event.title) tooltipParts.push(event.title);
  if (event.date) {
    try { tooltipParts.push(format(parseISO(event.date), "PPP")); } catch (_) { tooltipParts.push(event.date); }
  }
  if (config.label) tooltipParts.push(config.label);
  if (event.reference_id) tooltipParts.push(event.reference_id);
  if (event.status) tooltipParts.push(interpolate(t("observationWorkspace.statusLabel"), { status: translateEnum(event.status) }));
  if (event.description) tooltipParts.push(event.description);
  const tooltip = tooltipParts.join("\n");

  return (
    <div 
      className="flex flex-col items-center cursor-pointer group flex-shrink-0 w-32"
      onClick={handleClick}
      title={tooltip}
    >
      {/* Date */}
      <div className="text-[11px] text-slate-500 mb-2 font-medium h-4 leading-4">
        {formatDate(event.date)}
      </div>
      
      {/* Event Circle — sits above the connector line; bg-white outer ring punches through the rail */}
      <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ring-2 ring-white ${
        isCurrent 
          ? "bg-blue-600 text-white shadow-md shadow-blue-200"
          : `bg-${config.color}-100 text-${config.color}-600`
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      
      {/* Event Title */}
      <div className={`text-[11px] font-medium mt-2 text-center max-w-[120px] truncate leading-tight ${
        isCurrent ? "text-blue-700 font-semibold" : "text-slate-700"
      }`}>
        {event.title?.substring(0, 25) || config.label}
      </div>
      
      {/* Reference ID */}
      {event.reference_id && (
        <div className="text-[10px] text-slate-400 mt-0.5 leading-none">
          {event.reference_id}
        </div>
      )}
    </div>
  );
};

/**
 * Equipment Reliability Timeline
 */
const EquipmentReliabilityTimeline = ({ events, aiEvidence }) => {
  const [viewMode, setViewMode] = useState("timeline");
  const navigate = useNavigate();
  const { t } = useLanguage();
  const translateEnum = useTranslateEnum();

  // Find current event
  const currentEvent = events?.find(e => e.is_current);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <History className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{t("observationWorkspace.equipmentHistory")}</h3>
            <p className="text-xs text-slate-500">{t("observationWorkspace.equipmentHistorySubtitle")}</p>
          </div>
        </div>
        
        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "timeline" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("timeline")}
            className="h-8"
          >
            <Calendar className="w-4 h-4 mr-1" />
            {t("observationWorkspace.timeline")}
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="h-8"
          >
            <List className="w-4 h-4 mr-1" />
            {t("observationWorkspace.list")}
          </Button>
        </div>
      </div>

      {/* Timeline View */}
      {viewMode === "timeline" && events && events.length > 0 ? (
        <div className="relative px-2">
          {/* Horizontal connector — aligned with the centre of the event circles.
              Position math: date row (16px text + mb-2 = 8px) + half of circle (40/2 = 20px) = 44px. */}
          <div className="pointer-events-none absolute left-0 right-0 h-px bg-slate-200" style={{ top: "44px" }} />
          
          {/* Events */}
          <div className="flex items-start overflow-x-auto pb-2 gap-4 scrollbar-thin scrollbar-thumb-slate-300">
            {events.slice(0, 10).map((event, index) => (
              <TimelineEventCard 
                key={event.id || index}
                event={event} 
                isCurrent={event.is_current}
              />
            ))}
          </div>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {events?.map((event, index) => {
            const config = {
              observation: { icon: AlertTriangle, color: "amber" },
              failure: { icon: XCircle, color: "red" },
              work_order: { icon: Wrench, color: "blue" },
              inspection: { icon: Eye, color: "green" },
              repair: { icon: Wrench, color: "purple" },
              investigation: { icon: FileSearch, color: "indigo" },
            }[event.event_type] || { icon: CircleDot, color: "slate" };
            const Icon = config.icon;
            
            return (
              <div 
                key={event.id || index}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  event.is_current 
                    ? "border-blue-300 bg-blue-50" 
                    : "border-slate-200 hover:bg-slate-50"
                }`}
                onClick={() => {
                  if (event.event_type === "observation" && event.id) {
                    navigate(`/threats/${event.id}`);
                  }
                }}
              >
                <div className={`p-2 rounded-lg bg-${config.color}-100`}>
                  <Icon className={`w-4 h-4 text-${config.color}-600`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-900 truncate">{event.title}</div>
                  <div className="text-xs text-slate-500">
                    {event.date && format(parseISO(event.date), "MMM d, yyyy")}
                    {event.reference_id && ` • ${event.reference_id}`}
                  </div>
                </div>
                {event.is_current && (
                  <Badge className="bg-blue-600 text-xs">{t("observationWorkspace.current")}</Badge>
                )}
                {event.status && !event.is_current && (
                  <Badge variant="outline" className="text-xs capitalize">{translateEnum(event.status)}</Badge>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("observationWorkspace.noHistoricalEvents")}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Reliability Intelligence Panel
 */
const ReliabilityIntelligencePanel = ({ intelligence, onViewFullAnalysis, threatId, threatData }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Brain className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{t("observationWorkspace.reliabilityIntelligence")}</h3>
          <p className="text-xs text-slate-500">{t("observationWorkspace.reliabilityIntelligenceSubtitle")}</p>
        </div>
      </div>

      {/* Most Likely Cause */}
      <div className="mb-6">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          {t("observationWorkspace.mostLikelyCause")}
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="font-semibold text-purple-900 text-lg">
            {intelligence?.most_likely_cause?.name || t("common.unknown")}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="text-sm text-purple-700">
              {interpolate(t("observationWorkspace.confidencePercent"), {
                percent: intelligence?.most_likely_cause?.confidence || 0,
              })}
            </div>
            <div className="flex-1 h-1.5 bg-purple-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-600 rounded-full"
                style={{ width: `${intelligence?.most_likely_cause?.confidence || 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Supporting Evidence */}
      <div className="mb-6">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          {t("observationWorkspace.supportingEvidence")}
        </div>
        <div className="space-y-2">
          {intelligence?.supporting_evidence && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>{interpolate(t("observationWorkspace.similarEvents"), { count: intelligence.supporting_evidence.historical_events || 0 })}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>{interpolate(t("observationWorkspace.previousFailures"), { count: intelligence.supporting_evidence.previous_failures || 0 })}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>{interpolate(t("observationWorkspace.workOrdersCount"), { count: intelligence.supporting_evidence.work_orders || 0 })}</span>
              </div>
              {intelligence.supporting_evidence.inspection_evidence && (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>{t("observationWorkspace.inspectionEvidence")}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Contributing Factors */}
      <div className="mb-6">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          {t("observationWorkspace.contributingFactors")}
        </div>
        <div className="space-y-2">
          {intelligence?.contributing_factors?.slice(0, 4).map((factor, index) => (
            <div 
              key={index}
              className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-sm"
            >
              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium">
                {index + 1}
              </div>
              <span className="text-slate-700">{factor.factor}</span>
            </div>
          ))}
        </div>
      </div>

      {/* View Full Analysis Button — opens combined AI Risk + Causal dialog */}
      <Button 
        variant="default"
        className="w-full bg-purple-600 hover:bg-purple-700"
        onClick={onViewFullAnalysis}
        data-testid="open-full-analysis-btn"
      >
        <Eye className="w-4 h-4 mr-2" />
        {t("observationWorkspace.viewFullAnalysis")}
      </Button>
    </div>
  );
};

/**
 * Recommended Action Card
 */
const RecommendedActionCard = ({ action, onAddToPlan, onAddToStrategy, isAdding }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  
  const actionTypeColors = {
    PM: "bg-blue-100 text-blue-700 border-blue-200",
    CM: "bg-orange-100 text-orange-700 border-orange-200",
    PDM: "bg-purple-100 text-purple-700 border-purple-200",
    OP: "bg-green-100 text-green-700 border-green-200",
  };

  const sourceColors = {
    failure_mode_library: "bg-amber-100 text-amber-700",
    ai_generated: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <Badge className={`text-xs ${actionTypeColors[action.action_type] || actionTypeColors.PM}`}>
          {action.action_type}
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 text-sm">{action.title}</div>
        </div>
      </div>

      {/* Source & Impact */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${sourceColors[action.source] || ""}`}>
          {action.source_display || action.source}
        </Badge>
        {action.expected_impact && (
          <span className="text-xs text-slate-500">
            {interpolate(t("observationWorkspace.impactLabel"), { impact: action.expected_impact })}
          </span>
        )}
        {action.confidence && (
          <span className="text-xs text-purple-600">
            {interpolate(t("observationWorkspace.confidenceLabel"), { percent: action.confidence })}
          </span>
        )}
      </div>

      {/* Expandable Why Recommended */}
      {action.why_recommended && (
        <div className="mb-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {t("observationWorkspace.whyRecommended")}
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="text-xs text-slate-600 mt-2 p-2 bg-slate-50 rounded-lg">
                  {action.why_recommended}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onAddToPlan(action)}
          disabled={isAdding}
          className="flex-1 h-8 text-xs"
        >
          {isAdding ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Plus className="w-3 h-3 mr-1" />
          )}
          {t("observationWorkspace.addToPlan")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddToStrategy(action)}
          className="h-8 text-xs"
        >
          {t("observationWorkspace.addToStrategy")}
        </Button>
      </div>
    </div>
  );
};

/**
 * Recommended Actions Panel
 */
const RecommendedActionsPanel = ({ recommendations, aiInsightsAvailable, onAddToPlan, onAddToStrategy, onGenerateAI, isGeneratingAI }) => {
  const { t } = useLanguage();
  const [addingId, setAddingId] = useState(null);

  // Separate by source
  const libraryActions = recommendations?.filter(r => r.source === "failure_mode_library") || [];
  const aiActions = recommendations?.filter(r => r.source === "ai_generated") || [];

  const handleAddToPlan = async (action) => {
    setAddingId(action.id);
    try {
      await onAddToPlan(action);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Lightbulb className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{t("observationWorkspace.recommendedActions")}</h3>
          <p className="text-xs text-slate-500">{t("observationWorkspace.recommendedActionsSubtitle")}</p>
        </div>
      </div>

      {/* Library Actions */}
      {libraryActions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs font-medium text-slate-700 uppercase tracking-wide">
              {t("observationWorkspace.failureModeLibrary")}
            </span>
            <Badge variant="outline" className="text-[10px]">{libraryActions.length}</Badge>
          </div>
          <div className="space-y-3">
            {libraryActions.map((action) => (
              <RecommendedActionCard
                key={action.id}
                action={action}
                onAddToPlan={handleAddToPlan}
                onAddToStrategy={onAddToStrategy}
                isAdding={addingId === action.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* AI Generated Actions */}
      {aiActions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span className="text-xs font-medium text-slate-700 uppercase tracking-wide">
              {t("observationWorkspace.aiGenerated")}
            </span>
            <Badge variant="outline" className="text-[10px]">{aiActions.length}</Badge>
          </div>
          <div className="space-y-3">
            {aiActions.map((action) => (
              <RecommendedActionCard
                key={action.id}
                action={action}
                onAddToPlan={handleAddToPlan}
                onAddToStrategy={onAddToStrategy}
                isAdding={addingId === action.id}
              />
            ))}
          </div>
        </div>
      )}

      {!recommendations || recommendations.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <Lightbulb className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("observationWorkspace.noRecommendations")}</p>
          <p className="text-xs text-slate-400 mt-1">{t("observationWorkspace.noRecommendationsHint")}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Action Plan Panel
 */
const ActionPlanPanel = ({ actions, onViewAll, onEditAction, onValidateAction }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const translateEnum = useTranslateEnum();

  const statusConfig = {
    open: { color: "bg-blue-100 text-blue-700", labelKey: "enums.Open" },
    planned: { color: "bg-purple-100 text-purple-700", labelKey: "enums.Planned" },
    in_progress: { color: "bg-amber-100 text-amber-700", labelKey: "enums.In Progress" },
    completed: { color: "bg-green-100 text-green-700", labelKey: "enums.Completed" },
    validated: { color: "bg-emerald-100 text-emerald-700", labelKey: "enums.Validated" },
  };

  const priorityConfig = {
    critical: "text-red-600",
    high: "text-orange-600",
    medium: "text-amber-600",
    low: "text-green-600",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <ClipboardList className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{t("observationWorkspace.actionPlan")}</h3>
            <p className="text-xs text-slate-500">
              {(actions?.length || 0) === 1
                ? interpolate(t("observationWorkspace.actionsTracked"), { count: actions?.length || 0 })
                : interpolate(t("observationWorkspace.actionsTrackedPlural"), { count: actions?.length || 0 })}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onViewAll}>
          {t("observationWorkspace.viewAll")}
        </Button>
      </div>

      {/* Actions List */}
      {actions && actions.length > 0 ? (
        <div className="space-y-3">
          {actions.slice(0, 5).map((action) => {
            const status = statusConfig[action.status?.toLowerCase()] || statusConfig.open;
            const priority = priorityConfig[action.priority?.toLowerCase()] || priorityConfig.medium;

            return (
              <div 
                key={action.id}
                className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                onClick={() => navigate(`/actions/${action.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{action.action_number}</span>
                    <Badge className={`text-[10px] ${status.color}`}>{t(status.labelKey)}</Badge>
                  </div>
                  <div className="font-medium text-sm text-slate-900 truncate">{action.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    {action.owner && <span>{action.owner}</span>}
                    {action.due_date && (
                      <>
                        <span className={priority}>
                          {interpolate(t("observationWorkspace.dueDate"), {
                            date: format(parseISO(action.due_date), "MMM d"),
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("observationWorkspace.noActionsInPlan")}</p>
          <p className="text-xs text-slate-400 mt-1">{t("observationWorkspace.noActionsInPlanHint")}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Process Journey Tracker
 */
const ProcessJourney = ({ stages }) => {
  const { t } = useLanguage();
  const translateEnum = useTranslateEnum();
  const stageConfig = {
    completed: { color: "bg-green-500", textColor: "text-green-700", icon: Check },
    in_progress: { color: "bg-blue-500", textColor: "text-blue-700", icon: Activity },
    not_started: { color: "bg-slate-300", textColor: "text-slate-500", icon: CircleDot },
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-slate-100 rounded-lg">
          <TrendingUp className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{t("observationWorkspace.processJourney")}</h3>
          <p className="text-xs text-slate-500">{t("observationWorkspace.processJourneySubtitle")}</p>
        </div>
      </div>

      {/* Journey Steps */}
      <div className="flex items-center justify-between overflow-x-auto pb-2">
        {stages?.map((stage, index) => {
          const config = stageConfig[stage.status] || stageConfig.not_started;
          const Icon = config.icon;
          
          return (
            <React.Fragment key={stage.stage}>
              {/* Stage */}
              <div className="flex flex-col items-center min-w-[80px]">
                <div className={`w-10 h-10 rounded-full ${config.color} flex items-center justify-center text-white mb-2`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className={`text-xs font-medium ${config.textColor} text-center`}>
                  {translateEnum(stage.stage)}
                </div>
                {stage.date && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {format(parseISO(stage.date), "MMM d")}
                  </div>
                )}
              </div>
              
              {/* Connector */}
              {index < stages.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  stage.status === "completed" ? "bg-green-300" : "bg-slate-200"
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ObservationWorkspacePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const translateEnum = useTranslateEnum();

  // Fetch workspace data
  const { data: workspace, isLoading, error } = useQuery({
    queryKey: ["observation-workspace", id],
    queryFn: () => observationWorkspaceAPI.getWorkspace(id),
    staleTime: 30 * 1000, // 30 seconds
  });

  // Fetch default criticality definitions (used for the right-click popovers on exposure cards).
  const { data: definitionsData } = useQuery({
    queryKey: ["criticality-definitions-defaults"],
    queryFn: () => import("../lib/apis/definitions").then((m) => m.definitionsAPI.getDefaults()),
    staleTime: 10 * 60 * 1000,
  });
  const criticalityDefs = definitionsData?.criticality || [];

  // Add recommendation to plan mutation
  const addRecommendationMutation = useMutation({
    mutationFn: (recommendation) => observationWorkspaceAPI.addRecommendation(id, recommendation),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["observation-workspace", id] });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success(data.message || t("observationWorkspace.actionAddedToPlan"));
    },
    onError: () => {
      toast.error(t("observationWorkspace.actionAddFailed"));
    },
  });

  // Handlers
  const handleAddToPlan = async (recommendation) => {
    await addRecommendationMutation.mutateAsync(recommendation);
  };

  const handleAddToStrategy = (action) => {
    toast.info(t("observationWorkspace.navigateToStrategyEditor"));
    // Could open a dialog or navigate to strategy page
  };

  const handleViewAllActions = () => {
    navigate(`/actions?observation_id=${id}`);
  };

  const handleViewFullAnalysis = () => {
    setShowAnalysisDialog(true);
  };

  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-500">{t("observationWorkspace.loading")}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !workspace) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center py-16">
          <XCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">
            {error?.response?.data?.detail || t("observationWorkspace.notFound")}
          </h2>
          <Button onClick={() => navigate("/threats")} variant="outline">
            {t("observations.backToObservations")}
          </Button>
        </div>
      </div>
    );
  }

  const { observation, exposure, timeline, reliability_intelligence, recommended_actions, action_plan, process_journey } = workspace;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Hero header — compact single-row like classic; stays fixed below the 48px app header */}
      <div className="sticky top-12 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 max-w-7xl">
          <div className="flex items-center gap-2 sm:gap-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/threats")}
              className="p-1 -ml-1 flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <RiskBadge level={observation?.risk_level} size="sm" />
                <span className="text-[11px] text-slate-400 font-mono">
                  {observation?.threat_number}
                </span>
              </div>
              <h1 className="font-semibold text-sm sm:text-base text-slate-900 truncate leading-tight">
                {observation?.title}
              </h1>
            </div>

            {/* Action bar slot — ObservationDetailsSection portals status/share/edit/••• into here */}
            <div id="workspace-hero-slot" className="flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 max-w-7xl py-3 space-y-3">
        
        {/* Row 1: Risk & Exposure Header */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <ExposureCard
            type={t("observationWorkspace.productionExposure")}
            data={{
              primary: exposure?.production?.formatted_value || "$0",
              secondary: interpolate(t("observationWorkspace.hoursDowntime"), {
                hours: exposure?.production?.estimated_downtime_hours || 0,
              }),
              tertiary: exposure?.production?.deferred_production 
                ? interpolate(t("observationWorkspace.deferredProduction"), {
                    amount: exposure.production.deferred_production,
                    unit: exposure.production.deferred_production_unit || "bbl",
                  })
                : null
            }}
            icon={DollarSign}
            color="amber"
            dimension="production"
            score={exposure?.production?.production_impact_score}
            criticalityDefs={criticalityDefs}
          />
          
          <ExposureCard
            type={t("observationWorkspace.safetyExposure")}
            data={{
              primary: interpolate(t("observationWorkspace.personnelCount"), {
                count: exposure?.safety?.personnel_exposed || 0,
              }),
              secondary: interpolate(t("observationWorkspace.severityLevel"), {
                level: translateEnum(exposure?.safety?.severity || "Low"),
              }),
            }}
            icon={Users}
            color="red"
            dimension="safety"
            score={exposure?.safety?.safety_impact_score}
            criticalityDefs={criticalityDefs}
          />
          
          <ExposureCard
            type={t("observationWorkspace.environmentalImpact")}
            data={{
              primary: translateEnum(exposure?.environmental?.impact_rating || "Low"),
            }}
            icon={Leaf}
            color="green"
            dimension="environmental"
            score={exposure?.environmental?.environmental_impact_score}
            criticalityDefs={criticalityDefs}
          />

          <ExposureCard
            type={t("observationWorkspace.reputationImpact")}
            data={{
              primary: translateEnum(exposure?.reputation?.impact_rating || "Low"),
            }}
            icon={Star}
            color="purple"
            dimension="reputation"
            score={exposure?.reputation?.reputation_impact_score}
            criticalityDefs={criticalityDefs}
          />
          
          <ALARPCard alarp={exposure?.alarp} />
          
          <RiskSummaryCard riskSummary={exposure?.risk_summary} />
        </div>

        {/* Observation details — all classic features (edit, status, share, delete, info grid, attachments, AI panels, link equipment / failure mode, score calc popup, cause, field notes) */}
        <ObservationDetailsSection threatId={id} />

        {/* Row 2: Equipment Reliability Timeline */}
        <EquipmentReliabilityTimeline 
          events={timeline?.events} 
          aiEvidence={timeline?.ai_evidence}
        />

        {/* Row 3: Main Work Area - 3 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Reliability Intelligence */}
          <ReliabilityIntelligencePanel 
            intelligence={reliability_intelligence}
            onViewFullAnalysis={handleViewFullAnalysis}
            threatId={id}
            threatData={observation}
          />

          {/* Column 2: Recommended Actions */}
          <RecommendedActionsPanel 
            recommendations={recommended_actions}
            onAddToPlan={handleAddToPlan}
            onAddToStrategy={handleAddToStrategy}
          />

          {/* Column 3: Action Plan */}
          <ActionPlanPanel 
            actions={action_plan}
            onViewAll={handleViewAllActions}
          />
        </div>

        {/* Row 4: Process Journey */}
        <ProcessJourney stages={process_journey} />

      </div>

      {/* Full Analysis Dialog — Causal Intelligence + AI Risk Analysis (without recommended actions) */}
      <Dialog open={showAnalysisDialog} onOpenChange={setShowAnalysisDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="full-analysis-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              {t("observationWorkspace.fullReliabilityAnalysis")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            <CausalIntelligencePanel threatId={id} threatData={observation} />
            <AIInsightsPanel threatId={id} threatData={observation} hideRecommendations />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ObservationWorkspacePage;
