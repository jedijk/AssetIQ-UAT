import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  ReferenceArea,
  XAxis,
  YAxis,
  Tooltip,
  Line,
} from "recharts";
import { boardCardClass, boardMutedText, widgetChartFontSize, vmbText } from "../boardTheme";

export default function MooneyChartWidget({ widget, data, theme = "dark" }) {
  const payload = data?.widgets?.[widget?.id] || {};
  const points = payload.points || [];
  const title = widget?.title || "Mooney Viscosity";
  const chartFs = widgetChartFontSize(widget?.config);

  return (
    <div className={`h-full rounded-xl p-3 sm:p-4 flex flex-col ${boardCardClass(theme)}`}>
      <h3 className={`${vmbText.title} mb-2 ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}>
        {title}
      </h3>
      <div className="flex-1 min-h-[180px]">
        {points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <ReferenceArea yAxisId="left" y1={payload.band_min ?? 50} y2={payload.band_max ?? 70} fill="#f97316" fillOpacity={0.08} />
              <ReferenceArea yAxisId="left" y1={payload.target_min ?? 55} y2={payload.target_max ?? 65} fill="#22c55e" fillOpacity={0.12} />
              <XAxis dataKey="time" tick={{ fontSize: chartFs }} stroke="#94a3b8" interval="preserveStartEnd" />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: chartFs }}
                stroke="#94a3b8"
                domain={[48, 72]}
                label={{ value: "MU", position: "insideTopLeft", offset: -5, fontSize: chartFs }}
              />
              <Tooltip contentStyle={{ fontSize: chartFs }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="viscosity"
                name="Viscosity (MU)"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#8b5cf6" }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className={`h-full flex items-center justify-center ${vmbText.body} ${boardMutedText(theme)}`}>
            No viscosity samples for today
          </div>
        )}
      </div>
    </div>
  );
}
