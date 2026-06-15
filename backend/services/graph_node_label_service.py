"""
Resolve human-readable labels for reliability graph nodes.

Batch-fetches titles from existing collections — no new graph logic.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from database import db
from services.tenant_schema import merge_tenant_filter

NodeRef = Tuple[str, str]


def node_ref_key(node_type: str, node_id: str) -> str:
    return f"{node_type}:{node_id}"


def _pick_label(doc: Optional[dict], *fields: str) -> Optional[str]:
    if not doc:
        return None
    for field in fields:
        value = doc.get(field)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _format_investigation(doc: dict) -> str:
    title = _pick_label(doc, "title") or "Investigation"
    case = doc.get("case_number")
    if case:
        return f"#{case} · {title}"
    return title


def _format_action(doc: dict) -> str:
    title = _pick_label(doc, "title")
    number = doc.get("action_number")
    if title and number:
        return f"{number} · {title}"
    return title or (str(number) if number else None)


async def _load_labels_for_type(
    node_type: str,
    node_ids: Set[str],
    *,
    user: Optional[dict],
) -> Dict[str, str]:
    if not node_ids:
        return {}

    id_list = list(node_ids)
    labels: Dict[str, str] = {}

    if node_type == "equipment":
        cursor = db.equipment_nodes.find(
            merge_tenant_filter({"id": {"$in": id_list}}, user),
            {"_id": 0, "id": 1, "name": 1, "tag": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _pick_label(doc, "name", "tag")
            if label:
                labels[doc["id"]] = label
        return labels

    if node_type == "threat":
        cursor = db.threats.find(
            merge_tenant_filter({"id": {"$in": id_list}}, user),
            {"_id": 0, "id": 1, "title": 1, "failure_mode": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _pick_label(doc, "title", "failure_mode")
            if label:
                labels[doc["id"]] = label
        return labels

    if node_type == "observation":
        cursor = db.observations.find(
            merge_tenant_filter({"id": {"$in": id_list}}, user),
            {"_id": 0, "id": 1, "title": 1, "asset": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _pick_label(doc, "title", "asset")
            if label:
                labels[doc["id"]] = label
        missing = [nid for nid in id_list if nid not in labels]
        if missing:
            threat_cursor = db.threats.find(
                merge_tenant_filter({"id": {"$in": missing}}, user),
                {"_id": 0, "id": 1, "title": 1, "failure_mode": 1},
            )
            for doc in await threat_cursor.to_list(len(missing)):
                label = _pick_label(doc, "title", "failure_mode")
                if label:
                    labels[doc["id"]] = label
        return labels

    if node_type == "investigation":
        cursor = db.investigations.find(
            merge_tenant_filter({"id": {"$in": id_list}}, user),
            {"_id": 0, "id": 1, "title": 1, "case_number": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _format_investigation(doc)
            if label:
                labels[doc["id"]] = label
        return labels

    if node_type == "action":
        cursor = db.central_actions.find(
            merge_tenant_filter({"id": {"$in": id_list}}, user),
            {"_id": 0, "id": 1, "title": 1, "action_number": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _format_action(doc)
            if label:
                labels[doc["id"]] = label
        return labels

    if node_type == "failure_mode":
        cursor = db.failure_modes.find(
            {"id": {"$in": id_list}},
            {"_id": 0, "id": 1, "name": 1, "category": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _pick_label(doc, "name", "category")
            if label:
                labels[doc["id"]] = label
        return labels

    if node_type == "finding":
        cursor = db.findings.find(
            merge_tenant_filter({"id": {"$in": id_list}}, user),
            {"_id": 0, "id": 1, "title": 1, "findings_text": 1, "description": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _pick_label(doc, "title", "findings_text", "description")
            if label:
                text = label[:80] + ("…" if len(label) > 80 else "")
                labels[doc["id"]] = text
        return labels

    if node_type == "scheduled_task":
        cursor = db.scheduled_tasks.find(
            {"id": {"$in": id_list}},
            {"_id": 0, "id": 1, "task_name": 1, "name": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _pick_label(doc, "task_name", "name")
            if label:
                labels[doc["id"]] = label
        return labels

    if node_type == "task_instance":
        cursor = db.task_instances.find(
            {"id": {"$in": id_list}},
            {"_id": 0, "id": 1, "name": 1, "task_name": 1},
        )
        for doc in await cursor.to_list(len(id_list)):
            label = _pick_label(doc, "name", "task_name")
            if label:
                labels[doc["id"]] = label
        return labels

    return labels


def _collect_node_refs(edges: Iterable[dict]) -> Dict[str, Set[str]]:
    by_type: Dict[str, Set[str]] = {}
    for edge in edges:
        for node_id, node_type in (
            (edge.get("source_id"), edge.get("source_type")),
            (edge.get("target_id"), edge.get("target_type")),
        ):
            if not node_id or not node_type:
                continue
            by_type.setdefault(node_type, set()).add(str(node_id))
    return by_type


async def resolve_node_labels(
    edges: List[dict],
    *,
    user: Optional[dict] = None,
    extra_refs: Optional[List[NodeRef]] = None,
) -> Dict[str, str]:
    """Return map of ``type:id`` → display label."""
    by_type = _collect_node_refs(edges)
    if extra_refs:
        for node_type, node_id in extra_refs:
            if node_type and node_id:
                by_type.setdefault(node_type, set()).add(str(node_id))

    resolved: Dict[str, str] = {}
    for node_type, node_ids in by_type.items():
        type_labels = await _load_labels_for_type(node_type, node_ids, user=user)
        for node_id, label in type_labels.items():
            resolved[node_ref_key(node_type, node_id)] = label
    return resolved


async def enrich_edges_with_labels(
    edges: List[dict],
    *,
    user: Optional[dict] = None,
    extra_refs: Optional[List[NodeRef]] = None,
) -> Tuple[List[dict], Dict[str, str]]:
    """Attach source_label / target_label on each edge."""
    labels = await resolve_node_labels(edges, user=user, extra_refs=extra_refs)
    enriched: List[dict] = []
    for edge in edges:
        row = dict(edge)
        src_type, src_id = edge.get("source_type"), edge.get("source_id")
        tgt_type, tgt_id = edge.get("target_type"), edge.get("target_id")
        if src_type and src_id:
            row["source_label"] = labels.get(node_ref_key(src_type, str(src_id)))
        if tgt_type and tgt_id:
            row["target_label"] = labels.get(node_ref_key(tgt_type, str(tgt_id)))
        enriched.append(row)
    return enriched, labels
