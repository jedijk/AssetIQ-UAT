"""
Web Push subscription management and test delivery.
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from services.push_notification_service import (
    get_vapid_public_key,
    is_push_configured,
    remove_all_subscriptions,
    remove_subscription,
    save_subscription,
    send_test_push,
)

router = APIRouter(prefix="/push", tags=["Push Notifications"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionBody(BaseModel):
    endpoint: str
    keys: PushKeys
    expirationTime: Optional[int] = None


class PushUnsubscribeBody(BaseModel):
    endpoint: Optional[str] = None


@router.get("/vapid-public-key")
async def vapid_public_key(current_user: dict = Depends(get_current_user)):
    """Return the VAPID public key for browser PushManager.subscribe()."""
    del current_user  # auth gate only
    public_key = get_vapid_public_key()
    if not public_key:
        raise HTTPException(
            status_code=503,
            detail="Web Push is not configured on this server (missing VAPID keys)",
        )
    return {"publicKey": public_key, "configured": True}


@router.get("/status")
async def push_status(current_user: dict = Depends(get_current_user)):
    del current_user
    return {"configured": is_push_configured(), "publicKey": get_vapid_public_key()}


@router.post("/subscribe")
async def subscribe_push(
    body: PushSubscriptionBody,
    current_user: dict = Depends(get_current_user),
):
    if not is_push_configured():
        raise HTTPException(status_code=503, detail="Web Push is not configured on this server")

    subscription = body.model_dump()
    doc = await save_subscription(
        current_user["id"],
        subscription,
    )
    return {"success": True, "id": doc["id"]}


@router.delete("/subscribe")
async def unsubscribe_push(
    body: PushUnsubscribeBody = PushUnsubscribeBody(),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    if body.endpoint:
        deleted = await remove_subscription(user_id, body.endpoint)
    else:
        deleted = await remove_all_subscriptions(user_id)
    return {"success": True, "deleted": deleted}


@router.post("/test")
async def test_push(current_user: dict = Depends(get_current_user)):
    if not is_push_configured():
        raise HTTPException(status_code=503, detail="Web Push is not configured on this server")

    result = await send_test_push(current_user["id"])
    if result["sent"] == 0:
        raise HTTPException(
            status_code=400,
            detail="No active push subscription found. Re-enable notifications in settings.",
        )
    return {"success": True, **result}
