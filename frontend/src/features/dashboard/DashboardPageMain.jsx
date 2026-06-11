import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { statsAPI, actionsAPI, investigationAPI, equipmentHierarchyAPI, threatsAPI, usersAPI, api } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { formAPI } from "../../components/forms";
import { useAuth } from "../../contexts/AuthContext";
import { useEffectiveRole } from "../../contexts/RolePreviewContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { getBackendUrl, getAuthHeaders } from "../../lib/apiConfig";
import { formatDate, formatDateTime, formatDateTimeCompact } from "../../lib/dateUtils";
import { AuthenticatedImage, useAuthenticatedMedia } from "../../components/AuthenticatedMedia";
import { motion } from "framer-motion";
import OperatorLandingPage from "../../pages/OperatorLandingPage";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  GitBranch,
  Wrench,
  FileText,
  PieChart,
  Layers,
  AlertOctagon,
  Zap,
  Shield,
  Calendar,
  Users,
  Gauge,
  RefreshCw,
  ExternalLink,
  User,
  Briefcase,
  Filter,
  X,
  Building2,
  ChevronDown,
  ClipboardList,
  Paperclip,
  Download,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckSquare,
  Lightbulb,
  Settings,
  Sparkles,
} from "lucide-react";
import { Progress } from "../../components/ui/progress";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../components/ui/hover-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { DISCIPLINES } from "../../constants/disciplines";
import {
  AuthenticatedLightbox,
  ImageWithFallback,
  UserAvatar,
  MiniBarChart,
  StatCard,
  ProgressCard,
  DistributionCard,
  RecentItemCard,
} from "./dashboardWidgets";

const ProductionDashboardPage = lazy(() => import("../../pages/ProductionDashboardPage"));
const SmartDashboardBuilderPanel = lazy(() =>
  import("../dashboardBuilder/SmartDashboardBuilderPanel").then((m) => ({ default: m.SmartDashboardBuilderPanel }))
);
const ExecutiveDashboard = lazy(() => import("./ExecutiveDashboard"));
const RILDashboardPage = lazy(() => import("../../pages/RILDashboardPage"));

const DISABLED_DASHBOARD_TABS = new Set(["lab"]);

function resolveDashboardTab(tab) {
  if (!tab || DISABLED_DASHBOARD_TABS.has(tab)) return null;
  return tab;
}

function isDashboardTabAllowed(tab, flags) {
  switch (tab) {
    case "operational":
      return flags.canShowOperational;
    case "production":
      return flags.canShowProduction;
    case "reliability":
      return flags.canShowReliability;
    case "executive":
      return flags.canShowExecutive;
    case "builder":
      return flags.canShowBuilder;
    default:
      return false;
  }
}

function pickFirstAllowedDashboardTab({ preferBuilder, ...flags }) {
  if (preferBuilder && flags.canShowBuilder) return "builder";
  if (flags.canShowOperational) return "operational";
  if (flags.canShowProduction) return "production";
  if (flags.canShowReliability) return "reliability";
  if (flags.canShowExecutive) return "executive";
  if (flags.canShowBuilder) return "builder";
  return "operational";
}

export default function DashboardPageMain({ initialTab }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { effectiveRole } = useEffectiveRole();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const isFetchingAny = useIsFetching() > 0;
  // ON by default; disable explicitly with REACT_APP_ENABLE_SMART_DASHBOARD_BUILDER=false
  const manualBuilderEnabled = process.env.REACT_APP_ENABLE_SMART_DASHBOARD_BUILDER !== "false";

  // Operator view: shown on mobile when role is operator or owner has toggled it
  const initialIsMobileViewport = window.innerWidth < 768;
  const [isMobileViewport, setIsMobileViewport] = useState(() => initialIsMobileViewport);
  const canShowOperational = hasPermission("dashboard_operational", "read");
  const canShowProduction = hasPermission("dashboard_production", "read");
  const canShowReliability = hasPermission("reliability_intelligence", "read") && !isMobileViewport;
  const canShowExecutive = hasPermission("dashboard_executive", "read") && !isMobileViewport;
  const canShowBuilder =
    manualBuilderEnabled && !isMobileViewport && hasPermission("dashboard_builder", "read");
  const dashboardTabFlags = {
    canShowOperational,
    canShowProduction,
    canShowReliability,
    canShowExecutive,
    canShowBuilder,
  };
  const [activeTab, setActiveTab] = useState(
    resolveDashboardTab(initialTab) ||
      resolveDashboardTab(location.state?.activeTab) ||
      pickFirstAllowedDashboardTab({
        preferBuilder: manualBuilderEnabled && !initialIsMobileViewport,
        ...dashboardTabFlags,
      })
  );
  const [operatorToggle, setOperatorToggle] = useState(
    () => localStorage.getItem("operatorViewEnabled") === "true"
  );
  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 768);
    const onStorage = () => setOperatorToggle(localStorage.getItem("operatorViewEnabled") === "true");
    window.addEventListener("resize", onResize);
    window.addEventListener("storage", onStorage);
    // Also listen for custom event from Layout toggle (same-tab)
    window.addEventListener("operatorViewChanged", onStorage);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("operatorViewChanged", onStorage);
    };
  }, []);

  const isOperatorMode = user?.role === "operator" || operatorToggle;

  // Q1 plan: Intelligence Map is the default home for reliability engineers (desktop).
  useEffect(() => {
    if (effectiveRole === "reliability_engineer" && !isOperatorMode && !isMobileViewport) {
      navigate("/library?tab=intelligence-map", { replace: true });
    }
  }, [effectiveRole, isOperatorMode, isMobileViewport, navigate]);

  const refreshDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.investigations.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.formSubmissions.dashboard() });
    queryClient.invalidateQueries({ queryKey: queryKeys.threats.top() });
    queryClient.invalidateQueries({ queryKey: queryKeys.equipment.nodes() });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.rbac() });
  }, [queryClient]);

  // Redirect to operational tab on mobile if viewing hidden tabs (except production which is now mobile-enabled)
  useEffect(() => {
    const handleResize = () => {
      // sm breakpoint is 640px
      if (window.innerWidth < 640 && activeTab === "builder") {
        setActiveTab("operational");
      }
    };
    
    // Check on mount
    handleResize();
    
    // Listen for resize
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeTab]);

  // If we enter mobile viewport while on builder, force back to operational.
  useEffect(() => {
    if (isMobileViewport && activeTab === "builder") {
      setActiveTab("operational");
    }
  }, [activeTab, isMobileViewport]);

  useEffect(() => {
    if (!isDashboardTabAllowed(activeTab, dashboardTabFlags)) {
      setActiveTab(pickFirstAllowedDashboardTab({ preferBuilder: false, ...dashboardTabFlags }));
    }
  }, [
    activeTab,
    canShowOperational,
    canShowProduction,
    canShowReliability,
    canShowExecutive,
    canShowBuilder,
  ]);

  useEffect(() => {
    if (DISABLED_DASHBOARD_TABS.has(activeTab)) {
      setActiveTab("operational");
    }
  }, [activeTab]);

  useEffect(() => {
    if (location.state?.activeTab && DISABLED_DASHBOARD_TABS.has(location.state.activeTab)) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);
  
  // Filter states
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [plantUnitFilter, setPlantUnitFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  
  // Quick View states
  const [quickViewSubmission, setQuickViewSubmission] = useState(null);
  const [loadingQuickView, setLoadingQuickView] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);

  // Function to handle clicking on a submission - fetches full details
  const handleQuickViewClick = async (submission) => {
    setLoadingQuickView(true);
    try {
      const response = await api.get(`/form-submissions/${submission.id}`);
      setQuickViewSubmission(response.data);
    } catch (error) {
      console.error("Failed to fetch submission details:", error);
      setQuickViewSubmission(submission);
    } finally {
      setLoadingQuickView(false);
    }
  };

  // Close image lightbox with Escape key
  const closeImageLightbox = useCallback(() => {
    setViewingImage(null);
  }, []);
  
  useEffect(() => {
    if (!viewingImage) return;
    
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeImageLightbox();
      }
    };
    
    // Disable pointer events on dialog overlay when lightbox is open
    const dialogOverlay = document.querySelector('[data-dialog-overlay="true"]');
    if (dialogOverlay) {
      dialogOverlay.style.pointerEvents = 'none';
    }
    
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Re-enable pointer events when lightbox closes
      if (dialogOverlay) {
        dialogOverlay.style.pointerEvents = '';
      }
    };
  }, [viewingImage, closeImageLightbox]);

  // Navigation state for back button support
  const navState = { from: "dashboard", fromPage: "Dashboard" };
  
  // Fetch users for owner filter
  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.rbac(),
    queryFn: usersAPI.getAll,
    staleTime: 5 * 60 * 1000,
  });
  const usersList = usersData?.users || [];

  // Fetch equipment hierarchy for plant unit filter
  const { data: equipmentData } = useQuery({
    queryKey: queryKeys.equipment.nodes(),
    queryFn: equipmentHierarchyAPI.getNodes,
    staleTime: 5 * 60 * 1000,
  });
  const equipmentNodes = equipmentData?.nodes || [];
  
  // Get plant units from equipment hierarchy
  const plantUnits = equipmentNodes
    .filter(node => node.level === "plant_unit")
    .map(node => ({ id: node.id, name: node.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Get all descendant equipment IDs for a given plant unit
  const getDescendantIds = (parentId) => {
    const descendants = new Set();
    const findChildren = (pid) => {
      equipmentNodes.forEach(node => {
        if (node.parent_id === pid) {
          descendants.add(node.id);
          descendants.add(node.name);
          findChildren(node.id);
        }
      });
    };
    findChildren(parentId);
    return descendants;
  };

  // Fetch all data
  const { data: stats } = useQuery({
    queryKey: queryKeys.stats.all(),
    queryFn: statsAPI.get,
  });

  const { data: observationsData = [] } = useQuery({
    queryKey: [...queryKeys.threats.all(), language],
    queryFn: () => threatsAPI.getAll(null, { language }),
  });
  const allObservations = Array.isArray(observationsData) ? observationsData : [];

  // Apply filters to observations
  const observations = allObservations.filter(o => {
    if (disciplineFilter !== "all" && o.discipline !== disciplineFilter) return false;
    if (ownerFilter !== "all" && o.owner_id !== ownerFilter) return false;
    if (plantUnitFilter !== "all") {
      // Get all equipment IDs/names under this plant unit
      const descendantIds = getDescendantIds(plantUnitFilter);
      const equipmentMatch = 
        descendantIds.has(o.equipment_id) || 
        descendantIds.has(o.linked_equipment_id) ||
        descendantIds.has(o.equipment_name) ||
        descendantIds.has(o.linked_equipment_name) ||
        o.plant_unit === plantUnitFilter ||
        o.location === plantUnitFilter;
      if (!equipmentMatch) return false;
    }
    return true;
  });

  const { data: actionsData = { actions: [], stats: {} } } = useQuery({
    queryKey: queryKeys.actions.all(),
    queryFn: () => actionsAPI.getAll(),
  });
  const allActions = Array.isArray(actionsData?.actions) ? actionsData.actions : (Array.isArray(actionsData) ? actionsData : []);
  const actionsStats = actionsData?.stats || {};
  
  // Apply filters to actions
  const actions = allActions.filter(a => {
    if (disciplineFilter !== "all" && a.discipline !== disciplineFilter) return false;
    if (ownerFilter !== "all" && a.assignee !== ownerFilter) return false;
    if (plantUnitFilter !== "all") {
      const descendantIds = getDescendantIds(plantUnitFilter);
      const equipmentMatch = 
        descendantIds.has(a.linked_equipment_id) ||
        descendantIds.has(a.equipment_name);
      if (!equipmentMatch) return false;
    }
    return true;
  });

  const { data: investigationsData = { investigations: [] }, isLoading: isLoadingInvestigations, error: investigationsError } = useQuery({
    queryKey: queryKeys.investigations.all(),
    queryFn: () => investigationAPI.getAll(),
    staleTime: 60 * 1000,
    retry: 2,
  });
  const allInvestigations = Array.isArray(investigationsData?.investigations) ? investigationsData.investigations : (Array.isArray(investigationsData) ? investigationsData : []);
  
  // Apply filters to investigations  
  const investigations = allInvestigations.filter(i => {
    if (ownerFilter !== "all" && i.investigation_leader !== ownerFilter && i.created_by !== ownerFilter) return false;
    if (plantUnitFilter !== "all") {
      const descendantIds = getDescendantIds(plantUnitFilter);
      const equipmentMatch = 
        descendantIds.has(i.equipment_id) ||
        descendantIds.has(i.asset_name) ||
        i.location === plantUnitFilter;
      if (!equipmentMatch) return false;
    }
    return true;
  });

  // Fetch recent form submissions for dashboard widget
  const { data: formSubmissionsData = [] } = useQuery({
    queryKey: queryKeys.formSubmissions.dashboard(),
    queryFn: () => formAPI.getSubmissions({ limit: 10 }),
    staleTime: 60 * 1000, // 1 minute
  });
  const recentSubmissions = Array.isArray(formSubmissionsData) ? formSubmissionsData : (formSubmissionsData?.submissions || []);

  // Equipment data already fetched above as equipmentNodes
  const equipment = equipmentNodes;

  // Top 10 highest scoring observations
  const { data: topObservationsData = [] } = useQuery({
    queryKey: queryKeys.threats.top(),
    queryFn: () => threatsAPI.getTop(10),
  });
  const topObservations = Array.isArray(topObservationsData) ? topObservationsData : [];
  
  // Check if any filter is active
  const hasActiveFilters = disciplineFilter !== "all" || ownerFilter !== "all" || plantUnitFilter !== "all";
  
  // Operator landing early return (after all hooks)
  if (isMobileViewport && isOperatorMode && !initialTab) {
    return <OperatorLandingPage />;
  }

  // Clear all filters
  const clearFilters = () => {
    setDisciplineFilter("all");
    setOwnerFilter("all");
    setPlantUnitFilter("all");
  };

  // Calculate metrics
  const observationsByStatus = observations.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  // Order risk levels correctly: Critical > High > Medium > Low
  const riskOrder = ["Critical", "High", "Medium", "Low"];
  const observationsByRisk = riskOrder.reduce((acc, level) => {
    const count = observations.filter(t => t.risk_level === level).length;
    if (count > 0) acc[level] = count;
    return acc;
  }, {});

  const observationsByType = observations.reduce((acc, t) => {
    const type = t.equipment_type || "Unknown";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const actionsByStatus = actions.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  // Order action priorities correctly: critical > high > medium > low
  const priorityOrder = ["critical", "high", "medium", "low"];
  const actionsByPriority = priorityOrder.reduce((acc, level) => {
    const count = actions.filter(a => a.priority === level).length;
    if (count > 0) acc[level] = count;
    return acc;
  }, {});

  const investigationsByStatus = investigations.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  // Calculate completion rates
  const closedObservations = (observationsByStatus["Closed"] || 0) + (observationsByStatus["Mitigated"] || 0);
  const completedActions = actionsByStatus["completed"] || 0;
  const completedInvestigations = investigationsByStatus["completed"] || 0;
  
  // Used for stat card subtitle
  const openObservations = observationsByStatus["Open"] || 0;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-x-hidden" data-testid="dashboard-page">
      {/* Fixed Header with Tabs - Condensed */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("dashboard.title") || "Dashboard"}</h1>
            <p className="text-sm text-slate-500">{t("dashboard.subtitle") || "Overview of your risk management status"}</p>
          </div>
          {isMobileViewport && (
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              data-testid="dashboard-close-btn"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        
        {/* Dashboard Tab Buttons - Mobile Optimized */}
        <div className="flex items-center justify-between gap-4">
          <div className="max-w-full overflow-x-auto">
            <div className="inline-flex h-10 items-center rounded-lg bg-slate-100 p-1 gap-1 min-w-max">
            {canShowOperational && (
              <button
                onClick={() => setActiveTab("operational")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "operational" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
                data-testid="operational-tab"
              >
                <Activity className="w-4 h-4 flex-shrink-0" />
                <span className="hidden xs:inline">{t("dashboard.operational")}</span>
                <span className="xs:hidden">{t("dashboard.operationalShort")}</span>
              </button>
            )}
            {canShowProduction && (
              <button
                onClick={() => setActiveTab("production")}
                className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "production" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
                data-testid="production-tab"
              >
                <Gauge className="w-4 h-4 flex-shrink-0" />
                <span className="hidden xs:inline">{t("dashboard.production")}</span>
                <span className="xs:hidden">{t("dashboard.productionShort")}</span>
              </button>
            )}
            {canShowReliability && (
              <button
                onClick={() => setActiveTab("reliability")}
                className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "reliability" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
                data-testid="reliability-tab"
              >
                <Sparkles className="w-4 h-4 flex-shrink-0" />
                <span className="hidden xs:inline">{t("dashboard.reliability")}</span>
                <span className="xs:hidden">{t("dashboard.reliabilityShort")}</span>
              </button>
            )}
            {canShowExecutive && (
              <button
                onClick={() => setActiveTab("executive")}
                className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "executive" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
                data-testid="executive-tab"
              >
                <TrendingUp className="w-4 h-4 flex-shrink-0" />
                <span className="hidden xs:inline">Executive</span>
                <span className="xs:hidden">Exec</span>
              </button>
            )}
            {canShowBuilder && (
              <button
                onClick={() => setActiveTab("builder")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                  activeTab === "builder" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"
                }`}
                data-testid="builder-tab"
              >
                <Sparkles className="w-4 h-4 flex-shrink-0" />
                <span className="hidden xs:inline">{t("dashboard.builder")}</span>
                <span className="xs:hidden">{t("dashboard.builderShort")}</span>
              </button>
            )}
          </div>
          </div>
          
          {/* Filter Button - Next to tabs, only on operational */}
          {activeTab === "operational" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={refreshDashboard}
                title={t("dashboard.refresh")}
                data-testid="dashboard-refresh-btn"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingAny ? "animate-spin" : ""}`} />
              </Button>
              {/* Active Filter Badges */}
              {hasActiveFilters && (
                <div className="hidden sm:flex items-center gap-2">
                  {disciplineFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <Wrench className="w-3 h-3" />
                      {DISCIPLINES.find(d => d.value === disciplineFilter)?.label || disciplineFilter}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setDisciplineFilter("all")} />
                    </Badge>
                  )}
                  {ownerFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <User className="w-3 h-3" />
                      {usersList.find(u => u.id === ownerFilter)?.name || "Unknown"}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setOwnerFilter("all")} />
                    </Badge>
                  )}
                  {plantUnitFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <Building2 className="w-3 h-3" />
                      {plantUnits.find(pu => pu.id === plantUnitFilter)?.name || plantUnitFilter}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setPlantUnitFilter("all")} />
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-slate-500 hover:text-red-500 h-7 px-2">
                    Clear
                  </Button>
                </div>
              )}
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1.5 h-9"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0 text-xs">
                    {[disciplineFilter !== "all", ownerFilter !== "all", plantUnitFilter !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>
          )}
        </div>
        
        {/* Expanded Filter Panel - Below tabs when open */}
        {activeTab === "operational" && showFilters && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Discipline Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> Discipline
                </label>
                <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Disciplines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Disciplines</SelectItem>
                    {DISCIPLINES.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Owner Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <User className="w-3 h-3" /> Owner / Assignee
                </label>
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {usersList.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Plant/Unit Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Plant / Unit
                </label>
                <Select value={plantUnitFilter} onValueChange={setPlantUnitFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Plants/Units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Plants/Units</SelectItem>
                    {plantUnits.map(pu => (
                      <SelectItem key={pu.id} value={pu.id}>{pu.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}
      </div>
      
      {/* Scrollable Tab Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="max-w-7xl mx-auto">
          {/* Operational Dashboard Tab */}
          {activeTab === "operational" && canShowOperational && (
            <div className="animate-fade-in">
      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t("dashboard.totalObservations") || "Total Observations"}
          value={observations.length}
          icon={AlertTriangle}
          color="text-amber-600"
          bg="bg-amber-50"
          subtitle={`${openObservations} ${t("common.open") || "open"}`}
          calculation={t("dashboard.totalObservationsCalculation")}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <StatCard
          label={t("dashboard.totalActions") || "Total Actions"}
          value={actions.length}
          icon={CheckCircle2}
          color="text-blue-600"
          bg="bg-blue-50"
          subtitle={`${completedActions} ${t("actionsPage.completed") || "completed"}`}
          calculation={t("dashboard.totalActionsCalculation")}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <StatCard
          label={t("dashboard.investigations") || "Investigations"}
          value={investigations.length}
          icon={GitBranch}
          color="text-purple-600"
          bg="bg-purple-50"
          subtitle={`${completedInvestigations} ${t("actionsPage.completed") || "completed"}`}
          calculation={t("dashboard.investigationsCalculation")}
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
        />
        <StatCard
          label={t("dashboard.equipment") || "Equipment"}
          value={equipment.length}
          icon={Layers}
          color="text-green-600"
          bg="bg-green-50"
          subtitle={t("dashboard.totalAssets") || "total assets"}
          calculation={t("dashboard.equipmentCalculation")}
          clickable={true}
          onClick={() => {
            if (window.innerWidth < 1024) {
              window.dispatchEvent(new CustomEvent("open-hierarchy"));
            } else {
              navigate("/equipment-manager", { state: navState });
            }
          }}
        />
      </div>

      {/* Progress Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <ProgressCard
          title={t("dashboard.observationResolution") || "Observation Resolution"}
          completed={closedObservations}
          total={observations.length}
          icon={Shield}
          color="bg-amber-500"
          calculation={t("dashboard.observationResolutionCalculation")
            .replace("{pct}", String(observations.length > 0 ? Math.round((closedObservations / observations.length) * 100) : 0))
            .replace("{completed}", String(closedObservations))
            .replace("{total}", String(observations.length))}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <ProgressCard
          title={t("dashboard.actionCompletion") || "Action Completion"}
          completed={completedActions}
          total={actions.length}
          icon={Target}
          color="bg-blue-500"
          calculation={t("dashboard.actionCompletionCalculation")
            .replace("{pct}", String(actions.length > 0 ? Math.round((completedActions / actions.length) * 100) : 0))
            .replace("{completed}", String(completedActions))
            .replace("{total}", String(actions.length))}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <ProgressCard
          title={t("dashboard.investigationProgress") || "Investigation Progress"}
          completed={completedInvestigations}
          total={investigations.length}
          icon={GitBranch}
          color="bg-purple-500"
          calculation={t("dashboard.investigationProgressCalculation")
            .replace("{pct}", String(investigations.length > 0 ? Math.round((completedInvestigations / investigations.length) * 100) : 0))
            .replace("{completed}", String(completedInvestigations))
            .replace("{total}", String(investigations.length))}
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
        />
      </div>

      {/* Top 10 Highest Scoring Observations */}
      {topObservations.length > 0 && (
        <div className="mb-6">
          <div className="themed-card rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-medium text-secondary">
                  {t("dashboard.topRiskObservations") || "Top 10 Highest Risk Observations"}
                </h3>
              </div>
              <button 
                onClick={() => navigate("/threats", { state: navState })}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View All <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {topObservations.map((obs, index) => (
                <div 
                  key={obs.id} 
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/threats/${obs.id}`, { state: navState })}
                  data-testid={`top-obs-${obs.id}`}
                >
                  {/* Rank Badge */}
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 bg-slate-200 text-slate-600">
                    {index + 1}
                  </span>
                  
                  {/* User Avatar - Show owner if assigned, else creator */}
                  <UserAvatar 
                    name={obs.owner_name || obs.creator_name}
                    photo={obs.creator_photo}
                    initials={(obs.owner_name || obs.creator_name || "U").charAt(0)}
                    size="sm"
                    position={obs.creator_position}
                    showPopover={true}
                  />
                  
                  {/* Risk Level Dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    obs.risk_level === "Critical" ? "bg-red-500" :
                    obs.risk_level === "High" ? "bg-orange-500" :
                    obs.risk_level === "Medium" ? "bg-yellow-500" : "bg-green-500"
                  }`} />
                  
                  {/* Title and Asset */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {obs.title?.includes(" - ") ? obs.title.split(" - ")[0] : obs.title}
                      </p>
                      <span className="sm:hidden text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold tabular-nums flex-shrink-0" title="Risk Score">
                        {typeof obs.risk_score === 'number' ? Math.round(obs.risk_score) : obs.risk_score || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {obs.title?.includes(" - ") && (
                        <span className="text-[10px] text-slate-500 truncate">{obs.title.split(" - ").slice(1).join(" - ")}</span>
                      )}
                      {obs.equipment_tag && (
                        <span className="text-[9px] font-mono text-slate-400">{obs.equipment_tag}</span>
                      )}
                      {obs.created_at && (
                        <span className="text-[10px] text-slate-400 tabular-nums md:hidden">
                          {formatDateTimeCompact(obs.created_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Risk Score - desktop only */}
                  <div className="w-8 flex-shrink-0 text-right hidden sm:block">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold tabular-nums inline-block" title="Risk Score">
                      {typeof obs.risk_score === 'number' ? Math.round(obs.risk_score) : obs.risk_score || 0}
                    </span>
                  </div>

                  {/* RPN Badge */}
                  <div className="w-16 flex-shrink-0 text-right hidden sm:block">
                    {obs.fmea_rpn ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium inline-block" title="Risk Priority Number">
                        RPN: {obs.fmea_rpn}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                  </div>
                  
                  {/* Registration date/time */}
                  {obs.created_at && (
                    <div className="w-[5.75rem] flex-shrink-0 text-right hidden md:block">
                      <span
                        className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap"
                        title={t("observations.submissionDate")}
                      >
                        {formatDateTimeCompact(obs.created_at)}
                      </span>
                    </div>
                  )}

                  {/* Status Badge - Fixed width for alignment */}
                  <div className="w-16 flex-shrink-0 text-right">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded inline-block ${
                      obs.status === "Open" ? "bg-blue-100 text-blue-700" :
                      obs.status === "Mitigated" ? "bg-green-100 text-green-700" :
                      obs.status === "In Progress" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-700"
                    }`}>{obs.status || "Open"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DistributionCard
          title={t("dashboard.observationsByStatus") || "Threats by Status"}
          data={observationsByStatus}
          colors={["bg-blue-400", "bg-amber-400", "bg-green-400", "bg-slate-400"]}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.observationsByRisk") || "Threats by Risk Level"}
          data={observationsByRisk}
          colors={["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.actionsByStatus") || "Actions by Status"}
          data={actionsByStatus}
          colors={["bg-blue-400", "bg-amber-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.actionsByPriority") || "Actions by Priority"}
          data={actionsByPriority}
          colors={["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <RecentItemCard
          title={t("dashboard.recentObservations") || "Recent Observations"}
          icon={AlertTriangle}
          items={observations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noObservations") || "No observations recorded"}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `observation-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/threats/${item.id}`, { state: navState }); }}
              data-testid={`observation-item-${item.id}`}
            >
              <UserAvatar 
                name={item.creator_name}
                photo={item.creator_photo}
                initials={item.creator_initials}
                position={item.creator_position}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.risk_level === "Critical" ? "bg-red-500" :
                item.risk_level === "High" ? "bg-orange-500" :
                item.risk_level === "Medium" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {item.asset}
                  {item.asset && item.created_at && <span className="text-slate-300 mx-1">·</span>}
                  {item.created_at && (
                    <span className="tabular-nums">{formatDateTimeCompact(item.created_at)}</span>
                  )}
                </p>
              </div>
              {/* Compact Risk Score & RPN */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-medium tabular-nums" title="Risk Score">
                  {typeof item.risk_score === 'number' ? Math.round(item.risk_score) : item.risk_score || 0}
                </span>
                {item.fmea_rpn && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 font-medium tabular-nums" title="RPN">
                    {item.fmea_rpn}
                  </span>
                )}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                item.status === "Open" ? "bg-blue-100 text-blue-700" :
                item.status === "Mitigated" ? "bg-green-100 text-green-700" :
                "bg-slate-100 text-slate-700"
              }`}>{item.status}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentFormSubmissions") || "Recent Form Submissions"}
          icon={FileText}
          items={recentSubmissions.sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at))}
          emptyMessage={t("dashboard.noFormSubmissions") || "No form submissions yet"}
          clickable={true}
          onClick={() => navigate("/form-submissions", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `submission-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/form-submissions", { state: { ...navState, submissionId: item.id } });
              }}
              data-testid={`form-submission-item-${item.id}`}
            >
              <UserAvatar 
                name={item.submitted_by_name || item.submitter_name || "User"}
                photo={item.submitted_by_photo}
                initials={(item.submitted_by_name || item.submitter_name || "U").charAt(0)}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.status === "completed" || item.status === "approved" ? "bg-green-500" :
                item.status === "pending" ? "bg-amber-500" :
                item.status === "rejected" ? "bg-red-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.form_template_name || item.template_name || item.form_name || "Form"}</p>
                <p className="text-[10px] text-slate-400">
                  {formatDateTime(item.submitted_at || item.created_at)}
                </p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                item.status === "completed" || item.status === "approved" ? "bg-green-100 text-green-700" :
                item.status === "pending" ? "bg-amber-100 text-amber-700" :
                item.status === "rejected" ? "bg-red-100 text-red-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status || "submitted"}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentActions") || "Recent Actions"}
          icon={CheckCircle2}
          items={actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noActions") || "No actions recorded"}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `action-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/actions/${item.id}`, { state: navState }); }}
              data-testid={`action-item-${item.id}`}
            >
              <UserAvatar 
                name={item.creator_name}
                photo={item.creator_photo}
                initials={item.creator_initials}
                position={item.creator_position}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.priority === "critical" ? "bg-red-500" :
                item.priority === "high" ? "bg-orange-500" :
                item.priority === "medium" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-slate-400">{item.source_name || "Manual"}</p>
                  {item.attachments?.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      <Paperclip className="w-2.5 h-2.5" />
                      {item.attachments.length}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                item.status === "completed" ? "bg-green-100 text-green-700" :
                item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status?.replace("_", " ")}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentInvestigations") || "Recent Investigations"}
          icon={GitBranch}
          items={investigations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noInvestigations") || "No investigations started"}
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `investigation-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/causal-engine?inv=${item.id}`, { state: navState }); }}
              data-testid={`investigation-item-${item.id}`}
            >
              {/* Lead Picture with Popover - FIRST */}
              <UserAvatar 
                name={item.lead_name || item.investigation_leader}
                photo={item.lead_picture}
                position={item.lead_position || "Investigation Lead"}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.status === "completed" ? "bg-green-500" :
                item.status === "in_progress" ? "bg-amber-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.asset_name || "No asset"}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${
                item.status === "completed" ? "bg-green-100 text-green-700" :
                item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status?.replace("_", " ")}</span>
            </div>
          )}
        />
      </div>

      {/* Equipment by Type */}
      {Object.keys(observationsByType).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 themed-card rounded-xl border p-4 hover:shadow-md cursor-pointer transition-all"
          onClick={() => navigate("/threats", { state: navState })}
        >
          <h3 className="text-sm font-medium text-secondary mb-4 flex items-center gap-1">
            {t("dashboard.observationsByEquipment") || "Observations by Equipment Type"}
            <ExternalLink className="w-3 h-3 opacity-50" />
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(observationsByType).map(([type, count], idx) => (
              <div key={type} className="themed-card rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-secondary">{count}</p>
                <p className="text-xs text-muted truncate" title={type}>{type}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
            </div>
          )}
          
          {/* Smart Dashboard Builder Tab (manual, intuitive) */}
          {activeTab === "builder" && canShowBuilder && (
            <div className="animate-fade-in">
              <Suspense
                fallback={
                  <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
                    Loading builder…
                  </div>
                }
              >
                <SmartDashboardBuilderPanel
                  actions={actions}
                  observations={observations}
                  investigations={investigations}
                  users={usersList}
                />
              </Suspense>
            </div>
          )}

          {/* Production Dashboard Tab */}
          {activeTab === "production" && canShowProduction && (
            <div className="animate-fade-in -mx-4 sm:-mx-6">
              <Suspense
                fallback={
                  <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500 mx-4 sm:mx-6">
                    Loading production dashboard…
                  </div>
                }
              >
                <ProductionDashboardPage />
              </Suspense>
            </div>
          )}

          {/* Reliability Intelligence Dashboard Tab */}
          {activeTab === "reliability" && canShowReliability && (
            <div className="animate-fade-in -mx-4 sm:-mx-6">
              <Suspense
                fallback={
                  <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500 mx-4 sm:mx-6">
                    Loading reliability intelligence…
                  </div>
                }
              >
                <RILDashboardPage embedded />
              </Suspense>
            </div>
          )}

          {/* Executive Dashboard Tab */}
          {activeTab === "executive" && canShowExecutive && (
            <div className="animate-fade-in">
              <Suspense
                fallback={
                  <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
                    Loading executive dashboard…
                  </div>
                }
              >
                <ExecutiveDashboard />
              </Suspense>
            </div>
          )}

        </div>
      </div>
      
      {/* Quick View Modal for Form Submissions */}
      <Dialog open={!!quickViewSubmission || loadingQuickView} onOpenChange={() => { setQuickViewSubmission(null); setLoadingQuickView(false); }}>
        <DialogContent
          showCloseButton={false}
          className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-center border-b border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => setQuickViewSubmission(null)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100"
              aria-label="Close"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
          
          {/* Loading state */}
          {loadingQuickView && !quickViewSubmission && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}
          
          {/* Scrollable content */}
          {quickViewSubmission && (
          <>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-5">
              {/* Form Title and Status */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 leading-tight">
                      {quickViewSubmission?.form_template_name || quickViewSubmission?.template_name || quickViewSubmission?.form_name || "Form Submission"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <UserAvatar 
                        name={quickViewSubmission?.submitted_by_name || "User"}
                        photo={quickViewSubmission?.submitted_by_photo}
                        initials={(quickViewSubmission?.submitted_by_name || "U").charAt(0)}
                        size="xs"
                        showPopover={false}
                      />
                      <span className="text-sm text-slate-500">
                        {quickViewSubmission?.submitted_by_name || "Unknown"}
                        <span className="mx-1.5">•</span>
                        {quickViewSubmission?.submitted_at ? formatDateTime(quickViewSubmission.submitted_at) : "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                  quickViewSubmission?.status === "completed" || quickViewSubmission?.status === "approved" 
                    ? "bg-green-100 text-green-700 border-green-200" 
                    : quickViewSubmission?.status === "pending" 
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : quickViewSubmission?.status === "rejected"
                        ? "bg-red-100 text-red-700 border-red-200"
                        : "bg-blue-100 text-blue-700 border-blue-200"
                }`}>
                  {quickViewSubmission?.status === "completed" ? "Completed" : 
                   quickViewSubmission?.status === "approved" ? "Approved" :
                   quickViewSubmission?.status === "pending" ? "Pending" :
                   quickViewSubmission?.status === "rejected" ? "Rejected" : "Submitted"}
                </Badge>
              </div>
              
              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-100">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Submitted by</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <UserAvatar 
                        name={quickViewSubmission?.submitted_by_name || "User"}
                        photo={quickViewSubmission?.submitted_by_photo}
                        initials={(quickViewSubmission?.submitted_by_name || "U").charAt(0)}
                        size="xs"
                        showPopover={false}
                      />
                      <span className="text-sm font-medium text-slate-700">{quickViewSubmission?.submitted_by_name || "Unknown"}</span>
                    </div>
                  </div>
                </div>
                {quickViewSubmission?.equipment_name && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Equipment</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.equipment_name}
                      </p>
                    </div>
                  </div>
                )}
                {quickViewSubmission?.task_template_name && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Task</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.task_template_name}
                      </p>
                    </div>
                  </div>
                )}
                {quickViewSubmission?.discipline && (
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 flex items-center justify-center">
                      <span className={`w-2.5 h-2.5 rounded-full bg-blue-500`} />
                    </span>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Discipline</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.discipline}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* AI Vision Photo - shown when submission contains __ai_scan_photo */}
              {(() => {
                const allResponses = quickViewSubmission?.values || quickViewSubmission?.responses || [];
                const aiPhotoEntry = allResponses.find(r => r.field_id === "__ai_scan_photo" && r.value);
                const aiPhotoPath = aiPhotoEntry?.value
                  || quickViewSubmission?.ai_extraction?.extracted_fields?.__ai_scan_photo?.value;
                if (!aiPhotoPath || typeof aiPhotoPath !== "string") return null;
                const apiPath = aiPhotoPath.startsWith("http") || aiPhotoPath.startsWith("data:")
                  ? aiPhotoPath
                  : `/api/storage/${aiPhotoPath}`;
                return (
                  <div data-testid="quickview-ai-vision-photo">
                    <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-blue-500" />
                      AI Vision Photo
                    </h3>
                    <button
                      type="button"
                      onClick={() => setViewingImage({ url: apiPath, name: "AI Vision Photo" })}
                      className="group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-300 hover:shadow-md transition-all"
                      data-testid="quickview-ai-vision-photo-thumbnail"
                    >
                      <AuthenticatedImage
                        src={apiPath}
                        alt="AI Vision Source Photo"
                        className="w-full max-h-72 object-contain bg-slate-100"
                        fallback={
                          <div className="w-full h-40 flex flex-col items-center justify-center text-slate-400 gap-2">
                            <AlertTriangle className="w-8 h-8" />
                            <span className="text-xs">Photo unavailable</span>
                          </div>
                        }
                      />
                    </button>
                    <p className="text-xs text-slate-400 mt-2">
                      Source image used by AI to auto-fill the fields below. Tap to enlarge.
                    </p>
                  </div>
                );
              })()}

              {/* Checklist Section */}
              {(() => {
                const responsesAll = quickViewSubmission?.values || quickViewSubmission?.responses || [];
                const responses = responsesAll.filter(r => r.field_id !== "__ai_scan_photo");
                if (responses.length === 0) return null;
                
                return (
                  <div>
                    <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <CheckSquare className="w-5 h-5 text-slate-600" />
                      Checklist
                    </h3>
                    <div className="space-y-2">
                      {responses.map((response, idx) => {
                        const isWarning = response.threshold_status === "warning";
                        const isCritical = response.threshold_status === "critical";
                        const isBoolean = typeof response.value === "boolean";
                        const isPass = isBoolean ? response.value : !isCritical && !isWarning;
                        const isSignature = response.field_type === "signature" || 
                          (typeof response.value === "string" && response.value?.startsWith("data:image/png;base64,"));
                        const hasAttachment = response.attachment_url || response.file_url;
                        const attachmentRawUrl = response.attachment_url || response.file_url || "";
                        const isImage = hasAttachment && /\.(jpg|jpeg|png|gif|webp)$/i.test(attachmentRawUrl);
                        // Build clean API path for AuthenticatedLightbox (no token query param)
                        const attachmentApiPath = attachmentRawUrl && !attachmentRawUrl.startsWith('data:') && !attachmentRawUrl.startsWith('http')
                          ? `/api/storage/${attachmentRawUrl}`
                          : attachmentRawUrl;
                        // Build full URL with token for non-image downloads (fallback)
                        const authToken = localStorage.getItem('token');
                        const attachmentFullUrl = attachmentRawUrl && !attachmentRawUrl.startsWith('data:') && !attachmentRawUrl.startsWith('http')
                          ? `${getBackendUrl()}/api/storage/${attachmentRawUrl}${authToken ? `?token=${authToken}` : ''}`
                          : attachmentRawUrl;
                        
                        return (
                          <div 
                            key={response.field_id || `response-${idx}`}
                            className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${
                              isCritical 
                                ? "bg-red-50 border-l-red-500" 
                                : isWarning 
                                  ? "bg-amber-50 border-l-amber-500" 
                                  : "bg-white border-l-green-500"
                            } border border-l-4 border-slate-100`}
                          >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"
                            }`}>
                              {isCritical ? (
                                <X className="w-3 h-3 text-white" />
                              ) : isWarning ? (
                                <AlertTriangle className="w-3 h-3 text-white" />
                              ) : (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="font-medium text-slate-800 text-sm break-words">
                                {(response.field_label || response.field_id || "").replace(/_/g, ' ')}
                              </p>
                              <p className="text-sm text-slate-500 mt-0.5">
                                {isSignature && response.value ? (
                                  <button
                                    onClick={() => setViewingImage({ url: response.value, name: (response.field_label || "Signature").replace(/_/g, ' ') })}
                                    className="text-blue-600 hover:underline"
                                  >
                                    View Signature
                                  </button>
                                ) : isBoolean ? (
                                  response.value ? "Yes" : "No"
                                ) : Array.isArray(response.value) ? (
                                  response.value.join(", ")
                                ) : hasAttachment ? (
                                  <button
                                    onClick={() => {
                                      if (isImage) {
                                        // Use clean API path - AuthenticatedLightbox handles auth
                                        setViewingImage({ url: attachmentApiPath, name: (response.field_label || "Image").replace(/_/g, ' ') });
                                      } else {
                                        window.open(attachmentFullUrl, '_blank');
                                      }
                                    }}
                                    className="text-blue-600 hover:underline flex items-center gap-1"
                                  >
                                    <Paperclip className="w-3 h-3" /> View Attachment
                                  </button>
                                ) : (
                                  <>
                                    {String(response.value || "—")}
                                    {response.unit && <span className="text-slate-400 ml-1">{response.unit}</span>}
                                  </>
                                )}
                              </p>
                            </div>
                            <Badge className={`shrink-0 text-xs font-medium ${
                              isCritical 
                                ? "bg-red-100 text-red-700 border-red-200" 
                                : isWarning 
                                  ? "bg-amber-100 text-amber-700 border-amber-200" 
                                  : "bg-green-100 text-green-700 border-green-200"
                            }`}>
                              {isCritical ? "FAIL" : isWarning ? "WARNING" : "PASS"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              
              {/* Insights Section - Generated summary */}
              {quickViewSubmission?.values?.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-slate-600" />
                    Insights
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                    {(() => {
                      const responses = (quickViewSubmission?.values || []).filter(r => r.field_id !== "__ai_scan_photo");
                      const totalItems = responses.length;
                      const passedItems = responses.filter(r => {
                        const isBoolean = typeof r.value === "boolean";
                        return isBoolean ? r.value : r.threshold_status !== "critical" && r.threshold_status !== "warning";
                      }).length;
                      const warningItems = responses.filter(r => r.threshold_status === "warning").length;
                      const criticalItems = responses.filter(r => r.threshold_status === "critical").length;
                      
                      return (
                        <>
                          {criticalItems === 0 && warningItems === 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm text-slate-700">No deviations detected in this round</span>
                            </div>
                          )}
                          {passedItems === totalItems && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm text-slate-700">Equipment performing within expected parameters</span>
                            </div>
                          )}
                          {criticalItems > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              <span className="text-sm text-slate-700">{criticalItems} critical issue{criticalItems > 1 ? 's' : ''} requiring immediate attention</span>
                            </div>
                          )}
                          {warningItems > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span className="text-sm text-slate-700">{warningItems} warning{warningItems > 1 ? 's' : ''} detected - monitor closely</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-sm text-slate-700">{passedItems} of {totalItems} checks passed</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  
                  {/* Recommendation */}
                  <div className="bg-blue-50 rounded-lg p-4 mt-3 border border-blue-100">
                    <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      Recommendation:
                    </h4>
                    <p className="text-sm text-slate-600">
                      {(() => {
                        const responses = (quickViewSubmission?.values || []).filter(r => r.field_id !== "__ai_scan_photo");
                        const criticalItems = responses.filter(r => r.threshold_status === "critical").length;
                        const warningItems = responses.filter(r => r.threshold_status === "warning").length;
                        
                        if (criticalItems > 0) {
                          return "Immediate corrective action required. Create observation and action items for critical issues.";
                        } else if (warningItems > 0) {
                          return "Schedule follow-up inspection to monitor warning conditions. Consider preventive maintenance.";
                        } else {
                          return "Continue current maintenance schedule. Equipment is operating normally.";
                        }
                      })()}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Attachments */}
              {quickViewSubmission?.attachments?.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Paperclip className="w-5 h-5 text-slate-600" />
                    Attachments ({quickViewSubmission.attachments.length})
                  </h3>
                  <div className="space-y-3">
                    {quickViewSubmission.attachments.map((att, idx) => {
                      const isImage = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || att.filename || "");
                      const rawUrl = att.url || att.data;
                      // Clean API path for AuthenticatedImage/Lightbox (handles auth via headers)
                      const apiPath = rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('http') 
                        ? `/api/storage/${rawUrl}` 
                        : rawUrl;
                      // Full URL with token for non-image downloads (fallback)
                      const authToken = localStorage.getItem('token');
                      const downloadUrl = rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('http') 
                        ? `${getBackendUrl()}/api/storage/${rawUrl}${authToken ? `?token=${authToken}` : ''}` 
                        : rawUrl;
                      const fileName = att.name || att.filename || "Attachment";
                      const hasError = att.error || att.needs_migration;
                      
                      return (
                        <div 
                          key={att.url || att.id || `attachment-${idx}`}
                          className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"
                        >
                          {/* Thumbnail - Use AuthenticatedImage for proper mobile auth */}
                          <div className="w-20 h-16 bg-slate-200 rounded-lg overflow-hidden flex-shrink-0">
                            {hasError ? (
                              <div className="w-full h-full flex items-center justify-center bg-amber-50">
                                <AlertTriangle className="w-6 h-6 text-amber-500" />
                              </div>
                            ) : isImage && apiPath ? (
                              <AuthenticatedImage 
                                src={apiPath} 
                                alt={fileName}
                                className="w-full h-full object-cover"
                                fallback={
                                  <div className="w-full h-full flex items-center justify-center">
                                    <FileText className="w-6 h-6 text-slate-400" />
                                  </div>
                                }
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FileText className="w-6 h-6 text-slate-400" />
                              </div>
                            )}
                          </div>
                          
                          {/* Info and actions */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{fileName}</p>
                            {att.failure_mode && (
                              <p className="text-xs text-slate-500 mt-0.5">Failure Mode: {att.failure_mode}</p>
                            )}
                            {att.equipment && (
                              <p className="text-xs text-slate-500">Equipment: {att.equipment}</p>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  if (!hasError && apiPath) {
                                    if (isImage) {
                                      // Use clean API path - AuthenticatedLightbox handles auth
                                      setViewingImage({ url: apiPath, name: fileName });
                                    } else {
                                      window.open(downloadUrl, '_blank');
                                    }
                                  }
                                }}
                                disabled={hasError}
                              >
                                View Full
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  if (!hasError && downloadUrl) {
                                    const link = document.createElement('a');
                                    link.href = downloadUrl;
                                    link.download = fileName;
                                    link.click();
                                  }
                                }}
                                disabled={hasError}
                              >
                                Download
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Notes */}
              {quickViewSubmission?.notes && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-600" />
                    {t("common.notes")}
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{quickViewSubmission.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Fixed footer with actions - Hidden on mobile */}
          <div className="hidden sm:flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setQuickViewSubmission(null)}
                className="px-4"
              >
                Close
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  // Export functionality
                  toast.info("Export feature coming soon");
                }}
                className="px-4"
              >
                Export
              </Button>
            </div>
            <Button 
              onClick={() => {
                setQuickViewSubmission(null);
                navigate("/form-submissions");
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4"
            >
              View All Submissions
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Lightbox - Using Portal to render above all dialogs */}
      {viewingImage && createPortal(
        <AuthenticatedLightbox
          url={viewingImage.url}
          name={viewingImage.name}
          onClose={() => setViewingImage(null)}
        />,
        document.body
      )}
    </div>
  );
}
