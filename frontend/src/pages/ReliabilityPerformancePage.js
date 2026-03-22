import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { reliabilityAPI, equipmentHierarchyAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import ReliabilitySnowflake, { RELIABILITY_DIMENSIONS } from "../components/ReliabilitySnowflake";
import { motion } from "framer-motion";
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Target,
  TrendingUp,
  AlertTriangle,
  Shield,
  Wrench,
  FileSearch,
  Activity,
  Layers,
  Info,
  Filter,
  BarChart3,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ScrollArea } from "../components/ui/scroll-area";
import { Progress } from "../components/ui/progress";

// Level icons map
const LEVEL_ICONS = {
  installation: Building2,
  plant: Layers,
  section: Target,
  equipment_unit: Wrench,
  subunit: Activity,
  maintainable_item: Shield,
};

// Score color helper
const getScoreColor = (score) => {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
};

const getScoreBg = (score) => {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
};

// Dimension icon map
const DIMENSION_ICONS = {
  criticality: Shield,
  incidents: AlertTriangle,
  investigations: FileSearch,
  maintenance: Wrench,
  reactions: Activity,
  threats: Target,
};

// Equipment Node Row Component
const EquipmentScoreRow = ({ node, isExpanded, onToggle, onSelect, isSelected, children, depth = 0 }) => {
  const hasChildren = children && children.length > 0;
  const LevelIcon = LEVEL_ICONS[node.node_level] || Building2;
  const scores = node.aggregated_scores || node.scores;
  const overall = node.aggregated_overall || node.overall_score;
  
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div
        className={`flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors ${
          isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
        }`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Expand/Collapse */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle && onToggle(); }}
          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 ${!hasChildren ? "invisible" : ""}`}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        
        {/* Icon & Name */}
        <LevelIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium text-slate-700 truncate">{node.node_name}</span>
        
        {/* Mini Score Bars */}
        <div className="flex items-center gap-1 mr-2">
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} className="w-1.5 h-6 bg-slate-200 rounded-full overflow-hidden" title={`${key}: ${value}%`}>
              <div 
                className={`w-full transition-all ${getScoreBg(value)}`}
                style={{ height: `${value}%` }}
              />
            </div>
          ))}
        </div>
        
        {/* Overall Score Badge */}
        <div className={`text-sm font-bold w-12 text-right ${getScoreColor(overall)}`}>
          {overall}%
        </div>
      </div>
      
      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="bg-slate-50/50">
          {children}
        </div>
      )}
    </div>
  );
};

// Dimension Detail Card
const DimensionCard = ({ dimension, score, description }) => {
  const Icon = DIMENSION_ICONS[dimension] || Target;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-slate-200 p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${getScoreBg(score)} bg-opacity-10`}>
            <Icon className={`w-4 h-4 ${getScoreColor(score)}`} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-700 capitalize">{dimension}</h4>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
        <span className={`text-xl font-bold ${getScoreColor(score)}`}>{score}%</span>
      </div>
      <Progress value={score} className="h-2" />
    </motion.div>
  );
};

// Level Summary Card
const LevelSummaryCard = ({ level, count, avgScore }) => {
  const Icon = LEVEL_ICONS[level] || Building2;
  const label = level.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-slate-100">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-700">{count} items</p>
      </div>
      <div className={`text-lg font-bold ${getScoreColor(avgScore)}`}>
        {avgScore}%
      </div>
    </div>
  );
};

export default function ReliabilityPerformancePage() {
  const { t } = useLanguage();
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [levelFilter, setLevelFilter] = useState("all");

  // Fetch reliability scores
  const { data: reliabilityData, isLoading } = useQuery({
    queryKey: ["reliability-scores"],
    queryFn: () => reliabilityAPI.getScores(),
  });

  // Fetch hierarchy for tree structure
  const { data: hierarchyData = [] } = useQuery({
    queryKey: ["equipment"],
    queryFn: equipmentHierarchyAPI.getAll,
  });

  // Build tree structure from flat nodes
  const treeData = useMemo(() => {
    if (!reliabilityData?.nodes) return [];
    
    const nodes = reliabilityData.nodes;
    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.node_id] = { ...n, children: [] }; });
    
    const roots = [];
    nodes.forEach(n => {
      if (n.parent_id && nodeMap[n.parent_id]) {
        nodeMap[n.parent_id].children.push(nodeMap[n.node_id]);
      } else if (!n.parent_id) {
        roots.push(nodeMap[n.node_id]);
      }
    });
    
    return roots;
  }, [reliabilityData]);

  // Calculate level summaries
  const levelSummaries = useMemo(() => {
    if (!reliabilityData?.nodes) return {};
    
    const summaries = {};
    reliabilityData.nodes.forEach(n => {
      const level = n.node_level;
      if (!summaries[level]) {
        summaries[level] = { count: 0, totalScore: 0 };
      }
      summaries[level].count++;
      summaries[level].totalScore += n.overall_score;
    });
    
    Object.keys(summaries).forEach(level => {
      summaries[level].avgScore = Math.round(summaries[level].totalScore / summaries[level].count);
    });
    
    return summaries;
  }, [reliabilityData]);

  // Toggle node expansion
  const toggleExpanded = (nodeId) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  // Render tree recursively
  const renderTree = (nodes, depth = 0) => {
    return nodes.map(node => (
      <EquipmentScoreRow
        key={node.node_id}
        node={node}
        depth={depth}
        isExpanded={expandedNodes.has(node.node_id)}
        onToggle={() => toggleExpanded(node.node_id)}
        onSelect={setSelectedNode}
        isSelected={selectedNode?.node_id === node.node_id}
      >
        {node.children?.length > 0 && expandedNodes.has(node.node_id) && renderTree(node.children, depth + 1)}
      </EquipmentScoreRow>
    ));
  };

  // Get display scores (selected node or global)
  const displayScores = selectedNode 
    ? (selectedNode.aggregated_scores || selectedNode.scores)
    : reliabilityData?.global_scores || {};

  const displayOverall = selectedNode
    ? (selectedNode.aggregated_overall || selectedNode.overall_score)
    : reliabilityData?.global_overall || 0;

  // Get dimension descriptions
  const getDimensionDescription = (key) => {
    const dim = RELIABILITY_DIMENSIONS.find(d => d.key === key);
    return dim?.description || "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-dots"><span></span><span></span><span></span></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="reliability-performance-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("dashboard.reliabilityPerformance") || "Reliability Performance"}
        </h1>
        <p className="text-slate-500">
          {t("dashboard.reliabilitySubtitle") || "Holistic view of reliability management across your asset hierarchy"}
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Equipment Tree */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Tree Header */}
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-700">
                  {t("equipment.hierarchy") || "Equipment Hierarchy"}
                </h3>
                <span className="text-xs text-slate-400">
                  ({reliabilityData?.total_equipment || 0} {t("dashboard.items") || "items"})
                </span>
              </div>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-40 h-8">
                  <Filter className="w-4 h-4 mr-1" />
                  <SelectValue placeholder="Filter by level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  {Object.keys(levelSummaries).map(level => (
                    <SelectItem key={level} value={level}>
                      {level.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tree Content */}
            <ScrollArea className="h-[500px]">
              {treeData.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {renderTree(treeData)}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                  <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                  <h3 className="text-lg font-semibold text-slate-600 mb-1">
                    {t("equipment.noEquipment") || "No Equipment"}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {t("dashboard.addEquipmentFirst") || "Add equipment to your hierarchy to see reliability scores"}
                  </p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Level Summaries */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(levelSummaries).map(([level, summary]) => (
              <LevelSummaryCard
                key={level}
                level={level}
                count={summary.count}
                avgScore={summary.avgScore}
              />
            ))}
          </div>
        </div>

        {/* Right: Snowflake + Details */}
        <div className="space-y-6">
          {/* Snowflake Chart */}
          <ReliabilitySnowflake
            scores={displayScores}
            title={selectedNode ? selectedNode.node_name : "Global Performance"}
            subtitle={selectedNode 
              ? `${selectedNode.node_level.replace(/_/g, " ")} • ${selectedNode.child_count || 0} sub-items`
              : `${reliabilityData?.total_equipment || 0} equipment items`
            }
            size={280}
            showLegend={false}
            darkMode={true}
          />

          {/* Dimension Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {t("dashboard.dimensionDetails") || "Dimension Details"}
            </h4>
            {Object.entries(displayScores).map(([key, score]) => (
              <DimensionCard
                key={key}
                dimension={key}
                score={score}
                description={getDimensionDescription(key)}
              />
            ))}
          </div>

          {/* Quick Stats */}
          {reliabilityData?.summary && (
            <div className="bg-slate-900 rounded-xl p-4 text-white">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" />
                {t("dashboard.quickStats") || "Quick Stats"}
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">With Criticality</p>
                  <p className="font-semibold">{reliabilityData.summary.with_criticality}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Open Threats</p>
                  <p className="font-semibold text-amber-400">{reliabilityData.summary.open_threats}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Investigations</p>
                  <p className="font-semibold">{reliabilityData.summary.total_investigations}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Total Actions</p>
                  <p className="font-semibold">{reliabilityData.summary.total_actions}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
