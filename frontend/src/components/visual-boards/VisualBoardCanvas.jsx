import React from "react";
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
import { boardSurfaceClass } from "./boardTheme";

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

function DraggableWidgetCell({
  widget,
  layout,
  data,
  theme,
  editable,
  selected,
  onSelect,
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
  };

  return (
    <div
      ref={editable ? setNodeRef : undefined}
      style={style}
      className={`relative min-h-0 ${editable ? "cursor-grab active:cursor-grabbing" : ""} ${
        selected ? "ring-2 ring-blue-500 rounded-xl" : ""
      }`}
      onClick={editable ? () => onSelect?.(widget.id) : undefined}
      {...(editable ? { ...listeners, ...attributes } : {})}
    >
      <Renderer widget={widget} data={data} theme={theme} />
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
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const sizeClass =
    previewSize === "desktop"
      ? "max-w-6xl aspect-video"
      : previewSize === "tablet"
        ? "max-w-3xl aspect-[4/3]"
        : editable
          ? "w-full min-h-[480px]"
          : "w-full min-h-0";

  const grid = (
    <div
      className="grid h-full w-full gap-3 p-4"
      style={{
        gridTemplateColumns: `repeat(${layout?.columns || 12}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout?.rows || 6}, minmax(0, 1fr))`,
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
        />
      ))}
    </div>
  );

  return (
    <div className={`mx-auto ${sizeClass} ${boardSurfaceClass(theme)} rounded-lg overflow-hidden shadow-2xl`}>
      {editable ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {grid}
        </DndContext>
      ) : (
        grid
      )}
    </div>
  );
};

export default VisualBoardCanvas;
