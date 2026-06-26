"""Duplicate recommended-action detection and merge within failure modes."""
from __future__ import annotations

import logging
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Set

from services.failure_modes.action_duplicate_similarity import actions_similar_for_duplicates

logger = logging.getLogger(__name__)


class ActionsDuplicateScanMixin:
    """Mixin — requires action text helpers, CRUD update(), and _resolve_fm_doc()."""

    _ACTION_SIM_STOPWORDS = {
        "the", "a", "an", "of", "in", "on", "and", "or", "by", "to", "for",
        "from", "with", "at", "per", "every", "each", "all", "check", "inspect",
        "frequency", "monthly", "weekly", "annual", "task", "pm", "action",
    }

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
    ACTION_DUP_FULL_FM_AI_MAX_ACTIONS = 20

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
        jacc = cls._action_token_jaccard(action_a, action_b)
        return actions_similar_for_duplicates(
            norm_a,
            norm_b,
            general_jaccard=jacc,
            ratio_threshold=ratio_threshold,
            jaccard_threshold=jaccard_threshold,
            strict_pairing=strict_pairing,
        )

    @classmethod
    def _action_indices_coherent(
        cls,
        actions: List[Any],
        indices: List[int],
        ratio_threshold: float,
        jaccard_threshold: float,
        *,
        strict_pairing: bool = True,
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
                    strict_pairing=strict_pairing,
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
            from services.ai_platform import execute_json_prompt

            result = await execute_json_prompt(
                "fm.confirm_duplicate_actions",
                user={"id": user_id, "company_id": company_id},
                user_message=user_msg,
                endpoint="failure_modes.ai_confirm_duplicate_actions",
                model="gpt-4o-mini",
                temperature=0,
                max_tokens=800,
                response_format={"type": "json_object"},
            )
            parsed = result["parsed"]
            data = parsed if isinstance(parsed, dict) else None
        except Exception:
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
                strict_pairing=False,
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

            lexical_clusters_loose = self._cluster_duplicate_action_indices(
                actions,
                ratio_threshold=ratio_threshold,
                jaccard_threshold=jaccard_threshold,
                strict_pairing=False,
            )
            lexical_clusters_strict = (
                self._cluster_duplicate_action_indices(
                    actions,
                    ratio_threshold=ratio_threshold,
                    jaccard_threshold=jaccard_threshold,
                    strict_pairing=True,
                )
                if lexical_clusters_loose
                else []
            )

            fm_ai_failed = False
            ai_covered_indices: Set[int] = set()
            if use_ai and ai_failure_modes_processed < ai_max_failure_modes:
                ai_failure_modes_processed += 1
                try:
                    if len(actions) <= self.ACTION_DUP_FULL_FM_AI_MAX_ACTIONS:
                        confirmed = await self._ai_confirm_duplicate_action_cluster(
                            fm_name,
                            equipment,
                            actions,
                            list(range(len(actions))),
                            user_id=user_id,
                            company_id=company_id,
                        )
                        duplicate_groups.extend(confirmed)
                    else:
                        clusters_reviewed = 0
                        for indices in lexical_clusters_loose:
                            if clusters_reviewed >= ai_max_clusters_per_fm:
                                break
                            if len(indices) < 2 or len(indices) > 12:
                                continue
                            clusters_reviewed += 1
                            confirmed = await self._ai_confirm_duplicate_action_cluster(
                                fm_name,
                                equipment,
                                actions,
                                indices,
                                user_id=user_id,
                                company_id=company_id,
                            )
                            duplicate_groups.extend(confirmed)
                    for group in duplicate_groups:
                        for idx in group.get("action_indices") or []:
                            ai_covered_indices.add(int(idx))
                except Exception as e:
                    logger.warning(
                        "AI duplicate-action cluster failed for %s: %s",
                        fm_name,
                        e,
                    )
                    ai_errors += 1
                    fm_ai_failed = True

            fallback_clusters = lexical_clusters_loose or lexical_clusters_strict
            for indices in fallback_clusters:
                if ai_covered_indices and all(i in ai_covered_indices for i in indices):
                    continue
                if duplicate_groups and any(
                    set(indices) == set(g.get("action_indices") or [])
                    for g in duplicate_groups
                ):
                    continue
                if not self._action_indices_coherent(
                    actions,
                    indices,
                    ratio_threshold,
                    jaccard_threshold,
                    strict_pairing=not use_ai and not fm_ai_failed,
                ):
                    continue
                duplicate_groups.append(
                    self._format_action_group(
                        actions,
                        indices,
                        reason=(
                            "Similar maintenance task (lexical match)"
                            if not use_ai or fm_ai_failed
                            else "Similar maintenance task (lexical supplement)"
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
