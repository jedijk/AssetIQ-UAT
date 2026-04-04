import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { equipmentHierarchyAPI, threatsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
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
  X,
  Plus,
  Info,
  Shield,
  Zap,
  Leaf,
  Star,
  Filter
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

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

// Get cumulative threat count for a node and all its descendants
function getCumulativeThreatCount(node, threatCountMap) {
  let count = threatCountMap.get(node.name) || 0;
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      count += getCumulativeThreatCount(child, threatCountMap);
    });
  }
  return count;
}

// Tree node component
const TreeNode = ({ node, children, isOpen, onToggle, onClick, isActive, level = 0, threatCount = 0, onAddThreat, onEditEquipment, t, equipmentTypes, isMobile = false }) => {
  const hasChildren = node.children && node.children.length > 0;
  const config = ISO_LEVEL_CONFIG[node.level] || ISO_LEVEL_CONFIG.equipment_unit;
  const Icon = config.icon;
  const critColor = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });
  const [showDetails, setShowDetails] = useState(false);
  const contextMenuRef = useRef(null);
  const detailsRef = useRef(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu({ show: false, x: 0, y: 0 });
      }
      if (detailsRef.current && !detailsRef.current.contains(e.target)) {
        setShowDetails(false);
      }
    };
    if (contextMenu.show || showDetails) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [contextMenu.show, showDetails]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY });
  };

  // Handle click/tap on the equipment name/info area (NOT the arrow)
  const handleClick = (e) => {
    if (isMobile) {
      // On mobile: single tap immediately shows context menu (no delay, no double-tap)
      const rect = e.currentTarget.getBoundingClientRect();
      const menuX = Math.min(rect.left + 20, window.innerWidth - 200);
      const menuY = Math.min(rect.bottom + 5, window.innerHeight - 150);
      
      setContextMenu({ 
        show: true, 
        x: menuX, 
        y: menuY 
      });
    } else {
      // Desktop behavior - single click navigates and toggles if has children
      if (hasChildren) onToggle?.();
      onClick?.();
    }
  };
  
  // Handle arrow click (expand/collapse only)
  const handleArrowClick = (e) => {
    e.stopPropagation();
    onToggle?.();
  };

  const handleAddThreatClick = () => {
    setContextMenu({ show: false, x: 0, y: 0 });
    onAddThreat?.(node.name);
  };

  const handleShowDetails = () => {
    setContextMenu({ show: false, x: 0, y: 0 });
    setShowDetails(true);
  };

  const handleFilterOn = () => {
    setContextMenu({ show: false, x: 0, y: 0 });
    onClick?.(); // Navigate to filtered observations
  };

  // Get equipment type name
  const getEquipmentTypeName = () => {
    if (!node.equipment_type) return null;
    const eqType = equipmentTypes?.find(et => et.id === node.equipment_type);
    return eqType?.name || node.equipment_type;
  };

  // Get discipline display name
  const getDisciplineDisplay = () => {
    const disciplines = {
      mechanical: { label: t ? t("library.mechanical") : "Mechanical", color: "bg-blue-100 text-blue-700" },
      electrical: { label: t ? t("library.electrical") : "Electrical", color: "bg-yellow-100 text-yellow-700" },
      instrumentation: { label: t ? t("library.instrumentation") : "Instrumentation", color: "bg-purple-100 text-purple-700" },
      process: { label: t ? t("library.process") : "Process", color: "bg-green-100 text-green-700" }
    };
    return disciplines[node.discipline] || null;
  };

  // Get criticality details
  const getCriticalityDetails = () => {
    if (!node.criticality) return null;
    const crit = node.criticality;
    return {
      level: crit.level,
      safety: crit.safety_impact || 0,
      production: crit.production_impact || 0,
      environmental: crit.environmental_impact || 0,
      reputation: crit.reputation_impact || 0,
      maxImpact: crit.max_impact || Math.max(crit.safety_impact || 0, crit.production_impact || 0, crit.environmental_impact || 0, crit.reputation_impact || 0)
    };
  };
  
  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
          isActive ? "bg-blue-50 text-blue-700" : "hover:bg-slate-100 text-slate-700"
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onContextMenu={handleContextMenu}
        data-testid={`hierarchy-node-${node.id}`}
      >
        {/* Arrow button - expand/collapse only, larger tap area on mobile */}
        {hasChildren ? (
          <button 
            className={`flex items-center justify-center hover:bg-slate-200 rounded transition-colors ${isMobile ? 'p-2 -m-1' : 'p-0.5'}`}
            onClick={handleArrowClick}
            data-testid={`hierarchy-expand-${node.id}`}
          >
            {isOpen ? (
              <ChevronDown className={`${isMobile ? 'w-5 h-5' : 'w-3.5 h-3.5'} text-slate-400`} />
            ) : (
              <ChevronRight className={`${isMobile ? 'w-5 h-5' : 'w-3.5 h-3.5'} text-slate-400`} />
            )}
          </button>
        ) : (
          <span className={isMobile ? 'w-7' : 'w-4.5'} />
        )}
        
        {/* Equipment info - clickable area for context menu on mobile */}
        <div 
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
          onClick={handleClick}
          data-testid={`hierarchy-item-${node.id}`}
        >
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
      </div>
      
      {/* Context Menu */}
      {contextMenu.show && (
        <div 
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleFilterOn}
            className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 text-slate-700 hover:text-blue-700"
            data-testid="context-menu-filter-on"
          >
            <Filter className="w-4 h-4" />
            {t?.("hierarchy.filterOn") || "Filter on"}
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            onClick={handleShowDetails}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700 hover:text-slate-900"
            data-testid="context-menu-show-details"
          >
            <Info className="w-4 h-4" />
            {t?.("hierarchy.showDetails") || "Show Details"}
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            onClick={handleAddThreatClick}
            className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 text-slate-700 hover:text-blue-700"
            data-testid="context-menu-add-threat"
          >
            <Plus className="w-4 h-4" />
            {t?.("hierarchy.addThreat") || "Add Observation"}
          </button>
        </div>
      )}

      {/* Details Popup */}
      {showDetails && (
        <div 
          ref={detailsRef}
          className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50 w-72"
          style={{ 
            left: Math.min(contextMenu.x, window.innerWidth - 300), 
            top: Math.min(contextMenu.y, window.innerHeight - 350) 
          }}
        >
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              node.criticality?.level === 'safety_critical' ? 'bg-red-100' :
              node.criticality?.level === 'production_critical' ? 'bg-orange-100' :
              node.criticality?.level === 'medium' ? 'bg-yellow-100' : 'bg-slate-100'
            }`}>
              <Icon className={`w-5 h-5 ${critColor || config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm leading-tight">{node.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{config.label}</p>
            </div>
            <button 
              onClick={() => setShowDetails(false)}
              className="p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Details Grid */}
          <div className="space-y-3">
            {/* Equipment Type */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t ? t("hierarchy.equipmentType") : "Equipment Type"}</label>
              {getEquipmentTypeName() ? (
                <Badge variant="outline" className="bg-slate-50">{getEquipmentTypeName()}</Badge>
              ) : (
                <span className="text-sm text-slate-400 italic">{t ? t("hierarchy.notAssigned") : "Not assigned"}</span>
              )}
            </div>

            {/* Discipline */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t ? t("hierarchy.discipline") : "Discipline"}</label>
              {getDisciplineDisplay() ? (
                <Badge className={getDisciplineDisplay().color}>{getDisciplineDisplay().label}</Badge>
              ) : (
                <span className="text-sm text-slate-400 italic">{t ? t("hierarchy.notAssigned") : "Not assigned"}</span>
              )}
            </div>

            {/* Criticality */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t ? t("hierarchy.criticality") : "Criticality"}</label>
              {getCriticalityDetails() ? (
                <div className="space-y-2">
                  {/* 4-Dimension Bars */}
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    <div className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Shield className="w-3.5 h-3.5 text-red-500" />
                        <div className="flex gap-px">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-3 rounded-sm ${i <= getCriticalityDetails().safety ? 'bg-red-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500">{getCriticalityDetails().safety}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Cog className="w-3.5 h-3.5 text-orange-500" />
                        <div className="flex gap-px">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-3 rounded-sm ${i <= getCriticalityDetails().production ? 'bg-orange-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500">{getCriticalityDetails().production}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Leaf className="w-3.5 h-3.5 text-green-500" />
                        <div className="flex gap-px">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-3 rounded-sm ${i <= getCriticalityDetails().environmental ? 'bg-green-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500">{getCriticalityDetails().environmental}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Star className="w-3.5 h-3.5 text-purple-500" />
                        <div className="flex gap-px">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-3 rounded-sm ${i <= getCriticalityDetails().reputation ? 'bg-purple-500' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500">{getCriticalityDetails().reputation}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-slate-400 italic">{t ? t("equipment.noCriticality") : "No criticality assigned"}</span>
              )}
            </div>

            {/* Tag if available */}
            {node.tag && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">{t ? t("equipment.tag") : "Tag"}</label>
                <span className="text-sm font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{node.tag}</span>
              </div>
            )}

            {/* Description if available */}
            {node.description && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">{t ? t("common.description") : "Description"}</label>
                <p className="text-sm text-slate-600 line-clamp-2">{node.description}</p>
              </div>
            )}
          </div>

          {/* Edit Button */}
          <div className="mt-4 pt-3 border-t border-slate-200">
            <Button 
              size="sm" 
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                setShowDetails(false);
                onEditEquipment?.(node.id);
              }}
              data-testid="edit-equipment-btn"
            >
              <Settings className="w-4 h-4 mr-2" />
              {t ? t("hierarchy.editInManager") : "Edit in Equipment Manager"}
            </Button>
          </div>
        </div>
      )}
      
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

const EquipmentHierarchy = ({ isOpen, onClose, isMobile = false, onAddThreat }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  
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

  // Fetch equipment types for details popup
  const { data: typesData } = useQuery({
    queryKey: ["equipment-types"],
    queryFn: equipmentHierarchyAPI.getEquipmentTypes,
    staleTime: 60000,
  });

  // Fetch threats to show counts
  const { data: threats = [] } = useQuery({
    queryKey: ["threats"],
    queryFn: () => threatsAPI.getAll(),
  });

  const nodes = nodesData?.nodes || [];
  const equipmentTypes = typesData?.equipment_types || [];
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

  // Helper function to collect all descendant names (including the node itself)
  const collectAllDescendantNames = (node) => {
    const names = [node.name];
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        names.push(...collectAllDescendantNames(child));
      });
    }
    return names;
  };

  const handleNodeClick = (node) => {
    setSelectedNodeId(node.id);
    // Collect all asset names from this node and its descendants
    const allAssetNames = collectAllDescendantNames(node);
    // Navigate to threats page filtered by all these assets
    navigate(`/threats?assets=${encodeURIComponent(allAssetNames.join(','))}&assetName=${encodeURIComponent(node.name)}`);
    if (isMobile) onClose?.();
  };

  // Navigate to Equipment Manager with selected equipment for editing
  const handleEditEquipment = (nodeId) => {
    navigate(`/equipment-manager?edit=${nodeId}`);
    if (isMobile) onClose?.();
  };

  // Render tree recursively
  const renderTree = (treeNodes, level = 0) => {
    return treeNodes
      .filter(node => !filterLevel || node.level === filterLevel)
      .map(node => {
        // Only show direct threat count for this specific node
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
            onAddThreat={onAddThreat}
            onEditEquipment={handleEditEquipment}
            t={t}
            equipmentTypes={equipmentTypes}
            isMobile={isMobile}
          >
            {node.children && node.children.length > 0 && renderTree(node.children, level + 1)}
          </TreeNode>
        );
      });
  };

  // Content component
  const Content = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center justify-between p-3 border-b border-slate-200 flex-shrink-0 ${isMobile ? 'bg-white sticky top-0 z-10' : ''}`}>
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900">{isMobile ? 'Equipment Hierarchy' : 'Hierarchy'}</h2>
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
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        {isMobile && (
          <p className="text-xs text-slate-400 mb-2 text-center">
            Tap item for options • Tap arrow to expand
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            <span className="font-medium">{nodes.length}</span> items
          </span>
          <button
            onClick={() => { navigate("/equipment-manager"); if (isMobile) onClose?.(); }}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Manage
          </button>
        </div>
      </div>
    </div>
  );

  // Mobile: render full-screen overlay
  if (isMobile) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
        <Content />
      </div>
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
