import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { threatsAPI, statsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { motion } from "framer-motion";
import { toast } from "sonner";
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
  ChevronDown
} from "lucide-react";
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

// Status options with colors and icons
const STATUS_OPTIONS = [
  { value: "Open", label: "Open", color: "bg-blue-500", textColor: "text-blue-700", bgColor: "bg-blue-100" },
  { value: "In Progress", label: "In Progress", color: "bg-amber-500", textColor: "text-amber-700", bgColor: "bg-amber-100" },
  { value: "Parked", label: "Parked", color: "bg-slate-500", textColor: "text-slate-700", bgColor: "bg-slate-100" },
  { value: "Mitigated", label: "Mitigated", color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-100" },
  { value: "Closed", label: "Closed", color: "bg-slate-400", textColor: "text-slate-600", bgColor: "bg-slate-50" },
  { value: "Canceled", label: "Canceled", color: "bg-red-400", textColor: "text-red-700", bgColor: "bg-red-50" },
];

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

const ThreatsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState([]); // Multi-select: array of selected statuses
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [riskFilter, setRiskFilter] = useState("all"); // Filter by risk level
  const [sortBy, setSortBy] = useState("business_risk"); // "business_risk" or "rpn"
  const [searchQuery, setSearchQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState(""); // Display name for the filter
  const [assetsToFilter, setAssetsToFilter] = useState([]); // Array of asset names to filter by
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [threatToDelete, setThreatToDelete] = useState(null);
  const [deleteOptions, setDeleteOptions] = useState({ deleteActions: false, deleteInvestigations: false });
  
  // Permission checks
  const canWrite = hasPermission("observations", "write");
  const canDelete = hasPermission("observations", "delete");

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
    if (statusFilter.length === 0) return "All Status";
    if (statusFilter.length === 1) return statusFilter[0];
    return `${statusFilter.length} selected`;
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
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: statsAPI.get,
  });

  // Fetch threats (fetch all, filter client-side for multi-select)
  const { data: threats = [], isLoading, error: threatsError, isFetching } = useQuery({
    queryKey: ["threats"],
    queryFn: async () => {
      const result = await threatsAPI.getAll(null);
      // Ensure we always return an array
      if (!result || !Array.isArray(result)) {
        console.warn("Threats API returned non-array:", result);
        return [];
      }
      return result;
    },
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes (reduced refetches)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 3, // Retry 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchInterval: false, // Disable automatic background refetching
    placeholderData: (previousData) => previousData, // Keep previous data while refetching
  });
  
  // Log error if fetch fails - only show toast once
  const [errorShown, setErrorShown] = useState(false);
  useEffect(() => {
    if (threatsError && !errorShown) {
      console.error("Failed to fetch observations:", threatsError);
      // Check if it's an auth error
      if (threatsError.response?.status === 401) {
        toast.error("Session expired. Please log in again.");
        // Redirect to login
        window.location.href = "/login";
      } else if (threatsError.response?.status === 503) {
        toast.error("Server temporarily unavailable. Retrying...");
      } else {
        toast.error("Failed to load observations. Please refresh the page.");
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
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["investigations"] });
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
      queryClient.invalidateQueries({ queryKey: ["equipmentHistory"] });
      const actionsDeleted = result?.deleted_actions || 0;
      const investigationsDeleted = result?.deleted_investigations || 0;
      let msg = "Observation deleted successfully";
      if (actionsDeleted > 0 || investigationsDeleted > 0) {
        const parts = [];
        if (investigationsDeleted > 0) parts.push(`${investigationsDeleted} investigation(s)`);
        if (actionsDeleted > 0) parts.push(`${actionsDeleted} action(s)`);
        msg += ` (${parts.join(', ')} also removed)`;
      }
      toast.success(msg);
      setDeleteDialogOpen(false);
      setThreatToDelete(null);
      setDeleteOptions({ deleteActions: false, deleteInvestigations: false });
    },
    onError: () => {
      toast.error("Failed to delete observation");
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
  const sortedThreats = Array.isArray(filteredThreats) && filteredThreats.length > 0 
    ? [...filteredThreats].sort((a, b) => {
        if (sortBy === "rpn") {
          // Sort by RPN (higher first), fall back to risk_score if no RPN
          const rpnA = a?.fmea_rpn || a?.rpn || a?.failure_mode_data?.rpn || 0;
          const rpnB = b?.fmea_rpn || b?.rpn || b?.failure_mode_data?.rpn || 0;
          return rpnB - rpnA;
        } else {
          // Default: sort by business risk score (higher first)
          return (b?.risk_score || 0) - (a?.risk_score || 0);
        }
      })
    : [];

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
    <div className="h-[calc(100vh-64px)] flex flex-col" data-testid="threats-page">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 max-w-7xl mx-auto w-full">
        {/* Back Button - shown when navigated from another page */}
        {location.state?.from && (
          <div className="mb-3">
            <BackButton />
          </div>
        )}
        
        {/* Header - Mobile Optimized */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">{t("observations.title")}</h1>
            <p className="text-xs text-slate-500 hidden sm:block">{t("observations.subtitle")}</p>
          </div>
          {/* Mobile: Inline stats */}
          <div className="flex sm:hidden items-center gap-2 text-xs">
            <span className="bg-slate-100 px-2 py-0.5 rounded-full font-medium">{stats?.total || 0}</span>
            {(stats?.critical_count || 0) > 0 && (
              <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{stats?.critical_count} critical</span>
            )}
          </div>
        </div>
        
        {/* Compact Stats Row - Desktop only */}
        <div className="hidden sm:flex flex-wrap gap-3 mb-4">
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
              <strong className="hidden sm:inline">Showing threats for: </strong>
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
              Clear
            </button>
          </div>
        )}

        {/* Filters - Mobile Optimized */}
        <div className="flex items-center gap-2 mb-2" data-testid="threats-filters">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search..."
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
            className="flex items-center justify-between w-[90px] sm:w-40 h-9 px-2 sm:px-3 bg-white border border-slate-200 rounded-md text-xs sm:text-sm hover:bg-slate-50 transition-colors"
            data-testid="status-filter-select"
          >
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className={`truncate ${statusFilter.length > 0 ? "text-slate-900" : "text-slate-500"}`}>
                {statusFilter.length === 0 ? "Status" : statusFilter.length === 1 ? statusFilter[0] : `${statusFilter.length} sel`}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${statusDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {statusDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 sm:w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
              {/* Clear All Option */}
              {statusFilter.length > 0 && (
                <button
                  onClick={clearStatusFilter}
                  className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 border-b border-slate-100"
                >
                  Clear all filters
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
                    <span className="text-sm text-slate-700">{status.label}</span>
                  </div>
                  {statusFilter.includes(status.value) && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Risk Level Filter - Hidden on mobile */}
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="hidden sm:flex w-36 h-9 text-sm" data-testid="risk-filter-select">
            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-slate-400" />
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risks</SelectItem>
            <SelectItem value="Critical">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Critical
              </span>
            </SelectItem>
            <SelectItem value="High">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                High
              </span>
            </SelectItem>
            <SelectItem value="Medium">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                Medium
              </span>
            </SelectItem>
            <SelectItem value="Low">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Low
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        
        {/* Sort By Filter - Hidden on mobile */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="hidden sm:flex w-40 h-9 text-sm" data-testid="sort-by-select">
            <BarChart3 className="w-3.5 h-3.5 mr-1 text-slate-400" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="business_risk">
              <span className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-purple-500" />
                Business Risk
              </span>
            </SelectItem>
            <SelectItem value="rpn">
              <span className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                RPN (FMEA)
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* Threats List */}
          {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      ) : !Array.isArray(sortedThreats) || sortedThreats.length === 0 ? (
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
            <p className="text-sm text-blue-500 mt-2">Loading observations...</p>
          )}
        </div>
      ) : (
        <div className="priority-list" data-testid="threats-list">
          {sortedThreats.map((threat, idx) => {
            const EquipmentIcon = getEquipmentIcon(threat.equipment_type, threat.asset);
            const rpnValue = threat.fmea_rpn || threat.rpn || threat.failure_mode_data?.rpn || null;
            return (
            <motion.div
              key={threat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => navigate(`/threats/${threat.id}`)}
              className="priority-item group"
              data-testid={`threat-item-${threat.id}`}
            >
              {/* Equipment Icon */}
              <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${
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
                #{threat.rank}
              </div>
              
              <div className="flex-1 min-w-0">
                {/* Mobile: Show failure mode as header, Desktop: Show title */}
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-2 sm:line-clamp-1 mb-0.5">
                  <span className="sm:hidden">{threat.failure_mode || threat.title}</span>
                  <span className="hidden sm:inline">{threat.title}</span>
                </h3>
                <div className="flex items-center gap-2">
                  {/* Risk Badge - Hidden on mobile */}
                  <span className="hidden sm:inline">
                    <RiskBadge level={threat.risk_level} size="sm" />
                  </span>
                  {/* Mobile: Show equipment, Desktop: Show asset */}
                  <span className="text-xs sm:text-sm text-slate-500 truncate">
                    <span className="sm:hidden">{threat.asset || threat.title}</span>
                    <span className="hidden sm:inline">{threat.asset}</span>
                  </span>
                </div>
              </div>

              {/* Score Display - Compact on mobile, full on desktop */}
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                {/* Business Risk Score */}
                <div className="text-right">
                  <div className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">Score</div>
                  <div className="text-sm sm:text-base font-semibold text-slate-700">
                    {threat.risk_score}
                  </div>
                </div>
                
                {/* RPN - Compact on mobile */}
                <div className="text-right">
                  <div className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">RPN</div>
                  {rpnValue ? (
                    <div className={`text-sm sm:text-base font-semibold ${
                      rpnValue >= 300 ? "text-red-600" :
                      rpnValue >= 200 ? "text-orange-600" :
                      rpnValue >= 100 ? "text-yellow-600" :
                      "text-green-600"
                    }`}>
                      {rpnValue}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-300">—</div>
                  )}
                </div>
                
                {/* Actions Count - Hidden on mobile */}
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-slate-400">Actions</div>
                  <div className="text-sm sm:text-base font-semibold text-slate-700">
                    {threat.recommended_actions?.length || 0}
                  </div>
                </div>

                {/* Status Badge - Hidden on mobile */}
                <div className="hidden sm:block">
                  {(() => {
                    const statusConfig = STATUS_OPTIONS.find(s => s.value === threat.status) || 
                      { bgColor: "bg-slate-100", textColor: "text-slate-600" };
                    return (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                        {threat.status}
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
          })}
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
