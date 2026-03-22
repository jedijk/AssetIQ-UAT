import { useMemo } from "react";
import { Info } from "lucide-react";

// Reliability Framework dimensions based on the provided framework
const RELIABILITY_DIMENSIONS = [
  { 
    key: "criticality", 
    label: "Evergreen Criticality",
    shortLabel: "CRITICALITY",
    description: "Ownership-defined system hierarchy & composition",
    color: "#F59E0B" // Amber
  },
  { 
    key: "incidents", 
    label: "Incidents & Validation",
    shortLabel: "INCIDENTS",
    description: "Incident records & positive validation",
    color: "#F97316" // Orange
  },
  { 
    key: "investigations", 
    label: "Related Investigations",
    shortLabel: "INVESTIGATIONS",
    description: "Cross-asset analysis & root cause",
    color: "#14B8A6" // Teal
  },
  { 
    key: "maintenance", 
    label: "Maintenance Plans",
    shortLabel: "MAINTENANCE",
    description: "Active maintenance plans & spares",
    color: "#EF4444" // Red
  },
  { 
    key: "reactions", 
    label: "Reaction Plans",
    shortLabel: "REACTIONS",
    description: "Resources, support, downtime, rounds",
    color: "#14B8A6" // Teal
  },
  { 
    key: "threats", 
    label: "Unmitigated Threats",
    shortLabel: "THREATS",
    description: "Manage threats & opportunity",
    color: "#14B8A6" // Teal
  },
];

// Calculate points on a radar chart
const getRadarPoints = (scores, centerX, centerY, radius) => {
  const angleStep = (2 * Math.PI) / scores.length;
  const startAngle = -Math.PI / 2; // Start from top
  
  return scores.map((score, i) => {
    const angle = startAngle + i * angleStep;
    const r = (score / 100) * radius;
    return {
      x: centerX + r * Math.cos(angle),
      y: centerY + r * Math.sin(angle),
      labelX: centerX + (radius + 35) * Math.cos(angle),
      labelY: centerY + (radius + 35) * Math.sin(angle),
      score,
      angle,
    };
  });
};

// Create SVG path from points
const createRadarPath = (points) => {
  if (points.length === 0) return "";
  const first = points[0];
  let path = `M ${first.x} ${first.y}`;
  points.slice(1).forEach(p => {
    path += ` L ${p.x} ${p.y}`;
  });
  path += " Z";
  return path;
};

export default function ReliabilitySnowflake({ 
  scores = {}, 
  title = "Reliability Snowflake",
  subtitle = "",
  size = 300,
  showLegend = true,
  darkMode = true,
  onDimensionClick = null,
}) {
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 60;

  // Normalize scores to 0-100
  const normalizedScores = useMemo(() => {
    return RELIABILITY_DIMENSIONS.map(dim => {
      const score = scores[dim.key];
      if (typeof score === "number") return Math.min(100, Math.max(0, score));
      return 0;
    });
  }, [scores]);

  // Calculate radar points
  const points = useMemo(() => 
    getRadarPoints(normalizedScores, centerX, centerY, radius),
    [normalizedScores, centerX, centerY, radius]
  );

  // Calculate overall score
  const overallScore = useMemo(() => {
    const sum = normalizedScores.reduce((a, b) => a + b, 0);
    return Math.round(sum / RELIABILITY_DIMENSIONS.length);
  }, [normalizedScores]);

  // Generate concentric circles for grid
  const gridCircles = [0.25, 0.5, 0.75, 1].map(factor => radius * factor);

  // Get assessment text based on overall score
  const getAssessment = (score) => {
    if (score >= 80) return "Excellent reliability management across all dimensions";
    if (score >= 60) return "Good reliability practices with some areas for improvement";
    if (score >= 40) return "Several reliability gaps that need attention";
    return "Significant reliability concerns requiring immediate action";
  };

  const bgColor = darkMode ? "#1e293b" : "#ffffff";
  const gridColor = darkMode ? "#334155" : "#e2e8f0";
  const textColor = darkMode ? "#94a3b8" : "#64748b";
  const labelColor = darkMode ? "#f1f5f9" : "#1e293b";
  const fillColor = "#EAB308"; // Yellow/Gold like the example
  const fillOpacity = 0.7;

  return (
    <div 
      className={`rounded-2xl p-6 ${darkMode ? 'bg-slate-800' : 'bg-white border border-slate-200'}`}
      style={{ maxWidth: size + 120 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {title}
          </h3>
          {subtitle && (
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {subtitle}
            </p>
          )}
        </div>
        <button 
          className={`p-2 rounded-full ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
          title="View methodology"
        >
          <Info className={`w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
        </button>
      </div>

      {/* Radar Chart */}
      <svg width={size} height={size} className="mx-auto">
        {/* Background circle */}
        <circle 
          cx={centerX} 
          cy={centerY} 
          r={radius + 10} 
          fill={darkMode ? "#0f172a" : "#f8fafc"} 
        />

        {/* Grid circles */}
        {gridCircles.map((r, i) => (
          <circle
            key={i}
            cx={centerX}
            cy={centerY}
            r={r}
            fill="none"
            stroke={gridColor}
            strokeWidth={1}
            strokeDasharray={i < gridCircles.length - 1 ? "4,4" : "0"}
          />
        ))}

        {/* Grid lines (spokes) */}
        {RELIABILITY_DIMENSIONS.map((_, i) => {
          const angle = -Math.PI / 2 + i * (2 * Math.PI / RELIABILITY_DIMENSIONS.length);
          const x2 = centerX + radius * Math.cos(angle);
          const y2 = centerY + radius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={centerX}
              y1={centerY}
              x2={x2}
              y2={y2}
              stroke={gridColor}
              strokeWidth={1}
            />
          );
        })}

        {/* Filled radar area */}
        <path
          d={createRadarPath(points)}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke={fillColor}
          strokeWidth={2}
        />

        {/* Data points */}
        {points.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={4}
            fill={fillColor}
            stroke={darkMode ? "#1e293b" : "#ffffff"}
            strokeWidth={2}
            className="cursor-pointer hover:r-6 transition-all"
            onClick={() => onDimensionClick && onDimensionClick(RELIABILITY_DIMENSIONS[i])}
          />
        ))}

        {/* Labels */}
        {points.map((point, i) => {
          const dim = RELIABILITY_DIMENSIONS[i];
          const isTop = point.angle < -Math.PI / 4 && point.angle > -3 * Math.PI / 4;
          const isBottom = point.angle > Math.PI / 4 && point.angle < 3 * Math.PI / 4;
          const isLeft = Math.abs(point.angle) > Math.PI / 2;
          
          let textAnchor = "middle";
          if (isLeft) textAnchor = "end";
          else if (!isTop && !isBottom) textAnchor = "start";

          return (
            <g key={i}>
              <text
                x={point.labelX}
                y={point.labelY}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                className="text-xs font-semibold uppercase tracking-wide cursor-pointer"
                fill={labelColor}
                onClick={() => onDimensionClick && onDimensionClick(dim)}
              >
                {dim.shortLabel}
              </text>
            </g>
          );
        })}

        {/* Center score */}
        <text
          x={centerX}
          y={centerY - 8}
          textAnchor="middle"
          className="text-3xl font-bold"
          fill={fillColor}
        >
          {overallScore}
        </text>
        <text
          x={centerX}
          y={centerY + 14}
          textAnchor="middle"
          className="text-xs uppercase tracking-wide"
          fill={textColor}
        >
          Score
        </text>
      </svg>

      {/* Assessment */}
      <p className={`text-center mt-4 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
        {getAssessment(overallScore)}
      </p>

      {/* Legend / Dimension scores */}
      {showLegend && (
        <div className="mt-6 grid grid-cols-2 gap-2">
          {RELIABILITY_DIMENSIONS.map((dim, i) => (
            <div 
              key={dim.key}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'
              }`}
              onClick={() => onDimensionClick && onDimensionClick(dim)}
            >
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: dim.color }}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                  {dim.label}
                </p>
              </div>
              <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {normalizedScores[i]}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Export dimensions for use in other components
export { RELIABILITY_DIMENSIONS };
