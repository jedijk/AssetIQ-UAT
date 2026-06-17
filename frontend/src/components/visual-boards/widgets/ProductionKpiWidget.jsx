import React from "react";
import { boardCardClass, boardMutedText, boardSubtleText } from "../boardTheme";

export default function ProductionKpiWidget({ widget, data, theme = "dark" }) {
  const payload = data?.widgets?.[widget?.id] || {};
  const value = payload.formatted_value ?? "—";
  const unit = payload.unit || "";
  const label = widget?.title || payload.metric || "KPI";

  return (
    <div className={`h-full rounded-xl p-3 sm:p-4 flex flex-col justify-center ${boardCardClass(theme)}`}>
      <div className={`text-[10px] sm:text-xs uppercase tracking-wide mb-1 ${boardMutedText(theme)}`}>
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl sm:text-2xl font-bold tabular-nums">{value}</span>
        {unit ? <span className={`text-sm ${boardMutedText(theme)}`}>{unit}</span> : null}
      </div>
      {payload.subtitle ? (
        <div className={`text-[10px] sm:text-xs mt-1 truncate ${boardMutedText(theme)}`}>{payload.subtitle}</div>
      ) : null}
      {payload.detail ? (
        <div className={`text-[10px] truncate ${boardSubtleText(theme)}`}>{payload.detail}</div>
      ) : null}
    </div>
  );
}
