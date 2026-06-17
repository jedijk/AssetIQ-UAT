import React from "react";
import { boardCardClass, boardMutedText, boardSubtleText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";

export default function ProductionKpiWidget({ widget, data, theme = "dark" }) {
  const payload = data?.widgets?.[widget?.id] || {};
  const value = payload.formatted_value ?? "—";
  const unit = payload.unit || "";
  const label = widget?.title || payload.metric || "KPI";

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)} justify-center gap-0.5`}>
      <div className={`shrink-0 ${vmbText.label} ${boardMutedText(theme)}`}>{label}</div>
      <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
        <span className={`${vmbText.value} min-w-0`}>{value}</span>
        {unit ? (
          <span className={`shrink-0 ${vmbText.small} ${boardMutedText(theme)}`}>{unit}</span>
        ) : null}
      </div>
      {payload.subtitle ? (
        <div className={`shrink-0 ${vmbText.small} truncate ${boardMutedText(theme)}`}>{payload.subtitle}</div>
      ) : null}
      {payload.detail ? (
        <div className={`shrink-0 ${vmbText.small} truncate ${boardSubtleText(theme)}`}>{payload.detail}</div>
      ) : null}
    </div>
  );
}
