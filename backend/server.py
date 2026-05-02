"""
AssetIQ / ThreatBase API - Main application entry point.
All route handlers are in /routes/, services in /services/, models in /models/.

IMPORTANT: This file is structured to ensure the app ALWAYS starts,
even if database or other dependencies fail. Health endpoints are
defined first to guarantee Railway healthchecks pass.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
import os
import logging
import asyncio
import time
import json
from datetime import datetime, timezone

# Configure logging FIRST
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Single source of truth for the application version.
# Bump this with each release; the frontend polls /api/health and will force a
# hard refresh whenever it sees a newer version than the one baked into its bundle.
APP_VERSION = "3.6.6"

# Create FastAPI app IMMEDIATELY - before any potentially failing imports
app = FastAPI(
    title="AssetIQ API",
    version=APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Store startup time
app.state.start_time = time.time()
app.state.ready = False  # Will be set to True after background init

# =============================================================================
# CRITICAL: Define health endpoints FIRST - these must ALWAYS work
# =============================================================================

@app.get("/")
async def root():
    """Root endpoint for basic verification."""
    return {"message": "AssetIQ API", "status": "running", "version": APP_VERSION}


@app.get("/health")
async def health_check():
    """Health check endpoint for Railway/Emergent deployment - must return instantly."""
    return {"status": "ok"}


@app.get("/api/health")
async def api_health_check():
    """Comprehensive health check with database status."""
    start_time = time.time()
    db_status = "unknown"
    db_latency = None
    
    try:
        from database import db
        await db.command('ping')
        db_status = "connected"
        db_latency = round((time.time() - start_time) * 1000, 2)
    except Exception as e:
        db_status = f"error: {str(e)[:100]}"
    
    uptime = round(time.time() - app.state.start_time, 2)
    
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "database": db_status,
        "database_latency_ms": db_latency,
        "uptime_seconds": uptime,
        "ready": app.state.ready,
        "version": APP_VERSION
    }


# =============================================================================
# Now load the rest of the application (wrapped in try/except for safety)
# =============================================================================

# Rate limiter (optional - won't crash if missing)
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    logger.info("Rate limiter initialized")
except Exception as e:
    logger.warning(f"Rate limiter not available: {e}")


# Error logging function (with fallback)
def log_error(error_type, message, details=None, source="backend"):
    """Log error - with fallback if routes.system not available."""
    try:
        from routes.system import log_error as system_log_error
        system_log_error(error_type=error_type, message=message, details=details, source=source)
    except Exception:
        logger.error(f"[{error_type}] {message} - {details}")


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log all unhandled exceptions."""
    error_details = {
        "path": str(request.url.path),
        "method": request.method,
        "client": request.client.host if request.client else "unknown",
        "exception_type": type(exc).__name__,
    }
    
    if "database" in str(exc).lower() or "mongo" in str(exc).lower():
        error_type = "database"
    elif "timeout" in str(exc).lower():
        error_type = "timeout"
    elif "auth" in str(exc).lower() or "token" in str(exc).lower():
        error_type = "auth"
    elif "openai" in str(exc).lower() or "ai" in str(exc).lower():
        error_type = "ai"
    else:
        error_type = "server"
    
    log_error(error_type=error_type, message=str(exc)[:500], details=error_details, source="backend")
    logger.error(f"Unhandled exception on {request.url.path}: {exc}")
    
    if isinstance(exc, HTTPException):
        resp = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        try:
            origin = request.headers.get("origin")
            if origin and origin in ALLOWED_ORIGINS:
                resp.headers["Access-Control-Allow-Origin"] = origin
                resp.headers["Vary"] = "Origin"
                resp.headers["Access-Control-Allow-Credentials"] = "true"
        except Exception:
            pass
        return resp
    
    resp = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    try:
        origin = request.headers.get("origin")
        if origin and origin in ALLOWED_ORIGINS:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Credentials"] = "true"
    except Exception:
        pass
    return resp


# Load all API routes (wrapped for safety)
route_load_error = None
try:
    from routes import all_routers
    
    api_router = APIRouter(prefix="/api")
    for router in all_routers:
        api_router.include_router(router)
    
    app.include_router(api_router)
    logger.info(f"Loaded {len(all_routers)} route modules")
except Exception as e:
    import traceback
    route_load_error = {
        "error": str(e),
        "type": type(e).__name__,
        "traceback": traceback.format_exc()
    }
    logger.error(f"Failed to load routes: {e}")
    logger.error(traceback.format_exc())
    # App will still run with health endpoints


# Debug endpoint to list routes
@app.get("/api/routes")
async def list_routes():
    """List all registered API routes."""
    routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            methods = list(route.methods - {'HEAD', 'OPTIONS'}) if route.methods else ['GET']
            if route.path.startswith('/api'):
                routes.append({"path": route.path, "methods": methods})
    return {"total": len(routes), "routes": sorted(routes, key=lambda x: x['path'])}


# Diagnostic endpoint to check route loading status
@app.get("/api/debug/routes-status")
async def routes_status():
    """Check if routes loaded correctly - for debugging deployment issues."""
    return {
        "routes_loaded": route_load_error is None,
        "error": route_load_error,
        "total_routes": len([r for r in app.routes if hasattr(r, 'path')]),
        "api_routes": len([r for r in app.routes if hasattr(r, 'path') and r.path.startswith('/api')])
    }


# =============================================================================
# CORS Configuration
# =============================================================================

# Base allowed origins (always included)
BASE_ORIGINS = [
    # Production
    "https://assetiq.tech",
    "https://www.assetiq.tech",
    "https://assetiq-rho.vercel.app",
    "https://asset-iq-rho.vercel.app",
    "https://assetiq-rmhd.vercel.app",
    "https://assetiq.vercel.app",
    # UAT environment
    "https://asset-iq-uat.vercel.app",
    "https://assetiq-uat.vercel.app",
    # Preview/Development
    "https://mobile-date-picker-2.preview.emergentagent.com",
    "http://localhost:3000",
    "http://localhost:5000",
]

# Merge with any additional origins from environment
ALLOWED_ORIGINS = BASE_ORIGINS.copy()
env_origins = os.environ.get('CORS_ORIGINS', '')
if env_origins and env_origins != '*':
    additional_origins = [origin.strip() for origin in env_origins.split(',') if origin.strip()]
    for origin in additional_origins:
        if origin not in ALLOWED_ORIGINS:
            ALLOWED_ORIGINS.append(origin)

logger.info(f"CORS configured for {len(ALLOWED_ORIGINS)} origins including: {', '.join(ALLOWED_ORIGINS[:5])}...")

# Build CORSMiddleware kwargs without passing allow_origin_regex=None.
cors_kwargs = {
    "allow_credentials": True,
    "allow_origins": ALLOWED_ORIGINS,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

# Broad wildcard preview origins are OFF by default for safety.
# If you need this for ephemeral preview deployments, enable explicitly via env.
if os.environ.get("ALLOW_WILDCARD_PREVIEW_ORIGINS", "false").lower() == "true":
    cors_kwargs["allow_origin_regex"] = r"https://.*\.(vercel\.app|emergentagent\.com|emergent\.host|railway\.app)"

app.add_middleware(CORSMiddleware, **cors_kwargs)


# =============================================================================
# Timeout Middleware
# =============================================================================

class TimeoutMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, timeout: float = 25.0, long_timeout: float = 120.0):
        super().__init__(app)
        self.timeout = timeout
        self.long_timeout = long_timeout  # For file downloads

    async def dispatch(self, request: Request, call_next):
        # Skip timeout for health endpoints
        if request.url.path in ["/health", "/", "/api/health"]:
            return await call_next(request)
        
        # Use longer timeout for file storage/download endpoints, AI analysis, imports, and auth.
        if (
            "/storage/" in request.url.path
            or "/avatar" in request.url.path
            or "/ai/" in request.url.path
            or "/import" in request.url.path
            or "/ai-insights" in request.url.path
            or "/auth/" in request.url.path
        ):
            request_timeout = self.long_timeout
        else:
            request_timeout = self.timeout
        
        start_time = time.time()
        try:
            response = await asyncio.wait_for(call_next(request), timeout=request_timeout)
            duration = time.time() - start_time
            if duration > 5.0:
                logger.warning(f"Slow request: {request.method} {request.url.path} took {duration:.2f}s")
            return response
        except asyncio.TimeoutError:
            logger.error(f"Request timeout: {request.method} {request.url.path} exceeded {request_timeout}s")
            resp = JSONResponse(status_code=504, content={"detail": "Request timeout - please try again"})
            try:
                origin = request.headers.get("origin")
                if origin and origin in ALLOWED_ORIGINS:
                    resp.headers["Access-Control-Allow-Origin"] = origin
                    resp.headers["Vary"] = "Origin"
                    resp.headers["Access-Control-Allow-Credentials"] = "true"
            except Exception:
                pass
            return resp

app.add_middleware(TimeoutMiddleware, timeout=25.0, long_timeout=120.0)

# Add GZip compression for responses > 500 bytes
app.add_middleware(GZipMiddleware, minimum_size=500)


# =============================================================================
# Database Context Middleware (for multi-database support)
# =============================================================================

@app.middleware("http")
async def set_database_context(request, call_next):
    """
    Set the database context for multi-database support.

    Priority order:
    1) Explicit header: X-Database-Environment
    2) Explicit query param: ?db_env=uat|production
    3) Cookie: assetiq_db_env (optional)
    4) Host-based inference (e.g. *uat* domains default to uat)
    5) Fallback: production/default
    """
    from database import set_request_db, get_db_name_for_environment, AVAILABLE_DATABASES, DEFAULT_DB_NAME
    
    # 1) Header
    db_env = request.headers.get("X-Database-Environment")

    # 2) Query param fallback (useful for direct navigations like <img src>, window.open)
    if not db_env:
        try:
            db_env = request.query_params.get("db_env")
        except Exception:
            db_env = None

    # 3) Cookie fallback
    if not db_env:
        try:
            db_env = request.cookies.get("assetiq_db_env")
        except Exception:
            db_env = None

    # 4) Host inference
    if not db_env:
        try:
            host = (request.headers.get("host") or "").lower()
            if "uat" in host:
                db_env = "uat"
        except Exception:
            db_env = None

    # 5) Default
    if not db_env:
        db_env = "production"
    
    # Validate and set the database name
    if db_env in AVAILABLE_DATABASES:
        db_name = AVAILABLE_DATABASES[db_env]["name"]
    else:
        db_name = DEFAULT_DB_NAME
    
    # Set the database for this request context
    set_request_db(db_name)
    
    response = await call_next(request)
    return response


# =============================================================================
# Request Logging Middleware
# =============================================================================

@app.middleware("http")
async def log_requests(request, call_next):
    """Log all incoming requests with timing."""
    start_time = time.time()
    request_id = f"req-{int(start_time * 1000) % 100000}"
    
    # Skip verbose logging for health checks
    is_health = request.url.path in ["/health", "/", "/api/health"]
    
    if not is_health:
        logger.info(f"[{request_id}] {request.method} {request.url.path} started")
    
    try:
        response = await call_next(request)
        duration = time.time() - start_time
        
        if not is_health:
            logger.info(f"[{request_id}] {request.method} {request.url.path} completed in {duration:.2f}s - status {response.status_code}")
            if duration > 2.0:
                logger.warning(f"[{request_id}] SLOW REQUEST: {request.url.path} took {duration:.2f}s")
        
        return response
    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"[{request_id}] {request.method} {request.url.path} FAILED after {duration:.2f}s: {str(e)}")
        raise


# =============================================================================
# Security Headers Middleware
# =============================================================================

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    
    # Only send HSTS if the request was effectively HTTPS. This avoids accidentally
    # bricking local/dev HTTP clients while still hardening prod behind proxies.
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    if proto == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Modern browsers ignore X-XSS-Protection, but leaving it is harmless for legacy.
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), "
        "geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), "
        "picture-in-picture=(), usb=()"
    )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    
    docs_paths = ["/api/docs", "/api/redoc", "/api/openapi.json", "/docs", "/redoc", "/openapi.json"]
    if request.url.path in docs_paths:
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
    else:
        # CSP on an API doesn't protect your SPA, but it *does* reduce blast radius if
        # an endpoint ever reflects HTML. Keep it strict and avoid unsafe-eval by default.
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            "base-uri 'none'; "
            "frame-ancestors 'none'; "
            "form-action 'none'; "
            "img-src 'self' data:; "
            "style-src 'self' 'unsafe-inline'; "
            "connect-src 'self' https:; "
            "script-src 'none'; "
            "object-src 'none'"
        )
    
    return response


# =============================================================================
# CSRF protection for cookie-auth (double submit)
# =============================================================================

@app.middleware("http")
async def csrf_protect_cookie_auth(request: Request, call_next):
    """
    If the client authenticates via HttpOnly cookie, enforce CSRF protection on
    unsafe methods using a double-submit token.

    - Cookie `assetiq_csrf` (readable by JS) must match header `X-CSRF-Token`.
    - Bearer Authorization header requests are not subject to this CSRF check.
    """
    try:
        allow_cookie_auth = os.environ.get("ALLOW_COOKIE_AUTH", "true").lower() == "true"
        if not allow_cookie_auth:
            return await call_next(request)

        # Only enforce on unsafe methods.
        if request.method.upper() in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)

        path = request.url.path or ""
        # Exempt auth endpoints that must work pre-login.
        exempt_prefixes = (
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/logout",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/auth/verify-reset-token",
            "/health",
            "/api/health",
        )
        if any(path.startswith(p) for p in exempt_prefixes):
            return await call_next(request)

        # If Authorization header is present, assume bearer auth and skip CSRF.
        authz = request.headers.get("authorization") or ""
        if authz.lower().startswith("bearer "):
            return await call_next(request)

        csrf_cookie = request.cookies.get(os.environ.get("CSRF_COOKIE_NAME", "assetiq_csrf"))
        csrf_header = request.headers.get("x-csrf-token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            resp = JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
            # Ensure the browser can read the response even when this middleware
            # runs before CORSMiddleware (otherwise it surfaces as a CORS error).
            try:
                origin = request.headers.get("origin")
                if origin and origin in ALLOWED_ORIGINS:
                    resp.headers["Access-Control-Allow-Origin"] = origin
                    resp.headers["Vary"] = "Origin"
                    resp.headers["Access-Control-Allow-Credentials"] = "true"
            except Exception:
                pass
            return resp

    except Exception:
        # Fail closed only if explicitly configured.
        if os.environ.get("CSRF_STRICT", "false").lower() == "true":
            resp = JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
            try:
                origin = request.headers.get("origin")
                if origin and origin in ALLOWED_ORIGINS:
                    resp.headers["Access-Control-Allow-Origin"] = origin
                    resp.headers["Vary"] = "Origin"
                    resp.headers["Access-Control-Allow-Credentials"] = "true"
            except Exception:
                pass
            return resp

    return await call_next(request)


# =============================================================================
# Application Audit Log (change/transaction logging)
# =============================================================================

_AUDIT_MAX_BODY_BYTES = int(os.environ.get("AUDIT_MAX_BODY_BYTES", "65536"))  # 64KB

_AUDIT_REDACT_KEYS = {
    "password",
    "new_password",
    "current_password",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "csrf",
    "x-csrf-token",
    "secret",
    "jwt",
    "jwt_secret",
    "jwt_secret_key",
}


def _audit_redact(value, key_hint: str = ""):
    if key_hint and key_hint.lower() in _AUDIT_REDACT_KEYS:
        return "[REDACTED]"
    # Avoid logging very large blobs/strings
    if isinstance(value, (bytes, bytearray)):
        return f"[bytes:{len(value)}]"
    if isinstance(value, str) and len(value) > 2000:
        return value[:2000] + "…"
    return value


def _audit_sanitize(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            out[k] = _audit_sanitize(_audit_redact(v, str(k)))
        return out
    if isinstance(obj, list):
        # Cap list length to keep payloads small
        return [_audit_sanitize(x) for x in obj[:50]]
    return _audit_redact(obj)


async def _audit_get_actor(request: Request):
    """
    Best-effort user lookup (never blocks request on audit failures).
    """
    try:
        from auth import _validate_token, AUTH_COOKIE_NAME, ALLOW_COOKIE_AUTH
    except Exception:
        return None

    token = None
    try:
        authz = request.headers.get("authorization") or ""
        if authz.lower().startswith("bearer "):
            token = authz.split(" ", 1)[1].strip()
    except Exception:
        token = None

    if not token and getattr(request, "cookies", None):
        try:
            if ALLOW_COOKIE_AUTH:
                token = request.cookies.get(AUTH_COOKIE_NAME)
        except Exception:
            token = None

    if not token:
        return None

    try:
        user = await _validate_token(token)
        return {
            "id": user.get("id"),
            "name": user.get("name") or user.get("email") or user.get("username"),
            "email": user.get("email"),
            "role": user.get("role"),
        }
    except Exception:
        return None


@app.middleware("http")
async def application_audit_log(request: Request, call_next):
    """
    Logs all application write transactions (POST/PATCH/PUT/DELETE) to MongoDB.

    Captures: timestamp, actor, path/method/status, and what changed (field names).
    Payload is redacted and size-limited to reduce risk and cost.
    """
    method = (request.method or "").upper()
    path = request.url.path or ""

    # Only log API write operations; skip health/docs/static.
    if method in ("POST", "PUT", "PATCH", "DELETE") and path.startswith("/api/"):
        # Read body early (Starlette caches it so downstream can still read it).
        raw_body = b""
        try:
            raw_body = await request.body()
            if raw_body and len(raw_body) > _AUDIT_MAX_BODY_BYTES:
                raw_body = raw_body[:_AUDIT_MAX_BODY_BYTES]
        except Exception:
            raw_body = b""
        request.state._audit_raw_body = raw_body

    response = await call_next(request)

    if method not in ("POST", "PUT", "PATCH", "DELETE"):
        return response
    if not path.startswith("/api/"):
        return response

    # Exempt auth endpoints to avoid any chance of credential logging.
    exempt_prefixes = (
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
        "/api/auth/verify-reset-token",
    )
    if any(path.startswith(p) for p in exempt_prefixes):
        return response

    try:
        from database import db
    except Exception:
        return response

    try:
        actor = await _audit_get_actor(request)
        status = int(getattr(response, "status_code", 0) or 0)

        # Parse JSON body (best-effort)
        changed_fields = []
        payload = None
        content_type = (request.headers.get("content-type") or "").lower()
        raw_body = getattr(request.state, "_audit_raw_body", b"") or b""

        if raw_body and "application/json" in content_type:
            try:
                parsed = json.loads(raw_body.decode("utf-8", errors="ignore") or "{}")
                payload = _audit_sanitize(parsed)
                if isinstance(parsed, dict):
                    changed_fields = list(parsed.keys())
            except Exception:
                payload = None
        else:
            # For multipart/form-data or other content types, avoid parsing streams.
            payload = None

        # Basic db env inference for visibility in multi-db setups
        db_env = (
            request.headers.get("x-database-environment")
            or request.query_params.get("db_env")
            or request.cookies.get("db_env")
        )

        entry = {
            "ts": datetime.now(timezone.utc),
            "actor": actor,
            "http": {
                "method": method,
                "path": path,
                "query": dict(request.query_params) if getattr(request, "query_params", None) else {},
                "status": status,
            },
            "change": {
                "fields": changed_fields,
                "payload": payload,
                "content_type": request.headers.get("content-type"),
                "content_length": request.headers.get("content-length"),
            },
            "client": {
                "ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
            },
            "db_env": db_env,
        }

        # Insert best-effort (never fail the request)
        await db.audit_log.insert_one(entry)
    except Exception:
        pass

    return response


# =============================================================================
# Startup Event - Non-blocking
# =============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize server - background tasks don't block healthcheck."""
    port = os.environ.get('PORT', '8001')
    logger.info(f"=== SERVER STARTING on port {port} ===")
    logger.info(f"CORS allowed origins: {len(ALLOWED_ORIGINS)} configured")
    
    # Start background initialization (non-blocking)
    asyncio.create_task(background_startup())
    
    logger.info("=== SERVER READY (background tasks running) ===")


async def background_startup():
    """Run heavy initialization tasks in background."""
    logger.info("Background startup tasks starting...")
    
    try:
        from database import db, verify_database_connection
        
        logger.info("Verifying database connection...")
        connected = await verify_database_connection(max_retries=3, timeout=5.0)
        
        if connected:
            logger.info("MongoDB connected successfully")

            # Ensure primary owner role in UAT DB (auth reads request DB first; UAT must have role=owner there)
            try:
                from database import client, AVAILABLE_DATABASES
                from scripts.ensure_uat_owner import ensure_uat_primary_owner
                await ensure_uat_primary_owner(client, AVAILABLE_DATABASES)
            except Exception as e:
                logger.warning(f"UAT owner bootstrap skipped: {e}")
            
            # Initialize MongoDB file storage
            try:
                from services.storage_service import init_mongo_storage
                init_mongo_storage(db)
                logger.info("MongoDB file storage initialized")
            except Exception as e:
                logger.warning(f"File storage init failed: {e}")
            
            # Create indexes
            try:
                from scripts.create_indexes import create_indexes
                created, skipped = await create_indexes()
                logger.info(f"Database indexes: {created} created, {skipped} skipped")
            except Exception as e:
                logger.warning(f"Index creation skipped: {e}")
            
            # Seed failure modes
            try:
                from scripts.seed_failure_modes import ensure_failure_modes_seeded
                await ensure_failure_modes_seeded(db)
                logger.info("Failure modes library ready")
            except Exception as e:
                logger.warning(f"Failure modes seeding skipped: {e}")
            
            # Start periodic cleanup of old pending registrations
            asyncio.create_task(cleanup_pending_registrations_task(db))
            
            app.state.ready = True
        else:
            logger.warning("Database not connected - running in degraded mode")
        
        # Log route count
        api_routes = [r for r in app.routes if hasattr(r, 'path') and r.path.startswith('/api')]
        logger.info(f"Total API routes: {len(api_routes)}")
        logger.info("=== BACKGROUND STARTUP COMPLETE ===")
        
    except Exception as e:
        logger.error(f"Background startup failed: {e}")


async def cleanup_pending_registrations_task(db):
    """
    Periodically clean up pending registrations older than 48 hours.
    Runs every 6 hours.
    """
    from datetime import datetime, timezone, timedelta
    
    CLEANUP_INTERVAL_HOURS = 6
    PENDING_EXPIRY_HOURS = 48
    
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_HOURS * 3600)  # Sleep first, then cleanup
            
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=PENDING_EXPIRY_HOURS)
            cutoff_iso = cutoff_time.isoformat()
            
            # Delete pending users created before cutoff
            result = await db.users.delete_many({
                "approval_status": "pending",
                "created_at": {"$lt": cutoff_iso}
            })
            
            if result.deleted_count > 0:
                logger.info(f"Cleaned up {result.deleted_count} expired pending registrations (older than {PENDING_EXPIRY_HOURS}h)")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Pending registration cleanup error: {e}")


# =============================================================================
# Shutdown Event
# =============================================================================

@app.on_event("shutdown")
async def shutdown_db_client():
    """Clean up database connection on shutdown."""
    try:
        from database import client
        client.close()
        logger.info("Database connection closed")
    except Exception as e:
        logger.warning(f"Shutdown cleanup: {e}")


# =============================================================================
# Admin Endpoints
# =============================================================================

@app.api_route("/api/admin/seed-database", methods=["GET", "POST"])
async def trigger_database_seed(secret_key: str = None):
    """Admin endpoint to seed the database with preview data."""
    expected_key = os.environ.get('SEED_SECRET_KEY', 'emergent-seed-2024')
    
    if secret_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid secret key")
    
    try:
        from seed_database import seed_database
        success = await seed_database()
        if success:
            return {"status": "success", "message": "Database seeded successfully"}
        else:
            raise HTTPException(status_code=500, detail="Seeding failed - check logs")
    except Exception as e:
        logger.error(f"Seed error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
