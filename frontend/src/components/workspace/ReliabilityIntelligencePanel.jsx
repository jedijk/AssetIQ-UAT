import { useState } from "react";
import { Brain, Check, Eye } from "lucide-react";
import { Button } from "../ui/button";
import { useLanguage } from "../../contexts/LanguageContext";

export function ReliabilityIntelligencePanel({ intelligence, onViewFullAnalysis, threatId, threatData }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto scrollbar-thin" data-testid="workspace-reliability-intelligence">
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
