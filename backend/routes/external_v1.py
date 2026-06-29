"""External API v1 — observations ingestion and equipment read APIs."""
from __future__ import annotations

import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from models.external_api import (
    ExternalApiOpenApiInfo,
    ExternalEquipmentDetailResponse,
    ExternalEquipmentHierarchyResponse,
    ExternalObservationCreate,
    ExternalObservationResponse,
)
from services.external_api_audit_service import log_request
from services.external_api_auth import external_equipment_auth, external_observations_auth
from services.external_api_key_service import record_key_usage
from services.external_equipment_service import get_equipment_detail, get_installation_hierarchy
from services.external_observation_service import create_external_observation

router = APIRouter(prefix="/v1/external", tags=["external-api"])


def _client_ip(request: Request) -> Optional[str]:
    return (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or None


def _elapsed_ms(request: Request) -> float:
    start = getattr(request.state, "external_api_start", time.perf_counter())
    return (time.perf_counter() - start) * 1000


async def _finalize_observation_request(
    request: Request,
    *,
    status_code: int,
    key_doc: dict,
    data: ExternalObservationCreate,
    observation_id: str | None,
    error_detail: str | None,
) -> None:
    elapsed_ms = _elapsed_ms(request)
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
        client_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        observation_id=observation_id,
        external_reference=data.external_reference,
        source_system=data.source_system,
        error_detail=error_detail,
    )


async def _finalize_equipment_request(
    request: Request,
    *,
    status_code: int,
    key_doc: dict,
    equipment_id: str | None,
    rows_returned: int,
    error_detail: str | None,
) -> None:
    elapsed_ms = _elapsed_ms(request)
    success = status_code < 400
    await record_key_usage(
        key_doc,
        success=success,
        response_ms=elapsed_ms,
        equipment_request=success and rows_returned > 0,
    )
    await log_request(
        tenant_id=key_doc.get("tenant_id"),
        key_id=key_doc["id"],
        method=request.method,
        path=request.url.path,
        status_code=status_code,
        response_ms=elapsed_ms,
        client_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        equipment_id=equipment_id,
        rows_returned=rows_returned,
        error_detail=error_detail,
    )


def build_external_openapi_document() -> dict[str, Any]:
    info = ExternalApiOpenApiInfo()
    return {
        "openapi": "3.0.3",
        "info": {
            "title": info.title,
            "version": info.version,
            "description": "AssetIQ External API — observations write and equipment read.",
        },
        "servers": [{"url": "/api"}],
        "security": [{"bearerAuth": []}, {"apiKeyAuth": []}],
        "paths": {
            "/v1/external/observations": {
                "post": {
                    "summary": "Create observation from external system",
                    "operationId": "createExternalObservation",
                    "tags": ["external-api"],
                    "security": [{"bearerAuth": []}, {"apiKeyAuth": []}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ExternalObservationCreate"}
                            }
                        },
                    },
                    "responses": {
                        "201": {"description": "Observation created"},
                        "200": {"description": "Duplicate returned"},
                        "401": {"description": "Unauthorized"},
                        "403": {"description": "Forbidden"},
                        "409": {"description": "Conflict"},
                        "422": {"description": "Validation error"},
                        "429": {"description": "Rate limit exceeded"},
                    },
                }
            },
            "/v1/external/installations/{installation_id}/hierarchy": {
                "get": {
                    "summary": "Read installation equipment hierarchy",
                    "operationId": "getInstallationHierarchy",
                    "tags": ["external-api"],
                    "security": [{"bearerAuth": []}, {"apiKeyAuth": []}],
                    "parameters": [
                        {"name": "installation_id", "in": "path", "required": True, "schema": {"type": "string"}},
                        {"name": "include_inactive", "in": "query", "schema": {"type": "boolean", "default": True}},
                        {"name": "include_metadata", "in": "query", "schema": {"type": "boolean", "default": True}},
                        {"name": "max_depth", "in": "query", "schema": {"type": "integer"}},
                        {"name": "flat", "in": "query", "schema": {"type": "boolean", "default": False}},
                        {"name": "last_modified_after", "in": "query", "schema": {"type": "string", "format": "date-time"}},
                    ],
                    "responses": {
                        "200": {"description": "Hierarchy returned"},
                        "401": {"description": "Unauthorized"},
                        "403": {"description": "Forbidden"},
                        "404": {"description": "Installation not found"},
                        "429": {"description": "Rate limit exceeded"},
                    },
                }
            },
            "/v1/external/equipment/{equipment_id}": {
                "get": {
                    "summary": "Read equipment detail",
                    "operationId": "getEquipmentDetail",
                    "tags": ["external-api"],
                    "security": [{"bearerAuth": []}, {"apiKeyAuth": []}],
                    "parameters": [
                        {"name": "equipment_id", "in": "path", "required": True, "schema": {"type": "string"}},
                        {"name": "include_metadata", "in": "query", "schema": {"type": "boolean", "default": True}},
                    ],
                    "responses": {
                        "200": {"description": "Equipment detail returned"},
                        "401": {"description": "Unauthorized"},
                        "403": {"description": "Forbidden"},
                        "404": {"description": "Equipment not found"},
                        "429": {"description": "Rate limit exceeded"},
                    },
                }
            },
        },
        "components": {
            "securitySchemes": {
                "bearerAuth": {"type": "http", "scheme": "bearer"},
                "apiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"},
            },
            "schemas": {
                "ExternalObservationCreate": {
                    "type": "object",
                    "required": ["source_system", "external_reference", "description"],
                    "properties": {
                        "source_system": {"type": "string"},
                        "external_reference": {"type": "string"},
                        "description": {"type": "string"},
                        "equipment_id": {"type": "string"},
                        "equipment_tag": {"type": "string"},
                        "severity": {"type": "string"},
                    },
                }
            },
        },
    }


@router.get("/openapi-info", response_model=ExternalApiOpenApiInfo)
async def external_openapi_info() -> ExternalApiOpenApiInfo:
    return ExternalApiOpenApiInfo()


@router.get("/openapi.json")
async def external_openapi_json() -> JSONResponse:
    return JSONResponse(build_external_openapi_document())


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
        await _finalize_observation_request(
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
        await _finalize_observation_request(
            request,
            status_code=status_code,
            key_doc=key_doc,
            data=data,
            observation_id=observation_id,
            error_detail=str(detail) if detail else None,
        )
        raise


@router.get(
    "/installations/{installation_id}/hierarchy",
    response_model=ExternalEquipmentHierarchyResponse,
    responses={
        401: {"description": "Invalid or missing API key"},
        403: {"description": "Scope or IP not allowed"},
        404: {"description": "Installation not found"},
        429: {"description": "Rate limit exceeded"},
    },
    summary="Read installation equipment hierarchy",
    description=(
        "Return the equipment hierarchy for an installation. Requires scope `equipment:read`. "
        "Use `flat=true` for a list without nested `children`."
    ),
)
async def get_installation_hierarchy_endpoint(
    installation_id: str,
    request: Request,
    user: dict = Depends(external_equipment_auth),
    include_inactive: bool = Query(True),
    include_metadata: bool = Query(True),
    max_depth: Optional[int] = Query(None, ge=0),
    flat: bool = Query(False),
    last_modified_after: Optional[str] = Query(None),
) -> ExternalEquipmentHierarchyResponse:
    key_doc = request.state.external_api_key
    try:
        result = await get_installation_hierarchy(
            user,
            installation_id,
            include_inactive=include_inactive,
            include_metadata=include_metadata,
            max_depth=max_depth,
            flat=flat,
            last_modified_after=last_modified_after,
        )
        rows = result.get("count") or 0
        await _finalize_equipment_request(
            request,
            status_code=200,
            key_doc=key_doc,
            equipment_id=installation_id,
            rows_returned=rows,
            error_detail=None,
        )
        return ExternalEquipmentHierarchyResponse(**result)
    except Exception as exc:
        status_code = int(getattr(exc, "status_code", 500))
        detail = getattr(exc, "detail", str(exc))
        if isinstance(detail, list):
            detail = str(detail)
        await _finalize_equipment_request(
            request,
            status_code=status_code,
            key_doc=key_doc,
            equipment_id=installation_id,
            rows_returned=0,
            error_detail=str(detail) if detail else None,
        )
        raise


@router.get(
    "/equipment/{equipment_id}",
    response_model=ExternalEquipmentDetailResponse,
    responses={
        401: {"description": "Invalid or missing API key"},
        403: {"description": "Scope or IP not allowed"},
        404: {"description": "Equipment not found"},
        429: {"description": "Rate limit exceeded"},
    },
    summary="Read equipment detail",
    description="Return detailed equipment information. Requires scope `equipment:read`.",
)
async def get_equipment_detail_endpoint(
    equipment_id: str,
    request: Request,
    user: dict = Depends(external_equipment_auth),
    include_metadata: bool = Query(True),
) -> ExternalEquipmentDetailResponse:
    key_doc = request.state.external_api_key
    try:
        result = await get_equipment_detail(
            user,
            equipment_id,
            include_metadata=include_metadata,
        )
        await _finalize_equipment_request(
            request,
            status_code=200,
            key_doc=key_doc,
            equipment_id=equipment_id,
            rows_returned=1,
            error_detail=None,
        )
        return ExternalEquipmentDetailResponse(**result)
    except Exception as exc:
        status_code = int(getattr(exc, "status_code", 500))
        detail = getattr(exc, "detail", str(exc))
        if isinstance(detail, list):
            detail = str(detail)
        await _finalize_equipment_request(
            request,
            status_code=status_code,
            key_doc=key_doc,
            equipment_id=equipment_id,
            rows_returned=0,
            error_detail=str(detail) if detail else None,
        )
        raise
