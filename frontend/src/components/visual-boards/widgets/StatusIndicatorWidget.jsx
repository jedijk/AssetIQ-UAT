import React from "react";
import { vmbText } from "../boardTheme";

const STATUS_STYLES = {
  GREEN: { bg: "bg-emerald-500", ring: "ring-emerald-400/30", text: "text-emerald-100" },
  AMBER: { bg: "bg-amber-500", ring: "ring-amber-400/30", text: "text-amber-100" },
  RED: { bg: "bg-red-600", ring: "ring-red-400/30", text: "text-red-100" },
};

const StatusIndicatorWidget = ({ widget, data }) => {
  const payload = data?.widgets?.[widget?.id] || data?.status || {};
  const status = (payload.status || data?.status?.status || "GREEN").toUpperCase();
  const style = STATUS_STYLES[status] || STATUS_STYLES.GREEN;

  return (
    <div className="h-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-4 flex flex-col items-center justify-center gap-3">
      <div className={`w-20 h-20 rounded-full ${style.bg} ring-8 ${style.ring} shadow-lg`} />
      <div className={`${vmbText.status} ${style.text}`}>{status}</div>
      {payload.reason || data?.status?.reason ? (
        <div className={`${vmbText.body} text-slate-400 text-center max-w-xs`}>
          {payload.reason || data?.status?.reason}
        </div>
      ) : null}
    </div>
  );
};

export default StatusIndicatorWidget;
