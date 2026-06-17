"""Default widgets, layout, and theme for visual management boards."""
from __future__ import annotations

from models.visual_board import (
    BoardType,
    VisualBoardLayout,
    VisualBoardWidget,
    default_executive_widgets,
    default_maintenance_widgets,
    default_reliability_widgets,
    default_tyromer_operations_layout,
    default_tyromer_operations_widgets,
)
from typing import List


def default_widgets(board_type: BoardType) -> List[VisualBoardWidget]:
    if board_type == BoardType.RELIABILITY:
        return default_reliability_widgets()
    if board_type == BoardType.MAINTENANCE:
        return default_maintenance_widgets()
    if board_type == BoardType.EXECUTIVE:
        return default_executive_widgets()
    if board_type == BoardType.OPERATIONS:
        return default_tyromer_operations_widgets()
    return []


def default_layout(board_type: BoardType) -> VisualBoardLayout:
    if board_type == BoardType.OPERATIONS:
        return default_tyromer_operations_layout()
    return VisualBoardLayout()


def default_theme(board_type: BoardType, requested: str = "dark") -> str:
    if board_type == BoardType.OPERATIONS and requested == "dark":
        return "light"
    return requested
