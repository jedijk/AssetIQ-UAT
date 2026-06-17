import React from "react";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";

const ExposureWaterfallWidget = ({ widget, data, theme = "dark" }) => {
  const payload = data?.widgets?.[widget?.id] || {};
  const segments = payload.segments || [];
  const rows = segments.length
    ? segments
    : [
        { label: "Total", value: payload.total },
        { label: "Covered", value: payload.covered },
        { label: "Uncovered", value: payload.uncovered },
        { label: "Active", value: payload.active },
        { label: "Resolved", value: payload.resolved },
      ].filter((r) => r.value != null);

  const titleClass = theme === "light" ? "text-slate-700" : "text-white";
  const valueClass = theme === "light" ? "text-slate-900" : "text-white";

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)}`}>
      <div className={`shrink-0 ${vmbText.title} ${titleClass} mb-1`}>
        {widget?.title || "Exposure Waterfall"}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
        {rows.map((row) => (
          <div key={row.label || row.key} className={`flex justify-between gap-2 min-w-0 ${vmbText.small}`}>
            <span className={`truncate ${boardMutedText(theme)}`}>{row.label}</span>
            <span className={`shrink-0 font-medium tabular-nums ${valueClass}`}>
              {typeof row.value === "object"
                ? row.value?.formatted ?? row.value?.value ?? "—"
                : row.value ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExposureWaterfallWidget;
