import React from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "../../ui/card";

export default function StrategyAIRecommendations({ t, onGenerate, isPending }) {
  return (
    <Card className="border-dashed border-2 border-slate-300" data-testid="strategy-ai-recommendations-empty">
      <div className="p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700 mb-2">{t("maintenance.noStrategyDefined")}</h3>
        <p className="text-sm text-slate-500 mb-4">{t("maintenance.createStrategyTemplate")}</p>
        {onGenerate && (
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            onClick={onGenerate}
            disabled={isPending}
          >
            {isPending ? t("common.loading") : t("maintenance.generateStrategyCta", "Generate Strategy")}
          </button>
        )}
      </div>
    </Card>
  );
}
