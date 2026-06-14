/**
 * Reliability Trace — graph-backed evidence visualization.
 * Consumes existing RIL dashboard APIs only.
 */
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronRight,
  GitBranch,
  Loader2,
  Network,
  Shield,
  Wrench,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  buildTraceStages,
  formatNodeTypeLabel,
  summarizeRiskExplanation,
} from "../../lib/reliabilityTraceUtils";

const STAGE_ICONS = {
  equipment: Building2,
  failure_mode: AlertTriangle,
  observation: Shield,
  investigation: GitBranch,
  action: Wrench,
  outcome: Network,
  strategy: Network,
};

function RiskSummary({ riskSummary }) {
  if (!riskSummary) return null;
  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-amber-900">
          <AlertTriangle className="w-4 h-4" />
          Why is this asset considered risky?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-white">
            {riskSummary.openThreatCount} open threat{riskSummary.openThreatCount === 1 ? "" : "s"}
          </Badge>
          <Badge variant="secondary" className="bg-white">
            {riskSummary.graphLinkedThreatCount} graph-linked
          </Badge>
          {riskSummary.overduePm > 0 && (
            <Badge variant="secondary" className="bg-red-100 text-red-800">
              {riskSummary.overduePm} overdue PM
            </Badge>
          )}
        </div>
        {riskSummary.topThreats?.length > 0 && (
          <ul className="space-y-1.5">
            {riskSummary.topThreats.map((threat) => (
              <li key={threat.id} className="flex items-center justify-between gap-2">
                <Link
                  to={`/threats/${threat.id}/workspace`}
                  className="text-slate-800 hover:text-blue-700 hover:underline truncate"
                >
                  {threat.title || threat.id}
                </Link>
                <span className="text-xs text-slate-500 shrink-0">
                  {threat.risk_level || "—"} · {threat.risk_score ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TraceStageRow({ stage, compact }) {
  const Icon = STAGE_ICONS[stage.key] || Network;
  if (!stage.nodes.length) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="w-3.5 h-3.5" />
        {stage.label}
      </div>
      <div className="space-y-2">
        {stage.nodes.map((node) => {
          const inner = (
            <div
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                node.isAnchor ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{node.label}</p>
                <p className="text-xs text-slate-500">{formatNodeTypeLabel(node.type)}</p>
              </div>
              {node.link ? <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" /> : null}
            </div>
          );
          return node.link ? (
            <Link key={`${node.type}:${node.id}`} to={node.link} className="block hover:opacity-90">
              {inner}
            </Link>
          ) : (
            <div key={`${node.type}:${node.id}`}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

export function ReliabilityTraceView({
  traceData,
  isLoading,
  error,
  compact = false,
  showRiskSummary = true,
  equipmentName,
  equipmentId,
}) {
  const stages = useMemo(() => {
    if (!traceData) return [];
    return buildTraceStages({
      edges: traceData.chain?.edges || traceData.edges || [],
      chain: traceData.chain,
    });
  }, [traceData]);

  const riskSummary = useMemo(
    () => summarizeRiskExplanation(traceData?.risk_explanation),
    [traceData]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading reliability trace…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load graph evidence. {error?.message || "Try again later."}
      </div>
    );
  }

  if (!traceData || stages.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600 text-center">
        No graph evidence recorded yet for this asset.
        {equipmentId && (
          <p className="mt-2 text-xs text-slate-500">
            Evidence appears when observations, investigations, actions, or maintenance sync to the reliability graph.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {!compact && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Network className="w-5 h-5 text-indigo-600" />
              Reliability Trace
            </h2>
            {equipmentName && (
              <p className="text-sm text-slate-500 mt-1">
                {equipmentName}
                {equipmentId ? ` · ${equipmentId.slice(0, 8)}…` : ""}
              </p>
            )}
          </div>
          {equipmentId && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/equipment/${equipmentId}/trace`}>Open full trace</Link>
            </Button>
          )}
        </div>
      )}

      {showRiskSummary && <RiskSummary riskSummary={riskSummary} />}

      <div className={compact ? "space-y-4" : "grid gap-4 lg:grid-cols-2"}>
        {stages.map((stage, index) => (
          <React.Fragment key={stage.key}>
            <TraceStageRow stage={stage} compact={compact} />
            {!compact && index < stages.length - 1 && (
              <div className="hidden lg:flex items-center justify-center text-slate-300">
                <ArrowRight className="w-5 h-5" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {traceData?.chain?.edge_count != null && (
        <p className="text-xs text-slate-400">
          {traceData.chain.edge_count} graph edge{traceData.chain.edge_count === 1 ? "" : "s"} ·{" "}
          {traceData.chain.nodes_visited ?? "—"} nodes visited
        </p>
      )}
    </div>
  );
}

export default ReliabilityTraceView;
