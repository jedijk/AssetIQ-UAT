/**
 * Reusable card for AI recommendation contract fields (Sprint 5).
 * Surfaces: summary, recommendations, citations, deterministic inputs, confidence, limitations.
 */
import React from "react";
import { AlertTriangle, BookOpen, Brain, Check, Sparkles, X } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

function CitationList({ citations = [] }) {
  if (!citations?.length) return null;
  return (
    <div className="space-y-1" data-testid="ai-citations">
      <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
        <BookOpen className="w-3.5 h-3.5" />
        Evidence &amp; Citations
      </p>
      <ul className="space-y-1">
        {citations.map((cite) => (
          <li key={cite.id || cite.label} className="text-xs text-slate-600">
            {cite.url_path ? (
              <a href={cite.url_path} className="text-blue-600 hover:underline">
                [{cite.type || "ref"}] {cite.label || cite.id}
              </a>
            ) : (
              <span>
                [{cite.type || "ref"}] {cite.label || cite.id}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecommendationList({ recommendations = [], citations = [] }) {
  if (!recommendations?.length) return null;
  const citeById = Object.fromEntries((citations || []).map((c) => [c.id, c]));

  return (
    <div className="space-y-2" data-testid="ai-recommendations">
      <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
        <Sparkles className="w-3.5 h-3.5" />
        Recommendations
      </p>
      <ul className="space-y-2">
        {recommendations.map((rec, idx) => {
          const item = typeof rec === "string" ? { action: rec } : rec;
          const title =
            item.action || item.title || item.task_title || item.description || `Recommendation ${idx + 1}`;
          const refs = item.source_refs || item.citation_ids || [];
          return (
            <li
              key={item.id || `rec-${idx}`}
              className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-md p-2"
            >
              <p>{title}</p>
              {item.reasoning && (
                <p className="text-slate-500 mt-1">{item.reasoning}</p>
              )}
              {(item.confidence || item.confidence_level) && (
                <Badge variant="outline" className="mt-1 text-[10px]">
                  Confidence: {item.confidence || item.confidence_level}
                </Badge>
              )}
              {refs.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Sources:{" "}
                  {refs
                    .map((id) => citeById[id]?.label || id)
                    .join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AIRecommendationCard({
  payload,
  summary: summaryProp,
  recommendations: recommendationsProp,
  citations: citationsProp,
  deterministicInputs,
  confidence,
  limitations,
  evidenceNotAvailable,
  onApprove,
  onReject,
  showApproval = false,
  className = "",
  compact = false,
}) {
  const data = payload || {};
  const summary = summaryProp ?? data.summary ?? data.answer;
  const recommendations =
    recommendationsProp ?? data.recommendations ?? data.actions ?? data.suggestions ?? [];
  const citations = citationsProp ?? data.citations ?? [];
  const deterministic =
    deterministicInputs ??
    data.deterministic_inputs ??
    data.evidence?.deterministic;
  const limits = limitations ?? data.limitations;
  const noEvidence =
    evidenceNotAvailable ?? data.evidence_not_available ?? (!citations?.length);
  const conf = confidence ?? data.confidence;
  const graphPath = data.graph_path ?? [];
  const executionId = data.execution_id;
  const aiModel = data.ai_model;

  return (
    <Card
      className={`border border-slate-200 ${compact ? "p-3" : "p-4"} ${className}`}
      data-testid="ai-recommendation-card"
    >
      <div className="flex items-start gap-2 mb-3">
        <Brain className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {summary && (
            <p className={`text-slate-700 ${compact ? "text-xs" : "text-sm"} leading-relaxed whitespace-pre-line`}>
              {summary}
            </p>
          )}
          {conf && (
            <Badge variant="secondary" className="mt-2 text-[10px]">
              Confidence: {conf}
            </Badge>
          )}
        </div>
      </div>

      {noEvidence && (
        <div
          className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mb-3 text-xs"
          data-testid="ai-evidence-unavailable"
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Evidence not available for this recommendation.</span>
        </div>
      )}

      <RecommendationList recommendations={recommendations} citations={citations} />
      <CitationList citations={citations} />

      {deterministic && Object.keys(deterministic).length > 0 && (
        <div className="mt-3 text-[10px] text-slate-500" data-testid="ai-deterministic-inputs">
          <span className="font-medium text-slate-600">Deterministic inputs: </span>
          {Object.entries(deterministic)
            .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
            .join(" · ")}
        </div>
      )}

      {limits?.length > 0 && (
        <ul className="mt-2 text-[10px] text-slate-500 list-disc pl-4">
          {limits.map((lim, i) => (
            <li key={`lim-${i}`}>{lim}</li>
          ))}
        </ul>
      )}

      {graphPath.length > 0 && (
        <div className="mt-3 text-xs" data-testid="ai-graph-path">
          <p className="font-medium text-slate-700 mb-1">Graph path</p>
          <ol className="list-decimal pl-4 space-y-0.5 text-slate-600">
            {graphPath.map((step, idx) => (
              <li key={step.entity_id || idx}>
                {(step.type ? `${step.type}: ` : "") + (step.label || step.entity_id || "—")}
              </li>
            ))}
          </ol>
        </div>
      )}

      {executionId && (
        <p className="mt-2 text-[10px] text-slate-400" data-testid="ai-execution-id">
          Execution {executionId.slice(0, 8)}…
          {aiModel ? ` · ${aiModel}` : ""}
        </p>
      )}

      {showApproval && (onApprove || onReject) && (
        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
          {onApprove && (
            <Button size="sm" className="h-7 text-xs" onClick={onApprove} data-testid="ai-approve-btn">
              <Check className="w-3.5 h-3.5 mr-1" />
              Approve
            </Button>
          )}
          {onReject && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onReject}
              data-testid="ai-reject-btn"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Reject
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export { CitationList, RecommendationList };
