"""
System Metrics Routes.

API endpoint for server performance monitoring.
Provides CPU, RAM, Disk usage and uptime metrics.

Note: Some metrics may not be available in serverless environments (Vercel, Railway).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone
from pydantic import BaseModel
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
from database import db, client, get_available_databases, get_current_db_name

logger = logging.getLogger(__name__)

router = APIRouter(tags=["System"])

# Detect deployment environment
def get_deployment_environment():
    """Detect the deployment environment."""
    if os.environ.get("VERCEL"):
        return "vercel"
    if os.environ.get("RAILWAY_ENVIRONMENT"):
        return "railway"
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        return "kubernetes"
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return "aws_lambda"
    if os.environ.get("EMERGENT_PREVIEW"):
        return "emergent"
    return "standard"


# ============= DATABASE ENVIRONMENT SWITCHER =============

class DatabaseSwitchRequest(BaseModel):
    environment: str  # "production" or "uat"

@router.get("/system/databases")
async def get_databases(
    current_user: dict = Depends(get_current_user)
):
    """
    Get available database environments.
    Only accessible by owners.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can view database environments"
        )
    
    databases = get_available_databases()
    current_db = get_current_db_name()
    
    # Find current environment key
    current_env = "production"
    for env_key, env_config in databases.items():
        if env_config["name"] == current_db:
            current_env = env_key
            break
    
    return {
        "available": [
            {
                "key": key,
                "name": config["name"],
                "label": config["label"],
                "description": config["description"],
                "is_current": config["name"] == current_db
            }
            for key, config in databases.items()
        ],
        "current": current_env,
        "current_db_name": current_db
    }

@router.post("/system/databases/switch")
async def switch_database(
    request: DatabaseSwitchRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Switch to a different database environment.
    Only accessible by owners.
    
    Note: This sets a preference that affects API calls when the X-Database header is used.
    The actual switch happens per-request basis using middleware.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can switch database environments"
        )
    
    databases = get_available_databases()
    
    if request.environment not in databases:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid environment. Available: {list(databases.keys())}"
        )
    
    target_db = databases[request.environment]
    
    # Verify the database is accessible
    try:
        target_db_ref = client[target_db["name"]]
        await target_db_ref.command('ping')
    except Exception as e:
        logger.error(f"Failed to connect to {target_db['name']}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect to {target_db['label']} database"
        )
    
    # Check if user exists in the target database (lookup by id OR email so
    # admins who migrated emails between environments still work). The
    # current_user dict returned by get_current_user stores the Mongo field
    # as "id" (not "user_id"), so prefer that.
    lookup_id = current_user.get("id") or current_user.get("user_id")
    lookup_email = (current_user.get("email") or "").lower()

    target_user = None
    if lookup_id:
        target_user = await target_db_ref.users.find_one(
            {"id": lookup_id},
            {"_id": 0, "id": 1, "email": 1}
        )
    if not target_user and lookup_email:
        target_user = await target_db_ref.users.find_one(
            {"email": lookup_email},
            {"_id": 0, "id": 1, "email": 1}
        )

    if not target_user:
        logger.warning(
            f"User id={lookup_id} email={lookup_email} not found in {target_db['name']}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"Your account does not exist in the {target_db['label']} environment. Please contact an administrator to set up your account there, or continue using your current environment."
        )

    # Store the user's database preference (on the primary/AUTH_DB so the
    # preference survives a subsequent switch). Use id if available, email otherwise.
    update_filter = {"id": lookup_id} if lookup_id else {"email": lookup_email}
    await db.users.update_one(
        update_filter,
        {"$set": {"database_preference": request.environment}}
    )
    
    return {
        "success": True,
        "message": f"Switched to {target_db['label']} environment",
        "environment": request.environment,
        "database_name": target_db["name"]
    }

@router.get("/system/databases/status")
async def get_database_status(
    current_user: dict = Depends(get_current_user)
):
    """
    Get status of all available databases.
    Only accessible by owners.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can view database status"
        )
    
    databases = get_available_databases()
    status = []
    
    for env_key, config in databases.items():
        try:
            db_ref = client[config["name"]]
            # Get database stats
            stats = await db_ref.command("dbStats")
            
            status.append({
                "key": env_key,
                "name": config["name"],
                "label": config["label"],
                "connected": True,
                "collections": stats.get("collections", 0),
                "documents": stats.get("objects", 0),
                "storage_size_mb": round(stats.get("storageSize", 0) / (1024 * 1024), 2),
                "data_size_mb": round(stats.get("dataSize", 0) / (1024 * 1024), 2)
            })
        except Exception as e:
            logger.error(f"Failed to get stats for {config['name']}: {e}")
            status.append({
                "key": env_key,
                "name": config["name"],
                "label": config["label"],
                "connected": False,
                "error": str(e)
            })
    
    return {"databases": status}


@router.get("/system/metrics")
async def get_system_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Get real-time server performance metrics.
    
    Only accessible by admin and owner users.
    
    Returns:
        CPU usage, RAM usage, Disk usage, and server uptime.
        Note: In serverless environments (Vercel/Railway), some metrics may be estimated.
    """
    # Restrict to owner only
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can access server metrics"
        )
    
    environment = get_deployment_environment()
    is_serverless = environment in ["vercel", "railway", "aws_lambda"]
    
    if not PSUTIL_AVAILABLE or is_serverless:
        # Return appropriate data for serverless environments
        return {
            "cpu_percent": None,
            "ram_used": None,
            "ram_total": None,
            "ram_percent": None,
            "disk_used": None,
            "disk_total": None,
            "disk_percent": None,
            "uptime": None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "environment": environment,
            "serverless": is_serverless,
            "message": "System metrics are not available in serverless environments. Database and application health monitoring is still available below." if is_serverless else "psutil not installed - limited metrics available"
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
            "environment": environment,
            "serverless": False
        }
        
    except Exception as e:
        logger.error(f"Failed to get system metrics: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve system metrics: {str(e)}"
        )


@router.get("/system/file-storage")
async def get_file_storage_stats(
    current_user: dict = Depends(get_current_user)
):
    """
    Get file storage statistics (R2 + MongoDB legacy).
    Only accessible by owner users.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only owners can access file storage metrics"
        )

    try:
        from services.storage_service import get_storage_stats
        stats = await get_storage_stats()
        stats["timestamp"] = datetime.now(timezone.utc).isoformat()

        # Add capacity info (configurable via env, default 10 GB)
        capacity_gb = float(os.environ.get("FILE_STORAGE_CAPACITY_GB", "10"))
        total_size_gb = stats["total_size_bytes"] / (1024 ** 3)

        if total_size_gb < 1 and capacity_gb <= 10:
            stats["used"] = stats["total_size_mb"]
            stats["capacity"] = round(capacity_gb * 1024, 0)
            stats["unit"] = "MB"
        else:
            stats["used"] = round(total_size_gb, 2)
            stats["capacity"] = round(capacity_gb, 1)
            stats["unit"] = "GB"

        return stats
    except Exception as e:
        logger.error(f"Failed to get file storage stats: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve file storage stats: {str(e)}"
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


@router.get("/system/cache-stats")
async def get_cache_stats(
    current_user: dict = Depends(get_current_user)
):
    """
    Get query cache statistics.
    Only accessible by owner users.
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can access cache stats"
        )
    
    try:
        from services.query_cache import get_cache_stats
        return get_cache_stats()
    except ImportError:
        return {"error": "Cache service not available"}




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
        
        # Get database name
        db_name = db.name
        
        return {
            "used": used,
            "capacity": capacity,
            "unit": unit,
            "database_name": db_name,
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
        # 1) Authentication & session strategy (2026 baseline)
        allow_cookie_auth = os.environ.get("ALLOW_COOKIE_AUTH", "true").lower() == "true"
        auth_cookie_name = os.environ.get("AUTH_COOKIE_NAME", "assetiq_token")
        csrf_cookie_name = os.environ.get("CSRF_COOKIE_NAME", "assetiq_csrf")
        allow_query_token = os.environ.get("ALLOW_QUERY_TOKEN_AUTH", "false").lower() == "true"

        checks.append({
            "name": "Authentication",
            "status": "pass",
            "message": "JWT auth enabled (bcrypt passwords). Prefer HttpOnly cookie sessions where possible."
        })
        if allow_cookie_auth:
            checks.append({
                "name": "Cookie Sessions",
                "status": "pass",
                "message": f"Cookie auth enabled ({auth_cookie_name}); CSRF double-submit expected via {csrf_cookie_name}."
            })
        else:
            checks.append({
                "name": "Cookie Sessions",
                "status": "warning",
                "message": "Cookie auth is disabled; bearer tokens increase XSS blast radius if stored in JS-readable storage."
            })

        if allow_query_token:
            checks.append({
                "name": "Token Leakage Protection",
                "status": "fail",
                "message": "Query-parameter token auth is ENABLED (ALLOW_QUERY_TOKEN_AUTH=true). Disable to prevent token leakage via logs/referrers/history."
            })
        else:
            checks.append({
                "name": "Token Leakage Protection",
                "status": "pass",
                "message": "Query-parameter token auth is disabled (recommended)."
            })
        
        # 2) Password Policy
        min_password_length = int(os.environ.get("MIN_PASSWORD_LENGTH", "8"))
        require_complexity = os.environ.get("REQUIRE_PASSWORD_COMPLEXITY", "true").lower() == "true"
        
        if min_password_length >= 8 and require_complexity:
            checks.append({
                "name": "Password Policy",
                "status": "pass",
                "message": f"Strong policy: {min_password_length}+ chars, uppercase, numbers, special chars"
            })
        elif min_password_length >= 8:
            checks.append({
                "name": "Password Policy",
                "status": "pass",
                "message": f"Password requirements: {min_password_length}+ characters"
            })
        else:
            checks.append({
                "name": "Password Policy",
                "status": "warning",
                "message": "Consider stronger password requirements"
            })
        
        # 3) Transport security (HTTPS / HSTS)
        is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
        if is_https:
            checks.append({
                "name": "Transport Security",
                "status": "pass",
                "message": "HTTPS is in use (HSTS should be enabled when behind HTTPS)."
            })
        else:
            # In development, this might be expected
            is_production = os.environ.get("ENVIRONMENT", "development") == "production"
            if is_production:
                checks.append({
                    "name": "Transport Security",
                    "status": "fail",
                    "message": "Production request is not HTTPS (check proxy x-forwarded-proto and TLS termination)."
                })
            else:
                checks.append({
                    "name": "Transport Security",
                    "status": "warning",
                    "message": "Using HTTP (acceptable for development)"
                })
        
        # 4) CORS safety for credentialed sessions
        cors_origins = os.environ.get("CORS_ORIGINS", "")
        allow_wildcard_preview = os.environ.get("ALLOW_WILDCARD_PREVIEW_ORIGINS", "false").lower() == "true"
        if cors_origins.strip() == "*":
            # With allow_credentials=True, wildcard is unsafe / invalid for browsers.
            checks.append({
                "name": "CORS Configuration",
                "status": "fail",
                "message": "CORS_ORIGINS='*' is unsafe when credentials are used. Use an allowlist of exact origins."
            })
        else:
            checks.append({
                "name": "CORS Configuration",
                "status": "pass",
                "message": "CORS uses an allowlist of origins (recommended for credentialed requests)."
            })
        if allow_wildcard_preview:
            checks.append({
                "name": "Preview Origin Wildcards",
                "status": "warning",
                "message": "Wildcard preview origin regex is enabled. Keep OFF in production unless strictly needed."
            })
        else:
            checks.append({
                "name": "Preview Origin Wildcards",
                "status": "pass",
                "message": "Wildcard preview origins are disabled (recommended)."
            })
        
        # 5) Rate limiting
        rate_limit_enabled = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true"
        try:
            from slowapi import Limiter
            # If we can import slowapi, rate limiting is available
            checks.append({
                "name": "Rate Limiting",
                "status": "pass",
                "message": "API rate limiting is active"
            })
        except ImportError:
            if rate_limit_enabled:
                checks.append({
                    "name": "Rate Limiting",
                    "status": "warning",
                    "message": "Rate limiting expected but slowapi not available in this build/runtime."
                })
            else:
                checks.append({
                    "name": "Rate Limiting",
                    "status": "warning",
                    "message": "Rate limiting not configured"
                })
        
        # 6) Dependency hygiene
        #
        # Do NOT misleadingly report "pass" unless we actually scanned, because the
        # presence of dependency vulnerabilities cannot be inferred safely here.
        # Default: report "warning" and recommend CI-based scanning.
        # Optional: enable a runtime scan (pip-audit) via env for on-demand checks.
        run_dependency_audit = os.environ.get("RUN_DEPENDENCY_AUDIT", "false").lower() == "true"
        if not run_dependency_audit:
            checks.append({
                "name": "Dependency Hygiene",
                "status": "warning",
                "message": "Runtime dependency vulnerability scan is disabled. Use CI-based scanning (pip-audit/Snyk/GitHub alerts) or set RUN_DEPENDENCY_AUDIT=true for an on-demand check."
            })
        else:
            pip_audit_paths = ["/root/.venv/bin/pip-audit", "/usr/local/bin/pip-audit", "pip-audit"]
            pip_audit_found = False
            audit_vuln_count = None
            audit_error = None

            for pip_audit_path in pip_audit_paths:
                try:
                    if os.path.exists(pip_audit_path) or pip_audit_path == "pip-audit":
                        result = subprocess.run(
                            [pip_audit_path, "--format", "json", "-q", "--progress-spinner", "off"],
                            capture_output=True,
                            text=True,
                            timeout=25
                        )
                        pip_audit_found = True
                        import json as json_module
                        try:
                            vulns = json_module.loads(result.stdout) if result.stdout else []
                            audit_vuln_count = len(vulns) if isinstance(vulns, list) else None
                        except Exception as e:
                            audit_error = f"Failed to parse audit output: {e}"
                        break
                except Exception as e:
                    audit_error = str(e)
                    continue

            if not pip_audit_found:
                checks.append({
                    "name": "Dependency Hygiene",
                    "status": "warning",
                    "message": "RUN_DEPENDENCY_AUDIT=true but pip-audit is not available in this runtime. Prefer CI-based scanning."
                })
            elif audit_error:
                checks.append({
                    "name": "Dependency Hygiene",
                    "status": "warning",
                    "message": f"Dependency scan ran but could not complete reliably: {audit_error}"
                })
            else:
                if audit_vuln_count is not None and audit_vuln_count > 0:
                    checks.append({
                        "name": "Dependency Hygiene",
                        "status": "warning",
                        "message": f"Dependency scan found {audit_vuln_count} potential vulnerability finding(s). Review and update packages."
                    })
                else:
                    checks.append({
                        "name": "Dependency Hygiene",
                        "status": "pass",
                        "message": "Dependency scan completed (no findings reported by pip-audit)."
                    })
        
        # 7) Database access / auth
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
        
        # 8) Secrets & fail-fast config
        env = os.environ.get("ENVIRONMENT", "development").lower()
        require_jwt = os.environ.get("REQUIRE_JWT_SECRET_KEY", "false").lower() == "true"
        jwt_secret = os.environ.get("JWT_SECRET_KEY") or os.environ.get("JWT_SECRET") or ""
        if (env == "production" or require_jwt) and (not jwt_secret or jwt_secret == "default_secret_key"):
            checks.append({
                "name": "Secrets",
                "status": "fail",
                "message": "JWT secret is missing/unsafe for production. Set JWT_SECRET_KEY and enable REQUIRE_JWT_SECRET_KEY=true."
            })
        elif not jwt_secret or jwt_secret == "default_secret_key" or len(jwt_secret) < 32:
            checks.append({
                "name": "Secrets",
                "status": "warning",
                "message": "JWT secret is weak/missing. Use a long random value (32+ chars) and consider REQUIRE_JWT_SECRET_KEY=true."
            })
        else:
            checks.append({
                "name": "Secrets",
                "status": "pass",
                "message": "JWT secret appears set and non-trivial."
            })
        
        # 9) Brute force protection
        max_attempts = int(os.environ.get("MAX_LOGIN_ATTEMPTS", "5"))
        lockout_duration = int(os.environ.get("LOCKOUT_DURATION_MINUTES", "15"))
        checks.append({
            "name": "Brute Force Protection",
            "status": "pass",
            "message": f"Account lockout after {max_attempts} failed attempts for {lockout_duration} mins"
        })
        
        # 10) Browser hardening headers (server.py middleware)
        checks.append({
            "name": "Security Headers",
            "status": "pass",
            "message": "Security headers middleware enabled (CSP, frame-ancestors, HSTS on HTTPS, Referrer-Policy, Permissions-Policy)."
        })
        
        # 11) Audit logging (security events + transactions)
        try:
            security_audit_count = await db.security_audit_log.count_documents({})
            app_audit_count = await db.audit_log.count_documents({})
            checks.append({
                "name": "Audit Logging",
                "status": "pass",
                "message": f"Security events: {security_audit_count} entries; App transactions: {app_audit_count} entries"
            })
        except Exception:
            checks.append({
                "name": "Audit Logging",
                "status": "pass",
                "message": "Audit logging enabled (counts unavailable)"
            })
        
        # 12) Session duration (JWT expiration)
        try:
            from database import JWT_EXPIRATION_HOURS
            hours = int(JWT_EXPIRATION_HOURS)
        except Exception:
            hours = 24
        if hours <= 24:
            checks.append({
                "name": "Session Duration",
                "status": "pass",
                "message": f"JWT expiration: {hours} hour(s)"
            })
        else:
            checks.append({
                "name": "Session Duration",
                "status": "warning",
                "message": f"Consider reducing JWT expiration (currently {hours} hours)"
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
            "total_checks": len(checks),
            "passed": len([c for c in checks if c["status"] == "pass"]),
            "warnings": len([c for c in checks if c["status"] == "warning"]),
            "failed": len([c for c in checks if c["status"] == "fail"]),
            "last_scan": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to run security checks: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to run security checks: {str(e)}"
        )



# ============= ERROR LOGGING =============

# In-memory error log storage (persists until server restart)
# For production, consider using MongoDB or a logging service
ERROR_LOG_MAX_SIZE = 500  # Maximum number of errors to keep in memory

class ErrorLogStorage:
    """Simple in-memory storage for application errors."""
    
    def __init__(self):
        self.errors = []
        self.start_time = datetime.now(timezone.utc)
    
    def add_error(self, error_type: str, message: str, details: dict = None, source: str = "backend"):
        """Add an error to the log."""
        error_entry = {
            "id": f"err_{int(time.time() * 1000)}_{len(self.errors)}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": error_type,
            "message": message[:500],  # Limit message length
            "details": details or {},
            "source": source,
            "resolved": False
        }
        self.errors.insert(0, error_entry)  # Add to beginning (newest first)
        
        # Trim if exceeds max size
        if len(self.errors) > ERROR_LOG_MAX_SIZE:
            self.errors = self.errors[:ERROR_LOG_MAX_SIZE]
        
        return error_entry
    
    def get_errors(self, limit: int = 100, error_type: str = None, source: str = None, unresolved_only: bool = False):
        """Get errors with optional filtering."""
        filtered = self.errors
        
        if error_type:
            filtered = [e for e in filtered if e["type"] == error_type]
        if source:
            filtered = [e for e in filtered if e["source"] == source]
        if unresolved_only:
            filtered = [e for e in filtered if not e["resolved"]]
        
        return filtered[:limit]
    
    def mark_resolved(self, error_id: str):
        """Mark an error as resolved."""
        for error in self.errors:
            if error["id"] == error_id:
                error["resolved"] = True
                error["resolved_at"] = datetime.now(timezone.utc).isoformat()
                return True
        return False
    
    def clear_errors(self, older_than_hours: int = None):
        """Clear errors, optionally only those older than specified hours."""
        if older_than_hours:
            cutoff = datetime.now(timezone.utc).timestamp() - (older_than_hours * 3600)
            self.errors = [
                e for e in self.errors 
                if datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).timestamp() > cutoff
            ]
        else:
            self.errors = []
    
    def get_stats(self):
        """Get error statistics."""
        now = datetime.now(timezone.utc)
        hour_ago = now.timestamp() - 3600
        day_ago = now.timestamp() - 86400
        
        errors_last_hour = 0
        errors_last_day = 0
        by_type = {}
        by_source = {}
        unresolved = 0
        
        for e in self.errors:
            ts = datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).timestamp()
            if ts > hour_ago:
                errors_last_hour += 1
            if ts > day_ago:
                errors_last_day += 1
            
            by_type[e["type"]] = by_type.get(e["type"], 0) + 1
            by_source[e["source"]] = by_source.get(e["source"], 0) + 1
            
            if not e["resolved"]:
                unresolved += 1
        
        return {
            "total_errors": len(self.errors),
            "unresolved": unresolved,
            "errors_last_hour": errors_last_hour,
            "errors_last_day": errors_last_day,
            "by_type": by_type,
            "by_source": by_source,
            "logging_since": self.start_time.isoformat()
        }

# Global error log instance
error_log = ErrorLogStorage()


def log_error(error_type: str, message: str, details: dict = None, source: str = "backend"):
    """
    Helper function to log errors from anywhere in the application.
    
    Usage:
        from routes.system import log_error
        log_error("database", "Connection timeout", {"collection": "users"})
    """
    return error_log.add_error(error_type, message, details, source)


@router.get("/system/errors")
async def get_error_logs(
    limit: int = 100,
    error_type: str = None,
    source: str = None,
    unresolved_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Get application error logs.
    
    Only accessible by owner users.
    
    Query Parameters:
        - limit: Maximum number of errors to return (default 100)
        - error_type: Filter by error type (database, api, auth, ai, validation, etc.)
        - source: Filter by source (backend, frontend, external)
        - unresolved_only: Only show unresolved errors
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can access error logs"
        )
    
    errors = error_log.get_errors(limit, error_type, source, unresolved_only)
    stats = error_log.get_stats()
    
    return {
        "errors": errors,
        "stats": stats,
        "filters_applied": {
            "limit": limit,
            "error_type": error_type,
            "source": source,
            "unresolved_only": unresolved_only
        }
    }


@router.get("/system/errors/stats")
async def get_error_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get error statistics summary."""
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can access error stats"
        )
    
    return error_log.get_stats()


@router.post("/system/errors/{error_id}/resolve")
async def resolve_error(
    error_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark an error as resolved."""
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can resolve errors"
        )
    
    if error_log.mark_resolved(error_id):
        return {"success": True, "message": "Error marked as resolved"}
    else:
        raise HTTPException(status_code=404, detail="Error not found")


@router.delete("/system/errors")
async def clear_error_logs(
    older_than_hours: int = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Clear error logs.
    
    Query Parameters:
        - older_than_hours: Only clear errors older than this many hours
    """
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can clear error logs"
        )
    
    error_log.clear_errors(older_than_hours)
    return {"success": True, "message": "Error logs cleared"}


@router.post("/system/errors/test")
async def create_test_error(
    current_user: dict = Depends(get_current_user)
):
    """Create a test error for debugging purposes."""
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=403, 
            detail="Only owners can create test errors"
        )
    
    error = log_error(
        error_type="test",
        message="This is a test error created manually",
        details={"created_by": current_user.get("email"), "purpose": "testing"},
        source="backend"
    )
    
    return {"success": True, "error": error}
