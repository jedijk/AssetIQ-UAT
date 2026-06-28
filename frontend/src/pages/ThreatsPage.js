import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { threatsAPI, statsAPI } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { isIOSLikeDevice, isTouchMobileDevice } from "../lib/deviceUtils";
import {
  cancelPrefetchObservationWorkspace,
  prefetchTopObservationWhenIdle,
  schedulePrefetchObservationWorkspace,
} from "../lib/prefetchObservationWorkspace";
import { buildObservationDisplayTitle } from "../lib/observationDisplayTitle";
import { useLanguage } from "../contexts/LanguageContext";
import { useMobilePageBadge } from "../contexts/BreadcrumbContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { useAuth } from "../contexts/AuthContext";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useNotificationTriggers } from "../hooks/useNotificationTriggers";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  CheckCircle,
  Filter,
  Search,
  Cog,
  Thermometer,
  Gauge,
  Zap,
  Waves,
  Wind,
  Pipette,
  CircleDot,
  Settings,
  Activity,
  Flame,
  Droplets,
  Box,
  Trash2,
  BarChart3,
  Target,
  Loader2,
  Check,
  PauseCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  RefreshCw,
  ClipboardCheck,
} from "lucide-react";
import { UserAvatar } from "../features/dashboard/dashboardWidgets";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SearchableSelect } from "../components/ui/searchable-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import ThreatCard from "../components/ThreatCard";
import RiskBadge from "../components/RiskBadge";
import BackButton from "../components/BackButton";
import { Skeleton } from "../components/ui/skeleton";
import { VirtualList } from "../components/ui/VirtualList";
import { useIsMobile } from "../hooks/useIsMobile";
import { useCapabilities } from "../core/performance";
import { translateEnum } from "../lib/translateEnum";

const OBSERVATIONS_REFETCH_MS = 30_000;

const STATUS_LABEL_KEYS = {
  Observation: "observations.statusObservation",
  Assessment: "observations.statusAssessment",
  Planning: "observations.statusPlanning",
  Investigation: "observations.statusInvestigation",
  Action: "observations.statusAction",
  Mitigated: "observations.statusMitigated",
  Learning: "observations.statusLearning",
};

// Status options aligned with the Observation Workspace process-journey model.
// Stages: Observation → Assessment → Planning → Investigation → Action → Mitigated → Learning
const STATUS_OPTIONS = [
  { value: "Observation",   color: "bg-blue-500",    textColor: "text-blue-700",    bgColor: "bg-blue-100" },
  { value: "Assessment",    color: "bg-cyan-500",    textColor: "text-cyan-700",    bgColor: "bg-cyan-100" },
  { value: "Planning",      color: "bg-purple-500",  textColor: "text-purple-700",  bgColor: "bg-purple-100" },
  { value: "Investigation", color: "bg-indigo-500",  textColor: "text-indigo-700",  bgColor: "bg-indigo-100" },
  { value: "Action",        color: "bg-amber-500",   textColor: "text-amber-700",   bgColor: "bg-amber-100" },
  { value: "Mitigated",     color: "bg-green-500",   textColor: "text-green-700",   bgColor: "bg-green-100" },
  { value: "Learning",      color: "bg-slate-400",   textColor: "text-slate-600",   bgColor: "bg-slate-100" },
];

// Format registration date for display
const formatRegistrationDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    // If less than 24 hours, show relative time
    if (diffHours < 24) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
    // If less than 7 days, show "X days ago"
    if (diffHours < 168) {
      return formatDistanceToNow(date, { addSuffix: true });
    }
    // Otherwise show formatted date and time
    return format(date, "MMM d, yyyy 'at' h:mm a");
  } catch {
    return null;
  }
};

// Equipment type to icon mapping
const getEquipmentIcon = (equipmentType, asset) => {
  const type = (equipmentType || "").toLowerCase();
  const assetLower = (asset || "").toLowerCase();
  
  // Check for specific equipment types
  if (type.includes("pump") || assetLower.includes("pump") || assetLower.startsWith("p-")) {
    return Droplets;
  }
  if (type.includes("compressor") || assetLower.includes("compressor") || assetLower.startsWith("c-")) {
    return Wind;
  }
  if (type.includes("heat exchanger") || assetLower.includes("hx-") || assetLower.includes("exchanger")) {
    return Thermometer;
  }
  if (type.includes("valve") || assetLower.includes("valve") || assetLower.includes("xv-")) {
    return CircleDot;
  }
  if (type.includes("turbine")) {
    return Cog;
  }
  if (type.includes("motor") || type.includes("electrical")) {
    return Zap;
  }
  if (type.includes("vessel") || type.includes("tank")) {
    return Box;
  }
  if (type.includes("pipe") || type.includes("piping")) {
    return Pipette;
  }
  if (type.includes("sensor") || type.includes("instrument")) {
    return Gauge;
  }
  if (type.includes("boiler") || type.includes("furnace") || type.includes("heater")) {
    return Flame;
  }
  
  // Default icon
  return Settings;
};

function getSubmitterName(threat) {
  return threat?.owner_name || threat?.creator_name || null;
}

function ThreatSubmitter({ threat }) {
  const name = getSubmitterName(threat);
  if (!name) return null;

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0"
      data-testid={`threat-submitter-${threat.id}`}
    >
      <UserAvatar
        name={name}
        photo={threat.creator_photo}
        initials={threat.creator_initials}
        size="xs"
      />
      <span className="truncate max-w-[10rem]">{name}</span>
    </span>
  );
}

const ThreatsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();
  const getStatusLabel = (status) => {
    if (!status) return status;
    const key = STATUS_LABEL_KEYS[status];
    if (key) return t(key);
    return translateEnum(t, status);
  };
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isIOSLike = isIOSLikeDevice();
  const touchMobile = isTouchMobileDevice();
  const caps = useCapabilities();
  const canReadObservations = hasPermission("observations", "read");
  const [searchParams, setSearchParams] = useSearchParams();
  // Default: show the 5 active in-progress stages (excludes terminal Mitigated & Learning)
  const [statusFilter, setStatusFilter] = useState([
    "Observation", "Assessment", "Planning", "Investigation", "Action",
  ]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false); // Mobile sort dropdown
  const [riskFilter, setRiskFilter] = useState("all"); // Filter by risk level
  const [sortBy, setSortBy] = useState("latest"); // Default: newest observations on top
  const [searchQuery, setSearchQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState(""); // Display name for the filter
  const [assetsToFilter, setAssetsToFilter] = useState([]); // Array of asset names to filter by
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [threatToDelete, setThreatToDelete] = useState(null);
  const [deleteOptions, setDeleteOptions] = useState({ deleteActions: false, deleteInvestigations: false });
  
  // Permission checks
  const canWrite = hasPermission("observations", "write");
  const canDelete = hasPermission("observations", "delete");
  const canOpenSupervisor = hasPermission("supervisor_command_center", "read");

  // Toggle status in multi-select
  const toggleStatus = (status) => {
    setStatusFilter(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  // Clear all status filters
  const clearStatusFilter = () => {
    setStatusFilter([]);
  };

  // Get status display text
  const getStatusDisplayText = () => {
    if (statusFilter.length === 0) return t("observations.allStatus");
    if (statusFilter.length === 1) return getStatusLabel(statusFilter[0]);
    return t("observations.selectedCount", { count: statusFilter.length });
  };

  // Initialize filters from URL params
  useEffect(() => {
    // Support both old 'asset' param (single) and new 'assets' param (multiple)
    const singleAsset = searchParams.get("asset");
    const multipleAssets = searchParams.get("assets");
    const displayName = searchParams.get("assetName");
    
    if (multipleAssets) {
      const assetList = multipleAssets.split(',').map(a => a.trim()).filter(Boolean);
      setAssetsToFilter(assetList);
      setAssetFilter(displayName || assetList[0] || "");
      // Don't set search query - let the filter handle it
    } else if (singleAsset) {
      setAssetsToFilter([singleAsset]);
      setAssetFilter(singleAsset);
      setSearchQuery(singleAsset);
    }
  }, [searchParams]);

  // Clear asset filter
  const clearAssetFilter = () => {
    setAssetFilter("");
    setAssetsToFilter([]);
    setSearchQuery("");
    setSearchParams({});
  };

  // Fetch stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: queryKeys.stats.all(),
    queryFn: statsAPI.get,
    enabled: !permissionsLoading && canReadObservations,
  });

  // Fetch threats (fetch all, filter client-side for multi-select)
  const { data: rawThreats = [], isLoading, error: threatsError, isFetching, refetch: refetchThreats } = useQuery({
    queryKey: [...queryKeys.threats.all(), language],
    queryFn: async () => {
      const result = await threatsAPI.getAll(null, { language });
      // Ensure we always return an array
      if (!result || !Array.isArray(result)) {
        console.warn("Threats API returned non-array:", result);
        return [];
      }
      return result;
    },
    enabled: !permissionsLoading && canReadObservations,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 3, // Retry 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
    refetchOnWindowFocus: true,
    refetchInterval: OBSERVATIONS_REFETCH_MS,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData, // Keep previous data while refetching
  });

  const isListLoading = permissionsLoading || (isLoading && rawThreats.length === 0);

  const handleRefreshList = () => {
    refetchThreats();
    refetchStats();
  };

  // Apply translations based on current language
  const threats = rawThreats;

  const displayAssetName = (threat) => threat?.asset_display || threat?.asset || "";
  const displayFailureMode = (threat) => threat?.failure_mode_display || threat?.failure_mode || "";
  const displayThreatTitle = (threat) =>
    buildObservationDisplayTitle({
      equipment:
        displayAssetName(threat) || threat?.equipment_name || threat?.equipment_type || "",
      failureMode: displayFailureMode(threat),
      title: threat?.title || "",
    });
  
  // Trigger push notifications for high-severity observations
  useNotificationTriggers({
    observations: threats || [],
    tasks: [],
    actions: [],
    enabled: !!user,
  });

  // Prefetch the top workspace when idle (desktop only).
  useEffect(() => {
    if (!threats?.length || isMobile) return;

    const sortedThreats = [...threats].sort((a, b) => {
      if (sortBy === "rpn") {
        return (b.rpn || b.risk_priority_number || 0) - (a.rpn || a.risk_priority_number || 0);
      }
      if (sortBy === "latest") {
        return new Date(b?.created_at || 0) - new Date(a?.created_at || 0);
      }
      if (sortBy === "oldest") {
        return new Date(a?.created_at || 0) - new Date(b?.created_at || 0);
      }
      return (b.risk_score || 0) - (a.risk_score || 0);
    });

    const topThreat = sortedThreats[0];
    if (!topThreat?.id) return undefined;

    return prefetchTopObservationWhenIdle(queryClient, topThreat.id, language);
  }, [threats, sortBy, queryClient, isMobile, language]);
  
  // Log error if fetch fails - only show toast once
  const [errorShown, setErrorShown] = useState(false);
  useEffect(() => {
    if (threatsError && !errorShown) {
      console.error("Failed to fetch observations:", threatsError);
      if (threatsError.response?.status === 503) {
        toast.error(t("observations.serverUnavailableRetry"));
      } else if (threatsError.response?.status !== 401) {
        toast.error(t("observations.loadFailedRefresh"));
      }
      setErrorShown(true);
    }
    // Reset error shown when error clears
    if (!threatsError) {
      setErrorShown(false);
    }
  }, [threatsError, errorShown]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: ({ id, options }) => threatsAPI.delete(id, options),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
      queryClient.invalidateQueries({ queryKey: queryKeys.equipmentHistory.all() });
      const actionsDeleted = result?.deleted_actions || 0;
      const investigationsDeleted = result?.deleted_investigations || 0;
      let msg = t("observations.deletedSuccess");
      if (actionsDeleted > 0 || investigationsDeleted > 0) {
        const parts = [];
        if (investigationsDeleted > 0) parts.push(`${investigationsDeleted} investigation(s)`);
        if (actionsDeleted > 0) parts.push(`${actionsDeleted} action(s)`);
        msg = t("observations.deletedWithRelated", { details: parts.join(", ") });
      }
      toast.success(msg);
      setDeleteDialogOpen(false);
      setThreatToDelete(null);
      setDeleteOptions({ deleteActions: false, deleteInvestigations: false });
    },
    onError: () => {
      toast.error(t("observations.deleteFailed"));
    },
  });

  const handleDeleteClick = (e, threat) => {
    e.stopPropagation(); // Prevent navigation to detail page
    setThreatToDelete(threat);
    setDeleteOptions({ deleteActions: false, deleteInvestigations: false });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (threatToDelete) {
      deleteMutation.mutate({ id: threatToDelete.id, options: deleteOptions });
    }
  };

  // Filter threats by search query, asset hierarchy, status, and risk level
  const filteredThreats = (threats || []).filter((threat) => {
    if (!threat) return false;
    
    // First check if we have a hierarchical asset filter
    if (assetsToFilter.length > 0) {
      // Check if threat's asset matches any of the assets in the hierarchy
      const threatAsset = (threat.asset || "").toLowerCase();
      const assetMatches = assetsToFilter.some(filterAsset => 
        threatAsset === filterAsset.toLowerCase() ||
        threatAsset.includes(filterAsset.toLowerCase())
      );
      if (!assetMatches) return false;
    }
    
    // Apply status filter (multi-select)
    if (statusFilter.length > 0) {
      if (!statusFilter.includes(threat.status)) return false;
    }
    
    // Apply risk level filter
    if (riskFilter !== "all") {
      if (threat.risk_level !== riskFilter) return false;
    }
    
    // Then apply search query filter if present
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase().trim();
    
    // Get score values as strings for searching
    const riskScore = threat.risk_score?.toString() || "";
    const rpn = (threat.fmea_rpn || threat.rpn || threat.failure_mode_data?.rpn || "").toString();
    
    return (
      (threat.title || "").toLowerCase().includes(query) ||
      (threat.asset || "").toLowerCase().includes(query) ||
      (threat.equipment_type || "").toLowerCase().includes(query) ||
      (threat.failure_mode || "").toLowerCase().includes(query) ||
      riskScore.includes(query) ||
      rpn.includes(query)
    );
  });

  // Sort threats based on selected sort method
  const sortedThreats = useMemo(() => {
    if (!Array.isArray(filteredThreats) || filteredThreats.length === 0) return [];
    return [...filteredThreats].sort((a, b) => {
      if (sortBy === "rpn") {
        const rpnA = a?.fmea_rpn || a?.rpn || a?.failure_mode_data?.rpn || 0;
        const rpnB = b?.fmea_rpn || b?.rpn || b?.failure_mode_data?.rpn || 0;
        return rpnB - rpnA;
      }
      if (sortBy === "latest") {
        const dateA = new Date(a?.created_at || 0);
        const dateB = new Date(b?.created_at || 0);
        return dateB - dateA;
      }
      if (sortBy === "oldest") {
        const dateA = new Date(a?.created_at || 0);
        const dateB = new Date(b?.created_at || 0);
        return dateA - dateB;
      }
      return (b?.risk_score || 0) - (a?.risk_score || 0);
    });
  }, [filteredThreats, sortBy]);

  const displayThreats = useMemo(() => sortedThreats.slice(0, caps.maxListItems), [sortedThreats, caps.maxListItems]);
  const threatsTruncated = Array.isArray(sortedThreats) && sortedThreats.length > caps.maxListItems;
  const useVirtualThreatList =
    !touchMobile && ((isMobile && !isIOSLike) || caps.mode === "lite");

  const mobileListBadge = useMemo(
    () => (
      <>
        <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs font-medium">
          {displayThreats.length}
          {threatsTruncated ? "+" : ""}
        </span>
        {(stats?.critical_count || 0) > 0 && (
          <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-medium">
            {t("observations.criticalCount", { count: stats?.critical_count })}
          </span>
        )}
      </>
    ),
    [displayThreats.length, threatsTruncated, stats?.critical_count, t],
  );
  useMobilePageBadge(mobileListBadge);

  const statCards = [
    {
      label: t("observations.totalObservations"),
      value: stats?.total_threats || 0,
      icon: AlertTriangle,
      color: "text-slate-600",
      bg: "bg-slate-100",
    },
    {
      label: t("observations.openObservations"),
      value: stats?.open_threats || 0,
      icon: Clock,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: t("common.critical"),
      value: stats?.critical_count || 0,
      icon: TrendingUp,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: t("observations.highPriority"),
      value: stats?.high_count || 0,
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  return (
    <div className="app-page-shell" data-testid="threats-page">
      {/* Fixed Header Section */}
      <div className="app-page-header-band">
        {/* Back Button - shown when navigated from another page */}
        {location.state?.from && (
          <div className="mb-3 hidden sm:block">
            <BackButton />
          </div>
        )}
        
        {/* Header - desktop only; mobile title + badge live in NavigationBreadcrumb */}
        <div className="hidden sm:flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">{t("observations.title")}</h1>
            <p className="text-xs text-slate-500">{t("observations.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleRefreshList}
              disabled={isFetching}
              aria-label={t("observations.refresh")}
              title={t("observations.refreshTooltip")}
              data-testid="observations-refresh-button"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            {canOpenSupervisor && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => navigate("/supervisor")}
                aria-label="Supervisor Command Center"
                title="Supervisor Command Center"
                data-testid="observations-supervisor-button"
              >
                <ClipboardCheck className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Compact Stats Row - Desktop only */}
        <div className="hidden sm:flex flex-wrap gap-2 mb-3">
          {statCards.map((stat, idx) => (
            <div
              key={stat.label}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200"
              data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className={`p-1.5 rounded-md ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <span className="text-lg font-bold text-slate-900">{stat.value}</span>
              <span className="text-xs text-slate-500">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Asset Filter Banner - Compact on mobile */}
        {assetFilter && (
          <div className="flex items-center gap-2 mb-3 sm:mb-4 px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
            <span className="text-xs sm:text-sm text-blue-700 truncate">
              <strong className="hidden sm:inline">{t("observations.showingFor")} </strong>
              <strong>{assetFilter}</strong>
              {assetsToFilter.length > 1 && (
                <span className="ml-1 text-blue-500">
                  (+{assetsToFilter.length - 1})
                </span>
              )}
            </span>
            <button 
              onClick={clearAssetFilter}
              className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium flex-shrink-0"
            >
              {t("common.clear")}
            </button>
          </div>
        )}

        {/* Filters - Mobile Optimized */}
        <div className="flex items-center gap-2 mb-2" data-testid="threats-filters">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={t("observations.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
            data-testid="search-threats-input"
          />
        </div>
        
        {/* Multi-select Status Filter */}
        <div className="relative">
          {/* Click outside to close dropdown */}
          {statusDropdownOpen && (
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setStatusDropdownOpen(false)}
            />
          )}
          
          <button
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className="flex items-center justify-between w-[96px] sm:w-40 h-9 px-2 sm:px-3 bg-white border border-slate-200 rounded-md text-xs sm:text-sm hover:bg-slate-50 transition-colors min-w-0 overflow-hidden"
            data-testid="status-filter-select"
          >
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className={`truncate min-w-0 ${statusFilter.length > 0 ? "text-slate-900" : "text-slate-500"}`}>
                {statusFilter.length === 0 ? t("observations.status") : statusFilter.length === 1 ? getStatusLabel(statusFilter[0]) : `${statusFilter.length} ${t("observations.selected")}`}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ml-0.5 ${statusDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {statusDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 w-48 sm:w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
              {/* Clear All Option */}
              {statusFilter.length > 0 && (
                <button
                  onClick={clearStatusFilter}
                  className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 border-b border-slate-100"
                >
                  {t("observations.clearAllFilters")}
                </button>
              )}
              
              {/* Status Options */}
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status.value}
                  onClick={() => toggleStatus(status.value)}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  data-testid={`status-option-${status.value}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${status.color}`}></span>
                    <span className="text-sm text-slate-700">{getStatusLabel(status.value)}</span>
                  </div>
                  {statusFilter.includes(status.value) && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Mobile Sort Button */}
        <div className="relative sm:hidden">
          {/* Click outside to close dropdown */}
          {sortDropdownOpen && (
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setSortDropdownOpen(false)}
            />
          )}
          
          <button
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className="flex items-center justify-center w-9 h-9 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            data-testid="mobile-sort-button"
            aria-label={t("observations.sort")}
          >
            <ArrowUpDown className={`w-4 h-4 ${sortBy === 'latest' ? 'text-blue-600' : 'text-slate-400'}`} />
          </button>
          
          {sortDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
              <button
                onClick={() => { setSortBy("latest"); setSortDropdownOpen(false); }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-sm text-slate-700">{t("observations.latestFirst")}</span>
                </div>
                {sortBy === "latest" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
              <button
                onClick={() => { setSortBy("oldest"); setSortDropdownOpen(false); }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-700">{t("observations.oldestFirst")}</span>
                </div>
                {sortBy === "oldest" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
              <button
                onClick={() => { setSortBy("business_risk"); setSortDropdownOpen(false); }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-sm text-slate-700">{t("observations.businessRisk")}</span>
                </div>
                {sortBy === "business_risk" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
              <button
                onClick={() => { setSortBy("rpn"); setSortDropdownOpen(false); }}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-sm text-slate-700">{t("observations.rpnFmea")}</span>
                </div>
                {sortBy === "rpn" && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            </div>
          )}
        </div>
        
        {/* Risk Level Filter - Hidden on mobile */}
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="hidden sm:flex w-36 h-9 text-sm" data-testid="risk-filter-select">
            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-slate-400" />
            <SelectValue placeholder={t("observations.risk")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("observations.allRisks")}</SelectItem>
            <SelectItem value="Critical">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                {t("observations.riskCritical")}
              </span>
            </SelectItem>
            <SelectItem value="High">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                {t("observations.riskHigh")}
              </span>
            </SelectItem>
            <SelectItem value="Medium">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                {t("observations.riskMedium")}
              </span>
            </SelectItem>
            <SelectItem value="Low">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                {t("observations.riskLow")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        
        {/* Sort By Filter - Hidden on mobile */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="hidden sm:flex w-40 h-9 text-sm" data-testid="sort-by-select">
            <BarChart3 className="w-3.5 h-3.5 mr-1 text-slate-400" />
            <SelectValue placeholder={t("observations.sort")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="business_risk">
              <span className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-purple-500" />
                {t("observations.businessRisk")}
              </span>
            </SelectItem>
            <SelectItem value="rpn">
              <span className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                {t("observations.rpnFmea")}
              </span>
            </SelectItem>
            <SelectItem value="latest">
              <span className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-green-500" />
                {t("observations.latestFirst")}
              </span>
            </SelectItem>
            <SelectItem value="oldest">
              <span className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {t("observations.oldestFirst")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      </div>

      {/* Scrollable Content Area */}
      <div
        className={`flex-1 min-h-0 pb-4 app-page-content-band ${
          useVirtualThreatList ? "flex flex-col overflow-hidden" : "app-page-scroll mobile-scroll-pane"
        }`}
        data-testid="observations-list-scroll"
      >
        <div className={`max-w-7xl mx-auto w-full ${useVirtualThreatList ? "flex-1 min-h-0 flex flex-col" : ""}`}>
          {threatsError && !isListLoading && (
            <div
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="alert"
              data-testid="threats-load-error"
            >
              <p className="font-medium">{t("observations.loadErrorTitle")}</p>
              <p className="mt-1 text-amber-800/90">
                {t("observations.loadErrorHint")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 border-amber-300 bg-white hover:bg-amber-100"
                onClick={() => {
                  setErrorShown(false);
                  handleRefreshList();
                }}
              >
                {t("observations.retry")}
              </Button>
            </div>
          )}
          {/* Threats List */}
          {isListLoading ? (
        <div className="py-6 space-y-3" data-testid="threats-skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-72 rounded" />
                  <Skeleton className="h-3 w-96 rounded" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : !Array.isArray(displayThreats) || displayThreats.length === 0 ? (
        <div className="empty-state py-16" data-testid="no-threats-message">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-700 mb-2">{t("observations.noObservations")}</h3>
          <p className="text-slate-500">
            {searchQuery
              ? t("common.noResults")
              : t("observations.noObservationsDesc")}
          </p>
          {isFetching && (
            <p className="text-sm text-blue-500 mt-2">{t("observations.loadingObservations")}</p>
          )}
        </div>
      ) : (
        <div className={`priority-list ${useVirtualThreatList ? "flex-1 min-h-0 flex flex-col" : ""}`} data-testid="threats-list">
          {threatsTruncated && (
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("observations.listTruncated", { count: caps.maxListItems })}
              {" "}{t("observations.listTruncatedHint")}
            </div>
          )}
          {useVirtualThreatList ? (
            <VirtualList
              className="flex-1 min-h-0"
              data={displayThreats}
              itemContent={(idx, threat) => {
                const EquipmentIcon = getEquipmentIcon(threat.equipment_type, threat.asset);
                const rpnValue = threat.fmea_rpn || threat.rpn || threat.failure_mode_data?.rpn || null;

                const handleMouseEnter = () => {
                  schedulePrefetchObservationWorkspace(queryClient, threat.id, language);
                };
                const handleMouseLeave = () => {
                  cancelPrefetchObservationWorkspace(threat.id, language);
                };

                return (
                  <motion.div
                    key={threat.id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0 }}
                    onClick={() => navigate(`/threats/${threat.id}/workspace`)}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    className={`priority-item group relative ${
                      threat.status === "Mitigated" || threat.status === "Learning" 
                        ? "sm:opacity-100 border-l-4 " + (threat.status === "Mitigated" ? "border-l-green-500 bg-green-50/30" : "border-l-slate-400 bg-slate-50/50")
                        : ""
                    }`}
                    data-testid={`threat-item-${threat.id}`}
                  >
                    {(threat.status === "Mitigated" || threat.status === "Learning") && (
                      <div className="sm:hidden absolute top-2 right-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          threat.status === "Mitigated" 
                            ? "bg-green-100 text-green-700" 
                            : "bg-slate-200 text-slate-600"
                        }`}>
                          {threat.status === "Mitigated" ? "✓" : "—"} {getStatusLabel(threat.status)}
                        </span>
                      </div>
                    )}

                    <div className={`hidden sm:flex flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl items-center justify-center ${
                      threat.risk_level === "Critical" ? "bg-red-50" :
                      threat.risk_level === "High" ? "bg-orange-50" :
                      threat.risk_level === "Medium" ? "bg-yellow-50" :
                      "bg-green-50"
                    }`}>
                      <EquipmentIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${
                        threat.risk_level === "Critical" ? "text-red-600" :
                        threat.risk_level === "High" ? "text-orange-600" :
                        threat.risk_level === "Medium" ? "text-yellow-600" :
                        "text-green-600"
                      }`} />
                    </div>

                    <div className="priority-rank text-sm sm:text-base hidden sm:block" data-testid={`threat-rank-${threat.id}`}>
                      #{idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-2 sm:line-clamp-1 mb-0.5">
                        {displayThreatTitle(threat)}
                      </h3>
                      {threat.equipment_tag && (
                        <div className="text-xs text-slate-400 font-mono mb-1">{threat.equipment_tag}</div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="hidden sm:inline">
                          <RiskBadge level={threat.risk_level} size="sm" />
                        </span>
                        <span className="text-xs sm:text-sm text-slate-500 truncate">
                          <span className="sm:hidden">{threat.equipment_name || displayAssetName(threat)}</span>
                          <span className="hidden sm:inline">{displayAssetName(threat)}</span>
                        </span>
                        {/* Registration Date */}
                        {threat.created_at && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span className="hidden sm:inline">{formatRegistrationDate(threat.created_at)}</span>
                            <span className="sm:hidden">{formatRegistrationDate(threat.created_at)}</span>
                          </span>
                        )}
                        <ThreatSubmitter threat={threat} />
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-4">
                      {typeof threat.business_risk_score === "number" && (
                        <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span className="tabular-nums font-semibold text-slate-700">{Math.round(threat.business_risk_score)}</span>
                        </div>
                      )}
                      {rpnValue != null && (
                        <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span className="tabular-nums font-semibold text-slate-700">{rpnValue}</span>
                        </div>
                      )}
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                    </div>
                  </motion.div>
                );
              }}
            />
          ) : (
          displayThreats.map((threat, idx) => {
            const EquipmentIcon = getEquipmentIcon(threat.equipment_type, threat.asset);
            const rpnValue = threat.fmea_rpn || threat.rpn || threat.failure_mode_data?.rpn || null;
            
            const handleMouseEnter = () => {
              schedulePrefetchObservationWorkspace(queryClient, threat.id, language);
            };
            const handleMouseLeave = () => {
              cancelPrefetchObservationWorkspace(threat.id, language);
            };
            
            return (
            <motion.div
              key={threat.id}
              initial={!touchMobile && caps.animations ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={!touchMobile && caps.animations ? { delay: Math.min(idx * 0.05, 0.2) } : { duration: 0 }}
              onClick={() => navigate(`/threats/${threat.id}/workspace`)}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className={`priority-item group relative ${
                threat.status === "Mitigated" || threat.status === "Learning" 
                  ? "sm:opacity-100 border-l-4 " + (threat.status === "Mitigated" ? "border-l-green-500 bg-green-50/30" : "border-l-slate-400 bg-slate-50/50")
                  : ""
              }`}
              data-testid={`threat-item-${threat.id}`}
            >
              {/* Mobile Status Indicator - Only visible on mobile for Mitigated/Learning */}
              {(threat.status === "Mitigated" || threat.status === "Learning") && (
                <div className="sm:hidden absolute top-2 right-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    threat.status === "Mitigated" 
                      ? "bg-green-100 text-green-700" 
                      : "bg-slate-200 text-slate-600"
                  }`}>
                    {threat.status === "Mitigated" ? "✓" : "—"} {getStatusLabel(threat.status)}
                  </span>
                </div>
              )}
              
              {/* Equipment Icon — desktop only; mobile uses full width for title/metadata */}
              <div className={`hidden sm:flex flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl items-center justify-center ${
                threat.risk_level === "Critical" ? "bg-red-50" :
                threat.risk_level === "High" ? "bg-orange-50" :
                threat.risk_level === "Medium" ? "bg-yellow-50" :
                "bg-green-50"
              }`}>
                <EquipmentIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${
                  threat.risk_level === "Critical" ? "text-red-600" :
                  threat.risk_level === "High" ? "text-orange-600" :
                  threat.risk_level === "Medium" ? "text-yellow-600" :
                  "text-green-600"
                }`} />
              </div>

              {/* Rank - Hidden on mobile */}
              <div className="priority-rank text-sm sm:text-base hidden sm:block" data-testid={`threat-rank-${threat.id}`}>
                #{idx + 1}
              </div>
              
              <div className="flex-1 min-w-0">
                {/* Mobile: Show failure mode as header, Desktop: Show title */}
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-2 sm:line-clamp-1 mb-0.5">
                  {displayThreatTitle(threat)}
                </h3>
                {/* Tag displayed under title */}
                {threat.equipment_tag && (
                  <div className="text-xs text-slate-400 font-mono mb-1">{threat.equipment_tag}</div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Risk Badge - Hidden on mobile */}
                  <span className="hidden sm:inline">
                    <RiskBadge level={threat.risk_level} size="sm" />
                  </span>
                  {/* Mobile: Show equipment, Desktop: Show asset */}
                  <span className="text-xs sm:text-sm text-slate-500 truncate">
                    <span className="sm:hidden">{displayAssetName(threat) || threat.title}</span>
                    <span className="hidden sm:inline">{displayAssetName(threat)}</span>
                  </span>
                  {/* Registration Date */}
                  {threat.created_at && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span className="hidden sm:inline">{formatRegistrationDate(threat.created_at)}</span>
                      <span className="sm:hidden">{formatRegistrationDate(threat.created_at)}</span>
                    </span>
                  )}
                  <ThreatSubmitter threat={threat} />
                </div>
              </div>

              {/* Score Display - Stacked on mobile, side-by-side on desktop */}
              <div className="flex sm:flex-row flex-col items-end sm:items-center gap-1 sm:gap-6 flex-shrink-0">
                {/* Business Risk Score */}
                <div className="flex sm:flex-col items-center sm:items-center gap-1.5 sm:gap-0 w-auto sm:w-16">
                  <div className="text-[10px] text-slate-400 sm:mb-0.5">{t("observations.score")}</div>
                  <div className="text-sm sm:text-lg font-bold text-slate-700 tabular-nums">
                    {threat.risk_score}
                  </div>
                </div>
                
                {/* RPN */}
                <div className="flex sm:flex-col items-center sm:items-center gap-1.5 sm:gap-0 w-auto sm:w-16">
                  <div className="text-[10px] text-slate-400 sm:mb-0.5">{t("observations.rpn")}</div>
                  {rpnValue ? (
                    <div className={`text-sm sm:text-lg font-bold tabular-nums ${
                      rpnValue >= 300 ? "text-red-600" :
                      rpnValue >= 200 ? "text-orange-600" :
                      rpnValue >= 100 ? "text-yellow-600" :
                      "text-green-600"
                    }`}>
                      {rpnValue}
                    </div>
                  ) : (
                    <div className="text-sm sm:text-lg text-slate-300">—</div>
                  )}
                </div>
                
                {/* Actions Count - Hidden on mobile */}
                <div className="text-center hidden sm:block w-16">
                  <div className="text-xs text-slate-400 mb-0.5">{t("observations.actions")}</div>
                  <div className="text-lg font-bold text-slate-700 tabular-nums">
                    {threat.action_plan_count ?? 0}
                  </div>
                </div>

                {/* Status Badge - Hidden on mobile */}
                <div className="hidden sm:block w-20">
                  {(() => {
                    const statusConfig = STATUS_OPTIONS.find(s => s.value === threat.status) || 
                      { bgColor: "bg-slate-100", textColor: "text-slate-600" };
                    const statusLabel = getStatusLabel(threat.status);
                    return (
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                        {statusLabel}
                      </span>
                    );
                  })()}
                </div>

                {/* Delete Button - only show if user has delete permission */}
                {canDelete && (
                <button
                  onClick={(e) => handleDeleteClick(e, threat)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete observation"
                  data-testid={`delete-threat-${threat.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                )}
              </div>
            </motion.div>
            );
          })
          )}
        </div>
      )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { 
        setDeleteDialogOpen(open); 
        if (!open) setDeleteOptions({ deleteActions: false, deleteInvestigations: false });
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Observation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{threatToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-3">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input 
                type="checkbox" 
                checked={deleteOptions.deleteInvestigations}
                onChange={(e) => setDeleteOptions(prev => ({ ...prev, deleteInvestigations: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <div>
                <div className="font-medium text-slate-900">Also delete linked Investigations</div>
                <div className="text-sm text-slate-500">Remove all Causal Investigations started from this observation</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input 
                type="checkbox" 
                checked={deleteOptions.deleteActions}
                onChange={(e) => setDeleteOptions(prev => ({ ...prev, deleteActions: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <div>
                <div className="font-medium text-slate-900">Also delete linked Actions</div>
                <div className="text-sm text-slate-500">Remove all Central Actions created from this observation{deleteOptions.deleteInvestigations ? ' and its investigations' : ''}</div>
              </div>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ThreatsPage;
