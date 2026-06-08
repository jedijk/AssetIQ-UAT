/**
 * ObservationWorkspacePage - Reliability Intelligence Workspace
 * 
 * A redesigned observation detail page that tells the story:
 * Asset History → Reliability Intelligence → Exposure → Recommended Actions → Action Plan → ALARP → Learning
 */

import React, { useState, useMemo } from "react";
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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Exposure Card - Shows production, safety, environmental exposure
 */
const ExposureCard = ({ type, data, icon: Icon, color }) => {
  const colorClasses = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    green: "bg-green-50 border-green-200 text-green-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{type}</span>
      </div>
      {data.primary && (
        <div className="text-2xl font-bold mb-1">{data.primary}</div>
      )}
      {data.secondary && (
        <div className="text-xs opacity-80">{data.secondary}</div>
      )}
      {data.tertiary && (
        <div className="text-xs opacity-70">{data.tertiary}</div>
      )}
    </div>
  );
};

/**
 * ALARP Progress Card
 */
const ALARPCard = ({ alarp }) => {
  const percentage = alarp?.percentage || 0;
  const status = alarp?.status || "Not Started";
  
  const getStatusColor = () => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 70) return "text-blue-600";
    if (percentage >= 40) return "text-amber-600";
    return "text-slate-500";
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-medium text-indigo-700 uppercase tracking-wide">ALARP</span>
        </div>
        <Badge variant="outline" className={`text-xs ${getStatusColor()}`}>
          {status}
        </Badge>
      </div>
      <div className="text-4xl font-bold text-indigo-700 mb-2">{percentage}%</div>
      <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
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
    <div className={`rounded-xl border p-4 ${getRiskColor()}`}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide">Risk</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{riskScore}</span>
        <RiskBadge level={riskLevel} size="sm" />
      </div>
      {rpn && (
        <div className="text-xs mt-1 opacity-70">RPN: {rpn}</div>
      )}
    </div>
  );
};

/**
 * Timeline Event Card
 */
const TimelineEventCard = ({ event, isCurrent }) => {
  const navigate = useNavigate();
  
  const getEventConfig = (type) => {
    const configs = {
      observation: { icon: AlertTriangle, color: "amber", label: "Observation" },
      failure: { icon: XCircle, color: "red", label: "Failure" },
      work_order: { icon: Wrench, color: "blue", label: "Work Order" },
      inspection: { icon: Eye, color: "green", label: "Inspection" },
      repair: { icon: Wrench, color: "purple", label: "Repair" },
      investigation: { icon: FileSearch, color: "indigo", label: "Investigation" },
      strategy_change: { icon: Cog, color: "slate", label: "Strategy Change" },
    };
    return configs[type] || configs.observation;
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

  return (
    <div 
      className={`flex flex-col items-center cursor-pointer group min-w-[140px] ${
        isCurrent ? "scale-110" : ""
      }`}
      onClick={handleClick}
    >
      {/* Date */}
      <div className="text-xs text-slate-500 mb-2 font-medium">
        {formatDate(event.date)}
      </div>
      
      {/* Event Circle */}
      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
        isCurrent 
          ? "bg-blue-600 text-white ring-4 ring-blue-200"
          : `bg-${config.color}-100 text-${config.color}-600`
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      
      {/* Event Title */}
      <div className={`text-xs font-medium mt-2 text-center max-w-[120px] truncate ${
        isCurrent ? "text-blue-700" : "text-slate-700"
      }`}>
        {event.title?.substring(0, 25) || config.label}
      </div>
      
      {/* Reference ID */}
      {event.reference_id && (
        <div className="text-[10px] text-slate-400 mt-0.5">
          {event.reference_id}
        </div>
      )}
      
      {/* Current indicator */}
      {isCurrent && (
        <Badge className="mt-1 text-[10px] bg-blue-600">Current</Badge>
      )}
    </div>
  );
};

/**
 * Equipment Reliability Timeline
 */
const EquipmentReliabilityTimeline = ({ events, aiEvidence }) => {
  const [viewMode, setViewMode] = useState("timeline"); // timeline or list
  const navigate = useNavigate();

  // Find current event
  const currentEvent = events?.find(e => e.is_current);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <History className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Equipment Reliability Story</h3>
            <p className="text-xs text-slate-500">Historical context for the asset</p>
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
            Timeline
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="h-8"
          >
            <List className="w-4 h-4 mr-1" />
            List
          </Button>
        </div>
      </div>

      {/* Timeline View */}
      {viewMode === "timeline" && events && events.length > 0 ? (
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute top-[52px] left-0 right-0 h-0.5 bg-slate-200" />
          
          {/* Events */}
          <div className="flex overflow-x-auto pb-4 gap-4 scrollbar-thin scrollbar-thumb-slate-300">
            {events.slice(0, 10).map((event, index) => (
              <React.Fragment key={event.id || index}>
                <TimelineEventCard 
                  event={event} 
                  isCurrent={event.is_current}
                />
                {index < events.length - 1 && index < 9 && (
                  <div className="flex items-center self-center mt-6">
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </React.Fragment>
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
                  <Badge className="bg-blue-600 text-xs">Current</Badge>
                )}
                {event.status && !event.is_current && (
                  <Badge variant="outline" className="text-xs capitalize">{event.status}</Badge>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No historical events found</p>
        </div>
      )}

      {/* AI Evidence Banner */}
      {aiEvidence && (
        <div className="mt-6 flex items-center gap-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            <span className="font-medium text-purple-700 text-sm">AI Analysis Based On:</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <span className="font-bold text-purple-700">{aiEvidence.historical_events || 0}</span>
              <span className="text-purple-600">Historical Events</span>
            </div>
            <div className="h-4 w-px bg-purple-200" />
            <div className="flex items-center gap-1">
              <span className="font-bold text-purple-700">{aiEvidence.similar_assets || 0}</span>
              <span className="text-purple-600">Similar Assets</span>
            </div>
            <div className="h-4 w-px bg-purple-200" />
            <div className="flex items-center gap-1">
              <span className="font-bold text-purple-700">{aiEvidence.previous_failures || 0}</span>
              <span className="text-purple-600">Previous Failures</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-purple-600">Confidence:</span>
            <Badge className="bg-purple-600">{aiEvidence.confidence || 0}%</Badge>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Reliability Intelligence Panel
 */
const ReliabilityIntelligencePanel = ({ intelligence, onViewFullAnalysis }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Brain className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Reliability Intelligence</h3>
          <p className="text-xs text-slate-500">AI-powered root cause analysis</p>
        </div>
      </div>

      {/* Most Likely Cause */}
      <div className="mb-6">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Most Likely Cause
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="font-semibold text-purple-900 text-lg">
            {intelligence?.most_likely_cause?.name || "Unknown"}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="text-sm text-purple-700">
              {intelligence?.most_likely_cause?.confidence || 0}% Confidence
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
          Supporting Evidence
        </div>
        <div className="space-y-2">
          {intelligence?.supporting_evidence && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>{intelligence.supporting_evidence.historical_events || 0} Similar Events</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>{intelligence.supporting_evidence.previous_failures || 0} Previous Failures</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>{intelligence.supporting_evidence.work_orders || 0} Work Orders</span>
              </div>
              {intelligence.supporting_evidence.inspection_evidence && (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>Inspection Evidence</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Contributing Factors */}
      <div className="mb-6">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Contributing Factors
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

      {/* View Full Analysis Button */}
      <Button 
        variant="outline" 
        className="w-full"
        onClick={onViewFullAnalysis}
      >
        <Eye className="w-4 h-4 mr-2" />
        View Full Analysis
      </Button>
    </div>
  );
};

/**
 * Recommended Action Card
 */
const RecommendedActionCard = ({ action, onAddToPlan, onAddToStrategy, isAdding }) => {
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
            Impact: {action.expected_impact}
          </span>
        )}
        {action.confidence && (
          <span className="text-xs text-purple-600">
            {action.confidence}% confidence
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
            Why Recommended
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
          Add To Plan
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddToStrategy(action)}
          className="h-8 text-xs"
        >
          Add To Strategy
        </Button>
      </div>
    </div>
  );
};

/**
 * Recommended Actions Panel
 */
const RecommendedActionsPanel = ({ recommendations, onAddToPlan, onAddToStrategy }) => {
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
    <div className="bg-white rounded-xl border border-slate-200 p-6 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Lightbulb className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Recommended Actions</h3>
          <p className="text-xs text-slate-500">Strategy actions & AI recommendations</p>
        </div>
      </div>

      {/* Library Actions */}
      {libraryActions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs font-medium text-slate-700 uppercase tracking-wide">
              Failure Mode Library
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
              AI Generated
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
          <p className="text-sm">No recommendations available</p>
          <p className="text-xs text-slate-400 mt-1">Link a failure mode to get recommendations</p>
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

  const statusConfig = {
    open: { color: "bg-blue-100 text-blue-700", label: "Open" },
    planned: { color: "bg-purple-100 text-purple-700", label: "Planned" },
    in_progress: { color: "bg-amber-100 text-amber-700", label: "In Progress" },
    completed: { color: "bg-green-100 text-green-700", label: "Completed" },
    validated: { color: "bg-emerald-100 text-emerald-700", label: "Validated" },
  };

  const priorityConfig = {
    critical: "text-red-600",
    high: "text-orange-600",
    medium: "text-amber-600",
    low: "text-green-600",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <ClipboardList className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Action Plan</h3>
            <p className="text-xs text-slate-500">
              {actions?.length || 0} action{actions?.length !== 1 ? "s" : ""} tracked
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onViewAll}>
          View All
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
                    <Badge className={`text-[10px] ${status.color}`}>{status.label}</Badge>
                  </div>
                  <div className="font-medium text-sm text-slate-900 truncate">{action.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    {action.owner && <span>{action.owner}</span>}
                    {action.due_date && (
                      <>
                        <span className={priority}>Due: {format(parseISO(action.due_date), "MMM d")}</span>
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
          <p className="text-sm">No actions in plan</p>
          <p className="text-xs text-slate-400 mt-1">Add recommendations to build your plan</p>
        </div>
      )}
    </div>
  );
};

/**
 * Process Journey Tracker
 */
const ProcessJourney = ({ stages }) => {
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
          <h3 className="font-semibold text-slate-900">Process Journey</h3>
          <p className="text-xs text-slate-500">Track workflow progress</p>
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
                  {stage.stage}
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

  // Fetch workspace data
  const { data: workspace, isLoading, error } = useQuery({
    queryKey: ["observation-workspace", id],
    queryFn: () => observationWorkspaceAPI.getWorkspace(id),
    staleTime: 30 * 1000, // 30 seconds
  });

  // Add recommendation to plan mutation
  const addRecommendationMutation = useMutation({
    mutationFn: (recommendation) => observationWorkspaceAPI.addRecommendation(id, recommendation),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["observation-workspace", id] });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success(data.message || "Action added to plan");
    },
    onError: () => {
      toast.error("Failed to add action");
    },
  });

  // Handlers
  const handleAddToPlan = async (recommendation) => {
    await addRecommendationMutation.mutateAsync(recommendation);
  };

  const handleAddToStrategy = (action) => {
    toast.info("Navigate to Strategy Editor to add action");
    // Could open a dialog or navigate to strategy page
  };

  const handleViewAllActions = () => {
    navigate(`/actions?observation_id=${id}`);
  };

  const handleViewFullAnalysis = () => {
    // Navigate to causal engine or open analysis dialog
    if (workspace?.investigation?.id) {
      navigate(`/causal-engine?id=${workspace.investigation.id}`);
    } else {
      toast.info("Start an investigation for full analysis");
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-500">Loading workspace...</p>
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
            {error?.response?.data?.detail || "Observation not found"}
          </h2>
          <Button onClick={() => navigate("/threats")} variant="outline">
            Back to Observations
          </Button>
        </div>
      </div>
    );
  }

  const { observation, exposure, timeline, reliability_intelligence, recommended_actions, action_plan, process_journey } = workspace;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex items-center gap-4 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/threats")}
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <RiskBadge level={observation?.risk_level} size="sm" />
                <span className="text-xs text-slate-500 font-mono">
                  {observation?.threat_number}
                </span>
              </div>
              <h1 className="font-semibold text-lg text-slate-900 truncate">
                {observation?.title}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/threats/${id}`)}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Classic View
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 max-w-7xl py-6 space-y-6">
        
        {/* Row 1: Risk & Exposure Header */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <ExposureCard
            type="Production Exposure"
            data={{
              primary: exposure?.production?.formatted_value || "$0",
              secondary: `${exposure?.production?.estimated_downtime_hours || 0} Hours Downtime`,
              tertiary: exposure?.production?.deferred_production 
                ? `${exposure.production.deferred_production} ${exposure.production.deferred_production_unit || "bbl"} Deferred`
                : null
            }}
            icon={DollarSign}
            color="amber"
          />
          
          <ExposureCard
            type="Safety Exposure"
            data={{
              primary: `${exposure?.safety?.personnel_exposed || 0} Personnel`,
              secondary: `${exposure?.safety?.severity || "Low"} Severity`,
            }}
            icon={Users}
            color="red"
          />
          
          <ExposureCard
            type="Environmental Impact"
            data={{
              primary: exposure?.environmental?.impact_rating || "Low",
            }}
            icon={Leaf}
            color="green"
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
    </div>
  );
};

export default ObservationWorkspacePage;
