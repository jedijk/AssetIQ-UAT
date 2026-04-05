"""
System Metrics Routes.

API endpoint for server performance monitoring.
Provides CPU, RAM, Disk usage and uptime metrics.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import time
import logging
import os

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

from auth import get_current_user
from database import db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["System"])


@router.get("/system/metrics")
async def get_system_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Get real-time server performance metrics.
    
    Only accessible by admin and owner users.
    
    Returns:
        CPU usage, RAM usage, Disk usage, and server uptime.
    """
    # Restrict to owner only
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can access server metrics"
        )
    
    if not PSUTIL_AVAILABLE:
        # Return mock data if psutil is not available
        return {
            "cpu_percent": 35.5,
            "ram_used": 4.2,
            "ram_total": 8.0,
            "ram_percent": 52.5,
            "disk_used": 45.0,
            "disk_total": 100.0,
            "disk_percent": 45.0,
            "uptime": 86400,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mock": True
        }
    
    try:
        # CPU Usage (with 0.1s interval for more accurate reading)
        cpu_percent = psutil.cpu_percent(interval=0.1)
        
        # RAM Usage
        memory = psutil.virtual_memory()
        ram_used = round(memory.used / (1024 ** 3), 2)  # Convert to GB
        ram_total = round(memory.total / (1024 ** 3), 2)  # Convert to GB
        ram_percent = round(memory.percent, 2)
        
        # Disk Usage
        disk = psutil.disk_usage('/')
        disk_used = round(disk.used / (1024 ** 3), 2)  # Convert to GB
        disk_total = round(disk.total / (1024 ** 3), 2)  # Convert to GB
        disk_percent = round(disk.percent, 2)
        
        # Uptime (seconds since boot)
        boot_time = psutil.boot_time()
        uptime = int(time.time() - boot_time)
        
        # CPU Core count
        cpu_count = psutil.cpu_count()
        cpu_count_logical = psutil.cpu_count(logical=True)
        
        # Network I/O (optional bonus data)
        try:
            net_io = psutil.net_io_counters()
            network = {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv
            }
        except Exception:
            network = None
        
        return {
            "cpu_percent": round(cpu_percent, 2),
            "cpu_count": cpu_count,
            "cpu_count_logical": cpu_count_logical,
            "ram_used": ram_used,
            "ram_total": ram_total,
            "ram_percent": ram_percent,
            "disk_used": disk_used,
            "disk_total": disk_total,
            "disk_percent": disk_percent,
            "uptime": uptime,
            "network": network,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mock": False
        }
        
    except Exception as e:
        logger.error(f"Failed to get system metrics: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve system metrics: {str(e)}"
        )


@router.get("/system/health")
async def get_system_health():
    """
    Simple health check endpoint.
    No authentication required.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/system/database")
async def get_database_storage(
    current_user: dict = Depends(get_current_user)
):
    """
    Get MongoDB database storage usage.
    
    Only accessible by owner users.
    
    Returns:
        used: Current database size
        capacity: Total available capacity (based on disk or configured limit)
        unit: "MB" or "GB"
    """
    # Restrict to owner only
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can access database metrics"
        )
    
    try:
        # Get database stats from MongoDB
        db_stats = await db.command("dbStats")
        
        # storageSize is the actual storage on disk (includes padding/fragmentation)
        storage_size_bytes = db_stats.get("storageSize", 0)
        # indexSize is the total size of all indexes
        index_size_bytes = db_stats.get("indexSize", 0)
        
        # Total used = storage + indexes
        total_used_bytes = storage_size_bytes + index_size_bytes
        
        # For capacity, we'll use a configurable limit or default to disk-based estimate
        # Check environment variable for configured limit (in GB)
        configured_capacity_gb = float(os.environ.get("DB_CAPACITY_GB", "5"))
        
        # Convert to appropriate unit
        total_used_gb = total_used_bytes / (1024 ** 3)
        
        # Determine if we should use MB or GB based on size
        if total_used_gb < 1 and configured_capacity_gb < 10:
            # Use MB for smaller databases
            used = round(total_used_bytes / (1024 ** 2), 2)
            capacity = round(configured_capacity_gb * 1024, 0)  # Convert GB to MB
            unit = "MB"
        else:
            # Use GB for larger databases
            used = round(total_used_gb, 2)
            capacity = round(configured_capacity_gb, 1)
            unit = "GB"
        
        return {
            "used": used,
            "capacity": capacity,
            "unit": unit,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to get database storage: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve database storage: {str(e)}"
        )
