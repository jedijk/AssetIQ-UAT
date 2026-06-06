import React from "react";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, ReferenceArea,
  XAxis, YAxis, Tooltip, Legend, Line,
} from "recharts";
import { ChartSeriesToggles, ViscosityTooltip } from "./productionDashboardShared";
export function MooneyViscosityChart({
  caps, chartSeries, setChartSeries, combinedSeries, selectedTime, setSelectedTime
}) {
  return (
    <>
          {/* ── Mooney Viscosity Chart (full width) ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="viscosity-chart">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Mooney Viscosity</h3>
              {caps.complexCharts ? (
                <ChartSeriesToggles active={chartSeries} onToggle={(k) => setChartSeries((prev) => ({ ...prev, [k]: !prev[k] }))} />
              ) : (
                <span className="text-[10px] text-slate-400">Table view (performance mode)</span>
              )}
            </div>
            {combinedSeries.length > 0 ? (
              caps.complexCharts ? (
                <ResponsiveContainer width="100%" height={250} className="sm:!h-[300px]">
                  <ComposedChart
                    data={combinedSeries}
                    onClick={(e) => {
                      if (e?.activeLabel) setSelectedTime((prev) => (prev === e.activeLabel ? null : e.activeLabel));
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    {/* Target bands: orange (50-70) behind, green (55-65) on top */}
                    <ReferenceArea yAxisId="left" y1={50} y2={70} fill="#f97316" fillOpacity={0.08} />
                    <ReferenceArea yAxisId="left" y1={55} y2={65} fill="#22c55e" fillOpacity={0.12} />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" interval="preserveStartEnd" />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10 }}
                      stroke="#94a3b8"
                      domain={[48, 72]}
                      label={{ value: "MU", position: "insideTopLeft", offset: -5, fontSize: 10 }}
                    />
                    {(chartSeries.rpm || chartSeries.feed || chartSeries.mp4 || chartSeries.t_product_ir) && (
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    )}
                    <Tooltip content={<ViscosityTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="viscosity"
                      name="Viscosity (MU)"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      dot={(props) => {
                        const isSelected = props.payload?.time === selectedTime;
                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={isSelected ? 7 : 4}
                            fill={isSelected ? "#7c3aed" : "#8b5cf6"}
                            stroke={isSelected ? "#fff" : "none"}
                            strokeWidth={isSelected ? 2 : 0}
                            style={{ cursor: "pointer" }}
                          />
                        );
                      }}
                      connectNulls
                      activeDot={{ r: 6, stroke: "#7c3aed", strokeWidth: 2, fill: "#fff", cursor: "pointer" }}
                    />
                    {chartSeries.rpm && (
                      <Line yAxisId="right" type="monotone" dataKey="rpm" name="RPM" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />
                    )}
                    {chartSeries.feed && (
                      <Line yAxisId="right" type="monotone" dataKey="feed" name="Feed (kg)" stroke="#f97316" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />
                    )}
                    {chartSeries.mp4 && (
                      <Line yAxisId="right" type="monotone" dataKey="mp4" name="MP4" stroke="#14b8a6" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />
                    )}
                    {chartSeries.t_product_ir && (
                      <Line yAxisId="right" type="monotone" dataKey="t_product_ir" name="T Product IR" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" connectNulls />
                    )}
                    {chartSeries.screenChange && (
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="screenChange"
                        name="Screen Change"
                        stroke="#a855f7"
                        strokeWidth={0}
                        dot={{ r: 6, fill: "#a855f7", strokeWidth: 2, stroke: "#fff" }}
                        connectNulls={false}
                        legendType="diamond"
                      />
                    )}
                    {chartSeries.magnetCleaning && (
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="magnetCleaning"
                        name="Magnet Cleaning"
                        stroke="#ec4899"
                        strokeWidth={0}
                        dot={{ r: 6, fill: "#ec4899", strokeWidth: 2, stroke: "#fff" }}
                        connectNulls={false}
                        legendType="diamond"
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="overflow-x-auto max-h-[260px] overflow-y-auto rounded-lg border border-slate-100 -mx-1">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600 z-[1]">
                      <tr>
                        <th className="text-left py-2 px-2 font-semibold text-slate-700 tracking-wide text-[11px]">Time</th>
                        <th className="text-right py-2 px-2 font-medium text-slate-500 uppercase tracking-wider text-[10px]">MU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinedSeries.slice(-60).map((row) => (
                        <tr key={String(row.time)} className="border-t border-slate-100">
                          <td className="py-1.5 px-2 font-mono text-slate-700">{row.time}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-slate-800">{row.viscosity ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-slate-400 px-2 py-2 border-t border-slate-100">Latest samples (performance mode)</p>
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-[250px] sm:h-[300px] text-sm text-slate-400">No viscosity data for this period</div>
            )}
          </div>
    </>
  );
}
