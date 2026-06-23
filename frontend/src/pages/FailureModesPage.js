import { useState, useEffect, useMemo, useCallback } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useBreadcrumbTab } from "../contexts/BreadcrumbContext";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { formatDateTime } from "../lib/dateUtils";
import { useTranslatedFailureModes, useTranslatedEquipmentTypes } from "../hooks/useTranslatedEntities";
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
  Building,
  Calendar,
  Languages,
  Upload,
  Sparkles,
  FileText,
  Eye,
  RefreshCw,
  MoreVertical,
  ChevronDown,
  Loader2,
  ClipboardList,
  Network,
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
import { ScrollArea } from "../components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { toast } from "sonner";
import api, { equipmentHierarchyAPI, failureModesAPI, getErrorMessage } from "../lib/api";
import MaintenanceStrategyTab from "../components/library/MaintenanceStrategyTab";
import BackButton from "../components/BackButton";

// Extracted components
import { EquipmentTypeItem, EquipmentTypeFailureModesPanel, EQUIPMENT_ICONS, ICON_OPTIONS, DISCIPLINES, EQUIPMENT_CATEGORIES, DISCIPLINE_COLORS, MaintenanceScheduleManager } from "../components/library";
import { FailureModeViewPanel } from "../components/library";
import PMImportWizard from "../components/library/PMImportWizard";
import IntelligenceMapTab from "../components/library/IntelligenceMapTab";
import { CustomPMImportTab } from "../components/failure-modes/PmImportTabComponents";
import { FailureModesListPanel } from "../components/failure-modes/FailureModesListPanel";
import { FailureModesDetailPanel } from "../components/failure-modes/FailureModesDetailPanel";
import { FailureModesAIPanel } from "../components/failure-modes/FailureModesAIPanel";
import { FailureModesEquipmentTypesTab } from "../components/failure-modes/FailureModesEquipmentTypesTab";
import {
  EquipmentTypeFormDialog,
  FailureModeFormDialog,
  FailureModeVersionHistoryDialog,
  FailureModeDeleteDialog,
} from "../components/failure-modes/FailureModesPageDialogs";


const FailureModesPage = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  // AI tools (Suggest, Bulk Improve, Review Disciplines, Find Similar, Suggest
  // New Types, and the Not-improved-yet filter) are gated by the
  // `library_ai_tools` permission so owners can hide them from junior roles.
  const canUseAITools = hasPermission("library_ai_tools", "read");
  const isOwner = user?.role === "owner";
  const [searchParams, setSearchParams] = useSearchParams();
  
  const isMobile = useIsMobile();
  
  // Initialize state from URL params (for FMEA linkage from Maintenance Strategies)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all"); // generic, customer_specific, all
  const [highSeverityOnly, setHighSeverityOnly] = useState(false); // filter to severity >= 8
  const [mainTab, setMainTab] = useState(() => searchParams.get("tab") || "failure-modes");
  const [libraryTab, setLibraryTab] = useState("equipment");
  const [strategyEquipmentTypeId, setStrategyEquipmentTypeId] = useState(
    () => searchParams.get("equipment_type_id") || null
  );
  const [strategyHighlight, setStrategyHighlight] = useState(() => {
    const failureModeId = searchParams.get("highlight_failure_mode_id");
    const taskName = searchParams.get("highlight_task_name");
    if (!failureModeId && !taskName) return null;
    return { failureModeId, taskName };
  });
  
  const FAILURE_MODE_TYPE_OPTIONS = useMemo(() => [
    { value: "all", label: t("library.fmTypeAll") },
    { value: "generic", label: t("library.fmTypeGeneric"), color: "bg-blue-100 text-blue-700", icon: "globe" },
    { value: "customer_specific", label: t("library.fmTypeCustomerSpecific"), color: "bg-purple-100 text-purple-700", icon: "building" },
    { value: "recently_added", label: t("library.fmTypeRecentlyAdded"), color: "bg-green-100 text-green-700", icon: "clock" },
  ], [t]);

  const DISCIPLINE_OPTIONS = useMemo(() => [
    { value: "mechanical", label: t("library.mechanical") },
    { value: "electrical", label: t("library.electrical") },
    { value: "instrumentation", label: t("library.instrumentation") },
    { value: "process", label: t("library.process") },
    { value: "civil", label: t("library.disciplineCivilStructural") },
    { value: "operations", label: t("disciplines.Operations") },
    { value: "laboratory", label: t("disciplines.Laboratory") },
  ], [t]);

  const ACTION_TYPE_OPTIONS = useMemo(() => [
    { value: "PM", label: t("library.actionPm"), color: "bg-blue-100 text-blue-700" },
    { value: "CM", label: t("library.actionCm"), color: "bg-amber-100 text-amber-700" },
    { value: "PDM", label: t("library.actionPdm"), color: "bg-purple-100 text-purple-700" },
  ], [t]);
  
  // Handle URL parameter changes (e.g., from Maintenance Strategy FMEA links, PM Import)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const searchParam = searchParams.get("search");
    const equipmentTypeIdParam = searchParams.get("equipment_type_id");
    const filterParam = searchParams.get("filter");
    
    if (tabParam) setMainTab(tabParam);
    if (searchParam) setSearchQuery(searchParam);
    if (equipmentTypeIdParam) {
      setStrategyEquipmentTypeId(equipmentTypeIdParam);
      setFilterLinkedToEquipment(false);
    }
    // Don't clear search params if filter is set (e.g., filter=with_strategy)
    if ((tabParam || searchParam || equipmentTypeIdParam) && !filterParam) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const libraryTabBreadcrumbLabel = useMemo(() => {
    switch (mainTab) {
      case "intelligence-map":
        return "Intelligence Map";
      case "failure-modes":
        return t("library.failureModes");
      case "libraries":
        return t("library.equipmentTypes");
      case "maintenance":
        return t("library.maintenance");
      case "schedule":
        return t("maintenance.maintenanceScheduleTitle");
      case "pm-import":
        return t("library.customPmImport") || "PM Import";
      default:
        return null;
    }
  }, [mainTab, t]);

  useBreadcrumbTab(libraryTabBreadcrumbLabel);

  const openEquipmentTypeStrategy = useCallback((equipmentTypeId) => {
    if (!equipmentTypeId) return;
    setFilterLinkedToEquipment(false);
    setStrategyEquipmentTypeId(String(equipmentTypeId));
    setMainTab("maintenance");
  }, []);
  
  // Equipment type dialog state
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [newType, setNewType] = useState({ id: "", name: "", discipline: "Rotating", icon: "cog" });
  const [typeFilterDiscipline, setTypeFilterDiscipline] = useState("all"); // Filter for Equipment Types tab
  const [typeFilterNoFailureModes, setTypeFilterNoFailureModes] = useState(false); // Filter to show only types without failure modes
  const [filterLinkedToEquipment, setFilterLinkedToEquipment] = useState(true);
  const [selectedEquipmentType, setSelectedEquipmentType] = useState(null); // For viewing connected failure modes
  const [isAISuggestionsOpen, setIsAISuggestionsOpen] = useState(false); // AI suggestions dialog
  const [isAINewTypesOpen, setIsAINewTypesOpen] = useState(false); // AI suggest NEW equipment types
  const [isAINewFmOpen, setIsAINewFmOpen] = useState(false); // AI suggest NEW failure modes
  const [isAIImproveOpen, setIsAIImproveOpen] = useState(false); // AI improve a single failure mode
  const [isBulkImproveOpen, setIsBulkImproveOpen] = useState(false); // Bulk improve all visible
  const [isReviewDisciplinesOpen, setIsReviewDisciplinesOpen] = useState(false); // AI review action disciplines
  const [isReviewActionDowntimeOpen, setIsReviewActionDowntimeOpen] = useState(false);
  const [isFindSimilarOpen, setIsFindSimilarOpen] = useState(false); // AI find similar failure modes
  const [isFindDuplicateActionsOpen, setIsFindDuplicateActionsOpen] = useState(false);
  const [isConsolidateActionsOpen, setIsConsolidateActionsOpen] = useState(false);
  const [isMapActionDisciplinesOpen, setIsMapActionDisciplinesOpen] = useState(false);
  const [isCheckActionDowntimeOpen, setIsCheckActionDowntimeOpen] = useState(false);
  
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
  
  // PM Import Wizard state
  const [isPMImportOpen, setIsPMImportOpen] = useState(false);
  
  // Translation Generator state
  const [isTranslationOpen, setIsTranslationOpen] = useState(false);
  
  const [newFm, setNewFm] = useState({
    discipline: "Rotating",
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
  const [equipmentTypeSearch, setEquipmentTypeSearch] = useState(""); // For filtering equipment types
  const [keywordInput, setKeywordInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [actionMinutes, setActionMinutes] = useState("");
  const [actionDiscipline, setActionDiscipline] = useState("mechanical");
  const [actionType, setActionType] = useState("PM");
  
  const resetTypeForm = () => setNewType({ id: "", name: "", discipline: "Rotating", icon: "cog" });
  const resetFmForm = () => {
    setNewFm({
      discipline: "Rotating",
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
    setActionMinutes("");
    setEquipmentTypeSearch("");
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
    queryKey: ["failureModes", disciplineFilter, searchQuery, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (disciplineFilter && disciplineFilter !== "all") {
        params.append("category", disciplineFilter);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      if (typeFilter && typeFilter !== "all") {
        params.append("failure_mode_type", typeFilter);
      }
      // Load the full library so the counter and lists reflect ALL failure modes,
      // not just the first 500. Backend cache only kicks in at exactly limit=500.
      params.append("limit", "10000");
      const response = await api.get(`/failure-modes?${params.toString()}`);
      return response.data;
    },
  });

  // Fetch equipment types
  const { data: typesData } = useQuery({ 
    queryKey: ["equipment-types"], 
    queryFn: equipmentHierarchyAPI.getEquipmentTypes 
  });

  // Fetch equipment hierarchy nodes (for AI "Suggest New Types" feature)
  const { data: nodesData } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: equipmentHierarchyAPI.getNodes,
  });

  const categories = categoriesData?.categories || [];
  const rawFailureModes = modesData?.failure_modes || [];
  const rawEquipmentTypes = typesData?.equipment_types || [];
  const hierarchyNodes = nodesData?.nodes || [];

  const inUseEquipmentTypeIds = useMemo(() => {
    const ids = new Set();
    hierarchyNodes.forEach((node) => {
      if (node?.equipment_type_id) ids.add(node.equipment_type_id);
    });
    return ids;
  }, [hierarchyNodes]);

  const isFailureModeLinkedToEquipment = useCallback(
    (fm) => (fm?.equipment_type_ids || []).some((id) => inUseEquipmentTypeIds.has(id)),
    [inUseEquipmentTypeIds],
  );
  
  // Apply translations based on current language
  const { failureModes: translatedFailureModes } = useTranslatedFailureModes(rawFailureModes);
  const { equipmentTypes: translatedEquipmentTypes } = useTranslatedEquipmentTypes(rawEquipmentTypes);
  
  // Use translated versions
  const failureModes = translatedFailureModes;
  const equipmentTypes = translatedEquipmentTypes;
  
  // Calculate dynamic stats
  // Prefer the server's total (real Mongo count) over the page length so the
  // counter is always accurate even if the page was capped.
  const totalModes = modesData?.total ?? failureModes.length;
  const totalCategories = DISCIPLINES.length;

  // Client-side "High severity only" filter (severity >= 8 on SAE J1739 scale).
  // Sort by severity desc, then RPN desc, so the most critical FMs surface first.
  const displayedFailureModes = useMemo(() => {
    let list = failureModes;
    if (filterLinkedToEquipment) {
      list = list.filter(isFailureModeLinkedToEquipment);
    }
    if (highSeverityOnly) {
      list = list.filter((fm) => (fm.severity ?? 0) >= 8);
      list = [...list].sort((a, b) => {
        if ((b.severity ?? 0) !== (a.severity ?? 0)) return (b.severity ?? 0) - (a.severity ?? 0);
        const aRpn = (a.severity ?? 0) * (a.occurrence ?? 0) * (a.detectability ?? 0);
        const bRpn = (b.severity ?? 0) * (b.occurrence ?? 0) * (b.detectability ?? 0);
        return bRpn - aRpn;
      });
    }
    return list;
  }, [failureModes, highSeverityOnly, filterLinkedToEquipment, isFailureModeLinkedToEquipment]);
  const displayedTotal = highSeverityOnly || filterLinkedToEquipment ? displayedFailureModes.length : totalModes;
  const linkedFailureModeCount = useMemo(
    () => failureModes.filter(isFailureModeLinkedToEquipment).length,
    [failureModes, isFailureModeLinkedToEquipment],
  );
  
  // Calculate connected failure modes count for each equipment type
  const getConnectedFmCount = useCallback(
    (equipmentTypeId) =>
      failureModes.filter((fm) => fm.equipment_type_ids?.includes(equipmentTypeId)).length,
    [failureModes],
  );

  const matchesEquipmentTypeTabFilters = useCallback(
    (t, { requireLinked = false, requireNoFailureModes = false } = {}) => {
      if (typeFilterDiscipline !== "all" && t.discipline !== typeFilterDiscipline) return false;
      if (equipmentTypeSearch) {
        const search = equipmentTypeSearch.toLowerCase();
        if (
          !t.name.toLowerCase().includes(search) &&
          !(t.description && t.description.toLowerCase().includes(search))
        ) {
          return false;
        }
      }
      if (requireNoFailureModes && getConnectedFmCount(t.id) !== 0) return false;
      if (requireLinked && !inUseEquipmentTypeIds.has(t.id)) return false;
      return true;
    },
    [
      typeFilterDiscipline,
      equipmentTypeSearch,
      inUseEquipmentTypeIds,
      getConnectedFmCount,
    ],
  );

  const matchesActiveEquipmentTypeFilters = useCallback(
    (t) =>
      matchesEquipmentTypeTabFilters(t, {
        requireLinked: filterLinkedToEquipment,
        requireNoFailureModes: typeFilterNoFailureModes,
      }),
    [matchesEquipmentTypeTabFilters, filterLinkedToEquipment, typeFilterNoFailureModes],
  );

  // Filter equipment types based on active tab filters
  const filteredEquipmentTypes = equipmentTypes.filter(matchesActiveEquipmentTypeFilters);

  const linkedEquipmentTypeCount = useMemo(
    () =>
      equipmentTypes.filter((t) =>
        matchesEquipmentTypeTabFilters(t, { requireLinked: true, requireNoFailureModes: false }),
      ).length,
    [equipmentTypes, matchesEquipmentTypeTabFilters],
  );

  const noFailureModesTypeCount = useMemo(
    () =>
      equipmentTypes.filter((t) =>
        matchesEquipmentTypeTabFilters(t, { requireLinked: false, requireNoFailureModes: true }),
      ).length,
    [equipmentTypes, matchesEquipmentTypeTabFilters],
  );
  const handleUpdateFailureModeConnection = async (fmId, updates) => {
    try {
      await failureModesAPI.update(fmId, updates);
      queryClient.invalidateQueries({ queryKey: ["failureModes"] });
    } catch (error) {
      toast.error("Failed to update failure mode connection");
    }
  };
  
  // Handle ?fm_id=... param — open the failure mode in the view panel
  // Placed here so `failureModes` and the `setSelectedFm` setter are already declared.
  const pendingFmId = searchParams.get("fm_id");
  useEffect(() => {
    if (!pendingFmId) return;
    if (!failureModes || failureModes.length === 0) return;
    const match = failureModes.find(
      (fm) => fm.id === pendingFmId || String(fm.legacy_id) === pendingFmId
    );
    if (match) {
      setSelectedFm(match);
      setIsViewPanelEditing(false);
      setViewPanelForm(null);
      const next = new URLSearchParams(searchParams);
      next.delete("fm_id");
      setSearchParams(next, { replace: true });
    }
  }, [pendingFmId, failureModes, searchParams, setSearchParams]);
  
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
              discipline: oldData.discipline,
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
              discipline: deletedFm.discipline,
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
    setNewType({ id: type.id, name: type.name, discipline: type.discipline || "Rotating", icon: type.icon || "cog" }); 
    setIsTypeDialogOpen(true); 
  };
  
  const handleSaveType = () => { 
    // Check for duplicate name
    const nameExists = equipmentTypes.some(
      et => et.name.toLowerCase() === newType.name.trim().toLowerCase() && 
            (!editingType || et.id !== editingType.id)
    );
    
    if (nameExists) {
      toast.error("An equipment type with this name already exists");
      return;
    }
    
    if (editingType) { 
      updateTypeMutation.mutate({ typeId: editingType.id, data: { name: newType.name, discipline: newType.discipline, icon: newType.icon } }); 
    } else { 
      // Auto-generate ID from name
      const generatedId = newType.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      createTypeMutation.mutate({ ...newType, id: generatedId }); 
    } 
  };

  const handleEditFm = (fm) => {
    setEditingFm(fm);
    setNewFm({
      discipline: fm.discipline,
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
    setEquipmentTypeSearch("");
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
        discipline: selectedFm.discipline,
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

  // Apply AI-improved fields directly to the selected failure mode
  const handleApplyAIImprovement = (patch) => {
    if (!selectedFm || !patch) return;
    // Merge patch onto the existing FM. Falls back to existing values for fields
    // the user didn't pick.
    const baseData = {
      discipline: selectedFm.discipline,
      failure_mode: selectedFm.failure_mode,
      keywords: selectedFm.keywords || [],
      severity: selectedFm.severity,
      occurrence: selectedFm.occurrence,
      detectability: selectedFm.detectability,
      recommended_actions: selectedFm.recommended_actions || [],
      equipment_type_ids: selectedFm.equipment_type_ids || [],
      process: selectedFm.process || "",
      potential_effects: selectedFm.potential_effects || [],
      potential_causes: selectedFm.potential_causes || [],
      iso14224_mechanism: selectedFm.iso14224_mechanism || "",
      category: selectedFm.category || "",
    };
    const merged = {
      ...baseData,
      ...patch,
      ai_improved_at: new Date().toISOString(),
      change_reason: "ai_reliability_engineer",
    };
    updateFmMutation.mutate({ id: selectedFm.id, data: merged, oldData: selectedFm });
  };

  const handleConsolidateActionsApplied = async () => {
    queryClient.invalidateQueries({ queryKey: ["failureModes"] });
    if (selectedFm?.id) {
      try {
        const updated = await failureModesAPI.getById(selectedFm.id);
        setSelectedFm(updated);
      } catch (_e) {
        // List refresh still runs via invalidateQueries
      }
    }
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
      const minutes = actionMinutes === "" ? null : parseInt(actionMinutes, 10);
      const newAction = {
        description: actionInput.trim(),
        discipline: actionDiscipline,
        action_type: actionType,
        estimated_minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : null,
      };
      setNewFm({ ...newFm, recommended_actions: [...newFm.recommended_actions, newAction] });
      setActionInput("");
      setActionMinutes("");
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
    <div className="app-page-content-band py-2 max-w-7xl mx-auto w-full" data-testid="failure-modes-page">
      {/* Back Button - shown when navigated from another page */}
      {location.state?.from && (
        <div className="mb-3 hidden sm:block">
          <BackButton />
        </div>
      )}
      
      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="inline-flex w-auto max-w-full overflow-x-auto">
          <TabsTrigger value="intelligence-map" data-testid="intelligence-map-tab" className="flex items-center gap-1.5 whitespace-nowrap">
            <Network className="w-3.5 h-3.5" />
            Intelligence Map
          </TabsTrigger>
          <TabsTrigger value="failure-modes">{t("library.failureModes")}</TabsTrigger>
          <TabsTrigger value="libraries">{t("library.equipmentTypes")}</TabsTrigger>
          <TabsTrigger value="maintenance" data-testid="maintenance-strategies-tab">{t("library.maintenance")}</TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="w-3.5 h-3.5" />
            {t("maintenance.maintenanceScheduleTitle")}
          </TabsTrigger>
          <TabsTrigger value="pm-import" data-testid="pm-import-tab" className="flex items-center gap-1.5 whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            {t("library.customPmImport") || "PM Import"}
          </TabsTrigger>
        </TabsList>

        {/* Failure Modes Tab */}
        <TabsContent value="failure-modes" className="h-[calc(100vh-200px)]">
          <div className="flex gap-4 h-full min-h-0">
            <FailureModesListPanel
              t={t}
              displayedTotal={displayedTotal}
              totalCategories={totalCategories}
              highSeverityOnly={highSeverityOnly}
              setHighSeverityOnly={setHighSeverityOnly}
              filterLinkedToEquipment={filterLinkedToEquipment}
              setFilterLinkedToEquipment={setFilterLinkedToEquipment}
              linkedFailureModeCount={linkedFailureModeCount}
              canUseAITools={canUseAITools}
              displayedFailureModes={displayedFailureModes}
              failureModes={failureModes}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              disciplineFilter={disciplineFilter}
              setDisciplineFilter={setDisciplineFilter}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              isExporting={isExporting}
              handleExportExcel={handleExportExcel}
              equipmentTypes={equipmentTypes}
              isOwner={isOwner}
              isLoading={isLoading}
              selectedFm={selectedFm}
              onSelectFm={handleSelectFm}
              onOpenNewFm={() => { setEditingFm(null); resetFmForm(); setIsFmDialogOpen(true); }}
              onOpenAINewFm={() => setIsAINewFmOpen(true)}
              onOpenBulkImprove={() => setIsBulkImproveOpen(true)}
              onOpenReviewDisciplines={() => setIsReviewDisciplinesOpen(true)}
              onOpenReviewActionDowntime={() => setIsReviewActionDowntimeOpen(true)}
              onOpenFindSimilar={() => setIsFindSimilarOpen(true)}
              onOpenFindDuplicateActions={() => setIsFindDuplicateActionsOpen(true)}
            />
            {selectedFm && !isViewPanelFullscreen && (
              <FailureModesDetailPanel
                selectedFm={selectedFm}
                isViewPanelFullscreen={false}
                isViewPanelEditing={isViewPanelEditing}
                viewPanelForm={viewPanelForm}
                setViewPanelForm={setViewPanelForm}
                onStartEdit={handleStartViewPanelEdit}
                onSave={handleSaveViewPanelEdit}
                onCancel={handleCancelViewPanelEdit}
                onClose={() => { setSelectedFm(null); setIsViewPanelEditing(false); setViewPanelForm(null); setIsViewPanelFullscreen(false); }}
                onDelete={(id) => { const fmToDelete = failureModes.find(fm => fm.id === id); setDeleteConfirmFm(fmToDelete); }}
                onValidate={handleValidateFm}
                onUnvalidate={handleUnvalidateFm}
                onShowVersionHistory={handleShowVersionHistory}
                onImproveWithAI={() => setIsAIImproveOpen(true)}
                onConsolidateActions={
                  canUseAITools ? () => setIsConsolidateActionsOpen(true) : undefined
                }
                onMapActionDisciplines={
                  canUseAITools ? () => setIsMapActionDisciplinesOpen(true) : undefined
                }
                onCheckActionDowntime={
                  canUseAITools ? () => setIsCheckActionDowntimeOpen(true) : undefined
                }
                equipmentTypes={equipmentTypes}
                categories={categories}
                currentUser={user}
                t={t}
                onToggleFullscreen={() => setIsViewPanelFullscreen(true)}
              />
            )}
          </div>
          {selectedFm && isViewPanelFullscreen && (
            <FailureModesDetailPanel
              selectedFm={selectedFm}
              isViewPanelFullscreen
              isViewPanelEditing={isViewPanelEditing}
              viewPanelForm={viewPanelForm}
              setViewPanelForm={setViewPanelForm}
              onStartEdit={handleStartViewPanelEdit}
              onSave={handleSaveViewPanelEdit}
              onCancel={handleCancelViewPanelEdit}
              onClose={() => { setSelectedFm(null); setIsViewPanelEditing(false); setViewPanelForm(null); setIsViewPanelFullscreen(false); }}
              onDelete={(id) => { const fmToDelete = failureModes.find(fm => fm.id === id); setDeleteConfirmFm(fmToDelete); }}
              onValidate={handleValidateFm}
              onUnvalidate={handleUnvalidateFm}
              onShowVersionHistory={handleShowVersionHistory}
              onImproveWithAI={() => setIsAIImproveOpen(true)}
              onConsolidateActions={
                canUseAITools ? () => setIsConsolidateActionsOpen(true) : undefined
              }
              onMapActionDisciplines={
                canUseAITools ? () => setIsMapActionDisciplinesOpen(true) : undefined
              }
              onCheckActionDowntime={
                canUseAITools ? () => setIsCheckActionDowntimeOpen(true) : undefined
              }
              equipmentTypes={equipmentTypes}
              categories={categories}
              currentUser={user}
              t={t}
              onToggleFullscreen={() => setIsViewPanelFullscreen(false)}
            />
          )}
        </TabsContent>

        <FailureModesEquipmentTypesTab
          t={t}
          equipmentTypes={equipmentTypes}
          selectedEquipmentType={selectedEquipmentType}
          setSelectedEquipmentType={setSelectedEquipmentType}
          equipmentTypeSearch={equipmentTypeSearch}
          setEquipmentTypeSearch={setEquipmentTypeSearch}
          typeFilterNoFailureModes={typeFilterNoFailureModes}
          setTypeFilterNoFailureModes={setTypeFilterNoFailureModes}
          noFailureModesTypeCount={noFailureModesTypeCount}
          filterLinkedToEquipment={filterLinkedToEquipment}
          setFilterLinkedToEquipment={setFilterLinkedToEquipment}
          linkedEquipmentTypeCount={linkedEquipmentTypeCount}
          typeFilterDiscipline={typeFilterDiscipline}
          setTypeFilterDiscipline={setTypeFilterDiscipline}
          canUseAITools={canUseAITools}
          hierarchyNodes={hierarchyNodes}
          matchesActiveEquipmentTypeFilters={matchesActiveEquipmentTypeFilters}
          handleEditType={handleEditType}
          deleteTypeMutation={deleteTypeMutation}
          getConnectedFmCount={getConnectedFmCount}
          failureModes={failureModes}
          handleUpdateFailureModeConnection={handleUpdateFailureModeConnection}
          setIsAISuggestionsOpen={setIsAISuggestionsOpen}
          setIsAINewTypesOpen={setIsAINewTypesOpen}
          setEditingType={setEditingType}
          resetTypeForm={resetTypeForm}
          setIsTypeDialogOpen={setIsTypeDialogOpen}
        />
        
        {/* Maintenance Strategies Tab */}
        <TabsContent value="maintenance" className="h-[calc(100vh-200px)]">
          <div className="card h-full overflow-hidden">
            <MaintenanceStrategyTab
              filterLinkedToEquipment={filterLinkedToEquipment}
              onFilterLinkedToEquipmentChange={setFilterLinkedToEquipment}
              inUseEquipmentTypeIds={inUseEquipmentTypeIds}
              initialEquipmentTypeId={strategyEquipmentTypeId}
              onInitialEquipmentTypeConsumed={() => setStrategyEquipmentTypeId(null)}
              strategyHighlight={strategyHighlight}
              onStrategyHighlightConsumed={() => setStrategyHighlight(null)}
            />
          </div>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="h-[calc(100vh-200px)]">
          <div className="card h-full overflow-auto p-4">
            <MaintenanceScheduleManager equipmentType={null} />
          </div>
        </TabsContent>
        
        {/* Custom PM Import Tab */}
        <TabsContent value="pm-import" className="h-[calc(100vh-200px)] min-h-0 mt-0">
          <div className="h-full overflow-y-auto mobile-scroll-pane min-h-0 pb-4">
            <CustomPMImportTab
              onOpenImportWizard={() => setIsPMImportOpen(true)}
              onOpenEquipmentTypeStrategy={openEquipmentTypeStrategy}
            />
          </div>
        </TabsContent>

        {/* Intelligence Map Tab */}
        <TabsContent value="intelligence-map" className="h-[calc(100vh-200px)] min-h-0 mt-0">
          <div className="h-full overflow-y-auto mobile-scroll-pane min-h-0 pb-4">
            <IntelligenceMapTab />
          </div>
        </TabsContent>
      </Tabs>


      <EquipmentTypeFormDialog
        t={t}
        isTypeDialogOpen={isTypeDialogOpen}
        setIsTypeDialogOpen={setIsTypeDialogOpen}
        editingType={editingType}
        setEditingType={setEditingType}
        newType={newType}
        setNewType={setNewType}
        equipmentTypes={equipmentTypes}
        handleSaveType={handleSaveType}
        resetTypeForm={resetTypeForm}
      />
      <FailureModeFormDialog
        t={t}
        isFmDialogOpen={isFmDialogOpen}
        setIsFmDialogOpen={setIsFmDialogOpen}
        editingFm={editingFm}
        newFm={newFm}
        setNewFm={setNewFm}
        keywordInput={keywordInput}
        setKeywordInput={setKeywordInput}
        actionInput={actionInput}
        setActionInput={setActionInput}
        actionDiscipline={actionDiscipline}
        setActionDiscipline={setActionDiscipline}
        actionType={actionType}
        setActionType={setActionType}
        actionMinutes={actionMinutes}
        setActionMinutes={setActionMinutes}
        equipmentTypes={equipmentTypes}
        categories={categories}
        FAILURE_MODE_TYPE_OPTIONS={FAILURE_MODE_TYPE_OPTIONS}
        ACTION_TYPE_OPTIONS={ACTION_TYPE_OPTIONS}
        handleSaveFm={handleSaveFm}
        addKeyword={addKeyword}
        removeKeyword={removeKeyword}
        addAction={addAction}
        removeAction={removeAction}
        toggleEquipmentType={toggleEquipmentType}
        resetFmForm={resetFmForm}
        setEditingFm={setEditingFm}
      />
      <FailureModeVersionHistoryDialog
        showVersionHistory={showVersionHistory}
        setShowVersionHistory={setShowVersionHistory}
        versionsLoading={versionsLoading}
        versions={versions}
        selectedFm={selectedFm}
        handleRollback={handleRollback}
        rollbackMutation={rollbackMutation}
      />
      <FailureModeDeleteDialog
        deleteConfirmFm={deleteConfirmFm}
        setDeleteConfirmFm={setDeleteConfirmFm}
        deleteFmMutation={deleteFmMutation}
        setSelectedFm={setSelectedFm}
      />

      {/* PM Import Wizard */}
      <PMImportWizard
        isOpen={isPMImportOpen}
        onClose={() => setIsPMImportOpen(false)}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["failureModes"] });
          // Don't close immediately - let user see summary, they will click Done
        }}
      />

      <FailureModesAIPanel
        t={t}
        isOwner={isOwner}
        isAISuggestionsOpen={isAISuggestionsOpen}
        setIsAISuggestionsOpen={setIsAISuggestionsOpen}
        isAINewTypesOpen={isAINewTypesOpen}
        setIsAINewTypesOpen={setIsAINewTypesOpen}
        isAINewFmOpen={isAINewFmOpen}
        setIsAINewFmOpen={setIsAINewFmOpen}
        isAIImproveOpen={isAIImproveOpen}
        setIsAIImproveOpen={setIsAIImproveOpen}
        isBulkImproveOpen={isBulkImproveOpen}
        setIsBulkImproveOpen={setIsBulkImproveOpen}
        isReviewDisciplinesOpen={isReviewDisciplinesOpen}
        setIsReviewDisciplinesOpen={setIsReviewDisciplinesOpen}
        isReviewActionDowntimeOpen={isReviewActionDowntimeOpen}
        setIsReviewActionDowntimeOpen={setIsReviewActionDowntimeOpen}
        isFindSimilarOpen={isFindSimilarOpen}
        setIsFindSimilarOpen={setIsFindSimilarOpen}
        isFindDuplicateActionsOpen={isFindDuplicateActionsOpen}
        setIsFindDuplicateActionsOpen={setIsFindDuplicateActionsOpen}
        isConsolidateActionsOpen={isConsolidateActionsOpen}
        setIsConsolidateActionsOpen={setIsConsolidateActionsOpen}
        isMapActionDisciplinesOpen={isMapActionDisciplinesOpen}
        setIsMapActionDisciplinesOpen={setIsMapActionDisciplinesOpen}
        isCheckActionDowntimeOpen={isCheckActionDowntimeOpen}
        setIsCheckActionDowntimeOpen={setIsCheckActionDowntimeOpen}
        equipmentTypes={equipmentTypes}
        failureModes={failureModes}
        displayedFailureModes={displayedFailureModes}
        hierarchyNodes={hierarchyNodes}
        selectedFm={selectedFm}
        onApplyAIImprovement={handleApplyAIImprovement}
        onInvalidateFailureModes={() => {
          queryClient.invalidateQueries({ queryKey: ["failureModes"] });
        }}
        onConsolidateActionsApplied={handleConsolidateActionsApplied}
        onInvalidateEquipmentTypes={() => {
          queryClient.invalidateQueries({ queryKey: ["equipment-types"] });
        }}
        onSelectFailureMode={(fmId) => {
          const fm = failureModes.find((f) => f.id === fmId);
          if (fm) setSelectedFm(fm);
        }}
      />
    </div>
  );
};

export default FailureModesPage;
