import { useMemo } from "react";
import { PILLAR_LABELS } from "../config/nav";

const KPI_SHORT_LABELS = {
  user_adoption: "ADOPTION",
  training_completion: "TRAINING",
  champion_program: "CHAMPIONS",
  role_coverage: "ROLES",
  change_readiness: "CHANGE",
  core_data_readiness: "DATA",
  procedure_coverage: "PROCEDURES",
  governance_maturity: "GOVERNANCE",
  workflow_adoption: "WORKFLOW",
  reliability_process: "RELIABILITY",
  platform_utilization: "PLATFORM",
  integration_health: "INTEGRATION",
  data_quality: "QUALITY",
  infrastructure_readiness: "INFRA",
  ai_readiness: "AI",
};

function getRadarPoints(scores, centerX, centerY, radius, count) {
  const angleStep = (2 * Math.PI) / count;
  const startAngle = -Math.PI / 2;

  return scores.map((score, i) => {
    const angle = startAngle + i * angleStep;
    const r = (score / 100) * radius;
    return {
      x: centerX + r * Math.cos(angle),
      y: centerY + r * Math.sin(angle),
      labelX: centerX + (radius + 42) * Math.cos(angle),
      labelY: centerY + (radius + 42) * Math.sin(angle),
      score,
      angle,
    };
  });
}

function createRadarPath(points) {
  if (!points.length) return "";
  const first = points[0];
  let path = `M ${first.x} ${first.y}`;
  points.slice(1).forEach((p) => {
    path += ` L ${p.x} ${p.y}`;
  });
  path += " Z";
  return path;
}

export function buildPillarDimensions(kpis, pillar) {
  return (kpis || [])
    .filter((kpi) => kpi.pillar === pillar)
    .map((kpi) => ({
      id: kpi.id,
      label: kpi.name,
      shortLabel: KPI_SHORT_LABELS[kpi.id] || kpi.name.slice(0, 10).toUpperCase(),
      score: typeof kpi.score === "number" ? kpi.score : null,
      target: kpi.target,
      status: kpi.status,
    }));
}

export default function SuccessReadinessSnowflake({
  dimensions = [],
  title,
  centerScore,
  size = 280,
  fillColor = "#84cc16",
}) {
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 72;
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
    () => getRadarPoints(normalizedScores, centerX, centerY, radius, count),
    [normalizedScores, centerX, centerY, radius, count]
  );

  const displayCenterScore =
    centerScore != null ? centerScore : normalizedScores.length
      ? Math.round(normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length)
      : "—";

  const gridLevels = [0.25, 0.5, 0.75, 1];

  if (!dimensions.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No KPI data for {title}.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{dimensions.length} KPIs in this segment</p>
      </div>

      <svg width={size} height={size} className="mx-auto block" role="img" aria-label={`${title} readiness snowflake`}>
        <circle cx={centerX} cy={centerY} r={radius + 8} fill="#f8fafc" />

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
          return (
            <line
              key={`spoke-${i}`}
              x1={centerX}
              y1={centerY}
              x2={centerX + radius * Math.cos(angle)}
              y2={centerY + radius * Math.sin(angle)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          );
        })}

        <path
          d={createRadarPath(points)}
          fill={fillColor}
          fillOpacity={0.35}
          stroke={fillColor}
          strokeWidth={2}
        />

        {points.map((point, i) => (
          <circle
            key={`point-${dimensions[i].id}`}
            cx={point.x}
            cy={point.y}
            r={4}
            fill={fillColor}
            stroke="#ffffff"
            strokeWidth={2}
          />
        ))}

        {points.map((point, i) => {
          const isTop = point.angle < -Math.PI / 4 && point.angle > (-3 * Math.PI) / 4;
          const isBottom = point.angle > Math.PI / 4 && point.angle < (3 * Math.PI) / 4;
          const isLeft = Math.abs(point.angle) > Math.PI / 2;

          let textAnchor = "middle";
          if (isLeft) textAnchor = "end";
          else if (!isTop && !isBottom) textAnchor = "start";

          return (
            <text
              key={`label-${dimensions[i].id}`}
              x={point.labelX}
              y={point.labelY}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              className="text-[10px] font-semibold uppercase tracking-wide"
              fill="#334155"
            >
              {dimensions[i].shortLabel}
            </text>
          );
        })}

        <text x={centerX} y={centerY - 6} textAnchor="middle" className="text-2xl font-bold" fill="#365314">
          {displayCenterScore}
          {displayCenterScore !== "—" ? "%" : ""}
        </text>
        <text x={centerX} y={centerY + 12} textAnchor="middle" className="text-[10px] uppercase tracking-wide" fill="#64748b">
          Segment
        </text>
      </svg>

      <div className="mt-3 space-y-1.5">
        {dimensions.map((dim, i) => (
          <div key={dim.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-slate-600">{dim.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">
              {dim.score == null ? "—" : `${normalizedScores[i]}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const PILLAR_SNOWFLAKE_COLORS = {
  people: "#6366f1",
  process: "#0ea5e9",
  technology: "#84cc16",
};

export function SuccessReadinessSnowflakeGrid({ kpis, pillars }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Object.entries(PILLAR_LABELS).map(([pillar, label]) => (
        <SuccessReadinessSnowflake
          key={pillar}
          title={label}
          dimensions={buildPillarDimensions(kpis, pillar)}
          centerScore={pillars?.[pillar]?.score}
          fillColor={PILLAR_SNOWFLAKE_COLORS[pillar]}
        />
      ))}
    </div>
  );
}
