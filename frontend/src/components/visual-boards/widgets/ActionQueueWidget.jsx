import React from "react";
import { boardCardClass, boardMutedText } from "../boardTheme";

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
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || [];
  const isRecent = widget?.config?.queue_mode === "recent";

  return (
    <div className={`h-full rounded-xl p-3 sm:p-4 flex flex-col overflow-hidden ${boardCardClass(theme)}`}>
      <div className={`text-sm font-semibold mb-2 ${theme === "light" ? "text-slate-700" : "text-white"}`}>
        {widget?.title || "Action Queue"}
      </div>
      <div className="flex-1 overflow-auto space-y-2">
        {items.length === 0 ? (
          <div className={`text-sm ${boardMutedText(theme)}`}>No actions</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg px-2 py-2 text-xs ${
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
              {item.subtitle ? (
                <div className={`truncate mt-0.5 ${boardMutedText(theme)}`}>{item.subtitle}</div>
              ) : null}
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className={`truncate ${boardMutedText(theme)}`}>{item.owner || "—"}</span>
                {theme === "light" ? (
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusClass(item.status)}`}>
                    {formatStatus(item.status)}
                  </span>
                ) : (
                  <span className={`text-[10px] capitalize ${boardMutedText(theme)}`}>{item.status}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActionQueueWidget;
