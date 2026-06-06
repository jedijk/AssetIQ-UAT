"""Failure mode recommended actions sync and merge."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple, Set
import asyncio
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from difflib import SequenceMatcher
import logging
import re
import time

from utils.mongo_regex import escape_regex, exact_case_insensitive
from services.ai_gateway import chat as ai_gateway_chat
from services.failure_modes.cache import _cache, _invalidate_cache

logger = logging.getLogger(__name__)


class FailureModesMixin:
    """Mixin — use only via FailureModesService."""

    @staticmethod
    def _normalize_action_text(value: Any) -> str:
        from services.pm_import_service import PMImportService

        return PMImportService._normalize_action_text(value)

    @staticmethod
    def _action_display_label(action: Any, index: int) -> str:
        if isinstance(action, dict):
            return (
                action.get("description")
                or action.get("action")
                or action.get("name")
                or f"Action {index + 1}"
            )
        if action:
            return str(action)
        return f"Action {index + 1}"

    @classmethod
    def _action_tokens(cls, action: Any) -> Set[str]:
        text = cls._normalize_action_text(action)
        return {t for t in text.split() if t not in cls._ACTION_SIM_STOPWORDS and len(t) > 2}

    @classmethod
    def _action_token_jaccard(cls, a: Any, b: Any) -> float:
        ta, tb = cls._action_tokens(a), cls._action_tokens(b)
        if not ta or not tb:
            return 0.0
        return len(ta & tb) / len(ta | tb)

    ACTION_DUP_JACCARD = 0.48
    ACTION_DUP_RATIO = 0.75
    ACTION_DUP_AI_MIN_CONFIDENCE = 75.0

    @classmethod
    def _actions_similar_pair(
        cls,
        action_a: Any,
        action_b: Any,
        ratio_threshold: float,
        jaccard_threshold: float,
        *,
        strict_pairing: bool = False,
    ) -> bool:
        norm_a = cls._normalize_action_text(action_a)
        norm_b = cls._normalize_action_text(action_b)
        if norm_a and norm_a == norm_b:
            return True
        if not norm_a or not norm_b:
            return False
        ratio = SequenceMatcher(None, norm_a, norm_b).ratio()
        jacc = cls._action_token_jaccard(action_a, action_b)
        if strict_pairing:
            return (ratio >= ratio_threshold and jacc >= jaccard_threshold) or ratio >= 0.88
        return ratio >= ratio_threshold or jacc >= jaccard_threshold

    @classmethod
    def _action_indices_coherent(
        cls,
        actions: List[Any],
        indices: List[int],
        ratio_threshold: float,
        jaccard_threshold: float,
    ) -> bool:
        if len(indices) < 2:
            return False
        for i in range(len(indices)):
            for j in range(i + 1, len(indices)):
                if not cls._actions_similar_pair(
                    actions[indices[i]],
                    actions[indices[j]],
                    ratio_threshold,
                    jaccard_threshold,
                    strict_pairing=True,
                ):
                    return False
        return True

    @classmethod
    def _cluster_duplicate_action_indices(
        cls,
        actions: List[Any],
        ratio_threshold: float = ACTION_DUP_RATIO,
        jaccard_threshold: float = ACTION_DUP_JACCARD,
        *,
        strict_pairing: bool = True,
    ) -> List[List[int]]:
        """Single-link clusters of near-duplicate recommended actions."""
        n = len(actions or [])
        if n < 2:
            return []

        parent = list(range(n))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: int, b: int) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for i in range(n):
            for j in range(i + 1, n):
                if cls._actions_similar_pair(
                    actions[i],
                    actions[j],
                    ratio_threshold,
                    jaccard_threshold,
                    strict_pairing=strict_pairing,
                ):
                    union(i, j)

        cluster_map: Dict[int, List[int]] = {}
        for i in range(n):
            cluster_map.setdefault(find(i), []).append(i)
        return [sorted(idxs) for idxs in cluster_map.values() if len(idxs) >= 2]

    def _format_action_group(
        self,
        actions: List[Any],
        indices: List[int],
        reason: str,
        detection_method: str,
        confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        members = []
        pair_ratios: List[float] = []
        for idx in indices:
            action = actions[idx]
            members.append({
                "index": idx,
                "label": self._action_display_label(action, idx),
                "action_type": (
                    action.get("action_type") or action.get("task_type")
                    if isinstance(action, dict)
                    else None
                ),
                "discipline": (
                    action.get("discipline") if isinstance(action, dict) else None
                ),
            })
        for i in range(len(indices)):
            for j in range(i + 1, len(indices)):
                ni = self._normalize_action_text(actions[indices[i]])
                nj = self._normalize_action_text(actions[indices[j]])
                if ni and nj:
                    pair_ratios.append(SequenceMatcher(None, ni, nj).ratio())
        avg_ratio = (
            round(sum(pair_ratios) / len(pair_ratios) * 100, 1)
            if pair_ratios
            else (confidence or 100.0)
        )
        suggestion = self._build_duplicate_group_suggestion(actions, indices)
        return {
            "action_indices": indices,
            "members": members,
            "avg_similarity_score": avg_ratio,
            "reason": reason,
            "detection_method": detection_method,
            "ai_confidence": confidence,
            **suggestion,
        }

    async def _ai_confirm_duplicate_action_cluster(
        self,
        failure_mode_name: str,
        equipment: str,
        actions: List[Any],
        indices: List[int],
        *,
        user_id: str = "system",
        company_id: str = "default",
    ) -> List[Dict[str, Any]]:
        """GPT confirms a small lexical cluster of duplicate actions."""
        import json

        if len(indices) < 2 or len(indices) > 12:
            return []

        payload = []
        for local_idx, action_idx in enumerate(indices):
            action = actions[action_idx]
            payload.append({
                "index": local_idx,
                "action_index": action_idx,
                "description": self._action_display_label(action, action_idx)[:400],
                "action_type": (
                    action.get("action_type") or action.get("task_type")
                    if isinstance(action, dict)
                    else ""
                ),
                "discipline": (
                    action.get("discipline") if isinstance(action, dict) else ""
                ),
            })

        sys_prompt = (
            "You are a maintenance reliability engineer. Only group actions that are "
            "CLEAR duplicates (same maintenance task and scope). DO NOT group inspect "
            "vs replace/repair, lubrication vs overhaul, cleaning vs calibration, or "
            "tasks that differ in action_type/discipline. When unsure, return no groups. "
            "Return strict JSON only."
        )
        user_msg = (
            f"Failure mode: {failure_mode_name}\n"
            f"Equipment: {equipment or '—'}\n\n"
            f"Candidate actions:\n{json.dumps(payload, indent=2)}\n\n"
            'Return JSON: {"groups": [{"member_indices": [0, 1], "keep_index": 0, '
            '"reason": "<= 20 words", "confidence": 0-100}]}. '
            "Only groups with 2+ local indices you are confident are duplicates "
            "(confidence ≥ 75). Each local index in at most one group."
        )

        data = None
        try:
            content = await ai_gateway_chat(
                [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_msg},
                ],
                user_id=user_id,
                company_id=company_id,
                endpoint="failure_modes.ai_confirm_duplicate_actions",
                model="gpt-4o-mini",
                temperature=0,
                max_tokens=800,
                response_format={"type": "json_object"},
            )
            data = json.loads(content.strip())
        except json.JSONDecodeError:
            logger.warning("AI duplicate-actions JSON parse failed for %s", failure_mode_name)
        if not data:
            return []

        local_to_action = {i: indices[i] for i in range(len(indices))}
        groups_out: List[Dict[str, Any]] = []
        used: Set[int] = set()
        for g in data.get("groups") or []:
            if not isinstance(g, dict):
                continue
            raw_indices = g.get("member_indices") or g.get("action_indices") or []
            mapped: List[int] = []
            for raw in raw_indices:
                try:
                    local_i = int(raw)
                except (TypeError, ValueError):
                    continue
                action_i = local_to_action.get(local_i)
                if action_i is not None and action_i not in used:
                    mapped.append(action_i)
            mapped = sorted(set(mapped))
            if len(mapped) < 2:
                continue
            if not self._action_indices_coherent(
                actions,
                mapped,
                self.ACTION_DUP_RATIO,
                self.ACTION_DUP_JACCARD,
            ):
                continue
            conf = g.get("confidence")
            try:
                confidence = float(conf) if conf is not None else None
            except (TypeError, ValueError):
                confidence = None
            if confidence is not None and confidence < self.ACTION_DUP_AI_MIN_CONFIDENCE:
                continue
            keep = g.get("keep_index")
            try:
                keep_local = int(keep) if keep is not None else 0
            except (TypeError, ValueError):
                keep_local = 0
            keep_index = local_to_action.get(keep_local, mapped[0])
            if keep_index not in mapped:
                keep_index = mapped[0]
            used.update(mapped)
            reason = (g.get("reason") or "AI: same maintenance task").strip()[:240]
            group = self._format_action_group(
                actions,
                mapped,
                reason=reason,
                detection_method="ai",
                confidence=confidence,
            )
            group["suggested_keep_index"] = keep_index
            group["suggested_remove_indices"] = [i for i in mapped if i != keep_index]
            groups_out.append(group)
        return groups_out

    @staticmethod
    def _action_completeness_score(action: Any) -> int:
        if not isinstance(action, dict):
            return len(str(action or ""))
        return (
            len(action.get("description") or action.get("action") or action.get("name") or "")
            + (15 if action.get("discipline") else 0)
            + (15 if action.get("action_type") or action.get("task_type") else 0)
            + (10 if action.get("estimated_minutes") else 0)
            + (5 if action.get("frequency") else 0)
            + (5 if action.get("estimated_time") else 0)
        )

    @staticmethod
    def _merge_action_dict(keep: Any, other: Any) -> Dict[str, Any]:
        if isinstance(keep, dict):
            merged: Dict[str, Any] = dict(keep)
        else:
            merged = {"description": str(keep)}
        if isinstance(other, dict):
            for key, val in other.items():
                if val is None or val == "":
                    continue
                if not merged.get(key):
                    merged[key] = val
            action_type = other.get("action_type") or other.get("task_type")
            if action_type:
                merged["action_type"] = action_type
                merged["task_type"] = action_type
            if other.get("discipline"):
                merged["discipline"] = other["discipline"]
        return merged

    def _build_duplicate_group_suggestion(
        self, actions: List[Any], indices: List[int]
    ) -> Dict[str, Any]:
        keep_index = max(indices, key=lambda i: self._action_completeness_score(actions[i]))
        remove_indices = [i for i in indices if i != keep_index]
        merged = actions[keep_index]
        for ri in remove_indices:
            merged = self._merge_action_dict(merged, actions[ri])
        return {
            "suggested_keep_index": keep_index,
            "suggested_remove_indices": remove_indices,
            "merged_action_preview": {
                "label": self._action_display_label(merged, keep_index),
                "action_type": (
                    merged.get("action_type") or merged.get("task_type")
                    if isinstance(merged, dict)
                    else None
                ),
                "discipline": merged.get("discipline") if isinstance(merged, dict) else None,
            },
        }

    async def merge_duplicate_action_groups(
        self,
        failure_mode_id: str,
        groups: List[Dict[str, Any]],
        updated_by: str = "Duplicate action merge",
    ) -> Dict[str, Any]:
        """Apply multiple duplicate-action merges on one failure mode in a single update."""
        if not groups:
            raise ValueError("No merge groups provided")

        doc = await self._resolve_fm_doc(failure_mode_id)
        if not doc:
            raise LookupError(f"Failure mode {failure_mode_id} not found")

        actions = list(doc.get("recommended_actions") or [])
        n = len(actions)
        if n < 2:
            raise ValueError("Failure mode has fewer than 2 actions")

        to_delete: Set[int] = set()
        keep_indices: Set[int] = set()
        merged_groups: List[Dict[str, Any]] = []

        for g in groups:
            try:
                keep = int(g["keep_index"])
            except (TypeError, ValueError, KeyError):
                raise ValueError("Each group requires a numeric keep_index") from None
            if keep < 0 or keep >= n:
                raise ValueError(f"keep_index {keep} out of range (0–{n - 1})")
            if keep in to_delete:
                raise ValueError(
                    f"keep_index {keep} was already removed by another selected group — "
                    "merge groups separately or re-run the scan"
                )
            remove_set: Set[int] = set()
            for raw in g.get("remove_indices") or []:
                try:
                    ri = int(raw)
                except (TypeError, ValueError):
                    continue
                if ri == keep or ri < 0 or ri >= n:
                    continue
                remove_set.add(ri)
            if not remove_set:
                raise ValueError(
                    f"Group at keep_index {keep} has no valid remove indices"
                )
            merged_action = actions[keep]
            for ri in sorted(remove_set):
                merged_action = self._merge_action_dict(merged_action, actions[ri])
                to_delete.add(ri)
            actions[keep] = merged_action
            keep_indices.add(keep)
            to_delete.discard(keep)
            merged_groups.append({
                "keep_index": keep,
                "removed_indices": sorted(remove_set),
            })

        new_actions = [a for i, a in enumerate(actions) if i not in to_delete]
        if len(new_actions) >= n:
            raise ValueError("Merge would not remove any actions")

        mode_id_str = str(doc.get("id") or doc["_id"])
        updated = await self.update(
            mode_id_str,
            {"recommended_actions": new_actions},
            updated_by=updated_by,
            change_reason="Merged duplicate recommended actions",
        )
        if not updated:
            raise RuntimeError("Failed to update failure mode")

        return {
            "success": True,
            "failure_mode_id": mode_id_str,
            "groups_merged": len(merged_groups),
            "merged_groups": merged_groups,
            "actions_before": n,
            "actions_after": len(new_actions),
        }

    async def merge_duplicate_action_group(
        self,
        failure_mode_id: str,
        keep_index: int,
        remove_indices: List[int],
        updated_by: str = "Duplicate action merge",
    ) -> Dict[str, Any]:
        """Merge duplicate recommended actions into one slot; remove the rest."""
        return await self.merge_duplicate_action_groups(
            failure_mode_id,
            groups=[{"keep_index": keep_index, "remove_indices": remove_indices}],
            updated_by=updated_by,
        )

    async def scan_duplicate_actions(
        self,
        failure_mode_id: Optional[str] = None,
        ratio_threshold: float = ACTION_DUP_RATIO,
        jaccard_threshold: float = ACTION_DUP_JACCARD,
        use_ai: bool = True,
        ai_max_failure_modes: int = 50,
        ai_max_clusters_per_fm: int = 3,
        limit_results: int = 500,
        user_id: str = "system",
        company_id: str = "default",
    ) -> Dict[str, Any]:
        """Find duplicate recommended_actions within each failure mode (library-wide scan)."""
        query: Dict[str, Any] = {}
        if failure_mode_id:
            id_query = self._build_id_query(failure_mode_id)
            if id_query:
                query = id_query

        cursor = self.collection.find(
            query,
            {
                "_id": 1,
                "id": 1,
                "failure_mode": 1,
                "equipment": 1,
                "recommended_actions": 1,
            },
        ).sort("failure_mode", 1)

        results: List[Dict[str, Any]] = []
        total_actions_scanned = 0
        failure_modes_scanned = 0
        ai_failure_modes_processed = 0
        ai_errors = 0

        async for doc in cursor:
            failure_modes_scanned += 1
            fm_id = str(doc.get("id") or doc["_id"])
            actions = doc.get("recommended_actions") or []
            if len(actions) < 2:
                continue
            total_actions_scanned += len(actions)

            duplicate_groups: List[Dict[str, Any]] = []
            fm_name = doc.get("failure_mode") or ""
            equipment = doc.get("equipment") or ""

            lexical_clusters = self._cluster_duplicate_action_indices(
                actions,
                ratio_threshold=ratio_threshold,
                jaccard_threshold=jaccard_threshold,
                strict_pairing=True,
            )
            if not lexical_clusters:
                continue

            fm_ai_failed = False
            if use_ai and ai_failure_modes_processed < ai_max_failure_modes:
                ai_failure_modes_processed += 1
                clusters_reviewed = 0
                for indices in lexical_clusters:
                    if clusters_reviewed >= ai_max_clusters_per_fm:
                        break
                    if len(indices) < 2 or len(indices) > 12:
                        continue
                    clusters_reviewed += 1
                    try:
                        confirmed = await self._ai_confirm_duplicate_action_cluster(
                            fm_name,
                            equipment,
                            actions,
                            indices,
                            user_id=user_id,
                            company_id=company_id,
                        )
                        duplicate_groups.extend(confirmed)
                    except Exception as e:
                        logger.warning(
                            "AI duplicate-action cluster failed for %s: %s",
                            fm_name,
                            e,
                        )
                        ai_errors += 1
                        fm_ai_failed = True

            if not duplicate_groups and (not use_ai or fm_ai_failed):
                for indices in lexical_clusters:
                    if not self._action_indices_coherent(
                        actions, indices, ratio_threshold, jaccard_threshold
                    ):
                        continue
                    duplicate_groups.append(
                        self._format_action_group(
                            actions,
                            indices,
                            reason=(
                                "Similar wording (strict lexical match)"
                                if not use_ai
                                else "Similar wording (AI unavailable, strict match)"
                            ),
                            detection_method="lexical",
                        )
                    )

            if duplicate_groups:
                results.append({
                    "failure_mode_id": fm_id,
                    "failure_mode": doc.get("failure_mode") or "",
                    "equipment": doc.get("equipment") or "",
                    "action_count": len(actions),
                    "duplicate_groups": duplicate_groups,
                    "duplicate_group_count": len(duplicate_groups),
                })
                if len(results) >= limit_results:
                    break

        duplicate_action_count = sum(
            len(r.get("duplicate_groups") or []) for r in results
        )
        return {
            "failure_mode_id": failure_mode_id,
            "scan_method": "ai" if use_ai else "lexical",
            "ratio_threshold": ratio_threshold,
            "jaccard_threshold": jaccard_threshold,
            "failure_modes_scanned": failure_modes_scanned,
            "total_actions_scanned": total_actions_scanned,
            "ai_failure_modes_processed": ai_failure_modes_processed,
            "ai_errors": ai_errors,
            "failure_modes_with_duplicates": len(results),
            "duplicate_group_count": duplicate_action_count,
            "results": results,
        }

    async def _resolve_fm_doc(self, mode_id: str) -> Optional[Dict[str, Any]]:
        query = self._build_id_query(mode_id)
        if not query:
            return None
        return await self.collection.find_one(query)

    async def _repoint_failure_mode_references(
        self,
        winner_id: str,
        loser_ids: List[str],
        winner_name: str,
    ) -> Dict[str, int]:
        """Update collections that store failure_mode_id / failure_mode_ids."""
        loser_set = set(loser_ids)
        counts: Dict[str, int] = {}
        now = datetime.now(timezone.utc)

        res = await self.db["equipment_failure_modes"].update_many(
            {"failure_mode_id": {"$in": list(loser_set)}},
            {"$set": {
                "failure_mode_id": winner_id,
                "failure_mode_name": winner_name,
                "updated_at": now,
            }},
        )
        counts["equipment_failure_modes"] = res.modified_count

        res = await self.db["observations"].update_many(
            {"failure_mode_id": {"$in": list(loser_set)}},
            {"$set": {"failure_mode_id": winner_id, "updated_at": now}},
        )
        counts["observations"] = res.modified_count

        collection_names = await self.db.list_collection_names()
        for coll_name in ("task_templates", "maintenance_programs"):
            if coll_name not in collection_names:
                continue
            res = await self.db[coll_name].update_many(
                {"failure_mode_id": {"$in": list(loser_set)}},
                {"$set": {"failure_mode_id": winner_id}},
            )
            counts[coll_name] = res.modified_count

        # failure_mode_ids arrays on task templates / forms
        for coll_name in ("task_templates", "form_templates", "form_definitions"):
            if coll_name not in collection_names:
                continue
            modified = 0
            async for doc in self.db[coll_name].find(
                {"failure_mode_ids": {"$in": list(loser_set)}},
                {"_id": 1, "failure_mode_ids": 1},
            ):
                old_ids = [str(x) for x in (doc.get("failure_mode_ids") or [])]
                new_ids = []
                seen = set()
                for fid in old_ids:
                    mapped = winner_id if fid in loser_set else fid
                    if mapped in seen:
                        continue
                    seen.add(mapped)
                    new_ids.append(mapped)
                if winner_id not in seen:
                    new_ids.append(winner_id)
                await self.db[coll_name].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"failure_mode_ids": new_ids}},
                )
                modified += 1
            counts[f"{coll_name}_arrays"] = modified

        # Embedded strategies on equipment_type_strategies
        strat_modified = 0
        async for strat in self.db["equipment_type_strategies"].find({}):
            fm_strategies = strat.get("failure_mode_strategies") or strat.get("failure_modes") or []
            tasks = strat.get("task_templates") or strat.get("tasks") or []
            changed = False
            new_fm_strategies = []
            seen_fm_ids: Set[str] = set()

            for fm_s in fm_strategies:
                fid = str(fm_s.get("failure_mode_id") or "")
                if fid in loser_set:
                    fm_s = {**fm_s, "failure_mode_id": winner_id, "failure_mode_name": winner_name}
                    fid = winner_id
                    changed = True
                if fid and fid in seen_fm_ids:
                    changed = True
                    continue
                if fid:
                    seen_fm_ids.add(fid)
                new_fm_strategies.append(fm_s)

            new_tasks = []
            for task in tasks:
                t_ids = [str(x) for x in (task.get("failure_mode_ids") or [])]
                if any(t in loser_set for t in t_ids):
                    changed = True
                    merged = []
                    seen_t = set()
                    for t in t_ids:
                        m = winner_id if t in loser_set else t
                        if m not in seen_t:
                            seen_t.add(m)
                            merged.append(m)
                    if winner_id not in seen_t:
                        merged.append(winner_id)
                    task = {**task, "failure_mode_ids": merged}
                new_tasks.append(task)

            if changed:
                update_doc: Dict[str, Any] = {"updated_at": now}
                if fm_strategies:
                    key = "failure_mode_strategies" if strat.get("failure_mode_strategies") is not None else "failure_modes"
                    update_doc[key] = new_fm_strategies
                if tasks:
                    key = "task_templates" if strat.get("task_templates") is not None else "tasks"
                    update_doc[key] = new_tasks
                await self.db["equipment_type_strategies"].update_one(
                    {"_id": strat["_id"]},
                    {"$set": update_doc},
                )
                strat_modified += 1
        counts["equipment_type_strategies"] = strat_modified

        return counts

    async def merge_failure_modes(
        self,
        winner_id: str,
        loser_ids: List[str],
        canonical_name: Optional[str] = None,
        dry_run: bool = False,
        merged_by: Optional[str] = None,
        auto_pick_primary: bool = False,
    ) -> Dict[str, Any]:
        """
        Merge loser failure modes into winner. Backs up losers to fm_merge_log unless dry_run.
        Repoints failure_mode_id references when not dry_run.
        """
        loser_ids = [str(x).strip() for x in loser_ids if str(x).strip()]
        winner_id = str(winner_id).strip()
        if not winner_id or not loser_ids:
            raise ValueError("winner_id and loser_ids are required")
        if winner_id in loser_ids:
            raise ValueError("winner_id cannot also be a loser")

        if auto_pick_primary:
            all_docs = []
            for mid in [winner_id] + loser_ids:
                doc = await self._resolve_fm_doc(mid)
                if doc:
                    all_docs.append(doc)
            if len(all_docs) < 2:
                raise LookupError("Need at least two failure modes to auto-pick primary")
            winner_doc = max(all_docs, key=self._fm_completeness_score)
            winner_id = str(winner_doc["_id"])
            loser_ids = [str(d["_id"]) for d in all_docs if str(d["_id"]) != winner_id]
        else:
            winner_doc = await self._resolve_fm_doc(winner_id)
            if not winner_doc:
                raise LookupError("Winner failure mode not found")

        loser_docs = []
        for lid in loser_ids:
            doc = await self._resolve_fm_doc(lid)
            if doc and doc["_id"] != winner_doc["_id"]:
                loser_docs.append(doc)

        if not loser_docs:
            raise LookupError("No valid loser failure modes found")

        def _dedup(items, key=lambda x: x):
            seen, out = set(), []
            for it in items or []:
                k = key(it)
                if k in seen:
                    continue
                seen.add(k)
                out.append(it)
            return out

        def _action_key(a):
            if isinstance(a, str):
                return self.normalize_fm_text(a)
            if isinstance(a, dict):
                return self.normalize_fm_text(
                    a.get("action") or a.get("description") or ""
                )
            return self.normalize_fm_text(str(a))

        def _str_key(v):
            return self.normalize_fm_text(v) if isinstance(v, str) else self.normalize_fm_text(str(v))

        merged_ets = _dedup(
            list(winner_doc.get("equipment_type_ids") or [])
            + [eid for ld in loser_docs for eid in (ld.get("equipment_type_ids") or [])]
        )
        merged_kw = _dedup(
            list(winner_doc.get("keywords") or [])
            + [k for ld in loser_docs for k in (ld.get("keywords") or [])],
            key=_str_key,
        )
        merged_actions = _dedup(
            list(winner_doc.get("recommended_actions") or [])
            + [a for ld in loser_docs for a in (ld.get("recommended_actions") or [])],
            key=_action_key,
        )
        merged_effects = _dedup(
            list(winner_doc.get("potential_effects") or [])
            + [e for ld in loser_docs for e in (ld.get("potential_effects") or [])],
            key=_str_key,
        )
        merged_causes = _dedup(
            list(winner_doc.get("potential_causes") or [])
            + [c for ld in loser_docs for c in (ld.get("potential_causes") or [])],
            key=_str_key,
        )

        final_name = (canonical_name or "").strip() or winner_doc.get("failure_mode")
        update_fields = {
            "equipment_type_ids": merged_ets,
            "keywords": merged_kw,
            "recommended_actions": merged_actions,
            "potential_effects": merged_effects,
            "potential_causes": merged_causes,
            "updated_at": datetime.now(timezone.utc),
            "version": (winner_doc.get("version") or 1) + 1,
        }
        if canonical_name:
            update_fields["failure_mode"] = canonical_name.strip()

        winner_id_str = str(winner_doc["_id"])
        loser_id_strs = [str(ld["_id"]) for ld in loser_docs]

        preview = {
            "dry_run": dry_run,
            "winner_id": winner_id_str,
            "loser_ids": loser_id_strs,
            "canonical_name": final_name,
            "update_fields": update_fields,
            "losers_to_delete": [
                {"id": lid, "failure_mode": ld.get("failure_mode")} for lid, ld in zip(loser_id_strs, loser_docs)
            ],
        }

        if dry_run:
            return preview

        await self._save_version(
            winner_doc,
            updated_by=merged_by or "merge",
            change_reason="Pre-merge snapshot",
        )

        await self.db["fm_merge_log"].insert_one({
            "merged_at": datetime.now(timezone.utc),
            "merged_by": merged_by,
            "winner_id": winner_id_str,
            "winner_failure_mode": final_name,
            "previous_winner_name": winner_doc.get("failure_mode"),
            "losers": [
                {**{k: v for k, v in ld.items() if k != "_id"}, "_mongo_id": str(ld["_id"])}
                for ld in loser_docs
            ],
        })

        await self.collection.update_one({"_id": winner_doc["_id"]}, {"$set": update_fields})
        deleted = 0
        for ld in loser_docs:
            await self._save_version(ld, updated_by=merged_by or "merge", change_reason="Merged into " + winner_id_str)
            res = await self.collection.delete_one({"_id": ld["_id"]})
            deleted += res.deleted_count

        repoint_counts = await self._repoint_failure_mode_references(
            winner_id_str, loser_id_strs, final_name
        )
        _invalidate_cache()

        return {
            **preview,
            "dry_run": False,
            "deleted_count": deleted,
            "repoint_counts": repoint_counts,
        }

