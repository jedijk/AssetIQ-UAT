import React from "react";
import { boardCardClass, boardMutedText, boardSubtleText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

export default function ProductionKpiWidget({ widget, data, theme = "dark" }) {
  const config = widget?.config || {};
  const payload = data?.widgets?.[widget?.id] || {};
  const value = payload.formatted_value ?? "—";
  const unit = payload.unit || "";
  const label = widget?.title || payload.metric || "KPI";

  const showTitle = isWidgetPartEnabled(config, "title");
  const showUnit = isWidgetPartEnabled(config, "unit");
  const showSubtitle = isWidgetPartEnabled(config, "subtitle");
  const showDetail = isWidgetPartEnabled(config, "detail");

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)} justify-center gap-0.5`}>
      {showTitle ? (
        <div className={`shrink-0 ${vmbText.label} ${boardMutedText(theme)}`}>{label}</div>
      ) : null}
      <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
        <span className={`${vmbText.value} min-w-0`}>{value}</span>
        {showUnit && unit ? (
          <span className={`shrink-0 ${vmbText.small} ${boardMutedText(theme)}`}>{unit}</span>
        ) : null}
      </div>
      {showSubtitle && payload.subtitle ? (
        <div className={`shrink-0 ${vmbText.small} truncate ${boardMutedText(theme)}`}>{payload.subtitle}</div>
      ) : null}
      {showDetail && payload.detail ? (
        <div className={`shrink-0 ${vmbText.small} truncate ${boardSubtleText(theme)}`}>{payload.detail}</div>
      ) : null}
    </div>
  );
}
