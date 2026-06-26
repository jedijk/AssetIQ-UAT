"""Failure modes library routes — merge service module."""
from fastapi import HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import logging
from database import failure_modes_service
from services.ai_gateway import user_context
from services.failure_modes_write import _require_owner

logger = logging.getLogger(__name__)


class FindDuplicateActionsScanRequest(BaseModel):
    failure_mode_id: Optional[str] = None
    ratio_threshold: float = 0.75
    jaccard_threshold: float = 0.48
    use_ai: bool = True
    ai_max_failure_modes: int = 50
    ai_max_clusters_per_fm: int = 3
    limit_results: int = 500


class MergeDuplicateActionGroupItem(BaseModel):
    keep_index: int
    remove_indices: List[int] = Field(default_factory=list)


class MergeDuplicateActionsRequest(BaseModel):
    failure_mode_id: str
    keep_index: Optional[int] = None
    remove_indices: List[int] = Field(default_factory=list)
    groups: Optional[List[MergeDuplicateActionGroupItem]] = None


class MergeFailureModesRequest(BaseModel):
    winner_id: Optional[str] = None
    loser_ids: List[str] = []
    primary_id: Optional[str] = None
    merge_id: Optional[str] = None
    canonical_name: Optional[str] = None
    dry_run: bool = False
    auto_pick_primary: bool = False


async def scan_duplicate_actions_in_failure_modes(
    request: FindDuplicateActionsScanRequest, *, current_user: dict
):
    """Scan recommended_actions for duplicates within each failure mode (owner only)."""
    _require_owner(current_user)
    uid, cid = user_context(current_user)
    try:
        return await failure_modes_service.scan_duplicate_actions(
            failure_mode_id=request.failure_mode_id,
            ratio_threshold=request.ratio_threshold,
            jaccard_threshold=request.jaccard_threshold,
            use_ai=request.use_ai,
            ai_max_failure_modes=request.ai_max_failure_modes,
            ai_max_clusters_per_fm=request.ai_max_clusters_per_fm,
            limit_results=request.limit_results,
            user_id=uid,
            company_id=cid,
        )
    except Exception as e:
        logger.error(f"Error scanning duplicate actions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def merge_duplicate_actions(request: MergeDuplicateActionsRequest, *, current_user: dict):
    """Merge duplicate recommended actions within one failure mode into a single action (owner only)."""
    _require_owner(current_user)
    updated_by = current_user.get("id") or current_user.get("user_id") or current_user.get("email") or "user"
    try:
        if request.groups:
            return await failure_modes_service.merge_duplicate_action_groups(
                failure_mode_id=request.failure_mode_id,
                groups=[g.model_dump() for g in request.groups],
                updated_by=str(updated_by),
            )
        if request.keep_index is None:
            raise HTTPException(status_code=400, detail="keep_index or groups is required")
        return await failure_modes_service.merge_duplicate_action_group(
            failure_mode_id=request.failure_mode_id,
            keep_index=request.keep_index,
            remove_indices=request.remove_indices,
            updated_by=str(updated_by),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error merging duplicate actions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def merge_failure_modes(request: MergeFailureModesRequest, *, current_user: dict):
    """Merge loser failure modes into a winner. Use dry_run=true to preview only.

    Accepts winner_id + loser_ids (existing AI UI) or primary_id + merge_id for a pair.
    Set auto_pick_primary=true to choose the most complete record as winner.
    """
    winner_id = (request.winner_id or request.primary_id or "").strip()
    loser_ids = list(request.loser_ids or [])
    if request.merge_id:
        loser_ids.append(request.merge_id.strip())
    loser_ids = [str(x).strip() for x in loser_ids if str(x).strip()]

    if not winner_id and request.auto_pick_primary and loser_ids:
        winner_id = loser_ids[0]
    if not winner_id or not loser_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide winner_id (or primary_id) and loser_ids (or merge_id)",
        )

    merged_by = current_user.get("id") or current_user.get("user_id") or current_user.get("email")
    try:
        result = await failure_modes_service.merge_failure_modes(
            winner_id=winner_id,
            loser_ids=loser_ids,
            canonical_name=request.canonical_name,
            dry_run=request.dry_run,
            merged_by=merged_by,
            auto_pick_primary=request.auto_pick_primary,
        )
        if request.dry_run:
            return result
        return {
            "winner_id": result["winner_id"],
            "deleted_count": result.get("deleted_count", 0),
            "canonical_name": result.get("canonical_name"),
            "repoint_counts": result.get("repoint_counts", {}),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error merging failure modes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
