import React from "react";
import { boardCardClass, boardMutedText, vmbFlexGapClass, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

function accentClass(metric, theme) {
  if (theme !== "light") return "";
  if (metric === "active_threat_exposure") return "border-l-4 border-l-orange-400";
  if (metric === "critical_active_exposure") return "border-l-4 border-l-green-500";
  return "";
}

function formatChange(change) {
  if (change == null || Number.isNaN(Number(change))) return null;
  const n = Number(change);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

const KpiCardWidget = ({ widget, data, theme = "dark" }) => {
  const config = widget?.config || {};
  const metric = widget?.config?.metric || widget?.id;
  const payload = data?.widgets?.[widget?.id] || data?.kpis?.[metric] || {};
  const value = payload.formatted_value ?? payload.value ?? "—";
  const label = widget?.title || payload.label || metric;
  const change = formatChange(payload.change_percent);
  const evidence = payload.evidence_count;
  const subtitle = payload.subtitle || (evidence != null ? `${evidence} observations` : null);

  const showTitle = isWidgetPartEnabled(config, "title");
  const showChange = isWidgetPartEnabled(config, "change");
  const showSubtitle = isWidgetPartEnabled(config, "subtitle");

  return (
    <div
      className={`${vmbWidgetShell()} ${vmbWidgetPad()} ${boardCardClass(theme)} justify-center ${vmbFlexGapClass("sm")} ${accentClass(metric, theme)}`}
    >
      {showTitle ? (
        <div className={`shrink-0 ${vmbText("label")} ${boardMutedText(theme)}`}>{label}</div>
      ) : null}
      <div className={`flex items-baseline min-w-0 overflow-hidden ${vmbFlexGapClass("sm")}`}>
        <span className={`${vmbText("value")} min-w-0`}>{value}</span>
        {showChange && change ? (
          <span
            className={`shrink-0 ${vmbText("small")} font-medium ${
              Number(payload.change_percent) >= 0 ? "text-orange-500" : "text-green-600"
            }`}
          >
            {change}
          </span>
        ) : null}
      </div>
      {showSubtitle && subtitle ? (
        <div className={`shrink-0 ${vmbText("small")} truncate ${boardMutedText(theme)}`}>{subtitle}</div>
      ) : null}
    </div>
  );
};

export default KpiCardWidget;
