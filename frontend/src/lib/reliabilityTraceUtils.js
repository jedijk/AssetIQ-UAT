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
  const friendly = {
    equipment: "Equipment",
    failure_mode: "Failure mode",
    observation: "Observation",
    threat: "Observation",
    finding: "Finding",
    investigation: "Investigation",
    cause: "Root cause",
    action: "Action",
    outcome: "Outcome",
    reliability_impact: "Reliability impact",
    program_task: "Program task",
    scheduled_task: "Scheduled PM",
    task_instance: "Task",
    equipment_type_strategy: "Strategy",
    maintenance_program_v2: "Maintenance program",
  };
  if (friendly[type]) return friendly[type];
  return (type || "unknown").replace(/_/g, " ");
}

const FALLBACK_LABELS = {
  equipment: "Unknown equipment",
  failure_mode: "Unknown failure mode",
  observation: "Untitled observation",
  threat: "Untitled observation",
  finding: "Untitled finding",
  investigation: "Untitled investigation",
  action: "Untitled action",
  outcome: "Outcome",
  program_task: "Program task",
  scheduled_task: "Scheduled task",
  task_instance: "Task",
};

function nodeKey(type, id) {
  return `${type}:${id}`;
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

function resolveNodeLabel(type, id, edgeLabel, nodeLabels, labelHints) {
  const key = nodeKey(type, id);
  return (
    edgeLabel ||
    labelHints?.[key] ||
    nodeLabels?.[key] ||
    FALLBACK_LABELS[type] ||
    formatNodeTypeLabel(type)
  );
}

function collectNodesFromEdges(edges = [], { nodeLabels = {}, labelHints = {} } = {}) {
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
          label: resolveNodeLabel(type, id, label, nodeLabels, labelHints),
          link: getNodeRecordLink(type, id),
        });
      }
    }
  }
  return nodes;
}

export function buildTraceStages({
  edges = [],
  chain = null,
  anchorNodeType = null,
  anchorNodeId = null,
  nodeLabels = {},
  labelHints = {},
} = {}) {
  const allEdges = edges.length ? edges : chain?.edges || [];
  const nodes = collectNodesFromEdges(allEdges, { nodeLabels, labelHints });

  if (anchorNodeType && anchorNodeId) {
    const anchorKey = nodeKey(anchorNodeType, anchorNodeId);
    if (!nodes.has(anchorKey)) {
      nodes.set(anchorKey, {
        id: anchorNodeId,
        type: anchorNodeType,
        label: resolveNodeLabel(anchorNodeType, anchorNodeId, null, nodeLabels, labelHints),
        link: getNodeRecordLink(anchorNodeType, anchorNodeId),
        isAnchor: true,
      });
    } else {
      const node = nodes.get(anchorKey);
      node.isAnchor = true;
      if (labelHints?.[anchorKey]) {
        node.label = labelHints[anchorKey];
      }
    }
  }

  return STAGE_ORDER.map(({ key, label, types }) => ({
    key,
    label,
    nodes: [...nodes.values()].filter((n) => types.includes(n.type)),
  })).filter((stage) => stage.nodes.length > 0);
}

export function summarizeRiskExplanation(risk = {}) {
  if (!risk || !Object.keys(risk).length) return null;
  const observations = risk.open_observations || risk.open_threats || [];
  const openCount = risk.open_observation_count ?? risk.open_threat_count ?? observations.length;
  return {
    openThreatCount: openCount,
    openObservationCount: openCount,
    graphLinkedThreatCount: risk.graph_linked_observation_count ?? risk.graph_linked_threat_count ?? 0,
    graphLinkedObservationCount: risk.graph_linked_observation_count ?? risk.graph_linked_threat_count ?? 0,
    overduePm: risk.overdue_pm_scheduled ?? 0,
    topThreats: observations.slice(0, 5),
    topObservations: observations.slice(0, 5),
    pathEntries: risk.path_entries || [],
    paths: risk.risk_paths || [],
  };
}

export function buildLabelHintsFromRisk(risk = {}) {
  const hints = {};
  for (const obs of risk.open_observations || risk.open_threats || []) {
    if (obs?.id && obs?.title) {
      hints[`observation:${obs.id}`] = obs.title;
      hints[`threat:${obs.id}`] = obs.title;
    }
  }
  return hints;
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
  const node_labels = {
    ...(equipmentPayload?.node_labels || {}),
    ...(nodePayload?.node_labels || {}),
  };
  return {
    equipment_id: equipmentPayload?.equipment_id || nodePayload?.equipment_id,
    chain: {
      ...(equipmentPayload?.chain || {}),
      edges: merged,
      edge_count: merged.length,
    },
    risk_explanation: equipmentPayload?.risk_explanation || nodePayload?.risk_explanation,
    node_labels,
    node_trace: nodePayload,
  };
}
