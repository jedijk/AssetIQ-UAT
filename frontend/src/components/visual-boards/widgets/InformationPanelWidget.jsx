import React from "react";
import { Pin } from "lucide-react";
import { formatDateTimeCompact } from "../../../lib/dateUtils";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

function entryCardClass(theme, pinned, showHighlight) {
  if (pinned && showHighlight) {
    return theme === "light"
      ? "bg-amber-50/50 border-amber-200 border-l-[3px] border-l-amber-400"
      : "bg-amber-950/30 border-amber-800/60 border-l-[3px] border-l-amber-500";
  }
  return theme === "light"
    ? "bg-slate-50 border-slate-100"
    : "bg-slate-800/50 border-slate-700/50";
}

export default function InformationPanelWidget({ widget, data, theme = "dark" }) {
  const config = widget?.config || {};
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || [];
  const title = widget?.title || "Information";
  const titleClass = theme === "light" ? "text-slate-700" : "text-slate-200";
  const bodyClass = theme === "light" ? "text-slate-700" : "text-slate-200";
  const metaClass = theme === "light" ? "text-slate-500" : "text-slate-400";
  const dividerClass = theme === "light" ? "border-slate-200/90" : "border-slate-600/60";

  const showTitle = isWidgetPartEnabled(config, "title");
  const showSubtitle = isWidgetPartEnabled(config, "subtitle");
  const showCount = isWidgetPartEnabled(config, "count");
  const showTimestamp = isWidgetPartEnabled(config, "timestamp");
  const showSubmitter = isWidgetPartEnabled(config, "submitter");
  const showPinIndicator = isWidgetPartEnabled(config, "pin_indicator");
  const showPinnedHighlight = isWidgetPartEnabled(config, "pinned_highlight");
  const showMeta = showTimestamp || showSubmitter || showPinIndicator;

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)}`}>
      {(showTitle || showSubtitle || showCount) ? (
        <div className="shrink-0 mb-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {showTitle ? (
                <h3 className={`${vmbText.title} ${titleClass}`}>{title}</h3>
              ) : null}
              {showSubtitle ? (
                <p className={`${vmbText.small} ${boardMutedText(theme)} mt-0.5`}>
                  Line-90 — information forms · Pinned items stay on top
                </p>
              ) : null}
            </div>
            {showCount && items.length > 0 ? (
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full ${vmbText.small} font-medium ${
                  theme === "light" ? "bg-slate-100 text-slate-600" : "bg-slate-800 text-slate-300"
                }`}
              >
                {items.length}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {items.length === 0 ? (
          <p className={`${vmbText.body} ${boardMutedText(theme)} py-4 text-center`}>
            No information submitted
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.map((row, i) => {
              const pinned = Boolean(row.pinned);
              const when = row.submitted_at || row.datetime
                ? formatDateTimeCompact(row.submitted_at || row.datetime)
                : row.time || "—";
              return (
                <div
                  key={row.submission_id || i}
                  className={`p-2 rounded-lg border ${vmbText.small} ${entryCardClass(theme, pinned, showPinnedHighlight)}`}
                >
                  <p className={`${bodyClass} break-words leading-normal`}>
                    {row.text || "—"}
                  </p>
                  {showMeta ? (
                    <div className={`mt-1.5 border-t ${dividerClass} pt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5`}>
                      {showTimestamp ? (
                        <span className={`shrink-0 tabular-nums ${metaClass}`}>{when}</span>
                      ) : null}
                      {showTimestamp && showSubmitter ? (
                        <span className={`${metaClass} select-none`} aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {showSubmitter ? (
                        <span className={`min-w-0 ${bodyClass}`}>{row.submitted_by || "—"}</span>
                      ) : null}
                      {showPinIndicator && pinned ? (
                        <Pin
                          className={`ml-auto w-3 h-3 shrink-0 ${theme === "light" ? "text-amber-600" : "text-amber-400"}`}
                          aria-label="Pinned"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
