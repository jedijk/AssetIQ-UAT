/**
 * Reliability Knowledge Graph — ontology visualization dialog.
 * Shows entity types (nodes) and relation arcs with live edge counts from MongoDB.
 */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Loader2, Network, RefreshCw } from "lucide-react";
import { rilDashboardAPI } from "../../lib/apis/rilAPI";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
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
const NODE_HEIGHT = 46;
const GRAPH_WIDTH = 1100;
const GRAPH_HEIGHT = 340;

function formatNodeLabel(label) {
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

function formatTypeLabel(type) {
  return (type || "").replace(/_/g, " ");
}

function edgePath(source, target) {
  const sx = source.x + NODE_WIDTH;
  const sy = source.y + NODE_HEIGHT / 2;
  const tx = target.x;
  const ty = target.y + NODE_HEIGHT / 2;
  const mx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
}

function NodeRelationBreakdown({ node }) {
  if (!node) return null;

  const outgoing = Object.entries(node.outgoing_by_relation || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const incoming = Object.entries(node.incoming_by_relation || {}).sort(
    (a, b) => b[1] - a[1]
  );

  if (outgoing.length === 0 && incoming.length === 0) {
    return (
      <p className="text-xs text-slate-500">No active edges for this node type yet.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <div>
        <p className="font-semibold text-slate-700 mb-1">
          Outgoing ({node.edge_count_outgoing ?? 0})
        </p>
        {outgoing.length === 0 ? (
          <p className="text-slate-400">None</p>
        ) : (
          <ul className="space-y-0.5">
            {outgoing.map(([relation, count]) => (
              <li key={`out-${relation}`} className="flex justify-between gap-2 text-slate-600">
                <span className="truncate">{relation.replace(/_/g, " ")}</span>
                <span className="font-medium tabular-nums">{count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="font-semibold text-slate-700 mb-1">
          Incoming ({node.edge_count_incoming ?? 0})
        </p>
        {incoming.length === 0 ? (
          <p className="text-slate-400">None</p>
        ) : (
          <ul className="space-y-0.5">
            {incoming.map(([relation, count]) => (
              <li key={`in-${relation}`} className="flex justify-between gap-2 text-slate-600">
                <span className="truncate">{relation.replace(/_/g, " ")}</span>
                <span className="font-medium tabular-nums">{count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const ReliabilityOntologyGraph = ({
  nodeTypes,
  relationArcs,
  highlightedArc,
  highlightedNode,
  onNodeHover,
}) => {
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

  const visibleArcs = useMemo(
    () =>
      (relationArcs || []).filter(
        (arc) => nodesById[arc.source] && nodesById[arc.target]
      ),
    [relationArcs, nodesById]
  );

  const activeArcs = highlightedArc
    ? visibleArcs.filter((arc) => arc.id === highlightedArc)
    : visibleArcs;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50/80 overflow-auto max-h-[min(380px,50vh)] touch-pan-x touch-pan-y"
      data-testid="reliability-knowledge-graph-scroll"
    >
      <svg
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        width={GRAPH_WIDTH}
        height={GRAPH_HEIGHT}
        className="block shrink-0"
        data-testid="reliability-knowledge-graph-svg"
      >
        <rect x="20" y="20" width="560" height="300" rx="12" fill="#EFF6FF" fillOpacity="0.55" />
        <text x="36" y="42" className="fill-blue-700 text-[11px] font-semibold">
          Maintenance domain
        </text>
        <rect x="640" y="20" width="440" height="300" rx="12" fill="#FFF7ED" fillOpacity="0.55" />
        <text x="656" y="42" className="fill-orange-700 text-[11px] font-semibold">
          Reactive domain
        </text>

        <g className="edges">
          {activeArcs.map((arc) => {
            const source = nodesById[arc.source];
            const target = nodesById[arc.target];
            const isHighlighted = highlightedArc === arc.id;
            const hasData = (arc.edge_count || 0) > 0;
            const touchesNode =
              highlightedNode &&
              (arc.source === highlightedNode || arc.target === highlightedNode);
            const isDimmed =
              highlightedNode && !touchesNode && !highlightedArc;
            return (
              <path
                key={arc.id}
                d={edgePath(source, target)}
                fill="none"
                stroke={
                  isHighlighted || touchesNode
                    ? "#2563EB"
                    : hasData
                      ? "#64748B"
                      : "#CBD5E1"
                }
                strokeWidth={isHighlighted || touchesNode ? 2 : hasData ? 1.5 : 1}
                strokeOpacity={
                  isDimmed
                    ? 0.12
                    : isHighlighted || touchesNode
                      ? 0.95
                      : hasData
                        ? 0.55
                        : 0.35
                }
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
          {Object.values(nodesById).map((node) => {
            const isActive = highlightedNode === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={() => onNodeHover?.(node.id)}
                style={{ cursor: "pointer" }}
              >
                {isActive && (
                  <rect
                    x="-1"
                    y="-1"
                    width={NODE_WIDTH + 2}
                    height={NODE_HEIGHT + 2}
                    rx="9"
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="1.5"
                    pointerEvents="none"
                  />
                )}
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="8"
                  fill={isActive ? "#EFF6FF" : "#ffffff"}
                  stroke={node.color || "#94A3B8"}
                  strokeWidth="1.5"
                />
                <circle cx="10" cy="15" r="4" fill={node.color || "#94A3B8"} />
                <text x="20" y="16" className="fill-slate-800 text-[10px] font-medium">
                  {formatNodeLabel(node.label)}
                </text>
                <text x="20" y="30" className="fill-slate-500 text-[8px]">
                  {`${node.edge_count_outgoing ?? 0} out · ${node.edge_count_incoming ?? 0} in`}
                </text>
                {(node.edge_count_outgoing > 0 || node.edge_count_incoming > 0) && (
                  <text
                    x={NODE_WIDTH - 6}
                    y="14"
                    textAnchor="end"
                    className="fill-slate-400 text-[8px] font-medium"
                  >
                    {(node.edge_count_outgoing ?? 0) + (node.edge_count_incoming ?? 0)}
                  </text>
                )}
              </g>
            );
          })}
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
  const [highlightedArc, setHighlightedArc] = useState(null);
  const [highlightedNode, setHighlightedNode] = useState(null);

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["reliability-graph-ontology"],
    queryFn: () => rilDashboardAPI.getReliabilityGraphOntology(),
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const nodeTypes = data?.node_types || [];
  const relationArcs = data?.relation_arcs || [];
  const otherRelationRows = data?.other_relations || [];
  const totalEdges = data?.reliability_edges_total ?? totalEdgesProp ?? 0;
  const listedEdgeSum =
    relationArcs.reduce((sum, arc) => sum + (arc.edge_count ?? 0), 0) +
    otherRelationRows.reduce((sum, rel) => sum + (rel.edge_count ?? 0), 0);

  const selectedNode = useMemo(
    () => nodeTypes.find((node) => node.id === highlightedNode) || null,
    [nodeTypes, highlightedNode]
  );

  const sortedArcs = useMemo(
    () => [...relationArcs].sort((a, b) => (b.edge_count ?? 0) - (a.edge_count ?? 0)),
    [relationArcs]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setHighlightedArc(null);
          setHighlightedNode(null);
        }
        onOpenChange(next);
      }}
    >
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
            Live edge topology from your tenant — node counts show incoming and outgoing
            relations; arcs reflect actual source and target types in the graph store.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Link2 className="w-4 h-4 shrink-0" />
          <span>
            <span className="font-semibold text-slate-900">
              {totalEdges.toLocaleString()}
            </span>{" "}
            active graph edges
            {!isLoading && !isError && listedEdgeSum === totalEdges && (
              <span className="text-slate-400"> · matches arc totals below</span>
            )}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="reliability-knowledge-graph-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {dataUpdatedAt ? (
            <span className="text-xs text-slate-400 w-full sm:w-auto">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          ) : null}
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
          <ScrollArea className="flex-1 min-h-0 h-0">
            <div className="space-y-4 pr-3 pb-1">
              <div
                className="space-y-3"
                onMouseLeave={() => setHighlightedNode(null)}
              >
                <p className="text-[11px] text-slate-400 sm:hidden">
                  Scroll the graph horizontally to explore all nodes.
                </p>
                <ReliabilityOntologyGraph
                  nodeTypes={nodeTypes}
                  relationArcs={relationArcs}
                  highlightedArc={highlightedArc}
                  highlightedNode={highlightedNode}
                  onNodeHover={setHighlightedNode}
                />

                <div
                  className="min-h-[148px] rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                  data-testid="reliability-knowledge-graph-node-detail"
                >
                  {selectedNode ? (
                    <>
                      <p className="text-sm font-semibold text-slate-900 mb-2">
                        {selectedNode.label}
                      </p>
                      <NodeRelationBreakdown node={selectedNode} />
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Hover a node to see per-relation incoming and outgoing counts.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sortedArcs.map((arc) => (
                    <button
                      key={arc.id}
                      type="button"
                      onMouseEnter={() => {
                        setHighlightedArc(arc.id);
                        setHighlightedNode(null);
                      }}
                      onMouseLeave={() => setHighlightedArc(null)}
                      onFocus={() => {
                        setHighlightedArc(arc.id);
                        setHighlightedNode(null);
                      }}
                      onBlur={() => setHighlightedArc(null)}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        highlightedArc === arc.id
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                      data-testid={`reliability-relation-${arc.id}`}
                    >
                      <span className="text-slate-700 truncate">
                        {formatTypeLabel(arc.source)} → {arc.label || formatTypeLabel(arc.relation)} → {formatTypeLabel(arc.target)}
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        {(arc.edge_count ?? 0).toLocaleString()}
                      </Badge>
                    </button>
                  ))}
                  {otherRelationRows.map((rel) => (
                    <div
                      key={rel.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs"
                      data-testid={`reliability-relation-other-${rel.id}`}
                    >
                      <span className="text-slate-600 truncate">
                        Other · {rel.id.replace(/_/g, " ")}
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        {(rel.edge_count ?? 0).toLocaleString()}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
