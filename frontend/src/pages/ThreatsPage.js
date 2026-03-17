import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { threatsAPI, statsAPI } from "../lib/api";
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  // Filter threats by search query
  const filteredThreats = threats.filter((threat) => {
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
      label: "Total Threats",
      value: stats?.total_threats || 0,
      icon: AlertTriangle,
      color: "text-slate-600",
      bg: "bg-slate-100",
    },
    {
      label: "Open Threats",
      value: stats?.open_threats || 0,
      icon: Clock,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Critical",
      value: stats?.critical_count || 0,
      icon: TrendingUp,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "High Priority",
      value: stats?.high_count || 0,
      icon: AlertTriangle,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="threats-page">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="stat-card"
            data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <div className={`inline-flex p-2 rounded-lg ${stat.bg} mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6" data-testid="threats-filters">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search threats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
            data-testid="search-threats-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 h-11" data-testid="status-filter-select">
            <Filter className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Open">Open</SelectItem>
            <SelectItem value="Mitigated">Mitigated</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
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
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No threats found</h3>
          <p className="text-slate-500">
            {searchQuery
              ? "Try adjusting your search query"
              : "Click 'Report Threat' to start capturing failures"}
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
              <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
                threat.risk_level === "Critical" ? "bg-red-50" :
                threat.risk_level === "High" ? "bg-orange-50" :
                threat.risk_level === "Medium" ? "bg-yellow-50" :
                "bg-green-50"
              }`}>
                <EquipmentIcon className={`w-6 h-6 ${
                  threat.risk_level === "Critical" ? "text-red-600" :
                  threat.risk_level === "High" ? "text-orange-600" :
                  threat.risk_level === "Medium" ? "text-yellow-600" :
                  "text-green-600"
                }`} />
              </div>

              <div className="priority-rank" data-testid={`threat-rank-${threat.id}`}>
                #{threat.rank}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-slate-900 truncate">
                    {threat.title}
                  </h3>
                  <RiskBadge level={threat.risk_level} size="sm" />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span>{threat.asset}</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">{threat.equipment_type}</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">{threat.failure_mode}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden md:block text-right">
                  <div className="text-sm font-medium text-slate-700">
                    Score: {threat.risk_score}
                  </div>
                  <div className="text-xs text-slate-400">
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
