"""Failure mode recommended actions sync and merge."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Set
from bson import ObjectId
import logging

from services.failure_modes.actions_consolidate import ActionsConsolidateMixin
from services.failure_modes.actions_duplicate_scan import ActionsDuplicateScanMixin
from services.failure_modes.cache import _invalidate_cache

logger = logging.getLogger(__name__)


class FailureModesMixin(ActionsConsolidateMixin, ActionsDuplicateScanMixin):
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

