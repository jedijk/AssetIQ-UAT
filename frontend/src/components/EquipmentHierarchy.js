import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { equipmentHierarchyAPI, threatsAPI } from "../lib/api";
import { 
  ChevronRight, 
  ChevronDown,
  Building2,
  Factory,
  Settings,
  Cog,
  Box,
  Wrench,
  Layers,
  AlertTriangle,
  X
} from "lucide-react";
import { Button } from "./ui/button";

// ISO 14224 Level Configuration
const ISO_LEVEL_CONFIG = {
  installation: { icon: Building2, label: "Installation", color: "text-blue-600" },
  plant_unit: { icon: Factory, label: "Plant/Unit", color: "text-indigo-600" },
  section_system: { icon: Settings, label: "Section/System", color: "text-purple-600" },
  equipment_unit: { icon: Cog, label: "Equipment Unit", color: "text-orange-600" },
  subunit: { icon: Box, label: "Subunit", color: "text-teal-600" },
  maintainable_item: { icon: Wrench, label: "Maintainable Item", color: "text-slate-600" },
  // Legacy support
  unit: { icon: Factory, label: "Plant/Unit", color: "text-indigo-600" },
  system: { icon: Settings, label: "Section/System", color: "text-purple-600" },
  equipment: { icon: Cog, label: "Equipment Unit", color: "text-orange-600" },
};

const ISO_LEVEL_ORDER = ["installation", "plant_unit", "section_system", "equipment_unit", "subunit", "maintainable_item"];

// Criticality colors
const CRIT_COLORS = {
  safety_critical: "text-red-500",
  production_critical: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-green-500"
};

// Build tree from flat nodes
function buildTreeData(nodes, parentId = null) {
  return nodes
    .filter(n => n.parent_id === parentId)
    .map(node => ({
      ...node,
      children: buildTreeData(nodes, node.id)
    }));
}

// Get threat count per equipment node
function getThreatCountByAsset(threats) {
  const countMap = new Map();
  threats.forEach(threat => {
    const asset = threat.asset;
    if (asset) {
      countMap.set(asset, (countMap.get(asset) || 0) + 1);
    }
  });
  return countMap;
}

// Tree node component
const TreeNode = ({ node, children, isOpen, onToggle, onClick, isActive, level = 0, threatCount = 0 }) => {
  const hasChildren = node.children && node.children.length > 0;
  const config = ISO_LEVEL_CONFIG[node.level] || ISO_LEVEL_CONFIG.equipment_unit;
  const Icon = config.icon;
  const critColor = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  
  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isActive ? "bg-blue-50 text-blue-700" : "hover:bg-slate-100 text-slate-700"
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => {
          if (hasChildren) onToggle?.();
          onClick?.();
        }}
        data-testid={`hierarchy-node-${node.id}`}
      >
        {hasChildren ? (
          <button 
            className="p-0.5 hover:bg-slate-200 rounded" 
            onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          >
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-4.5" />
        )}
        <Icon className={`w-4 h-4 ${critColor || config.color} flex-shrink-0`} />
        <span className="text-sm font-medium truncate flex-1">{node.name}</span>
        {threatCount > 0 && (
          <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {threatCount}
          </span>
        )}
        {node.criticality?.level && (
          <span className={`w-2 h-2 rounded-full ${
            node.criticality.level === 'safety_critical' ? 'bg-red-500' :
            node.criticality.level === 'production_critical' ? 'bg-orange-500' :
            node.criticality.level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
          }`} />
        )}
      </div>
      {hasChildren && isOpen && (
        <div>
          {children}
        </div>
      )}
    </div>
  );
};

// ISO Level Summary Item
const LevelSummaryItem = ({ level, count, isActive, onClick }) => {
  const config = ISO_LEVEL_CONFIG[level] || { icon: Cog, label: level, color: "text-slate-600" };
  const Icon = config.icon;
  
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors w-full text-left ${
        isActive ? "bg-blue-50 text-blue-700" : "hover:bg-slate-100 text-slate-600"
      }`}
      data-testid={`iso-level-${level}`}
    >
      <Icon className={`w-4 h-4 ${config.color}`} />
      <span className="text-sm font-medium flex-1">{config.label}</span>
      <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
        {count}
      </span>
    </button>
  );
};

const EquipmentHierarchy = ({ isOpen, onClose, isMobile = false }) => {
  const navigate = useNavigate();
  
  // Load expanded nodes from localStorage on initial render
  const [expandedNodes, setExpandedNodes] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar-hierarchy-expanded');
      return saved ? new Set(JSON.parse(saved)) : new Set(["all"]);
    } catch {
      return new Set(["all"]);
    }
  });
  
  // Persist expanded nodes to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('sidebar-hierarchy-expanded', JSON.stringify([...expandedNodes]));
    } catch (e) {
      console.error('Failed to save expanded state:', e);
    }
  }, [expandedNodes]);
  
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [viewMode, setViewMode] = useState("tree"); // "tree" or "levels"
  const [filterLevel, setFilterLevel] = useState(null);

  // Fetch equipment hierarchy nodes
  const { data: nodesData, isLoading: nodesLoading } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: equipmentHierarchyAPI.getNodes,
    staleTime: 30000,
  });

  // Fetch threats to show counts
  const { data: threats = [] } = useQuery({
    queryKey: ["threats"],
    queryFn: () => threatsAPI.getAll(),
  });

  const nodes = nodesData?.nodes || [];
  const threatCountByAsset = useMemo(() => getThreatCountByAsset(threats), [threats]);
  
  // Build tree structure
  const treeData = useMemo(() => buildTreeData(nodes), [nodes]);
  
  // Legacy level mapping
  const LEGACY_LEVEL_MAP = {
    "unit": "plant_unit",
    "system": "section_system",
    "equipment": "equipment_unit"
  };
  
  // Count by ISO level (including legacy levels mapped to their ISO equivalents)
  const levelCounts = useMemo(() => {
    const counts = {};
    ISO_LEVEL_ORDER.forEach(level => { counts[level] = 0; });
    nodes.forEach(node => {
      // Normalize legacy levels to ISO 14224
      const normalizedLevel = LEGACY_LEVEL_MAP[node.level] || node.level;
      if (counts[normalizedLevel] !== undefined) {
        counts[normalizedLevel]++;
      }
    });
    return counts;
  }, [nodes]);

  const toggleNode = (nodeId) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleNodeClick = (node) => {
    setSelectedNodeId(node.id);
    // Navigate to threats page filtered by this equipment/asset
    navigate(`/threats?asset=${encodeURIComponent(node.name)}`);
    if (isMobile) onClose?.();
  };

  // Render tree recursively
  const renderTree = (treeNodes, level = 0) => {
    return treeNodes
      .filter(node => !filterLevel || node.level === filterLevel)
      .map(node => {
        const threatCount = threatCountByAsset.get(node.name) || 0;
        return (
          <TreeNode
            key={node.id}
            node={node}
            level={level}
            isOpen={expandedNodes.has(node.id)}
            onToggle={() => toggleNode(node.id)}
            onClick={() => handleNodeClick(node)}
            isActive={selectedNodeId === node.id}
            threatCount={threatCount}
          >
            {node.children && node.children.length > 0 && renderTree(node.children, level + 1)}
          </TreeNode>
        );
      });
  };

  // Content component
  const Content = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900">Hierarchy</h2>
        </div>
        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <Button
            variant={viewMode === "tree" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => { setViewMode("tree"); setFilterLevel(null); }}
          >
            Tree
          </Button>
          <Button
            variant={viewMode === "levels" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setViewMode("levels")}
          >
            Levels
          </Button>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-slate-400 ml-1"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {nodesLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="loading-dots"><span></span><span></span><span></span></div>
        </div>
      )}

      {/* Content */}
      {!nodesLoading && (
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {viewMode === "levels" ? (
            // ISO Levels View
            <div className="space-y-1">
              <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Hierarchy Levels
              </div>
              {ISO_LEVEL_ORDER.map(level => (
                <LevelSummaryItem
                  key={level}
                  level={level}
                  count={levelCounts[level] || 0}
                  isActive={filterLevel === level}
                  onClick={() => {
                    setFilterLevel(filterLevel === level ? null : level);
                    setViewMode("tree");
                  }}
                />
              ))}
            </div>
          ) : (
            // Tree View
            <>
              {filterLevel && (
                <div className="mb-2 px-2">
                  <div className="flex items-center justify-between bg-blue-50 rounded-lg px-2 py-1">
                    <span className="text-xs text-blue-700">
                      Showing: {ISO_LEVEL_CONFIG[filterLevel]?.label || filterLevel}
                    </span>
                    <button 
                      onClick={() => setFilterLevel(null)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              
              {treeData.length > 0 ? (
                <div className="space-y-0.5">
                  {renderTree(treeData)}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium">No equipment hierarchy</p>
                  <p className="text-xs mt-1">Go to Equipment Manager to create hierarchy</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate("/equipment-manager")}
                  >
                    Open Equipment Manager
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            <span className="font-medium">{nodes.length}</span> items
          </span>
          <button
            onClick={() => navigate("/equipment-manager")}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Manage
          </button>
        </div>
      </div>
    </>
  );

  // Mobile: render with overlay
  if (isMobile) {
    if (!isOpen) return null;
    return (
      <>
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
        />
        <div className="fixed left-0 top-16 h-[calc(100vh-64px)] w-72 bg-white border-r border-slate-200 z-40 flex flex-col shadow-lg">
          <Content />
        </div>
      </>
    );
  }

  // Desktop: render inline
  return (
    <div className="h-full flex flex-col">
      <Content />
    </div>
  );
};

export default EquipmentHierarchy;
