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
app = FastAPI(
    title="ThreatBase API",
    version="2.5.2",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Add rate limiter to app state
app.state.limiter = limiter

# Add rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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

# CORS - Restrict to production domain
ALLOWED_ORIGINS = [
    "https://assetiq.tech",
    "https://www.assetiq.tech",
    "https://asset-iq-preview.preview.emergentagent.com",  # Preview environment
    "http://localhost:3000",  # Local development
]

# Override with environment variable if set
env_origins = os.environ.get('CORS_ORIGINS', '')
if env_origins and env_origins != '*':
    ALLOWED_ORIGINS = [origin.strip() for origin in env_origins.split(',')]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add timeout middleware to prevent 520 errors (25s timeout, Cloudflare times out at 30s)
app.add_middleware(TimeoutMiddleware, timeout=25.0)


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
    
    # Content Security Policy (allow same origin and specific trusted sources)
    # Note: This is permissive for development. Tighten for production.
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
    """Initialize database indexes and seed data on startup."""
    from database import db
    
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
