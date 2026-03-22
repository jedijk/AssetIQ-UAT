import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { equipmentHierarchyAPI } from "../lib/api";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import {
  ChevronRight, ChevronDown, ChevronUp, Building2, Factory, Cog, Settings, Wrench, Plus, Trash2, Edit,
  GripVertical, ShieldCheck, Gauge, Zap, Droplets, Wind, Thermometer, Box, CircleDot, 
  Pipette, Flame, Cpu, Search, Check, Upload, FileText, X, Package, Move, ArrowRight, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import BackButton from "../components/BackButton";

const EQUIPMENT_ICONS = { droplets: Droplets, wind: Wind, cog: Cog, thermometer: Thermometer, box: Box, "circle-dot": CircleDot, zap: Zap, gauge: Gauge, cpu: Cpu, pipette: Pipette, flame: Flame };
const ICON_OPTIONS = ["droplets", "wind", "cog", "thermometer", "box", "circle-dot", "zap", "gauge", "cpu", "pipette", "flame"];
// ISO 14224 Taxonomy Levels - aligned with standard terminology
const LEVEL_CONFIG = { 
  installation: { icon: Building2, label: "Installation", description: "Offshore platform, Onshore plant" }, 
  plant_unit: { icon: Factory, label: "Plant/Unit", description: "Production unit, Utility unit" }, 
  section_system: { icon: Settings, label: "Section/System", description: "Gas compression, Water injection" }, 
  equipment_unit: { icon: Cog, label: "Equipment Unit", description: "Compressor, Pump, Heat exchanger" }, 
  subunit: { icon: Box, label: "Subunit", description: "Driver, Driven unit, Control system" },
  maintainable_item: { icon: Wrench, label: "Maintainable Item", description: "Bearing, Seal, Impeller" },
  // Legacy level support for backward compatibility
  unit: { icon: Factory, label: "Plant/Unit", description: "Production unit, Utility unit" },
  system: { icon: Settings, label: "Section/System", description: "Gas compression, Water injection" },
  equipment: { icon: Cog, label: "Equipment Unit", description: "Compressor, Pump, Heat exchanger" }
};
const LEVEL_ORDER = ["installation", "plant_unit", "section_system", "equipment_unit", "subunit", "maintainable_item"];
const LEGACY_LEVEL_MAP = { "unit": "plant_unit", "system": "section_system", "equipment": "equipment_unit" };
const CRIT_COLORS = { safety_critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" }, production_critical: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500" }, medium: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-500" }, low: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500" } };
const DISCIPLINES = ["mechanical", "electrical", "instrumentation", "process"];

// Normalize legacy levels to ISO 14224 standard
function normalizeLevel(level) {
  return LEGACY_LEVEL_MAP[level] || level;
}

function getValidChildLevels(parentLevel) {
  const normalizedLevel = normalizeLevel(parentLevel);
  const idx = LEVEL_ORDER.indexOf(normalizedLevel);
  if (idx === -1 || idx >= LEVEL_ORDER.length - 1) return [];
  return [LEVEL_ORDER[idx + 1]];
}

function canBeChildOf(childLevel, parentLevel) {
  const normalizedParent = normalizeLevel(parentLevel);
  const normalizedChild = normalizeLevel(childLevel);
  const parentIdx = LEVEL_ORDER.indexOf(normalizedParent);
  const childIdx = LEVEL_ORDER.indexOf(normalizedChild);
  return parentIdx >= 0 && childIdx === parentIdx + 1;
}

function buildTreeData(nodes, parentId = null, depth = 0) {
  if (depth > 10) return [];
  return nodes.filter(n => n.parent_id === parentId).map(node => ({ ...node, children: buildTreeData(nodes, node.id, depth + 1) }));
}

function flattenTree(treeNodes, expandedIds, depth = 0) {
  const result = [];
  for (const node of treeNodes) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    result.push({ node, depth, hasChildren, isExpanded });
    if (isExpanded && hasChildren) result.push(...flattenTree(node.children, expandedIds, depth + 1));
  }
  return result;
}

// Tree Node Component with Drag-Drop for reorder, promote, demote, and unassigned items
function TreeNode({ node, depth, onSelect, isSelected, isExpanded, onExpand, hasChildren, allNodes, onDrop, onReorder, onChangeLevel, siblings, siblingIndex, isSearchMatch }) {
  const config = LEVEL_CONFIG[node.level] || { icon: Cog, label: "Unknown" };
  const LevelIcon = config.icon;
  const critColors = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState(null); // 'before', 'after', 'child'
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ 
      type: "hierarchy-node", 
      nodeId: node.id,
      nodeLevel: node.level,
      parentId: node.parent_id,
      sortOrder: node.sort_order || 0
    }));
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
    // Add a slight delay to show drag effect
    setTimeout(() => {
      e.target.style.opacity = "0.5";
    }, 0);
  };

  const handleDragEnd = (e) => {
    setIsDragging(false);
    e.target.style.opacity = "1";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    // Determine drop position based on mouse position
    if (y < height * 0.25) {
      setDropPosition("before");
    } else if (y > height * 0.75) {
      setDropPosition("after");
    } else {
      setDropPosition("child");
    }
    
    setIsDragOver(true);
    e.dataTransfer.dropEffect = "move";
  };
  
  const handleDragLeave = (e) => {
    // Only clear if we're actually leaving this element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
      setDropPosition(null);
    }
  };
  
  const handleDropOnNode = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDropPosition(null);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      
      if (data.type === "hierarchy-node") {
        // Don't drop on itself
        if (data.nodeId === node.id) return;
        
        const draggedNode = allNodes.find(n => n.id === data.nodeId);
        if (!draggedNode) return;
        
        // Prevent dropping parent onto its own child
        const isDescendant = (parentId, checkId) => {
          const children = allNodes.filter(n => n.parent_id === parentId);
          for (const child of children) {
            if (child.id === checkId) return true;
            if (isDescendant(child.id, checkId)) return true;
          }
          return false;
        };
        if (isDescendant(data.nodeId, node.id)) return;
        
        if (dropPosition === "child") {
          // Drop as child - this is a demote or move to new parent
          onChangeLevel?.(data.nodeId, node.id, "child");
        } else {
          // Drop before or after - reorder or change parent
          onReorder?.(data.nodeId, node.id, dropPosition, node.parent_id);
        }
      } else if (data.type === "unstructured") {
        // Handle unstructured item drop
        onDrop?.(e, node);
      }
    } catch (err) {
      console.error("Drop error:", err);
    }
  };

  const handleClick = () => {
    onSelect(node);
  };

  // Visual feedback classes
  const getDropIndicatorClass = () => {
    if (!isDragOver || !dropPosition) return "";
    if (dropPosition === "before") return "border-t-2 border-t-blue-500";
    if (dropPosition === "after") return "border-b-2 border-b-blue-500";
    if (dropPosition === "child") return "bg-blue-100 border-2 border-dashed border-blue-500";
    return "";
  };

  return (
    <div
      draggable={node.level !== "installation" || true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropOnNode}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50" :
        isSelected ? "bg-blue-50 border border-blue-200" : 
        isSearchMatch ? "bg-yellow-50 border border-yellow-300" :
        "hover:bg-slate-50 border border-transparent"
      } ${getDropIndicatorClass()}`}
      style={{ marginLeft: depth * 24 }}
      onClick={handleClick}
      data-testid={`tree-node-${node.id}`}
    >
      <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab" />
      
      <button 
        className={`w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 ${!hasChildren ? "invisible" : ""}`} 
        onClick={e => { e.stopPropagation(); onExpand(node.id); }}
      >
        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      
      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${critColors?.bg || "bg-slate-100"}`}>
        <LevelIcon className={`w-4 h-4 ${critColors?.text || "text-slate-600"}`} />
      </div>
      
      <span className={`flex-1 text-sm font-medium truncate ${isSearchMatch ? "text-yellow-800" : "text-slate-700"}`}>{node.name}</span>
      
      {isDragOver && dropPosition === "child" && (
        <span className="text-xs text-blue-600 font-medium">Drop as child</span>
      )}
      
      {isSearchMatch && (
        <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">Match</span>
      )}
      
      <span className="text-xs text-slate-400 hidden sm:block">{config.label}</span>
      {node.criticality && <div className={`w-2 h-2 rounded-full ${CRIT_COLORS[node.criticality.level]?.dot}`} />}
    </div>
  );
}

function UnstructuredItem({ item, onDragStart, onDelete }) {
  const Icon = item.detected_icon ? (EQUIPMENT_ICONS[item.detected_icon] || Package) : Package;
  return (
    <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-amber-200 cursor-grab hover:border-amber-400 hover:shadow-sm transition-all group" draggable onDragStart={(e) => onDragStart(e, item)} data-testid={`unstructured-item-${item.id}`}>
      <GripVertical className="w-4 h-4 text-amber-300" />
      <div className="w-7 h-7 rounded-md flex items-center justify-center bg-amber-50"><Icon className="w-4 h-4 text-amber-600" /></div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-slate-700 truncate block">{item.name}</span>
        {item.detected_type_name && <span className="text-xs text-amber-600">{item.detected_type_name}</span>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded"><X className="w-3 h-3 text-red-400" /></button>
    </div>
  );
}

function PropertiesPanel({ node, equipmentTypes, criticalityProfiles, disciplines, onUpdate, onAssignCriticality, onAssignDiscipline, onDelete }) {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  
  if (!node) return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <Settings className="w-12 h-12 text-slate-300 mb-3" />
      <h3 className="text-lg font-semibold text-slate-600 mb-1">No Selection</h3>
      <p className="text-sm text-slate-400">Select an item from the hierarchy to view properties</p>
      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-left">
        <h4 className="text-xs font-semibold text-blue-800 mb-1">Drag & Drop Tips</h4>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• Drag items to reorder within siblings</li>
          <li>• Drop on top/bottom edge to reorder</li>
          <li>• Drop in center to make child</li>
        </ul>
      </div>
    </div>
  );
  
  const config = LEVEL_CONFIG[node.level] || { icon: Cog, label: "Unknown" };
  const LevelIcon = config.icon;
  const critColors = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  
  const handleSave = () => { onUpdate(node.id, { name: editName, description: editDesc }); setIsEditing(false); };
  const startEdit = () => { setEditName(node.name); setEditDesc(node.description || ""); setIsEditing(true); };
  
  return (
    <div className="h-full flex flex-col" data-testid="properties-panel">
      <div className={`p-4 border-b border-slate-200 ${critColors?.bg || "bg-slate-50"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${critColors?.bg || "bg-white"} ${critColors?.border || "border-slate-200"} border`}>
            <LevelIcon className={`w-5 h-5 ${critColors?.text || "text-slate-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm font-semibold" autoFocus />
            ) : (
              <h3 className="font-semibold text-slate-800 truncate">{node.name}</h3>
            )}
            <p className="text-xs text-slate-500">{config.label}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => isEditing ? handleSave() : startEdit()}>
            {isEditing ? <Check className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Drag hint */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-slate-600">
              <GripVertical className="w-4 h-4" />
              <span className="text-xs font-medium">Drag to reorder or move</span>
            </div>
          </div>
          
          <div>
            <Label className="text-xs text-slate-500 mb-1">Description</Label>
            {isEditing ? (
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Add description..." className="h-8 text-sm" />
            ) : (
              <p className="text-sm text-slate-700">{node.description || <span className="text-slate-400 italic">No description</span>}</p>
            )}
          </div>
          
          {/* Equipment Type & Discipline - Only for Equipment Unit level and below */}
          {(node.level === "equipment_unit" || node.level === "equipment" || node.level === "subunit" || node.level === "maintainable_item") && (
            <>
              <div>
                <Label className="text-xs text-slate-500 mb-1">Equipment Type</Label>
                <Select 
                  value={node.equipment_type_id || "__none__"} 
                  onValueChange={v => {
                    const actualValue = v === "__none__" ? null : v;
                    const eqType = actualValue ? equipmentTypes?.find(t => t.id === actualValue) : null;
                    onUpdate(node.id, { 
                      equipment_type_id: actualValue,
                      discipline: eqType?.discipline || null
                    });
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-slate-400">None</span>
                    </SelectItem>
                    {equipmentTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              {node.equipment_type_id && (
                <div>
                  <Label className="text-xs text-slate-500 mb-1">Discipline</Label>
                  <div className="h-9 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600 capitalize">
                    {equipmentTypes?.find(t => t.id === node.equipment_type_id)?.discipline || "Not set"}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Auto-assigned from equipment type</p>
                </div>
              )}
            </>
          )}
          
          <div>
            <Label className="text-xs text-slate-500 mb-2">{t("equipment.criticality") || "Criticality Assessment"}</Label>
            
            {/* Four Criticality Dimensions */}
            <div className="space-y-3 bg-slate-50 p-3 rounded-lg">
              {/* Safety Impact */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-red-700">{t("equipment.safetyImpact") || "Safety"}</span>
                  <span className="text-xs text-slate-500">{node.criticality?.safety_impact || 0}/5</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => onAssignCriticality(node.id, { ...node.criticality, safety_impact: node.criticality?.safety_impact === level ? null : level })}
                      className={`flex-1 h-6 rounded transition-all ${
                        (node.criticality?.safety_impact || 0) >= level 
                          ? "bg-red-500" 
                          : "bg-red-100 hover:bg-red-200"
                      }`}
                      title={`Safety Impact: ${level}`}
                    />
                  ))}
                </div>
              </div>
              
              {/* Production Impact */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-orange-700">{t("equipment.productionImpact") || "Production"}</span>
                  <span className="text-xs text-slate-500">{node.criticality?.production_impact || 0}/5</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => onAssignCriticality(node.id, { ...node.criticality, production_impact: node.criticality?.production_impact === level ? null : level })}
                      className={`flex-1 h-6 rounded transition-all ${
                        (node.criticality?.production_impact || 0) >= level 
                          ? "bg-orange-500" 
                          : "bg-orange-100 hover:bg-orange-200"
                      }`}
                      title={`Production Impact: ${level}`}
                    />
                  ))}
                </div>
              </div>
              
              {/* Environmental Impact */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-green-700">{t("equipment.environmentalImpact") || "Environmental"}</span>
                  <span className="text-xs text-slate-500">{node.criticality?.environmental_impact || 0}/5</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => onAssignCriticality(node.id, { ...node.criticality, environmental_impact: node.criticality?.environmental_impact === level ? null : level })}
                      className={`flex-1 h-6 rounded transition-all ${
                        (node.criticality?.environmental_impact || 0) >= level 
                          ? "bg-green-500" 
                          : "bg-green-100 hover:bg-green-200"
                      }`}
                      title={`Environmental Impact: ${level}`}
                    />
                  ))}
                </div>
              </div>
              
              {/* Reputation Impact */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-purple-700">{t("equipment.reputationImpact") || "Reputation"}</span>
                  <span className="text-xs text-slate-500">{node.criticality?.reputation_impact || 0}/5</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => onAssignCriticality(node.id, { ...node.criticality, reputation_impact: node.criticality?.reputation_impact === level ? null : level })}
                      className={`flex-1 h-6 rounded transition-all ${
                        (node.criticality?.reputation_impact || 0) >= level 
                          ? "bg-purple-500" 
                          : "bg-purple-100 hover:bg-purple-200"
                      }`}
                      title={`Reputation Impact: ${level}`}
                    />
                  ))}
                </div>
              </div>
              
              {/* Overall Criticality Score */}
              {(node.criticality?.safety_impact || node.criticality?.production_impact || node.criticality?.environmental_impact || node.criticality?.reputation_impact) && (
                <div className="pt-2 border-t border-slate-200 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{t("equipment.overallCriticality") || "Overall Criticality"}</span>
                    <span className="text-sm font-bold text-slate-800">
                      {Math.max(
                        node.criticality?.safety_impact || 0,
                        node.criticality?.production_impact || 0,
                        node.criticality?.environmental_impact || 0,
                        node.criticality?.reputation_impact || 0
                      )}/5
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Delete button at the bottom */}
          {node.level !== "installation" && (
            <div className="pt-4 border-t border-slate-200">
              <Button 
                variant="outline" 
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => onDelete(node.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete {config.label}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function EquipmentManagerPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const fileInputRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  
  // Load expanded IDs from localStorage on initial render
  const [expandedIds, setExpandedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('equipment-hierarchy-expanded');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  
  // Persist expanded IDs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('equipment-hierarchy-expanded', JSON.stringify([...expandedIds]));
    } catch (e) {
      console.error('Failed to save expanded state:', e);
    }
  }, [expandedIds]);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [preSearchExpandedIds, setPreSearchExpandedIds] = useState(null); // Store expanded state before search
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newNode, setNewNode] = useState({ name: "", level: "installation", parent_id: null });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  // State for assigning unstructured items with level selection
  const [assignDialog, setAssignDialog] = useState({ open: false, item: null, parentNode: null, selectedLevel: "" });
  // State for move mode (legacy - kept for compatibility but not actively used with drag-drop)
  const [movingNode, setMovingNode] = useState(null);

  const { data: nodesData, isLoading } = useQuery({ queryKey: ["equipment-nodes"], queryFn: equipmentHierarchyAPI.getNodes });
  const { data: typesData } = useQuery({ queryKey: ["equipment-types"], queryFn: equipmentHierarchyAPI.getEquipmentTypes });
  const { data: profilesData } = useQuery({ queryKey: ["criticality-profiles"], queryFn: equipmentHierarchyAPI.getCriticalityProfiles });
  const { data: disciplinesData } = useQuery({ queryKey: ["disciplines"], queryFn: equipmentHierarchyAPI.getDisciplines });
  const { data: unstructuredData } = useQuery({ queryKey: ["unstructured-items"], queryFn: equipmentHierarchyAPI.getUnstructuredItems });

  const nodes = nodesData?.nodes || [];
  const equipmentTypes = typesData?.equipment_types || [];
  const criticalityProfiles = profilesData?.profiles || [];
  const disciplines = disciplinesData?.disciplines || [];
  const unstructuredItems = unstructuredData?.items || [];

  const treeData = useMemo(() => buildTreeData(nodes), [nodes]);
  
  // Handle edit query parameter - auto-select and expand to equipment
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editId = params.get('edit');
    if (editId && nodes.length > 0) {
      // Find the node to edit
      const nodeToEdit = nodes.find(n => n.id === editId);
      if (nodeToEdit) {
        setSelectedNode(nodeToEdit);
        
        // Expand all parents to make the node visible
        const parentIds = new Set();
        let currentId = nodeToEdit.parent_id;
        while (currentId) {
          parentIds.add(currentId);
          const parentNode = nodes.find(n => n.id === currentId);
          currentId = parentNode?.parent_id;
        }
        if (parentIds.size > 0) {
          setExpandedIds(prev => new Set([...prev, ...parentIds]));
        }
      }
    }
  }, [location.search, nodes]);
  
  // Search matching function - matches name, description, tag, and equipment type
  const nodeMatchesSearch = useCallback((node, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const nameMatch = node.name?.toLowerCase().includes(q);
    const descMatch = node.description?.toLowerCase().includes(q);
    const tagMatch = node.tag?.toLowerCase().includes(q);
    // Also check equipment type name if assigned
    const eqType = equipmentTypes.find(t => t.id === node.equipment_type_id);
    const typeMatch = eqType?.name?.toLowerCase().includes(q);
    return nameMatch || descMatch || tagMatch || typeMatch;
  }, [equipmentTypes]);
  
  // Find all parent IDs for a given node
  const getParentChain = useCallback((nodeId, nodeList) => {
    const parents = [];
    let current = nodeList.find(n => n.id === nodeId);
    while (current?.parent_id) {
      parents.push(current.parent_id);
      current = nodeList.find(n => n.id === current.parent_id);
    }
    return parents;
  }, []);
  
  // Get all matching node IDs and their parents (for auto-expand)
  const { matchingIds, expandForSearch } = useMemo(() => {
    if (!searchQuery) return { matchingIds: new Set(), expandForSearch: new Set() };
    const matching = new Set();
    const toExpand = new Set();
    nodes.forEach(node => {
      if (nodeMatchesSearch(node, searchQuery)) {
        matching.add(node.id);
        // Add all parents to expand set
        getParentChain(node.id, nodes).forEach(pid => toExpand.add(pid));
      }
    });
    return { matchingIds: matching, expandForSearch: toExpand };
  }, [nodes, searchQuery, nodeMatchesSearch, getParentChain]);
  
  // Auto-expand parents when searching
  useEffect(() => {
    if (searchQuery && expandForSearch.size > 0) {
      // Save current expanded state before search (only once when starting to search)
      if (preSearchExpandedIds === null) {
        setPreSearchExpandedIds(new Set(expandedIds));
      }
      // Expand all parents of matching nodes
      setExpandedIds(prev => {
        const newSet = new Set(prev);
        expandForSearch.forEach(id => newSet.add(id));
        return newSet;
      });
    } else if (!searchQuery && preSearchExpandedIds !== null) {
      // Restore original expanded state when search is cleared
      setExpandedIds(preSearchExpandedIds);
      setPreSearchExpandedIds(null);
    }
  }, [searchQuery, expandForSearch, preSearchExpandedIds]);
  
  const flatRows = useMemo(() => flattenTree(treeData, expandedIds), [treeData, expandedIds]);

  // Mutations
  const createMutation = useMutation({ mutationFn: equipmentHierarchyAPI.createNode, onSuccess: () => { queryClient.invalidateQueries(["equipment-nodes"]); toast.success("Node created"); setIsCreateOpen(false); setNewNode({ name: "", level: "installation", parent_id: null }); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const updateMutation = useMutation({ mutationFn: ({ nodeId, data }) => equipmentHierarchyAPI.updateNode(nodeId, data), onSuccess: data => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(data); toast.success("Updated"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const deleteMutation = useMutation({ 
    mutationFn: async (nodeId) => {
      // Find the node to delete before actually deleting
      const nodeToDelete = nodes.find(n => n.id === nodeId);
      const result = await equipmentHierarchyAPI.deleteNode(nodeId);
      return { result, deletedNode: nodeToDelete };
    }, 
    onSuccess: ({ deletedNode }) => { 
      if (deletedNode) {
        pushUndo({
          type: "DELETE_NODE",
          label: `Delete "${deletedNode.name}"`,
          data: deletedNode,
          undo: async () => {
            await equipmentHierarchyAPI.createNode({
              name: deletedNode.name,
              level: deletedNode.level,
              parent_id: deletedNode.parent_id,
              description: deletedNode.description,
              equipment_type_id: deletedNode.equipment_type_id,
              discipline: deletedNode.discipline
            });
            queryClient.invalidateQueries(["equipment-nodes"]);
          },
        });
      }
      queryClient.invalidateQueries(["equipment-nodes"]); 
      setSelectedNode(null); 
      toast.success("Deleted"); 
    }, 
    onError: e => toast.error(e.response?.data?.detail || "Failed") 
  });
  const criticalityMutation = useMutation({ 
    mutationFn: ({ nodeId, assignment }) => equipmentHierarchyAPI.assignCriticality(nodeId, assignment), 
    onSuccess: (data, variables) => { 
      queryClient.invalidateQueries(["equipment-nodes"]); 
      setSelectedNode(data); 
      if (variables.assignment.profile_id === null) {
        toast.success("Criticality cleared");
      } else {
        toast.success("Criticality assigned");
      }
    }, 
    onError: e => toast.error(e.response?.data?.detail || "Failed") 
  });
  const disciplineMutation = useMutation({ mutationFn: ({ nodeId, discipline }) => equipmentHierarchyAPI.assignDiscipline(nodeId, discipline), onSuccess: data => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(data); toast.success("Discipline assigned"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const parseListMutation = useMutation({ mutationFn: ({ content, source }) => equipmentHierarchyAPI.parseEquipmentList(content, source), onSuccess: (data) => { queryClient.invalidateQueries(["unstructured-items"]); toast.success(`Parsed ${data.parsed_count} items`); setIsImportOpen(false); setImportText(""); }, onError: e => toast.error(e.response?.data?.detail || "Failed to parse") });
  const parseFileMutation = useMutation({ mutationFn: (file) => equipmentHierarchyAPI.parseEquipmentFile(file), onSuccess: (data) => { queryClient.invalidateQueries(["unstructured-items"]); toast.success(`Parsed ${data.parsed_count} items from ${data.filename}`); }, onError: e => toast.error(e.response?.data?.detail || "Failed to parse file") });
  const deleteUnstructuredMutation = useMutation({ mutationFn: equipmentHierarchyAPI.deleteUnstructuredItem, onSuccess: () => { queryClient.invalidateQueries(["unstructured-items"]); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const assignToHierarchyMutation = useMutation({ mutationFn: ({ itemId, parentId, level }) => equipmentHierarchyAPI.assignUnstructuredToHierarchy(itemId, parentId, level), onSuccess: () => { queryClient.invalidateQueries(["equipment-nodes"]); queryClient.invalidateQueries(["unstructured-items"]); toast.success("Item added to hierarchy"); }, onError: e => toast.error(e.response?.data?.detail || "Failed to assign") });
  
  // Move node mutation
  const moveNodeMutation = useMutation({ 
    mutationFn: ({ nodeId, newParentId }) => equipmentHierarchyAPI.moveNode(nodeId, newParentId), 
    onSuccess: () => { 
      queryClient.invalidateQueries(["equipment-nodes"]); 
      toast.success("Node moved successfully"); 
      setMovingNode(null);
    }, 
    onError: e => { 
      toast.error(e.response?.data?.detail || "Failed to move node"); 
      setMovingNode(null);
    } 
  });
  
  // Change level mutation (promote/demote)
  const changeLevelMutation = useMutation({
    mutationFn: ({ nodeId, newLevel, newParentId }) => equipmentHierarchyAPI.changeNodeLevel(nodeId, newLevel, newParentId),
    onSuccess: (data) => {
      queryClient.invalidateQueries(["equipment-nodes"]);
      toast.success(data.message || "Level changed");
      setSelectedNode(data.node);
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed to change level")
  });
  
  // State for demote dialog (need to select new parent)
  const [demoteDialog, setDemoteDialog] = useState({ open: false, node: null, newLevel: null });
  
  // Cancel move mode handler
  const handleCancelMove = () => setMovingNode(null);
  
  const handlePromote = () => {
    if (!selectedNode) return;
    const normalizedLevel = normalizeLevel(selectedNode.level);
    const currentIdx = LEVEL_ORDER.indexOf(normalizedLevel);
    if (currentIdx <= 0) return;
    
    const newLevel = LEVEL_ORDER[currentIdx - 1];
    changeLevelMutation.mutate({ nodeId: selectedNode.id, newLevel, newParentId: null });
  };
  
  const handleDemote = () => {
    if (!selectedNode) return;
    const normalizedLevel = normalizeLevel(selectedNode.level);
    const currentIdx = LEVEL_ORDER.indexOf(normalizedLevel);
    if (currentIdx >= LEVEL_ORDER.length - 1) return;
    
    const newLevel = LEVEL_ORDER[currentIdx + 1];
    // Open dialog to select new parent
    setDemoteDialog({ open: true, node: selectedNode, newLevel });
  };
  
  const handleDemoteConfirm = (newParentId) => {
    if (demoteDialog.node && demoteDialog.newLevel) {
      changeLevelMutation.mutate({ 
        nodeId: demoteDialog.node.id, 
        newLevel: demoteDialog.newLevel, 
        newParentId 
      });
      setDemoteDialog({ open: false, node: null, newLevel: null });
    }
  };
  
  // Get valid parents for demoting (nodes at the level above the new level)
  const getDemoteParentCandidates = () => {
    if (!demoteDialog.newLevel) return [];
    const newLevelIdx = LEVEL_ORDER.indexOf(demoteDialog.newLevel);
    if (newLevelIdx <= 0) return [];
    const parentLevel = LEVEL_ORDER[newLevelIdx - 1];
    return nodes.filter(n => {
      const nodeLevel = normalizeLevel(n.level);
      return nodeLevel === parentLevel && n.id !== demoteDialog.node?.id;
    });
  };

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: ({ nodeId, direction }) => equipmentHierarchyAPI.reorderNode(nodeId, direction),
    onSuccess: (data) => {
      queryClient.invalidateQueries(["equipment-nodes"]);
      toast.success(data.message || "Reordered");
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed to reorder")
  });

  // Reorder to position mutation (for drag-drop)
  const reorderToPositionMutation = useMutation({
    mutationFn: ({ nodeId, targetNodeId, position, newParentId }) => 
      equipmentHierarchyAPI.reorderNodeToPosition(nodeId, targetNodeId, position, newParentId),
    onSuccess: (data) => {
      queryClient.invalidateQueries(["equipment-nodes"]);
      toast.success(data.message || "Moved");
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed to move")
  });

  // Handle reorder via drag-drop
  const handleDragReorder = useCallback((draggedId, targetId, position, newParentId) => {
    // Use the position-based reorder API
    reorderToPositionMutation.mutate({ 
      nodeId: draggedId, 
      targetNodeId: targetId, 
      position, 
      newParentId 
    });
  }, [reorderToPositionMutation]);

  // Handle level change via drag-drop (promote/demote)
  const handleDragChangeLevel = useCallback((draggedId, targetId, dropType) => {
    const draggedNode = nodes.find(n => n.id === draggedId);
    const targetNode = nodes.find(n => n.id === targetId);
    if (!draggedNode || !targetNode) return;
    
    if (dropType === "child") {
      // Dropping as a child - this could be a demote or move to new parent
      const validChildLevels = getValidChildLevels(targetNode.level);
      const draggedLevel = normalizeLevel(draggedNode.level);
      
      if (validChildLevels.includes(draggedLevel)) {
        // Valid level - just move to new parent
        moveNodeMutation.mutate({ nodeId: draggedId, newParentId: targetId });
      } else {
        // Need to change level (demote)
        const targetLevelIdx = LEVEL_ORDER.indexOf(normalizeLevel(targetNode.level));
        const newLevel = LEVEL_ORDER[targetLevelIdx + 1];
        if (newLevel) {
          changeLevelMutation.mutate({ nodeId: draggedId, newLevel, newParentId: targetId });
        }
      }
    }
  }, [nodes, moveNodeMutation, changeLevelMutation]);

  const handleMoveUp = () => {
    if (selectedNode) {
      reorderMutation.mutate({ nodeId: selectedNode.id, direction: "up" });
    }
  };

  const handleMoveDown = () => {
    if (selectedNode) {
      reorderMutation.mutate({ nodeId: selectedNode.id, direction: "down" });
    }
  };

  // Check if node can move up/down among siblings
  const getSiblingInfo = (node) => {
    if (!node) return { canMoveUp: false, canMoveDown: false };
    const siblings = nodes.filter(n => n.parent_id === node.parent_id);
    const sortedSiblings = siblings.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = sortedSiblings.findIndex(s => s.id === node.id);
    return {
      canMoveUp: idx > 0,
      canMoveDown: idx < sortedSiblings.length - 1 && idx >= 0
    };
  };

  const handleExpand = useCallback(id => setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);

  const handleUnstructuredDragStart = (e, item) => { e.dataTransfer.setData("application/json", JSON.stringify({ item, type: "unstructured" })); e.dataTransfer.effectAllowed = "move"; };

  const handleTreeDrop = (e, targetNode) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.type === "unstructured") {
        // Open dialog to select level for assignment
        setAssignDialog({ 
          open: true, 
          item: data.item, 
          parentNode: targetNode, 
          selectedLevel: getValidChildLevels(targetNode.level)[0] || "plant_unit"
        });
      }
    } catch (err) {}
  };
  
  const handleAssignToHierarchy = () => {
    if (assignDialog.item && assignDialog.parentNode && assignDialog.selectedLevel) {
      assignToHierarchyMutation.mutate({ 
        itemId: assignDialog.item.id, 
        parentId: assignDialog.parentNode.id, 
        level: assignDialog.selectedLevel 
      });
      setAssignDialog({ open: false, item: null, parentNode: null, selectedLevel: "" });
    }
  };

  const handleFileUpload = (e) => { const file = e.target.files?.[0]; if (file) { parseFileMutation.mutate(file); e.target.value = ""; } };
  const getNextLevel = level => { const normalizedLevel = normalizeLevel(level); const idx = LEVEL_ORDER.indexOf(normalizedLevel); return idx >= 0 && idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null; };
  const handleAddChild = () => { if (selectedNode) { const next = getNextLevel(selectedNode.level); if (next) { setNewNode({ name: "", level: next, parent_id: selectedNode.id }); setIsCreateOpen(true); } else toast.error("Cannot add children to maintainable items"); } };

  if (isLoading) return <div className="flex items-center justify-center h-[calc(100vh-64px)]"><div className="loading-dots"><span></span><span></span><span></span></div></div>;

  // Filter rows - show matching nodes and their parents (for tree structure)
  const filteredRows = searchQuery 
    ? flatRows.filter(r => matchingIds.has(r.node.id) || expandForSearch.has(r.node.id)) 
    : flatRows;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50" data-testid="equipment-manager-page">
      {/* Back Button - shown when navigated from another page */}
      {location.state?.from && (
        <div className="px-4 py-2 bg-white border-b border-slate-200">
          <BackButton />
        </div>
      )}
      
      <div className="flex flex-1 overflow-hidden">
      {/* Main Panel - Hierarchy */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder={t("equipment.searchPlaceholder")} 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="pl-9 pr-8 h-9" 
              data-testid="hierarchy-search-input" 
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-200"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
          {searchQuery && (
            <span className="text-sm text-slate-500">
              {matchingIds.size} {t("equipment.matches")}
            </span>
          )}
          <Button onClick={() => setIsImportOpen(true)} size="sm" variant="outline" data-testid="import-list-btn"><Upload className="w-4 h-4 mr-1" />{t("equipment.importList")}</Button>
          <Button onClick={() => { setNewNode({ name: "", level: "installation", parent_id: null }); setIsCreateOpen(true); }} size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="add-installation-btn"><Plus className="w-4 h-4 mr-1" />{t("equipment.addInstallation")}</Button>
          {selectedNode && !movingNode && (
            <>
              <Button onClick={handleAddChild} size="sm" variant="outline" disabled={selectedNode.level === "maintainable_item"} data-testid="add-child-btn"><Plus className="w-4 h-4 mr-1" />{t("equipment.addChild")}</Button>
              <Button onClick={() => deleteMutation.mutate(selectedNode.id)} size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid="delete-node-btn"><Trash2 className="w-4 h-4" /></Button>
            </>
          )}
        </div>
        
        {/* Move Mode Banner */}
        {movingNode && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Move className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">{t("equipment.moving")}: <strong>{movingNode.name}</strong></span>
              <span className="text-sm text-blue-600">→ {t("equipment.clickTarget")}</span>
            </div>
            <Button size="sm" variant="outline" onClick={handleCancelMove}>{t("common.cancel")}</Button>
          </div>
        )}
        
        <ScrollArea className="flex-1 p-4">
          {treeData.length === 0 && unstructuredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Building2 className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-lg font-semibold text-slate-600 mb-1">{t("equipment.noEquipment")}</h3>
              <p className="text-sm text-slate-400 mb-4">{t("equipment.addFirstEquipment")}</p>
              <div className="flex gap-2">
                <Button onClick={() => setIsImportOpen(true)} size="sm" variant="outline"><Upload className="w-4 h-4 mr-1" />{t("equipment.importList")}</Button>
                <Button onClick={() => setIsCreateOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />{t("equipment.addInstallation")}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1" data-testid="hierarchy-tree">
              {filteredRows.map(({ node, depth, hasChildren, isExpanded }) => {
                const siblings = nodes.filter(n => n.parent_id === node.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                const siblingIndex = siblings.findIndex(s => s.id === node.id);
                const isSearchMatch = searchQuery && matchingIds.has(node.id);
                return (
                  <TreeNode 
                    key={node.id} 
                    node={node} 
                    depth={depth} 
                    onSelect={setSelectedNode} 
                    isSelected={selectedNode?.id === node.id} 
                    isExpanded={isExpanded} 
                    onExpand={handleExpand} 
                    hasChildren={hasChildren}
                    allNodes={nodes}
                    onDrop={handleTreeDrop}
                    onReorder={handleDragReorder}
                    onChangeLevel={handleDragChangeLevel}
                    siblings={siblings}
                    siblingIndex={siblingIndex}
                    isSearchMatch={isSearchMatch}
                  />
                );
              })}
            </div>
          )}
          
          {unstructuredItems.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-700">{t("equipment.unassigned")} ({unstructuredItems.length})</h3>
                <span className="text-xs text-slate-400">{t("equipment.dragToHierarchy")}</span>
              </div>
              <div className="space-y-2" data-testid="unstructured-items-list">
                {unstructuredItems.map(item => (
                  <UnstructuredItem key={item.id} item={item} onDragStart={handleUnstructuredDragStart} onDelete={(id) => deleteUnstructuredMutation.mutate(id)} />
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Panel - Properties */}
      <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white">
        <PropertiesPanel 
          node={selectedNode} 
          equipmentTypes={equipmentTypes} 
          criticalityProfiles={criticalityProfiles} 
          disciplines={disciplines} 
          onUpdate={(id, data) => updateMutation.mutate({ nodeId: id, data })} 
          onAssignCriticality={(id, a) => criticalityMutation.mutate({ nodeId: id, assignment: a })} 
          onAssignDiscipline={(id, d) => disciplineMutation.mutate({ nodeId: id, discipline: d })}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      </div>

      {/* Create Node Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{newNode.parent_id ? `${t("equipment.addChild")} ${LEVEL_CONFIG[newNode.level]?.label}` : t("equipment.addInstallation")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label htmlFor="node-name">{t("common.name")}</Label><Input id="node-name" value={newNode.name} onChange={e => setNewNode({ ...newNode, name: e.target.value })} placeholder={t("common.enterName")} data-testid="new-node-name-input" /></div>
            {!newNode.parent_id && (<div><Label>{t("equipment.selectLevel")}</Label><Select value={newNode.level} onValueChange={v => setNewNode({ ...newNode, level: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEVEL_ORDER.map(l => <SelectItem key={l} value={l}>{LEVEL_CONFIG[l]?.label}</SelectItem>)}</SelectContent></Select></div>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => createMutation.mutate(newNode)} disabled={!newNode.name.trim() || createMutation.isPending} data-testid="create-node-btn">{createMutation.isPending ? t("common.creating") : t("common.create")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import List Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("equipment.importEquipmentList")}</DialogTitle><DialogDescription>{t("equipment.pasteEquipmentList")}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>{t("equipment.pasteEquipmentList")}</Label><Textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Pump P-101&#10;Compressor C-201&#10;Heat Exchanger HX-301&#10;..." className="h-32 mt-1" data-testid="import-text-area" /></div>
            <div className="flex items-center gap-2 text-sm text-slate-500"><div className="flex-1 h-px bg-slate-200" /><span>{t("equipment.orUpload")}</span><div className="flex-1 h-px bg-slate-200" /></div>
            <div>
              <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls,.pdf" onChange={handleFileUpload} className="hidden" />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full" disabled={parseFileMutation.isPending}>
                <FileText className="w-4 h-4 mr-2" />{parseFileMutation.isPending ? t("common.uploading") : t("equipment.uploadFile")}
              </Button>
              <p className="text-xs text-slate-400 mt-1 text-center">{t("equipment.supportedFormats")}</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsImportOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => parseListMutation.mutate({ content: importText, source: "paste" })} disabled={!importText.trim() || parseListMutation.isPending} data-testid="parse-list-btn">{parseListMutation.isPending ? t("common.parsing") : t("equipment.parseList")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign to Hierarchy Dialog - Level Selection */}
      <Dialog open={assignDialog.open} onOpenChange={(open) => !open && setAssignDialog({ open: false, item: null, parentNode: null, selectedLevel: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("equipment.assignToHierarchy")}</DialogTitle>
            <DialogDescription>
              {t("equipment.assignUnder")} "{assignDialog.item?.name}" → "{assignDialog.parentNode?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t("equipment.selectLevel")}</Label>
              <Select value={assignDialog.selectedLevel} onValueChange={v => setAssignDialog({ ...assignDialog, selectedLevel: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("equipment.selectLevel")} />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_ORDER.filter(l => l !== "installation").map(level => {
                    const config = LEVEL_CONFIG[level];
                    const LevelIcon = config?.icon || Cog;
                    return (
                      <SelectItem key={level} value={level}>
                        <div className="flex items-center gap-2">
                          <LevelIcon className="w-4 h-4" />
                          <span>{config?.label || level}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-2">
                {assignDialog.selectedLevel && LEVEL_CONFIG[assignDialog.selectedLevel]?.description}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog({ open: false, item: null, parentNode: null, selectedLevel: "" })}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAssignToHierarchy} disabled={!assignDialog.selectedLevel || assignToHierarchyMutation.isPending}>
              {assignToHierarchyMutation.isPending ? t("common.assigning") : t("common.assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Demote Dialog - Select new parent */}
      <Dialog open={demoteDialog.open} onOpenChange={(open) => !open && setDemoteDialog({ open: false, node: null, newLevel: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("equipment.demoteTo")} {LEVEL_CONFIG[demoteDialog.newLevel]?.label}</DialogTitle>
            <DialogDescription>
              {t("equipment.selectNewParent")} "{demoteDialog.node?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t("equipment.selectNewParent")}</Label>
              <div className="mt-2 max-h-60 overflow-y-auto border rounded-lg">
                {getDemoteParentCandidates().length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">
                    {t("equipment.noValidParents")} {t("equipment.createFirst")} {LEVEL_CONFIG[LEVEL_ORDER[LEVEL_ORDER.indexOf(demoteDialog.newLevel) - 1]]?.label}.
                  </div>
                ) : (
                  getDemoteParentCandidates().map(parent => {
                    const parentConfig = LEVEL_CONFIG[normalizeLevel(parent.level)] || { icon: Cog, label: "Unknown" };
                    const ParentIcon = parentConfig.icon;
                    return (
                      <button
                        key={parent.id}
                        onClick={() => handleDemoteConfirm(parent.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 border-b last:border-b-0 text-left"
                      >
                        <ParentIcon className="w-5 h-5 text-slate-500" />
                        <div>
                          <div className="font-medium text-slate-900">{parent.name}</div>
                          <div className="text-xs text-slate-500">{parentConfig.label}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoteDialog({ open: false, node: null, newLevel: null })}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
