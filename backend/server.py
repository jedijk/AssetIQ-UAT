"""
AssetIQ / ThreatBase API - Main application entry point.
All route handlers are in /routes/, services in /services/, models in /models/.
"""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import os
import logging

from database import client
from routes import all_routers

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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
