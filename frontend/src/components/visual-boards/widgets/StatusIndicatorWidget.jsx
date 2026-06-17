import React from "react";
import { boardCardClass, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";

const STATUS_STYLES = {
  GREEN: { bg: "bg-emerald-500", ring: "ring-emerald-400/30", text: "text-emerald-100" },
  AMBER: { bg: "bg-amber-500", ring: "ring-amber-400/30", text: "text-amber-100" },
  RED: { bg: "bg-red-600", ring: "ring-red-400/30", text: "text-red-100" },
};

const StatusIndicatorWidget = ({ widget, data, theme = "dark" }) => {
  const payload = data?.widgets?.[widget?.id] || data?.status || {};
  const status = (payload.status || data?.status?.status || "GREEN").toUpperCase();
  const style = STATUS_STYLES[status] || STATUS_STYLES.GREEN;

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)} items-center justify-center gap-2`}>
      <div className={`shrink-0 min-w-0 max-w-full aspect-square w-[min(4rem,70%)] max-h-[40%] rounded-full ${style.bg} ring-4 ${style.ring} shadow-lg`} />
      <div className={`shrink-0 ${vmbText.status} ${style.text}`}>{status}</div>
      {payload.reason || data?.status?.reason ? (
        <div className={`shrink min-h-0 ${vmbText.small} text-slate-400 text-center line-clamp-2 px-1`}>
          {payload.reason || data?.status?.reason}
        </div>
      ) : null}
    </div>
  );
};

export default StatusIndicatorWidget;
