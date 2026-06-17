import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const TrendChartWidget = ({ widget, data }) => {
  const payload = data?.widgets?.[widget?.id] || {};
  const points = payload.points || [];

  return (
    <div className="h-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-4 flex flex-col overflow-hidden">
      <div className="text-sm font-semibold text-white mb-2">{widget?.title || "Trend"}</div>
      <div className="flex-1 min-h-0">
        {points.length === 0 ? (
          <div className="text-sm text-slate-500 h-full flex items-center justify-center">No trend data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => (v || "").slice(5)} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={40} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default TrendChartWidget;
