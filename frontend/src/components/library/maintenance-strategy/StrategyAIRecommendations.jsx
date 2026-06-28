import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../lib/apiClient";
import AIRecommendationCard from "../../ai/AIRecommendationCard";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

export default function StrategyAIRecommendations({
  t,
  onGenerate,
  isPending,
  equipmentTypeId,
  equipmentTypeName,
  failureModes = [],
}) {
  const [aiPayload, setAiPayload] = useState(null);

  const generateAiMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(
        "/ai-suggestions/failure-modes",
        {
          equipment_type_ids: [equipmentTypeId],
          existing_failure_modes: failureModes.slice(0, 150).map((fm) => ({
            id: fm.id,
            failure_mode: fm.failure_mode || fm.name,
            category: fm.category,
            keywords: fm.keywords?.slice(0, 5),
            severity: fm.severity,
            occurrence: fm.occurrence,
            detectability: fm.detectability,
            equipment_type_ids: fm.equipment_type_ids,
          })),
        },
        { timeout: 120000 },
      );
      return response.data;
    },
    onSuccess: (data) => {
      setAiPayload(data);
      const count = data?.total_suggestions ?? data?.recommendations?.length ?? 0;
      toast.success(
        count
          ? t("maintenance.strategyAiGenerated", `Generated ${count} AI mapping suggestions`)
          : t("maintenance.strategyAiGeneratedEmpty", "AI analysis complete"),
      );
    },
    onError: (err) => {
      toast.error(
        err.response?.data?.detail ||
          t("maintenance.strategyAiFailed", "Failed to generate AI recommendations"),
      );
    },
  });

  const isGeneratingAi = generateAiMutation.isPending;
  const suggestions = aiPayload?.suggestions || [];
  const cardRecommendations =
    aiPayload?.recommendations ||
    suggestions.flatMap((group) =>
      (group.suggested_failure_modes || []).map((fm) => ({
        action: fm.failure_mode_name || fm.failure_mode,
        reasoning: fm.reasoning,
        confidence: fm.confidence,
      })),
    );

  return (
    <Card className="border-dashed border-2 border-slate-300" data-testid="strategy-ai-recommendations">
      <CardHeader className="pb-3 text-center">
        <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-2" />
        <CardTitle className="text-lg">{t("maintenance.noStrategyDefined")}</CardTitle>
        <CardDescription>{t("maintenance.createStrategyTemplate")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => generateAiMutation.mutate()}
            disabled={isGeneratingAi || !equipmentTypeId}
            data-testid="strategy-generate-ai-btn"
          >
            {isGeneratingAi ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {t("maintenance.generateStrategyAi", "Generate AI Recommendations")}
              </>
            )}
          </Button>
          {onGenerate && (
            <Button
              type="button"
              onClick={onGenerate}
              disabled={isPending}
              data-testid="strategy-create-template-btn"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("maintenance.generateStrategyCta", "Generate Strategy")
              )}
            </Button>
          )}
        </div>

        {aiPayload && (
          <div className="space-y-3" data-testid="strategy-ai-results">
            <AIRecommendationCard
              payload={{
                ...aiPayload,
                summary:
                  aiPayload.summary ||
                  (equipmentTypeName
                    ? `AI failure-mode mapping suggestions for ${equipmentTypeName}`
                    : undefined),
                recommendations: cardRecommendations,
              }}
              compact
            />
            {suggestions.length > 0 && (
              <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 space-y-2">
                {suggestions.map((group) => (
                  <div key={group.equipment_type_id}>
                    {group.ai_reasoning && <p>{group.ai_reasoning}</p>}
                    <p className="text-slate-500 mt-1">
                      {(group.suggested_failure_modes || []).length}{" "}
                      {t("maintenance.failureModesLabel", "failure modes")} suggested
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
