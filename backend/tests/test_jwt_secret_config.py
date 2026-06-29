"""JWT secret startup policy — fail closed outside local/dev/test."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _import_database(env: dict) -> subprocess.CompletedProcess:
    base = {k: v for k, v in os.environ.items() if k != "JWT_SECRET_KEY"}
    base.update(env)
    base.setdefault("MONGO_URL", "mongodb://localhost:27017/jwt-config-test")
    base.setdefault("DB_NAME", "jwt-config-test")
    return subprocess.run(
        [
            sys.executable,
            "-c",
            "import database; print(database.JWT_SECRET[:8])",
        ],
        cwd=str(BACKEND_ROOT),
        env=base,
        capture_output=True,
        text=True,
    )


def test_jwt_fallback_allowed_for_local_development():
    for environment in ("local", "development", "dev"):
        result = _import_database(
            {
                "ENVIRONMENT": environment,
            }
        )
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip().startswith("default_")


def test_jwt_fallback_allowed_for_test_environment():
    result = _import_database({"ENVIRONMENT": "test"})
    assert result.returncode == 0, result.stderr


def test_jwt_required_for_uat_staging_production():
    for environment in ("uat", "staging", "production"):
        child_env = {
            k: v for k, v in os.environ.items() if k != "JWT_SECRET_KEY"
        }
        child_env.update(
            {
                "MONGO_URL": "mongodb://localhost:27017/jwt-config-test",
                "DB_NAME": "jwt-config-test",
                "ENVIRONMENT": environment,
            }
        )
        result = subprocess.run(
            [sys.executable, "-c", "import database"],
            cwd=str(BACKEND_ROOT),
            env=child_env,
            capture_output=True,
            text=True,
        )
        assert result.returncode != 0, f"{environment} should refuse startup without JWT_SECRET_KEY"
        combined = (result.stderr or "") + (result.stdout or "")
        assert "JWT_SECRET_KEY" in combined


def test_jwt_secret_accepted_for_production():
    result = _import_database(
        {
            "ENVIRONMENT": "production",
            "JWT_SECRET_KEY": "x" * 48,
        }
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "xxxxxxxx"


def test_jwt_secret_rejects_short_value_for_uat():
    result = _import_database(
        {
            "ENVIRONMENT": "uat",
            "JWT_SECRET_KEY": "too-short",
        }
    )
    assert result.returncode != 0, result.stderr
    combined = (result.stderr or "") + (result.stdout or "")
    assert "32" in combined
