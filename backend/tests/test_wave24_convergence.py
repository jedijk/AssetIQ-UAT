"""Wave 24 — chat routes extraction."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_chat_routes_are_green():
    from architecture.convergence_registry import GREEN_ROUTES

    rel = "routes/chat.py"
    assert rel in GREEN_ROUTES
    text = (BACKEND_ROOT / rel).read_text(encoding="utf-8")
    assert "from database import db" not in text


def test_routes_delegate_to_service():
    text = (BACKEND_ROOT / "routes/chat.py").read_text(encoding="utf-8")
    assert "chat_routes_service" in text
    assert len(text.splitlines()) < 90


def test_service_exists():
    from services import chat_routes_service as svc

    assert callable(svc.send_chat_message)
    assert callable(svc._core_chat_process)
    assert callable(svc.get_chat_history)
    assert callable(svc.voice_send)


def test_routes_reexport_test_helpers():
    from routes.chat import _core_chat_process, _read_conv, _threat_to_response

    assert callable(_core_chat_process)
    assert callable(_read_conv)
    assert callable(_threat_to_response)
