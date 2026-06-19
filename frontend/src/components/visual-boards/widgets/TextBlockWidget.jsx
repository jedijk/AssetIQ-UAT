import React from "react";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

const ALIGN_CLASS = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

export default function TextBlockWidget({ widget, theme = "dark" }) {
  const config = widget?.config || {};
  const body = config.text_content ?? "";
  const align = ALIGN_CLASS[config.text_align] || ALIGN_CLASS.left;
  const showTitle = isWidgetPartEnabled(config, "title") && Boolean(widget?.title?.trim());
  const showBody = isWidgetPartEnabled(config, "body");
  const titleClass = theme === "light" ? "text-slate-800" : "text-slate-100";
  const bodyClass = theme === "light" ? "text-slate-700" : "text-slate-200";

  return (
    <div className={`${vmbWidgetShell()} ${vmbWidgetPad()} ${boardCardClass(theme)}`}>
      <div className={`flex-1 min-h-0 flex flex-col justify-center ${align}`}>
        {showTitle ? (
          <div className={`shrink-0 w-full ${vmbText("title")} ${titleClass} mb-1`}>
            {widget.title}
          </div>
        ) : null}
        <div
          className={`w-full min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words ${vmbText("body")} ${bodyClass}`}
        >
          {showBody ? (
            body || (
              <span className={boardMutedText(theme)}>Add text in the widget config panel</span>
            )
          ) : (
            <span className={boardMutedText(theme)}>Body hidden</span>
          )}
        </div>
      </div>
    </div>
  );
}
