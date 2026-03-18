import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { equipmentHierarchyAPI } from "../lib/api";
import { toast } from "sonner";
import {
  ChevronRight, ChevronDown, Building2, Factory, Cog, Settings, Wrench, Plus, Trash2, Edit,
  GripVertical, ShieldCheck, Gauge, Zap, Droplets, Wind, Thermometer, Box, CircleDot, 
  Pipette, Flame, Cpu, Search, Check,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";

const EQUIPMENT_ICONS = { droplets: Droplets, wind: Wind, cog: Cog, thermometer: Thermometer, box: Box, "circle-dot": CircleDot, zap: Zap, gauge: Gauge, cpu: Cpu, pipette: Pipette, flame: Flame };
const LEVEL_CONFIG = { installation: { icon: Building2, label: "Installation" }, unit: { icon: Factory, label: "Unit" }, system: { icon: Settings, label: "System" }, equipment: { icon: Cog, label: "Equipment" }, maintainable_item: { icon: Wrench, label: "Maintainable Item" } };
const LEVEL_ORDER = ["installation", "unit", "system", "equipment", "maintainable_item"];
const CRIT_COLORS = { safety_critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" }, production_critical: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500" }, medium: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-500" }, low: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500" } };

function buildTreeData(nodes, parentId = null, depth = 0) {
  if (depth > 10) return [];
  return nodes.filter(n => n.parent_id === parentId).map(node => ({ ...node, children: buildTreeData(nodes, node.id, depth + 1) }));
}

function FlatTreeRow({ node, depth, onSelect, isSelected, isExpanded, onExpand, hasChildren }) {
  const config = LEVEL_CONFIG[node.level] || { icon: Cog, label: "Unknown" };
  const LevelIcon = config.icon;
  const critColors = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"}`}
      style={{ marginLeft: depth * 24 }}
      onClick={() => onSelect(node)}
      data-testid={`tree-node-${node.id}`}
    >
      <button className={`w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 ${!hasChildren ? "invisible" : ""}`} onClick={e => { e.stopPropagation(); onExpand(node.id); }}>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${critColors?.bg || "bg-slate-100"}`}><LevelIcon className={`w-4 h-4 ${critColors?.text || "text-slate-600"}`} /></div>
      <span className="flex-1 text-sm font-medium text-slate-700 truncate">{node.name}</span>
      {node.criticality && <div className={`w-2 h-2 rounded-full ${CRIT_COLORS[node.criticality.level]?.dot}`} />}
    </div>
  );
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

function LibraryItem({ item, type, onDragStart }) {
  const Icon = type === "equipment" ? (EQUIPMENT_ICONS[item.icon] || Cog) : ShieldCheck;
  const colors = type === "criticality" ? CRIT_COLORS[item.level] : null;
  return (
    <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-grab hover:border-blue-300 hover:shadow-sm transition-all" draggable onDragStart={e => onDragStart(e, item, type)} data-testid={`library-item-${item.id}`}>
      <GripVertical className="w-4 h-4 text-slate-300" />
      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${colors?.bg || "bg-slate-100"}`}><Icon className={`w-4 h-4 ${colors?.text || "text-slate-600"}`} /></div>
      <span className="text-sm font-medium text-slate-700 truncate">{item.name}</span>
    </div>
  );
}

function CriticalityChart({ nodes }) {
  const data = useMemo(() => {
    const result = { safety_critical: 0, production_critical: 0, medium: 0, low: 0 };
    nodes.forEach(n => { if (n.criticality?.level) result[n.criticality.level]++; });
    return result;
  }, [nodes]);
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <div className="p-4 bg-white rounded-xl border border-slate-200">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Criticality Distribution</h3>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(data).map(([level, count]) => {
          const colors = CRIT_COLORS[level];
          const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
          return (
            <div key={level} className={`p-3 rounded-lg ${colors?.bg} ${colors?.border} border`}>
              <div className="flex items-center gap-2 mb-1"><div className={`w-3 h-3 rounded-full ${colors?.dot}`} /><span className={`text-xs font-medium ${colors?.text} capitalize`}>{level.replace("_", " ")}</span></div>
              <div className="flex items-baseline gap-1"><span className={`text-xl font-bold ${colors?.text}`}>{count}</span><span className={`text-xs ${colors?.text} opacity-70`}>({pct}%)</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PropertiesPanel({ node, equipmentTypes, criticalityProfiles, disciplines, onUpdate, onAssignCriticality, onAssignDiscipline }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  if (!node) return (<div className="flex flex-col items-center justify-center h-full p-6 text-center"><Settings className="w-12 h-12 text-slate-300 mb-3" /><h3 className="text-lg font-semibold text-slate-600 mb-1">No Selection</h3><p className="text-sm text-slate-400">Select an item from the hierarchy</p></div>);
  const config = LEVEL_CONFIG[node.level] || { icon: Cog, label: "Unknown" };
  const LevelIcon = config.icon;
  const critColors = node.criticality?.level ? CRIT_COLORS[node.criticality.level] : null;
  const handleSave = () => { onUpdate(node.id, { name: editName, description: editDesc }); setIsEditing(false); };
  const startEdit = () => { setEditName(node.name); setEditDesc(node.description || ""); setIsEditing(true); };
  return (
    <div className="h-full flex flex-col" data-testid="properties-panel">
      <div className={`p-4 border-b border-slate-200 ${critColors?.bg || "bg-slate-50"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${critColors?.bg || "bg-white"} ${critColors?.border || "border-slate-200"} border`}><LevelIcon className={`w-5 h-5 ${critColors?.text || "text-slate-600"}`} /></div>
          <div className="flex-1 min-w-0">
            {isEditing ? (<Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm font-semibold" autoFocus />) : (<h3 className="font-semibold text-slate-800 truncate">{node.name}</h3>)}
            <p className="text-xs text-slate-500">{config.label}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => isEditing ? handleSave() : startEdit()}>{isEditing ? <Check className="w-4 h-4" /> : <Edit className="w-4 h-4" />}</Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div><Label className="text-xs text-slate-500 mb-1">Description</Label>{isEditing ? (<Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Add description..." className="h-8 text-sm" />) : (<p className="text-sm text-slate-700">{node.description || <span className="text-slate-400 italic">No description</span>}</p>)}</div>
          {node.level === "equipment" && (<div><Label className="text-xs text-slate-500 mb-1">Equipment Type</Label><Select value={node.equipment_type_id || ""} onValueChange={v => onUpdate(node.id, { equipment_type_id: v })}><SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent>{equipmentTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>)}
          <div><Label className="text-xs text-slate-500 mb-1">Discipline</Label><Select value={node.discipline || ""} onValueChange={v => onAssignDiscipline(node.id, v)}><SelectTrigger className="h-9"><SelectValue placeholder="Select discipline" /></SelectTrigger><SelectContent>{disciplines?.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs text-slate-500 mb-2">Criticality</Label><div className="grid grid-cols-2 gap-2">{criticalityProfiles?.map(p => { const isActive = node.criticality?.profile_id === p.id; const colors = CRIT_COLORS[p.level]; return (<button key={p.id} onClick={() => onAssignCriticality(node.id, { profile_id: p.id })} className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${isActive ? `${colors?.bg} ${colors?.border} ring-2 ring-offset-1` : "bg-white border-slate-200 hover:border-slate-300"}`}><div className={`w-3 h-3 rounded-full ${colors?.dot}`} /><span className={`text-xs font-medium ${isActive ? colors?.text : "text-slate-600"}`}>{p.name}</span></button>); })}</div></div>
          {node.criticality && (<div className="p-3 bg-slate-50 rounded-lg space-y-2"><h4 className="text-xs font-semibold text-slate-600 mb-2">Criticality Details</h4><div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-slate-500">Fatality Risk:</span> <span className="font-medium">{(node.criticality.fatality_risk * 100).toFixed(2)}%</span></div><div><span className="text-slate-500">Failure Prob:</span> <span className="font-medium">{(node.criticality.failure_probability * 100).toFixed(1)}%</span></div><div><span className="text-slate-500">Loss/Day:</span> <span className="font-medium">${node.criticality.production_loss_per_day?.toLocaleString()}</span></div><div><span className="text-slate-500">Downtime:</span> <span className="font-medium">{node.criticality.downtime_days} days</span></div></div><div className="pt-2 border-t border-slate-200"><span className="text-slate-500 text-xs">Risk Score:</span><span className="ml-1 text-sm font-bold text-slate-800">{node.criticality.risk_score}</span></div></div>)}
          <div className="pt-4 border-t border-slate-200"><Label className="text-xs text-slate-500 mb-2">Metadata</Label><div className="space-y-1 text-xs text-slate-500"><p>ID: <span className="font-mono">{node.id.substring(0, 8)}...</span></p><p>Created: {new Date(node.created_at).toLocaleDateString()}</p></div></div>
        </div>
      </ScrollArea>
    </div>
  );
}

export default function EquipmentManagerPage() {
  const queryClient = useQueryClient();
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("equipment");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newNode, setNewNode] = useState({ name: "", level: "installation", parent_id: null });

  const { data: nodesData, isLoading } = useQuery({ queryKey: ["equipment-nodes"], queryFn: equipmentHierarchyAPI.getNodes });
  const { data: typesData } = useQuery({ queryKey: ["equipment-types"], queryFn: equipmentHierarchyAPI.getEquipmentTypes });
  const { data: profilesData } = useQuery({ queryKey: ["criticality-profiles"], queryFn: equipmentHierarchyAPI.getCriticalityProfiles });
  const { data: disciplinesData } = useQuery({ queryKey: ["disciplines"], queryFn: equipmentHierarchyAPI.getDisciplines });

  const nodes = nodesData?.nodes || [];
  const equipmentTypes = typesData?.equipment_types || [];
  const criticalityProfiles = profilesData?.profiles || [];
  const disciplines = disciplinesData?.disciplines || [];

  const treeData = useMemo(() => buildTreeData(nodes), [nodes]);
  const flatRows = useMemo(() => flattenTree(treeData, expandedIds), [treeData, expandedIds]);

  const createMutation = useMutation({ mutationFn: equipmentHierarchyAPI.createNode, onSuccess: () => { queryClient.invalidateQueries(["equipment-nodes"]); toast.success("Node created"); setIsCreateOpen(false); setNewNode({ name: "", level: "installation", parent_id: null }); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const updateMutation = useMutation({ mutationFn: ({ nodeId, data }) => equipmentHierarchyAPI.updateNode(nodeId, data), onSuccess: data => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(data); toast.success("Updated"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const deleteMutation = useMutation({ mutationFn: equipmentHierarchyAPI.deleteNode, onSuccess: () => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(null); toast.success("Deleted"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const criticalityMutation = useMutation({ mutationFn: ({ nodeId, assignment }) => equipmentHierarchyAPI.assignCriticality(nodeId, assignment), onSuccess: data => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(data); toast.success("Criticality assigned"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });
  const disciplineMutation = useMutation({ mutationFn: ({ nodeId, discipline }) => equipmentHierarchyAPI.assignDiscipline(nodeId, discipline), onSuccess: data => { queryClient.invalidateQueries(["equipment-nodes"]); setSelectedNode(data); toast.success("Discipline assigned"); }, onError: e => toast.error(e.response?.data?.detail || "Failed") });

  const handleExpand = useCallback(id => setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);
  const handleDragStart = (e, item, type) => e.dataTransfer.setData("application/json", JSON.stringify({ item, type }));
  const handleDrop = e => { e.preventDefault(); try { const data = JSON.parse(e.dataTransfer.getData("application/json")); if (data.type === "criticality" && selectedNode) criticalityMutation.mutate({ nodeId: selectedNode.id, assignment: { profile_id: data.item.id } }); } catch (err) {} };
  const getNextLevel = level => { const idx = LEVEL_ORDER.indexOf(level); return idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null; };
  const handleAddChild = () => { if (selectedNode) { const next = getNextLevel(selectedNode.level); if (next) { setNewNode({ name: "", level: next, parent_id: selectedNode.id }); setIsCreateOpen(true); } else toast.error("Cannot add children to maintainable items"); } };

  if (isLoading) return <div className="flex items-center justify-center h-[calc(100vh-64px)]"><div className="loading-dots"><span></span><span></span><span></span></div></div>;

  const filteredRows = searchQuery ? flatRows.filter(r => r.node.name.toLowerCase().includes(searchQuery.toLowerCase())) : flatRows;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50" data-testid="equipment-manager-page">
      <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-200"><h2 className="font-semibold text-slate-800">Libraries</h2></div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="mx-4 mt-2 grid w-auto grid-cols-2"><TabsTrigger value="equipment" className="text-xs">Equipment</TabsTrigger><TabsTrigger value="criticality" className="text-xs">Criticality</TabsTrigger></TabsList>
          <TabsContent value="equipment" className="flex-1 m-0 p-4 overflow-auto"><div className="space-y-2">{equipmentTypes.map(t => <LibraryItem key={t.id} item={t} type="equipment" onDragStart={handleDragStart} />)}</div></TabsContent>
          <TabsContent value="criticality" className="flex-1 m-0 p-4 overflow-auto"><p className="text-xs text-slate-500 mb-3">Drag to assign criticality</p><div className="space-y-2">{criticalityProfiles.map(p => <LibraryItem key={p.id} item={p} type="criticality" onDragStart={handleDragStart} />)}</div></TabsContent>
        </Tabs>
        <div className="p-4 border-t border-slate-200 bg-slate-50"><CriticalityChart nodes={nodes} /></div>
      </div>
      <div className="flex-1 flex flex-col min-w-0" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
        <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3">
          <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9" data-testid="hierarchy-search-input" /></div>
          <Button onClick={() => { setNewNode({ name: "", level: "installation", parent_id: null }); setIsCreateOpen(true); }} size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="add-installation-btn"><Plus className="w-4 h-4 mr-1" />Add Installation</Button>
          {selectedNode && (<><Button onClick={handleAddChild} size="sm" variant="outline" disabled={selectedNode.level === "maintainable_item"} data-testid="add-child-btn"><Plus className="w-4 h-4 mr-1" />Add Child</Button><Button onClick={() => deleteMutation.mutate(selectedNode.id)} size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid="delete-node-btn"><Trash2 className="w-4 h-4" /></Button></>)}
        </div>
        <ScrollArea className="flex-1 p-4">
          {treeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center"><Building2 className="w-12 h-12 text-slate-300 mb-3" /><h3 className="text-lg font-semibold text-slate-600 mb-1">No Equipment Hierarchy</h3><p className="text-sm text-slate-400 mb-4">Start by adding an installation</p><Button onClick={() => setIsCreateOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-1" />Add Installation</Button></div>
          ) : (
            <div className="space-y-1" data-testid="hierarchy-tree">{filteredRows.map(({ node, depth, hasChildren, isExpanded }) => <FlatTreeRow key={node.id} node={node} depth={depth} onSelect={setSelectedNode} isSelected={selectedNode?.id === node.id} isExpanded={isExpanded} onExpand={handleExpand} hasChildren={hasChildren} />)}</div>
          )}
        </ScrollArea>
      </div>
      <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white"><PropertiesPanel node={selectedNode} equipmentTypes={equipmentTypes} criticalityProfiles={criticalityProfiles} disciplines={disciplines} onUpdate={(id, data) => updateMutation.mutate({ nodeId: id, data })} onAssignCriticality={(id, a) => criticalityMutation.mutate({ nodeId: id, assignment: a })} onAssignDiscipline={(id, d) => disciplineMutation.mutate({ nodeId: id, discipline: d })} /></div>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}><DialogContent><DialogHeader><DialogTitle>{newNode.parent_id ? `Add ${LEVEL_CONFIG[newNode.level]?.label}` : "Add Installation"}</DialogTitle></DialogHeader><div className="space-y-4 py-4"><div><Label htmlFor="node-name">Name</Label><Input id="node-name" value={newNode.name} onChange={e => setNewNode({ ...newNode, name: e.target.value })} placeholder="Enter name" data-testid="new-node-name-input" /></div>{!newNode.parent_id && (<div><Label>Level</Label><Select value={newNode.level} onValueChange={v => setNewNode({ ...newNode, level: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEVEL_ORDER.map(l => <SelectItem key={l} value={l}>{LEVEL_CONFIG[l]?.label}</SelectItem>)}</SelectContent></Select></div>)}</div><DialogFooter><Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button><Button onClick={() => createMutation.mutate(newNode)} disabled={!newNode.name.trim() || createMutation.isPending} data-testid="create-node-btn">{createMutation.isPending ? "Creating..." : "Create"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
