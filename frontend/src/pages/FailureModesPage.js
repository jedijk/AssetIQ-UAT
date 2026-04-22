import { useState, useEffect } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { formatDateTime } from "../lib/dateUtils";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
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
  X,
  CheckCircle,
  ChevronRight,
  Download,
  BookOpen,
  History,
  Clock,
  User,
  RotateCcw,
  Maximize2,
  Minimize2,
  Globe,
  Building
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
import { SearchableSelect } from "../components/ui/searchable-select";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import api, { equipmentHierarchyAPI, failureModesAPI, getErrorMessage } from "../lib/api";
import MaintenanceStrategiesPanel from "../components/MaintenanceStrategiesPanel";
import BackButton from "../components/BackButton";

// Extracted components
import { EquipmentTypeItem, EQUIPMENT_ICONS, ICON_OPTIONS, DISCIPLINES, EQUIPMENT_CATEGORIES, DISCIPLINE_COLORS } from "../components/library";
import { FailureModeViewPanel } from "../components/library";

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

const FailureModesPage = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const isMobile = useIsMobile();
  
  // Initialize state from URL params (for FMEA linkage from Maintenance Strategies)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all"); // generic, customer_specific, all
  const [mainTab, setMainTab] = useState(() => searchParams.get("tab") || "failure-modes");
  const [libraryTab, setLibraryTab] = useState("equipment");
  
  // Failure mode type options
  const FAILURE_MODE_TYPE_OPTIONS = [
    { value: "all", label: "All Types" },
    { value: "generic", label: "Generic (Industry Standard)", color: "bg-blue-100 text-blue-700", icon: "globe" },
    { value: "customer_specific", label: "Customer Specific", color: "bg-purple-100 text-purple-700", icon: "building" },
    { value: "recently_added", label: "Recently Added (30 days)", color: "bg-green-100 text-green-700", icon: "clock" },
  ];
  
  // Handle URL parameter changes (e.g., from Maintenance Strategy FMEA links)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const searchParam = searchParams.get("search");
    if (tabParam) setMainTab(tabParam);
    if (searchParam) setSearchQuery(searchParam);
    // Clear URL params after applying them
    if (tabParam || searchParam) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  // Equipment type dialog state
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [newType, setNewType] = useState({ id: "", name: "", discipline: "Mechanical", icon: "cog", iso_class: "", category: "rotating" });
  const [typeFilterDiscipline, setTypeFilterDiscipline] = useState("all"); // Filter for Equipment Types tab
  
  // Failure mode dialog state
  const [isFmDialogOpen, setIsFmDialogOpen] = useState(false);
  const [editingFm, setEditingFm] = useState(null);
  const [selectedFm, setSelectedFm] = useState(null); // For view panel
  const [isViewPanelEditing, setIsViewPanelEditing] = useState(false); // Edit mode for view panel
  const [viewPanelForm, setViewPanelForm] = useState(null); // Form state for view panel editing
  const [isViewPanelFullscreen, setIsViewPanelFullscreen] = useState(false); // Fullscreen mode for view panel
  
  // Version history state
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistoryFmId, setVersionHistoryFmId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  
  // Delete confirmation state
  const [deleteConfirmFm, setDeleteConfirmFm] = useState(null);
  
  const [newFm, setNewFm] = useState({
    category: "Rotating",
    equipment: "",
    failure_mode: "",
    keywords: [],
    severity: 5,
    occurrence: 5,
    detectability: 5,
    recommended_actions: [],
    equipment_type_ids: [],
    process: "",
    potential_effects: "",
    potential_causes: "",
    iso14224_mechanism: "",
    failure_mode_type: "generic"  // "generic" or "customer_specific"
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [actionDiscipline, setActionDiscipline] = useState("mechanical");
  const [actionType, setActionType] = useState("PM");
  
  const DISCIPLINE_OPTIONS = [
    { value: "mechanical", label: "Mechanical" },
    { value: "electrical", label: "Electrical" },
    { value: "instrumentation", label: "Instrumentation" },
    { value: "process", label: "Process" },
    { value: "civil", label: "Civil/Structural" },
    { value: "operations", label: "Operations" },
    { value: "laboratory", label: "Laboratory" },
  ];
  
  const ACTION_TYPE_OPTIONS = [
    { value: "PM", label: "PM (Preventive)", color: "bg-blue-100 text-blue-700" },
    { value: "CM", label: "CM (Corrective)", color: "bg-amber-100 text-amber-700" },
    { value: "PDM", label: "PDM (Predictive)", color: "bg-purple-100 text-purple-700" },
  ];
  
  const resetTypeForm = () => setNewType({ id: "", name: "", discipline: "Mechanical", icon: "cog", iso_class: "", category: "rotating" });
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
      equipment_type_ids: [],
      process: "",
      potential_effects: "",
      potential_causes: "",
      iso14224_mechanism: "",
      failure_mode_type: "generic"
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
    queryKey: ["failureModes", categoryFilter, searchQuery, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "all") {
        params.append("category", categoryFilter);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      if (typeFilter && typeFilter !== "all") {
        params.append("failure_mode_type", typeFilter);
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
      queryClient.invalidateQueries({ queryKey: ["equipment-types"] }); 
      toast.success("Equipment type created"); 
      setIsTypeDialogOpen(false); 
      resetTypeForm(); 
    }, 
    onError: e => toast.error(getErrorMessage(e, "Failed")) 
  });
  
  const updateTypeMutation = useMutation({ 
    mutationFn: ({ typeId, data }) => equipmentHierarchyAPI.updateEquipmentType(typeId, data), 
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["equipment-types"] }); 
      toast.success("Equipment type updated"); 
      setIsTypeDialogOpen(false); 
      setEditingType(null); 
      resetTypeForm(); 
    }, 
    onError: e => toast.error(getErrorMessage(e, "Failed")) 
  });
  
  const deleteTypeMutation = useMutation({ 
    mutationFn: equipmentHierarchyAPI.deleteEquipmentType, 
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["equipment-types"] }); 
      toast.success("Equipment type deleted"); 
    }, 
    onError: e => toast.error(getErrorMessage(e, "Failed")) 
  });

  // Failure mode mutations
  const createFmMutation = useMutation({
    mutationFn: failureModesAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["failureModes"] });
      toast.success("Failure mode created");
      setIsFmDialogOpen(false);
      resetFmForm();
    },
    onError: e => toast.error(getErrorMessage(e, "Failed to create"))
  });

  const updateFmMutation = useMutation({
    mutationFn: ({ id, data, oldData }) => failureModesAPI.update(id, data).then(result => ({ result, id, data, oldData })),
    onSuccess: ({ result, id, data, oldData }) => {
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
            queryClient.invalidateQueries({ queryKey: ["failureModes"] });
          },
        });
      }
      // Update selectedFm with the new data including updated version
      if (selectedFm && selectedFm.id === id && result) {
        setSelectedFm(result);
      }
      queryClient.invalidateQueries({ queryKey: ["failureModes"] });
      toast.success(`Failure mode updated (v${result?.version || '?'})`);
      setIsFmDialogOpen(false);
      setEditingFm(null);
      resetFmForm();
    },
    onError: e => toast.error(getErrorMessage(e, "Failed to update"))
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
            queryClient.invalidateQueries({ queryKey: ["failureModes"] });
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["failureModes"] });
      toast.success("Failure mode deleted");
    },
    onError: e => toast.error(getErrorMessage(e, "Cannot delete built-in failure modes"))
  });

  // Validation mutations
  const validateFmMutation = useMutation({
    mutationFn: ({ id, validatorName, validatorPosition, validatorId }) => 
      failureModesAPI.validate(id, validatorName, validatorPosition, validatorId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["failureModes"] });
      // Update selected FM if it matches
      if (selectedFm && selectedFm.id === data.id) {
        setSelectedFm(data);
      }
      toast.success(t("library.validationAdded"));
    },
    onError: e => toast.error(getErrorMessage(e, "Failed to validate"))
  });

  const unvalidateFmMutation = useMutation({
    mutationFn: (id) => failureModesAPI.unvalidate(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["failureModes"] });
      // Update selected FM if it matches
      if (selectedFm && selectedFm.id === data.id) {
        setSelectedFm(data);
      }
      toast.success(t("library.validationRemoved"));
    },
    onError: e => toast.error(getErrorMessage(e, "Failed to remove validation"))
  });

  const handleValidateFm = (id, validatorName, validatorPosition, validatorId) => {
    validateFmMutation.mutate({ id, validatorName, validatorPosition, validatorId });
  };

  const handleUnvalidateFm = (id) => {
    unvalidateFmMutation.mutate(id);
  };

  // Version history handlers
  const handleShowVersionHistory = async (fmId) => {
    setVersionHistoryFmId(fmId);
    setVersionsLoading(true);
    setShowVersionHistory(true);
    
    try {
      const data = await failureModesAPI.getVersions(fmId);
      setVersions(data.versions || []);
    } catch (error) {
      toast.error("Failed to load version history");
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const rollbackMutation = useMutation({
    mutationFn: ({ fmId, versionId }) => failureModesAPI.rollback(fmId, versionId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["failureModes"] });
      if (selectedFm && selectedFm.id === data.id) {
        setSelectedFm(data);
      }
      toast.success(`Rolled back to version ${data.rolled_back_from_version}`);
      setShowVersionHistory(false);
    },
    onError: (e) => toast.error(getErrorMessage(e, "Failed to rollback"))
  });

  const handleRollback = (versionId) => {
    if (versionHistoryFmId && versionId) {
      rollbackMutation.mutate({ fmId: versionHistoryFmId, versionId });
    }
  };

  const handleEditType = (type) => { 
    setEditingType(type); 
    setNewType({ id: type.id, name: type.name, discipline: type.discipline || "Mechanical", icon: type.icon || "cog", iso_class: type.iso_class || "", category: type.category || "rotating" }); 
    setIsTypeDialogOpen(true); 
  };
  
  const handleSaveType = () => { 
    if (editingType) { 
      updateTypeMutation.mutate({ typeId: editingType.id, data: { name: newType.name, discipline: newType.discipline, icon: newType.icon, iso_class: newType.iso_class, category: newType.category } }); 
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
      equipment_type_ids: fm.equipment_type_ids || [],
      process: fm.process || "",
      potential_effects: fm.potential_effects || "",
      potential_causes: fm.potential_causes || "",
      iso14224_mechanism: fm.iso14224_mechanism || ""
    });
    setIsFmDialogOpen(true);
  };

  // Handle selecting a failure mode for the view panel
  const handleSelectFm = (fm) => {
    setSelectedFm(fm);
    setIsViewPanelEditing(false);
    setViewPanelForm(null);
  };

  // Start editing in the view panel
  const handleStartViewPanelEdit = () => {
    if (selectedFm) {
      setViewPanelForm({
        category: selectedFm.category,
        equipment: selectedFm.equipment,
        failure_mode: selectedFm.failure_mode,
        keywords: selectedFm.keywords || [],
        severity: selectedFm.severity,
        occurrence: selectedFm.occurrence,
        detectability: selectedFm.detectability,
        recommended_actions: selectedFm.recommended_actions || [],
        equipment_type_ids: selectedFm.equipment_type_ids || [],
        process: selectedFm.process || "",
        potential_effects: selectedFm.potential_effects || "",
        potential_causes: selectedFm.potential_causes || "",
        iso14224_mechanism: selectedFm.iso14224_mechanism || ""
      });
      setIsViewPanelEditing(true);
    }
  };

  // Save view panel edits
  const handleSaveViewPanelEdit = () => {
    if (selectedFm && viewPanelForm) {
      updateFmMutation.mutate({ 
        id: selectedFm.id, 
        data: viewPanelForm,
        oldData: selectedFm 
      });
      // Note: selectedFm will be updated in onSuccess with the new version
      setIsViewPanelEditing(false);
      setViewPanelForm(null);
    }
  };

  // Cancel view panel edit
  const handleCancelViewPanelEdit = () => {
    setIsViewPanelEditing(false);
    setViewPanelForm(null);
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
      const newAction = {
        description: actionInput.trim(),
        discipline: actionDiscipline,
        action_type: actionType
      };
      setNewFm({ ...newFm, recommended_actions: [...newFm.recommended_actions, newAction] });
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

  // Export failure modes to Excel
  const [isExporting, setIsExporting] = useState(false);
  
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const response = await api.get('/failure-modes/export', {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from content-disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'failure_modes.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/"/g, '');
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(t("library.exportSuccess") || "Failure modes exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error(t("library.exportError") || "Failed to export failure modes");
    } finally {
      setIsExporting(false);
    }
  };

  // Mobile: Show desktop-only message
  if (isMobile) {
    return <DesktopOnlyMessage title="FMEA Library" icon={BookOpen} />;
  }

  return (
    <div className="container mx-auto px-4 py-4 max-w-7xl" data-testid="failure-modes-page">
      {/* Back Button - shown when navigated from another page */}
      {location.state?.from && (
        <div className="mb-3">
          <BackButton />
        </div>
      )}
      
      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="failure-modes">{t("library.failureModes")}</TabsTrigger>
          <TabsTrigger value="libraries">{t("library.equipmentTypes")}</TabsTrigger>
          <TabsTrigger value="maintenance" data-testid="maintenance-strategies-tab">{t("library.maintenance")}</TabsTrigger>
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
                <span className="text-xs text-slate-500 ml-1">{t("library.failureModes")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-blue-50">
                <Filter className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-blue-600">{totalCategories}</span>
                <span className="text-xs text-slate-500 ml-1">{t("library.categories")}</span>
              </div>
            </div>
          </div>

          {/* Filters - Same as ThreatsPage */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6" data-testid="filters">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder={t("library.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
                data-testid="search-input"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48 h-11" data-testid="category-filter">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder={t("library.allCategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("library.allCategories")}</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-52 h-11" data-testid="type-filter">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">All Types</span>
                </SelectItem>
                <SelectItem value="generic">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Generic (Industry)
                  </span>
                </SelectItem>
                <SelectItem value="customer_specific">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    Customer Specific
                  </span>
                </SelectItem>
                <SelectItem value="recently_added">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Recently Added (30 days)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={handleExportExcel} 
              variant="outline" 
              className="h-11" 
              disabled={isExporting}
              data-testid="export-excel-btn"
            >
              <Download className="w-4 h-4 mr-1" /> 
              {isExporting ? (t("common.exporting") || "Exporting...") : (t("library.exportExcel") || "Export Excel")}
            </Button>
            <Button onClick={() => { setEditingFm(null); resetFmForm(); setIsFmDialogOpen(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-failure-mode-btn">
              <Plus className="w-4 h-4 mr-1" /> {t("library.addFailureMode")}
            </Button>
          </div>

          {/* Two-Panel Layout: List + View Panel */}
          <div className="flex gap-4 h-[calc(100vh-340px)]">
            {/* Left Panel: Failure Modes List */}
            <div className={`${selectedFm ? 'w-1/2 lg:w-2/5' : 'w-full'} transition-all duration-300`}>
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
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">{t("library.noMatches")}</h3>
                  <p className="text-slate-500">{t("library.tryAdjusting")}</p>
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto h-full pr-2" data-testid="failure-modes-list">
                  {failureModes.map((fm, idx) => {
                    const Icon = categoryIcons[fm.category] || AlertTriangle;
                    const colors = categoryColors[fm.category] || "bg-slate-100 text-slate-700";
                    const isSelected = selectedFm?.id === fm.id;
                    
                    return (
                      <motion.div
                        key={fm.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                          isSelected 
                            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' 
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                        }`}
                        onClick={() => handleSelectFm(fm)}
                        data-testid={`failure-mode-${fm.id}`}
                      >
                        {/* Category Icon */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${colors.split(' ')[0]}`}>
                          <Icon className={`w-5 h-5 ${colors.split(' ')[1]}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge className={`${colors} text-xs px-1.5 py-0`}>{fm.category}</Badge>
                            {fm.failure_mode_type === "customer_specific" && (
                              <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0">
                                Customer
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-medium text-slate-900 text-sm line-clamp-1">
                            {fm.failure_mode}
                          </h3>
                          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {fm.equipment} • {fm.keywords?.slice(0, 2).join(", ")}
                          </p>
                        </div>

                        {/* RPN Score Badge */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-1">
                          <div className={`w-12 h-10 rounded-lg flex flex-col items-center justify-center text-sm font-bold ${
                            fm.severity * fm.occurrence * fm.detectability >= 200 ? 'bg-red-100 text-red-700' :
                            fm.severity * fm.occurrence * fm.detectability >= 125 ? 'bg-orange-100 text-orange-700' :
                            fm.severity * fm.occurrence * fm.detectability >= 80 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            <span className="text-lg leading-tight">{fm.severity * fm.occurrence * fm.detectability}</span>
                            <span className="text-[9px] opacity-70">RPN</span>
                          </div>
                          {/* Validation indicator */}
                          {fm.is_validated ? (
                            <CheckCircle className="w-4 h-4 text-green-500" title={t("library.validated")} />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-400" title={t("library.notValidated")} />
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Panel: View/Edit Panel */}
            {selectedFm && !isViewPanelFullscreen && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-1/2 lg:w-3/5 h-full"
              >
                <FailureModeViewPanel
                  fm={selectedFm}
                  isEditing={isViewPanelEditing}
                  formData={viewPanelForm}
                  setFormData={setViewPanelForm}
                  onStartEdit={handleStartViewPanelEdit}
                  onSave={handleSaveViewPanelEdit}
                  onCancel={handleCancelViewPanelEdit}
                  onClose={() => { setSelectedFm(null); setIsViewPanelEditing(false); setViewPanelForm(null); setIsViewPanelFullscreen(false); }}
                  onDelete={(id) => { 
                    const fmToDelete = failureModes.find(fm => fm.id === id);
                    setDeleteConfirmFm(fmToDelete);
                  }}
                  onValidate={handleValidateFm}
                  onUnvalidate={handleUnvalidateFm}
                  onShowVersionHistory={handleShowVersionHistory}
                  equipmentTypes={equipmentTypes}
                  categories={categories}
                  currentUser={user}
                  t={t}
                  isFullscreen={false}
                  onToggleFullscreen={() => setIsViewPanelFullscreen(true)}
                />
              </motion.div>
            )}
          </div>
          
          {/* Fullscreen View Panel Overlay */}
          {selectedFm && isViewPanelFullscreen && (
            <div className="fixed inset-0 z-50 bg-white overflow-hidden">
              <FailureModeViewPanel
                fm={selectedFm}
                isEditing={isViewPanelEditing}
                formData={viewPanelForm}
                setFormData={setViewPanelForm}
                onStartEdit={handleStartViewPanelEdit}
                onSave={handleSaveViewPanelEdit}
                onCancel={handleCancelViewPanelEdit}
                onClose={() => { setSelectedFm(null); setIsViewPanelEditing(false); setViewPanelForm(null); setIsViewPanelFullscreen(false); }}
                onDelete={(id) => { 
                  const fmToDelete = failureModes.find(fm => fm.id === id);
                  setDeleteConfirmFm(fmToDelete);
                }}
                onValidate={handleValidateFm}
                onUnvalidate={handleUnvalidateFm}
                onShowVersionHistory={handleShowVersionHistory}
                equipmentTypes={equipmentTypes}
                categories={categories}
                currentUser={user}
                t={t}
                isFullscreen={true}
                onToggleFullscreen={() => setIsViewPanelFullscreen(false)}
              />
            </div>
          )}
        </TabsContent>

        {/* Equipment Types Tab */}
        <TabsContent value="libraries" className="space-y-6">
          <div className="card">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-800">{t("library.equipmentTypes")}</h3>
                <p className="text-xs text-slate-500 mt-1">{equipmentTypes.length} {t("library.typesDefined")}</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Discipline Filter */}
                <Select value={typeFilterDiscipline} onValueChange={setTypeFilterDiscipline}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder="All Disciplines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Disciplines</SelectItem>
                    {DISCIPLINES.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => { setEditingType(null); resetTypeForm(); setIsTypeDialogOpen(true); }} data-testid="add-equipment-type-btn">
                  <Plus className="w-4 h-4 mr-1" /> {t("library.addEquipmentType")}
                </Button>
              </div>
            </div>
            <div className="p-4 max-h-[calc(100vh-320px)] overflow-y-auto">
              {/* Group equipment types by discipline */}
              {DISCIPLINES.filter(d => typeFilterDiscipline === "all" || d === typeFilterDiscipline).map(discipline => {
                const disciplineTypes = equipmentTypes.filter(t => t.discipline === discipline);
                if (disciplineTypes.length === 0) return null;
                const colors = DISCIPLINE_COLORS[discipline] || DISCIPLINE_COLORS["Mechanical"];
                
                return (
                  <div key={discipline} className="mb-6 last:mb-0">
                    <div className={`flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg ${colors.bg}`}>
                      <span className={`text-sm font-semibold ${colors.text}`}>{discipline}</span>
                      <span className="text-xs text-slate-400">({disciplineTypes.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {disciplineTypes.map(t => (
                        <EquipmentTypeItem 
                          key={t.id} 
                          item={t} 
                          onEdit={handleEditType} 
                          onDelete={(id) => deleteTypeMutation.mutate(id)} 
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
        
        {/* Maintenance Strategies Tab */}
        <TabsContent value="maintenance" className="h-[calc(100vh-200px)]">
          <div className="card h-full overflow-hidden">
            <MaintenanceStrategiesPanel />
          </div>
        </TabsContent>
      </Tabs>

      {/* Equipment Type Dialog */}
      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? t("library.editEquipmentType") : t("library.addEquipmentType")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editingType && (
              <div>
                <Label>{t("library.typeId")}</Label>
                <Input 
                  value={newType.id} 
                  onChange={e => setNewType({ ...newType, id: e.target.value.toLowerCase().replace(/\s+/g, '_') })} 
                  placeholder="pump_custom" 
                  data-testid="type-id-input" 
                />
              </div>
            )}
            <div>
              <Label>{t("common.name")}</Label>
              <Input 
                value={newType.name} 
                onChange={e => setNewType({ ...newType, name: e.target.value })} 
                placeholder="Custom Pump" 
                data-testid="type-name-input" 
              />
            </div>
            <div>
              <Label>{t("library.isoClass")}</Label>
              <Input 
                value={newType.iso_class} 
                onChange={e => setNewType({ ...newType, iso_class: e.target.value })} 
                placeholder="1.1.99" 
              />
            </div>
            <div>
              <Label>{t("library.discipline")}</Label>
              <Select value={newType.discipline} onValueChange={v => setNewType({ ...newType, discipline: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={newType.category} onValueChange={v => setNewType({ ...newType, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("library.icon")}</Label>
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
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={handleSaveType} 
              disabled={(!editingType && !newType.id.trim()) || !newType.name.trim()} 
              data-testid="save-type-btn"
            >
              {editingType ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Failure Mode Dialog */}
      <Dialog open={isFmDialogOpen} onOpenChange={setIsFmDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFm ? t("library.editFailureMode") : t("library.addFailureMode")}</DialogTitle>
            <DialogDescription>
              {editingFm ? t("library.updateFailureModeDesc") : t("library.addFailureModeDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Row 1: Category & Equipment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("library.category")} *</Label>
                <Select value={newFm.category} onValueChange={v => setNewFm({ ...newFm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("library.equipment")} *</Label>
                <Select 
                  value={newFm.equipment} 
                  onValueChange={v => handleEquipmentChange(v)}
                >
                  <SelectTrigger data-testid="fm-equipment-input">
                    <SelectValue placeholder={t("library.equipmentPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentTypes.map(et => (
                      <SelectItem key={et.id} value={et.name}>{et.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Failure Mode Type Selection */}
            <div>
              <Label className="flex items-center gap-2">
                Failure Mode Type *
                <span className="text-xs text-slate-400 font-normal">(Generic = industry standard, Customer = specific to your organization)</span>
              </Label>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setNewFm({ ...newFm, failure_mode_type: "generic" })}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all flex items-center gap-3 ${
                    newFm.failure_mode_type === "generic"
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  data-testid="fm-type-generic"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    newFm.failure_mode_type === "generic" ? "bg-blue-100" : "bg-slate-100"
                  }`}>
                    <Globe className={`w-5 h-5 ${newFm.failure_mode_type === "generic" ? "text-blue-600" : "text-slate-400"}`} />
                  </div>
                  <div className="text-left">
                    <p className={`font-medium ${newFm.failure_mode_type === "generic" ? "text-blue-700" : "text-slate-700"}`}>
                      Generic
                    </p>
                    <p className="text-xs text-slate-500">Industry standard failure modes</p>
                  </div>
                  {newFm.failure_mode_type === "generic" && (
                    <CheckCircle className="w-5 h-5 text-blue-600 ml-auto" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setNewFm({ ...newFm, failure_mode_type: "customer_specific" })}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all flex items-center gap-3 ${
                    newFm.failure_mode_type === "customer_specific"
                      ? "border-purple-500 bg-purple-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  data-testid="fm-type-customer"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    newFm.failure_mode_type === "customer_specific" ? "bg-purple-100" : "bg-slate-100"
                  }`}>
                    <Building className={`w-5 h-5 ${newFm.failure_mode_type === "customer_specific" ? "text-purple-600" : "text-slate-400"}`} />
                  </div>
                  <div className="text-left">
                    <p className={`font-medium ${newFm.failure_mode_type === "customer_specific" ? "text-purple-700" : "text-slate-700"}`}>
                      Customer Specific
                    </p>
                    <p className="text-xs text-slate-500">Unique to your organization</p>
                  </div>
                  {newFm.failure_mode_type === "customer_specific" && (
                    <CheckCircle className="w-5 h-5 text-purple-600 ml-auto" />
                  )}
                </button>
              </div>
            </div>

            {/* Failure Mode Name */}
            <div>
              <Label>{t("library.failureModeName")} *</Label>
              <Input 
                value={newFm.failure_mode} 
                onChange={e => setNewFm({ ...newFm, failure_mode: e.target.value })} 
                placeholder="e.g., Seal Failure, Bearing Damage" 
                data-testid="fm-name-input"
              />
            </div>

            {/* Process Field */}
            <div>
              <Label>{t("library.process")}</Label>
              <Input 
                value={newFm.process || ""} 
                onChange={e => setNewFm({ ...newFm, process: e.target.value })} 
                placeholder={t("library.processPlaceholder")}
              />
            </div>

            {/* Potential Effects */}
            <div>
              <Label>{t("library.potentialEffects")}</Label>
              <Input 
                value={newFm.potential_effects || ""} 
                onChange={e => setNewFm({ ...newFm, potential_effects: e.target.value })} 
                placeholder={t("library.potentialEffectsPlaceholder")}
              />
            </div>

            {/* Potential Causes */}
            <div>
              <Label>{t("library.potentialCauses")}</Label>
              <Input 
                value={newFm.potential_causes || ""} 
                onChange={e => setNewFm({ ...newFm, potential_causes: e.target.value })} 
                placeholder={t("library.potentialCausesPlaceholder")}
              />
            </div>

            {/* Linked Equipment Types - Multi-select */}
            <div>
              <Label className="flex items-center gap-2">
                <Link className="w-4 h-4 text-blue-500" />
                {t("library.linkedEquipmentTypes")}
              </Label>
              <p className="text-xs text-slate-500 mb-2">{t("library.clickToSelect")}</p>
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg max-h-40 overflow-y-auto">
                {equipmentTypes.map(eqt => (
                  <button
                    key={eqt.id}
                    type="button"
                    onClick={() => toggleEquipmentType(eqt.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      (newFm.equipment_type_ids || []).includes(eqt.id)
                        ? "bg-blue-500 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:border-blue-300"
                    }`}
                  >
                    {eqt.name}
                  </button>
                ))}
              </div>
              {(newFm.equipment_type_ids || []).length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  {t("library.selected")}: {(newFm.equipment_type_ids || []).length} {t("library.types")}
                </p>
              )}
            </div>

            {/* FMEA Scores Row */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{t("library.severity")} (1-10) *</Label>
                <Input 
                  type="number" 
                  min={1} max={10} 
                  value={newFm.severity} 
                  onChange={e => setNewFm({ ...newFm, severity: parseInt(e.target.value) || 5 })} 
                />
              </div>
              <div>
                <Label>{t("library.occurrence")} (1-10) *</Label>
                <Input 
                  type="number" 
                  min={1} max={10} 
                  value={newFm.occurrence} 
                  onChange={e => setNewFm({ ...newFm, occurrence: parseInt(e.target.value) || 5 })} 
                />
              </div>
              <div>
                <Label>{t("library.detectability")} (1-10) *</Label>
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
              <Label>{t("library.keywords")}</Label>
              <div className="flex gap-2">
                <Input 
                  value={keywordInput} 
                  onChange={e => setKeywordInput(e.target.value)} 
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                  placeholder={t("library.addKeyword")} 
                />
                <Button type="button" variant="outline" onClick={addKeyword}>{t("common.add")}</Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {newFm.keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="flex items-center gap-1">
                    {kw}
                    <button onClick={() => removeKeyword(kw)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Recommended Actions */}
            <div>
              <Label>{t("library.recommendedActions")}</Label>
              <div className="flex gap-2">
                <Input 
                  value={actionInput} 
                  onChange={e => setActionInput(e.target.value)} 
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addAction())}
                  placeholder={t("library.addAction")} 
                />
                <Button type="button" variant="outline" onClick={addAction}>{t("common.add")}</Button>
              </div>
              <div className="flex gap-2 mt-2">
                <Select value={actionDiscipline} onValueChange={setActionDiscipline}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Discipline" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCIPLINE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={actionType} onValueChange={setActionType}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ul className="space-y-2 mt-3">
                {newFm.recommended_actions.map((action, i) => {
                  // Handle both old string format and new object format
                  const isObject = typeof action === 'object';
                  const description = isObject ? (action.action || action.description) : action;
                  const discipline = isObject ? action.discipline : null;
                  const type = isObject ? action.action_type : null;
                  const typeConfig = ACTION_TYPE_OPTIONS.find(t => t.value === type);
                  const actionKey = `${description}-${discipline || 'none'}-${type || 'none'}-${i}`;
                  
                  return (
                    <li key={actionKey} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {type && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeConfig?.color || 'bg-slate-100 text-slate-600'}`}>
                              {type}
                            </span>
                          )}
                          {discipline && (
                            <span className="text-xs text-slate-500 capitalize">{discipline}</span>
                          )}
                        </div>
                        <span className="text-sm">{i + 1}. {description}</span>
                      </div>
                      <button onClick={() => removeAction(i)} className="text-red-500 hover:text-red-700 ml-2"><X className="w-4 h-4" /></button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsFmDialogOpen(false); setEditingFm(null); resetFmForm(); }}>
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={handleSaveFm} 
              disabled={!newFm.failure_mode.trim() || !newFm.equipment.trim()} 
              data-testid="save-fm-btn"
            >
              {editingFm ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              Version History
            </DialogTitle>
            <DialogDescription>
              View previous versions and rollback if needed. Each edit creates a new version.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            {versionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No version history available</p>
                <p className="text-sm text-slate-400 mt-1">History will appear after the first edit</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* First show comparison with current state */}
                {selectedFm && versions.length > 0 && (
                  <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-green-600 text-white">Current v{selectedFm.version}</Badge>
                      <span className="text-xs text-green-700">Live version</span>
                    </div>
                    {(() => {
                      const curr = selectedFm;
                      const prev = versions[0]?.snapshot || {};
                      const changes = [];
                      
                      if (curr.failure_mode !== prev.failure_mode) {
                        changes.push({ field: 'Name', from: prev.failure_mode, to: curr.failure_mode });
                      }
                      if (curr.category !== prev.category) {
                        changes.push({ field: 'Category', from: prev.category, to: curr.category });
                      }
                      if ((curr.failure_mode_type || 'generic') !== (prev.failure_mode_type || 'generic')) {
                        changes.push({ field: 'Type', from: prev.failure_mode_type || 'generic', to: curr.failure_mode_type || 'generic' });
                      }
                      if (curr.severity !== prev.severity) {
                        changes.push({ field: 'Severity', from: prev.severity, to: curr.severity });
                      }
                      if (curr.occurrence !== prev.occurrence) {
                        changes.push({ field: 'Occurrence', from: prev.occurrence, to: curr.occurrence });
                      }
                      if (curr.detectability !== prev.detectability) {
                        changes.push({ field: 'Detectability', from: prev.detectability, to: curr.detectability });
                      }
                      const currRPN = curr.severity * curr.occurrence * curr.detectability;
                      const prevRPN = (prev.severity || 0) * (prev.occurrence || 0) * (prev.detectability || 0);
                      if (currRPN !== prevRPN) {
                        changes.push({ field: 'RPN', from: prevRPN, to: currRPN, isRPN: true });
                      }
                      
                      // Check recommended actions
                      const currActions = curr.recommended_actions || [];
                      const prevActions = prev.recommended_actions || [];
                      if (currActions.length !== prevActions.length || JSON.stringify(currActions) !== JSON.stringify(prevActions)) {
                        const added = currActions.filter(a => !prevActions.includes(a)).length;
                        const removed = prevActions.filter(a => !currActions.includes(a)).length;
                        if (added > 0 || removed > 0) {
                          let actionChange = '';
                          if (added > 0 && removed > 0) actionChange = `+${added}/-${removed}`;
                          else if (added > 0) actionChange = `+${added} added`;
                          else if (removed > 0) actionChange = `-${removed} removed`;
                          changes.push({ field: 'Actions', from: `${prevActions.length}`, to: `${currActions.length} (${actionChange})`, isAction: true });
                        }
                      }
                      
                      // Check keywords
                      const currKeywords = curr.keywords || [];
                      const prevKeywords = prev.keywords || [];
                      if (currKeywords.length !== prevKeywords.length || JSON.stringify(currKeywords.sort()) !== JSON.stringify(prevKeywords.sort())) {
                        const added = currKeywords.filter(k => !prevKeywords.includes(k)).length;
                        const removed = prevKeywords.filter(k => !currKeywords.includes(k)).length;
                        if (added > 0 || removed > 0) {
                          let keywordChange = '';
                          if (added > 0 && removed > 0) keywordChange = `+${added}/-${removed}`;
                          else if (added > 0) keywordChange = `+${added} added`;
                          else if (removed > 0) keywordChange = `-${removed} removed`;
                          changes.push({ field: 'Keywords', from: `${prevKeywords.length}`, to: `${currKeywords.length} (${keywordChange})` });
                        }
                      }
                      
                      return changes.length > 0 ? (
                        <div className="p-2 bg-white/50 rounded border border-green-200">
                          <div className="text-xs font-medium text-green-800 mb-1">
                            Changes from v{versions[0]?.version}:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {changes.map((change) => (
                              <span key={`${change.field}-${change.from}-${change.to}`} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                                change.isRPN ? (change.to > change.from ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')
                                : change.isAction ? 'bg-purple-100 text-purple-700'
                                : 'bg-slate-100 text-slate-700'
                              }`}>
                                <span className="font-medium">{change.field}:</span>
                                <span className="opacity-60">{change.from}</span>
                                <span>→</span>
                                <span className="font-semibold">{change.to}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-green-700">No changes from previous version</div>
                      );
                    })()}
                    <div className="mt-2 flex items-center gap-4 text-sm">
                      <span className={`font-bold text-lg ${
                        selectedFm.severity * selectedFm.occurrence * selectedFm.detectability >= 200 ? 'text-red-600' : 'text-green-700'
                      }`}>
                        {selectedFm.severity * selectedFm.occurrence * selectedFm.detectability}
                      </span>
                      <span className="text-green-600">{selectedFm.failure_mode}</span>
                    </div>
                  </div>
                )}
                
                {/* Historical versions */}
                {versions.map((version, idx) => {
                  // Compare this version with the NEXT newer version (or current if idx=0)
                  const newerVersion = idx === 0 ? selectedFm : versions[idx - 1]?.snapshot;
                  const thisVersion = version.snapshot || {};
                  const changes = [];
                  
                  if (newerVersion && idx > 0) {
                    const newer = versions[idx - 1]?.snapshot || {};
                    
                    // Show what changed FROM this version TO the newer version
                    if (thisVersion.failure_mode !== newer.failure_mode) {
                      changes.push({ field: 'Name', from: thisVersion.failure_mode, to: newer.failure_mode });
                    }
                    if (thisVersion.category !== newer.category) {
                      changes.push({ field: 'Category', from: thisVersion.category, to: newer.category });
                    }
                    if ((thisVersion.failure_mode_type || 'generic') !== (newer.failure_mode_type || 'generic')) {
                      changes.push({ field: 'Type', from: thisVersion.failure_mode_type || 'generic', to: newer.failure_mode_type || 'generic' });
                    }
                    if (thisVersion.severity !== newer.severity) {
                      changes.push({ field: 'Severity', from: thisVersion.severity, to: newer.severity });
                    }
                    if (thisVersion.occurrence !== newer.occurrence) {
                      changes.push({ field: 'Occurrence', from: thisVersion.occurrence, to: newer.occurrence });
                    }
                    if (thisVersion.detectability !== newer.detectability) {
                      changes.push({ field: 'Detectability', from: thisVersion.detectability, to: newer.detectability });
                    }
                    
                    const thisRPN = (thisVersion.severity || 0) * (thisVersion.occurrence || 0) * (thisVersion.detectability || 0);
                    const newerRPN = (newer.severity || 0) * (newer.occurrence || 0) * (newer.detectability || 0);
                    if (thisRPN !== newerRPN) {
                      changes.push({ field: 'RPN', from: thisRPN, to: newerRPN, isRPN: true });
                    }
                    
                    // Check recommended actions
                    const thisActions = thisVersion.recommended_actions || [];
                    const newerActions = newer.recommended_actions || [];
                    if (thisActions.length !== newerActions.length || JSON.stringify(thisActions) !== JSON.stringify(newerActions)) {
                      const added = newerActions.filter(a => !thisActions.includes(a)).length;
                      const removed = thisActions.filter(a => !newerActions.includes(a)).length;
                      if (added > 0 || removed > 0) {
                        let actionChange = '';
                        if (added > 0 && removed > 0) actionChange = `+${added}/-${removed}`;
                        else if (added > 0) actionChange = `+${added} added`;
                        else if (removed > 0) actionChange = `-${removed} removed`;
                        changes.push({ field: 'Actions', from: `${thisActions.length}`, to: `${newerActions.length} (${actionChange})`, isAction: true });
                      }
                    }
                    
                    // Check keywords
                    const thisKeywords = thisVersion.keywords || [];
                    const newerKeywords = newer.keywords || [];
                    if (thisKeywords.length !== newerKeywords.length || JSON.stringify(thisKeywords.sort()) !== JSON.stringify(newerKeywords.sort())) {
                      const added = newerKeywords.filter(k => !thisKeywords.includes(k)).length;
                      const removed = thisKeywords.filter(k => !newerKeywords.includes(k)).length;
                      if (added > 0 || removed > 0) {
                        let keywordChange = '';
                        if (added > 0 && removed > 0) keywordChange = `+${added}/-${removed}`;
                        else if (added > 0) keywordChange = `+${added} added`;
                        else if (removed > 0) keywordChange = `-${removed} removed`;
                        changes.push({ field: 'Keywords', from: `${thisKeywords.length}`, to: `${newerKeywords.length} (${keywordChange})` });
                      }
                    }
                  }
                  
                  const rpn = (thisVersion.severity || 0) * (thisVersion.occurrence || 0) * (thisVersion.detectability || 0);
                  
                  return (
                  <div 
                    key={version.id}
                    className="p-4 rounded-lg border border-slate-200 bg-white"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">v{version.version}</Badge>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(version.created_at)}
                          </span>
                        </div>
                        
                        {/* Change Summary - what changed FROM this version TO the next */}
                        {changes.length > 0 && (
                          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <div className="text-xs font-medium text-amber-800 mb-1 flex items-center gap-1">
                              <ChevronRight className="w-3 h-3" />
                              Changed to v{versions[idx - 1]?.version}:
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {changes.map((change) => (
                                <span 
                                  key={`${change.field}-${change.from}-${change.to}`} 
                                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                                    change.isRPN 
                                      ? change.to > change.from 
                                        ? 'bg-red-100 text-red-700' 
                                        : 'bg-green-100 text-green-700'
                                      : change.isAction
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  <span className="font-medium">{change.field}:</span>
                                  <span className="opacity-60">{change.from}</span>
                                  <span>→</span>
                                  <span className="font-semibold">{change.to}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Version snapshot summary */}
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-lg ${
                              rpn >= 200 ? 'text-red-600' :
                              rpn >= 125 ? 'text-orange-600' :
                              'text-slate-700'
                            }`}>
                              {rpn}
                            </span>
                            <span className="text-slate-400 text-xs">
                              ({thisVersion.severity}×{thisVersion.occurrence}×{thisVersion.detectability})
                            </span>
                          </div>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-600">{thisVersion.failure_mode}</span>
                        </div>
                        
                        {version.updated_by && (
                          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Changed by: {version.updated_by}
                          </div>
                        )}
                        
                        {version.change_reason && (
                          <div className="mt-1 text-xs text-slate-500 italic">
                            {version.change_reason}
                          </div>
                        )}
                      </div>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRollback(version.id)}
                        disabled={rollbackMutation.isPending}
                        className="flex-shrink-0 gap-1"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Restore
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionHistory(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmFm} onOpenChange={() => setDeleteConfirmFm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Delete Failure Mode
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this failure mode? This action can be undone using the global undo button.
            </DialogDescription>
          </DialogHeader>
          
          {deleteConfirmFm && (
            <div className="py-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-3 mb-2">
                  <Badge className={categoryColors[deleteConfirmFm.category] || "bg-slate-100"}>
                    {deleteConfirmFm.category}
                  </Badge>
                  <span className={`font-bold ${
                    deleteConfirmFm.severity * deleteConfirmFm.occurrence * deleteConfirmFm.detectability >= 200 
                      ? 'text-red-600' : 'text-slate-700'
                  }`}>
                    RPN: {deleteConfirmFm.severity * deleteConfirmFm.occurrence * deleteConfirmFm.detectability}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900">{deleteConfirmFm.failure_mode}</h3>
                <p className="text-sm text-slate-500 mt-1">{deleteConfirmFm.equipment}</p>
                {deleteConfirmFm.is_builtin && (
                  <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    This is a built-in failure mode
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmFm(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (deleteConfirmFm) {
                  deleteFmMutation.mutate(deleteConfirmFm.id);
                  setSelectedFm(null);
                  setDeleteConfirmFm(null);
                }
              }}
              disabled={deleteFmMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteFmMutation.isPending ? "Deleting..." : "Delete Failure Mode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FailureModesPage;
