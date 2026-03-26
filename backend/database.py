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

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
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

failure_modes_service = FailureModesService(db)
efm_service = EFMService(db)
task_service = TaskService(db)
form_service = FormService(db)
observation_service = ObservationService(db)
decision_engine = DecisionEngine(db)
analytics_service = AnalyticsService(db)
rbac_service = RBACService(db)
