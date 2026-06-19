/** Visual Management Studio — board layout helpers. */
import { DEFAULT_BOARD_HEADER, normalizeBoardHeader } from "./boardHeaderConfig";

export { DEFAULT_BOARD_HEADER, normalizeBoardHeader };
export const FINE_GRID_COLUMNS = 24;
export const LEGACY_GRID_COLUMNS = 12;
export const DEFAULT_FINE_LAYOUT = { columns: FINE_GRID_COLUMNS, rows: 16 };

export const CANVAS_PREVIEW_SIZES = {
  "tv-exact": "h-full w-full min-h-0",
  desktop: "w-full max-w-6xl aspect-video",
  tablet: "w-full max-w-3xl aspect-[4/3]",
  "tv-55": "w-full max-w-5xl aspect-video",
  "tv-75": "w-full max-w-6xl aspect-video",
  "tv-98": "w-full max-w-7xl aspect-video",
  fullscreen: "h-full w-full min-h-0",
};

export function getCanvasSizeClass(previewSize = "desktop") {
  return CANVAS_PREVIEW_SIZES[previewSize] || CANVAS_PREVIEW_SIZES.desktop;
}

/** Normalize stored board layout for canvas rendering (editor, preview, kiosk). */
export function normalizeBoardForCanvas(board) {
  if (!board) {
    return {
      layout: DEFAULT_FINE_LAYOUT,
      widgets: [],
      theme: "dark",
      header: { ...DEFAULT_BOARD_HEADER },
    };
  }
  const upgraded = upgradeToFineGrid(board.layout, board.widgets || []);
  return {
    layout: upgraded.layout,
    widgets: upgraded.widgets,
    theme: board.theme || "dark",
    header: normalizeBoardHeader(board.header),
  };
}

export function readBoardDraft(boardId) {
  if (!boardId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`vmb-board-draft:${boardId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeBoardDraft(boardId, draft) {
  if (!boardId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`vmb-board-draft:${boardId}`, JSON.stringify(draft));
  } catch {
    /* ignore quota errors */
  }
}

export function clearBoardDraft(boardId) {
  if (!boardId || typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(`vmb-board-draft:${boardId}`);
}

export function isLegacyLayout(layout) {
  const cols = layout?.columns ?? LEGACY_GRID_COLUMNS;
  return cols < FINE_GRID_COLUMNS;
}

export function scalePosition(pos, factor) {
  const p = pos || {};
  return {
    x: Math.round((p.x || 0) * factor),
    y: Math.round((p.y || 0) * factor),
    w: Math.max(1, Math.round((p.w || 3) * factor)),
    h: Math.max(1, Math.round((p.h || 2) * factor)),
  };
}

/** Upgrade 12-col (or smaller) boards to 24-col fine grid for editor placement. */
export function upgradeToFineGrid(layout, widgets) {
  const cols = layout?.columns ?? LEGACY_GRID_COLUMNS;
  if (cols >= FINE_GRID_COLUMNS) {
    return {
      layout: layout || DEFAULT_FINE_LAYOUT,
      widgets: widgets || [],
    };
  }
  const factor = FINE_GRID_COLUMNS / cols;
  const rows = layout?.rows ?? 6;
  return {
    layout: {
      columns: FINE_GRID_COLUMNS,
      rows: Math.max(8, Math.round(rows * factor)),
    },
    widgets: (widgets || []).map((w) => ({
      ...w,
      position: scalePosition(w.position, factor),
    })),
  };
}

export function clampWidgetPosition(position, layout) {
  const cols = layout?.columns ?? FINE_GRID_COLUMNS;
  const rows = layout?.rows ?? 16;
  const w = Math.max(1, Math.min(cols, position?.w ?? 6));
  const h = Math.max(1, Math.min(rows, position?.h ?? 4));
  return {
    x: Math.max(0, Math.min(cols - w, position?.x ?? 0)),
    y: Math.max(0, Math.min(rows - h, position?.y ?? 0)),
    w,
    h,
  };
}

export function computeGridCellSize(gridEl, layout) {
  if (!gridEl) {
    return { colWidth: 36, rowHeight: 28, gap: 8 };
  }
  const cols = layout?.columns ?? FINE_GRID_COLUMNS;
  const rows = layout?.rows ?? 16;
  const style = getComputedStyle(gridEl);
  const gap = parseFloat(style.rowGap) || parseFloat(style.gap) || 8;
  const padX =
    parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0);
  const padY =
    parseFloat(style.paddingTop || 0) + parseFloat(style.paddingBottom || 0);
  const rect = gridEl.getBoundingClientRect();
  const colWidth = (rect.width - padX - gap * Math.max(0, cols - 1)) / cols;
  const rowHeight = (rect.height - padY - gap * Math.max(0, rows - 1)) / rows;
  return {
    colWidth: Math.max(8, colWidth),
    rowHeight: Math.max(8, rowHeight),
    gap,
  };
}

export function pixelDeltaToGridSteps(deltaX, deltaY, metrics) {
  const stepX = metrics.colWidth + metrics.gap;
  const stepY = metrics.rowHeight + metrics.gap;
  return {
    dx: Math.round(deltaX / stepX),
    dy: Math.round(deltaY / stepY),
  };
}

export function accumulateResizeSteps(pixelDx, pixelDy, metrics, accum) {
  const next = { dx: accum.dx + pixelDx, dy: accum.dy + pixelDy };
  const stepX = metrics.colWidth + metrics.gap;
  const stepY = metrics.rowHeight + metrics.gap;
  const dw = Math.trunc(next.dx / stepX);
  const dh = Math.trunc(next.dy / stepY);
  return {
    dw,
    dh,
    remainder: {
      dx: next.dx - dw * stepX,
      dy: next.dy - dh * stepY,
    },
  };
}

/** Stable key to match widget payloads when draft ids differ from saved board. */
export function widgetDataSignature(widget) {
  if (!widget) return "";
  const config = widget.config || {};
  const type = widget.type || "";
  if (type === "kpi_card") return `kpi:${config.metric || ""}`;
  if (type === "production_kpi") {
    return `prod:${config.production_metric || ""}:${config.period || "today"}`;
  }
  if (type === "trend_chart") {
    return `trend:${config.chart_metric || config.metric || ""}:${config.days || 30}`;
  }
  if (type === "mooney_chart") return `mooney:${config.period || "today"}`;
  if (type === "exposure_waterfall") return "exposure_waterfall";
  if (type === "form_submissions_list") return `forms:${config.limit || 10}`;
  if (type === "risk_observation_list") return `risk:${config.limit || 10}`;
  if (type === "observation_list") return `obs:${config.limit || 10}`;
  if (type === "action_queue") return `queue:${config.queue_mode || "open"}:${config.limit || 10}`;
  if (type === "information_panel") return "information_panel";
  return `${type}:${widget.id || ""}`;
}

/** Map preview-data (keyed by saved widget ids) onto canvas widgets (draft or saved). */
export function remapWidgetDataForCanvas(savedWidgets, canvasWidgets, serverData) {
  if (!serverData?.widgets) return serverData;
  const bySignature = {};
  for (const widget of savedWidgets || []) {
    const payload = serverData.widgets[widget.id];
    if (payload) bySignature[widgetDataSignature(widget)] = payload;
  }
  const widgets = { ...serverData.widgets };
  for (const widget of canvasWidgets || []) {
    if (widgets[widget.id]) continue;
    const payload = bySignature[widgetDataSignature(widget)];
    if (payload) widgets[widget.id] = payload;
  }
  return { ...serverData, widgets };
}
