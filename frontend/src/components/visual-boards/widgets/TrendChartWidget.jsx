import React from "react";
import { boardCardClass, boardMutedText, widgetChartFontSize, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const CHART_MARGIN = { top: 4, right: 6, bottom: 2, left: 2 };

const TrendChartWidget = ({ widget, data, theme = "dark" }) => {
  const payload = data?.widgets?.[widget?.id] || {};
  const points = payload.points || [];
  const chartFs = widgetChartFontSize(widget?.config);
  const titleClass = theme === "light" ? "text-slate-700" : "text-white";

  return (
    <div className={`${vmbWidgetShell} ${vmbWidgetPad} ${boardCardClass(theme)}`}>
      <div className={`shrink-0 ${vmbText.title} ${titleClass} mb-1`}>{widget?.title || "Trend"}</div>
      <div className="flex-1 min-h-0 w-full relative">
        {points.length === 0 ? (
          <div className={`${vmbText.body} ${boardMutedText(theme)} h-full flex items-center justify-center`}>
            No trend data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={CHART_MARGIN}>
              <XAxis
                dataKey="date"
                tick={{ fill: "#94a3b8", fontSize: chartFs }}
                tickFormatter={(v) => (v || "").slice(5)}
                height={20}
              />
              <YAxis tick={{ fill: "#94a3b8", fontSize: chartFs }} width={28} tickCount={5} />
              <Tooltip
                contentStyle={{
                  background: theme === "light" ? "#fff" : "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: chartFs,
                }}
                labelStyle={{ color: theme === "light" ? "#334155" : "#e2e8f0" }}
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
