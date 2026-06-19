import React, { useMemo } from "react";
import { boardMutedText, vmbText } from "../boardTheme";

const VIEW_W = 400;
const VIEW_H = 200;
const PAD = { top: 10, right: 12, bottom: 22, left: 36 };

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure SVG line chart for Samsung/Tizen TV browsers (no Recharts).
 */
export default function LegacySvgLineChart({
  points = [],
  theme = "dark",
  xKey = "date",
  yKey = "value",
  stroke = "#8b5cf6",
  bands = [],
  emptyLabel = "No chart data",
}) {
  const chart = useMemo(() => {
    const rows = (points || [])
      .map((row, index) => ({
        xLabel: String(row[xKey] ?? index),
        y: toNumber(row[yKey]),
      }))
      .filter((row) => row.y != null);

    if (rows.length === 0) return null;

    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;

    let minY = rows[0].y;
    let maxY = rows[0].y;
    for (const band of bands || []) {
      const b1 = toNumber(band.y1);
      const b2 = toNumber(band.y2);
      if (b1 != null) minY = Math.min(minY, b1);
      if (b2 != null) maxY = Math.max(maxY, b2);
    }
    for (const row of rows) {
      minY = Math.min(minY, row.y);
      maxY = Math.max(maxY, row.y);
    }
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    } else {
      const pad = (maxY - minY) * 0.08;
      minY -= pad;
      maxY += pad;
    }

    const scaleX = (index) => {
      if (rows.length === 1) return PAD.left + plotW / 2;
      return PAD.left + (index / (rows.length - 1)) * plotW;
    };
    const scaleY = (value) => PAD.top + plotH - ((value - minY) / (maxY - minY)) * plotH;

    const linePoints = rows.map((row, index) => `${scaleX(index)},${scaleY(row.y)}`).join(" ");

    const bandRects = (bands || [])
      .map((band, index) => {
        const y1 = toNumber(band.y1);
        const y2 = toNumber(band.y2);
        if (y1 == null || y2 == null) return null;
        const top = scaleY(Math.max(y1, y2));
        const bottom = scaleY(Math.min(y1, y2));
        return {
          key: `band-${index}`,
          y: top,
          height: Math.max(1, bottom - top),
          fill: band.fill || "#64748b",
          opacity: band.opacity ?? 0.12,
        };
      })
      .filter(Boolean);

    const gridColor = theme === "light" ? "#e2e8f0" : "#334155";
    const axisColor = theme === "light" ? "#94a3b8" : "#64748b";
    const tickLabels = [
      rows[0],
      rows.length > 1 ? rows[rows.length - 1] : null,
    ].filter(Boolean);

    return {
      linePoints,
      bandRects,
      gridColor,
      axisColor,
      plotLeft: PAD.left,
      plotTop: PAD.top,
      plotW,
      plotH,
      minY,
      maxY,
      tickLabels,
      scaleY,
    };
  }, [points, xKey, yKey, bands, theme]);

  if (!chart) {
    return (
      <div className={`vmb-chart-wrap flex items-center justify-center h-full ${vmbText("body")} ${boardMutedText(theme)}`}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="vmb-chart-wrap">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        role="img"
        aria-label="Trend chart"
      >
        {chart.bandRects.map((band) => (
          <rect
            key={band.key}
            x={chart.plotLeft}
            y={band.y}
            width={chart.plotW}
            height={band.height}
            fill={band.fill}
            fillOpacity={band.opacity}
          />
        ))}

        {[0, 0.5, 1].map((t) => {
          const y = chart.plotTop + chart.plotH * t;
          return (
            <line
              key={`grid-${t}`}
              x1={chart.plotLeft}
              y1={y}
              x2={chart.plotLeft + chart.plotW}
              y2={y}
              stroke={chart.gridColor}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        <line
          x1={chart.plotLeft}
          y1={chart.plotTop + chart.plotH}
          x2={chart.plotLeft + chart.plotW}
          y2={chart.plotTop + chart.plotH}
          stroke={chart.axisColor}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={chart.plotLeft}
          y1={chart.plotTop}
          x2={chart.plotLeft}
          y2={chart.plotTop + chart.plotH}
          stroke={chart.axisColor}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <polyline
          points={chart.linePoints}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {chart.tickLabels.map((row, index) => (
          <text
            key={`x-${row.xLabel}-${index}`}
            x={index === 0 ? chart.plotLeft : chart.plotLeft + chart.plotW}
            y={VIEW_H - 6}
            textAnchor={index === 0 ? "start" : "end"}
            fill={chart.axisColor}
            fontSize="11"
          >
            {String(row.xLabel).slice(0, 8)}
          </text>
        ))}

        <text x={4} y={chart.scaleY(chart.maxY) + 4} fill={chart.axisColor} fontSize="10">
          {Math.round(chart.maxY)}
        </text>
        <text x={4} y={chart.scaleY(chart.minY) + 4} fill={chart.axisColor} fontSize="10">
          {Math.round(chart.minY)}
        </text>
      </svg>
    </div>
  );
}
