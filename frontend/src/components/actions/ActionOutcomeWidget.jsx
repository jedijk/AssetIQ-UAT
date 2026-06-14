/**
 * Action outcome widget — "Did it work?" for closed actions.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { actionsAPI } from "../../lib/apis/actions";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";

const OUTCOME_CONFIG = {
  successful: {
    label: "Successful",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle2,
  },
  neutral: {
    label: "Neutral",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Minus,
  },
  unsuccessful: {
    label: "Unsuccessful",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: AlertTriangle,
  },
};

function formatCurrency(value, currency = "EUR") {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

function MetricCell({ label, value, sublabel, trend }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-slate-400";

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-lg font-semibold text-slate-900">{value}</span>
        {trend && <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />}
      </div>
      {sublabel && <div className="mt-0.5 text-[10px] text-slate-500">{sublabel}</div>}
    </div>
  );
}

export function ActionOutcomeWidget({ actionId, actionStatus }) {
  const isClosed = ["completed", "closed"].includes((actionStatus || "").toLowerCase());

  const { data, isLoading, error } = useQuery({
    queryKey: ["action-outcome", actionId],
    queryFn: () => actionsAPI.getOutcome(actionId),
    enabled: Boolean(actionId),
    staleTime: 120_000,
  });

  const outcomeKey = data?.outcome_status;
  const outcomeMeta = OUTCOME_CONFIG[outcomeKey] || OUTCOME_CONFIG.neutral;
  const OutcomeIcon = outcomeMeta.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            Action Outcome
          </CardTitle>
          {data?.status === "assessed" && (
            <Badge variant="outline" className={`text-xs ${outcomeMeta.color}`}>
              <OutcomeIcon className="w-3 h-3 mr-1" />
              {outcomeMeta.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Assessing outcome…
          </div>
        )}

        {!isLoading && error && (
          <div className="text-sm text-red-600 py-2">Unable to load outcome assessment.</div>
        )}

        {!isLoading && !error && data?.status === "pending" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Assessment pending</p>
              <p className="text-xs mt-0.5 text-amber-700">
                {data.message ||
                  "Complete this action to see whether risk and exposure improved."}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !error && data?.status === "insufficient_data" && (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <HelpCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{data.message || "Insufficient data to assess this action outcome."}</p>
          </div>
        )}

        {!isLoading && !error && data?.status === "assessed" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCell
                label="Risk reduction"
                value={`${data.risk_reduction_pct > 0 ? "+" : ""}${data.risk_reduction_pct}%`}
                trend={data.risk_reduction_pct > 0 ? "up" : data.risk_reduction_pct < 0 ? "down" : null}
              />
              <MetricCell
                label={data.exposure_label || "Exposure reduction"}
                value={formatCurrency(data.exposure_reduction, data.currency)}
                sublabel="Based on production criticality proxy"
              />
              <MetricCell
                label="Repeat failures"
                value={String(data.repeat_failure_count ?? 0)}
                sublabel="Same failure mode after action"
                trend={data.repeat_failure_count > 0 ? "down" : null}
              />
              <MetricCell
                label="Window"
                value="90 days"
                sublabel={data.closure_date ? `Since ${new Date(data.closure_date).toLocaleDateString()}` : undefined}
              />
            </div>

            {!isClosed && (
              <p className="text-[10px] text-slate-400">
                Action still open — metrics reflect latest available data.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
