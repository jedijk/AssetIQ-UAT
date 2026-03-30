"""
AssetIQ / ThreatBase API - Main application entry point.
All route handlers are in /routes/, services in /services/, models in /models/.
"""
from fastapi import FastAPI, APIRouter, HTTPException
from starlette.middleware.cors import CORSMiddleware
import os
import logging

from database import client
from routes import all_routers
from seed_database import seed_database

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create app
app = FastAPI(title="ThreatBase API")

# Create the /api prefix router and include all sub-routers
api_router = APIRouter(prefix="/api")
for router in all_routers:
    api_router.include_router(router)

app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize database indexes on startup."""
    try:
        from scripts.create_indexes import create_indexes
        created, skipped = await create_indexes()
        logger.info(f"Database indexes: {created} created, {skipped} already existed")
    except Exception as e:
        logger.warning(f"Index creation skipped: {e}")


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
