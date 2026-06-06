"""Failure mode library search and similarity scanning."""
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

    def normalize_fm_text(value: Any) -> str:
        """Normalize failure-mode names (and short text) for lexical comparison."""
        if value is None:
            return ""
        text = str(value)
        text = re.sub(r"[^a-z0-9\s]", " ", text.lower())
        return re.sub(r"\s+", " ", text).strip()

    @classmethod
    def _fm_name_tokens(cls, name: str) -> Set[str]:
        raw = cls.normalize_fm_text(name).split()
        return {t for t in raw if t not in cls._FM_SIM_STOPWORDS and len(t) > 2}

    @classmethod
    def _token_jaccard(cls, a: Set[str], b: Set[str]) -> float:
        if not a or not b:
            return 0.0
        return len(a & b) / len(a | b)

    @classmethod
    def score_similarity(cls, fm_a: Dict[str, Any], fm_b: Dict[str, Any]) -> Dict[str, Any]:
        """Score how similar two failure modes are (0–100). Higher = more likely duplicate."""
        if str(fm_a.get("id")) == str(fm_b.get("id")):
            return {"score": 0, "name_ratio": 0.0, "token_jaccard": 0.0, "shared_equipment_types": []}

        name_a = (fm_a.get("failure_mode") or "").strip()
        name_b = (fm_b.get("failure_mode") or "").strip()
        norm_a = cls.normalize_fm_text(name_a)
        norm_b = cls.normalize_fm_text(name_b)

        if norm_a and norm_a == norm_b:
            name_ratio = 1.0
            jacc = 1.0
        else:
            name_ratio = SequenceMatcher(None, norm_a, norm_b).ratio() if norm_a and norm_b else 0.0
            jacc = cls._token_jaccard(cls._fm_name_tokens(name_a), cls._fm_name_tokens(name_b))

        ets_a = {str(t) for t in (fm_a.get("equipment_type_ids") or [])}
        ets_b = {str(t) for t in (fm_b.get("equipment_type_ids") or [])}
        shared_ets = sorted(ets_a & ets_b)

        score = max(name_ratio, jacc) * 70.0
        if norm_a and norm_a == norm_b:
            # Same title on different equipment types (e.g. two "Bearing Failure" rows)
            score += 15.0
        if shared_ets:
            score += 20.0
        if (fm_a.get("category") or "").lower() == (fm_b.get("category") or "").lower() and fm_a.get("category"):
            score += 5.0
        if (fm_a.get("equipment") or "").lower() == (fm_b.get("equipment") or "").lower() and fm_a.get("equipment"):
            score += 5.0

        mech_a = cls.normalize_fm_text(fm_a.get("mechanism") or fm_a.get("iso14224_mechanism") or "")
        mech_b = cls.normalize_fm_text(fm_b.get("mechanism") or fm_b.get("iso14224_mechanism") or "")
        if mech_a and mech_b and mech_a != mech_b:
            # Different ISO mechanisms — penalize (Wear ≠ Seizure)
            mech_ratio = SequenceMatcher(None, mech_a, mech_b).ratio()
            if mech_ratio < 0.65:
                score *= 0.45

        score = min(100.0, round(score, 1))
        return {
            "score": score,
            "name_ratio": round(name_ratio, 3),
            "token_jaccard": round(jacc, 3),
            "shared_equipment_types": shared_ets,
        }

    # Defaults for library-wide "find similar" (tighter than duplicate-actions scan).
    SIMILAR_FM_JACCARD = 0.45
    SIMILAR_FM_RATIO = 0.72
    SIMILAR_FM_MIN_SCORE = 52.0
    SIMILAR_FM_AI_MIN_CONFIDENCE = 72.0

    @classmethod
    def _fm_names_similar_pair(
        cls,
        fm_a: Dict[str, Any],
        fm_b: Dict[str, Any],
        jaccard_threshold: float,
        ratio_threshold: float,
        *,
        strict_pairing: bool = False,
    ) -> bool:
        name_a = (fm_a.get("failure_mode") or "").strip()
        name_b = (fm_b.get("failure_mode") or "").strip()
        norm_a = cls.normalize_fm_text(name_a)
        norm_b = cls.normalize_fm_text(name_b)
        if norm_a and norm_a == norm_b:
            return True
        jacc = cls._token_jaccard(
            cls._fm_name_tokens(name_a), cls._fm_name_tokens(name_b)
        )
        ratio = (
            SequenceMatcher(None, norm_a, norm_b).ratio() if norm_a and norm_b else 0.0
        )
        if strict_pairing:
            return (ratio >= ratio_threshold and jacc >= jaccard_threshold) or ratio >= 0.86
        return jacc >= jaccard_threshold or ratio >= ratio_threshold

    @classmethod
    def _cluster_by_name_similarity(
        cls,
        fms: List[Dict[str, Any]],
        jaccard_threshold: float = 0.5,
        ratio_threshold: float = 0.8,
        *,
        strict_pairing: bool = False,
    ) -> List[List[Dict[str, Any]]]:
        """Single-link clusters on failure_mode names (same thresholds as AI dedupe pre-filter)."""
        n = len(fms)
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
                if cls._fm_names_similar_pair(
                    fms[i],
                    fms[j],
                    jaccard_threshold,
                    ratio_threshold,
                    strict_pairing=strict_pairing,
                ):
                    union(i, j)

        cluster_map: Dict[int, List[Dict[str, Any]]] = {}
        for i, fm in enumerate(fms):
            cluster_map.setdefault(find(i), []).append(fm)
        return [c for c in cluster_map.values() if len(c) >= 2]

    @staticmethod
    def _fm_completeness_score(doc: Dict[str, Any]) -> int:
        effects = doc.get("potential_effects") or []
        causes = doc.get("potential_causes") or []
        if isinstance(effects, str):
            effects = [effects]
        if isinstance(causes, str):
            causes = [causes]
        return (
            len(doc.get("recommended_actions") or []) * 3
            + len(doc.get("keywords") or []) * 2
            + len(effects)
            + len(causes)
            + (50 if doc.get("is_validated") else 0)
            + int(doc.get("rpn") or 0)
        )

    async def find_similar(
        self,
        mode_id: str,
        threshold: float = 55.0,
        limit: int = 20,
        require_shared_equipment_type: bool = False,
    ) -> Dict[str, Any]:
        """Find library failure modes similar to the given mode (lexical scoring)."""
        target = await self.get_by_id(mode_id)
        if not target:
            return {"mode_id": mode_id, "candidates": [], "total": 0}

        query: Dict[str, Any] = {}
        if require_shared_equipment_type and target.get("equipment_type_ids"):
            query["equipment_type_ids"] = {"$in": target["equipment_type_ids"]}

        cursor = self.collection.find(query).sort("rpn", -1)
        candidates = []
        target_id = str(target["id"])
        async for doc in cursor:
            serialized = self._serialize(doc)
            if str(serialized["id"]) == target_id:
                continue
            metrics = self.score_similarity(target, serialized)
            if metrics["score"] >= threshold:
                candidates.append({**serialized, **metrics})

        candidates.sort(key=lambda x: (-x["score"], -x.get("rpn", 0)))
        limited = candidates[: max(1, min(limit, 100))]
        return {
            "mode_id": target_id,
            "failure_mode": target.get("failure_mode"),
            "candidates": limited,
            "total": len(limited),
        }

    @staticmethod
    def _group_member_key(member_ids: List[str]) -> frozenset:
        return frozenset(str(x) for x in member_ids)

    def _append_group_if_new(
        self,
        groups_out: List[Dict[str, Any]],
        seen_keys: Set[frozenset],
        payload: Dict[str, Any],
        limit_groups: int,
    ) -> bool:
        """Append group when member set is new. Returns False when limit reached."""
        key = self._group_member_key(payload.get("member_ids") or [])
        if len(key) < 2 or key in seen_keys:
            return len(groups_out) < limit_groups
        seen_keys.add(key)
        groups_out.append(payload)
        return len(groups_out) < limit_groups

    def _format_similar_fm_group(
        self,
        cluster: List[Dict[str, Any]],
        reason: str,
        detection_method: str,
        confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        pair_scores = []
        for i in range(len(cluster)):
            for j in range(i + 1, len(cluster)):
                pair_scores.append(self.score_similarity(cluster[i], cluster[j])["score"])
        avg_score = (
            round(sum(pair_scores) / len(pair_scores), 1)
            if pair_scores
            else (confidence or 100.0)
        )
        best = max(cluster, key=self._fm_completeness_score)
        labels = sorted(
            {(fm.get("equipment") or "").strip() for fm in cluster if (fm.get("equipment") or "").strip()}
        )
        return {
            "equipment_type_id": None,
            "library_wide": True,
            "cross_equipment": True,
            "member_ids": [str(fm["id"]) for fm in cluster],
            "member_names": [fm.get("failure_mode") for fm in cluster],
            "equipment_labels": labels,
            "suggested_primary_id": str(best["id"]),
            "suggested_canonical_name": best.get("failure_mode"),
            "avg_similarity_score": avg_score,
            "reason": reason,
            "detection_method": detection_method,
            "ai_confidence": confidence,
        }

    @classmethod
    def _similar_fm_members_coherent(
        cls,
        members: List[Dict[str, Any]],
        *,
        min_score: float = 0,
    ) -> bool:
        """Every pair in a proposed group must look like a plausible duplicate."""
        if len(members) < 2:
            return False
        min_score = min_score or cls.SIMILAR_FM_MIN_SCORE
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                sim = cls.score_similarity(members[i], members[j])
                if sim["score"] < min_score:
                    return False
        return True

    @classmethod
    def _cluster_has_similar_pair(
        cls,
        cluster: List[Dict[str, Any]],
        jaccard_threshold: float,
        ratio_threshold: float,
        *,
        strict_pairing: bool = True,
    ) -> bool:
        for i in range(len(cluster)):
            for j in range(i + 1, len(cluster)):
                if cls._fm_names_similar_pair(
                    cluster[i],
                    cluster[j],
                    jaccard_threshold,
                    ratio_threshold,
                    strict_pairing=strict_pairing,
                ):
                    return True
        return False

    async def _ai_confirm_similar_failure_mode_cluster(
        self,
        cluster: List[Dict[str, Any]],
        *,
        user_id: str = "system",
        company_id: str = "default",
    ) -> List[Dict[str, Any]]:
        """GPT: which failure modes in this cluster are truly the same phenomenon."""
        import json

        if len(cluster) < 2:
            return []
        if len(cluster) > 35:
            cluster = cluster[:35]

        items = [
            {
                "id": str(fm["id"]),
                "failure_mode": (fm.get("failure_mode") or "")[:200],
                "equipment": (fm.get("equipment") or "")[:120],
                "mechanism": (fm.get("mechanism") or fm.get("iso14224_mechanism") or "")[:80],
            }
            for fm in cluster
        ]

        sys_prompt = (
            "You are a reliability engineer reviewing a failure-modes library. "
            "Only group failure modes that are CLEAR duplicates or trivial rewordings of "
            "the SAME failure (e.g. 'Bearing Failure' vs 'Drive Bearing Failure' when both "
            "mean generic bearing failure). Do NOT group related failures that share a "
            "word but differ in phenomenon (e.g. 'Bearing Failure' ≠ 'Bearing Wear', "
            "'Seal Leak' ≠ 'Bearing Failure'). Equipment type is irrelevant. Different "
            "ISO 14224 mechanisms must stay separate (Wear ≠ Seizure ≠ Fatigue). When "
            "unsure, return no group for those ids. Return strict JSON only."
        )
        user_msg = (
            "Candidate failure modes:\n"
            f"{json.dumps(items, indent=2)}\n\n"
            'Return JSON: {"groups": [{"member_ids": ["..."], "canonical_name": "...", '
            '"reason": "<= 20 words", "confidence": 0-100}]}. '
            "Only groups with 2+ ids you are confident are duplicates (confidence ≥ 75). "
            "Each id in at most one group. Omit borderline cases."
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
                endpoint="failure_modes.ai_confirm_similar_cluster",
                model="gpt-4o-mini",
                temperature=0,
                max_tokens=1400,
                response_format={"type": "json_object"},
            )
            data = json.loads(content.strip())
        except json.JSONDecodeError:
            logger.warning("AI similar-FM cluster JSON parse failed")
        if not data:
            return []

        by_id = {str(fm["id"]): fm for fm in cluster}
        groups_out: List[Dict[str, Any]] = []
        used: Set[str] = set()
        for g in data.get("groups") or []:
            if not isinstance(g, dict):
                continue
            member_ids = []
            for raw in g.get("member_ids") or []:
                mid = str(raw).strip()
                if mid in by_id and mid not in used:
                    member_ids.append(mid)
            if len(member_ids) < 2:
                continue
            members = [by_id[mid] for mid in member_ids]
            if not self._similar_fm_members_coherent(members):
                continue
            conf = g.get("confidence")
            try:
                confidence = float(conf) if conf is not None else None
            except (TypeError, ValueError):
                confidence = None
            if confidence is not None and confidence < self.SIMILAR_FM_AI_MIN_CONFIDENCE:
                continue
            used.update(member_ids)
            reason = (g.get("reason") or "AI: same failure phenomenon").strip()[:240]
            canonical = (g.get("canonical_name") or "").strip()
            payload = self._format_similar_fm_group(
                members, reason=reason, detection_method="ai", confidence=confidence
            )
            if canonical:
                payload["suggested_canonical_name"] = canonical[:200]
            groups_out.append(payload)
        return groups_out

    def _library_wide_similar_groups(
        self,
        all_fms: List[Dict[str, Any]],
        min_score: float,
        jaccard_threshold: float,
        ratio_threshold: float,
        seen_keys: Set[frozenset],
        groups_out: List[Dict[str, Any]],
        limit_groups: int,
        run_fuzzy_cluster: bool = True,
    ) -> None:
        """Find near-duplicate failure modes across the full library (equipment type ignored)."""
        by_norm: Dict[str, List[Dict[str, Any]]] = {}
        for fm in all_fms:
            norm = self.normalize_fm_text(fm.get("failure_mode"))
            if not norm:
                continue
            by_norm.setdefault(norm, []).append(fm)

        for norm, members in by_norm.items():
            if len(groups_out) >= limit_groups:
                return
            unique: List[Dict[str, Any]] = []
            seen_ids: Set[str] = set()
            for fm in members:
                fid = str(fm.get("id") or "")
                if not fid or fid in seen_ids:
                    continue
                seen_ids.add(fid)
                unique.append(fm)
            if len(unique) < 2:
                continue
            pair_scores = []
            for i in range(len(unique)):
                for j in range(i + 1, len(unique)):
                    pair_scores.append(self.score_similarity(unique[i], unique[j])["score"])
            avg_score = sum(pair_scores) / len(pair_scores) if pair_scores else 100.0
            if avg_score < min_score:
                continue
            self._append_group_if_new(
                groups_out,
                seen_keys,
                self._format_similar_fm_group(
                    unique,
                    reason=f"Identical name ({len(unique)} records, any equipment)",
                    detection_method="lexical",
                ),
                limit_groups,
            )

        if not run_fuzzy_cluster:
            return

        # Similar names (e.g. Bearing Failure + Drive Bearing Failure)
        deduped: List[Dict[str, Any]] = []
        seen_ids: Set[str] = set()
        for fm in all_fms:
            fid = str(fm.get("id") or "")
            if not fid or fid in seen_ids:
                continue
            seen_ids.add(fid)
            deduped.append(fm)

        for cluster in self._cluster_by_name_similarity(
            deduped,
            jaccard_threshold=jaccard_threshold,
            ratio_threshold=ratio_threshold,
            strict_pairing=True,
        ):
            if len(groups_out) >= limit_groups:
                return
            if len(cluster) < 2:
                continue
            norms = {self.normalize_fm_text(fm.get("failure_mode")) for fm in cluster}
            if len(norms) == 1:
                continue  # already covered by exact-name pass
            pair_scores = []
            for i in range(len(cluster)):
                for j in range(i + 1, len(cluster)):
                    pair_scores.append(self.score_similarity(cluster[i], cluster[j])["score"])
            avg_score = sum(pair_scores) / len(pair_scores) if pair_scores else 0.0
            if avg_score < min_score:
                continue
            self._append_group_if_new(
                groups_out,
                seen_keys,
                self._format_similar_fm_group(
                    cluster,
                    reason="Similar name in library (equipment type not considered)",
                    detection_method="lexical",
                ),
                limit_groups,
            )

    async def scan_similar_groups(
        self,
        equipment_type_id: Optional[str] = None,
        jaccard_threshold: float = SIMILAR_FM_JACCARD,
        ratio_threshold: float = SIMILAR_FM_RATIO,
        min_score: float = SIMILAR_FM_MIN_SCORE,
        limit_groups: int = 200,
        include_cross_equipment: bool = True,
        only_cross_equipment: bool = False,
        cross_equipment_ratio_threshold: float = 0.88,
        use_ai: bool = True,
        ai_max_clusters: int = 30,
        ai_time_budget_seconds: float = 55.0,
        user_id: str = "system",
        company_id: str = "default",
    ) -> Dict[str, Any]:
        """Batch scan: cluster near-duplicate failure modes across the full library.

        Equipment type is not used. With ``use_ai`` (default), GPT confirms clusters
        using maintenance/failure context (e.g. Bearing Failure = Drive Bearing Failure).
        """
        query: Dict[str, Any] = {}

        cursor = self.collection.find(
            query,
            {
                "_id": 1,
                "failure_mode": 1,
                "category": 1,
                "equipment": 1,
                "mechanism": 1,
                "iso14224_mechanism": 1,
                "rpn": 1,
                "equipment_type_ids": 1,
                "recommended_actions": 1,
                "keywords": 1,
                "potential_effects": 1,
                "potential_causes": 1,
                "is_validated": 1,
            },
        ).sort("rpn", -1)

        all_fms: List[Dict[str, Any]] = []
        async for doc in cursor:
            all_fms.append(self._serialize_similarity_candidate(doc))

        groups_out: List[Dict[str, Any]] = []
        seen_group_keys: Set[frozenset] = set()
        fuzzy_ratio = (
            cross_equipment_ratio_threshold
            if only_cross_equipment and cross_equipment_ratio_threshold
            else ratio_threshold
        )
        max_fuzzy_cluster = 1200
        run_fuzzy = len(all_fms) <= max_fuzzy_cluster

        deduped: List[Dict[str, Any]] = []
        seen_ids: Set[str] = set()
        for fm in all_fms:
            fid = str(fm.get("id") or "")
            if not fid or fid in seen_ids:
                continue
            seen_ids.add(fid)
            deduped.append(fm)

        loose_clusters: List[List[Dict[str, Any]]] = []
        by_norm: Dict[str, List[Dict[str, Any]]] = {}
        for fm in deduped:
            norm = self.normalize_fm_text(fm.get("failure_mode"))
            if norm:
                by_norm.setdefault(norm, []).append(fm)

        if run_fuzzy:
            loose_clusters = self._cluster_by_name_similarity(
                deduped,
                jaccard_threshold=jaccard_threshold,
                ratio_threshold=fuzzy_ratio,
                strict_pairing=True,
            )

        seen_cluster_keys: Set[frozenset] = set()
        deduped_clusters: List[List[Dict[str, Any]]] = []

        def _add_cluster(cluster: List[Dict[str, Any]]) -> None:
            unique_fms: List[Dict[str, Any]] = []
            s: Set[str] = set()
            for fm in cluster:
                fid = str(fm.get("id") or "")
                if fid and fid not in s:
                    s.add(fid)
                    unique_fms.append(fm)
            if len(unique_fms) < 2:
                return
            key = frozenset(s)
            if key in seen_cluster_keys:
                return
            seen_cluster_keys.add(key)
            deduped_clusters.append(unique_fms)

        for members in by_norm.values():
            _add_cluster(members)
        for cluster in loose_clusters:
            _add_cluster(cluster)

        ai_clusters_processed = 0
        ai_calls = 0
        ai_errors = 0
        scan_truncated = False
        ai_started = time.monotonic()

        if use_ai and deduped_clusters:
            ai_subtasks: List[List[Dict[str, Any]]] = []
            for unique in deduped_clusters:
                if len(groups_out) >= limit_groups:
                    break
                norms = {
                    self.normalize_fm_text(fm.get("failure_mode")) for fm in unique
                }
                if len(norms) == 1:
                    pair_scores = []
                    for i in range(len(unique)):
                        for j in range(i + 1, len(unique)):
                            pair_scores.append(
                                self.score_similarity(unique[i], unique[j])["score"]
                            )
                    avg_score = (
                        sum(pair_scores) / len(pair_scores) if pair_scores else 100.0
                    )
                    if avg_score >= min_score:
                        self._append_group_if_new(
                            groups_out,
                            seen_group_keys,
                            self._format_similar_fm_group(
                                unique,
                                reason=f"Identical name ({len(unique)} records, any equipment)",
                                detection_method="lexical",
                            ),
                            limit_groups,
                        )
                    continue
                if not self._cluster_has_similar_pair(
                    unique,
                    jaccard_threshold,
                    fuzzy_ratio,
                    strict_pairing=True,
                ):
                    continue
                subs = [unique]
                if len(unique) > 12:
                    subs = self._cluster_by_name_similarity(
                        unique,
                        jaccard_threshold=jaccard_threshold,
                        ratio_threshold=fuzzy_ratio,
                        strict_pairing=True,
                    )
                for sub in subs:
                    if len(sub) >= 2:
                        ai_subtasks.append(sub)

            sem = asyncio.Semaphore(5)

            async def _confirm_sub(sub: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
                async with sem:
                    return await self._ai_confirm_similar_failure_mode_cluster(
                        sub, user_id=user_id, company_id=company_id
                    )

            idx = 0
            while idx < len(ai_subtasks):
                if len(groups_out) >= limit_groups:
                    scan_truncated = True
                    break
                if ai_clusters_processed >= ai_max_clusters:
                    scan_truncated = True
                    break
                if time.monotonic() - ai_started > ai_time_budget_seconds:
                    scan_truncated = True
                    break
                batch = ai_subtasks[idx : idx + 5]
                idx += len(batch)
                results = await asyncio.gather(
                    *[_confirm_sub(sub) for sub in batch],
                    return_exceptions=True,
                )
                for sub, result in zip(batch, results):
                    ai_calls += 1
                    if isinstance(result, Exception):
                        logger.warning("AI similar-FM cluster failed: %s", result)
                        ai_errors += 1
                        continue
                    for g in result:
                        self._append_group_if_new(
                            groups_out, seen_group_keys, g, limit_groups
                        )
                ai_clusters_processed += len(batch)

        if not use_ai or not groups_out:
            self._library_wide_similar_groups(
                all_fms,
                min_score=min_score,
                jaccard_threshold=jaccard_threshold,
                ratio_threshold=fuzzy_ratio,
                seen_keys=seen_group_keys,
                groups_out=groups_out,
                limit_groups=limit_groups,
                run_fuzzy_cluster=run_fuzzy,
            )

        return {
            "scope": "library",
            "scan_method": "ai" if use_ai else "lexical",
            "equipment_type_id": None,
            "groups": groups_out,
            "total_groups": len(groups_out),
            "failure_modes_scanned": len(all_fms),
            "fuzzy_clustering_skipped": not run_fuzzy,
            "ai_clusters_processed": ai_clusters_processed,
            "ai_calls": ai_calls,
            "ai_errors": ai_errors,
            "scan_truncated": scan_truncated,
        }
