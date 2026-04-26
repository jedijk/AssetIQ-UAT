import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { useMachineAnalysis } from "../hooks/useMachineAnalysis";

export function MachineAnalysisPanel({ api, fromDate, toDate, period }) {
  const [expanded, setExpanded] = useState(false);

  const { analysis, stats, generating, createdAt, analysisRange, error, periodLabel, opt, runAnalysis } =
    useMachineAnalysis({
      api,
      fromDate,
      toDate,
      period,
    });

  const fmtRangeDate = (d) => {
    if (!d || d === "all") return "";
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return d;
    }
  };

  const rangeBadge = useMemo(() => {
    const r = analysisRange || (fromDate && toDate ? { start: fromDate, end: toDate } : null);
    if (!r) return null;
    const s = fmtRangeDate(r.start);
    const e = fmtRangeDate(r.end);
    if (s && e && s !== e) return `${s} — ${e}`;
    if (s) return s;
    return null;
  }, [analysisRange, fromDate, toDate]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5" data-testid="machine-analysis">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-600" />
            AI Machine Settings Analysis
          </h3>
          {analysis && rangeBadge && (
            <Badge className="bg-indigo-100 text-indigo-700 text-[10px] font-medium border-0" data-testid="analysis-date-range">
              {rangeBadge}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {createdAt && (
            <span className="text-[10px] text-slate-400">
              {new Date(createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={runAnalysis} disabled={generating} data-testid="run-analysis-btn">
            {generating ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 mr-1" />
            )}
            {generating ? "Analyzing..." : analysis ? "Re-analyze" : `Analyze ${periodLabel}`}
          </Button>
        </div>
      </div>

      {generating && (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
          Analyzing {stats?.total_samples || "all"} samples across {stats?.total_days || "all"} production days...
        </div>
      )}

      {!generating && !analysis && !error && (
        <div className="text-center py-8">
          <Brain className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Run analysis to get AI-powered recommendations</p>
          <p className="text-xs text-slate-400 mt-1">Based on all historical production data</p>
        </div>
      )}

      {!generating && error && (
        <div className="text-center py-8" data-testid="analysis-error">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">Not enough data for analysis</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
          <p className="text-xs text-slate-400 mt-2">
            Try selecting a longer time period or ensure production data has been uploaded.
          </p>
        </div>
      )}

      {!generating && analysis && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 bg-indigo-50 rounded-lg p-3 leading-relaxed" data-testid="analysis-summary">
            {analysis.summary}
          </p>

          {stats && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="bg-slate-50 px-2 py-1 rounded">{stats.total_samples} samples</span>
              <span className="bg-slate-50 px-2 py-1 rounded">{stats.total_days} days</span>
              <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded">{stats.in_target_pct}% in target</span>
              <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded">{stats.good_days} good days</span>
              <span className="bg-red-50 text-red-600 px-2 py-1 rounded">{stats.bad_days} problem days</span>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-600" /> Optimal Settings
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {Object.entries(opt).map(([key, val]) => (
                <div
                  key={key}
                  className="bg-gradient-to-b from-slate-50 to-white border border-slate-200 rounded-lg p-3 text-center"
                  data-testid={`setting-${key.toLowerCase()}`}
                >
                  <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">{key}</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums">{val.recommended}</div>
                  <div className="text-[10px] text-slate-400">{val.unit}</div>
                  {val.range && (
                    <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                      {val.range[0]}–{val.range[1]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
          >
            {expanded ? "Hide details" : "Show detailed findings"}
            <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>

          {expanded && (
            <div className="space-y-4 animate-in fade-in">
              {analysis.key_findings?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" /> Key Findings
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.key_findings.map((f, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.correlations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-500" /> Correlations
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.correlations.map((c, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.risk_factors?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Risk Factors
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.risk_factors.map((r, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.improvement_recommendations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Recommendations
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.improvement_recommendations.map((r, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

