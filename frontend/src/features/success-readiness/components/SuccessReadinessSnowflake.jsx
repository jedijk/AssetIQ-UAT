import { useMemo } from "react";
import { PILLAR_LABELS } from "../config/nav";

const PILLAR_ORDER = ["people", "process", "technology"];

export const PILLAR_SNOWFLAKE_COLORS = {
  people: "#6366f1",
  process: "#0ea5e9",
  technology: "#84cc16",
};

function getRadarPoints(scores, centerX, centerY, radius, count, labelDistance) {
  const angleStep = (2 * Math.PI) / count;
  const startAngle = -Math.PI / 2;

  return scores.map((score, i) => {
    const angle = startAngle + i * angleStep;
    const r = (score / 100) * radius;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: centerX + r * cos,
      y: centerY + r * sin,
      labelX: centerX + labelDistance * cos,
      labelY: centerY + labelDistance * sin,
      score,
      angle,
    };
  });
}

function createBlobPath(points, smoothing = 0.22) {
  if (points.length < 3) return "";

  const line = (a, b) => {
    const lenX = b.x - a.x;
    const lenY = b.y - a.y;
    return {
      length: Math.sqrt(lenX * lenX + lenY * lenY),
      angle: Math.atan2(lenY, lenX),
    };
  };

  const controlPoint = (current, previous, next, reverse) => {
    const p = previous || current;
    const n = next || current;
    const o = line(p, n);
    const angle = o.angle + (reverse ? Math.PI : 0);
    const length = o.length * smoothing;
    return {
      x: current.x + Math.cos(angle) * length,
      y: current.y + Math.sin(angle) * length,
    };
  };

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const prev = points[(i - 1 + points.length) % points.length];
    const nextNext = points[(i + 2) % points.length];
    const cp1 = controlPoint(current, prev, next, false);
    const cp2 = controlPoint(next, current, nextNext, true);
    d += ` C ${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${next.x},${next.y}`;
  }
  d += " Z";
  return d;
}

export function buildPillarDimensions(kpis, pillar) {
  return (kpis || [])
    .filter((kpi) => kpi.pillar === pillar)
    .map((kpi) => ({
      id: kpi.id,
      pillar: kpi.pillar,
      label: kpi.name,
      score: typeof kpi.score === "number" ? kpi.score : null,
      target: kpi.target,
      status: kpi.status,
    }));
}

export function buildAllKpiDimensions(kpis) {
  return PILLAR_ORDER.flatMap((pillar) => buildPillarDimensions(kpis, pillar));
}

function KpiAxisLabel({ x, y, label, pillarColor }) {
  const width = 108;
  const height = 40;
  return (
    <foreignObject
      x={x - width / 2}
      y={y - height / 2}
      width={width}
      height={height}
      className="overflow-visible pointer-events-none"
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="flex h-full items-center justify-center px-1 text-center text-[10px] font-medium leading-snug text-slate-700"
        style={{ color: pillarColor }}
      >
        {label}
      </div>
    </foreignObject>
  );
}

export default function SuccessReadinessSnowflake({
  dimensions = [],
  centerScore,
  size = 560,
  fillColor = "#84cc16",
}) {
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 130;
  const labelDistance = radius + 72;
  const count = dimensions.length || 1;

  const normalizedScores = useMemo(
    () =>
      dimensions.map((dim) => {
        if (typeof dim.score === "number") return Math.min(100, Math.max(0, dim.score));
        return 0;
      }),
    [dimensions]
  );

  const points = useMemo(
    () => getRadarPoints(normalizedScores, centerX, centerY, radius, count, labelDistance),
    [normalizedScores, centerX, centerY, radius, count, labelDistance]
  );

  const blobPath = useMemo(() => createBlobPath(points), [points]);

  const displayCenterScore =
    centerScore != null
      ? centerScore
      : normalizedScores.length
        ? Math.round(normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length)
        : "—";

  const gridLevels = [0.25, 0.5, 0.75, 1];

  if (!dimensions.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No KPI data available for the readiness snowflake.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block w-full max-w-[560px]"
        role="img"
        aria-label="Success Readiness snowflake with fifteen KPIs"
      >
        <circle cx={centerX} cy={centerY} r={radius + 12} fill="#f8fafc" />

        {gridLevels.map((factor, i) => (
          <circle
            key={factor}
            cx={centerX}
            cy={centerY}
            r={radius * factor}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
            strokeDasharray={i < gridLevels.length - 1 ? "4,4" : "0"}
          />
        ))}

        {dimensions.map((_, i) => {
          const angle = -Math.PI / 2 + i * ((2 * Math.PI) / count);
          const isPillarBoundary = i > 0 && i % 5 === 0;
          return (
            <line
              key={`spoke-${i}`}
              x1={centerX}
              y1={centerY}
              x2={centerX + radius * Math.cos(angle)}
              y2={centerY + radius * Math.sin(angle)}
              stroke={isPillarBoundary ? "#cbd5e1" : "#e2e8f0"}
              strokeWidth={isPillarBoundary ? 1.5 : 1}
            />
          );
        })}

        <path
          d={blobPath}
          fill={fillColor}
          fillOpacity={0.32}
          stroke={fillColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />

        {points.map((point, i) => {
          const pillarColor = PILLAR_SNOWFLAKE_COLORS[dimensions[i].pillar] || fillColor;
          return (
            <circle
              key={`point-${dimensions[i].id}`}
              cx={point.x}
              cy={point.y}
              r={4.5}
              fill={pillarColor}
              stroke="#ffffff"
              strokeWidth={2}
            />
          );
        })}

        {points.map((point, i) => (
          <KpiAxisLabel
            key={`label-${dimensions[i].id}`}
            x={point.labelX}
            y={point.labelY}
            label={dimensions[i].label}
            pillarColor={PILLAR_SNOWFLAKE_COLORS[dimensions[i].pillar] || "#334155"}
          />
        ))}

        <text
          x={centerX}
          y={centerY - 8}
          textAnchor="middle"
          className="fill-slate-900 text-[28px] font-bold"
        >
          {displayCenterScore}
          {displayCenterScore !== "—" ? "%" : ""}
        </text>
        <text
          x={centerX}
          y={centerY + 16}
          textAnchor="middle"
          className="fill-slate-500 text-[11px] uppercase tracking-wide"
        >
          Overall
        </text>
      </svg>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
        {PILLAR_ORDER.map((pillar) => {
          const pillarDims = dimensions.filter((d) => d.pillar === pillar);
          if (!pillarDims.length) return null;
          return (
            <div key={pillar}>
              <h4
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: PILLAR_SNOWFLAKE_COLORS[pillar] }}
              >
                {PILLAR_LABELS[pillar]}
              </h4>
              <div className="space-y-1.5">
                {pillarDims.map((dim, i) => {
                  const idx = dimensions.findIndex((d) => d.id === dim.id);
                  const score = idx >= 0 ? normalizedScores[idx] : null;
                  return (
                    <div key={dim.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-slate-600 leading-snug">{dim.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                        {dim.score == null ? "—" : `${score}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SuccessReadinessSnowflakeChart({ kpis, overallScore }) {
  const dimensions = buildAllKpiDimensions(kpis);
  return (
    <SuccessReadinessSnowflake
      dimensions={dimensions}
      centerScore={overallScore}
      fillColor="#84cc16"
    />
  );
}
