import React from "react";
import { boardCardClass, boardMutedText, vmbFlexGapClass, vmbStackClass, vmbText, vmbTitleGapClass, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
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
    <div className={`${vmbWidgetShell()} ${vmbWidgetPad()} ${boardCardClass(theme)}`}>
      {showTitle ? (
        <div className={`${vmbTitleGapClass()} ${vmbText("title")} ${theme === "light" ? "text-slate-700" : "text-white"}`}>
          {widget?.title || "Observations"}
        </div>
      ) : null}
      <div className={vmbStackClass()}>
        {items.length === 0 ? (
          <div className={`${vmbText("body")} ${boardMutedText(theme)}`}>No active observations</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id || item.observation_id}
              className={`vmb-inset-card px-2 py-1.5 ${vmbInsetRadiusClass()} ${vmbText("small")} ${
                theme === "light" ? "border-b border-slate-100" : "bg-slate-800/80"
              }`}
            >
              {showAsset ? (
                <div className={`font-medium truncate ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                  {item.asset || item.equipment_name || "—"}
                </div>
              ) : null}
              {(showStatus || showExposure) ? (
                <div className={`flex justify-between min-w-0 mt-0.5 ${vmbFlexGapClass("md")} ${boardMutedText(theme)}`}>
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
