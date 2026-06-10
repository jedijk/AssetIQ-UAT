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
  Pencil,
  Trash2,
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
import { queryKeys } from "../lib/queryKeys";
import { aiRiskAPI } from "../lib/apis/aiRisk";
import { useLanguage } from "../contexts/LanguageContext";
import { useDisciplines } from "../hooks/useDisciplines";
import RiskBadge from "../components/RiskBadge";
import ObservationDetailsSection from "../components/workspace/ObservationDetailsSection";
import AIInsightsPanel from "../components/AIInsightsPanel";
import CausalIntelligencePanel from "../components/CausalIntelligencePanel";
import { translateEnum } from "../lib/translateEnum";
import {
  CRITICALITY_FIELD_BY_DIMENSION,
  translateCriticalityDefinitionText,
  translateCriticalityDimensionLabel,
  translateCriticalityField,
  translateCriticalityLabel,
} from "../lib/criticalityDefinitionI18n";

const EVENT_TYPE_ENUM = {
  observation: "Observation",
  failure: "Failure",
  work_order: "Action",
  action: "Action",
  inspection: "Inspection",
  repair: "Repair",
  investigation: "Investigation",
  strategy_change: "Strategy Change",
};

const getEventTypeLabel = (t, type) => translateEnum(t, EVENT_TYPE_ENUM[type] || "Event");

const ACTION_STATUS_ENUM = {
  open: "Open",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  validated: "Validated",
};

const getActionStatusLabel = (t, status) => {
  if (!status) return status;
  const key = ACTION_STATUS_ENUM[String(status).toLowerCase()];
  return key ? translateEnum(t, key) : translateEnum(t, status);
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Exposure Card - Shows production, safety, environmental exposure
 */
const ExposureCard = ({ type, data, icon: Icon, color, dimension, score, criticalityDefs }) => {
  const { t } = useLanguage();
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

  // Color is derived from the severity score (1-5) when present, so all
  // exposure cards use the same red→amber→yellow→sky→green scale and stay
  // visually consistent with the criticality assessment colors. The `color`
  // prop becomes the fallback when no score is provided.
  const colorClasses = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    green: "bg-green-50 border-green-200 text-green-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
  };
  
  const severityColorByScore = {
    5: "red",
    4: "orange",
    3: "yellow",
    2: "sky",
    1: "green",
  };
  const effectiveColor = severityColorByScore[score] || color;

  // The field name on each criticality definition row that holds this dimension's description.
  const field = CRITICALITY_FIELD_BY_DIMENSION[dimension];

  // Sorted list of all 5 rank rows for the popover.
  const scaleRows = (criticalityDefs || [])
    .slice()
    .sort((a, b) => (a.rank || 0) - (b.rank || 0))
    .filter((d) => field && d[field]);

  const isNotAssessed = data?.not_assessed === true || (dimension && (score === null || score === undefined || score === 0));

  return (
    <>
      <div
        className={`rounded-xl border px-3 py-2 ${dimension ? "cursor-context-menu" : ""} ${isNotAssessed ? "bg-slate-50 border-slate-200 text-slate-500" : colorClasses[effectiveColor]}`}
        onContextMenu={dimension ? (e) => {
          e.preventDefault();
          setPopup({ show: true, x: e.clientX, y: e.clientY });
        } : undefined}
        title={dimension ? t("observationWorkspace.criticalityRightClick") : undefined}
        data-testid={dimension ? `exposure-card-${dimension}` : undefined}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[10px] font-medium uppercase tracking-wide truncate">{type}</span>
        </div>
        {isNotAssessed ? (
          <div className="text-sm font-semibold leading-tight italic">{t("observationWorkspace.notAssessed")}</div>
        ) : (
          <>
            {data.primary && (
              <div className="text-base sm:text-lg font-bold leading-tight break-words">{data.primary}</div>
            )}
            {data.secondary && (
              <div className="text-[11px] opacity-80 leading-tight line-clamp-2">{data.secondary}</div>
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
              <h3 className="font-semibold text-sm text-slate-800">{t("observationWorkspace.criticalityTitle", { dimension: translateCriticalityDimensionLabel(dimension, t) })}</h3>
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
                    <div className="text-sm font-semibold text-slate-800">{translateCriticalityLabel(currentRow, t)}</div>
                    <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap mt-1">{translateCriticalityField(currentRow, field, t)}</div>
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
  const percentage = alarp?.percentage || 0;
  const status = alarp?.status || "Not Started";
  
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
          {translateEnum(t, status)}
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
  const riskScore = riskSummary?.risk_score || 0;
  const riskLevel = riskSummary?.risk_level || "Low";
  const rpn = riskSummary?.rpn;

  const getRiskColor = () => {
    if (riskLevel === "Critical") return "border-red-300 bg-red-50";
    if (riskLevel === "High") return "border-orange-300 bg-orange-50";
    if (riskLevel === "Medium") return "border-yellow-300 bg-yellow-50";
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
  
  const getEventConfig = (type) => {
    const configs = {
      observation: { icon: AlertTriangle, color: "amber" },
      failure: { icon: XCircle, color: "red" },
      work_order: { icon: Wrench, color: "blue" },
      action: { icon: Wrench, color: "blue" },
      inspection: { icon: Eye, color: "green" },
      repair: { icon: Wrench, color: "purple" },
      investigation: { icon: FileSearch, color: "indigo" },
      strategy_change: { icon: Cog, color: "slate" },
    };
    const base = configs[type] || configs.observation;
    return { ...base, label: getEventTypeLabel(t, type) };
  };

  const config = getEventConfig(event.event_type);
  const Icon = config.icon;
  
  // For actions/work orders, show the action_type (PM, CM, PDM, etc.)
  const isAction = event.event_type === "action" || event.event_type === "work_order";
  const actionType = event.action_type || event.task_type || event.type;
  
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
  if (actionType) tooltipParts.push(t("observationWorkspace.eventTypeLabel", { type: actionType }));
  if (event.reference_id) tooltipParts.push(event.reference_id);
  if (event.status) tooltipParts.push(t("observationWorkspace.statusLabel", { status: translateEnum(t, event.status) }));
  if (event.description) tooltipParts.push(event.description);
  const tooltip = tooltipParts.join("\n");

  return (
    <div 
      className="flex flex-col items-center cursor-pointer group flex-shrink-0 w-20"
      onClick={handleClick}
      title={tooltip}
    >
      {/* Date */}
      <div className="text-[10px] text-slate-500 mb-1.5 font-medium h-3.5 leading-3.5">
        {formatDate(event.date)}
      </div>
      
      {/* Event Circle — sits above the connector line; bg-white outer ring punches through the rail */}
      <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ring-2 ring-white ${
        isCurrent 
          ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
          : `bg-${config.color}-100 text-${config.color}-600`
      }`}>
        <Icon className="w-3 h-3" />
      </div>
      
      {/* Action Type Badge (for actions/work orders) */}
      {isAction && actionType && (
        <div className="text-[9px] font-semibold mt-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
          {actionType}
        </div>
      )}
      
      {/* Event Title */}
      <div className={`text-[10px] font-medium ${isAction && actionType ? 'mt-1' : 'mt-1.5'} text-center max-w-[72px] truncate leading-tight ${
        isCurrent ? "text-blue-700 font-semibold" : "text-slate-700"
      }`}>
        {event.title?.substring(0, 22) || config.label}
      </div>
      
      {/* Reference ID */}
      {event.reference_id && (
        <div className="text-[9px] text-slate-400 mt-0.5 leading-none">
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
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState("timeline"); // timeline or list
  const navigate = useNavigate();

  // Find current event
  const currentEvent = events?.find(e => e.is_current);

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
      {/* Header — compact */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-slate-500" />
          <h3 className="font-medium text-xs text-slate-700">{t("observationWorkspace.equipmentHistory")}</h3>
          {events && events.length > 0 && (
            <span className="text-[10px] text-slate-400">({events.length})</span>
          )}
        </div>
        
        {/* View Toggle */}
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "timeline" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("timeline")}
            className="h-6 px-2 text-xs"
          >
            <Calendar className="w-3 h-3 mr-1" />
            {t("observationWorkspace.timeline")}
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="h-6 px-2 text-xs"
          >
            <List className="w-3 h-3 mr-1" />
            {t("observationWorkspace.list")}
          </Button>
        </div>
      </div>

      {/* Timeline View */}
      {viewMode === "timeline" && events && events.length > 0 ? (
        <div className="relative px-1.5">
          {/* Horizontal connector — aligned with the centre of the event circles.
              Position math: date row (14px text + mb-1.5 = 6px) + half of circle (24/2 = 12px) = 32px. */}
          <div className="pointer-events-none absolute left-0 right-0 h-px bg-slate-200" style={{ top: "32px" }} />
          
          {/* Events */}
          <div className="flex items-start overflow-x-auto pb-1.5 gap-3 scrollbar-thin scrollbar-thumb-slate-300">
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
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
          {events?.map((event, index) => {
            const configBase = {
              observation: { icon: AlertTriangle, color: "amber" },
              failure: { icon: XCircle, color: "red" },
              work_order: { icon: Wrench, color: "blue" },
              action: { icon: Wrench, color: "blue" },
              inspection: { icon: Eye, color: "green" },
              repair: { icon: Wrench, color: "purple" },
              investigation: { icon: FileSearch, color: "indigo" },
            }[event.event_type] || { icon: CircleDot, color: "slate" };
            const config = { ...configBase, label: getEventTypeLabel(t, event.event_type) };
            const Icon = config.icon;
            
            // For actions/work orders, show the action_type (PM, CM, PDM, etc.)
            const isAction = event.event_type === "action" || event.event_type === "work_order";
            const actionType = event.action_type || event.task_type || event.type;
            
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
                  <div className="flex items-center gap-2">
                    {isAction && actionType && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        {actionType}
                      </span>
                    )}
                    {!isAction && (
                      <span className="text-[10px] text-slate-500">{config.label}</span>
                    )}
                  </div>
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
                  <Badge variant="outline" className="text-xs capitalize">{translateEnum(t, event.status)}</Badge>
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
    <div className="bg-white rounded-xl border border-slate-200 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto scrollbar-thin">
      {/* Header — sticky on scroll */}
      <div className="lg:sticky lg:top-0 z-10 bg-white px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Brain className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{t("observationWorkspace.reliabilityIntelligence")}</h3>
            <p className="text-xs text-slate-500">{t("observationWorkspace.reliabilityIntelligenceSubtitle")}</p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-4 pb-4 sm:pb-6">

      {/* Most Likely Cause — compact */}
      <div className="mb-3">
        <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">
          {t("observationWorkspace.mostLikelyCause")}
        </div>
        <div className="p-2 bg-purple-50 border border-purple-200 rounded-md">
          <div className="font-semibold text-purple-900 text-sm leading-tight">
            {intelligence?.most_likely_cause?.name || t("observationWorkspace.unknown")}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="text-[10px] text-purple-700 whitespace-nowrap">
              {t("observationWorkspace.confidencePercent", { percent: intelligence?.most_likely_cause?.confidence || 0 })}
            </div>
            <div className="flex-1 h-1 bg-purple-200 rounded-full overflow-hidden">
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
                <span>{t("observationWorkspace.similarEvents", { count: intelligence.supporting_evidence.historical_events || 0 })}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>{t("observationWorkspace.previousFailures", { count: intelligence.supporting_evidence.previous_failures || 0 })}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>{t("observationWorkspace.actionsCount", { count: intelligence.supporting_evidence.work_orders || 0 })}</span>
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
          {t("observationWorkspace.contributingFactorsTitle")}
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

      {/* View Full Analysis Button — opens combined AI Risk + Causal dialog
          Desktop-only: the dialog content is too dense for mobile screens. */}
      <Button
        size="sm"
        className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 hidden lg:inline-flex"
        onClick={onViewFullAnalysis}
        data-testid="open-full-analysis-btn"
      >
        <Eye className="w-3.5 h-3.5 mr-1.5" />
        {t("observationWorkspace.viewFullAnalysisButton")}
      </Button>
      {/* Mobile note */}
      <p className="lg:hidden text-[10px] text-slate-400 text-center mt-1">
        {t("observationWorkspace.fullAnalysisDesktop")}
      </p>
      </div>
    </div>
  );
};

/**
 * Recommended Action Card
 */
const RecommendedActionCard = ({ action, onAddToPlan, onAddToStrategy, isAdding, isInPlan }) => {
  const { t } = useLanguage();
  const { getLabel } = useDisciplines();
  const typeColors = {
    PM: "bg-blue-100 text-blue-700",
    CM: "bg-amber-100 text-amber-700",
    PDM: "bg-purple-100 text-purple-700",
    OP: "bg-green-100 text-green-700",
  };

  const sourceLabel = action.source === "failure_mode_library" ? t("observationWorkspace.librarySource") : t("observationWorkspace.aiSource");
  const sourceColor = action.source === "failure_mode_library" 
    ? "bg-amber-50 text-amber-600 border-amber-200" 
    : "bg-purple-50 text-purple-600 border-purple-200";

  return (
    <div className={`p-2 rounded-lg border transition-colors group ${
      isInPlan 
        ? "bg-green-50 border-green-200" 
        : "bg-slate-50 border-slate-100 hover:border-slate-200"
    }`}>
      {/* Main row: Info + Add button */}
      <div className="flex items-start gap-2">
        {/* Left: Info */}
        <div className="flex-1 min-w-0">
          {/* Header row: Type badge, time, source, discipline */}
          <div className="flex items-center gap-1 mb-1 flex-wrap">
            {action.action_type && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColors[action.action_type] || 'bg-slate-100 text-slate-600'}`}>
                {action.action_type}
              </span>
            )}
            {action.estimated_minutes && (
              <span className="text-[10px] text-slate-500">
                {action.estimated_minutes}m
              </span>
            )}
            <span className={`text-[10px] px-1 py-0.5 rounded border ${sourceColor}`}>
              {sourceLabel}
            </span>
            {action.discipline && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600" data-testid="recommended-action-discipline">
                {getLabel(action.discipline)}
              </span>
            )}
            {isInPlan && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium ml-auto">
                {t("observationWorkspace.inPlan")}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-700 leading-snug">
            {action.title || action.description || action.action}
          </p>
        </div>

        {/* Right: Add button (disabled if already in plan) */}
        <Button
          size="sm"
          onClick={() => onAddToPlan(action)}
          disabled={isAdding || isInPlan}
          className={`h-7 w-7 p-0 flex-shrink-0 ${isInPlan ? 'bg-green-600' : ''}`}
          title={isInPlan ? t("observationWorkspace.alreadyInPlan") : t("observationWorkspace.addToPlanTitle")}
        >
          {isAdding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isInPlan ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
};

/**
 * Recommended Actions Panel
 */
const RecommendedActionsPanel = ({ recommendations, onAddToPlan, onAddToStrategy, onGenerateAI, isGeneratingAI }) => {
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
    <div className="bg-white rounded-xl border border-slate-200 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto scrollbar-thin">
      {/* Header — sticky on scroll */}
      <div className="lg:sticky lg:top-0 z-10 bg-white px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
              <Lightbulb className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900">{t("observationWorkspace.recommendedActions")}</h3>
              <p className="text-xs text-slate-500">{t("observationWorkspace.recommendedActionsSubtitle")}</p>
            </div>
          </div>
          {aiActions.length === 0 && onGenerateAI && (
            <div className="relative group flex-shrink-0">
              <button
                type="button"
                onClick={onGenerateAI}
                disabled={isGeneratingAI}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                  isGeneratingAI
                    ? "text-purple-600 bg-purple-50"
                    : "text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={t("ai.generateAiq")}
                data-testid="run-ai-recommendations-btn"
              >
                {isGeneratingAI ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </button>
              {/* Tooltip */}
              <div className="absolute right-0 top-full mt-1 w-48 p-2 bg-slate-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                <div className="font-semibold flex items-center gap-1 mb-1">
                  <Sparkles className="w-3 h-3 text-purple-300" /> {t("ai.generateAiq")}
                </div>
                <p className="text-slate-300">Generate AI-powered recommended actions for this observation.</p>
                <div className="absolute -top-1 right-4 w-2 h-2 bg-slate-900 rotate-45"></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-4 pb-4 sm:pb-6">

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
    </div>
  );
};

// Map backend action_type values (e.g. "preventive") to short UI codes (PM/CM/PDM/OP/LEARN/IV)
const normalizeActionType = (val) => {
  if (!val) return "CM";
  const v = String(val).toUpperCase();
  if (["PM", "CM", "PDM", "OP", "LEARN", "IV"].includes(v)) return v;
  const lc = String(val).toLowerCase();
  if (lc.startsWith("prev")) return "PM";
  if (lc.startsWith("corr")) return "CM";
  if (lc.startsWith("pred")) return "PDM";
  if (lc.startsWith("oper")) return "OP";
  if (lc.startsWith("learn")) return "LEARN";
  if (lc.startsWith("invest")) return "IV";
  return "CM";
};

/**
 * Edit Action form body — lazy-initialised from the full action.
 * Kept as a separate component (rendered with key={fullAction.id}) so the
 * lazy useState initialiser fires each time a new action is loaded,
 * eliminating the need for a setState-inside-useEffect.
 */
const EditActionForm = ({ fullAction, onSubmit, onCancel, isSaving }) => {
  const { t } = useLanguage();
  const { disciplines, normalize } = useDisciplines();
  const [form, setForm] = useState(() => ({
    title: fullAction?.title || "",
    description: fullAction?.description || "",
    action_type: normalizeActionType(fullAction?.action_type),
    discipline: fullAction?.discipline || "",
    status: fullAction?.status || "open",
    due_date: fullAction?.due_date ? String(fullAction.due_date).split("T")[0] : "",
    comments: fullAction?.comments || "",
  }));

  const disciplineValue = normalize(form.discipline) || form.discipline || "";

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = () => {
    onSubmit({
      title: form.title,
      description: form.description,
      action_type: form.action_type,
      discipline: normalize(form.discipline) || form.discipline || null,
      status: form.status,
      due_date: form.due_date || null,
      comments: form.comments || null,
    });
  };

  return (
    <>
      <div className="grid gap-3 py-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-title">{t("observationWorkspace.titleLabel")}</Label>
          <Input
            id="edit-title"
            value={form.title}
            onChange={(e) => handleChange("title", e.target.value)}
            data-testid="edit-action-title"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="edit-desc">{t("observationWorkspace.descriptionLabel")}</Label>
          <Textarea
            id="edit-desc"
            rows={3}
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            data-testid="edit-action-description"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{t("observationWorkspace.typeLabel")}</Label>
            <Select value={form.action_type} onValueChange={(v) => handleChange("action_type", v)}>
              <SelectTrigger data-testid="edit-action-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CM">{t("observationWorkspace.actionTypeCM")}</SelectItem>
                <SelectItem value="PM">{t("observationWorkspace.actionTypePM")}</SelectItem>
                <SelectItem value="PDM">{t("observationWorkspace.actionTypePDM")}</SelectItem>
                <SelectItem value="OP">{t("observationWorkspace.actionTypeOP")}</SelectItem>
                <SelectItem value="LEARN">{t("observationWorkspace.actionTypeLEARN")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>{t("observationWorkspace.disciplineLabel")}</Label>
            <Select value={disciplineValue || "none"} onValueChange={(v) => handleChange("discipline", v === "none" ? "" : v)}>
              <SelectTrigger data-testid="edit-action-discipline"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("observationWorkspace.noneDiscipline")}</SelectItem>
                {disciplines.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{t("observationWorkspace.status")}</Label>
            <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
              <SelectTrigger data-testid="edit-action-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{getActionStatusLabel(t, "open")}</SelectItem>
                <SelectItem value="planned">{getActionStatusLabel(t, "planned")}</SelectItem>
                <SelectItem value="in_progress">{getActionStatusLabel(t, "in_progress")}</SelectItem>
                <SelectItem value="completed">{getActionStatusLabel(t, "completed")}</SelectItem>
                <SelectItem value="validated">{getActionStatusLabel(t, "validated")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-due">{t("observationWorkspace.dueDateLabel")}</Label>
            <Input
              id="edit-due"
              type="date"
              value={form.due_date}
              onChange={(e) => handleChange("due_date", e.target.value)}
              data-testid="edit-action-due-date"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="edit-comments">{t("observationWorkspace.comments")}</Label>
          <Textarea
            id="edit-comments"
            rows={2}
            value={form.comments}
            onChange={(e) => handleChange("comments", e.target.value)}
            data-testid="edit-action-comments"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isSaving} data-testid="edit-action-cancel">{t("common.cancel")}</Button>
        <Button onClick={handleSubmit} disabled={isSaving || !form.title.trim()} data-testid="edit-action-save">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {t("common.saveChanges")}
        </Button>
      </DialogFooter>
    </>
  );
};

/**
 * Edit Action Dialog — popup that allows editing of all action fields.
 * Fetches the full action by ID when opened so every field is populated
 * from the source of truth (the action document itself).
 */
const EditActionDialog = ({ action, open, onClose, onSave, isSaving }) => {
  const { t } = useLanguage();
  // Fetch full action data from the action itself (single source of truth)
  const { data: fullAction, isLoading } = useQuery({
    queryKey: ["action-detail", action?.id],
    queryFn: () => actionsAPI.getById(action.id),
    enabled: !!(open && action?.id),
    staleTime: 0,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="edit-action-dialog">
        <DialogHeader>
          <DialogTitle>{t("observationWorkspace.editActionTitle")}</DialogTitle>
          <DialogDescription>
            {t("observationWorkspace.editActionDescription", {
              actionNumber: fullAction?.action_number || action?.action_number || t("observationWorkspace.thisAction"),
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading && !fullAction ? (
          <div className="py-10 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("observationWorkspace.loadingAction")}
          </div>
        ) : (
          <EditActionForm
            key={fullAction?.id || action?.id || "edit"}
            fullAction={fullAction || action || {}}
            onSubmit={onSave}
            onCancel={onClose}
            isSaving={isSaving}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

/**
 * Delete Action Confirmation Dialog
 */
const DeleteActionDialog = ({ action, open, onClose, onConfirm, isDeleting }) => {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="delete-action-dialog">
        <DialogHeader>
          <DialogTitle>{t("observationWorkspace.deleteActionTitle")}</DialogTitle>
          <DialogDescription>
            {action ? (
              t("observationWorkspace.deleteActionDescription", {
                title: action.title,
                actionNumber: action.action_number ? ` (${action.action_number})` : "",
              })
            ) : t("observationWorkspace.deleteActionRemovedOnly")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isDeleting} data-testid="delete-action-cancel">{t("common.cancel")}</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="delete-action-confirm"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Add Action Dialog — manual creation of a new action on the observation's plan.
 * Supports the same action_type list (CM/PM/PDM/OP/LEARN), letting users add
 * "Learning" actions such as updating the PM plan.
 */
const AddActionDialog = ({ open, onClose, onCreate, isCreating }) => {
  const { t } = useLanguage();
  const { disciplines, normalize } = useDisciplines();
  const [form, setForm] = useState({
    title: "",
    description: "",
    action_type: "CM",
    discipline: "",
    status: "open",
    due_date: "",
    comments: "",
  });

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const reset = () => setForm({
    title: "", description: "", action_type: "CM", discipline: "",
    status: "open", due_date: "", comments: "",
  });

  const handleSubmit = async () => {
    await onCreate({
      title: form.title,
      description: form.description,
      action_type: form.action_type,
      discipline: normalize(form.discipline) || form.discipline || null,
      status: form.status,
      due_date: form.due_date || null,
      comments: form.comments || null,
    });
    reset();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg" data-testid="add-action-dialog">
        <DialogHeader>
          <DialogTitle>{t("observationWorkspace.addActionTitle")}</DialogTitle>
          <DialogDescription>
            {t("observationWorkspace.addActionDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="add-title">{t("observationWorkspace.titleLabel")}</Label>
            <Input
              id="add-title"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder={t("observationWorkspace.addActionPlaceholder")}
              data-testid="add-action-title"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="add-desc">{t("observationWorkspace.descriptionLabel")}</Label>
            <Textarea
              id="add-desc"
              rows={3}
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              data-testid="add-action-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t("observationWorkspace.typeLabel")}</Label>
              <Select value={form.action_type} onValueChange={(v) => handleChange("action_type", v)}>
                <SelectTrigger data-testid="add-action-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CM">{t("observationWorkspace.actionTypeCM")}</SelectItem>
                  <SelectItem value="PM">{t("observationWorkspace.actionTypePM")}</SelectItem>
                  <SelectItem value="PDM">{t("observationWorkspace.actionTypePDM")}</SelectItem>
                  <SelectItem value="OP">{t("observationWorkspace.actionTypeOP")}</SelectItem>
                  <SelectItem value="LEARN">{t("observationWorkspace.actionTypeLEARN")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>{t("observationWorkspace.disciplineLabel")}</Label>
              <Select value={form.discipline || "none"} onValueChange={(v) => handleChange("discipline", v === "none" ? "" : v)}>
                <SelectTrigger data-testid="add-action-discipline"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("observationWorkspace.noneDiscipline")}</SelectItem>
                  {disciplines.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t("observationWorkspace.status")}</Label>
              <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                <SelectTrigger data-testid="add-action-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{getActionStatusLabel(t, "open")}</SelectItem>
                  <SelectItem value="planned">{getActionStatusLabel(t, "planned")}</SelectItem>
                  <SelectItem value="in_progress">{getActionStatusLabel(t, "in_progress")}</SelectItem>
                  <SelectItem value="completed">{getActionStatusLabel(t, "completed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="add-due">{t("observationWorkspace.dueDateLabel")}</Label>
              <Input
                id="add-due"
                type="date"
                value={form.due_date}
                onChange={(e) => handleChange("due_date", e.target.value)}
                data-testid="add-action-due-date"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="add-comments">{t("observationWorkspace.comments")}</Label>
            <Textarea
              id="add-comments"
              rows={2}
              value={form.comments}
              onChange={(e) => handleChange("comments", e.target.value)}
              data-testid="add-action-comments"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isCreating} data-testid="add-action-cancel">{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={isCreating || !form.title.trim()} data-testid="add-action-submit">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {t("observationWorkspace.addToPlanButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Action Plan Panel - Shows actions in the same style as recommended actions
 */
const ActionPlanPanel = ({ actions, onViewAll, onEditAction, onDeleteAction, onAddAction, isCreating, actionPlanIds = [] }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { getLabel } = useDisciplines();
  const [editingAction, setEditingAction] = useState(null);
  const [deletingAction, setDeletingAction] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const typeColors = {
    PM: "bg-blue-100 text-blue-700",
    CM: "bg-amber-100 text-amber-700",
    PDM: "bg-purple-100 text-purple-700",
    OP: "bg-green-100 text-green-700",
    LEARN: "bg-pink-100 text-pink-700",
    IV: "bg-indigo-100 text-indigo-700",
  };

  const statusConfig = {
    open: { color: "bg-blue-50 text-blue-600 border-blue-200", label: getActionStatusLabel(t, "open") },
    planned: { color: "bg-purple-50 text-purple-600 border-purple-200", label: getActionStatusLabel(t, "planned") },
    in_progress: { color: "bg-amber-50 text-amber-600 border-amber-200", label: getActionStatusLabel(t, "in_progress") },
    completed: { color: "bg-green-50 text-green-600 border-green-200", label: getActionStatusLabel(t, "completed") },
    validated: { color: "bg-emerald-50 text-emerald-600 border-emerald-200", label: getActionStatusLabel(t, "validated") },
  };

  const handleEdit = (action, e) => {
    e.stopPropagation();
    setEditingAction(action);
  };

  const handleDelete = (action, e) => {
    e.stopPropagation();
    setDeletingAction(action);
  };

  const handleSaveEdit = async (updates) => {
    if (!editingAction) return;
    setIsSaving(true);
    try {
      await onEditAction?.(editingAction, updates);
      setEditingAction(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAction) return;
    setIsDeleting(true);
    try {
      await onDeleteAction?.(deletingAction);
      setDeletingAction(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto scrollbar-thin">
      {/* Header - sticky on scroll, sized to match Recommended Actions */}
      <div className="lg:sticky lg:top-0 z-10 bg-white px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 truncate">
                {t("observationWorkspace.actionPlan")}
                {actions && actions.length > 0 && (
                  <span className="ml-2 text-xs text-slate-400 font-normal">({actions.length})</span>
                )}
              </h3>
              <p className="text-xs text-slate-500 truncate">{t("observationWorkspace.actionPlanSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAddDialog(true)}
              className="h-7 text-xs px-2"
              title={t("observationWorkspace.addActionManually")}
              data-testid="action-plan-add-btn"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> {t("observationWorkspace.add")}
            </Button>
            {actions && actions.length > 0 && (
              <Button size="sm" variant="ghost" onClick={onViewAll} className="h-7 text-xs px-2 hidden sm:inline-flex">
                {t("observationWorkspace.viewAll")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-4 pb-4 sm:pb-6">

      {/* Actions List - Same style as recommended actions */}
      {actions && actions.length > 0 ? (
        <div className="space-y-2">
          {actions.slice(0, 5).map((action) => {
            const status = statusConfig[action.status?.toLowerCase()] || statusConfig.open;
            const actionType = normalizeActionType(action.action_type);
            const isInvestigationAction = !!action.linked_investigation_id;

            return (
              <div 
                key={action.id}
                className={`p-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors group ${isInvestigationAction ? "cursor-pointer hover:bg-purple-50" : ""}`}
                onClick={isInvestigationAction ? () => navigate(`/causal-engine?id=${action.linked_investigation_id}`) : undefined}
                title={isInvestigationAction ? t("observationWorkspace.openLinkedInvestigation") : undefined}
                data-testid={`action-plan-item-${action.id}`}
              >
                <div className="flex items-start gap-2">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    {/* Header row: Type badge, status */}
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColors[actionType] || 'bg-slate-100 text-slate-600'}`}>
                        {actionType}
                      </span>
                      {action.discipline && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {getLabel(action.discipline)}
                        </span>
                      )}
                      <span className={`text-[10px] px-1 py-0.5 rounded border ${status.color}`}>
                        {status.label}
                      </span>
                      {action.action_number && (
                        <span className="text-[10px] text-slate-400 font-mono ml-auto">
                          {action.action_number}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <p className="text-xs text-slate-700 leading-snug">
                      {action.title}
                    </p>

                    {/* Due date / Owner */}
                    {(action.due_date || action.owner) && (
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                        {action.owner && <span>{action.owner}</span>}
                        {action.due_date && (
                          <span>{t("observationWorkspace.dueDate", { date: format(parseISO(action.due_date), "MMM d") })}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Edit & Delete buttons — hidden for synthetic investigation entries */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!action.is_synthetic && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleEdit(action, e)}
                          className="h-7 w-7 p-0"
                          title={t("observationWorkspace.editAction")}
                          data-testid={`action-plan-edit-${action.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleDelete(action, e)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          title={t("observationWorkspace.removeFromPlan")}
                          data-testid={`action-plan-delete-${action.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-slate-500">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-xs">{t("observationWorkspace.noActionsInPlan")}</p>
          <p className="text-[10px] text-slate-400 mt-1">{t("observationWorkspace.addFromRecommendations")}</p>
        </div>
      )}

      {/* Edit / Delete dialogs */}
      <EditActionDialog
        key={editingAction?.id || "edit"}
        action={editingAction}
        open={!!editingAction}
        onClose={() => setEditingAction(null)}
        onSave={handleSaveEdit}
        isSaving={isSaving}
      />
      <DeleteActionDialog
        action={deletingAction}
        open={!!deletingAction}
        onClose={() => setDeletingAction(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
      <AddActionDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onCreate={async (data) => {
          await onAddAction?.(data);
          setShowAddDialog(false);
        }}
        isCreating={isCreating}
      />
      </div>
    </div>
  );
};

/**
 * Process Journey Tracker
 */
const ProcessJourney = ({ stages }) => {
  const { t } = useLanguage();
  const stageConfig = {
    completed: { color: "bg-green-500", textColor: "text-green-700", icon: Check },
    in_progress: { color: "bg-blue-500", textColor: "text-blue-700", icon: Activity },
    not_started: { color: "bg-slate-300", textColor: "text-slate-500", icon: CircleDot },
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 overflow-hidden">
      {/* Single-row compact layout: title + steps inline (stacks on very small screens) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <TrendingUp className="w-3 h-3 text-slate-500" />
          <span className="text-[11px] font-medium text-slate-700">{t("observationWorkspace.processJourney")}</span>
        </div>

        <div className="flex items-center justify-between flex-1 overflow-x-auto min-w-0">
          {stages?.map((stage, index) => {
            const config = stageConfig[stage.status] || stageConfig.not_started;
            const Icon = config.icon;
            
            return (
              <React.Fragment key={stage.stage}>
                <div className="flex items-center gap-1 min-w-fit" title={stage.date ? `${translateEnum(t, stage.stage)} — ${format(parseISO(stage.date), "MMM d")}` : translateEnum(t, stage.stage)}>
                  <div className={`w-3.5 h-3.5 rounded-full ${config.color} flex items-center justify-center text-white flex-shrink-0`}>
                    <Icon className="w-2 h-2" />
                  </div>
                  <span className={`text-[10px] font-medium ${config.textColor} whitespace-nowrap`}>
                    {translateEnum(t, stage.stage)}
                  </span>
                </div>
                
                {index < stages.length - 1 && (
                  <div className={`flex-1 min-w-[6px] h-px mx-1 ${
                    stage.status === "completed" ? "bg-green-300" : "bg-slate-200"
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
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
  const { t, language } = useLanguage();

  // Fetch workspace data
  const { data: workspace, isLoading, error } = useQuery({
    queryKey: queryKeys.observationWorkspace.detail(id, language),
    queryFn: () => observationWorkspaceAPI.getWorkspace(id, { language }),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  });

  // Criticality definitions for the right-click popovers on exposure cards.
  // The workspace response already returns the installation-specific custom
  // definitions (falling back to defaults), so we prefer that source. If the
  // backend hasn't returned them yet we fall back to the defaults endpoint.
  const { data: definitionsData } = useQuery({
    queryKey: ["criticality-definitions-defaults"],
    queryFn: () => import("../lib/apis/definitions").then((m) => m.definitionsAPI.getDefaults()),
    staleTime: 10 * 60 * 1000,
    enabled: !workspace?.criticality_definitions,
  });
  const criticalityDefs = workspace?.criticality_definitions || definitionsData?.criticality || [];

  // Add recommendation to plan mutation
  const addRecommendationMutation = useMutation({
    mutationFn: (recommendation) => observationWorkspaceAPI.addRecommendation(id, recommendation),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(id) });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success(data.message || t("observationWorkspace.actionAddedToPlan"));
    },
    onError: () => {
      toast.error(t("observationWorkspace.actionAddFailed"));
    },
  });

  // Update action mutation
  const updateActionMutation = useMutation({
    mutationFn: ({ actionId, updates }) => actionsAPI.update(actionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(id) });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success(t("observationWorkspace.actionUpdated"));
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || t("observationWorkspace.actionUpdateFailed"));
    },
  });

  // Delete action mutation
  const deleteActionMutation = useMutation({
    mutationFn: (actionId) => actionsAPI.delete(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(id) });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success(t("observationWorkspace.actionRemovedFromPlan"));
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || t("observationWorkspace.actionRemoveFailed"));
    },
  });

  // Create action mutation (manual add — including Learning type)
  const createActionMutation = useMutation({
    mutationFn: (data) => actionsAPI.create({
      title: data.title,
      description: data.description || "",
      source_type: "threat",
      source_id: id,
      source_name: workspace?.observation?.title || t("observations.statusObservation"),
      threat_id: id,
      priority: "medium",
      action_type: data.action_type,
      discipline: data.discipline,
      due_date: data.due_date,
      comments: data.comments || "",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(id) });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success(t("observationWorkspace.actionAddedToPlan"));
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || t("observationWorkspace.actionAddFailed"));
    },
  });

  const generateAIMutation = useMutation({
    mutationFn: () => aiRiskAPI.analyzeRisk(id, { includeForecast: true, includeSimilarIncidents: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.observationWorkspace.detail(id) });
      queryClient.invalidateQueries({ queryKey: ["ai-insights", id] });
      toast.success(t("ai.analysisComplete") || "AI analysis complete");
    },
    onError: (error) => {
      if (error?.isTimeout || error?.code === "ECONNABORTED") {
        toast.error(t("ai.analysisTakingLonger") || "AI analysis taking longer than expected. Please wait and try again.");
        return;
      }
      const errorMessage = error?.response?.data?.detail || error?.message;
      if (errorMessage?.includes("rate limit")) {
        toast.error(t("ai.rateLimitExceeded") || "AI rate limit exceeded. Please wait a moment and try again.");
      } else if (errorMessage?.includes("token") || errorMessage?.includes("key")) {
        toast.error(t("ai.configurationError") || "AI service configuration error. Please contact support.");
      } else {
        toast.error(t("ai.analysisFailed") || errorMessage || "AI analysis failed");
      }
    },
  });

  // Handlers
  const handleAddToPlan = async (recommendation) => {
    await addRecommendationMutation.mutateAsync(recommendation);
  };

  const handleEditAction = async (action, updates) => {
    await updateActionMutation.mutateAsync({ actionId: action.id, updates });
  };

  const handleDeleteAction = async (action) => {
    await deleteActionMutation.mutateAsync(action.id);
  };

  const handleCreateAction = async (data) => {
    await createActionMutation.mutateAsync(data);
  };

  const handleAddToStrategy = (action) => {
    toast.info(t("observationWorkspace.navigateToStrategyEditor"));
    // Could open a dialog or navigate to strategy page
  };

  const handleGenerateAI = () => {
    generateAIMutation.mutate();
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
      {/* Hero header — pinned at top below the 48px app header; does not move when scrolling */}
      <div className="sticky-below-app-header bg-white border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 max-w-7xl">
          {/* Mobile: title row (with ⋯ menu pinned right) + action bar row stack vertically.
              Desktop: everything inline on a single row. */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 py-2">
            <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0">
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

              {/* Mobile-only ⋯ slot — anchored top-right of the hero title row */}
              <div id="workspace-hero-slot-mobile" className="lg:hidden flex-shrink-0 self-start" />
            </div>

            {/* Action bar slot (desktop) — ObservationDetailsSection portals share/edit/delete/⋯ into here */}
            <div id="workspace-hero-slot" className="hidden lg:block lg:flex-shrink-0 lg:flex-none min-w-0 lg:overflow-visible" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-3 sm:px-4 max-w-7xl py-3 space-y-3">
        
        {/* Row 1: Risk & Exposure Header */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <ExposureCard
            type={t("observationWorkspace.productionExposure")}
            data={{
              primary: exposure?.production?.formatted_value || "$0",
              secondary: exposure?.production?.downtime_range 
                ? t("observationWorkspace.hoursDowntime", { hours: exposure.production.downtime_range })
                : t("observationWorkspace.notAssessed"),
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
              primary: exposure?.safety?.severity ? translateEnum(t, exposure.safety.severity) : t("observationWorkspace.notAssessed"),
              secondary: (() => {
                const rank = exposure?.safety?.safety_impact_score;
                const translated = translateCriticalityDefinitionText({
                  criticalityDefs,
                  rank,
                  field: "safety",
                  fallbackText: exposure?.safety?.definition,
                  t,
                });
                if (translated) {
                  const first = translated.split(/[.!?](\s|$)/)[0];
                  return first || translated;
                }
                return t("observationWorkspace.severityLevel", {
                  level: translateEnum(t, exposure?.safety?.severity || t("observationWorkspace.severityLow")),
                });
              })(),
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
              primary: translateEnum(t, exposure?.environmental?.impact_rating || t("observationWorkspace.severityLow")),
              secondary: (() => {
                const rank = exposure?.environmental?.environmental_impact_score;
                const translated = translateCriticalityDefinitionText({
                  criticalityDefs,
                  rank,
                  field: "environment",
                  fallbackText: exposure?.environmental?.definition,
                  t,
                });
                if (translated) {
                  const first = translated.split(/[.!?](\s|$)/)[0];
                  return first || translated;
                }
                return undefined;
              })(),
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
              primary: translateEnum(t, exposure?.reputation?.impact_rating || t("observationWorkspace.severityLow")),
              secondary: (() => {
                const rank = exposure?.reputation?.reputation_impact_score;
                const translated = translateCriticalityDefinitionText({
                  criticalityDefs,
                  rank,
                  field: "reputation",
                  fallbackText: exposure?.reputation?.definition,
                  t,
                });
                if (translated) {
                  const first = translated.split(/[.!?](\s|$)/)[0];
                  return first || translated;
                }
                return undefined;
              })(),
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
        <ObservationDetailsSection threatId={id} workspaceObservation={observation} />

        {/* Row 2: Equipment Reliability Timeline */}
        <EquipmentReliabilityTimeline 
          events={timeline?.events} 
          aiEvidence={timeline?.ai_evidence}
        />

        {/* Row 3: Main Work Area - 3 Columns on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-6">
          {/* Column 1: Reliability Intelligence (desktop only) */}
          <div className="hidden lg:block">
            <ReliabilityIntelligencePanel 
              intelligence={reliability_intelligence}
              onViewFullAnalysis={handleViewFullAnalysis}
              threatId={id}
              threatData={observation}
            />
          </div>

          {/* Column 2: Recommended Actions */}
          <RecommendedActionsPanel 
            recommendations={recommended_actions}
            onAddToPlan={handleAddToPlan}
            onAddToStrategy={handleAddToStrategy}
            onGenerateAI={handleGenerateAI}
            isGeneratingAI={generateAIMutation.isPending}
          />

          {/* Column 3: Action Plan */}
          <ActionPlanPanel 
            actions={action_plan}
            onViewAll={handleViewAllActions}
            onEditAction={handleEditAction}
            onDeleteAction={handleDeleteAction}
            onAddAction={handleCreateAction}
            isCreating={createActionMutation.isPending}
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
          <div className="flex flex-col gap-4 pt-2">
            <AIInsightsPanel threatId={id} threatData={observation} hideRecommendations autoGenerate />
            <CausalIntelligencePanel threatId={id} threatData={observation} autoGenerate />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ObservationWorkspacePage;
