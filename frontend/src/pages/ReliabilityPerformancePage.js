import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { reliabilityAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { motion } from "framer-motion";
import {
  Building2,
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
  Factory,
  Cog,
  Settings,
  Filter,
  Search,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";

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

// Reliability dimensions with colors - shorter labels for chart
const DIMENSIONS = [
  { key: "criticality", label: "Criticality", shortLabel: "Criticality", icon: Shield, color: "text-amber-600", bg: "bg-amber-50" },
  { key: "incidents", label: "Incidents", shortLabel: "Incidents", icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50" },
  { key: "investigations", label: "Investigations", shortLabel: "Investig.", icon: FileSearch, color: "text-teal-600", bg: "bg-teal-50" },
  { key: "maintenance", label: "Maintenance", shortLabel: "Mainten.", icon: Wrench, color: "text-red-600", bg: "bg-red-50" },
  { key: "reactions", label: "Reactions", shortLabel: "Reactions", icon: Activity, color: "text-purple-600", bg: "bg-purple-50" },
  { key: "threats", label: "Threats", shortLabel: "Threats", icon: Target, color: "text-emerald-600", bg: "bg-emerald-50" },
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
      labelX: centerX + (radius + 28) * Math.cos(angle),
      labelY: centerY + (radius + 28) * Math.sin(angle),
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

// Snowflake component - Light theme
const ReliabilitySnowflake = ({ scores = {}, overall = 0, itemCount = 0, alerts = 0, stars = 0 }) => {
  const size = 320;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 75;

  const normalizedScores = DIMENSIONS.map(dim => {
    const score = scores[dim.key];
    return typeof score === "number" ? Math.min(100, Math.max(0, score)) : 0;
  });

  // Calculate points with more space for labels
  const getPoints = () => {
    const angleStep = (2 * Math.PI) / DIMENSIONS.length;
    const startAngle = -Math.PI / 2;
    
    return normalizedScores.map((score, i) => {
      const angle = startAngle + i * angleStep;
      const r = (score / 100) * radius;
      return {
        x: centerX + r * Math.cos(angle),
        y: centerY + r * Math.sin(angle),
        labelX: centerX + (radius + 55) * Math.cos(angle),
        labelY: centerY + (radius + 55) * Math.sin(angle),
        score,
        angle,
      };
    });
  };
  
  const points = getPoints();
  const gridCircles = [0.25, 0.5, 0.75, 1].map(f => radius * f);

  const getAssessment = (score) => {
    if (score >= 80) return "Excellent reliability performance";
    if (score >= 60) return "Good performance with room to improve";
    if (score >= 40) return "Several reliability gaps need attention";
    return "Significant concerns requiring action";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <svg width={size} height={size} className="mx-auto" style={{ overflow: 'visible' }}>
        {/* Background */}
        <circle cx={centerX} cy={centerY} r={radius + 10} fill="#f8fafc" />
        
        {/* Grid circles */}
        {gridCircles.map((r, i) => (
          <circle key={i} cx={centerX} cy={centerY} r={r} fill="none" stroke="#e2e8f0" strokeWidth={1} strokeDasharray={i < 3 ? "3,3" : "0"} />
        ))}
        
        {/* Spokes */}
        {DIMENSIONS.map((_, i) => {
          const angle = -Math.PI / 2 + i * (2 * Math.PI / DIMENSIONS.length);
          return (
            <line key={i} x1={centerX} y1={centerY} x2={centerX + radius * Math.cos(angle)} y2={centerY + radius * Math.sin(angle)} stroke="#e2e8f0" strokeWidth={1} />
          );
        })}
        
        {/* Filled area */}
        <path d={createRadarPath(points)} fill="#EAB308" fillOpacity={0.5} stroke="#EAB308" strokeWidth={2} />
        
        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill="#EAB308" stroke="#fff" strokeWidth={2} />
        ))}
        
        {/* Labels - Full text, proper positioning */}
        {points.map((p, i) => {
          const dim = DIMENSIONS[i];
          const isLeft = Math.abs(p.angle) > Math.PI / 2;
          const isTop = p.angle < -Math.PI / 4 && p.angle > -3 * Math.PI / 4;
          const isBottom = p.angle > Math.PI / 4 && p.angle < 3 * Math.PI / 4;
          let anchor = "middle";
          if (!isTop && !isBottom) anchor = isLeft ? "end" : "start";
          
          return (
            <text 
              key={i} 
              x={p.labelX} 
              y={p.labelY} 
              textAnchor={anchor} 
              dominantBaseline="middle" 
              fontSize="11"
              fontWeight="600"
              fill="#475569"
            >
              {dim.shortLabel}
            </text>
          );
        })}
        
        {/* Center score */}
        <text x={centerX} y={centerY - 8} textAnchor="middle" fontSize="28" fontWeight="bold" fill="#EAB308">{overall}</text>
        <text x={centerX} y={centerY + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">SCORE</text>
      </svg>
      
      <p className="text-center mt-3 text-sm text-slate-600">{getAssessment(overall)}</p>
      
      {/* Bottom stats */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-slate-100">
        <span className="text-sm text-slate-500">{itemCount} equipment</span>
        {alerts > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded-full">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span className="text-xs font-medium text-red-600">{alerts} alerts</span>
          </span>
        )}
        {stars > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 rounded-full">
            <span className="text-xs text-emerald-500">★</span>
            <span className="text-xs font-medium text-emerald-600">{stars} excellent</span>
          </span>
        )}
      </div>
    </div>
  );
};

// Stat Card component - matching Threats page style
const StatCard = ({ label, value, icon: Icon, color, bg }) => {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
      <div className={`p-1.5 rounded-md ${bg}`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div>
        <span className="text-lg font-bold text-slate-900">{value}%</span>
        <span className="text-xs text-slate-500 ml-1">{label}</span>
      </div>
    </div>
  );
};

// Mini spark line for equipment rows
const MiniSparkLine = ({ score }) => {
  const color = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  const width = 80;
  const height = 24;
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

// Equipment Row component - light theme
const EquipmentRow = ({ item, onSelect }) => {
  const scores = item.scores || {};
  const overall = item.overall_score || 0;
  const LevelIcon = LEVEL_ICONS[item.node_level] || Cog;
  
  const getScoreColor = (score) => {
    if (score >= 70) return "text-emerald-600";
    if (score >= 40) return "text-amber-600";
    return "text-red-600";
  };
  
  const getScoreBadge = (score) => {
    if (score >= 70) return { bg: "bg-emerald-50", text: "text-emerald-600", label: "Good" };
    if (score >= 40) return { bg: "bg-amber-50", text: "text-amber-600", label: "Fair" };
    return { bg: "bg-red-50", text: "text-red-600", label: "Poor" };
  };
  
  const badge = getScoreBadge(overall);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all"
      onClick={() => onSelect && onSelect(item)}
    >
      {/* Equipment Icon & Name */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-10 h-10 rounded-xl ${badge.bg} flex items-center justify-center flex-shrink-0`}>
          <LevelIcon className={`w-5 h-5 ${badge.text}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{item.node_name}</p>
          <p className={`text-xs ${badge.text}`}>{badge.label} • {item.node_level?.replace(/_/g, ' ')}</p>
        </div>
      </div>
      
      {/* Overall Score */}
      <div className="text-center w-16">
        <span className={`text-lg font-bold ${getScoreColor(overall)}`}>{overall}%</span>
      </div>
      
      {/* Dimension Scores */}
      <div className="hidden md:flex items-center gap-3">
        <div className="text-center w-14">
          <p className="text-xs text-slate-400">Crit</p>
          <p className={`text-sm font-semibold ${getScoreColor(scores.criticality || 0)}`}>{scores.criticality || 0}%</p>
        </div>
        <div className="text-center w-14">
          <p className="text-xs text-slate-400">Maint</p>
          <p className={`text-sm font-semibold ${getScoreColor(scores.maintenance || 0)}`}>{scores.maintenance || 0}%</p>
        </div>
        <div className="text-center w-14">
          <p className="text-xs text-slate-400">Threats</p>
          <p className={`text-sm font-semibold ${getScoreColor(scores.threats || 0)}`}>{scores.threats || 0}%</p>
        </div>
        <div className="text-center w-14">
          <p className="text-xs text-slate-400">Incidents</p>
          <p className={`text-sm font-semibold ${getScoreColor(scores.incidents || 0)}`}>{scores.incidents || 0}%</p>
        </div>
      </div>
      
      {/* Trend Chart */}
      <div className="hidden lg:block">
        <MiniSparkLine score={overall} />
      </div>
    </motion.div>
  );
};

export default function ReliabilityPerformancePage() {
  const { t } = useLanguage();
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Filter nodes by selected level and search
  const filteredNodes = useMemo(() => {
    if (!reliabilityData?.nodes) return [];
    let nodes = reliabilityData.nodes;
    if (selectedLevel !== "all") {
      nodes = nodes.filter(n => n.node_level === selectedLevel);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      nodes = nodes.filter(n => n.node_name?.toLowerCase().includes(query));
    }
    return nodes;
  }, [reliabilityData, selectedLevel, searchQuery]);

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
      <div className="flex items-center justify-center py-16">
        <div className="loading-dots"><span></span><span></span><span></span></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 max-w-7xl" data-testid="reliability-performance-page">
      {/* Stats Row - matching Threats page style */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
        {DIMENSIONS.map(dim => (
          <StatCard
            key={dim.key}
            label={dim.label}
            value={aggregatedScores[dim.key] || 0}
            icon={dim.icon}
            color={dim.color}
            bg={dim.bg}
          />
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Equipment List */}
        <div className="lg:col-span-2">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search equipment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
              />
            </div>
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger className="w-full sm:w-56 h-11">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Filter by level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels ({reliabilityData?.total_equipment || 0})</SelectItem>
                {availableLevels.map(level => {
                  const count = reliabilityData?.nodes?.filter(n => n.node_level === level).length || 0;
                  return (
                    <SelectItem key={level} value={level} className="capitalize">
                      {level.replace(/_/g, ' ')} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Equipment List */}
          <div className="space-y-2">
            {filteredNodes.length > 0 ? (
              filteredNodes.map(item => (
                <EquipmentRow 
                  key={item.node_id} 
                  item={item}
                  onSelect={setSelectedNode}
                />
              ))
            ) : (
              <div className="empty-state py-16">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <Building2 className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">
                  {t("equipment.noEquipment") || "No Equipment Found"}
                </h3>
                <p className="text-slate-500">
                  {searchQuery ? "Try adjusting your search" : "Add equipment to your hierarchy to see reliability scores"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right - Snowflake */}
        <div>
          <ReliabilitySnowflake 
            scores={aggregatedScores}
            overall={aggregatedOverall}
            itemCount={filteredNodes.length}
            alerts={alerts}
            stars={stars}
          />
          
          {/* Dimension Breakdown */}
          <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Dimension Breakdown</h4>
            <div className="space-y-3">
              {DIMENSIONS.map(dim => (
                <div key={dim.key} className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md ${dim.bg}`}>
                    <dim.icon className={`w-3 h-3 ${dim.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600">{dim.label}</span>
                      <span className={`text-xs font-bold ${dim.color}`}>{aggregatedScores[dim.key] || 0}%</span>
                    </div>
                    <Progress value={aggregatedScores[dim.key] || 0} className="h-1.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Quick Stats */}
          {reliabilityData?.summary && (
            <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400" />
                Quick Stats
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">With Criticality</p>
                  <p className="text-lg font-bold text-slate-700">{reliabilityData.summary.with_criticality}</p>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg">
                  <p className="text-xs text-slate-500">Open Threats</p>
                  <p className="text-lg font-bold text-amber-600">{reliabilityData.summary.open_threats}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Investigations</p>
                  <p className="text-lg font-bold text-slate-700">{reliabilityData.summary.total_investigations}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Total Actions</p>
                  <p className="text-lg font-bold text-slate-700">{reliabilityData.summary.total_actions}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
