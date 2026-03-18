import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { equipmentHierarchyAPI } from "../lib/api";
import { toast } from "sonner";
import {
  ChevronRight, ChevronDown, Building2, Factory, Cog, Settings, Wrench, Plus, Trash2, Edit,
  GripVertical, ShieldCheck, Gauge, Zap, Droplets, Wind, Thermometer, Box, CircleDot, 
  Pipette, Flame, Cpu, Search, Check, Upload, FileText, X, Package, Move, ArrowRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";

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
const CRIT_COLORS = { safety_critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" }, production_critical: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500" }, medium: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-500" }, low: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500" } };
const DISCIPLINES = ["mechanical", "electrical", "instrumentation", "process"];

function getValidChildLevels(parentLevel) {
  const idx = LEVEL_ORDER.indexOf(parentLevel);
  if (idx === -1 || idx >= LEVEL_ORDER.length - 1) return [];
  return [LEVEL_ORDER[idx + 1]];
}

function canBeChildOf(childLevel, parentLevel) {
  const parentIdx = LEVEL_ORDER.indexOf(parentLevel);
  const childIdx = LEVEL_ORDER.indexOf(childLevel);
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

// Tree Node Component with Move Mode support
function TreeNode({ node, depth, onSelect, isSelected, isExpanded, onExpand, hasChildren, movingNode, onMoveTarget, allNodes }) {
  const config = LEVEL_CONFIG[node.level] || { icon: Cog, label: "Unknown" };
  const LevelIcon = config.icon;
  const critColors = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  
  const isMoving = movingNode?.id === node.id;
  const canAcceptMove = movingNode && canBeChildOf(movingNode.level, node.level) && movingNode.id !== node.id;
  
  // Check if this node is a descendant of movingNode (can't move parent under child)
  const isDescendantOfMoving = movingNode ? (() => {
    const checkDescendant = (parentId, checkId) => {
      const children = allNodes.filter(n => n.parent_id === parentId);
      for (const child of children) {
        if (child.id === checkId) return true;
        if (checkDescendant(child.id, checkId)) return true;
      }
      return false;
    };
    return checkDescendant(movingNode.id, node.id);
  })() : false;
  
  const validTarget = canAcceptMove && !isDescendantOfMoving;

  const handleClick = () => {
    if (movingNode && validTarget) {
      onMoveTarget(node);
    } else if (!movingNode) {
      onSelect(node);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
        isMoving ? "bg-blue-100 border-2 border-blue-500 shadow-md" :
        validTarget ? "bg-green-100 border-2 border-green-500 cursor-pointer hover:bg-green-200" :
        movingNode && !validTarget ? "opacity-40" :
        isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent cursor-pointer"
      }`}
      style={{ marginLeft: depth * 24 }}
      onClick={handleClick}
      data-testid={`tree-node-${node.id}`}
    >
      <button 
        className={`w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 ${!hasChildren ? "invisible" : ""}`} 
        onClick={e => { e.stopPropagation(); onExpand(node.id); }}
      >
        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      
      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${critColors?.bg || "bg-slate-100"}`}>
        <LevelIcon className={`w-4 h-4 ${critColors?.text || "text-slate-600"}`} />
      </div>
      
      <span className="flex-1 text-sm font-medium text-slate-700 truncate">{node.name}</span>
      
      {validTarget && (
        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
          <ArrowRight className="w-3 h-3" /> Drop here
        </span>
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

function LibraryItem({ item, type, onDragStart, onEdit, onDelete }) {
  const Icon = type === "equipment" ? (EQUIPMENT_ICONS[item.icon] || Cog) : ShieldCheck;
  const colors = type === "criticality" ? CRIT_COLORS[item.level] : null;
  return (
    <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-grab hover:border-blue-300 hover:shadow-sm transition-all group" draggable onDragStart={e => onDragStart(e, item, type)} data-testid={`library-item-${item.id}`}>
      <GripVertical className="w-4 h-4 text-slate-300" />
      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${colors?.bg || "bg-slate-100"}`}><Icon className={`w-4 h-4 ${colors?.text || "text-slate-600"}`} /></div>
      <span className="flex-1 text-sm font-medium text-slate-700 truncate">{item.name}</span>
      {type === "equipment" && onEdit && (
        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="p-1 hover:bg-blue-50 rounded"><Edit className="w-3 h-3 text-blue-400" /></button>
          {item.is_custom && <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-400" /></button>}
        </div>
      )}
    </div>
  );
}

function CriticalityChart({ nodes }) {
  const data = useMemo(() => {
    const result = { safety_critical: 0, production_critical: 0, medium: 0, low: 0 };
    nodes.forEach(n => { if (n.criticality?.level) result[n.criticality.level]++; });
    return result;
  }, [nodes]);
  return (
    <div className="p-3 bg-white rounded-xl border border-slate-200">
      <h3 className="text-xs font-semibold text-slate-700 mb-2">Criticality</h3>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(data).map(([level, count]) => {
          const colors = CRIT_COLORS[level];
          return (<div key={level} className={`p-2 rounded-lg ${colors?.bg} ${colors?.border} border`}><div className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${colors?.dot}`} /><span className={`text-xs ${colors?.text} capitalize`}>{level.replace("_", " ")}</span></div><span className={`text-lg font-bold ${colors?.text}`}>{count}</span></div>);
        })}
      </div>
    </div>
  );
}

function PropertiesPanel({ node, equipmentTypes, criticalityProfiles, disciplines, onUpdate, onAssignCriticality, onAssignDiscipline, onStartMove, isMoving }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  
  if (!node) return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <Settings className="w-12 h-12 text-slate-300 mb-3" />
      <h3 className="text-lg font-semibold text-slate-600 mb-1">No Selection</h3>
      <p className="text-sm text-slate-400">Select an item from the hierarchy</p>
    </div>
  );
  
  const config = LEVEL_CONFIG[node.level] || { icon: Cog, label: "Unknown" };
  const LevelIcon = config.icon;
  const critColors = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  const canMove = node.level !== "installation";
  
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
          {/* Move Button */}
          {canMove && (
            <Button 
              variant={isMoving ? "default" : "outline"} 
              className={`w-full ${isMoving ? "bg-blue-600" : ""}`}
              onClick={onStartMove}
              data-testid="move-node-btn"
            >
              <Move className="w-4 h-4 mr-2" />
              {isMoving ? "Click a valid parent to move" : "Move to different parent"}
            </Button>
          )}
          
          <div>
            <Label className="text-xs text-slate-500 mb-1">Description</Label>
            {isEditing ? (
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Add description..." className="h-8 text-sm" />
            ) : (
              <p className="text-sm text-slate-700">{node.description || <span className="text-slate-400 italic">No description</span>}</p>
            )}
          </div>
          
          {node.level === "equipment_unit" && (
            <div>
              <Label className="text-xs text-slate-500 mb-1">Equipment Type</Label>
              <Select value={node.equipment_type_id || ""} onValueChange={v => onUpdate(node.id, { equipment_type_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{equipmentTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          
          <div>
            <Label className="text-xs text-slate-500 mb-1">Discipline</Label>
            <Select value={node.discipline || ""} onValueChange={v => onAssignDiscipline(node.id, v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select discipline" /></SelectTrigger>
              <SelectContent>{disciplines?.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-xs text-slate-500 mb-2">Criticality</Label>
            <div className="grid grid-cols-2 gap-2">
              {criticalityProfiles?.map(p => { 
                const isActive = node.criticality?.profile_id === p.id; 
                const colors = CRIT_COLORS[p.level]; 
                return (
                  <button 
                    key={p.id} 
                    onClick={() => onAssignCriticality(node.id, { profile_id: p.id })} 
                    className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${isActive ? `${colors?.bg} ${colors?.border} ring-2 ring-offset-1` : "bg-white border-slate-200 hover:border-slate-300"}`}
                  >
                    <div className={`w-3 h-3 rounded-full ${colors?.dot}`} />
                    <span className={`text-xs font-medium ${isActive ? colors?.text : "text-slate-600"}`}>{p.name}</span>
                  </button>
                ); 
              })}
            </div>
          </div>
          
          {node.criticality && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <h4 className="text-xs font-semibold text-slate-600 mb-2">Risk Score: <span className="text-lg">{node.criticality.risk_score}</span></h4>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function EquipmentManagerPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("equipment");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newNode, setNewNode] = useState({ name: "", level: "installation", parent_id: null });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [movingNode, setMovingNode] = useState(null);
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [newType, setNewType] = useState({ id: "", name: "", discipline: "mechanical", icon: "cog", iso_class: "" });

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
  const flatRows = useMemo(() => flattenTree(treeData, expandedIds), [treeData, expandedIds]);

  // Mutations
  const createMutation = useMutation({ mutationFn: equipmentHierarchyAPI.createNode, onSuccess: () => { queryClient.invalidateQueries(["equipment-nodes"]); toast.success("Node created"); setIsCreateOpen(false); setNewNode({ name: "", level: "installation", parent_id: null }); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const updateMutation = useMutation({ mutationFn: ({ nodeId, data }) => equipmentHierarchyAPI.updateNode(nodeId, data), onSuccess: data => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(data); toast.success("Updated"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const deleteMutation = useMutation({ mutationFn: equipmentHierarchyAPI.deleteNode, onSuccess: () => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(null); toast.success("Deleted"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const criticalityMutation = useMutation({ mutationFn: ({ nodeId, assignment }) => equipmentHierarchyAPI.assignCriticality(nodeId, assignment), onSuccess: data => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(data); toast.success("Criticality assigned"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
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
  
  // Equipment type mutations
  const createTypeMutation = useMutation({ mutationFn: equipmentHierarchyAPI.createEquipmentType, onSuccess: () => { queryClient.invalidateQueries(["equipment-types"]); toast.success("Equipment type created"); setIsTypeDialogOpen(false); resetTypeForm(); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const updateTypeMutation = useMutation({ mutationFn: ({ typeId, data }) => equipmentHierarchyAPI.updateEquipmentType(typeId, data), onSuccess: () => { queryClient.invalidateQueries(["equipment-types"]); toast.success("Equipment type updated"); setIsTypeDialogOpen(false); setEditingType(null); resetTypeForm(); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const deleteTypeMutation = useMutation({ mutationFn: equipmentHierarchyAPI.deleteEquipmentType, onSuccess: () => { queryClient.invalidateQueries(["equipment-types"]); toast.success("Equipment type deleted"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });

  const resetTypeForm = () => setNewType({ id: "", name: "", discipline: "mechanical", icon: "cog", iso_class: "" });

  const handleExpand = useCallback(id => setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);
  
  const handleStartMove = () => {
    if (selectedNode && selectedNode.level !== "installation") {
      setMovingNode(selectedNode);
      toast.info("Click on a valid parent node to move");
    }
  };
  
  const handleMoveTarget = (targetNode) => {
    if (movingNode && targetNode) {
      moveNodeMutation.mutate({ nodeId: movingNode.id, newParentId: targetNode.id });
    }
  };
  
  const handleCancelMove = () => {
    setMovingNode(null);
  };

  const handleDragStart = (e, item, type) => e.dataTransfer.setData("application/json", JSON.stringify({ item, type }));
  const handleUnstructuredDragStart = (e, item) => { e.dataTransfer.setData("application/json", JSON.stringify({ item, type: "unstructured" })); e.dataTransfer.effectAllowed = "move"; };

  const handleTreeDrop = (e, targetNode) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.type === "unstructured") {
        const validLevels = getValidChildLevels(targetNode.level);
        if (validLevels.length > 0) {
          assignToHierarchyMutation.mutate({ itemId: data.item.id, parentId: targetNode.id, level: validLevels[0] });
        }
      } else if (data.type === "criticality" && selectedNode) {
        criticalityMutation.mutate({ nodeId: selectedNode.id, assignment: { profile_id: data.item.id } });
      }
    } catch (err) {}
  };

  const handleFileUpload = (e) => { const file = e.target.files?.[0]; if (file) { parseFileMutation.mutate(file); e.target.value = ""; } };
  const getNextLevel = level => { const idx = LEVEL_ORDER.indexOf(level); return idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null; };
  const handleAddChild = () => { if (selectedNode) { const next = getNextLevel(selectedNode.level); if (next) { setNewNode({ name: "", level: next, parent_id: selectedNode.id }); setIsCreateOpen(true); } else toast.error("Cannot add children to maintainable items"); } };
  
  const handleEditType = (type) => { setEditingType(type); setNewType({ id: type.id, name: type.name, discipline: type.discipline || "mechanical", icon: type.icon || "cog", iso_class: type.iso_class || "" }); setIsTypeDialogOpen(true); };
  const handleSaveType = () => { if (editingType) { updateTypeMutation.mutate({ typeId: editingType.id, data: { name: newType.name, discipline: newType.discipline, icon: newType.icon, iso_class: newType.iso_class } }); } else { createTypeMutation.mutate(newType); } };

  if (isLoading) return <div className="flex items-center justify-center h-[calc(100vh-64px)]"><div className="loading-dots"><span></span><span></span><span></span></div></div>;

  const filteredRows = searchQuery ? flatRows.filter(r => r.node.name.toLowerCase().includes(searchQuery.toLowerCase())) : flatRows;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50" data-testid="equipment-manager-page">
      {/* Left Panel - Libraries */}
      <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Libraries</h2>
          <Button size="sm" variant="ghost" onClick={() => { setEditingType(null); resetTypeForm(); setIsTypeDialogOpen(true); }} data-testid="add-equipment-type-btn"><Plus className="w-4 h-4" /></Button>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="mx-4 mt-2 grid w-auto grid-cols-2"><TabsTrigger value="equipment" className="text-xs">Equipment</TabsTrigger><TabsTrigger value="criticality" className="text-xs">Criticality</TabsTrigger></TabsList>
          <TabsContent value="equipment" className="flex-1 m-0 p-4 overflow-auto">
            <div className="space-y-2">{equipmentTypes.map(t => <LibraryItem key={t.id} item={t} type="equipment" onDragStart={handleDragStart} onEdit={handleEditType} onDelete={(id) => deleteTypeMutation.mutate(id)} />)}</div>
          </TabsContent>
          <TabsContent value="criticality" className="flex-1 m-0 p-4 overflow-auto"><p className="text-xs text-slate-500 mb-3">Drag to assign</p><div className="space-y-2">{criticalityProfiles.map(p => <LibraryItem key={p.id} item={p} type="criticality" onDragStart={handleDragStart} />)}</div></TabsContent>
        </Tabs>
        <div className="p-3 border-t border-slate-200 bg-slate-50"><CriticalityChart nodes={nodes} /></div>
      </div>

      {/* Center Panel - Hierarchy */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3">
          <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9" data-testid="hierarchy-search-input" /></div>
          <Button onClick={() => setIsImportOpen(true)} size="sm" variant="outline" data-testid="import-list-btn"><Upload className="w-4 h-4 mr-1" />Import List</Button>
          <Button onClick={() => { setNewNode({ name: "", level: "installation", parent_id: null }); setIsCreateOpen(true); }} size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="add-installation-btn"><Plus className="w-4 h-4 mr-1" />Add Installation</Button>
          {selectedNode && !movingNode && (
            <>
              <Button onClick={handleAddChild} size="sm" variant="outline" disabled={selectedNode.level === "maintainable_item"} data-testid="add-child-btn"><Plus className="w-4 h-4 mr-1" />Add Child</Button>
              <Button onClick={() => deleteMutation.mutate(selectedNode.id)} size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid="delete-node-btn"><Trash2 className="w-4 h-4" /></Button>
            </>
          )}
        </div>
        
        {/* Move Mode Banner */}
        {movingNode && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Move className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Moving: <strong>{movingNode.name}</strong></span>
              <span className="text-sm text-blue-600">→ Click on a green highlighted target</span>
            </div>
            <Button size="sm" variant="outline" onClick={handleCancelMove}>Cancel</Button>
          </div>
        )}
        
        <ScrollArea className="flex-1 p-4">
          {treeData.length === 0 && unstructuredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Building2 className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-lg font-semibold text-slate-600 mb-1">No Equipment Hierarchy</h3>
              <p className="text-sm text-slate-400 mb-4">Start by adding an installation or importing a list</p>
              <div className="flex gap-2">
                <Button onClick={() => setIsImportOpen(true)} size="sm" variant="outline"><Upload className="w-4 h-4 mr-1" />Import List</Button>
                <Button onClick={() => setIsCreateOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Installation</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1" data-testid="hierarchy-tree">
              {filteredRows.map(({ node, depth, hasChildren, isExpanded }) => (
                <TreeNode 
                  key={node.id} 
                  node={node} 
                  depth={depth} 
                  onSelect={setSelectedNode} 
                  isSelected={selectedNode?.id === node.id} 
                  isExpanded={isExpanded} 
                  onExpand={handleExpand} 
                  hasChildren={hasChildren}
                  movingNode={movingNode}
                  onMoveTarget={handleMoveTarget}
                  allNodes={nodes}
                />
              ))}
            </div>
          )}
          
          {unstructuredItems.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-700">Unassigned Items ({unstructuredItems.length})</h3>
                <span className="text-xs text-slate-400">Drag to hierarchy</span>
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
          onStartMove={handleStartMove}
          isMoving={movingNode?.id === selectedNode?.id}
        />
      </div>

      {/* Create Node Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{newNode.parent_id ? `Add ${LEVEL_CONFIG[newNode.level]?.label}` : "Add Installation"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label htmlFor="node-name">Name</Label><Input id="node-name" value={newNode.name} onChange={e => setNewNode({ ...newNode, name: e.target.value })} placeholder="Enter name" data-testid="new-node-name-input" /></div>
            {!newNode.parent_id && (<div><Label>Level</Label><Select value={newNode.level} onValueChange={v => setNewNode({ ...newNode, level: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEVEL_ORDER.map(l => <SelectItem key={l} value={l}>{LEVEL_CONFIG[l]?.label}</SelectItem>)}</SelectContent></Select></div>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button><Button onClick={() => createMutation.mutate(newNode)} disabled={!newNode.name.trim() || createMutation.isPending} data-testid="create-node-btn">{createMutation.isPending ? "Creating..." : "Create"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import List Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import Equipment List</DialogTitle><DialogDescription>Paste a list or upload a file (Excel, PDF, CSV, TXT)</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Paste Equipment List</Label><Textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Pump P-101&#10;Compressor C-201&#10;Heat Exchanger HX-301&#10;..." className="h-32 mt-1" data-testid="import-text-area" /></div>
            <div className="flex items-center gap-2 text-sm text-slate-500"><div className="flex-1 h-px bg-slate-200" /><span>or</span><div className="flex-1 h-px bg-slate-200" /></div>
            <div>
              <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls,.pdf" onChange={handleFileUpload} className="hidden" />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full" disabled={parseFileMutation.isPending}>
                <FileText className="w-4 h-4 mr-2" />{parseFileMutation.isPending ? "Uploading..." : "Upload File"}
              </Button>
              <p className="text-xs text-slate-400 mt-1 text-center">Supported: .txt, .csv, .xlsx, .xls, .pdf</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button><Button onClick={() => parseListMutation.mutate({ content: importText, source: "paste" })} disabled={!importText.trim() || parseListMutation.isPending} data-testid="parse-list-btn">{parseListMutation.isPending ? "Parsing..." : "Parse List"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Equipment Type Dialog */}
      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingType ? "Edit Equipment Type" : "Add Equipment Type"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {!editingType && <div><Label>ID (unique)</Label><Input value={newType.id} onChange={e => setNewType({ ...newType, id: e.target.value.toLowerCase().replace(/\s+/g, '_') })} placeholder="pump_custom" data-testid="type-id-input" /></div>}
            <div><Label>Name</Label><Input value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} placeholder="Custom Pump" data-testid="type-name-input" /></div>
            <div><Label>ISO Class (optional)</Label><Input value={newType.iso_class} onChange={e => setNewType({ ...newType, iso_class: e.target.value })} placeholder="1.1.99" /></div>
            <div><Label>Discipline</Label><Select value={newType.discipline} onValueChange={v => setNewType({ ...newType, discipline: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DISCIPLINES.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Icon</Label><div className="flex flex-wrap gap-2 mt-1">{ICON_OPTIONS.map(icon => { const Icon = EQUIPMENT_ICONS[icon] || Cog; return (<button key={icon} onClick={() => setNewType({ ...newType, icon })} className={`p-2 rounded-lg border ${newType.icon === icon ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}><Icon className="w-5 h-5" /></button>); })}</div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setIsTypeDialogOpen(false); setEditingType(null); resetTypeForm(); }}>Cancel</Button><Button onClick={handleSaveType} disabled={(!editingType && !newType.id.trim()) || !newType.name.trim()} data-testid="save-type-btn">{editingType ? "Save" : "Create"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
