"""External Observation API v1 — machine-to-machine ingestion."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request, Response

from models.external_api import (
    ExternalApiOpenApiInfo,
    ExternalObservationCreate,
    ExternalObservationResponse,
)
from services.external_api_audit_service import log_request
from services.external_api_auth import external_observations_auth
from services.external_api_key_service import record_key_usage
from services.external_observation_service import create_external_observation

router = APIRouter(prefix="/v1/external", tags=["external-api"])


@router.get("/openapi-info", response_model=ExternalApiOpenApiInfo)
async def external_openapi_info() -> ExternalApiOpenApiInfo:
    return ExternalApiOpenApiInfo()


async def _finalize_request(
    request: Request,
    *,
    status_code: int,
    key_doc: dict,
    data: ExternalObservationCreate,
    observation_id: str | None,
    error_detail: str | None,
) -> None:
    start = getattr(request.state, "external_api_start", time.perf_counter())
    elapsed_ms = (time.perf_counter() - start) * 1000
    success = status_code < 400
    await record_key_usage(
        key_doc,
        success=success,
        response_ms=elapsed_ms,
        observation_created=success and status_code == 201,
    )
    await log_request(
        tenant_id=key_doc.get("tenant_id"),
        key_id=key_doc["id"],
        method=request.method,
        path=request.url.path,
        status_code=status_code,
        response_ms=elapsed_ms,
        client_ip=(request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or None,
        user_agent=request.headers.get("user-agent"),
        observation_id=observation_id,
        external_reference=data.external_reference,
        source_system=data.source_system,
        error_detail=error_detail,
    )


@router.post(
    "/observations",
    response_model=ExternalObservationResponse,
    responses={
        200: {"description": "Existing observation returned (idempotent duplicate)"},
        201: {"description": "Observation created"},
        401: {"description": "Invalid or missing API key"},
        403: {"description": "Scope or IP not allowed"},
        409: {"description": "Duplicate external_reference with conflicting payload"},
        422: {"description": "Validation error"},
        429: {"description": "Rate limit exceeded"},
    },
    summary="Create observation from external system",
    description=(
        "Ingest an observation from a third-party system. Authenticate with "
        "`Authorization: Bearer aiq_live_...` or `X-API-Key: aiq_live_...`. "
        "Requires scope `observations:create`. Duplicate detection uses "
        "tenant + source_system + external_reference."
    ),
)
async def create_external_observation_endpoint(
    data: ExternalObservationCreate,
    request: Request,
    response: Response,
    user: dict = Depends(external_observations_auth),
) -> ExternalObservationResponse:
    key_doc = request.state.external_api_key
    observation_id = None
    try:
        result = await create_external_observation(
            data.model_dump(),
            user=user,
            key_id=key_doc["id"],
        )
        observation_id = result["observation_id"]
        status_code = 200 if result.get("duplicate") else 201
        response.status_code = status_code
        await _finalize_request(
            request,
            status_code=status_code,
            key_doc=key_doc,
            data=data,
            observation_id=observation_id,
            error_detail=None,
        )
        return ExternalObservationResponse(**result)
    except Exception as exc:
        status_code = int(getattr(exc, "status_code", 500))
        detail = getattr(exc, "detail", str(exc))
        if isinstance(detail, list):
            detail = str(detail)
        await _finalize_request(
            request,
            status_code=status_code,
            key_doc=key_doc,
            data=data,
            observation_id=observation_id,
            error_detail=str(detail) if detail else None,
        )
        raise
