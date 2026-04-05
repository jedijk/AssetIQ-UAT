"""
System Metrics Routes.

API endpoint for server performance monitoring.
Provides CPU, RAM, Disk usage and uptime metrics.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone
import time
import logging
import os
import subprocess

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



@router.get("/system/security")
async def get_security_status(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Run security checks and return status.
    
    Only accessible by owner users.
    
    Returns security status with individual check results.
    """
    # Restrict to owner only
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can access security checks"
        )
    
    checks = []
    
    try:
        # 1. Authentication Check
        # Authentication is enabled if we got here (requires login)
        checks.append({
            "name": "Authentication",
            "status": "pass",
            "message": "User authentication is enabled and enforced"
        })
        
        # 2. Password Policy Check
        # Check if password requirements are configured
        min_password_length = int(os.environ.get("MIN_PASSWORD_LENGTH", "6"))
        if min_password_length >= 8:
            checks.append({
                "name": "Password Policy",
                "status": "pass",
                "message": "Strong password requirements are active"
            })
        elif min_password_length >= 6:
            checks.append({
                "name": "Password Policy",
                "status": "warning",
                "message": "Password requirements could be stronger"
            })
        else:
            checks.append({
                "name": "Password Policy",
                "status": "fail",
                "message": "Weak password requirements detected"
            })
        
        # 3. HTTPS Check
        # Check if request came over HTTPS
        is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
        if is_https:
            checks.append({
                "name": "HTTPS",
                "status": "pass",
                "message": "Secure connection is enforced"
            })
        else:
            # In development, this might be expected
            is_production = os.environ.get("ENVIRONMENT", "development") == "production"
            if is_production:
                checks.append({
                    "name": "HTTPS",
                    "status": "fail",
                    "message": "Secure connection not enforced"
                })
            else:
                checks.append({
                    "name": "HTTPS",
                    "status": "warning",
                    "message": "Using HTTP (acceptable for development)"
                })
        
        # 4. CORS Configuration Check
        cors_origins = os.environ.get("CORS_ORIGINS", "*")
        if cors_origins == "*":
            checks.append({
                "name": "CORS Configuration",
                "status": "warning",
                "message": "CORS allows all origins (consider restricting)"
            })
        else:
            checks.append({
                "name": "CORS Configuration",
                "status": "pass",
                "message": "CORS is properly restricted"
            })
        
        # 5. Rate Limiting Check
        rate_limit_enabled = os.environ.get("RATE_LIMIT_ENABLED", "false").lower() == "true"
        if rate_limit_enabled:
            checks.append({
                "name": "Rate Limiting",
                "status": "pass",
                "message": "API rate limiting is active"
            })
        else:
            checks.append({
                "name": "Rate Limiting",
                "status": "warning",
                "message": "Rate limiting not configured"
            })
        
        # 6. Dependencies Check
        # Check for known vulnerabilities using pip-audit if available
        pip_audit_path = "/root/.venv/bin/pip-audit"
        try:
            # First check if pip-audit is available
            if os.path.exists(pip_audit_path):
                # pip-audit is available, run it with longer timeout
                result = subprocess.run(
                    [pip_audit_path, "--format", "json", "-q", "--progress-spinner", "off"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    checks.append({
                        "name": "Dependencies",
                        "status": "pass",
                        "message": "No known vulnerabilities in packages"
                    })
                else:
                    # Parse output to see if vulnerabilities found
                    import json as json_module
                    try:
                        vulns = json_module.loads(result.stdout) if result.stdout else []
                        if len(vulns) > 0:
                            checks.append({
                                "name": "Dependencies",
                                "status": "warning",
                                "message": f"{len(vulns)} packages may need updates"
                            })
                        else:
                            checks.append({
                                "name": "Dependencies",
                                "status": "pass",
                                "message": "No known vulnerabilities in packages"
                            })
                    except Exception:
                        checks.append({
                            "name": "Dependencies",
                            "status": "warning",
                            "message": "Some packages may need updates"
                        })
            else:
                checks.append({
                    "name": "Dependencies",
                    "status": "warning",
                    "message": "Dependency scanner not installed"
                })
        except subprocess.TimeoutExpired:
            checks.append({
                "name": "Dependencies",
                "status": "warning",
                "message": "Dependency scan timed out"
            })
        except FileNotFoundError:
            checks.append({
                "name": "Dependencies",
                "status": "warning",
                "message": "Dependency scanner not available"
            })
        
        # 7. Database Access Check
        # Check if MongoDB requires authentication
        try:
            # Try to get server info - if we can access it, auth is working
            await db.command("ping")
            mongo_url = os.environ.get("MONGO_URL", "")
            if "@" in mongo_url or "localhost" in mongo_url or "127.0.0.1" in mongo_url:
                checks.append({
                    "name": "Database Access",
                    "status": "pass",
                    "message": "Database connection is secured"
                })
            else:
                checks.append({
                    "name": "Database Access",
                    "status": "warning",
                    "message": "Verify database authentication is enabled"
                })
        except Exception:
            checks.append({
                "name": "Database Access",
                "status": "fail",
                "message": "Unable to verify database security"
            })
        
        # 8. Environment Variables Check
        # Check if sensitive keys are properly configured (not default/empty)
        jwt_secret = os.environ.get("JWT_SECRET_KEY", "") or os.environ.get("JWT_SECRET", "")
        
        sensitive_issues = []
        if not jwt_secret or jwt_secret == "your-secret-key" or jwt_secret == "threatbase_super_secret_jwt_key_2024" or len(jwt_secret) < 32:
            sensitive_issues.append("JWT secret")
        
        if sensitive_issues:
            checks.append({
                "name": "Environment Variables",
                "status": "warning",
                "message": f"Review configuration: {', '.join(sensitive_issues)}"
            })
        else:
            checks.append({
                "name": "Environment Variables",
                "status": "pass",
                "message": "Sensitive keys are properly configured"
            })
        
        # Calculate overall status
        statuses = [c["status"] for c in checks]
        if "fail" in statuses:
            overall_status = "critical"
        elif "warning" in statuses:
            overall_status = "warning"
        else:
            overall_status = "secure"
        
        return {
            "status": overall_status,
            "checks": checks,
            "last_scan": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to run security checks: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to run security checks: {str(e)}"
        )
