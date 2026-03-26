import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { aiRiskAPI, threatsAPI, equipmentHierarchyAPI, failureModesAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Clock,
  Target,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Zap,
  BarChart3,
  HelpCircle,
  Plus,
  Check,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const TrendIcon = ({ trend, t }) => {
  switch (trend) {
    case "increasing":
      return <TrendingUp className="w-4 h-4 text-red-500" />;
    case "decreasing":
      return <TrendingDown className="w-4 h-4 text-green-500" />;
    default:
      return <Minus className="w-4 h-4 text-slate-400" />;
  }
};

const getTrendLabel = (trend, t) => {
  switch (trend) {
    case "increasing": return t("ai.increasing");
    case "decreasing": return t("ai.decreasing");
    default: return t("ai.stable");
  }
};

const ConfidenceBadge = ({ confidence, t }) => {
  const colors = {
    high: "bg-green-100 text-green-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-red-100 text-red-700",
  };
  const labels = {
    high: t ? t("ai.highConfidence") : "High confidence",
    medium: t ? t("ai.mediumConfidence") : "Medium confidence",
    low: t ? t("ai.lowConfidence") : "Low confidence",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[confidence] || colors.medium}`}>
      {labels[confidence] || labels.medium}
    </span>
  );
};

const RiskGauge = ({ score, size = "md", maxScore = 250 }) => {
  // Color thresholds based on threat's FMEA scoring (10-250 scale)
  // Critical >= 150, High >= 100, Medium >= 50, Low < 50
  const getColor = (s) => {
    if (s >= 150) return "#ef4444"; // Critical - Red
    if (s >= 100) return "#f97316"; // High - Orange
    if (s >= 50) return "#eab308";  // Medium - Yellow
    return "#22c55e";               // Low - Green
  };
  
  const sizeConfig = {
    sm: { width: 60, height: 60, stroke: 6, fontSize: "text-sm" },
    md: { width: 80, height: 80, stroke: 8, fontSize: "text-lg" },
    lg: { width: 100, height: 100, stroke: 10, fontSize: "text-2xl" },
  };
  
  const cfg = sizeConfig[size];
  const radius = (cfg.width - cfg.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Normalize score to 0-1 range for progress calculation (max score is 250)
  const normalizedScore = Math.min(score / maxScore, 1);
  const progress = normalizedScore * circumference;
  
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={cfg.width} height={cfg.width} className="-rotate-90">
        <circle
          cx={cfg.width / 2}
          cy={cfg.width / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={cfg.stroke}
        />
        <circle
          cx={cfg.width / 2}
          cy={cfg.width / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={cfg.stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className={`absolute ${cfg.fontSize} font-bold text-slate-900`}>{score}</span>
    </div>
  );
};

const ForecastChart = ({ forecasts, t, currentScore = 60 }) => {
  if (!forecasts || forecasts.length === 0) return null;
  
  // Use 250 as max for FMEA scale (5×5×10)
  const maxScore = 250;
  
  // Color thresholds based on FMEA scoring: Critical >= 150, High >= 100, Medium >= 50
  const getBarColor = (score) => {
    if (score >= 150) return "bg-red-400";
    if (score >= 100) return "bg-orange-400";
    if (score >= 50) return "bg-yellow-400";
    return "bg-green-400";
  };
  
  return (
    <div className="mt-3">
      <h5 className="text-xs font-medium text-slate-500 mb-2">{t("ai.riskForecast")}</h5>
      <div className="flex items-end gap-2 h-16">
        {forecasts.map((forecast, idx) => (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t transition-all ${getBarColor(forecast.predicted_risk_score)}`}
                    style={{ height: `${(forecast.predicted_risk_score / maxScore) * 100}%`, minHeight: '4px' }}
                  />
                  <span className="text-[10px] text-slate-400">{forecast.days_ahead}d</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm">
                  <strong>Day {forecast.days_ahead}:</strong> Score {forecast.predicted_risk_score}, {forecast.predicted_probability}% probability
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  );
};

export default function AIInsightsPanel({ threatId, threatData, compact = false }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(!compact);
  const [addedRecommendations, setAddedRecommendations] = useState(new Set());
  
  // Fetch existing insights
  const { data: insights, isLoading: loadingInsights, error: insightsError } = useQuery({
    queryKey: ["ai-insights", threatId],
    queryFn: () => aiRiskAPI.getRiskInsights(threatId),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch equipment types to check if threat's equipment type exists
  const { data: equipmentTypesData } = useQuery({
    queryKey: ["equipment-types"],
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch failure modes to check if threat's failure mode exists
  const { data: failureModesData } = useQuery({
    queryKey: ["failure-modes-all"],
    queryFn: () => failureModesAPI.getAll({}),
    staleTime: 5 * 60 * 1000,
  });

  // Check if equipment type exists in library - use fuzzy matching
  const equipmentTypes = equipmentTypesData?.equipment_types || [];
  const equipmentTypeExists = threatData?.equipment_type 
    ? equipmentTypes.some(et => {
        const threatET = threatData.equipment_type.toLowerCase();
        const libraryET = et.name.toLowerCase();
        // Exact match
        if (libraryET === threatET) return true;
        // Partial match - library contains threat ET or vice versa
        if (libraryET.includes(threatET) || threatET.includes(libraryET)) return true;
        // Word-level match
        const threatWords = threatET.split(/[\s\-_]+/).filter(w => w.length > 3);
        const libraryWords = libraryET.split(/[\s\-_]+/).filter(w => w.length > 3);
        const matchingWords = threatWords.filter(tw => 
          libraryWords.some(lw => lw.includes(tw) || tw.includes(lw))
        );
        return matchingWords.length >= 1;
      })
    : true; // If no equipment type specified, don't show warning

  // Check if failure mode exists in library - use fuzzy matching
  const failureModes = failureModesData?.failure_modes || [];
  const failureModeExists = threatData?.failure_mode
    ? failureModes.some(fm => {
        const threatFM = threatData.failure_mode.toLowerCase();
        const libraryFM = fm.failure_mode.toLowerCase();
        // Exact match
        if (libraryFM === threatFM) return true;
        // Partial match - library contains threat FM or vice versa
        if (libraryFM.includes(threatFM) || threatFM.includes(libraryFM)) return true;
        // Word-level match - check if key words match
        const threatWords = threatFM.split(/[\s\-_]+/).filter(w => w.length > 3);
        const libraryWords = libraryFM.split(/[\s\-_]+/).filter(w => w.length > 3);
        const matchingWords = threatWords.filter(tw => 
          libraryWords.some(lw => lw.includes(tw) || tw.includes(lw))
        );
        return matchingWords.length >= Math.min(2, threatWords.length);
      })
    : true; // If no failure mode specified, don't show warning

  const hasMissingLibraryData = !equipmentTypeExists || !failureModeExists;
  
  // Mutation to analyze risk
  const analyzeMutation = useMutation({
    mutationFn: () => aiRiskAPI.analyzeRisk(threatId, { includeForecast: true, includeSimilarIncidents: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-insights", threatId] });
      setAddedRecommendations(new Set()); // Reset added state on new analysis
    },
  });

  // Mutation to add recommendation to threat
  const addRecommendationMutation = useMutation({
    mutationFn: async (recommendation) => {
      // Get current recommendations and add the new one
      const currentRecommendations = threatData?.recommended_actions || [];
      // Avoid duplicates
      if (currentRecommendations.includes(recommendation)) {
        throw new Error("Recommendation already exists");
      }
      const updatedRecommendations = [...currentRecommendations, recommendation];
      return threatsAPI.update(threatId, { recommended_actions: updatedRecommendations });
    },
    onSuccess: (_, recommendation) => {
      queryClient.invalidateQueries({ queryKey: ["threat", threatId] });
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      setAddedRecommendations(prev => new Set([...prev, recommendation]));
      toast.success(t("ai.recommendationAdded") || "Recommendation added to threat!");
    },
    onError: (error) => {
      if (error.message === "Recommendation already exists") {
        toast.info(t("ai.recommendationExists") || "Recommendation already exists");
      } else {
        toast.error(t("ai.recommendationFailed") || "Failed to add recommendation");
      }
    },
  });

  const handleAddRecommendation = (recommendation) => {
    addRecommendationMutation.mutate(recommendation);
  };
  
  const riskData = insights?.dynamic_risk;
  const forecasts = insights?.forecasts || [];
  const keyInsights = insights?.key_insights || [];
  const recommendations = insights?.recommendations || [];
  
  const handleAnalyze = () => {
    analyzeMutation.mutate();
  };
  
  // No insights yet - show analyze button
  if (insightsError && !analyzeMutation.isPending && !analyzeMutation.data) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-600" />
            <h4 className="font-semibold text-slate-900">{t("ai.riskAnalysis")}</h4>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {t("ai.riskAnalysis")}
        </p>
        <Button 
          onClick={handleAnalyze}
          disabled={analyzeMutation.isPending}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          data-testid="analyze-risk-btn"
        >
          {analyzeMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("ai.analyzing")}
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              {t("ai.analyzeWithAi")}
            </>
          )}
        </Button>
      </div>
    );
  }
  
  // Loading state
  if (loadingInsights || analyzeMutation.isPending) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Analyzing threat...</span>
        </div>
      </div>
    );
  }
  
  // Show insights
  const displayData = analyzeMutation.data?.dynamic_risk || riskData;
  const displayForecasts = analyzeMutation.data?.forecasts || forecasts;
  const displayInsights = analyzeMutation.data?.key_insights || keyInsights;
  const displayRecommendations = analyzeMutation.data?.recommendations || recommendations;
  
  // Use the threat's actual risk score for consistency
  const threatRiskScore = threatData?.risk_score || displayData?.risk_score || 0;
  
  if (!displayData) {
    return null;
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-indigo-50/50 to-slate-50 rounded-xl border border-indigo-200 overflow-hidden"
      data-testid="ai-insights-panel"
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-indigo-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Brain className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">{t("ai.riskAnalysis")}</h4>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <TrendIcon trend={displayData.trend} t={t} />
              <span className="capitalize">{getTrendLabel(displayData.trend, t)}</span>
              <span className="text-slate-300">|</span>
              <ConfidenceBadge confidence={displayData.confidence} t={t} />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <RiskGauge score={threatRiskScore} size="sm" />
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleAnalyze();
            }}
            disabled={analyzeMutation.isPending}
            className="text-slate-400 hover:text-indigo-600"
          >
            <RefreshCw className={`w-4 h-4 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
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
            className="border-t border-indigo-100"
          >
            <div className="p-4 space-y-4">
              {/* Missing Library Data Warning */}
              {hasMissingLibraryData && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3" data-testid="missing-library-warning">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h5 className="text-sm font-medium text-amber-800 mb-1">
                        {t("ai.missingLibraryData") || "Missing Library Data"}
                      </h5>
                      <p className="text-xs text-amber-700 mb-2">
                        {t("ai.missingLibraryDataDesc") || "The following items are not in your library. Add them for better AI analysis accuracy:"}
                      </p>
                      <ul className="space-y-1 mb-3">
                        {!equipmentTypeExists && (
                          <li className="text-xs text-amber-700 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>
                              <strong>{t("common.equipmentType") || "Equipment Type"}:</strong> "{threatData?.equipment_type}"
                            </span>
                          </li>
                        )}
                        {!failureModeExists && (
                          <li className="text-xs text-amber-700 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>
                              <strong>{t("common.failureMode") || "Failure Mode"}:</strong> "{threatData?.failure_mode}"
                            </span>
                          </li>
                        )}
                      </ul>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/library")}
                        className="bg-white text-amber-700 border-amber-300 hover:bg-amber-100 hover:text-amber-800"
                        data-testid="go-to-library-btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        {t("ai.goToLibrary") || "Go to Library"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Key Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <Target className="w-3 h-3" />
                    {t("ai.failureProbability")}
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {displayData.failure_probability?.toFixed(0)}%
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <Clock className="w-3 h-3" />
                    {t("ai.timeToFailure")}
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-sm font-bold text-slate-900 line-clamp-2 cursor-default">
                          {displayData.time_to_failure_display || t("ai.unknown")}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs">{displayData.time_to_failure_display || t("ai.unknown")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <BarChart3 className="w-3 h-3" />
                    {t("ai.trendChange")}
                  </div>
                  <div className={`text-lg font-bold ${displayData.trend_delta > 0 ? 'text-red-600' : displayData.trend_delta < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                    {displayData.trend_delta > 0 ? '+' : ''}{displayData.trend_delta || 0}
                  </div>
                </div>
              </div>
              
              {/* Risk Factors */}
              {displayData.factors && displayData.factors.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {t("ai.keyRiskFactors")}
                  </h5>
                  <ul className="space-y-1">
                    {displayData.factors.map((factor, idx) => (
                      <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Forecasts */}
              <ForecastChart forecasts={displayForecasts} t={t} />
              
              {/* Key Insights */}
              {displayInsights.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <Lightbulb className="w-3 h-3" />
                    {t("ai.keyInsights")}
                  </h5>
                  <ul className="space-y-1">
                    {displayInsights.map((insight, idx) => (
                      <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Recommendations */}
              {displayRecommendations.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    {t("ai.aiRecommendations")}
                  </h5>
                  <div className="space-y-2">
                    {displayRecommendations.map((rec, idx) => {
                      // Handle both string and structured object recommendations
                      const isStructured = typeof rec === 'object' && rec !== null;
                      const actionText = isStructured ? (rec.action || rec.description || '') : rec;
                      const actionType = isStructured ? rec.action_type : null;
                      const discipline = isStructured ? rec.discipline : null;
                      
                      // For comparison, use the full object or string
                      const recKey = isStructured ? JSON.stringify(rec) : rec;
                      const isAdded = addedRecommendations.has(recKey) || 
                        (threatData?.recommended_actions || []).some(existing => {
                          if (typeof existing === 'object' && isStructured) {
                            return existing.action === rec.action;
                          }
                          return existing === rec;
                        });
                      
                      // Action type badge styling
                      const typeStyles = {
                        CM: { bg: 'bg-amber-500', label: 'CM' },
                        PM: { bg: 'bg-blue-500', label: 'PM' },
                        PDM: { bg: 'bg-purple-500', label: 'PDM' },
                      };
                      const typeStyle = actionType ? typeStyles[actionType] : null;
                      
                      return (
                        <div 
                          key={idx} 
                          className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-100 group hover:border-green-200 transition-colors"
                        >
                          {/* Type Badge */}
                          {typeStyle ? (
                            <div className={`w-10 h-10 rounded-lg ${typeStyle.bg} text-white flex items-center justify-center flex-shrink-0`}>
                              <span className="text-xs font-bold">{typeStyle.label}</span>
                            </div>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-green-400 mt-2 flex-shrink-0" />
                          )}
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {discipline && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium mb-1">
                                {discipline}
                              </span>
                            )}
                            <p className="text-sm text-slate-700">{actionText}</p>
                          </div>
                          
                          {/* Add Button */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAddRecommendation(rec)}
                                  disabled={addRecommendationMutation.isPending || isAdded}
                                  className={`flex-shrink-0 h-7 px-2 ${
                                    isAdded 
                                      ? "text-green-600 bg-green-50" 
                                      : "text-slate-400 hover:text-green-600 hover:bg-green-50 opacity-0 group-hover:opacity-100"
                                  } transition-all`}
                                  data-testid={`add-recommendation-${idx}`}
                                >
                                  {addRecommendationMutation.isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : isAdded ? (
                                    <Check className="w-3.5 h-3.5" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{isAdded ? (t("ai.alreadyAdded") || "Already added") : (t("ai.addToThreat") || "Add to threat recommendations")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Last Updated */}
              <div className="text-xs text-slate-400 text-right">
                {t("ai.lastAnalyzed")}: {new Date(displayData.last_updated || insights?.updated_at).toLocaleString()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
