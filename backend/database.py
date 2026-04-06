"""
Centralized database connection and service initialization.
Single source of truth for all shared state.
"""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection optimized for Atlas free/shared tier
# Free tier (M0): 500 max connections shared
# Shared tier (M2/M5): Limited connections
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=10,  # Reduced for free/shared tier (was 50)
    minPoolSize=2,   # Reduced minimum connections (was 10)
    maxIdleTimeMS=45000,  # Close idle connections after 45 seconds
    serverSelectionTimeoutMS=15000,  # 15 second timeout for server selection
    connectTimeoutMS=15000,  # 15 second connection timeout
    socketTimeoutMS=45000,  # 45 second socket timeout
    retryWrites=True,  # Retry failed writes
    retryReads=True,  # Retry failed reads
    waitQueueTimeoutMS=10000,  # Wait up to 10s for a connection from pool
)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'default_secret_key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# LLM Config
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Logger
logger = logging.getLogger(__name__)

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
