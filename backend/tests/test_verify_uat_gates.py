"""Tests for scripts/verify_uat_gates.py."""
import importlib.util
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "verify_uat_gates.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("verify_uat_gates", SCRIPT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_all_gates_pass_exit_0():
    mod = _load_module()
    with patch.object(Path, "is_file", return_value=True), patch(
        "subprocess.run",
        return_value=MagicMock(returncode=0),
    ) as mock_run:
        assert mod.main() == 0
        assert mock_run.call_count == len(mod.GATES)


def test_one_gate_fails_exit_2():
    mod = _load_module()
    with patch.object(Path, "is_file", return_value=True):
        with patch(
            "subprocess.run",
            side_effect=[
                MagicMock(returncode=0),
                MagicMock(returncode=0),
                MagicMock(returncode=2),
            ],
        ):
            assert mod.main() == 2


def test_gate_config_error_exit_1():
    mod = _load_module()
    with patch.object(Path, "is_file", return_value=True):
        with patch(
            "subprocess.run",
            return_value=MagicMock(returncode=1),
        ):
            assert mod.main() == 1


def test_missing_script_skipped_exit_0(capsys):
    mod = _load_module()
    with patch.object(Path, "is_file", return_value=False):
        assert mod.main() == 0
    err = capsys.readouterr().err
    for name, _ in mod.GATES:
        assert f"SKIP {name}" in err
