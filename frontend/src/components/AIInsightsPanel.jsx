import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { aiRiskAPI, actionsAPI } from "../lib/api";
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

const RiskGauge = ({ score, size = "md" }) => {
  const getColor = (s) => {
    if (s >= 70) return "#ef4444";
    if (s >= 50) return "#f97316";
    if (s >= 30) return "#eab308";
    return "#22c55e";
  };
  
  const sizeConfig = {
    sm: { width: 60, height: 60, stroke: 6, fontSize: "text-sm" },
    md: { width: 80, height: 80, stroke: 8, fontSize: "text-lg" },
    lg: { width: 100, height: 100, stroke: 10, fontSize: "text-2xl" },
  };
  
  const cfg = sizeConfig[size];
  const radius = (cfg.width - cfg.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  
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

const ForecastChart = ({ forecasts, t }) => {
  if (!forecasts || forecasts.length === 0) return null;
  
  const maxScore = Math.max(...forecasts.map(f => f.predicted_risk_score), 100);
  
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
                    className={`w-full rounded-t transition-all ${
                      forecast.predicted_risk_score >= 70 ? "bg-red-400" :
                      forecast.predicted_risk_score >= 50 ? "bg-orange-400" :
                      forecast.predicted_risk_score >= 30 ? "bg-yellow-400" : "bg-green-400"
                    }`}
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
  
  // Mutation to analyze risk
  const analyzeMutation = useMutation({
    mutationFn: () => aiRiskAPI.analyzeRisk(threatId, { includeForecast: true, includeSimilarIncidents: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-insights", threatId] });
      setAddedRecommendations(new Set()); // Reset added state on new analysis
    },
  });

  // Mutation to create action from recommendation
  const createActionMutation = useMutation({
    mutationFn: (recommendation) => actionsAPI.create({
      title: recommendation.substring(0, 100),
      description: recommendation,
      source_type: "ai_recommendation",
      source_id: threatId,
      source_name: threatData?.title || "AI Risk Analysis",
      priority: threatData?.risk_level === "Critical" ? "critical" : 
               threatData?.risk_level === "High" ? "high" : "medium",
    }),
    onSuccess: (_, recommendation) => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      setAddedRecommendations(prev => new Set([...prev, recommendation]));
      toast.success(t("ai.actionCreated"));
    },
    onError: () => {
      toast.error("Failed to create action");
    },
  });

  const handleAddAsAction = (recommendation) => {
    createActionMutation.mutate(recommendation);
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
          <RiskGauge score={displayData.risk_score} size="sm" />
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
                
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <Clock className="w-3 h-3" />
                    {t("ai.timeToFailure")}
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {displayData.time_to_failure_display || t("ai.unknown")}
                  </div>
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
                      const isAdded = addedRecommendations.has(rec);
                      return (
                        <div 
                          key={idx} 
                          className="flex items-start gap-2 p-2 bg-white rounded-lg border border-slate-100 group hover:border-green-200 transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 flex-shrink-0" />
                          <p className="text-sm text-slate-700 flex-1">{rec}</p>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAddAsAction(rec)}
                                  disabled={createActionMutation.isPending || isAdded}
                                  className={`flex-shrink-0 h-7 px-2 ${
                                    isAdded 
                                      ? "text-green-600 bg-green-50" 
                                      : "text-slate-400 hover:text-green-600 hover:bg-green-50 opacity-0 group-hover:opacity-100"
                                  } transition-all`}
                                  data-testid={`add-recommendation-${idx}`}
                                >
                                  {createActionMutation.isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : isAdded ? (
                                    <Check className="w-3.5 h-3.5" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{isAdded ? t("ai.addedAsAction") : t("ai.addAsAction")}</p>
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
