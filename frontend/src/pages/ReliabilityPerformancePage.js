import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { reliabilityAPI, equipmentHierarchyAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { motion } from "framer-motion";
import {
  Building2,
  ChevronDown,
  Target,
  AlertTriangle,
  Shield,
  Wrench,
  FileSearch,
  Activity,
  Layers,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Factory,
  Cog,
  Settings,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

// Level icons map
const LEVEL_ICONS = {
  installation: Factory,
  plant: Building2,
  unit: Layers,
  section: Target,
  system: Settings,
  equipment_unit: Wrench,
  equipment: Cog,
  subunit: Activity,
  maintainable_item: Shield,
};

// Reliability dimensions with colors
const DIMENSIONS = [
  { key: "criticality", label: "Criticality", icon: Shield, color: "#F59E0B" },
  { key: "incidents", label: "Incidents", icon: AlertTriangle, color: "#F97316" },
  { key: "investigations", label: "Investigations", icon: FileSearch, color: "#14B8A6" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, color: "#EF4444" },
  { key: "reactions", label: "Reactions", icon: Activity, color: "#8B5CF6" },
  { key: "threats", label: "Threats", icon: Target, color: "#10B981" },
];

// Calculate radar points
const getRadarPoints = (scores, centerX, centerY, radius) => {
  const angleStep = (2 * Math.PI) / scores.length;
  const startAngle = -Math.PI / 2;
  
  return scores.map((score, i) => {
    const angle = startAngle + i * angleStep;
    const r = (score / 100) * radius;
    return {
      x: centerX + r * Math.cos(angle),
      y: centerY + r * Math.sin(angle),
      labelX: centerX + (radius + 30) * Math.cos(angle),
      labelY: centerY + (radius + 30) * Math.sin(angle),
      score,
      angle,
    };
  });
};

// Create SVG path
const createRadarPath = (points) => {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
};

// Snowflake component
const ReliabilitySnowflake = ({ scores = {}, overall = 0, itemCount = 0, alerts = 0, stars = 0 }) => {
  const size = 220;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 40;

  const normalizedScores = DIMENSIONS.map(dim => {
    const score = scores[dim.key];
    return typeof score === "number" ? Math.min(100, Math.max(0, score)) : 0;
  });

  const points = getRadarPoints(normalizedScores, centerX, centerY, radius);
  const gridCircles = [0.25, 0.5, 0.75, 1].map(f => radius * f);

  const getAssessment = (score) => {
    if (score >= 80) return "Excellent reliability performance";
    if (score >= 60) return "Good performance with room to improve";
    if (score >= 40) return "Several reliability gaps need attention";
    return "Significant concerns requiring action";
  };

  return (
    <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
      <svg width={size} height={size} className="mx-auto">
        {/* Background */}
        <circle cx={centerX} cy={centerY} r={radius + 10} fill="#1e293b" />
        
        {/* Grid circles */}
        {gridCircles.map((r, i) => (
          <circle key={i} cx={centerX} cy={centerY} r={r} fill="none" stroke="#334155" strokeWidth={1} strokeDasharray={i < 3 ? "3,3" : "0"} />
        ))}
        
        {/* Spokes */}
        {DIMENSIONS.map((_, i) => {
          const angle = -Math.PI / 2 + i * (2 * Math.PI / DIMENSIONS.length);
          return (
            <line key={i} x1={centerX} y1={centerY} x2={centerX + radius * Math.cos(angle)} y2={centerY + radius * Math.sin(angle)} stroke="#334155" strokeWidth={1} />
          );
        })}
        
        {/* Filled area */}
        <path d={createRadarPath(points)} fill="#EAB308" fillOpacity={0.6} stroke="#EAB308" strokeWidth={2} />
        
        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill="#EAB308" stroke="#1e293b" strokeWidth={2} />
        ))}
        
        {/* Labels */}
        {points.map((p, i) => {
          const dim = DIMENSIONS[i];
          const isLeft = Math.abs(p.angle) > Math.PI / 2;
          const isTop = p.angle < -Math.PI / 4 && p.angle > -3 * Math.PI / 4;
          const isBottom = p.angle > Math.PI / 4 && p.angle < 3 * Math.PI / 4;
          let anchor = "middle";
          if (!isTop && !isBottom) anchor = isLeft ? "end" : "start";
          
          return (
            <text key={i} x={p.labelX} y={p.labelY} textAnchor={anchor} dominantBaseline="middle" className="text-[10px] font-semibold uppercase tracking-wide" fill="#94a3b8">
              {dim.label.slice(0, 6).toUpperCase()}
            </text>
          );
        })}
        
        {/* Center score */}
        <text x={centerX} y={centerY - 5} textAnchor="middle" className="text-2xl font-bold" fill="#EAB308">{overall}</text>
        <text x={centerX} y={centerY + 12} textAnchor="middle" className="text-[9px] uppercase tracking-wider" fill="#64748b">Score</text>
      </svg>
      
      <p className="text-center mt-3 text-sm text-slate-300">{getAssessment(overall)}</p>
      
      {/* Bottom stats */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-700/50">
        <span className="text-sm text-slate-400">{itemCount} equipment</span>
        {alerts > 0 && (
          <span className="flex items-center gap-1 text-sm">
            <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs">!</span>
            <span className="text-red-400">{alerts}</span>
          </span>
        )}
        {stars > 0 && (
          <span className="flex items-center gap-1 text-sm">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">★</span>
            <span className="text-emerald-400">{stars}</span>
          </span>
        )}
      </div>
    </div>
  );
};

// Stat Card component
const StatCard = ({ label, value, percentage, icon: Icon, trend, accentColor = "#64748b" }) => {
  const getTrendIcon = () => {
    if (trend > 0) return <TrendingUp className="w-3 h-3" />;
    if (trend < 0) return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };
  
  const getTrendColor = () => {
    if (trend > 5) return "text-emerald-400";
    if (trend < -5) return "text-red-400";
    return "text-slate-400";
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 flex-1 min-w-[140px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{label}</span>
        <Info className="w-4 h-4 text-slate-500" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}%</span>
      </div>
      <div className={`flex items-center gap-1 mt-1 text-xs ${getTrendColor()}`}>
        {getTrendIcon()}
        <span>{Math.abs(percentage || 0)}%</span>
      </div>
    </div>
  );
};

// Mini spark line for equipment rows
const MiniSparkLine = ({ score }) => {
  const color = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  const width = 80;
  const height = 24;
  // Generate a simple line based on score
  const points = [
    { x: 0, y: height - (score * 0.8 * height / 100) },
    { x: width * 0.3, y: height - ((score - 5 + Math.random() * 10) * height / 100) },
    { x: width * 0.6, y: height - ((score + 5 - Math.random() * 10) * height / 100) },
    { x: width, y: height - (score * height / 100) },
  ];
  const pathD = `M ${points.map(p => `${p.x},${Math.max(2, Math.min(height - 2, p.y))}`).join(' L ')}`;
  
  return (
    <svg width={width} height={height} className="opacity-80">
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
};

// Equipment Row component
const EquipmentRow = ({ item, onSelect }) => {
  const scores = item.scores || {};
  const overall = item.overall_score || 0;
  const LevelIcon = LEVEL_ICONS[item.node_level] || Cog;
  
  const getScoreColor = (score) => {
    if (score >= 70) return "text-emerald-400";
    if (score >= 40) return "text-amber-400";
    return "text-red-400";
  };
  
  const getScoreBadge = (score) => {
    if (score >= 70) return { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Good" };
    if (score >= 40) return { bg: "bg-amber-500/10", text: "text-amber-400", label: "Fair" };
    return { bg: "bg-red-500/10", text: "text-red-400", label: "Poor" };
  };
  
  const badge = getScoreBadge(overall);

  return (
    <motion.tr 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors"
      onClick={() => onSelect && onSelect(item)}
    >
      {/* Equipment Name */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
            <LevelIcon className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white truncate max-w-[200px]">{item.node_name}</p>
            <p className={`text-xs ${badge.text}`}>{badge.label}</p>
          </div>
        </div>
      </td>
      
      {/* Overall Score */}
      <td className="py-3 px-4">
        <span className={`text-lg font-bold ${getScoreColor(overall)}`}>{overall}%</span>
      </td>
      
      {/* Criticality */}
      <td className="py-3 px-4">
        <span className={`text-sm ${getScoreColor(scores.criticality || 0)}`}>{scores.criticality || 0}%</span>
      </td>
      
      {/* Maintenance */}
      <td className="py-3 px-4">
        <span className={`text-sm ${getScoreColor(scores.maintenance || 0)}`}>{scores.maintenance || 0}%</span>
      </td>
      
      {/* Threats */}
      <td className="py-3 px-4">
        <span className={`text-sm ${getScoreColor(scores.threats || 0)}`}>{scores.threats || 0}%</span>
      </td>
      
      {/* Incidents */}
      <td className="py-3 px-4">
        <span className={`text-sm ${getScoreColor(scores.incidents || 0)}`}>{scores.incidents || 0}%</span>
      </td>
      
      {/* Trend Chart */}
      <td className="py-3 px-4">
        <MiniSparkLine score={overall} />
      </td>
    </motion.tr>
  );
};

export default function ReliabilityPerformancePage() {
  const { t } = useLanguage();
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [selectedNode, setSelectedNode] = useState(null);

  // Fetch reliability scores
  const { data: reliabilityData, isLoading } = useQuery({
    queryKey: ["reliability-scores"],
    queryFn: () => reliabilityAPI.getScores(),
  });

  // Get available levels
  const availableLevels = useMemo(() => {
    if (!reliabilityData?.nodes) return [];
    const levels = new Set(reliabilityData.nodes.map(n => n.node_level));
    return Array.from(levels);
  }, [reliabilityData]);

  // Filter nodes by selected level
  const filteredNodes = useMemo(() => {
    if (!reliabilityData?.nodes) return [];
    if (selectedLevel === "all") return reliabilityData.nodes;
    return reliabilityData.nodes.filter(n => n.node_level === selectedLevel);
  }, [reliabilityData, selectedLevel]);

  // Calculate aggregated scores for selected level or all
  const aggregatedScores = useMemo(() => {
    if (!filteredNodes.length) return reliabilityData?.global_scores || {};
    
    const totals = { criticality: 0, incidents: 0, investigations: 0, maintenance: 0, reactions: 0, threats: 0 };
    filteredNodes.forEach(n => {
      Object.keys(totals).forEach(k => {
        totals[k] += n.scores?.[k] || 0;
      });
    });
    Object.keys(totals).forEach(k => {
      totals[k] = Math.round(totals[k] / filteredNodes.length);
    });
    return totals;
  }, [filteredNodes, reliabilityData]);

  const aggregatedOverall = useMemo(() => {
    const vals = Object.values(aggregatedScores);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [aggregatedScores]);

  // Count alerts (items with score < 40) and stars (items with score >= 80)
  const alerts = filteredNodes.filter(n => n.overall_score < 40).length;
  const stars = filteredNodes.filter(n => n.overall_score >= 80).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="loading-dots"><span></span><span></span><span></span></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white" data-testid="reliability-performance-page">
      {/* Top Section - Snowflake and Stats */}
      <div className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left - Title and Level Selector */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-white">{t("dashboard.reliabilityPerformance") || "Reliability Performance"}</h1>
                <p className="text-slate-400 text-sm mt-1">
                  {selectedLevel === "all" 
                    ? `All ${reliabilityData?.total_equipment || 0} equipment items`
                    : `${filteredNodes.length} ${selectedLevel.replace(/_/g, ' ')} items`
                  }
                </p>
              </div>
              
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select hierarchy level" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">All Levels</SelectItem>
                  {availableLevels.map(level => (
                    <SelectItem key={level} value={level} className="text-white hover:bg-slate-700 capitalize">
                      {level.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Stat Cards Row */}
            <div className="flex flex-wrap gap-3 mb-6">
              {DIMENSIONS.map(dim => (
                <StatCard
                  key={dim.key}
                  label={dim.label}
                  value={aggregatedScores[dim.key] || 0}
                  percentage={aggregatedScores[dim.key] || 0}
                  icon={dim.icon}
                  trend={0}
                  accentColor={dim.color}
                />
              ))}
            </div>
          </div>
          
          {/* Right - Snowflake */}
          <div className="lg:w-auto">
            <ReliabilitySnowflake 
              scores={aggregatedScores}
              overall={aggregatedOverall}
              itemCount={filteredNodes.length}
              alerts={alerts}
              stars={stars}
            />
          </div>
        </div>
      </div>
      
      {/* Equipment Table */}
      <div className="px-6 pb-6">
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Table Header */}
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Equipment</h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-700 text-xs text-slate-300">{filteredNodes.length}</span>
            </div>
          </div>
          
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Equipment</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Overall</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Criticality</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Maintenance</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Threats</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Incidents</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Trend</th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.length > 0 ? (
                  filteredNodes.map(item => (
                    <EquipmentRow 
                      key={item.node_id} 
                      item={item}
                      onSelect={setSelectedNode}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center">
                        <Building2 className="w-12 h-12 text-slate-600 mb-3" />
                        <p>No equipment found for this level</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
