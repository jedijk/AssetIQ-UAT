"""AI entry point report script tests."""
import importlib.util
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
SCRIPT = BACKEND / "scripts" / "ai_entry_point_report.py"


def _load_report_module():
    spec = importlib.util.spec_from_file_location("ai_entry_point_report", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def test_ai_entry_point_report_no_new_violations():
    mod = _load_report_module()
    report = mod.build_report()
    assert report["violations"] == []
    assert "services/ai_gateway.py" in report["allowlisted"]
