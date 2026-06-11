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
import { observationWorkspaceAPI, actionsAPI, refreshObservationWorkspace } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { aiRiskAPI } from "../lib/apis/aiRisk";
import { showAiMutationError } from "../lib/aiMutationErrors";
import { useLanguage } from "../contexts/LanguageContext";
import { useDisciplines } from "../hooks/useDisciplines";
import RiskBadge from "../components/RiskBadge";
import ObservationDetailsSection from "../components/workspace/ObservationDetailsSection";
import { ALARPCard, ExposureCard, RiskSummaryCard } from "../components/workspace/ExposureCards";
import { EquipmentReliabilityTimeline } from "../components/workspace/EquipmentReliabilityTimeline";
import { ReliabilityIntelligencePanel } from "../components/workspace/ReliabilityIntelligencePanel";
import { RecommendedActionsPanel } from "../components/workspace/RecommendedActionsPanel";
import ActionPlanPanel from "../components/workspace/ActionPlanPanel";
import AIInsightsPanel from "../components/AIInsightsPanel";
import CausalIntelligencePanel from "../components/CausalIntelligencePanel";
import { translateEnum } from "../lib/translateEnum";
import {
  translateCriticalityDefinitionText,
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

  const refreshWorkspace = () => refreshObservationWorkspace(queryClient, id);

  // Add recommendation to plan mutation
  const addRecommendationMutation = useMutation({
    mutationFn: (recommendation) => observationWorkspaceAPI.addRecommendation(id, recommendation),
    onSuccess: async (data) => {
      await refreshWorkspace();
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
    onSuccess: async () => {
      await refreshWorkspace();
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
    onSuccess: async () => {
      await refreshWorkspace();
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
    onSuccess: async () => {
      await refreshWorkspace();
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success(t("observationWorkspace.actionAddedToPlan"));
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || t("observationWorkspace.actionAddFailed"));
    },
  });

  const generateAIMutation = useMutation({
    mutationFn: () => aiRiskAPI.analyzeRisk(id, { includeForecast: true, includeSimilarIncidents: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-insights", id] });
      await queryClient.refetchQueries({ queryKey: ["ai-insights", id], type: "active" });
      await refreshWorkspace();
      toast.success(t("ai.analysisComplete") || "AI analysis complete");
    },
    onError: (error) => {
      showAiMutationError(error, t);
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
    setRiskStepComplete(false);
    setShowAnalysisDialog(true);
  };

  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [riskStepComplete, setRiskStepComplete] = useState(false);

  const handleAnalysisDialogChange = (open) => {
    setShowAnalysisDialog(open);
    if (!open) {
      setRiskStepComplete(false);
    }
  };

  const handleRiskStepReady = () => {
    setRiskStepComplete(true);
  };

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
      <Dialog open={showAnalysisDialog} onOpenChange={handleAnalysisDialogChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="full-analysis-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              {t("observationWorkspace.fullReliabilityAnalysis")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <AIInsightsPanel
              threatId={id}
              threatData={observation}
              hideRecommendations
              autoGenerate
              onRiskReady={handleRiskStepReady}
              onAnalysisComplete={refreshWorkspace}
            />
            <CausalIntelligencePanel
              threatId={id}
              threatData={observation}
              autoGenerate
              autoGenerateEnabled={riskStepComplete}
              onAnalysisComplete={refreshWorkspace}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ObservationWorkspacePage;
