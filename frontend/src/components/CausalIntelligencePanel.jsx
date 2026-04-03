import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { aiRiskAPI, investigationAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  HelpCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Target,
  AlertOctagon,
  Wrench,
  Users,
  Building,
  Cloud,
  Cog,
  Network,
  Shield,
  FileSearch,
} from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";

const getCategoryConfig = (t) => ({
  technical_cause: { icon: Cog, label: t("ai.technicalCause"), color: "text-blue-600", bg: "bg-blue-100" },
  human_factor: { icon: Users, label: t("ai.humanFactor"), color: "text-purple-600", bg: "bg-purple-100" },
  maintenance_issue: { icon: Wrench, label: t("ai.maintenanceIssue"), color: "text-orange-600", bg: "bg-orange-100" },
  design_issue: { icon: Building, label: t("ai.designIssue"), color: "text-red-600", bg: "bg-red-100" },
  organizational_factor: { icon: Network, label: t("ai.organizationalFactor"), color: "text-indigo-600", bg: "bg-indigo-100" },
  external_condition: { icon: Cloud, label: t("ai.externalCondition"), color: "text-cyan-600", bg: "bg-cyan-100" },
});

const getProbabilityLabels = (t) => ({
  very_likely: t("ai.veryLikely"),
  likely: t("ai.likely"),
  possible: t("ai.possible"),
  unlikely: t("ai.unlikely"),
});

const ProbabilityBadge = ({ level, probability, t }) => {
  const colors = {
    very_likely: "bg-red-100 text-red-700 border-red-200",
    likely: "bg-orange-100 text-orange-700 border-orange-200",
    possible: "bg-yellow-100 text-yellow-700 border-yellow-200",
    unlikely: "bg-green-100 text-green-700 border-green-200",
  };
  
  const labels = t ? getProbabilityLabels(t) : {
    very_likely: "Very Likely",
    likely: "Likely",
    possible: "Possible",
    unlikely: "Unlikely",
  };
  
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors[level] || colors.possible}`}>
      {labels[level] || level} ({probability?.toFixed(0)}%)
    </span>
  );
};

const CauseCard = ({ cause, index, t }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const CATEGORY_CONFIG = getCategoryConfig(t);
  const config = CATEGORY_CONFIG[cause.category] || CATEGORY_CONFIG.technical_cause;
  const CategoryIcon = config.icon;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white rounded-lg border border-slate-200 overflow-hidden"
    >
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`p-2 rounded-lg ${config.bg} flex-shrink-0`}>
          <CategoryIcon className={`w-4 h-4 ${config.color}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-400">#{index + 1}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
              {config.label}
            </span>
            <ProbabilityBadge level={cause.probability_level} probability={cause.probability} t={t} />
          </div>
          
          <p className="text-sm text-slate-800 font-medium line-clamp-2">{cause.description}</p>
          
          {/* Probability Bar */}
          <div className="mt-2">
            <Progress value={cause.probability} className="h-1.5" />
          </div>
        </div>
        
        <div className="flex-shrink-0">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-100"
          >
            <div className="p-3 space-y-3 bg-slate-50">
              {/* Evidence */}
              {cause.evidence && cause.evidence.length > 0 && (
                <div>
                  <h6 className="text-xs font-medium text-slate-500 mb-1">{t("ai.supportingEvidence")}</h6>
                  <ul className="space-y-1">
                    {cause.evidence.map((ev, idx) => (
                      <li key={idx} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                        {ev}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Mitigation Actions */}
              {cause.mitigation_actions && cause.mitigation_actions.length > 0 && (
                <div>
                  <h6 className="text-xs font-medium text-slate-500 mb-1">{t("ai.recommendedMitigations")}</h6>
                  <ul className="space-y-1">
                    {cause.mitigation_actions.map((action, idx) => (
                      <li key={idx} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <Wrench className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                        {typeof action === 'string' ? action : action.action || JSON.stringify(action)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default function CausalIntelligencePanel({ threatId, threatData }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(true);
  
  // Fetch existing causal analysis
  const { data: causalData, isLoading: loadingCausal, error: causalError } = useQuery({
    queryKey: ["ai-causal", threatId],
    queryFn: () => aiRiskAPI.getCausalAnalysis(threatId),
    retry: false,
    staleTime: 5 * 60 * 1000,
    // Don't treat 404 as an error - it just means no analysis exists yet
  });
  
  // Mutation to generate causes - works independently of AI Risk Insight
  const generateMutation = useMutation({
    mutationFn: () => aiRiskAPI.generateCauses(threatId, { maxCauses: 5 }),
    onSuccess: (data) => {
      // Update the cache with the new data directly
      queryClient.setQueryData(["ai-causal", threatId], data);
      toast.success(t("ai.analysisComplete") || "Causal analysis complete");
    },
    onError: (error) => {
      console.error("Failed to generate causal analysis:", error);
      
      // Check for timeout errors
      if (error?.isTimeout || error?.code === 'ECONNABORTED') {
        toast.error(t("ai.analysisTakingLonger") || "AI analysis taking longer than expected. Please wait and try again.");
        return;
      }
      
      // Check for specific error types
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to generate causal analysis";
      if (errorMessage.includes("rate limit")) {
        toast.error(t("ai.rateLimitExceeded") || "AI rate limit exceeded. Please wait a moment and try again.");
      } else if (errorMessage.includes("token") || errorMessage.includes("key")) {
        toast.error(t("ai.configurationError") || "AI service configuration error. Please contact support.");
      } else {
        toast.error(t("ai.analysisFailed") || errorMessage);
      }
    },
  });

  // Mutation to create investigation with AI insights
  const createInvestigationMutation = useMutation({
    mutationFn: async (causalAnalysis) => {
      // Create the investigation first
      const investigation = await investigationAPI.create({
        title: `Investigation: ${threatData?.title || 'Unknown Threat'}`,
        description: causalAnalysis?.summary || `AI-powered investigation for ${threatData?.title || 'threat'}. ${causalAnalysis?.probable_causes?.length || 0} probable causes identified.`,
        threat_id: threatId,
        asset_name: threatData?.asset || "",
        incident_date: new Date().toISOString().split('T')[0],
        investigation_leader: "",
      });
      
      // Add AI-generated causes as CauseNodes
      if (causalAnalysis?.probable_causes?.length > 0) {
        for (const cause of causalAnalysis.probable_causes) {
          await investigationAPI.createCause(investigation.id, {
            description: cause.description,
            category: cause.category || "technical_cause",
            is_root_cause: cause.probability >= 60,
            comment: `AI-identified cause (${cause.probability}% probability). Evidence: ${cause.evidence?.join('; ') || 'N/A'}`,
          });
        }
      }
      
      // Add failure identification if available from threat data
      if (threatData?.failure_mode || threatData?.asset) {
        await investigationAPI.createFailure(investigation.id, {
          asset_name: threatData?.asset || "",
          subsystem: "",
          component: "",
          failure_mode: threatData?.failure_mode || "Unknown failure mode",
          degradation_mechanism: "",
          evidence: threatData?.description || "",
          comment: `Auto-populated from threat: ${threatData?.title || 'Unknown'}`,
        });
      }
      
      // Add recommended actions from threat as action items
      const recommendedActions = threatData?.recommended_actions || [];
      if (recommendedActions.length > 0) {
        for (let i = 0; i < recommendedActions.length; i++) {
          const action = recommendedActions[i];
          const actionText = typeof action === 'string' ? action : action.action || '';
          await investigationAPI.createAction(investigation.id, {
            description: actionText,
            owner: "",
            priority: i === 0 ? "high" : "medium",
            due_date: "",
            linked_cause_id: null,
            comment: "Transferred from threat recommendations",
          });
        }
      }
      
      // Add a timeline event for the AI analysis
      await investigationAPI.createEvent(investigation.id, {
        event_time: new Date().toISOString(),
        description: `AI Causal Analysis completed: ${causalAnalysis?.summary || 'Analysis performed'}`,
        category: "operational_event",
      });
      
      return investigation;
    },
    onSuccess: (investigation) => {
      queryClient.invalidateQueries({ queryKey: ["investigations"] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      toast.success(t("ai.investigationCreated"));
      navigate(`/causal-engine?inv=${investigation.id}`);
    },
    onError: (error) => {
      console.error("Failed to create investigation:", error);
      // Show more detailed error message
      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to create investigation";
      toast.error(errorMessage);
    },
  });
  
  const handleGenerate = () => {
    generateMutation.mutate();
  };

  const handleStartInvestigation = () => {
    const displayData = generateMutation.data || causalData;
    createInvestigationMutation.mutate(displayData);
  };
  
  // Display data - check mutation data first (most recent), then cached query data
  const displayData = generateMutation.data || causalData;
  const probableCauses = displayData?.probable_causes || [];
  const contributingFactors = displayData?.contributing_factors || [];
  const summary = displayData?.summary || "";
  
  // Mutation in progress - show analyzing state (check this FIRST)
  if (generateMutation.isPending) {
    return (
      <div className="bg-gradient-to-br from-purple-50/50 to-slate-50 rounded-xl border border-purple-200 p-4">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">{t("ai.analyzingCauses") || "Analyzing root causes..."}</span>
        </div>
      </div>
    );
  }
  
  // If we have display data with causes, show the results (BEFORE checking for no data)
  if (displayData && probableCauses.length > 0) {
    // Results are available - fall through to the main render below
  }
  // Loading state - only show when initially loading AND no mutation data available
  else if (loadingCausal && !generateMutation.data) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">{t("ai.loadingAnalysis") || "Loading analysis..."}</span>
        </div>
      </div>
    );
  }
  // No analysis yet - show generate button (no cached data AND no mutation data)
  else if (!displayData || probableCauses.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold text-slate-900">{t("ai.causalIntelligence")}</h4>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {t("ai.causalIntelligenceDesc") || "Analyze root causes and contributing factors using AI"}
        </p>
        <Button 
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          data-testid="generate-causes-btn"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("ai.analyzingCauses") || "Analyzing causes..."}
            </>
          ) : (
            <>
              <HelpCircle className="w-4 h-4 mr-2" />
              {t("ai.whyIsThisHappening") || "Why is this happening?"}
            </>
          )}
        </Button>
      </div>
    );
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-purple-50/50 to-slate-50 rounded-xl border border-purple-200 overflow-hidden"
      data-testid="causal-intelligence-panel"
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-purple-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <GitBranch className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">{t("ai.causalIntelligence")}</h4>
            <p className="text-xs text-slate-500">
              {probableCauses.length} {t("ai.causesIdentified")}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleGenerate();
            }}
            disabled={generateMutation.isPending}
            className="text-slate-400 hover:text-purple-600"
          >
            <RefreshCw className={`w-4 h-4 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
          {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </div>
      </div>
      
      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-purple-100"
          >
            <div className="p-4 space-y-4">
              {/* Summary */}
              {summary && (
                <div className="bg-white rounded-lg p-3 border border-purple-100">
                  <div className="flex items-start gap-2">
                    <AlertOctagon className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-700">{summary}</p>
                  </div>
                </div>
              )}
              
              {/* Probable Causes */}
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {t("ai.probableCauses")} ({t("ai.rankedByLikelihood")})
                </h5>
                {probableCauses.map((cause, idx) => (
                  <CauseCard key={cause.id || idx} cause={cause} index={idx} t={t} />
                ))}
              </div>
              
              {/* Contributing Factors */}
              {contributingFactors.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-500 mb-2">{t("ai.contributingFactors")}</h5>
                  <div className="flex flex-wrap gap-2">
                    {contributingFactors.map((factor, idx) => (
                      <span 
                        key={idx}
                        className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full"
                      >
                        {factor}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Start Investigation Button */}
              <div className="pt-2 border-t border-purple-100">
                <Button
                  onClick={handleStartInvestigation}
                  disabled={createInvestigationMutation.isPending}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  data-testid="start-investigation-btn"
                >
                  {createInvestigationMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("ai.creatingInvestigation")}
                    </>
                  ) : (
                    <>
                      <FileSearch className="w-4 h-4 mr-2" />
                      {t("ai.startInvestigationWithAi")}
                    </>
                  )}
                </Button>
              </div>
              
              {/* Confidence */}
              <div className="text-xs text-slate-400 text-right">
                {t("ai.analysisConfidence")}: <span className="capitalize font-medium">{displayData.confidence}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
