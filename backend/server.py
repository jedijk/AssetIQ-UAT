"""
AssetIQ / ThreatBase API - Main application entry point.
All route handlers are in /routes/, services in /services/, models in /models/.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import logging
import asyncio
import time

from database import client
from routes import all_routers
from seed_database import seed_database

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Request timeout middleware to prevent 520 errors
class TimeoutMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, timeout: float = 25.0):
        super().__init__(app)
        self.timeout = timeout

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        try:
            response = await asyncio.wait_for(
                call_next(request),
                timeout=self.timeout
            )
            # Log slow requests
            duration = time.time() - start_time
            if duration > 5.0:
                logger.warning(f"Slow request: {request.method} {request.url.path} took {duration:.2f}s")
            return response
        except asyncio.TimeoutError:
            logger.error(f"Request timeout: {request.method} {request.url.path} exceeded {self.timeout}s")
            return JSONResponse(
                status_code=504,
                content={"detail": "Request timeout - please try again"}
            )

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Create app with explicit OpenAPI configuration
# Primary docs at /api/* for proxy environments (Emergent, Vercel+Railway)
# Also add fallback routes at root level for direct Railway access
app = FastAPI(
    title="ThreatBase API",
    version="2.7.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Add duplicate docs endpoints at root level for Railway direct access
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

@app.get("/docs", include_in_schema=False)
async def swagger_ui_html():
    """Swagger UI at /docs for direct backend access (Railway)."""
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=app.title + " - Swagger UI",
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css",
    )

@app.get("/redoc", include_in_schema=False)
async def redoc_html():
    """ReDoc at /redoc for direct backend access (Railway)."""
    return get_redoc_html(
        openapi_url="/openapi.json",
        title=app.title + " - ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js",
    )

@app.get("/openapi.json", include_in_schema=False)
async def openapi_json():
    """OpenAPI schema at /openapi.json for direct backend access."""
    return JSONResponse(app.openapi())

# Add rate limiter to app state
app.state.limiter = limiter

# Add rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Import error logging function
from routes.system import log_error

# Global exception handler to log all unhandled errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log all unhandled exceptions to the error log."""
    error_details = {
        "path": str(request.url.path),
        "method": request.method,
        "client": request.client.host if request.client else "unknown",
        "exception_type": type(exc).__name__,
    }
    
    # Determine error type based on exception
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
    
    log_error(
        error_type=error_type,
        message=str(exc)[:500],
        details=error_details,
        source="backend"
    )
    
    logger.error(f"Unhandled exception on {request.url.path}: {exc}")
    
    # Return appropriate error response
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )
    
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# Create the /api prefix router and include all sub-routers
api_router = APIRouter(prefix="/api")
for router in all_routers:
    api_router.include_router(router)

app.include_router(api_router)

# Health check endpoint (required for Emergent deployment)
@app.get("/health")
async def health_check():
    """Health check endpoint for deployment."""
    return {"status": "healthy"}


# Enhanced health check endpoint with database status
@app.get("/api/health")
async def api_health_check():
    """Comprehensive health check with database status."""
    import time
    start_time = time.time()
    
    try:
        # Test database connection
        from database import db
        await db.command('ping')
        db_status = "connected"
        db_latency = round((time.time() - start_time) * 1000, 2)
    except Exception as e:
        db_status = f"error: {str(e)}"
        db_latency = None
    
    # Get uptime (approximate - time since module loaded)
    uptime = round(time.time() - app.state.start_time, 2) if hasattr(app.state, 'start_time') else 0
    
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "database": db_status,
        "database_latency_ms": db_latency,
        "uptime_seconds": uptime,
        "version": "2.7.0"
    }


# Debug endpoint to list all available routes
@app.get("/api/routes")
async def list_routes():
    """List all registered API routes (useful for debugging 404 issues)."""
    routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            methods = list(route.methods - {'HEAD', 'OPTIONS'}) if route.methods else ['GET']
            if route.path.startswith('/api'):
                routes.append({
                    "path": route.path,
                    "methods": methods
                })
    return {
        "total": len(routes),
        "routes": sorted(routes, key=lambda x: x['path'])
    }

# CORS - Allow production domains and Vercel deployments
ALLOWED_ORIGINS = [
    "https://assetiq.tech",
    "https://www.assetiq.tech",
    "https://assetiq-rho.vercel.app",  # Vercel production
    "https://asset-iq-rho.vercel.app",  # Vercel production (alternate)
    "https://asset-iq-preview.preview.emergentagent.com",  # Preview environment
    "https://assetiq-rmhd.vercel.app",  # Vercel production (legacy)
    "https://assetiq.vercel.app",  # Vercel alias
    "http://localhost:3000",  # Local development
    "http://localhost:5000",  # Local backend direct
]

# Also allow any Vercel preview deployments
VERCEL_PATTERN = ".vercel.app"

# Override with environment variable if set
env_origins = os.environ.get('CORS_ORIGINS', '')
if env_origins and env_origins != '*':
    ALLOWED_ORIGINS = [origin.strip() for origin in env_origins.split(',')]

# Use allow_origin_regex to match all Vercel and Emergent preview deployments
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.(vercel\.app|emergentagent\.com|emergent\.host)",  # Match Vercel and Emergent deployments
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add timeout middleware to prevent 520 errors (25s timeout, Cloudflare times out at 30s)
app.add_middleware(TimeoutMiddleware, timeout=25.0)


# Global Request Logging Middleware
@app.middleware("http")
async def log_requests(request, call_next):
    """Log all incoming requests with timing."""
    import time
    start_time = time.time()
    request_id = f"req-{int(start_time * 1000) % 100000}"
    
    # Log request start
    logger.info(f"[{request_id}] {request.method} {request.url.path} started")
    
    try:
        response = await call_next(request)
        
        # Log request completion
        duration = time.time() - start_time
        logger.info(f"[{request_id}] {request.method} {request.url.path} completed in {duration:.2f}s - status {response.status_code}")
        
        if duration > 2.0:
            logger.warning(f"[{request_id}] SLOW REQUEST: {request.url.path} took {duration:.2f}s")
        
        return response
    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"[{request_id}] {request.method} {request.url.path} FAILED after {duration:.2f}s: {str(e)}")
        raise


# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    
    # Strict Transport Security (HSTS) - force HTTPS
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # Prevent clickjacking
    response.headers["X-Frame-Options"] = "DENY"
    
    # Prevent MIME type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    
    # XSS Protection (legacy, but still useful)
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    # Referrer Policy
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # Permissions Policy (restrict browser features)
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    
    # Content Security Policy
    # Skip CSP for Swagger docs pages (they need CDN resources)
    # Support both /api/* paths (proxy) and root paths (direct Railway)
    docs_paths = ["/api/docs", "/api/redoc", "/api/openapi.json", "/docs", "/redoc", "/openapi.json"]
    if request.url.path in docs_paths:
        # No CSP for docs - Swagger UI needs external CDN
        # Add CORP header to allow ReDoc script loading
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
    else:
        # Standard CSP for all other routes
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


@app.on_event("startup")
async def startup_event():
    """Initialize server - starts background tasks for DB initialization."""
    import time
    app.state.start_time = time.time()  # Track server start time for health check
    
    # Log server startup
    port = os.environ.get('PORT', '8001')
    logger.info(f"=== SERVER STARTING on port {port} ===")
    logger.info(f"CORS allowed origins: {ALLOWED_ORIGINS}")
    
    # Start background initialization (non-blocking for fast healthcheck response)
    asyncio.create_task(background_startup())
    
    logger.info("=== SERVER READY (background tasks running) ===")


async def background_startup():
    """Run heavy initialization tasks in background to not block healthcheck."""
    logger.info("Background startup tasks running...")
    
    from database import db, verify_database_connection
    
    try:
        # Verify database connection with retry
        logger.info("Verifying database connection...")
        connected = await verify_database_connection(max_retries=3, timeout=5.0)
        
        if connected:
            logger.info("MongoDB connected successfully")
            
            # Create indexes
            try:
                from scripts.create_indexes import create_indexes
                created, skipped = await create_indexes()
                logger.info(f"Database indexes: {created} created, {skipped} already existed")
            except Exception as e:
                logger.warning(f"Index creation skipped: {e}")
            
            # Seed failure modes library if empty
            try:
                from scripts.seed_failure_modes import ensure_failure_modes_seeded
                seeded = await ensure_failure_modes_seeded(db)
                if seeded:
                    logger.info("Failure modes library ready")
            except Exception as e:
                logger.warning(f"Failure modes seeding skipped: {e}")
        else:
            logger.warning("Database not connected - running in degraded mode")
        
        # Log all registered routes
        logger.info("=== REGISTERED API ROUTES ===")
        api_routes = []
        for route in app.routes:
            if hasattr(route, 'path') and hasattr(route, 'methods'):
                methods = ','.join(route.methods - {'HEAD', 'OPTIONS'}) if route.methods else 'GET'
                if methods and route.path.startswith('/api'):
                    api_routes.append(f"  {methods:10} {route.path}")
        
        # Sort and log
        for route_info in sorted(api_routes)[:50]:  # Log first 50 routes
            logger.info(route_info)
        logger.info(f"Total API routes: {len(api_routes)}")
        logger.info("=== BACKGROUND STARTUP COMPLETE ===")
        
    except Exception as e:
        logger.error(f"Background startup failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.api_route("/api/admin/seed-database", methods=["GET", "POST"])
async def trigger_database_seed(secret_key: str = None):
    """
    Admin endpoint to seed the database with preview data.
    Requires SEED_SECRET_KEY environment variable to be set and matched.
    Works with both GET and POST methods for convenience.
    """
    expected_key = os.environ.get('SEED_SECRET_KEY', 'emergent-seed-2024')
    
    if secret_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid secret key")
    
    try:
        success = await seed_database()
        if success:
            return {"status": "success", "message": "Database seeded successfully"}
        else:
            raise HTTPException(status_code=500, detail="Seeding failed - check logs")
    except Exception as e:
        logger.error(f"Seed error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
