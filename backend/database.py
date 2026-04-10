"""
Centralized database connection and service initialization.
Single source of truth for all shared state.
Supports multiple database environments (Production, UAT).
"""
import os
import logging
import asyncio
from pathlib import Path
from contextvars import ContextVar
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logger
logger = logging.getLogger(__name__)

# MongoDB connection optimized for Atlas free/shared tier
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
    logger.error("MONGO_URL environment variable not set!")
    raise ValueError("MONGO_URL environment variable is required")

# Database configuration - supports multiple environments
DEFAULT_DB_NAME = os.environ.get('DB_NAME', 'assetiq')
AVAILABLE_DATABASES = {
    "production": {
        "name": "assetiq",
        "label": "Production",
        "description": "Live production database"
    },
    "uat": {
        "name": "assetiq-UAT",
        "label": "UAT",
        "description": "User Acceptance Testing database"
    }
}

# Context variable for per-request database name
_request_db_name: ContextVar[str] = ContextVar('request_db_name', default=DEFAULT_DB_NAME)

# Current active database (can be changed at runtime for specific requests)
_current_db_name = DEFAULT_DB_NAME
logger.info(f"Initializing MongoDB connection to database: {_current_db_name}")

client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=10,  # Reduced for free/shared tier
    minPoolSize=2,   # Reduced minimum connections
    maxIdleTimeMS=45000,  # Close idle connections after 45 seconds
    serverSelectionTimeoutMS=5000,  # 5 second timeout for server selection (reduced)
    connectTimeoutMS=5000,  # 5 second connection timeout (reduced)
    socketTimeoutMS=30000,  # 30 second socket timeout (reduced)
    retryWrites=True,  # Retry failed writes
    retryReads=True,  # Retry failed reads
    waitQueueTimeoutMS=5000,  # Wait up to 5s for a connection from pool (reduced)
)

# Default database reference (static - for initialization)
_default_db = client[_current_db_name]

class CollectionProxy:
    """
    A proxy for a MongoDB collection that dynamically resolves to the current request's database.
    This allows services initialized at startup to work with per-request database switching.
    """
    def __init__(self, collection_name: str):
        self._collection_name = collection_name
    
    def _get_collection(self):
        """Get the actual collection from the current request's database."""
        current_db = get_request_db()
        return current_db[self._collection_name]
    
    def __getattr__(self, name):
        """Proxy all attribute access to the actual collection."""
        return getattr(self._get_collection(), name)
    
    def __repr__(self):
        return f"CollectionProxy({self._collection_name})"
    
    @property
    def name(self):
        return self._collection_name

class DatabaseProxy:
    """
    A proxy that dynamically returns the correct database based on request context.
    This allows `db.collection.find()` to work transparently with multi-database support.
    """
    def __getattr__(self, name):
        """Proxy attribute access to the current context's database."""
        current_db = get_request_db()
        return getattr(current_db, name)
    
    def __getitem__(self, name):
        """Return a CollectionProxy that resolves dynamically per-request."""
        return CollectionProxy(name)
    
    @property
    def name(self):
        """Return the current database name."""
        return get_current_db_name()

# Create the proxy instance - this is what routes will import as `db`
db = DatabaseProxy()

def set_request_db(db_name: str):
    """Set the database name for the current request context."""
    _request_db_name.set(db_name)

def get_request_db():
    """Get the database reference for the current request context."""
    db_name = _request_db_name.get()
    return client[db_name]

def get_database(db_name: str = None):
    """Get a database reference by name. Uses request context if no name provided."""
    if db_name is None:
        # Use request-scoped database if set, otherwise default
        return get_request_db()
    return client[db_name]

def get_available_databases():
    """Get list of available database environments."""
    return AVAILABLE_DATABASES

def get_current_db_name():
    """Get the current database name (from request context or default)."""
    return _request_db_name.get()

def get_db_name_for_environment(env: str) -> str:
    """Get database name for an environment key."""
    if env in AVAILABLE_DATABASES:
        return AVAILABLE_DATABASES[env]["name"]
    return DEFAULT_DB_NAME


async def verify_database_connection(max_retries: int = 3, timeout: float = 5.0) -> bool:
    """Verify database connection with retry logic."""
    for attempt in range(max_retries):
        try:
            # Test connection with timeout
            await asyncio.wait_for(db.command('ping'), timeout=timeout)
            logger.info(f"MongoDB connected successfully (attempt {attempt + 1})")
            return True
        except asyncio.TimeoutError:
            logger.warning(f"MongoDB connection timeout (attempt {attempt + 1}/{max_retries})")
        except Exception as e:
            logger.warning(f"MongoDB connection failed (attempt {attempt + 1}/{max_retries}): {str(e)}")
        
        if attempt < max_retries - 1:
            await asyncio.sleep(1)  # Wait before retry
    
    logger.error("Failed to connect to MongoDB after all retries")
    return False


async def safe_db_query(query_func, fallback_value=None, timeout: float = 5.0):
    """Execute a database query with timeout and error handling."""
    try:
        result = await asyncio.wait_for(query_func(), timeout=timeout)
        return result
    except asyncio.TimeoutError:
        logger.error(f"Database query timeout after {timeout}s")
        return fallback_value
    except Exception as e:
        logger.error(f"Database query error: {str(e)}")
        return fallback_value

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'default_secret_key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# LLM Config
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# ============= SERVICE INITIALIZATION =============

from services.failure_modes_service import FailureModesService, find_matching_failure_modes_db
from services.efm_service import EFMService
from services.task_service import TaskService
from services.form_service import FormService
from services.observation_service import ObservationService
from services.decision_engine import DecisionEngine
from services.analytics_service import AnalyticsService
from services.rbac_service import RBACService
from services.installation_filter_service import InstallationFilterService
from services.ai_usage_service import AIUsageTracker

failure_modes_service = FailureModesService(db)
efm_service = EFMService(db)
task_service = TaskService(db)
form_service = FormService(db)
observation_service = ObservationService(db)
decision_engine = DecisionEngine(db)
analytics_service = AnalyticsService(db)
rbac_service = RBACService(db)
installation_filter = InstallationFilterService(db)
ai_usage_tracker = AIUsageTracker(db)
