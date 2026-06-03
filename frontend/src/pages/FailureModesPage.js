import { useState, useEffect, useMemo, useCallback } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
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
import { pmImportAPI } from "../lib/apis/pmImport";
import MaintenanceStrategyTab from "../components/library/MaintenanceStrategyTab";
import BackButton from "../components/BackButton";

// Extracted components
import { EquipmentTypeItem, EquipmentTypeFailureModesPanel, EQUIPMENT_ICONS, ICON_OPTIONS, DISCIPLINES, EQUIPMENT_CATEGORIES, DISCIPLINE_COLORS, MaintenanceScheduleManager } from "../components/library";
import { FailureModeViewPanel } from "../components/library";
import PMImportWizard from "../components/library/PMImportWizard";
import AIFailureModeSuggestions from "../components/library/AIFailureModeSuggestions";
import AINewEquipmentTypeSuggestions from "../components/library/AINewEquipmentTypeSuggestions";
import AINewFailureModeSuggestions from "../components/library/AINewFailureModeSuggestions";
import AIImproveFailureMode from "../components/library/AIImproveFailureMode";
import BulkImproveFailureModes from "../components/library/BulkImproveFailureModes";
import AIReviewActionDisciplines from "../components/library/AIReviewActionDisciplines";
import AIFindSimilarFailureModes from "../components/library/AIFindSimilarFailureModes";

// Custom PM Import Tab Component
const CustomPMImportTab = ({ onOpenImportWizard }) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  
  // Fetch all PM import sessions
  const { data: sessionsData, isLoading, error, refetch } = useQuery({
    queryKey: ['pm-import-sessions'],
    queryFn: () => pmImportAPI.listSessions(100, 0),
  });
  
  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId) => pmImportAPI.deleteSession(sessionId),
    onSuccess: () => {
      toast.success('Import session deleted');
      queryClient.invalidateQueries(['pm-import-sessions']);
      setSelectedSession(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
  
  const sessions = sessionsData?.sessions || [];
  
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const getStatusBadge = (status) => {
    const statusConfig = {
      completed: { color: 'bg-green-100 text-green-700', label: 'Completed' },
      processing: { color: 'bg-blue-100 text-blue-700', label: 'Processing' },
      pending: { color: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
      failed: { color: 'bg-red-100 text-red-700', label: 'Failed' },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant="outline" className={`${config.color} text-xs`}>{config.label}</Badge>;
  };
  
  const toggleTaskExpand = (taskId) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };
  
  // Count stats
  const totalSessions = sessions.length;
  const totalTasks = sessions.reduce((sum, s) => sum + (s.extracted_tasks?.length || s.stats?.total_tasks || 0), 0);
  const acceptedTasks = sessions.reduce((sum, s) => sum + (s.stats?.accepted || 0), 0);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-purple-600" />
            {t("library.customPmImport") || "Custom PM Import"}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("library.customPmImportDesc") || "View and manage imported maintenance plans"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={onOpenImportWizard}>
            <Upload className="h-4 w-4 mr-2" />
            Import PM Plan
          </Button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900">{totalSessions}</div>
          <div className="text-sm text-gray-500">Import Sessions</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-purple-600">{totalTasks}</div>
          <div className="text-sm text-gray-500">Total Tasks Extracted</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-green-600">{acceptedTasks}</div>
          <div className="text-sm text-gray-500">Tasks Accepted</div>
        </div>
      </div>
      
      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="card p-12 text-center">
          <Upload className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No Imported Plans Yet</h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Import your existing maintenance plans, PM schedules, or OEM documentation to extract and manage maintenance tasks.
          </p>
          <Button className="mt-4" onClick={onOpenImportWizard}>
            <Upload className="h-4 w-4 mr-2" />
            Import Your First Plan
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sessions List */}
          <div className="card">
            <div className="p-4 border-b">
              <h3 className="font-medium">Import Sessions</h3>
            </div>
            <ScrollArea className="h-[500px]">
              <div className="p-2 space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.session_id}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedSession?.session_id === session.session_id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium truncate">{session.file_name || 'Unnamed Import'}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(session.created_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(session.status)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSession(session);
                            }}>
                              <Eye className="h-4 w-4 mr-2" /> View Tasks
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Delete this import session?')) {
                                  deleteSessionMutation.mutate(session.session_id);
                                }
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>{session.extracted_tasks?.length || session.stats?.total_tasks || 0} tasks</span>
                      {session.stats?.accepted > 0 && (
                        <span className="text-green-600">{session.stats.accepted} accepted</span>
                      )}
                      {session.stats?.rejected > 0 && (
                        <span className="text-red-600">{session.stats.rejected} rejected</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          
          {/* Selected Session Tasks */}
          <div className="card">
            <div className="p-4 border-b">
              <h3 className="font-medium">
                {selectedSession ? `Tasks from ${selectedSession.file_name || 'Import'}` : 'Select a Session'}
              </h3>
            </div>
            {selectedSession ? (
              <ScrollArea className="h-[500px]">
                <div className="p-2 space-y-2">
                  {(selectedSession.extracted_tasks || []).map((task) => (
                    <div key={task.id} className="border rounded-lg">
                      <div 
                        className="p-3 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleTaskExpand(task.id)}
                      >
                        <div className="flex items-start gap-2">
                          {expandedTasks.has(task.id) ? (
                            <ChevronDown className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{task.task_name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {task.review_status && (
                                <Badge variant="outline" className={`text-xs ${
                                  task.review_status === 'accepted' ? 'bg-green-100 text-green-700' :
                                  task.review_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {task.review_status}
                                </Badge>
                              )}
                              {task.frequency && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                                  {task.frequency}
                                </Badge>
                              )}
                              {task.task_type && (
                                <Badge variant="outline" className="text-xs">
                                  {task.task_type}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {expandedTasks.has(task.id) && (
                        <div className="px-9 pb-3 border-t bg-gray-50">
                          <div className="pt-3 space-y-2 text-sm">
                            {task.description && (
                              <div>
                                <span className="font-medium text-gray-500">Description:</span>
                                <p className="text-gray-700 mt-0.5">{task.description}</p>
                              </div>
                            )}
                            {task.matched_failure_mode_name && (
                              <div>
                                <span className="font-medium text-gray-500">Matched Failure Mode:</span>
                                <p className="text-gray-700 mt-0.5">{task.matched_failure_mode_name}</p>
                              </div>
                            )}
                            {task.estimated_duration && (
                              <div>
                                <span className="font-medium text-gray-500">Duration:</span>
                                <span className="text-gray-700 ml-2">{task.estimated_duration} hours</span>
                              </div>
                            )}
                            {task.confidence && (
                              <div>
                                <span className="font-medium text-gray-500">AI Confidence:</span>
                                <span className="text-gray-700 ml-2">{Math.round(task.confidence * 100)}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {(!selectedSession.extracted_tasks || selectedSession.extracted_tasks.length === 0) && (
                    <div className="text-center text-gray-500 py-8">
                      No tasks in this session
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center h-[500px] text-gray-500">
                <div className="text-center">
                  <Eye className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p>Select a session to view its tasks</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const disciplineIcons = {
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

const disciplineColors = {
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
  const { hasPermission } = usePermissions();
  // AI tools (Suggest, Bulk Improve, Review Disciplines, Find Similar, Suggest
  // New Types, and the Not-improved-yet filter) are gated by the
  // `library_ai_tools` permission so owners can hide them from junior roles.
  const canUseAITools = hasPermission("library_ai_tools", "read");
  const [searchParams, setSearchParams] = useSearchParams();
  
  const isMobile = useIsMobile();
  
  // Initialize state from URL params (for FMEA linkage from Maintenance Strategies)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all"); // generic, customer_specific, all
  const [highSeverityOnly, setHighSeverityOnly] = useState(false); // filter to severity >= 8
  const [hideAIImproved, setHideAIImproved] = useState(false); // filter out FMs already improved by AI
  const [mainTab, setMainTab] = useState(() => searchParams.get("tab") || "failure-modes");
  const [libraryTab, setLibraryTab] = useState("equipment");
  
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
  const [isFindSimilarOpen, setIsFindSimilarOpen] = useState(false); // AI find similar failure modes
  
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
    if (hideAIImproved) {
      list = list.filter((fm) => !fm.ai_improved_at);
    }
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
  }, [failureModes, highSeverityOnly, hideAIImproved, filterLinkedToEquipment, isFailureModeLinkedToEquipment]);
  const displayedTotal = highSeverityOnly || hideAIImproved || filterLinkedToEquipment ? displayedFailureModes.length : totalModes;
  const aiImprovedCount = useMemo(
    () => failureModes.filter((fm) => fm.ai_improved_at).length,
    [failureModes],
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
    <div className="container mx-auto px-4 py-4 max-w-7xl" data-testid="failure-modes-page">
      {/* Back Button - shown when navigated from another page */}
      {location.state?.from && (
        <div className="mb-3">
          <BackButton />
        </div>
      )}
      
      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="failure-modes">{t("library.failureModes")}</TabsTrigger>
          <TabsTrigger value="libraries">{t("library.equipmentTypes")}</TabsTrigger>
          <TabsTrigger value="maintenance" data-testid="maintenance-strategies-tab">{t("library.maintenance")}</TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {t("maintenance.maintenanceScheduleTitle")}
          </TabsTrigger>
          <TabsTrigger value="pm-import" className="flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            {t("library.customPmImport") || "PM Import"}
          </TabsTrigger>
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
                <span className="text-lg font-bold text-slate-900">{displayedTotal}</span>
                <span className="text-xs text-slate-500 ml-1">
                  {highSeverityOnly ? "High Severity FMs" : t("library.failureModes")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-blue-50">
                <Filter className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-blue-600">{totalCategories}</span>
                <span className="text-xs text-slate-500 ml-1">Disciplines</span>
              </div>
            </div>
          </div>

          {/* Toolbar - stacked into two rows:
                Row 1: Search + filters (always visible on screen)
                Row 2: AI / Action buttons (Export, Import, Suggest, Bulk Improve, Add) */}
          <div className="mb-6 space-y-3" data-testid="filters">
            {/* Row 1: Search + Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px] sm:min-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder={t("library.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11 w-full"
                  data-testid="search-input"
                />
              </div>
              <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                <SelectTrigger className="w-44 h-11" data-testid="category-filter">
                  <Filter className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue placeholder={t("disciplines.allDisciplines")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("disciplines.allDisciplines")}</SelectItem>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d} value={d}>{(t(`disciplines.${d}`) !== `disciplines.${d}` ? t(`disciplines.${d}`) : d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44 h-11" data-testid="type-filter">
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
                type="button"
                onClick={() => setHighSeverityOnly((v) => !v)}
                variant="outline"
                className={`h-11 ${
                  highSeverityOnly
                    ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
                data-testid="high-severity-toggle"
                title="Show only failure modes with severity ≥ 8 (high), sorted by severity then RPN"
                aria-pressed={highSeverityOnly}
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                High Severity
                {highSeverityOnly && (
                  <span className="ml-1 text-xs font-semibold bg-red-100 text-red-700 px-1.5 rounded">
                    {displayedFailureModes.length}
                  </span>
                )}
              </Button>
              <Button
                type="button"
                onClick={() => setHideAIImproved((v) => !v)}
                variant="outline"
                className={`h-11 ${
                  hideAIImproved
                    ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                } ${canUseAITools ? "" : "hidden"}`}
                data-testid="hide-ai-improved-toggle"
                title={`Hide failure modes already improved by AI (${aiImprovedCount} marked)`}
                aria-pressed={hideAIImproved}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Not improved yet
                {aiImprovedCount > 0 && (
                  <span
                    className={`ml-1 text-xs font-semibold px-1.5 rounded ${
                      hideAIImproved
                        ? "bg-purple-100 text-purple-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {aiImprovedCount} done
                  </span>
                )}
              </Button>
              <Button
                type="button"
                onClick={() => setFilterLinkedToEquipment((v) => !v)}
                variant="outline"
                className={`h-11 ${
                  filterLinkedToEquipment
                    ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
                data-testid="linked-to-equipment-toggle-fm"
                title={t("library.filterLinkedToEquipmentHint")}
                aria-pressed={filterLinkedToEquipment}
              >
                <Cog className="w-4 h-4 mr-1" />
                {t("library.filterLinkedToEquipment")}
                {filterLinkedToEquipment && (
                  <span className="ml-1 text-xs font-semibold bg-blue-100 text-blue-700 px-1.5 rounded">
                    {displayedFailureModes.length}
                  </span>
                )}
              </Button>
            </div>
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid="action-bar"
            >
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
              <Button
                onClick={() => setIsAINewFmOpen(true)}
                variant="outline"
                className={`h-11 border-purple-200 text-purple-700 hover:bg-purple-50 ${canUseAITools ? "" : "hidden"}`}
                data-testid="ai-suggest-new-failure-modes-btn"
                disabled={equipmentTypes.length === 0}
                title="Let AI act as a reliability engineer and suggest failure modes missing from your library"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Suggest Failure Modes
              </Button>
              <Button
                onClick={() => setIsBulkImproveOpen(true)}
                variant="outline"
                className={`h-11 border-purple-200 text-purple-700 hover:bg-purple-50 ${canUseAITools ? "" : "hidden"}`}
                data-testid="bulk-improve-fm-btn"
                disabled={displayedFailureModes.length === 0}
                title={`Run AI improvement and auto-apply changes for the ${displayedFailureModes.length} visible failure mode(s)`}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Bulk Improve ({displayedFailureModes.length})
              </Button>
              <Button
                onClick={() => setIsReviewDisciplinesOpen(true)}
                variant="outline"
                className={`h-11 border-purple-200 text-purple-700 hover:bg-purple-50 ${canUseAITools ? "" : "hidden"}`}
                data-testid="review-action-disciplines-btn"
                disabled={failureModes.length === 0}
                title="Have AI re-classify the maintenance discipline of every recommended action in the library"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Review Disciplines
              </Button>
              <Button
                onClick={() => setIsFindSimilarOpen(true)}
                variant="outline"
                className={`h-11 border-purple-200 text-purple-700 hover:bg-purple-50 ${canUseAITools ? "" : "hidden"}`}
                data-testid="find-similar-fm-btn"
                disabled={failureModes.length === 0}
                title="Find similar failure modes per equipment type and merge them"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Find Similar
              </Button>
              <Button
                onClick={() => { setEditingFm(null); resetFmForm(); setIsFmDialogOpen(true); }}
                className="h-11 bg-blue-600 hover:bg-blue-700 ml-auto"
                data-testid="add-failure-mode-btn"
              >
                <Plus className="w-4 h-4 mr-1" /> {t("library.addFailureMode")}
              </Button>
            </div>
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
              ) : displayedFailureModes.length === 0 ? (
                <div className="empty-state py-16">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Info className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">{t("library.noMatches")}</h3>
                  <p className="text-slate-500">
                    {hideAIImproved && failureModes.some((fm) => fm.ai_improved_at)
                      ? "All visible failure modes have already been improved by AI. Toggle off to see them again."
                      : highSeverityOnly
                      ? "No failure modes with severity ≥ 8. Toggle off to see all."
                      : t("library.tryAdjusting")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto h-full pr-2" data-testid="failure-modes-list">
                  {displayedFailureModes.map((fm, idx) => {
                    const Icon = disciplineIcons[fm.discipline] || AlertTriangle;
                    const colors = disciplineColors[fm.discipline] || "bg-slate-100 text-slate-700";
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
                            <Badge className={`${colors} text-xs px-1.5 py-0`}>{(t(`disciplines.${fm.discipline}`) !== `disciplines.${fm.discipline}` ? t(`disciplines.${fm.discipline}`) : fm.discipline)}</Badge>
                            {fm.failure_mode_type === "customer_specific" && (
                              <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0">
                                {(t("disciplines.Customer") !== "disciplines.Customer" ? t("disciplines.Customer") : "Customer")}
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
                  onImproveWithAI={() => setIsAIImproveOpen(true)}
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
                onImproveWithAI={() => setIsAIImproveOpen(true)}
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
          <div className="flex gap-4 h-[calc(100vh-180px)]">
            {/* Left Panel: Equipment Types List */}
            <div className={`${selectedEquipmentType ? 'w-1/2 lg:w-2/5' : 'w-full'} transition-all duration-300 min-w-0`}>
              <div className="card h-full flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-800">{t("library.equipmentTypes")}</h3>
                        <p className="text-xs text-slate-500 mt-1">{equipmentTypes.length} {t("library.typesDefined")} • {t("library.clickToViewConnected")}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setIsAISuggestionsOpen(true)} 
                          className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                          data-testid="ai-map-failure-modes-btn"
                        >
                          <Sparkles className="w-4 h-4 mr-1" /> {t("library.mapFailureModes")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsAINewTypesOpen(true)}
                          className={`bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 ${canUseAITools ? "" : "hidden"}`}
                          data-testid="ai-suggest-new-types-btn"
                          disabled={hierarchyNodes.length === 0}
                          title="Suggest new equipment types based on your hierarchy"
                        >
                          <Sparkles className="w-4 h-4 mr-1" /> {t("library.suggestNewTypes")}
                        </Button>
                        <Button size="sm" onClick={() => { setEditingType(null); resetTypeForm(); setIsTypeDialogOpen(true); }} data-testid="add-equipment-type-btn">
                          <Plus className="w-4 h-4 mr-1" /> {t("library.addEquipmentType")}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Search Equipment Types */}
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder={t("library.searchEquipmentTypes")}
                          value={equipmentTypeSearch}
                          onChange={(e) => setEquipmentTypeSearch(e.target.value)}
                          className="pl-9 h-9"
                        />
                        {equipmentTypeSearch && (
                          <button
                            onClick={() => setEquipmentTypeSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {/* Filter: No Failure Modes */}
                      <label className="flex items-center gap-2 text-sm cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={typeFilterNoFailureModes}
                          onChange={(e) => setTypeFilterNoFailureModes(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-600 whitespace-nowrap">No failure modes</span>
                        {typeFilterNoFailureModes && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                            {noFailureModesTypeCount}
                          </span>
                        )}
                      </label>
                      <label
                        className="flex items-center gap-2 text-sm cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                        title={t("library.filterLinkedToEquipmentHint")}
                      >
                        <input
                          type="checkbox"
                          checked={filterLinkedToEquipment}
                          onChange={(e) => setFilterLinkedToEquipment(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          data-testid="linked-to-equipment-toggle-types"
                        />
                        <span className="text-slate-600 whitespace-nowrap">{t("library.filterLinkedToEquipment")}</span>
                        {filterLinkedToEquipment && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                            {linkedEquipmentTypeCount}
                          </span>
                        )}
                      </label>
                      {/* Discipline Filter */}
                      <Select value={typeFilterDiscipline} onValueChange={setTypeFilterDiscipline}>
                        <SelectTrigger className="w-[150px] h-9">
                          <SelectValue placeholder={t("disciplines.allDisciplines")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("disciplines.allDisciplines")}</SelectItem>
                          {DISCIPLINES.map(d => (
                            <SelectItem key={d} value={d}>{(t(`disciplines.${d}`) !== `disciplines.${d}` ? t(`disciplines.${d}`) : d)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-y-auto">
                  {/* Group equipment types by discipline */}
                  {DISCIPLINES.filter(d => typeFilterDiscipline === "all" || d === typeFilterDiscipline).map(discipline => {
                    let disciplineTypes = equipmentTypes.filter(
                      (t) => t.discipline === discipline && matchesActiveEquipmentTypeFilters(t),
                    );
                    if (disciplineTypes.length === 0) return null;
                    const colors = DISCIPLINE_COLORS[discipline] || DISCIPLINE_COLORS["Mechanical"];
                    
                    return (
                      <div key={discipline} className="mb-6 last:mb-0">
                        <div className={`flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg ${colors.bg}`}>
                          <span className={`text-sm font-semibold ${colors.text}`}>{(t(`disciplines.${discipline}`) !== `disciplines.${discipline}` ? t(`disciplines.${discipline}`) : discipline)}</span>
                          <span className="text-xs text-slate-400">({disciplineTypes.length})</span>
                        </div>
                        <div className={`grid gap-3 ${selectedEquipmentType ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                          {disciplineTypes.map(t => (
                            <EquipmentTypeItem 
                              key={t.id} 
                              item={t} 
                              onEdit={handleEditType} 
                              onDelete={(id) => deleteTypeMutation.mutate(id)}
                              onSelect={setSelectedEquipmentType}
                              isSelected={selectedEquipmentType?.id === t.id}
                              connectedFmCount={getConnectedFmCount(t.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Right Panel: Connected Failure Modes */}
            {selectedEquipmentType && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-1/2 lg:w-3/5 h-full"
              >
                <EquipmentTypeFailureModesPanel
                  equipmentType={selectedEquipmentType}
                  allFailureModes={failureModes}
                  onUpdateFailureMode={handleUpdateFailureModeConnection}
                  onClose={() => setSelectedEquipmentType(null)}
                  t={t}
                />
              </motion.div>
            )}
          </div>
        </TabsContent>
        
        {/* Maintenance Strategies Tab */}
        <TabsContent value="maintenance" className="h-[calc(100vh-200px)]">
          <div className="card h-full overflow-hidden">
            <MaintenanceStrategyTab
              filterLinkedToEquipment={filterLinkedToEquipment}
              onFilterLinkedToEquipmentChange={setFilterLinkedToEquipment}
              inUseEquipmentTypeIds={inUseEquipmentTypeIds}
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
        <TabsContent value="pm-import" className="space-y-4">
          <CustomPMImportTab 
            onOpenImportWizard={() => setIsPMImportOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Equipment Type Dialog */}
      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? t("library.editEquipmentType") : t("library.addEquipmentType")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t("common.name")}</Label>
              <Input 
                value={newType.name} 
                onChange={e => setNewType({ ...newType, name: e.target.value })} 
                placeholder="Custom Pump" 
                data-testid="type-name-input" 
              />
              {/* Show duplicate warning */}
              {newType.name.trim() && equipmentTypes.some(
                et => et.name.toLowerCase() === newType.name.trim().toLowerCase() && 
                      (!editingType || et.id !== editingType.id)
              ) && (
                <p className="text-sm text-red-500 mt-1">An equipment type with this name already exists</p>
              )}
            </div>
            <div>
              <Label>{t("library.discipline")}</Label>
              <Select value={newType.discipline} onValueChange={v => setNewType({ ...newType, discipline: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{(t(`disciplines.${d}`) !== `disciplines.${d}` ? t(`disciplines.${d}`) : d)}</SelectItem>)}
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
              disabled={!newType.name.trim() || equipmentTypes.some(
                et => et.name.toLowerCase() === newType.name.trim().toLowerCase() && 
                      (!editingType || et.id !== editingType.id)
              )} 
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
            {/* Category */}
            <div>
              <Label>{t("library.discipline")} *</Label>
              <Select value={newFm.discipline} onValueChange={v => setNewFm({ ...newFm, discipline: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{(t(`disciplines.${d}`) !== `disciplines.${d}` ? t(`disciplines.${d}`) : d)}</SelectItem>)}
                </SelectContent>
              </Select>
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

            {/* Linked Equipment Types - Multi-select with Search */}
            <div>
              <Label className="flex items-center gap-2">
                <Link className="w-4 h-4 text-blue-500" />
                {t("library.linkedEquipmentTypes")}
              </Label>
              <p className="text-xs text-slate-500 mb-2">{t("library.clickToSelect")}</p>
              {/* Search input for equipment types */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search equipment types..."
                  value={equipmentTypeSearch}
                  onChange={(e) => setEquipmentTypeSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              {/* Selected equipment types shown at top */}
              {(newFm.equipment_type_ids || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                  {(newFm.equipment_type_ids || []).map(id => {
                    const eqt = equipmentTypes.find(e => e.id === id);
                    return eqt ? (
                      <button
                        key={eqt.id}
                        type="button"
                        onClick={() => toggleEquipmentType(eqt.id)}
                        className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-500 text-white flex items-center gap-1"
                      >
                        {eqt.name}
                        <X className="w-3 h-3" />
                      </button>
                    ) : null;
                  })}
                </div>
              )}
              {/* Available equipment types */}
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg max-h-40 overflow-y-auto">
                {filteredEquipmentTypes.filter(eqt => !(newFm.equipment_type_ids || []).includes(eqt.id)).map(eqt => (
                  <button
                    key={eqt.id}
                    type="button"
                    onClick={() => toggleEquipmentType(eqt.id)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-all bg-white border border-slate-200 text-slate-600 hover:border-blue-300"
                  >
                    {eqt.name}
                  </button>
                ))}
                {filteredEquipmentTypes.filter(eqt => !(newFm.equipment_type_ids || []).includes(eqt.id)).length === 0 && (
                  <span className="text-sm text-slate-400 py-2">
                    {equipmentTypeSearch ? "No matching equipment types" : "All equipment types selected"}
                  </span>
                )}
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
              <div className="flex gap-2 mt-2 flex-wrap">
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
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-500 whitespace-nowrap">Est. time (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={actionMinutes}
                    onChange={(e) => setActionMinutes(e.target.value)}
                    className="w-24"
                    placeholder="—"
                    data-testid="fm-action-est-minutes"
                  />
                </div>
              </div>
              <ul className="space-y-2 mt-3">
                {newFm.recommended_actions.map((action, i) => {
                  // Handle both old string format and new object format
                  const isObject = typeof action === 'object';
                  const description = isObject ? (action.action || action.description) : action;
                  const discipline = isObject ? action.discipline : null;
                  const type = isObject ? action.action_type : null;
                  const estMin = isObject ? action.estimated_minutes : null;
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
                          {Number.isFinite(estMin) && estMin !== null && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                              {estMin} min
                            </span>
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
              disabled={!newFm.failure_mode.trim()} 
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
                      if (curr.discipline !== prev.discipline) {
                        changes.push({ field: 'Discipline', from: prev.discipline, to: curr.discipline });
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
                    if (thisVersion.discipline !== newer.discipline) {
                      changes.push({ field: 'Discipline', from: thisVersion.discipline, to: newer.discipline });
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
                  <Badge className={disciplineColors[deleteConfirmFm.discipline] || "bg-slate-100"}>
                    {deleteConfirmFm.discipline}
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

      {/* PM Import Wizard */}
      <PMImportWizard
        isOpen={isPMImportOpen}
        onClose={() => setIsPMImportOpen(false)}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["failureModes"] });
          // Don't close immediately - let user see summary, they will click Done
        }}
      />

      {/* AI Failure Mode Suggestions Dialog */}
      <AIFailureModeSuggestions
        isOpen={isAISuggestionsOpen}
        onClose={() => setIsAISuggestionsOpen(false)}
        equipmentTypes={equipmentTypes}
        failureModes={failureModes}
        onAcceptSuggestions={() => {
          queryClient.invalidateQueries({ queryKey: ["failureModes"] });
          queryClient.invalidateQueries({ queryKey: ["equipmentTypes"] });
        }}
        t={t}
      />

      {/* AI Suggest NEW Equipment Types Dialog */}
      <AINewEquipmentTypeSuggestions
        isOpen={isAINewTypesOpen}
        onClose={() => setIsAINewTypesOpen(false)}
        nodes={hierarchyNodes}
        equipmentTypes={equipmentTypes}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["equipment-types"] });
        }}
      />

      {/* AI Suggest NEW Failure Modes Dialog (Reliability Engineer) */}
      <AINewFailureModeSuggestions
        isOpen={isAINewFmOpen}
        onClose={() => setIsAINewFmOpen(false)}
        equipmentTypes={equipmentTypes}
        failureModes={failureModes}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["failureModes"] });
        }}
        t={t}
      />

      {/* AI Improve Failure Mode (Reliability Engineer) */}
      <AIImproveFailureMode
        isOpen={isAIImproveOpen}
        onClose={() => setIsAIImproveOpen(false)}
        failureMode={selectedFm}
        equipmentTypes={equipmentTypes}
        onApply={handleApplyAIImprovement}
      />

      {/* Bulk Improve Failure Modes with AI */}
      <BulkImproveFailureModes
        isOpen={isBulkImproveOpen}
        onClose={() => setIsBulkImproveOpen(false)}
        failureModes={displayedFailureModes}
        equipmentTypes={equipmentTypes}
        onCompleted={() => {
          queryClient.invalidateQueries({ queryKey: ["failureModes"] });
        }}
      />

      {/* AI Review Action Disciplines — re-classify recommended_actions disciplines */}
      <AIReviewActionDisciplines
        open={isReviewDisciplinesOpen}
        onClose={() => setIsReviewDisciplinesOpen(false)}
        failureModes={failureModes}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ["failureModes"] });
        }}
      />

      {/* AI Find Similar Failure Modes — semantic dedupe per equipment type */}
      <AIFindSimilarFailureModes
        open={isFindSimilarOpen}
        onClose={() => setIsFindSimilarOpen(false)}
        failureModes={failureModes}
        equipmentTypes={equipmentTypes}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ["failureModes"] });
        }}
      />
    </div>
  );
};

export default FailureModesPage;
