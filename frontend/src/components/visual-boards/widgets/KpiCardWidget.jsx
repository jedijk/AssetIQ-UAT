import React from "react";
import { boardCardClass, boardMutedText } from "../boardTheme";

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
  const metric = widget?.config?.metric || widget?.id;
  const payload = data?.widgets?.[widget?.id] || data?.kpis?.[metric] || {};
  const value = payload.formatted_value ?? payload.value ?? "—";
  const label = widget?.title || payload.label || metric;
  const change = formatChange(payload.change_percent);
  const evidence = payload.evidence_count;
  const subtitle = payload.subtitle || (evidence != null ? `${evidence} observations` : null);

  return (
    <div
      className={`h-full rounded-xl p-3 sm:p-4 flex flex-col justify-center ${boardCardClass(theme)} ${accentClass(metric, theme)}`}
    >
      <div className={`text-[10px] sm:text-xs uppercase tracking-wide mb-1 ${boardMutedText(theme)}`}>
        {label}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xl sm:text-2xl font-bold tabular-nums">{value}</span>
        {change ? (
          <span
            className={`text-xs font-medium ${
              Number(payload.change_percent) >= 0 ? "text-orange-500" : "text-green-600"
            }`}
          >
            {change}
          </span>
        ) : null}
      </div>
      {subtitle ? (
        <div className={`text-[10px] sm:text-xs mt-1 ${boardMutedText(theme)}`}>{subtitle}</div>
      ) : null}
    </div>
  );
};

export default KpiCardWidget;
