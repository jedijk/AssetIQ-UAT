import React from "react";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("complete") || s.includes("done") || s.includes("closed")) {
    return "bg-green-100 text-green-700";
  }
  if (s.includes("progress")) return "bg-amber-100 text-amber-700";
  if (s.includes("open") || s.includes("new")) return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function formatStatus(status) {
  if (!status) return "Open";
  return String(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const ActionQueueWidget = ({ widget, data, theme = "dark" }) => {
  const config = widget?.config || {};
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || [];
  const isRecent = widget?.config?.queue_mode === "recent";
  const showTitle = isWidgetPartEnabled(config, "title");
  const showSubtitle = isWidgetPartEnabled(config, "subtitle");
  const showOwner = isWidgetPartEnabled(config, "owner");
  const showStatus = isWidgetPartEnabled(config, "status");

  return (
    <div className={`${vmbWidgetShell()} ${vmbWidgetPad()} ${boardCardClass(theme)}`}>
      {showTitle ? (
        <div className={`shrink-0 ${vmbText("title")} mb-1 ${theme === "light" ? "text-slate-700" : "text-white"}`}>
          {widget?.title || "Action Queue"}
        </div>
      ) : null}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {items.length === 0 ? (
          <div className={`${vmbText("body")} ${boardMutedText(theme)}`}>No actions</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg px-2 py-2 ${vmbText("small")} ${
                item.overdue && !isRecent
                  ? theme === "light"
                    ? "bg-red-50 border border-red-200"
                    : "bg-red-950/50 border border-red-800/50"
                  : theme === "light"
                    ? "border-b border-slate-100"
                    : "bg-slate-800/80"
              }`}
            >
              <div className={`font-medium truncate ${theme === "light" ? "text-slate-800" : "text-white"}`}>
                {item.action}
              </div>
              {showSubtitle && item.subtitle ? (
                <div className={`truncate mt-0.5 ${boardMutedText(theme)}`}>{item.subtitle}</div>
              ) : null}
              {(showOwner || showStatus) ? (
                <div className="flex items-center justify-between gap-2 mt-1">
                  {showOwner ? (
                    <span className={`truncate ${boardMutedText(theme)}`}>{item.owner || "—"}</span>
                  ) : (
                    <span />
                  )}
                  {showStatus ? (
                    theme === "light" ? (
                      <span className={`shrink-0 px-2 py-0.5 rounded-full ${vmbText("small")} font-medium ${statusClass(item.status)}`}>
                        {formatStatus(item.status)}
                      </span>
                    ) : (
                      <span className={`${vmbText("small")} capitalize ${boardMutedText(theme)}`}>{item.status}</span>
                    )
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

export default ActionQueueWidget;
