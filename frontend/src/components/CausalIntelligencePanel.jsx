import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { aiRiskAPI } from "../lib/api";
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
} from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";

const CATEGORY_CONFIG = {
  technical_cause: { icon: Cog, label: "Technical", color: "text-blue-600", bg: "bg-blue-100" },
  human_factor: { icon: Users, label: "Human Factor", color: "text-purple-600", bg: "bg-purple-100" },
  maintenance_issue: { icon: Wrench, label: "Maintenance", color: "text-orange-600", bg: "bg-orange-100" },
  design_issue: { icon: Building, label: "Design Issue", color: "text-red-600", bg: "bg-red-100" },
  organizational_factor: { icon: Network, label: "Organizational", color: "text-indigo-600", bg: "bg-indigo-100" },
  external_condition: { icon: Cloud, label: "External", color: "text-cyan-600", bg: "bg-cyan-100" },
};

const ProbabilityBadge = ({ level, probability }) => {
  const colors = {
    very_likely: "bg-red-100 text-red-700 border-red-200",
    likely: "bg-orange-100 text-orange-700 border-orange-200",
    possible: "bg-yellow-100 text-yellow-700 border-yellow-200",
    unlikely: "bg-green-100 text-green-700 border-green-200",
  };
  
  const labels = {
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

const CauseCard = ({ cause, index }) => {
  const [expanded, setExpanded] = useState(index === 0);
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
            <ProbabilityBadge level={cause.probability_level} probability={cause.probability} />
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
                  <h6 className="text-xs font-medium text-slate-500 mb-1">Supporting Evidence</h6>
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
                  <h6 className="text-xs font-medium text-slate-500 mb-1">Recommended Mitigations</h6>
                  <ul className="space-y-1">
                    {cause.mitigation_actions.map((action, idx) => (
                      <li key={idx} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <Wrench className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                        {action}
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

export default function CausalIntelligencePanel({ threatId }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  
  // Fetch existing causal analysis
  const { data: causalData, isLoading: loadingCausal, error: causalError } = useQuery({
    queryKey: ["ai-causal", threatId],
    queryFn: () => aiRiskAPI.getCausalAnalysis(threatId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  
  // Mutation to generate causes
  const generateMutation = useMutation({
    mutationFn: () => aiRiskAPI.generateCauses(threatId, { maxCauses: 5 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-causal", threatId] });
    },
  });
  
  const handleGenerate = () => {
    generateMutation.mutate();
  };
  
  // No analysis yet - show generate button
  if (causalError && !generateMutation.isPending && !generateMutation.data) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold text-slate-900">Causal Intelligence</h4>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          AI-powered root cause analysis to understand why this is happening.
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
              Analyzing causes...
            </>
          ) : (
            <>
              <HelpCircle className="w-4 h-4 mr-2" />
              Why is this happening?
            </>
          )}
        </Button>
      </div>
    );
  }
  
  // Loading state
  if (loadingCausal || generateMutation.isPending) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Analyzing root causes...</span>
        </div>
      </div>
    );
  }
  
  // Display data
  const displayData = generateMutation.data || causalData;
  const probableCauses = displayData?.probable_causes || [];
  const contributingFactors = displayData?.contributing_factors || [];
  const summary = displayData?.summary || "";
  
  if (!displayData || probableCauses.length === 0) {
    return null;
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
            <h4 className="font-semibold text-slate-900">Causal Intelligence</h4>
            <p className="text-xs text-slate-500">
              {probableCauses.length} probable cause{probableCauses.length !== 1 ? 's' : ''} identified
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
                  Probable Causes (ranked by likelihood)
                </h5>
                {probableCauses.map((cause, idx) => (
                  <CauseCard key={cause.id || idx} cause={cause} index={idx} />
                ))}
              </div>
              
              {/* Contributing Factors */}
              {contributingFactors.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-500 mb-2">Contributing Factors</h5>
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
              
              {/* Confidence */}
              <div className="text-xs text-slate-400 text-right">
                Analysis confidence: <span className="capitalize font-medium">{displayData.confidence}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
