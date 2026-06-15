"""Graph coverage report script tests."""
import importlib.util
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
SCRIPT = BACKEND / "scripts" / "graph_coverage_report.py"


def _load_report_module():
    spec = importlib.util.spec_from_file_location("graph_coverage_report", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def test_graph_coverage_report_all_handlers_registered():
    mod = _load_report_module()
    report = mod.build_report()
    assert report["missing_handlers"] == []
    assert report["coverage_pct"] == 100.0
