"""Visual Management Studio — Pydantic models and defaults."""
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class BoardStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class BoardType(str, Enum):
    RELIABILITY = "reliability"
    MAINTENANCE = "maintenance"
    OPERATIONS = "operations"
    EXECUTIVE = "executive"
    CUSTOM = "custom"


class WidgetType(str, Enum):
    KPI_CARD = "kpi_card"
    STATUS_INDICATOR = "status_indicator"
    OBSERVATION_LIST = "observation_list"
    EXPOSURE_WATERFALL = "exposure_waterfall"
    ACTION_QUEUE = "action_queue"
    TREND_CHART = "trend_chart"
    PRODUCTION_KPI = "production_kpi"
    MOONEY_CHART = "mooney_chart"
    FORM_SUBMISSIONS_LIST = "form_submissions_list"
    RISK_OBSERVATION_LIST = "risk_observation_list"


class ReliabilityStatus(str, Enum):
    GREEN = "GREEN"
    AMBER = "AMBER"
    RED = "RED"


class WidgetPosition(BaseModel):
    x: int = 0
    y: int = 0
    w: int = 3
    h: int = 2


class WidgetConfig(BaseModel):
    metric: Optional[str] = None
    limit: int = 10
    chart_metric: Optional[str] = None
    days: int = 30
    production_metric: Optional[str] = None
    period: str = "today"
    queue_mode: str = "open"
    font_size: str = "md"  # xs | sm | md | lg | xl


class VisualBoardWidget(BaseModel):
    id: str
    type: WidgetType
    title: str
    config: WidgetConfig = Field(default_factory=WidgetConfig)
    position: WidgetPosition = Field(default_factory=WidgetPosition)


class VisualBoardLayout(BaseModel):
    columns: int = 12
    rows: int = 6


def default_tyromer_operations_layout() -> VisualBoardLayout:
    return VisualBoardLayout(columns=12, rows=12)


class CreateBoardRequest(BaseModel):
    name: str
    description: Optional[str] = None
    board_type: BoardType = BoardType.RELIABILITY
    theme: str = "dark"
    refresh_interval_seconds: int = 30
    plant: Optional[str] = None
    area: Optional[str] = None


class UpdateBoardRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    board_type: Optional[BoardType] = None
    theme: Optional[str] = None
    refresh_interval_seconds: Optional[int] = None
    plant: Optional[str] = None
    area: Optional[str] = None
    widgets: Optional[List[VisualBoardWidget]] = None
    layout: Optional[VisualBoardLayout] = None


class PublishBoardRequest(BaseModel):
    screen_name: Optional[str] = None


class RotateTokenRequest(BaseModel):
    screen_name: Optional[str] = None
    token_id: Optional[str] = None


class CreateTokenRequest(BaseModel):
    screen_name: Optional[str] = None
    version: Optional[int] = None


class TokenSummary(BaseModel):
    id: str
    board_id: str
    screen_name: Optional[str] = None
    is_active: bool = True
    version: int = 1
    created_at: Optional[str] = None
    last_used_at: Optional[str] = None


class CreateTokenResponse(BaseModel):
    token_id: str
    board_id: str
    version: int
    token: str
    url: str
    screen_name: Optional[str] = None


class RollbackVersionRequest(BaseModel):
    version: int


class UpdateScreenRequest(BaseModel):
    screen_name: Optional[str] = None
    location: Optional[str] = None
    device_id: Optional[str] = None
    token_id: Optional[str] = None


class ScreenResponse(BaseModel):
    id: str
    board_id: str
    token_id: Optional[str] = None
    screen_name: str
    location: Optional[str] = None
    device_id: Optional[str] = None
    last_seen: Optional[str] = None
    status: str = "inactive"
    board_name: Optional[str] = None


class CreateTemplateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    board_type: BoardType = BoardType.RELIABILITY
    widgets: Optional[List[VisualBoardWidget]] = None
    layout: Optional[VisualBoardLayout] = None
    theme: str = "dark"


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    board_type: Optional[BoardType] = None
    widgets: Optional[List[VisualBoardWidget]] = None
    layout: Optional[VisualBoardLayout] = None
    theme: Optional[str] = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    board_type: BoardType
    widgets: List[VisualBoardWidget]
    layout: VisualBoardLayout
    theme: str = "dark"
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CreateBoardFromTemplateRequest(BaseModel):
    name: str
    template_id: str


class CreateScreenRequest(BaseModel):
    screen_name: str
    location: Optional[str] = None
    device_id: Optional[str] = None
    token_id: Optional[str] = None


class PublishBoardResponse(BaseModel):
    board_id: str
    version: int
    token: str
    url: str
    token_id: Optional[str] = None
    qr_code_data_url: Optional[str] = None


class VisualBoardResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: BoardStatus
    board_type: BoardType
    version: int
    widgets: List[VisualBoardWidget]
    layout: VisualBoardLayout
    theme: str = "dark"
    refresh_interval_seconds: int = 30
    plant: Optional[str] = None
    area: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    published_at: Optional[str] = None
    has_active_token: bool = False


class PublicLayoutResponse(BaseModel):
    board_id: str
    name: str
    version: int
    layout: VisualBoardLayout
    widgets: List[VisualBoardWidget]
    refresh_interval_seconds: int = 30
    theme: str = "dark"


class StatusIndicatorPayload(BaseModel):
    status: ReliabilityStatus
    reason: str
    critical_observations: int = 0
    critical_overdue_actions: int = 0


class PublicBoardDataResponse(BaseModel):
    board_id: str
    version: int
    last_updated: str
    status: StatusIndicatorPayload
    widgets: Dict[str, Any]


class HeartbeatRequest(BaseModel):
    screen_name: Optional[str] = None
    device_id: Optional[str] = None
    user_agent: Optional[str] = None
    fullscreen: bool = False


def default_reliability_widgets() -> List[VisualBoardWidget]:
    return [
        VisualBoardWidget(
            id="w_status",
            type=WidgetType.STATUS_INDICATOR,
            title="Reliability Status",
            position=WidgetPosition(x=0, y=0, w=3, h=3),
        ),
        VisualBoardWidget(
            id="w_active_exposure",
            type=WidgetType.KPI_CARD,
            title="Active Exposure",
            config=WidgetConfig(metric="active_threat_exposure"),
            position=WidgetPosition(x=3, y=0, w=3, h=2),
        ),
        VisualBoardWidget(
            id="w_pm_compliance",
            type=WidgetType.KPI_CARD,
            title="PM Compliance",
            config=WidgetConfig(metric="pm_compliance"),
            position=WidgetPosition(x=6, y=0, w=3, h=2),
        ),
        VisualBoardWidget(
            id="w_critical",
            type=WidgetType.KPI_CARD,
            title="Critical Risks",
            config=WidgetConfig(metric="critical_active_exposure"),
            position=WidgetPosition(x=9, y=0, w=3, h=2),
        ),
        VisualBoardWidget(
            id="w_waterfall",
            type=WidgetType.EXPOSURE_WATERFALL,
            title="Exposure Waterfall",
            position=WidgetPosition(x=0, y=3, w=6, h=3),
        ),
        VisualBoardWidget(
            id="w_observations",
            type=WidgetType.OBSERVATION_LIST,
            title="Open Observations",
            config=WidgetConfig(limit=8),
            position=WidgetPosition(x=6, y=2, w=6, h=4),
        ),
        VisualBoardWidget(
            id="w_actions",
            type=WidgetType.ACTION_QUEUE,
            title="Action Queue",
            config=WidgetConfig(limit=8),
            position=WidgetPosition(x=0, y=6, w=6, h=3),
        ),
    ]


def default_maintenance_widgets() -> List[VisualBoardWidget]:
    return [
        VisualBoardWidget(
            id="w_pm_compliance",
            type=WidgetType.KPI_CARD,
            title="PM Compliance",
            config=WidgetConfig(metric="pm_compliance"),
            position=WidgetPosition(x=0, y=0, w=4, h=2),
        ),
        VisualBoardWidget(
            id="w_actions",
            type=WidgetType.ACTION_QUEUE,
            title="Overdue Tasks",
            config=WidgetConfig(limit=10),
            position=WidgetPosition(x=4, y=0, w=8, h=4),
        ),
        VisualBoardWidget(
            id="w_trend",
            type=WidgetType.TREND_CHART,
            title="PM Compliance Trend",
            config=WidgetConfig(chart_metric="pm_compliance", days=30),
            position=WidgetPosition(x=0, y=2, w=4, h=3),
        ),
    ]


def default_executive_widgets() -> List[VisualBoardWidget]:
    return [
        VisualBoardWidget(
            id="w_waterfall",
            type=WidgetType.EXPOSURE_WATERFALL,
            title="Exposure Waterfall",
            position=WidgetPosition(x=0, y=0, w=8, h=4),
        ),
        VisualBoardWidget(
            id="w_active_exposure",
            type=WidgetType.KPI_CARD,
            title="Active Exposure",
            config=WidgetConfig(metric="active_threat_exposure"),
            position=WidgetPosition(x=8, y=0, w=4, h=2),
        ),
        VisualBoardWidget(
            id="w_trend",
            type=WidgetType.TREND_CHART,
            title="Exposure Trend",
            config=WidgetConfig(chart_metric="active_threat_exposure", days=30),
            position=WidgetPosition(x=8, y=2, w=4, h=2),
        ),
    ]


def default_tyromer_operations_widgets() -> List[VisualBoardWidget]:
    """Layout matching the Tyromer production + reliability operations dashboard."""
    return [
        VisualBoardWidget(
            id="w_total_input",
            type=WidgetType.PRODUCTION_KPI,
            title="Total Input",
            config=WidgetConfig(production_metric="total_input"),
            position=WidgetPosition(x=0, y=0, w=2, h=2),
        ),
        VisualBoardWidget(
            id="w_waste",
            type=WidgetType.PRODUCTION_KPI,
            title="Waste",
            config=WidgetConfig(production_metric="waste"),
            position=WidgetPosition(x=2, y=0, w=2, h=2),
        ),
        VisualBoardWidget(
            id="w_yield",
            type=WidgetType.PRODUCTION_KPI,
            title="Yield",
            config=WidgetConfig(production_metric="yield"),
            position=WidgetPosition(x=4, y=0, w=2, h=2),
        ),
        VisualBoardWidget(
            id="w_avg_mooney",
            type=WidgetType.PRODUCTION_KPI,
            title="Avg Mooney",
            config=WidgetConfig(production_metric="avg_mooney"),
            position=WidgetPosition(x=6, y=0, w=2, h=2),
        ),
        VisualBoardWidget(
            id="w_rsd",
            type=WidgetType.PRODUCTION_KPI,
            title="RSD",
            config=WidgetConfig(production_metric="rsd"),
            position=WidgetPosition(x=8, y=0, w=2, h=2),
        ),
        VisualBoardWidget(
            id="w_runtime",
            type=WidgetType.PRODUCTION_KPI,
            title="Runtime",
            config=WidgetConfig(production_metric="runtime"),
            position=WidgetPosition(x=10, y=0, w=2, h=2),
        ),
        VisualBoardWidget(
            id="w_active_exposure",
            type=WidgetType.KPI_CARD,
            title="Active Exposure",
            config=WidgetConfig(metric="active_threat_exposure"),
            position=WidgetPosition(x=0, y=2, w=4, h=2),
        ),
        VisualBoardWidget(
            id="w_controlled_exposure",
            type=WidgetType.KPI_CARD,
            title="Controlled Exposure",
            config=WidgetConfig(metric="critical_active_exposure"),
            position=WidgetPosition(x=4, y=2, w=4, h=2),
        ),
        VisualBoardWidget(
            id="w_page_views",
            type=WidgetType.KPI_CARD,
            title="Page Views",
            config=WidgetConfig(metric="page_views"),
            position=WidgetPosition(x=8, y=2, w=4, h=2),
        ),
        VisualBoardWidget(
            id="w_mooney_chart",
            type=WidgetType.MOONEY_CHART,
            title="Mooney Viscosity",
            config=WidgetConfig(period="today"),
            position=WidgetPosition(x=0, y=4, w=12, h=4),
        ),
        VisualBoardWidget(
            id="w_form_submissions",
            type=WidgetType.FORM_SUBMISSIONS_LIST,
            title="Recent Form Submissions",
            config=WidgetConfig(limit=8),
            position=WidgetPosition(x=0, y=8, w=4, h=4),
        ),
        VisualBoardWidget(
            id="w_recent_actions",
            type=WidgetType.ACTION_QUEUE,
            title="Recent Actions",
            config=WidgetConfig(limit=8, queue_mode="recent"),
            position=WidgetPosition(x=4, y=8, w=4, h=4),
        ),
        VisualBoardWidget(
            id="w_top_risk",
            type=WidgetType.RISK_OBSERVATION_LIST,
            title="Top 10 Highest Risk Observations",
            config=WidgetConfig(limit=10),
            position=WidgetPosition(x=8, y=8, w=4, h=4),
        ),
    ]
