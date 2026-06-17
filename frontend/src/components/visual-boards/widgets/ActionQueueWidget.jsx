import React from "react";

const ActionQueueWidget = ({ widget, data }) => {
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || [];

  return (
    <div className="h-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-4 flex flex-col overflow-hidden">
      <div className="text-sm font-semibold text-white mb-3">{widget?.title || "Action Queue"}</div>
      <div className="flex-1 overflow-auto space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-slate-500">No open actions</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg px-3 py-2 text-sm ${item.overdue ? "bg-red-950/50 border border-red-800/50" : "bg-slate-800/80"}`}
            >
              <div className="font-medium text-white truncate">{item.action}</div>
              <div className="flex justify-between text-xs text-slate-400 mt-1 gap-2">
                <span className="truncate">{item.owner || "—"}</span>
                <span>{item.due_date ? item.due_date.slice(0, 10) : "—"}</span>
                <span className="capitalize">{item.status}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActionQueueWidget;
