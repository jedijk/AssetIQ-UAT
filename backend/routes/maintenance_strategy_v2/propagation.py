"""Backward-compatible re-exports — logic lives in services."""
from services.maintenance_strategy_propagation import *  # noqa: F401,F403
from services.strategy_propagation import resync_programs_with_strategy as _resync_programs_with_strategy
