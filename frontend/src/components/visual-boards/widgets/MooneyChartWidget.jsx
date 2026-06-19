import React, { useRef } from "react";
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
import { boardCardClass, boardMutedText, vmbText, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { useVmbContainerFont } from "../useVmbContainerFont";
import { isWidgetPartEnabled } from "../widgetDisplayParts";
import { useLegacyChartFallback } from "../../../lib/kioskCompat";
import LegacyChartTable from "./LegacyChartTable";

const CHART_MARGIN = { top: 4, right: 6, bottom: 2, left: 2 };

export default function MooneyChartWidget({ widget, data, theme = "dark" }) {
  const config = widget?.config || {};
  const chartRef = useRef(null);
  const chartFs = useVmbContainerFont(chartRef, { min: 8, max: 13, ratio: 0.075 });
  const payload = data?.widgets?.[widget?.id] || {};
  const points = payload.points || [];
  const title = widget?.title || "Mooney Viscosity";
  const showTitle = isWidgetPartEnabled(config, "title");
  const showBands = isWidgetPartEnabled(config, "target_bands");
  const showGrid = isWidgetPartEnabled(config, "grid");
  const legacy = useLegacyChartFallback();

  return (
    <div className={`${vmbWidgetShell()} ${vmbWidgetPad()} ${boardCardClass(theme)}`}>
      {showTitle ? (
        <h3 className={`shrink-0 ${vmbText("title")} mb-1 ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}>
          {title}
        </h3>
      ) : null}
      <div ref={chartRef} className="flex-1 min-h-0 w-full relative">
        {points.length > 0 ? (
          legacy ? (
            <LegacyChartTable
              points={points.map((p) => ({ date: p.time, value: p.viscosity ?? p.value }))}
              theme={theme}
            />
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={CHART_MARGIN}>
              {showGrid ? <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /> : null}
              {showBands ? (
                <>
                  <ReferenceArea yAxisId="left" y1={payload.band_min ?? 50} y2={payload.band_max ?? 70} fill="#f97316" fillOpacity={0.08} />
                  <ReferenceArea yAxisId="left" y1={payload.target_min ?? 55} y2={payload.target_max ?? 65} fill="#22c55e" fillOpacity={0.12} />
                </>
              ) : null}
              <XAxis
                dataKey="time"
                tick={{ fontSize: chartFs }}
                stroke="#94a3b8"
                interval="preserveStartEnd"
                height={20}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: chartFs }}
                stroke="#94a3b8"
                domain={[48, 72]}
                width={28}
                tickCount={5}
              />
              <Tooltip contentStyle={{ fontSize: chartFs }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="viscosity"
                name="Viscosity (MU)"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 2, fill: "#8b5cf6" }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          )
        ) : (
          <div className={`h-full flex items-center justify-center ${vmbText("body")} ${boardMutedText(theme)}`}>
            No viscosity samples for today
          </div>
        )}
      </div>
    </div>
  );
}
