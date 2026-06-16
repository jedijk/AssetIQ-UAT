import React from "react";
import KpiCardWidget from "./widgets/KpiCardWidget";
import StatusIndicatorWidget from "./widgets/StatusIndicatorWidget";
import ObservationListWidget from "./widgets/ObservationListWidget";
import ExposureWaterfallWidget from "./widgets/ExposureWaterfallWidget";

const WIDGET_RENDERERS = {
  kpi_card: KpiCardWidget,
  status_indicator: StatusIndicatorWidget,
  observation_list: ObservationListWidget,
  exposure_waterfall: ExposureWaterfallWidget,
};

const VisualBoardCanvas = ({ layout, widgets = [], data, previewSize = "tv-55" }) => {
  const sizeClass =
    previewSize === "desktop"
      ? "max-w-6xl aspect-video"
      : previewSize === "tablet"
        ? "max-w-3xl aspect-[4/3]"
        : "w-full aspect-video";

  return (
    <div className={`mx-auto ${sizeClass} bg-slate-950 rounded-lg overflow-hidden shadow-2xl`}>
      <div
        className="grid h-full w-full gap-3 p-4"
        style={{
          gridTemplateColumns: `repeat(${layout?.columns || 12}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout?.rows || 6}, minmax(0, 1fr))`,
        }}
      >
        {widgets.map((widget) => {
          const Renderer = WIDGET_RENDERERS[widget.type] || KpiCardWidget;
          const pos = widget.position || {};
          return (
            <div
              key={widget.id}
              style={{
                gridColumn: `${(pos.x || 0) + 1} / span ${pos.w || 3}`,
                gridRow: `${(pos.y || 0) + 1} / span ${pos.h || 2}`,
              }}
            >
              <Renderer widget={widget} data={data} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VisualBoardCanvas;
