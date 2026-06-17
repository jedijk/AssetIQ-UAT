import React, { useRef, useEffect, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import KpiCardWidget from "./widgets/KpiCardWidget";
import StatusIndicatorWidget from "./widgets/StatusIndicatorWidget";
import ObservationListWidget from "./widgets/ObservationListWidget";
import ExposureWaterfallWidget from "./widgets/ExposureWaterfallWidget";
import ActionQueueWidget from "./widgets/ActionQueueWidget";
import TrendChartWidget from "./widgets/TrendChartWidget";
import ProductionKpiWidget from "./widgets/ProductionKpiWidget";
import MooneyChartWidget from "./widgets/MooneyChartWidget";
import FormSubmissionsListWidget from "./widgets/FormSubmissionsListWidget";
import RiskObservationListWidget from "./widgets/RiskObservationListWidget";
import { boardSurfaceClass, widgetFontVars } from "./boardTheme";
import VisualBoardLogo from "./VisualBoardLogo";
import { computeGridCellSize, getCanvasSizeClass } from "./boardLayoutUtils";

const WIDGET_RENDERERS = {
  kpi_card: KpiCardWidget,
  status_indicator: StatusIndicatorWidget,
  observation_list: ObservationListWidget,
  exposure_waterfall: ExposureWaterfallWidget,
  action_queue: ActionQueueWidget,
  trend_chart: TrendChartWidget,
  production_kpi: ProductionKpiWidget,
  mooney_chart: MooneyChartWidget,
  form_submissions_list: FormSubmissionsListWidget,
  risk_observation_list: RiskObservationListWidget,
};

function ResizeHandle({ onResizeDelta }) {
  const remainder = useRef({ dx: 0, dy: 0 });

  const handlePointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (ev) => {
      const pixelDx = ev.movementX;
      const pixelDy = ev.movementY;
      onResizeDelta(pixelDx, pixelDy, remainder);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      remainder.current = { dx: 0, dy: 0 };
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      role="separator"
      aria-label="Resize widget"
      className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 cursor-se-resize rounded-sm bg-blue-500 border border-white shadow z-20 touch-none"
      onPointerDown={handlePointerDown}
    />
  );
}

function DraggableWidgetCell({
  widget,
  layout,
  data,
  theme,
  editable,
  selected,
  onSelect,
  onResizeWidget,
  gridMetricsRef,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: widget.id,
    data: { source: "canvas" },
    disabled: !editable,
  });
  const Renderer = WIDGET_RENDERERS[widget.type] || KpiCardWidget;
  const pos = widget.position || {};
  const style = {
    gridColumn: `${(pos.x || 0) + 1} / span ${pos.w || 3}`,
    gridRow: `${(pos.y || 0) + 1} / span ${pos.h || 2}`,
    transform: editable ? CSS.Translate.toString(transform) : undefined,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging || selected ? 10 : 1,
    ...widgetFontVars(widget.config),
  };

  const handleResizeDelta = useCallback(
    (pixelDx, pixelDy, remainderRef) => {
      if (!onResizeWidget || !gridMetricsRef?.current) return;
      const metrics = gridMetricsRef.current;
      const stepX = metrics.colWidth + metrics.gap;
      const stepY = metrics.rowHeight + metrics.gap;
      const acc = remainderRef.current;
      acc.dx += pixelDx;
      acc.dy += pixelDy;
      const dw = Math.trunc(acc.dx / stepX);
      const dh = Math.trunc(acc.dy / stepY);
      if (dw === 0 && dh === 0) return;
      acc.dx -= dw * stepX;
      acc.dy -= dh * stepY;
      onResizeWidget(widget.id, dw, dh);
    },
    [onResizeWidget, widget.id, gridMetricsRef],
  );

  return (
    <div
      ref={editable ? setNodeRef : undefined}
      style={style}
      className={`relative min-h-0 h-full ${editable ? "cursor-grab active:cursor-grabbing" : ""} ${
        selected ? "ring-2 ring-blue-500 rounded-xl" : ""
      }`}
      onClick={editable ? () => onSelect?.(widget.id) : undefined}
      {...(editable ? { ...listeners, ...attributes } : {})}
    >
      <Renderer widget={widget} data={data} theme={theme} />
      {editable && selected && onResizeWidget ? (
        <ResizeHandle onResizeDelta={handleResizeDelta} />
      ) : null}
    </div>
  );
}

const VisualBoardCanvas = ({
  layout,
  widgets = [],
  data,
  theme = "dark",
  previewSize = "tv-55",
  editable = false,
  selectedWidgetId,
  onSelectWidget,
  onDragEnd,
  onResizeWidget,
  onGridMetricsChange,
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const gridRef = useRef(null);
  const gridMetricsRef = useRef({ colWidth: 36, rowHeight: 28, gap: 8 });

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    const update = () => {
      const metrics = computeGridCellSize(el, layout);
      gridMetricsRef.current = metrics;
      onGridMetricsChange?.(metrics);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, onGridMetricsChange]);

  const sizeClass = getCanvasSizeClass(previewSize);

  const cols = layout?.columns || 24;
  const rows = layout?.rows || 16;

  const grid = (
    <div
      ref={gridRef}
      className={`grid h-full w-full gap-2 p-3`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {widgets.map((widget) => (
        <DraggableWidgetCell
          key={widget.id}
          widget={widget}
          layout={layout}
          data={data}
          theme={theme}
          editable={editable}
          selected={selectedWidgetId === widget.id}
          onSelect={onSelectWidget}
          onResizeWidget={onResizeWidget}
          gridMetricsRef={gridMetricsRef}
        />
      ))}
    </div>
  );

  return (
    <div
      className={`relative mx-auto ${sizeClass} ${boardSurfaceClass(theme)} rounded-lg overflow-hidden shadow-2xl flex flex-col ${
        previewSize === "fullscreen" ? "rounded-none shadow-none" : ""
      }`}
    >
      <div className="shrink-0 px-4 pt-3 pb-1">
        <VisualBoardLogo theme={theme} />
      </div>
      <div className="flex-1 min-h-0">
        {editable ? (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            {grid}
          </DndContext>
        ) : (
          grid
        )}
      </div>
    </div>
  );
};

export default VisualBoardCanvas;
