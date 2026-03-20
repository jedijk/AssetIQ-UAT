import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useUndo } from "../contexts/UndoContext";
import { 
  Search, 
  Filter, 
  AlertTriangle,
  Cog,
  Zap,
  Thermometer,
  Activity,
  Shield,
  Leaf,
  Info,
  Plus,
  Edit,
  Trash2,
  Droplets,
  Wind,
  Box,
  CircleDot,
  Gauge,
  Cpu,
  Pipette,
  Flame,
  ShieldCheck,
  Link,
  X
} from "lucide-react";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import api, { equipmentHierarchyAPI, failureModesAPI } from "../lib/api";

const categoryIcons = {
  Rotating: Cog,
  Static: Thermometer,
  Piping: Activity,
  Instrumentation: Zap,
  Electrical: Zap,
  Process: Activity,
  Safety: Shield,
  Environment: Leaf,
  Extruder: Cog,
};

const categoryColors = {
  Rotating: "bg-blue-100 text-blue-700 border-blue-200",
  Static: "bg-purple-100 text-purple-700 border-purple-200",
  Piping: "bg-orange-100 text-orange-700 border-orange-200",
  Instrumentation: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Electrical: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Process: "bg-slate-100 text-slate-700 border-slate-200",
  Safety: "bg-red-100 text-red-700 border-red-200",
  Environment: "bg-green-100 text-green-700 border-green-200",
  Extruder: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

// Equipment type icons
const EQUIPMENT_ICONS = { 
  droplets: Droplets, wind: Wind, cog: Cog, thermometer: Thermometer, 
  box: Box, "circle-dot": CircleDot, zap: Zap, gauge: Gauge, 
  cpu: Cpu, pipette: Pipette, flame: Flame 
};
const ICON_OPTIONS = ["droplets", "wind", "cog", "thermometer", "box", "circle-dot", "zap", "gauge", "cpu", "pipette", "flame"];
const DISCIPLINES = ["mechanical", "electrical", "instrumentation", "process"];

// Equipment Type Library Item
function EquipmentTypeItem({ item, onEdit, onDelete }) {
  const Icon = EQUIPMENT_ICONS[item.icon] || Cog;
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-all group" data-testid={`equipment-type-${item.id}`}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100">
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-slate-700 block truncate">{item.name}</span>
        <span className="text-xs text-slate-400 capitalize">{item.discipline}</span>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-1">
        <button onClick={() => onEdit(item)} className="p-1.5 hover:bg-blue-50 rounded"><Edit className="w-3.5 h-3.5 text-blue-500" /></button>
        {item.is_custom && <button onClick={() => onDelete(item.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
      </div>
    </div>
  );
}

const FailureModesPage = () => {
  const queryClient = useQueryClient();
  const { pushUndo } = useUndo();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mainTab, setMainTab] = useState("failure-modes");
  const [libraryTab, setLibraryTab] = useState("equipment");
  
  // Equipment type dialog state
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [newType, setNewType] = useState({ id: "", name: "", discipline: "mechanical", icon: "cog", iso_class: "" });
  
  // Failure mode dialog state
  const [isFmDialogOpen, setIsFmDialogOpen] = useState(false);
  const [editingFm, setEditingFm] = useState(null);
  const [newFm, setNewFm] = useState({
    category: "Rotating",
    equipment: "",
    failure_mode: "",
    keywords: [],
    severity: 5,
    occurrence: 5,
    detectability: 5,
    recommended_actions: [],
    equipment_type_ids: []
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  
  const resetTypeForm = () => setNewType({ id: "", name: "", discipline: "mechanical", icon: "cog", iso_class: "" });
  const resetFmForm = () => {
    setNewFm({
      category: "Rotating",
      equipment: "",
      failure_mode: "",
      keywords: [],
      severity: 5,
      occurrence: 5,
      detectability: 5,
      recommended_actions: [],
      equipment_type_ids: []
    });
    setKeywordInput("");
    setActionInput("");
  };

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ["failureModeCategories"],
    queryFn: async () => {
      const response = await api.get("/failure-modes/categories");
      return response.data;
    },
  });

  // Fetch failure modes
  const { data: modesData, isLoading } = useQuery({
    queryKey: ["failureModes", categoryFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "all") {
        params.append("category", categoryFilter);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      const response = await api.get(`/failure-modes?${params.toString()}`);
      return response.data;
    },
  });

  // Fetch equipment types
  const { data: typesData } = useQuery({ 
    queryKey: ["equipment-types"], 
    queryFn: equipmentHierarchyAPI.getEquipmentTypes 
  });

  const categories = categoriesData?.categories || [];
  const failureModes = modesData?.failure_modes || [];
  const equipmentTypes = typesData?.equipment_types || [];
  
  // Calculate dynamic stats
  const totalModes = failureModes.length;
  const totalCategories = categories.length;
  
  // Equipment type mutations
  const createTypeMutation = useMutation({ 
    mutationFn: equipmentHierarchyAPI.createEquipmentType, 
    onSuccess: () => { 
      queryClient.invalidateQueries(["equipment-types"]); 
      toast.success("Equipment type created"); 
      setIsTypeDialogOpen(false); 
      resetTypeForm(); 
    }, 
    onError: e => toast.error(e.response?.data?.detail || "Failed") 
  });
  
  const updateTypeMutation = useMutation({ 
    mutationFn: ({ typeId, data }) => equipmentHierarchyAPI.updateEquipmentType(typeId, data), 
    onSuccess: () => { 
      queryClient.invalidateQueries(["equipment-types"]); 
      toast.success("Equipment type updated"); 
      setIsTypeDialogOpen(false); 
      setEditingType(null); 
      resetTypeForm(); 
    }, 
    onError: e => toast.error(e.response?.data?.detail || "Failed") 
  });
  
  const deleteTypeMutation = useMutation({ 
    mutationFn: equipmentHierarchyAPI.deleteEquipmentType, 
    onSuccess: () => { 
      queryClient.invalidateQueries(["equipment-types"]); 
      toast.success("Equipment type deleted"); 
    }, 
    onError: e => toast.error(e.response?.data?.detail || "Failed") 
  });

  // Failure mode mutations
  const createFmMutation = useMutation({
    mutationFn: failureModesAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries(["failureModes"]);
      toast.success("Failure mode created");
      setIsFmDialogOpen(false);
      resetFmForm();
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed to create")
  });

  const updateFmMutation = useMutation({
    mutationFn: ({ id, data, oldData }) => failureModesAPI.update(id, data).then(result => ({ result, id, data, oldData })),
    onSuccess: ({ id, data, oldData }) => {
      if (oldData) {
        pushUndo({
          type: "UPDATE_FAILURE_MODE",
          label: `Edit "${oldData.failure_mode}"`,
          data: { oldData, newData: data },
          undo: async () => {
            await failureModesAPI.update(id, {
              category: oldData.category,
              equipment: oldData.equipment,
              failure_mode: oldData.failure_mode,
              keywords: oldData.keywords || [],
              severity: oldData.severity,
              occurrence: oldData.occurrence,
              detectability: oldData.detectability,
              recommended_actions: oldData.recommended_actions || [],
              equipment_type_ids: oldData.equipment_type_ids || []
            });
            queryClient.invalidateQueries(["failureModes"]);
          },
        });
      }
      queryClient.invalidateQueries(["failureModes"]);
      toast.success("Failure mode updated");
      setIsFmDialogOpen(false);
      setEditingFm(null);
      resetFmForm();
    },
    onError: e => toast.error(e.response?.data?.detail || "Failed to update")
  });

  const deleteFmMutation = useMutation({
    mutationFn: async (id) => {
      // Find the failure mode to delete before actually deleting
      const fmToDelete = failureModes.find(fm => fm.id === id);
      const result = await failureModesAPI.delete(id);
      return { result, deletedFm: fmToDelete };
    },
    onSuccess: ({ deletedFm }) => {
      if (deletedFm) {
        pushUndo({
          type: "DELETE_FAILURE_MODE",
          label: `Delete "${deletedFm.failure_mode}"`,
          data: deletedFm,
          undo: async () => {
            await failureModesAPI.create({
              category: deletedFm.category,
              equipment: deletedFm.equipment,
              failure_mode: deletedFm.failure_mode,
              keywords: deletedFm.keywords || [],
              severity: deletedFm.severity,
              occurrence: deletedFm.occurrence,
              detectability: deletedFm.detectability,
              recommended_actions: deletedFm.recommended_actions || [],
              equipment_type_ids: deletedFm.equipment_type_ids || []
            });
            queryClient.invalidateQueries(["failureModes"]);
          },
        });
      }
      queryClient.invalidateQueries(["failureModes"]);
      toast.success("Failure mode deleted");
    },
    onError: e => toast.error(e.response?.data?.detail || "Cannot delete built-in failure modes")
  });

  const handleEditType = (type) => { 
    setEditingType(type); 
    setNewType({ id: type.id, name: type.name, discipline: type.discipline || "mechanical", icon: type.icon || "cog", iso_class: type.iso_class || "" }); 
    setIsTypeDialogOpen(true); 
  };
  
  const handleSaveType = () => { 
    if (editingType) { 
      updateTypeMutation.mutate({ typeId: editingType.id, data: { name: newType.name, discipline: newType.discipline, icon: newType.icon, iso_class: newType.iso_class } }); 
    } else { 
      createTypeMutation.mutate(newType); 
    } 
  };

  const handleEditFm = (fm) => {
    setEditingFm(fm);
    setNewFm({
      category: fm.category,
      equipment: fm.equipment,
      failure_mode: fm.failure_mode,
      keywords: fm.keywords || [],
      severity: fm.severity,
      occurrence: fm.occurrence,
      detectability: fm.detectability,
      recommended_actions: fm.recommended_actions || [],
      equipment_type_ids: fm.equipment_type_ids || []
    });
    setIsFmDialogOpen(true);
  };

  const handleSaveFm = () => {
    if (editingFm) {
      updateFmMutation.mutate({ id: editingFm.id, data: newFm, oldData: editingFm });
    } else {
      createFmMutation.mutate(newFm);
    }
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !newFm.keywords.includes(keywordInput.trim())) {
      setNewFm({ ...newFm, keywords: [...newFm.keywords, keywordInput.trim()] });
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw) => {
    setNewFm({ ...newFm, keywords: newFm.keywords.filter(k => k !== kw) });
  };

  const addAction = () => {
    if (actionInput.trim()) {
      setNewFm({ ...newFm, recommended_actions: [...newFm.recommended_actions, actionInput.trim()] });
      setActionInput("");
    }
  };

  const removeAction = (idx) => {
    setNewFm({ ...newFm, recommended_actions: newFm.recommended_actions.filter((_, i) => i !== idx) });
  };

  const toggleEquipmentType = (typeId) => {
    setNewFm(prev => {
      const current = prev.equipment_type_ids || [];
      if (current.includes(typeId)) {
        return { ...prev, equipment_type_ids: current.filter(id => id !== typeId) };
      } else {
        return { ...prev, equipment_type_ids: [...current, typeId] };
      }
    });
  };

  // Auto-link equipment types when equipment name changes
  const handleEquipmentChange = (value) => {
    setNewFm(prev => {
      const updated = { ...prev, equipment: value };
      // Auto-detect equipment types if not already set
      if (!prev.equipment_type_ids || prev.equipment_type_ids.length === 0) {
        const equipLower = value.toLowerCase();
        const autoTypes = equipmentTypes.filter(t => 
          equipLower.includes(t.name.toLowerCase()) || 
          t.name.toLowerCase().includes(equipLower)
        ).map(t => t.id);
        if (autoTypes.length > 0) {
          updated.equipment_type_ids = autoTypes;
        }
      }
      return updated;
    });
  };

  return (
    <div className="container mx-auto px-4 py-4 max-w-7xl" data-testid="failure-modes-page">
      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="failure-modes">Failure Modes</TabsTrigger>
          <TabsTrigger value="libraries">Equipment Types</TabsTrigger>
        </TabsList>

        {/* Failure Modes Tab */}
        <TabsContent value="failure-modes" className="space-y-4">
          {/* Compact Stats Row - Same as ThreatsPage */}
          <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-slate-100">
                <AlertTriangle className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-slate-900">{totalModes}</span>
                <span className="text-xs text-slate-500 ml-1">Failure Modes</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-blue-50">
                <Filter className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-blue-600">{totalCategories}</span>
                <span className="text-xs text-slate-500 ml-1">Categories</span>
              </div>
            </div>
          </div>

          {/* Filters - Same as ThreatsPage */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6" data-testid="filters">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search failure modes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
                data-testid="search-input"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48 h-11" data-testid="category-filter">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => { setEditingFm(null); resetFmForm(); setIsFmDialogOpen(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-failure-mode-btn">
              <Plus className="w-4 h-4 mr-1" /> Add Failure Mode
            </Button>
          </div>

          {/* Failure Modes List - Same style as ThreatsPage priority-list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          ) : failureModes.length === 0 ? (
            <div className="empty-state py-16">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Info className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-700 mb-2">No matches found</h3>
              <p className="text-slate-500">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="priority-list" data-testid="failure-modes-list">
              {failureModes.map((fm, idx) => {
                const Icon = categoryIcons[fm.category] || AlertTriangle;
                const colors = categoryColors[fm.category] || "bg-slate-100 text-slate-700";
                
                return (
                  <motion.div
                    key={fm.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="priority-item group"
                    data-testid={`failure-mode-${fm.id}`}
                  >
                    {/* Category Icon */}
                    <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${colors.split(' ')[0]}`}>
                      <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${colors.split(' ')[1]}`} />
                    </div>

                    {/* ID */}
                    <div className="priority-rank text-sm sm:text-base">
                      #{fm.id}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-1">
                          {fm.failure_mode}
                        </h3>
                        <Badge className={colors}>
                          {fm.category}
                        </Badge>
                      </div>
                      <div className="text-xs sm:text-sm text-slate-500 line-clamp-1">
                        <span>{fm.equipment}</span>
                        <span className="mx-1">•</span>
                        <span>{fm.keywords.slice(0, 3).join(", ")}</span>
                      </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                      {fm.equipment_type_ids && fm.equipment_type_ids.length > 0 && (
                        <div className="text-right hidden sm:block">
                          <div className="text-xs text-blue-600 flex items-center gap-1">
                            <Link className="w-3 h-3" />
                            {fm.equipment_type_ids.length} linked
                          </div>
                        </div>
                      )}
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={(e) => { e.stopPropagation(); handleEditFm(fm); }} 
                        className="h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`edit-fm-${fm.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {fm.is_custom && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); deleteFmMutation.mutate(fm.id); }} 
                          data-testid={`delete-fm-${fm.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Equipment Types Tab */}
        <TabsContent value="libraries" className="space-y-6">
          <div className="card">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">Equipment Types</h3>
                <p className="text-xs text-slate-500 mt-1">{equipmentTypes.length} types defined</p>
              </div>
              <Button size="sm" onClick={() => { setEditingType(null); resetTypeForm(); setIsTypeDialogOpen(true); }} data-testid="add-equipment-type-btn">
                <Plus className="w-4 h-4 mr-1" /> Add Type
              </Button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[calc(100vh-320px)] overflow-y-auto">
              {equipmentTypes.map(t => (
                <EquipmentTypeItem 
                  key={t.id} 
                  item={t} 
                  onEdit={handleEditType} 
                  onDelete={(id) => deleteTypeMutation.mutate(id)} 
                />
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Equipment Type Dialog */}
      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit Equipment Type" : "Add Equipment Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editingType && (
              <div>
                <Label>ID (unique)</Label>
                <Input 
                  value={newType.id} 
                  onChange={e => setNewType({ ...newType, id: e.target.value.toLowerCase().replace(/\s+/g, '_') })} 
                  placeholder="pump_custom" 
                  data-testid="type-id-input" 
                />
              </div>
            )}
            <div>
              <Label>Name</Label>
              <Input 
                value={newType.name} 
                onChange={e => setNewType({ ...newType, name: e.target.value })} 
                placeholder="Custom Pump" 
                data-testid="type-name-input" 
              />
            </div>
            <div>
              <Label>ISO Class (optional)</Label>
              <Input 
                value={newType.iso_class} 
                onChange={e => setNewType({ ...newType, iso_class: e.target.value })} 
                placeholder="1.1.99" 
              />
            </div>
            <div>
              <Label>Discipline</Label>
              <Select value={newType.discipline} onValueChange={v => setNewType({ ...newType, discipline: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {ICON_OPTIONS.map(icon => { 
                  const IconComp = EQUIPMENT_ICONS[icon] || Cog; 
                  return (
                    <button 
                      key={icon} 
                      onClick={() => setNewType({ ...newType, icon })} 
                      className={`p-2 rounded-lg border ${newType.icon === icon ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <IconComp className="w-5 h-5" />
                    </button>
                  ); 
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsTypeDialogOpen(false); setEditingType(null); resetTypeForm(); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveType} 
              disabled={(!editingType && !newType.id.trim()) || !newType.name.trim()} 
              data-testid="save-type-btn"
            >
              {editingType ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Failure Mode Dialog */}
      <Dialog open={isFmDialogOpen} onOpenChange={setIsFmDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFm ? "Edit Failure Mode" : "Add Failure Mode"}</DialogTitle>
            <DialogDescription>
              {editingFm ? "Update the failure mode details below." : "Create a new failure mode entry."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Row 1: Category & Equipment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select value={newFm.category} onValueChange={v => setNewFm({ ...newFm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Equipment *</Label>
                <Input 
                  value={newFm.equipment} 
                  onChange={e => handleEquipmentChange(e.target.value)} 
                  placeholder="e.g., Pump, Compressor, Valve" 
                  data-testid="fm-equipment-input"
                />
              </div>
            </div>

            {/* Failure Mode Name */}
            <div>
              <Label>Failure Mode Name *</Label>
              <Input 
                value={newFm.failure_mode} 
                onChange={e => setNewFm({ ...newFm, failure_mode: e.target.value })} 
                placeholder="e.g., Seal Failure, Bearing Damage" 
                data-testid="fm-name-input"
              />
            </div>

            {/* Linked Equipment Types - Multi-select */}
            <div>
              <Label className="flex items-center gap-2">
                <Link className="w-4 h-4 text-blue-500" />
                Linked Equipment Types
              </Label>
              <p className="text-xs text-slate-500 mb-2">Click to select/deselect (multiple allowed)</p>
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg max-h-40 overflow-y-auto">
                {equipmentTypes.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleEquipmentType(t.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      (newFm.equipment_type_ids || []).includes(t.id)
                        ? "bg-blue-500 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:border-blue-300"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              {(newFm.equipment_type_ids || []).length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  Selected: {(newFm.equipment_type_ids || []).length} type(s)
                </p>
              )}
            </div>

            {/* FMEA Scores Row */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Severity (1-10) *</Label>
                <Input 
                  type="number" 
                  min={1} max={10} 
                  value={newFm.severity} 
                  onChange={e => setNewFm({ ...newFm, severity: parseInt(e.target.value) || 5 })} 
                />
              </div>
              <div>
                <Label>Occurrence (1-10) *</Label>
                <Input 
                  type="number" 
                  min={1} max={10} 
                  value={newFm.occurrence} 
                  onChange={e => setNewFm({ ...newFm, occurrence: parseInt(e.target.value) || 5 })} 
                />
              </div>
              <div>
                <Label>Detectability (1-10) *</Label>
                <Input 
                  type="number" 
                  min={1} max={10} 
                  value={newFm.detectability} 
                  onChange={e => setNewFm({ ...newFm, detectability: parseInt(e.target.value) || 5 })} 
                />
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg text-center">
              <span className="text-sm text-slate-600">RPN = {newFm.severity} × {newFm.occurrence} × {newFm.detectability} = </span>
              <span className={`text-lg font-bold ${newFm.severity * newFm.occurrence * newFm.detectability >= 300 ? "text-red-600" : newFm.severity * newFm.occurrence * newFm.detectability >= 200 ? "text-orange-600" : "text-green-600"}`}>
                {newFm.severity * newFm.occurrence * newFm.detectability}
              </span>
            </div>

            {/* Keywords */}
            <div>
              <Label>Keywords</Label>
              <div className="flex gap-2">
                <Input 
                  value={keywordInput} 
                  onChange={e => setKeywordInput(e.target.value)} 
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                  placeholder="Add keyword and press Enter" 
                />
                <Button type="button" variant="outline" onClick={addKeyword}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {newFm.keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center gap-1">
                    {kw}
                    <button onClick={() => removeKeyword(kw)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Recommended Actions */}
            <div>
              <Label>Recommended Actions</Label>
              <div className="flex gap-2">
                <Input 
                  value={actionInput} 
                  onChange={e => setActionInput(e.target.value)} 
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addAction())}
                  placeholder="Add action and press Enter" 
                />
                <Button type="button" variant="outline" onClick={addAction}>Add</Button>
              </div>
              <ul className="space-y-1 mt-2">
                {newFm.recommended_actions.map((action, i) => (
                  <li key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                    <span>{i + 1}. {action}</span>
                    <button onClick={() => removeAction(i)} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsFmDialogOpen(false); setEditingFm(null); resetFmForm(); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveFm} 
              disabled={!newFm.failure_mode.trim() || !newFm.equipment.trim()} 
              data-testid="save-fm-btn"
            >
              {editingFm ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FailureModesPage;
