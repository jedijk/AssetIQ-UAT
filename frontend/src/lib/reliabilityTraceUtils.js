/**
 * Parse graph API payloads into ordered reliability trace stages.
 * Uses edge metadata only — no client-side graph logic.
 */

const STAGE_ORDER = [
  { key: "equipment", label: "Equipment", types: ["equipment"] },
  { key: "failure_mode", label: "Failure Modes", types: ["failure_mode"] },
  { key: "observation", label: "Observations", types: ["observation", "threat", "finding"] },
  { key: "investigation", label: "Investigations", types: ["investigation", "cause"] },
  { key: "action", label: "Actions", types: ["action"] },
  { key: "outcome", label: "Outcomes", types: ["outcome", "reliability_impact"] },
  { key: "strategy", label: "Strategy", types: ["equipment_type_strategy", "maintenance_program_v2", "program_task"] },
];

export function formatNodeTypeLabel(type) {
  return (type || "unknown").replace(/_/g, " ");
}

export function getNodeRecordLink(nodeType, nodeId) {
  if (!nodeType || !nodeId) return null;
  switch (nodeType) {
    case "equipment":
      return `/equipment/${nodeId}/trace`;
    case "observation":
    case "threat":
      return `/threats/${nodeId}/workspace`;
    case "investigation":
      return `/causal-engine?inv=${nodeId}`;
    case "action":
      return `/actions/${nodeId}`;
    case "failure_mode":
      return `/library`;
    default:
      return null;
  }
}

function nodeKey(type, id) {
  return `${type}:${id}`;
}

function collectNodesFromEdges(edges = []) {
  const nodes = new Map();
  for (const edge of edges) {
    for (const [id, type, label] of [
      [edge?.source_id, edge?.source_type, edge?.source_label],
      [edge?.target_id, edge?.target_type, edge?.target_label],
    ]) {
      if (!id || !type) continue;
      const key = nodeKey(type, id);
      if (!nodes.has(key)) {
        nodes.set(key, {
          id,
          type,
          label: label || `${formatNodeTypeLabel(type)} ${id.slice(0, 8)}`,
          link: getNodeRecordLink(type, id),
        });
      }
    }
  }
  return nodes;
}

export function buildTraceStages({ edges = [], chain = null, anchorNodeType = null, anchorNodeId = null } = {}) {
  const allEdges = edges.length ? edges : chain?.edges || [];
  const nodes = collectNodesFromEdges(allEdges);

  if (anchorNodeType && anchorNodeId) {
    const anchorKey = nodeKey(anchorNodeType, anchorNodeId);
    if (!nodes.has(anchorKey)) {
      nodes.set(anchorKey, {
        id: anchorNodeId,
        type: anchorNodeType,
        label: `${formatNodeTypeLabel(anchorNodeType)} ${anchorNodeId.slice(0, 8)}`,
        link: getNodeRecordLink(anchorNodeType, anchorNodeId),
        isAnchor: true,
      });
    } else {
      nodes.get(anchorKey).isAnchor = true;
    }
  }

  const stages = STAGE_ORDER.map(({ key, label, types }) => ({
    key,
    label,
    nodes: [...nodes.values()].filter((n) => types.includes(n.type)),
  })).filter((stage) => stage.nodes.length > 0);

  return stages;
}

export function summarizeRiskExplanation(risk = {}) {
  if (!risk || !Object.keys(risk).length) return null;
  const threats = risk.open_threats || [];
  return {
    openThreatCount: risk.open_threat_count ?? threats.length,
    graphLinkedThreatCount: risk.graph_linked_threat_count ?? 0,
    overduePm: risk.overdue_pm_scheduled ?? 0,
    topThreats: threats.slice(0, 5),
    pathEntries: risk.path_entries || [],
    paths: risk.risk_paths || [],
  };
}

export function mergeTracePayload(equipmentPayload, nodePayload) {
  if (!nodePayload) return equipmentPayload;
  const eqEdges = equipmentPayload?.chain?.edges || [];
  const nodeEdges = nodePayload?.edges || [];
  const seen = new Set();
  const merged = [];
  for (const edge of [...eqEdges, ...nodeEdges]) {
    const id = edge?.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push(edge);
  }
  return {
    equipment_id: equipmentPayload?.equipment_id || nodePayload?.equipment_id,
    chain: {
      ...(equipmentPayload?.chain || {}),
      edges: merged,
      edge_count: merged.length,
    },
    risk_explanation: equipmentPayload?.risk_explanation || nodePayload?.risk_explanation,
    node_trace: nodePayload,
  };
}
