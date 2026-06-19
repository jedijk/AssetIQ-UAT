import React from "react";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("mitigat") || s.includes("complete")) return "bg-green-100 text-green-700";
  if (s.includes("learn")) return "bg-blue-100 text-blue-700";
  if (s.includes("plan")) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function RiskObservationListWidget({ widget, data, theme = "dark" }) {
  const config = widget?.config || {};
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || [];
  const title = widget?.title || "High Risk Observations";
  const showTitle = isWidgetPartEnabled(config, "title");
  const showRank = isWidgetPartEnabled(config, "rank");
  const showEquipment = isWidgetPartEnabled(config, "equipment");
  const showScores = isWidgetPartEnabled(config, "scores");
  const showStatus = isWidgetPartEnabled(config, "status");

  return (
    <div className={`${vmbWidgetShell()} ${vmbWidgetPad()} ${boardCardClass(theme)}`}>
      {showTitle ? (
        <h3 className={`shrink-0 ${vmbText("title")} mb-1 ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}>
          {title}
        </h3>
      ) : null}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {items.length === 0 ? (
          <p className={`${vmbText("body")} ${boardMutedText(theme)}`}>No observations</p>
        ) : (
          items.map((item, idx) => (
            <div key={item.id || idx} className={`flex items-start gap-2 ${vmbText("small")} border-b border-slate-100 pb-2`}>
              {showRank ? (
                <span className={`shrink-0 w-5 text-center font-semibold ${boardMutedText(theme)}`}>{idx + 1}</span>
              ) : null}
              <div className="min-w-0 flex-1">
                {showEquipment ? (
                  <div className="font-medium truncate">{item.equipment}</div>
                ) : null}
                <div className={`truncate ${boardMutedText(theme)}`}>{item.title}</div>
                {(showScores || showStatus) ? (
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0 flex-wrap">
                    {showScores && item.risk_score != null ? (
                      <span className="font-semibold text-slate-700">{item.risk_score}</span>
                    ) : null}
                    {showScores && item.rpn != null ? (
                      <span className={boardMutedText(theme)}>RPN {item.rpn}</span>
                    ) : null}
                    {showStatus ? (
                      <span className={`shrink-0 px-1.5 py-0.5 rounded ${vmbText("small")} truncate max-w-full ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
