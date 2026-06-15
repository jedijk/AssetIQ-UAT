"""Disciplines configurator routes."""
from typing import List

from fastapi import APIRouter, Depends

from auth import get_current_user
from services import disciplines_service as svc
from services.disciplines_service import (
    DisciplineCreate,
    DisciplineUpdate,
    MergePayload,
    ReorderItem,
)

router = APIRouter(prefix="/disciplines", tags=["disciplines"])


@router.get("")
async def list_disciplines(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user),
):
    return await svc.list_disciplines(include_inactive=include_inactive)


@router.get("/normalize")
async def normalize_discipline(
    value: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.normalize_discipline(value)


@router.post("")
async def create_discipline(
    payload: DisciplineCreate,
    current_user: dict = Depends(get_current_user),
):
    return await svc.create_discipline(current_user, payload)


@router.put("/{discipline_id}")
async def update_discipline(
    discipline_id: str,
    payload: DisciplineUpdate,
    current_user: dict = Depends(get_current_user),
):
    return await svc.update_discipline(current_user, discipline_id, payload)


@router.patch("/reorder")
async def reorder_disciplines(
    items: List[ReorderItem],
    current_user: dict = Depends(get_current_user),
):
    return await svc.reorder_disciplines(current_user, items)


@router.delete("/{discipline_id}")
async def delete_discipline(
    discipline_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await svc.delete_discipline(current_user, discipline_id)


@router.get("/cleanup-suggestions")
async def cleanup_suggestions(current_user: dict = Depends(get_current_user)):
    return await svc.cleanup_suggestions(current_user)


@router.post("/merge")
async def merge_discipline_variants(
    payload: MergePayload,
    current_user: dict = Depends(get_current_user),
):
    return await svc.merge_discipline_variants(current_user, payload)
