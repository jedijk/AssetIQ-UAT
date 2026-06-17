import React from "react";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

const ObservationListWidget = ({ widget, data, theme = "dark" }) => {
  const config = widget?.config || {};
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || data?.observations || [];
  const showTitle = isWidgetPartEnabled(config, "title");
  const showAsset = isWidgetPartEnabled(config, "asset");
  const showStatus = isWidgetPartEnabled(config, "status");
  const showExposure = isWidgetPartEnabled(config, "exposure");

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)}`}>
      {showTitle ? (
        <div className={`shrink-0 ${vmbText.title} mb-1 ${theme === "light" ? "text-slate-700" : "text-white"}`}>
          {widget?.title || "Observations"}
        </div>
      ) : null}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {items.length === 0 ? (
          <div className={`${vmbText.body} ${boardMutedText(theme)}`}>No active observations</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id || item.observation_id}
              className={`rounded-lg px-2 py-1.5 ${vmbText.small} ${
                theme === "light" ? "border-b border-slate-100" : "bg-slate-800/80"
              }`}
            >
              {showAsset ? (
                <div className={`font-medium truncate ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                  {item.asset || item.equipment_name || "—"}
                </div>
              ) : null}
              {(showStatus || showExposure) ? (
                <div className={`flex justify-between gap-2 min-w-0 ${boardMutedText(theme)} mt-0.5`}>
                  {showStatus ? <span className="truncate">{item.status || "open"}</span> : <span />}
                  {showExposure ? (
                    <span className="shrink-0">{item.exposure_formatted || item.risk_level || ""}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ObservationListWidget;
