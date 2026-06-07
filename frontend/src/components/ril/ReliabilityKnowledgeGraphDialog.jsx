/**
 * Reliability Knowledge Graph — ontology visualization dialog.
 * Shows entity types (nodes) and relation types (edges) with live edge counts.
 */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Loader2, Network } from "lucide-react";
import { rilDashboardAPI } from "../../lib/apis/rilAPI";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";

const NODE_LAYOUT = {
  equipment_type_strategy: { x: 70, y: 60 },
  pm_import_task: { x: 70, y: 140 },
  equipment: { x: 220, y: 100 },
  failure_mode: { x: 220, y: 200 },
  maintenance_program_v2: { x: 370, y: 80 },
  program_task: { x: 370, y: 160 },
  strategy_task_template: { x: 370, y: 240 },
  scheduled_task: { x: 520, y: 100 },
  task_instance: { x: 520, y: 180 },
  task_completion: { x: 520, y: 260 },
  finding: { x: 670, y: 60 },
  observation: { x: 670, y: 140 },
  threat: { x: 670, y: 220 },
  investigation: { x: 820, y: 80 },
  cause: { x: 820, y: 160 },
  action: { x: 820, y: 240 },
  outcome: { x: 970, y: 100 },
  reliability_impact: { x: 970, y: 200 },
};

const NODE_WIDTH = 118;
const NODE_HEIGHT = 34;

function formatNodeLabel(label) {
  return label.length > 16 ? `${label.slice(0, 15)}…` : label;
}

function edgePath(source, target) {
  const sx = source.x + NODE_WIDTH;
  const sy = source.y + NODE_HEIGHT / 2;
  const tx = target.x;
  const ty = target.y + NODE_HEIGHT / 2;
  const mx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
}

const ReliabilityOntologyGraph = ({ nodeTypes, relations, highlightedRelation }) => {
  const nodesById = useMemo(() => {
    const map = {};
    (nodeTypes || []).forEach((node) => {
      const pos = NODE_LAYOUT[node.id];
      if (pos) {
        map[node.id] = { ...node, ...pos };
      }
    });
    return map;
  }, [nodeTypes]);

  const visibleRelations = useMemo(
    () =>
      (relations || []).filter(
        (rel) => nodesById[rel.source] && nodesById[rel.target]
      ),
    [relations, nodesById]
  );

  const activeRelations = highlightedRelation
    ? visibleRelations.filter((rel) => rel.id === highlightedRelation)
    : visibleRelations;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 overflow-x-auto">
      <svg
        viewBox="0 0 1100 320"
        className="w-full min-w-[720px] h-[320px]"
        data-testid="reliability-knowledge-graph-svg"
      >
        <rect x="20" y="20" width="560" height="280" rx="12" fill="#EFF6FF" fillOpacity="0.55" />
        <text x="36" y="42" className="fill-blue-700 text-[11px] font-semibold">
          Maintenance domain
        </text>
        <rect x="640" y="20" width="440" height="280" rx="12" fill="#FFF7ED" fillOpacity="0.55" />
        <text x="656" y="42" className="fill-orange-700 text-[11px] font-semibold">
          Reactive domain
        </text>

        <g className="edges">
          {activeRelations.map((rel) => {
            const source = nodesById[rel.source];
            const target = nodesById[rel.target];
            const isHighlighted = highlightedRelation === rel.id;
            const hasData = (rel.edge_count || 0) > 0;
            return (
              <path
                key={rel.id}
                d={edgePath(source, target)}
                fill="none"
                stroke={isHighlighted ? "#2563EB" : hasData ? "#64748B" : "#CBD5E1"}
                strokeWidth={isHighlighted ? 2.5 : hasData ? 1.5 : 1}
                strokeOpacity={isHighlighted ? 0.95 : hasData ? 0.55 : 0.35}
                markerEnd="url(#arrowhead)"
              />
            );
          })}
        </g>

        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#64748B" />
          </marker>
        </defs>

        <g className="nodes">
          {Object.values(nodesById).map((node) => (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx="8"
                fill="#ffffff"
                stroke={node.color || "#94A3B8"}
                strokeWidth="1.5"
              />
              <circle cx="10" cy="17" r="4" fill={node.color || "#94A3B8"} />
              <text
                x="20"
                y="21"
                className="fill-slate-800 text-[10px] font-medium"
              >
                {formatNodeLabel(node.label)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

export default function ReliabilityKnowledgeGraphDialog({
  open,
  onOpenChange,
  totalEdges: totalEdgesProp,
}) {
  const [highlightedRelation, setHighlightedRelation] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["reliability-graph-ontology"],
    queryFn: () => rilDashboardAPI.getReliabilityGraphOntology(),
    enabled: open,
    staleTime: 60_000,
  });

  const nodeTypes = data?.node_types || [];
  const relationRows = data?.relations || [];
  const totalEdges = totalEdgesProp ?? data?.reliability_edges_total ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="reliability-knowledge-graph-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            Reliability Knowledge Graph
          </DialogTitle>
          <DialogDescription>
            Ontology of reliability entities and how they connect across maintenance
            execution and reactive intelligence.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Link2 className="w-4 h-4" />
          <span>
            <span className="font-semibold text-slate-900">
              {totalEdges.toLocaleString()}
            </span>{" "}
            active graph edges in your tenant
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-sm text-red-600">
            Unable to load knowledge graph data.
          </div>
        ) : (
          <div className="space-y-4 min-h-0 flex-1 flex flex-col">
            <ReliabilityOntologyGraph
              nodeTypes={nodeTypes}
              relations={relationRows}
              highlightedRelation={highlightedRelation}
            />

            <ScrollArea className="max-h-48 rounded-lg border border-slate-200">
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {relationRows.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    onMouseEnter={() => setHighlightedRelation(rel.id)}
                    onMouseLeave={() => setHighlightedRelation(null)}
                    onFocus={() => setHighlightedRelation(rel.id)}
                    onBlur={() => setHighlightedRelation(null)}
                    className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                      highlightedRelation === rel.id
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                    data-testid={`reliability-relation-${rel.id}`}
                  >
                    <span className="text-slate-700 truncate">
                      {rel.source?.replace(/_/g, " ")} → {rel.label || rel.id.replace(/_/g, " ")} → {rel.target?.replace(/_/g, " ")}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {(rel.edge_count ?? 0).toLocaleString()}
                    </Badge>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
