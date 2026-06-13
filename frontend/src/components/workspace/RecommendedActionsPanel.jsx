import { useState } from "react";
import { Check, Lightbulb, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useLanguage } from "../../contexts/LanguageContext";
import { useDisciplines } from "../../hooks/useDisciplines";

function RecommendedActionCard({ action, onAddToPlan, onAddToStrategy, isAdding, isInPlan }) {
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
          data-testid="recommended-action-add-btn"
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
export function RecommendedActionsPanel({ recommendations, onAddToPlan, onAddToStrategy, onGenerateAI, isGeneratingAI }) {
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
    <div className="bg-white rounded-xl border border-slate-200 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto scrollbar-thin" data-testid="recommended-actions-panel">
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
          {onGenerateAI && (
            <div className="relative group flex-shrink-0" data-testid="recommended-actions-ai-control">
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
                <p className="text-slate-300">
                  {aiActions.length > 0
                    ? t("observationWorkspace.regenerateAiRecommendationsHint")
                    : t("observationWorkspace.generateAiRecommendationsHint")}
                </p>
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