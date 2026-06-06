"""External background worker configuration."""
from services.worker_config import use_external_background_worker


def test_external_worker_disabled_by_default(monkeypatch):
    monkeypatch.delenv("USE_EXTERNAL_BACKGROUND_WORKER", raising=False)
    assert use_external_background_worker() is False


def test_external_worker_enabled(monkeypatch):
    monkeypatch.setenv("USE_EXTERNAL_BACKGROUND_WORKER", "true")
    assert use_external_background_worker() is True
