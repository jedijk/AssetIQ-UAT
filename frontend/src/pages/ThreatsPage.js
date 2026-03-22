import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { threatsAPI, statsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { motion } from "framer-motion";
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
  Box
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
import ThreatCard from "../components/ThreatCard";
import RiskBadge from "../components/RiskBadge";
import BackButton from "../components/BackButton";

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
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState(""); // Display name for the filter
  const [assetsToFilter, setAssetsToFilter] = useState([]); // Array of asset names to filter by

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

  // Fetch threats
  const { data: threats = [], isLoading } = useQuery({
    queryKey: ["threats", statusFilter === "all" ? null : statusFilter],
    queryFn: () => threatsAPI.getAll(statusFilter === "all" ? null : statusFilter),
  });

  // Filter threats by search query and/or asset hierarchy
  const filteredThreats = threats.filter((threat) => {
    // First check if we have a hierarchical asset filter
    if (assetsToFilter.length > 0) {
      // Check if threat's asset matches any of the assets in the hierarchy
      const assetMatches = assetsToFilter.some(filterAsset => 
        threat.asset.toLowerCase() === filterAsset.toLowerCase() ||
        threat.asset.toLowerCase().includes(filterAsset.toLowerCase())
      );
      if (!assetMatches) return false;
    }
    
    // Then apply search query filter if present
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      threat.title.toLowerCase().includes(query) ||
      threat.asset.toLowerCase().includes(query) ||
      threat.equipment_type.toLowerCase().includes(query) ||
      threat.failure_mode.toLowerCase().includes(query)
    );
  });

  const statCards = [
    {
      label: t("threats.totalThreats"),
      value: stats?.total_threats || 0,
      icon: AlertTriangle,
      color: "text-slate-600",
      bg: "bg-slate-100",
    },
    {
      label: t("threats.openThreats"),
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
      label: t("threats.highPriority"),
      value: stats?.high_count || 0,
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-4 max-w-7xl" data-testid="threats-page">
      {/* Back Button - shown when navigated from another page */}
      {location.state?.from && (
        <div className="mb-3">
          <BackButton />
        </div>
      )}
      
      {/* Compact Stats Row */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
        {statCards.map((stat, idx) => (
          <div
            key={stat.label}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200"
            data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <div className={`p-1.5 rounded-md ${stat.bg}`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div>
              <span className="text-lg font-bold text-slate-900">{stat.value}</span>
              <span className="text-xs text-slate-500 ml-1">{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Asset Filter Banner */}
      {assetFilter && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-blue-700">
            Showing threats for: <strong>{assetFilter}</strong>
            {assetsToFilter.length > 1 && (
              <span className="ml-1 text-blue-500">
                (including {assetsToFilter.length - 1} item{assetsToFilter.length > 2 ? 's' : ''} below)
              </span>
            )}
          </span>
          <button 
            onClick={clearAssetFilter}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6" data-testid="threats-filters">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder={t("threats.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
            data-testid="search-threats-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 h-11" data-testid="status-filter-select">
            <Filter className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder={t("actionsPage.filterByStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("actionsPage.allStatus")}</SelectItem>
            <SelectItem value="Open">{t("common.open")}</SelectItem>
            <SelectItem value="Mitigated">{t("threatDetail.mitigated")}</SelectItem>
            <SelectItem value="Closed">{t("common.closed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Threats List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      ) : filteredThreats.length === 0 ? (
        <div className="empty-state py-16" data-testid="no-threats-message">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-700 mb-2">{t("threats.noThreats")}</h3>
          <p className="text-slate-500">
            {searchQuery
              ? t("common.noResults")
              : t("threats.noThreatsDesc")}
          </p>
        </div>
      ) : (
        <div className="priority-list" data-testid="threats-list">
          {filteredThreats.map((threat, idx) => {
            const EquipmentIcon = getEquipmentIcon(threat.equipment_type, threat.asset);
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

              <div className="priority-rank text-sm sm:text-base" data-testid={`threat-rank-${threat.id}`}>
                #{threat.rank}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                  <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-1">
                    {threat.title}
                  </h3>
                  <RiskBadge level={threat.risk_level} size="sm" />
                </div>
                <div className="text-xs sm:text-sm text-slate-500 line-clamp-1">
                  <span>{threat.asset}</span>
                  <span className="mx-1">•</span>
                  <span>{threat.equipment_type}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <div className="text-right">
                  <div className="text-xs sm:text-sm font-medium text-slate-700">
                    {threat.risk_score}
                  </div>
                  <div className="text-xs text-slate-400 hidden sm:block">
                    {threat.status}
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThreatsPage;
