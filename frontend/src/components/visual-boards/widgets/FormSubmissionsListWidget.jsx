import React from "react";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("complete")) return "bg-green-100 text-green-700";
  if (s.includes("progress")) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function FormSubmissionsListWidget({ widget, data, theme = "dark" }) {
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || [];
  const title = widget?.title || "Recent Form Submissions";

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)}`}>
      <h3 className={`shrink-0 ${vmbText.title} mb-1 ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}>
        {title}
      </h3>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {items.length === 0 ? (
          <p className={`${vmbText.body} ${boardMutedText(theme)}`}>No recent submissions</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`flex items-start justify-between gap-2 ${vmbText.small} border-b border-slate-100 pb-2`}>
              <div className="min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                <div className={`${boardMutedText(theme)} truncate`}>{item.submitted_by}</div>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full ${vmbText.small} font-medium ${statusClass(item.status)}`}>
                {item.status || "Completed"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
