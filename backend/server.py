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
import os
import logging
import asyncio
import time

# Configure logging FIRST
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create FastAPI app IMMEDIATELY - before any potentially failing imports
app = FastAPI(
    title="AssetIQ API",
    version="2.7.0",
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
    return {"message": "AssetIQ API", "status": "running", "version": "2.7.0"}


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
        "version": "2.7.0"
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


# Swagger UI at root level for direct Railway access
try:
    from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

    @app.get("/docs", include_in_schema=False)
    async def swagger_ui_html():
        return get_swagger_ui_html(
            openapi_url="/openapi.json",
            title=app.title + " - Swagger UI",
            swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js",
            swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css",
        )

    @app.get("/redoc", include_in_schema=False)
    async def redoc_html():
        return get_redoc_html(
            openapi_url="/openapi.json",
            title=app.title + " - ReDoc",
            redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js",
        )

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_json():
        return JSONResponse(app.openapi())
except Exception as e:
    logger.warning(f"Swagger UI setup failed: {e}")


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
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# Load all API routes (wrapped for safety)
try:
    from routes import all_routers
    
    api_router = APIRouter(prefix="/api")
    for router in all_routers:
        api_router.include_router(router)
    
    app.include_router(api_router)
    logger.info(f"Loaded {len(all_routers)} route modules")
except Exception as e:
    logger.error(f"Failed to load routes: {e}")
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


# =============================================================================
# CORS Configuration
# =============================================================================

ALLOWED_ORIGINS = [
    "https://assetiq.tech",
    "https://www.assetiq.tech",
    "https://assetiq-rho.vercel.app",
    "https://asset-iq-rho.vercel.app",
    "https://asset-iq-preview.preview.emergentagent.com",
    "https://assetiq-rmhd.vercel.app",
    "https://assetiq.vercel.app",
    "http://localhost:3000",
    "http://localhost:5000",
]

env_origins = os.environ.get('CORS_ORIGINS', '')
if env_origins and env_origins != '*':
    ALLOWED_ORIGINS = [origin.strip() for origin in env_origins.split(',')]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.(vercel\.app|emergentagent\.com|emergent\.host)",
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Timeout Middleware
# =============================================================================

class TimeoutMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, timeout: float = 25.0):
        super().__init__(app)
        self.timeout = timeout

    async def dispatch(self, request: Request, call_next):
        # Skip timeout for health endpoints
        if request.url.path in ["/health", "/", "/api/health"]:
            return await call_next(request)
        
        start_time = time.time()
        try:
            response = await asyncio.wait_for(call_next(request), timeout=self.timeout)
            duration = time.time() - start_time
            if duration > 5.0:
                logger.warning(f"Slow request: {request.method} {request.url.path} took {duration:.2f}s")
            return response
        except asyncio.TimeoutError:
            logger.error(f"Request timeout: {request.method} {request.url.path} exceeded {self.timeout}s")
            return JSONResponse(status_code=504, content={"detail": "Request timeout - please try again"})

app.add_middleware(TimeoutMiddleware, timeout=25.0)


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
    
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    
    docs_paths = ["/api/docs", "/api/redoc", "/api/openapi.json", "/docs", "/redoc", "/openapi.json"]
    if request.url.path in docs_paths:
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
    else:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self' https:; "
            "frame-ancestors 'none';"
        )
    
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
            
            app.state.ready = True
        else:
            logger.warning("Database not connected - running in degraded mode")
        
        # Log route count
        api_routes = [r for r in app.routes if hasattr(r, 'path') and r.path.startswith('/api')]
        logger.info(f"Total API routes: {len(api_routes)}")
        logger.info("=== BACKGROUND STARTUP COMPLETE ===")
        
    except Exception as e:
        logger.error(f"Background startup failed: {e}")


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
