import React from "react";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("complete")) return "bg-green-100 text-green-700";
  if (s.includes("progress")) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function FormSubmissionsListWidget({ widget, data, theme = "dark" }) {
  const config = widget?.config || {};
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || [];
  const title = widget?.title || "Recent Form Submissions";
  const showTitle = isWidgetPartEnabled(config, "title");
  const showSubmitter = isWidgetPartEnabled(config, "submitter");
  const showStatus = isWidgetPartEnabled(config, "status");

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)}`}>
      {showTitle ? (
        <h3 className={`shrink-0 ${vmbText.title} mb-1 ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}>
          {title}
        </h3>
      ) : null}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {items.length === 0 ? (
          <p className={`${vmbText.body} ${boardMutedText(theme)}`}>No recent submissions</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`flex items-start justify-between gap-2 ${vmbText.small} border-b border-slate-100 pb-2`}>
              <div className="min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                {showSubmitter ? (
                  <div className={`${boardMutedText(theme)} truncate`}>{item.submitted_by}</div>
                ) : null}
              </div>
              {showStatus ? (
                <span className={`shrink-0 px-2 py-0.5 rounded-full ${vmbText.small} font-medium ${statusClass(item.status)}`}>
                  {item.status || "Completed"}
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
