import React from "react";

const ExposureWaterfallWidget = ({ widget, data }) => {
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

  return (
    <div className="h-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-4">
      <div className="text-sm font-semibold text-white mb-3">{widget?.title || "Exposure Waterfall"}</div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label || row.key} className="flex justify-between text-sm">
            <span className="text-slate-400">{row.label}</span>
            <span className="text-white font-medium tabular-nums">
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
