import React, { useRef } from "react";
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { useVmbContainerFont } from "../useVmbContainerFont";
import { isWidgetPartEnabled } from "../widgetDisplayParts";
import { isLegacyDisplayBrowser } from "../../../lib/kioskCompat";
import LegacyChartTable from "./LegacyChartTable";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const CHART_MARGIN = { top: 4, right: 6, bottom: 2, left: 2 };

const TrendChartWidget = ({ widget, data, theme = "dark" }) => {
  const config = widget?.config || {};
  const chartRef = useRef(null);
  const chartFs = useVmbContainerFont(chartRef, { min: 8, max: 13, ratio: 0.075 });
  const payload = data?.widgets?.[widget?.id] || {};
  const points = payload.points || [];
  const titleClass = theme === "light" ? "text-slate-700" : "text-white";
  const showTitle = isWidgetPartEnabled(config, "title");
  const showGrid = isWidgetPartEnabled(config, "grid");
  const legacy = isLegacyDisplayBrowser();

  return (
    <div className={`${vmbWidgetShell()} ${vmbWidgetPad()} ${boardCardClass(theme)}`}>
      {showTitle ? (
        <div className={`shrink-0 ${vmbText("title")} ${titleClass} mb-1`}>{widget?.title || "Trend"}</div>
      ) : null}
      <div ref={chartRef} className="flex-1 min-h-0 w-full relative">
        {points.length === 0 ? (
          <div className={`${vmbText("body")} ${boardMutedText(theme)} h-full flex items-center justify-center`}>
            No trend data
          </div>
        ) : legacy ? (
          <LegacyChartTable points={points} theme={theme} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={CHART_MARGIN}>
              {showGrid ? <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} /> : null}
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
