"""Production vs UAT database names must stay distinct when DB_NAME defaults to UAT."""
import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_production_target_ignores_db_name_on_uat_host():
    """UAT deployments set DB_NAME=assetiq-UAT; production switch must still use assetiq."""
    env = {
        **os.environ,
        "MONGO_URL": os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
        "DB_NAME": "assetiq-UAT",
    }
    env.pop("PRODUCTION_DB_NAME", None)
    env.pop("UAT_DB_NAME", None)
    script = """
from database import AVAILABLE_DATABASES, DEFAULT_DB_NAME, get_db_name_for_environment
assert DEFAULT_DB_NAME == "assetiq-UAT"
assert get_db_name_for_environment("production") == "assetiq"
assert get_db_name_for_environment("uat") == "assetiq-UAT"
assert AVAILABLE_DATABASES["production"]["name"] != AVAILABLE_DATABASES["uat"]["name"]
"""
    subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(BACKEND_ROOT),
        env=env,
        check=True,
    )


def test_ci_default_db_name_is_process_env_not_production_target():
    """CI sets DB_NAME=test; process default must stay test while production switch targets assetiq."""
    env = {
        **os.environ,
        "MONGO_URL": os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
        "DB_NAME": "test",
    }
    env.pop("PRODUCTION_DB_NAME", None)
    script = """
from database import DEFAULT_DB_NAME, get_db_name_for_environment
assert DEFAULT_DB_NAME == "test"
assert get_db_name_for_environment("production") == "assetiq"
"""
    subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(BACKEND_ROOT),
        env=env,
        check=True,
    )
