import React from "react";
import { vmbText } from "../boardTheme";

const ObservationListWidget = ({ widget, data }) => {
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || data?.observations || [];

  return (
    <div className="h-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-4 flex flex-col overflow-hidden">
      <div className={`${vmbText.title} text-white mb-3`}>{widget?.title || "Observations"}</div>
      <div className="flex-1 overflow-auto space-y-2">
        {items.length === 0 ? (
          <div className={`${vmbText.body} text-slate-500`}>No active observations</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id || item.observation_id}
              className={`rounded-lg bg-slate-800/80 px-3 py-2 ${vmbText.body}`}
            >
              <div className="font-medium text-white truncate">{item.asset || item.equipment_name || "—"}</div>
              <div className={`flex justify-between ${vmbText.small} text-slate-400 mt-1`}>
                <span>{item.status || "open"}</span>
                <span>{item.exposure_formatted || item.risk_level || ""}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ObservationListWidget;
