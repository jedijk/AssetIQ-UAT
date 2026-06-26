"""
Reliability knowledge graph ontology — node types, relations, and read API payload.
"""
from __future__ import annotations

from typing import Any, Dict, List

# Finding, threat, and observation are the same reactive signal — one canonical node in the ontology UI.
OBSERVATION_NODE_TYPES = frozenset({"finding", "observation", "threat"})
# Relations between observation aliases — omitted after canonical merge.
INTERNAL_OBSERVATION_RELATIONS = frozenset({
    "raised_observation",
    "escalated_to",
    "linked_to_threat",
})


def _canonical_node_type(node_type: str) -> str:
    if node_type in OBSERVATION_NODE_TYPES:
        return "observation"
    return node_type


def _merge_observation_topology(topology: Dict[str, Any]) -> Dict[str, Any]:
    """Roll finding/threat counts and arcs into observation for visualization."""
    outgoing = topology.get("outgoing_by_node") or {}
    incoming = topology.get("incoming_by_node") or {}

    def _merge_by_node(by_node: Dict[str, Dict[str, int]]) -> Dict[str, Dict[str, int]]:
        merged: Dict[str, Dict[str, int]] = {}
        for node_type, relations in by_node.items():
            canonical = _canonical_node_type(node_type)
            bucket = merged.setdefault(canonical, {})
            for relation, count in relations.items():
                if relation in INTERNAL_OBSERVATION_RELATIONS:
                    continue
                bucket[relation] = bucket.get(relation, 0) + count
        return merged

    merged_arcs: Dict[str, Dict[str, Any]] = {}
    for arc in topology.get("relation_arcs") or []:
        source = _canonical_node_type(arc.get("source") or "")
        target = _canonical_node_type(arc.get("target") or "")
        relation = arc.get("relation")
        if not relation or not source or not target:
            continue
        if relation in INTERNAL_OBSERVATION_RELATIONS:
            continue
        if source == target == "observation":
            continue
        key = f"{relation}:{source}:{target}"
        if key in merged_arcs:
            merged_arcs[key]["edge_count"] += arc.get("edge_count", 0)
        else:
            merged_arcs[key] = {
                "id": key,
                "relation": relation,
                "source": source,
                "target": target,
                "edge_count": arc.get("edge_count", 0),
            }

    return {
        **topology,
        "outgoing_by_node": _merge_by_node(outgoing),
        "incoming_by_node": _merge_by_node(incoming),
        "relation_arcs": list(merged_arcs.values()),
    }

NODE_TYPES: List[Dict[str, Any]] = [
    {"id": "equipment", "label": "Equipment", "domain": "shared", "color": "#3B82F6"},
    {"id": "failure_mode", "label": "Failure Mode", "domain": "maintenance", "color": "#EF4444"},
    {"id": "equipment_type_strategy", "label": "Strategy", "domain": "maintenance", "color": "#8B5CF6"},
    {"id": "maintenance_program_v2", "label": "Program", "domain": "maintenance", "color": "#6366F1"},
    {"id": "program_task", "label": "Program Task", "domain": "maintenance", "color": "#818CF8"},
    {"id": "strategy_task_template", "label": "Task Template", "domain": "maintenance", "color": "#A78BFA"},
    {"id": "scheduled_task", "label": "Scheduled Task", "domain": "maintenance", "color": "#14B8A6"},
    {"id": "task_instance", "label": "Task Instance", "domain": "maintenance", "color": "#0D9488"},
    {"id": "task_completion", "label": "Task Completion", "domain": "reactive", "color": "#64748B"},
    {"id": "pm_import_task", "label": "PM Import", "domain": "maintenance", "color": "#A855F7"},
    {"id": "observation", "label": "Observation", "domain": "reactive", "color": "#F97316"},
    {"id": "investigation", "label": "Investigation", "domain": "reactive", "color": "#7C3AED"},
    {"id": "cause", "label": "Cause", "domain": "reactive", "color": "#9333EA"},
    {"id": "action", "label": "Action", "domain": "reactive", "color": "#2563EB"},
    {"id": "outcome", "label": "Outcome", "domain": "reactive", "color": "#059669"},
    {"id": "reliability_impact", "label": "Reliability Impact", "domain": "reactive", "color": "#10B981"},
    {"id": "spare_part", "label": "Spare Part", "domain": "maintenance", "color": "#F59E0B"},
]

RELATIONS: List[Dict[str, Any]] = [
    {"id": "has_failure_mode", "label": "has failure mode", "source": "equipment", "target": "failure_mode", "domain": "maintenance"},
    {"id": "has_strategy_type", "label": "has strategy", "source": "equipment", "target": "equipment_type_strategy", "domain": "maintenance"},
    {"id": "has_program", "label": "has program", "source": "equipment", "target": "maintenance_program_v2", "domain": "maintenance"},
    {"id": "governed_by", "label": "governed by", "source": "maintenance_program_v2", "target": "equipment_type_strategy", "domain": "maintenance"},
    {"id": "contains_task", "label": "contains task", "source": "maintenance_program_v2", "target": "program_task", "domain": "maintenance"},
    {"id": "derived_from_template", "label": "derived from template", "source": "program_task", "target": "strategy_task_template", "domain": "maintenance"},
    {"id": "mitigates_failure_mode", "label": "mitigates", "source": "program_task", "target": "failure_mode", "domain": "maintenance"},
    {"id": "applied_to", "label": "applied to", "source": "pm_import_task", "target": "failure_mode", "domain": "maintenance"},
    {"id": "imported_as", "label": "imported as", "source": "pm_import_task", "target": "program_task", "domain": "maintenance"},
    {"id": "derived_from", "label": "derived from", "source": "scheduled_task", "target": "program_task", "domain": "maintenance"},
    {"id": "scheduled_for", "label": "scheduled for", "source": "scheduled_task", "target": "equipment", "domain": "maintenance"},
    {"id": "instantiated_as", "label": "instantiated as", "source": "scheduled_task", "target": "task_instance", "domain": "maintenance"},
    {"id": "executed_on", "label": "executed on", "source": "task_instance", "target": "equipment", "domain": "maintenance"},
    {"id": "completed_on", "label": "completed on", "source": "scheduled_task", "target": "equipment", "domain": "maintenance"},
    {"id": "cancelled_for", "label": "cancelled for", "source": "scheduled_task", "target": "program_task", "domain": "maintenance"},
    {"id": "yielded_finding", "label": "yielded finding", "source": "task_completion", "target": "finding", "domain": "reactive"},
    {"id": "found_on", "label": "found on", "source": "finding", "target": "equipment", "domain": "reactive"},
    {"id": "observed_on", "label": "observed on", "source": "observation", "target": "equipment", "domain": "reactive"},
    {"id": "indicates_failure_mode", "label": "indicates failure mode", "source": "observation", "target": "failure_mode", "domain": "reactive"},
    {"id": "linked_to_equipment", "label": "linked to equipment", "source": "threat", "target": "equipment", "domain": "reactive"},
    {"id": "triggered_investigation", "label": "triggered investigation", "source": "threat", "target": "investigation", "domain": "reactive"},
    {"id": "identified_cause", "label": "identified cause", "source": "investigation", "target": "cause", "domain": "reactive"},
    {"id": "generated_action", "label": "generated action", "source": "investigation", "target": "action", "domain": "reactive"},
    {"id": "assigned_to_equipment", "label": "assigned to equipment", "source": "action", "target": "equipment", "domain": "reactive"},
    {"id": "resulted_in", "label": "resulted in", "source": "action", "target": "outcome", "domain": "reactive"},
    {"id": "impacted_reliability", "label": "impacted reliability", "source": "outcome", "target": "reliability_impact", "domain": "reactive"},
    {"id": "affects_equipment", "label": "affects equipment", "source": "reliability_impact", "target": "equipment", "domain": "reactive"},
    {"id": "used_on", "label": "used on", "source": "spare_part", "target": "equipment", "domain": "maintenance"},
    {"id": "requires", "label": "requires spare part", "source": "program_task", "target": "spare_part", "domain": "maintenance"},
    {"id": "requires", "label": "requires spare part", "source": "action", "target": "spare_part", "domain": "maintenance"},
]

RELATION_LABELS: Dict[str, str] = {rel["id"]: rel["label"] for rel in RELATIONS}


def _enrich_node_types(
    *,
    outgoing_by_node: Dict[str, Dict[str, int]],
    incoming_by_node: Dict[str, Dict[str, int]],
) -> List[Dict[str, Any]]:
    enriched: List[Dict[str, Any]] = []
    for node in NODE_TYPES:
        node_id = node["id"]
        outgoing = outgoing_by_node.get(node_id, {})
        incoming = incoming_by_node.get(node_id, {})
        enriched.append(
            {
                **node,
                "edge_count_outgoing": sum(outgoing.values()),
                "edge_count_incoming": sum(incoming.values()),
                "outgoing_by_relation": outgoing,
                "incoming_by_relation": incoming,
            }
        )
    return enriched


def _enrich_relation_arcs(relation_arcs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    enriched: List[Dict[str, Any]] = []
    for arc in relation_arcs:
        relation_id = arc.get("relation") or ""
        enriched.append(
            {
                **arc,
                "label": RELATION_LABELS.get(relation_id, relation_id.replace("_", " ")),
            }
        )
    return enriched


async def get_reliability_ontology_payload(user=None) -> Dict[str, Any]:
    """Return ontology schema plus live edge counts for visualization."""
    from services.reliability_graph_query import get_graph_topology_stats

    topology = await get_graph_topology_stats(user, active_only=True)
    topology = _merge_observation_topology(topology)
    edges_by_relation = topology["edges_by_relation"]
    relation_arcs = _enrich_relation_arcs(topology["relation_arcs"])
    node_types = _enrich_node_types(
        outgoing_by_node=topology["outgoing_by_node"],
        incoming_by_node=topology["incoming_by_node"],
    )

    known_relation_ids = {rel["id"] for rel in RELATIONS}
    relations = [
        {**rel, "edge_count": edges_by_relation.get(rel["id"], 0)}
        for rel in RELATIONS
    ]
    other_relations = sorted(
        [
            {"id": rel_id, "edge_count": count}
            for rel_id, count in edges_by_relation.items()
            if rel_id and rel_id not in known_relation_ids
        ],
        key=lambda row: (-row["edge_count"], row["id"]),
    )
    total_edges = sum(edges_by_relation.values())
    return {
        "node_types": node_types,
        "relations": relations,
        "relation_arcs": relation_arcs,
        "other_relations": other_relations,
        "edges_by_relation": edges_by_relation,
        "reliability_edges_total": total_edges,
    }
