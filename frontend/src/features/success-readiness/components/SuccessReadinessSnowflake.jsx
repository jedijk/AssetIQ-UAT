import { useMemo } from "react";
import { PILLAR_LABELS } from "../config/nav";

export const PILLAR_ORDER = ["people", "process", "technology"];

export const PILLAR_SNOWFLAKE_COLORS = {
  people: "#6366f1",
  process: "#0ea5e9",
  technology: "#84cc16",
};

export const PILLAR_BG_COLORS = {
  people: "bg-indigo-50",
  process: "bg-sky-50",
  technology: "bg-lime-50",
};

export const PILLAR_DESCRIPTIONS = {
  people: "5 KPIs. Focus on people, adoption and organizational change.",
  process: "5 KPIs. Focus on processes, workflows and governance.",
  technology: "5 KPIs. Focus on platform, data and technical readiness.",
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
    .filter((kpi) => kpi.pillar === pillar && !kpi.excluded && kpi.status !== "excluded")
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

function KpiAxisLabel({ x, y, label, score, pillarColor }) {
  const width = 118;
  const height = 52;
  const displayScore = score == null ? "—" : `${score}%`;

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
        className="flex h-full flex-col items-center justify-center rounded-lg border border-slate-100 bg-white/95 px-1.5 py-1 text-center shadow-sm"
      >
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: pillarColor }}
          />
          <span className="text-[9px] font-semibold leading-tight text-slate-800">{label}</span>
        </div>
        <span className="mt-0.5 text-[10px] font-bold tabular-nums" style={{ color: pillarColor }}>
          {displayScore}
        </span>
      </div>
    </foreignObject>
  );
}

export default function SuccessReadinessSnowflake({
  dimensions = [],
  centerScore,
  size = 620,
}) {
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 145;
  const labelDistance = radius + 88;
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
        : null;

  const gridLevels = [0.25, 0.5, 0.75, 1];

  if (!dimensions.length) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
        No KPI data available for the readiness snowflake.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto block w-full max-w-[620px]"
      role="img"
      aria-label="Success Readiness snowflake with fifteen KPIs"
    >
      <defs>
        <radialGradient id="snowflake-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </radialGradient>
      </defs>

      <circle cx={centerX} cy={centerY} r={radius + 16} fill="url(#snowflake-bg)" />

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
            stroke={isPillarBoundary ? "#cbd5e1" : "#e8edf2"}
            strokeWidth={isPillarBoundary ? 1.5 : 1}
          />
        );
      })}

      <path
        d={blobPath}
        fill="#84cc16"
        fillOpacity={0.28}
        stroke="#65a30d"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />

      {points.map((point, i) => {
        const pillarColor = PILLAR_SNOWFLAKE_COLORS[dimensions[i].pillar] || "#84cc16";
        return (
          <circle
            key={`point-${dimensions[i].id}`}
            cx={point.x}
            cy={point.y}
            r={5}
            fill={pillarColor}
            stroke="#ffffff"
            strokeWidth={2.5}
          />
        );
      })}

      {points.map((point, i) => (
        <KpiAxisLabel
          key={`label-${dimensions[i].id}`}
          x={point.labelX}
          y={point.labelY}
          label={dimensions[i].label}
          score={dimensions[i].score}
          pillarColor={PILLAR_SNOWFLAKE_COLORS[dimensions[i].pillar] || "#334155"}
        />
      ))}

      <circle cx={centerX} cy={centerY} r={46} fill="#ffffff" stroke="#e2e8f0" strokeWidth={1.5} />
      <text
        x={centerX}
        y={centerY - 4}
        textAnchor="middle"
        className="fill-slate-900 text-[26px] font-bold"
      >
        {displayCenterScore == null ? "—" : `${displayCenterScore}%`}
      </text>
      <text
        x={centerX}
        y={centerY + 18}
        textAnchor="middle"
        className="fill-slate-500 text-[10px] font-semibold uppercase tracking-wider"
      >
        Overall
      </text>
    </svg>
  );
}

export function SuccessReadinessSnowflakeChart({ kpis, overallScore }) {
  const dimensions = buildAllKpiDimensions(kpis);
  return <SuccessReadinessSnowflake dimensions={dimensions} centerScore={overallScore} />;
}
