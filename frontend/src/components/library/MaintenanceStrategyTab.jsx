/**
 * Maintenance Strategy Tab Content
 * Shows Equipment Types list + Strategy Manager for selected type
 */

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronRight,
  Wrench,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Package,
  Filter,
} from "lucide-react";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { equipmentHierarchyAPI, maintenanceStrategyV2API } from "../../lib/api";
import MaintenanceStrategyManager from "./MaintenanceStrategyManager";

// Equipment Type Icons mapping
const EQUIPMENT_ICONS = {
  droplets: "💧",
  wind: "💨",
  cog: "⚙️",
  zap: "⚡",
  gauge: "📊",
  thermometer: "🌡️",
  "circle-dot": "⭕",
  cpu: "🖥️",
  battery: "🔋",
  settings: "⚙️",
  cylinder: "🛢️",
  "move-horizontal": "↔️",
  "arrow-up-down": "↕️",
  activity: "📈",
  sliders: "🎚️",
  cable: "🔌",
  flame: "🔥",
  shield: "🛡️",
  "alert-triangle": "⚠️",
};

// Discipline colors
const DISCIPLINE_COLORS = {
  Rotating: "bg-blue-100 text-blue-700 border-blue-200",
  Static: "bg-purple-100 text-purple-700 border-purple-200",
  Piping: "bg-orange-100 text-orange-700 border-orange-200",
  Instrumentation: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Electrical: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Civil: "bg-stone-100 text-stone-700 border-stone-200",
  Operations: "bg-slate-100 text-slate-700 border-slate-200",
  Laboratory: "bg-pink-100 text-pink-700 border-pink-200",
};

/**
 * Equipment Type List Item
 */
const EquipmentTypeItem = ({ type, isSelected, hasStrategy, onClick }) => {
  const icon = EQUIPMENT_ICONS[type.icon] || "📦";
  const disciplineColor = DISCIPLINE_COLORS[type.discipline] || "bg-slate-100 text-slate-700";

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? "bg-blue-50 border border-blue-200"
          : "hover:bg-slate-50 border border-transparent"
      }`}
      onClick={onClick}
    >
      <div className="text-xl">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${isSelected ? "text-blue-900" : "text-slate-900"}`}>
            {type.name}
          </span>
          {hasStrategy ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge className={`text-[10px] px-1.5 py-0 ${disciplineColor}`}>
            {type.discipline}
          </Badge>
          {type.iso_class && (
            <span className="text-[10px] text-slate-400">ISO {type.iso_class}</span>
          )}
        </div>
      </div>
      <ChevronRight className={`w-4 h-4 ${isSelected ? "text-blue-500" : "text-slate-300"}`} />
    </div>
  );
};

/**
 * Main Component
 */
const MaintenanceStrategyTab = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [selectedType, setSelectedType] = useState(null);

  // Fetch equipment types (built-in + custom merged from backend)
  const { data: equipmentTypesData, isLoading: typesLoading } = useQuery({
    queryKey: ["equipment-types-all"],
    queryFn: async () => {
      const response = await equipmentHierarchyAPI.getEquipmentTypes();
      // Backend returns merged built-in + custom types
      const types = response.equipment_types || response || [];
      return types.map((t) => ({
        ...t,
        isCustom: t.is_custom || false,
      }));
    },
  });

  // Fetch all strategies to show which types have strategies
  const { data: strategiesData } = useQuery({
    queryKey: ["maintenance-strategies-v2-list"],
    queryFn: () => maintenanceStrategyV2API.listStrategies(),
  });

  const strategiesMap = useMemo(() => {
    const map = new Map();
    (strategiesData?.strategies || []).forEach((s) => {
      map.set(s.equipment_type_id, s);
    });
    return map;
  }, [strategiesData]);

  // Get unique disciplines
  const disciplines = useMemo(() => {
    const set = new Set();
    (equipmentTypesData || []).forEach((t) => {
      if (t.discipline) set.add(t.discipline);
    });
    return Array.from(set).sort();
  }, [equipmentTypesData]);

  // Filter equipment types
  const filteredTypes = useMemo(() => {
    let types = equipmentTypesData || [];
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      types = types.filter(
        (t) =>
          t.name?.toLowerCase().includes(q) ||
          t.discipline?.toLowerCase().includes(q) ||
          t.iso_class?.toLowerCase().includes(q)
      );
    }
    
    if (disciplineFilter !== "all") {
      types = types.filter((t) => t.discipline === disciplineFilter);
    }
    
    // Sort: custom first, then by name
    return types.sort((a, b) => {
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [equipmentTypesData, searchQuery, disciplineFilter]);

  // Handle view in FMEA
  const handleViewInFMEA = (failureModeName) => {
    // Navigate to failure modes tab with search
    navigate(`/library?tab=failure-modes&search=${encodeURIComponent(failureModeName)}`);
  };

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Equipment Types */}
      <div className="w-80 border-r flex flex-col bg-white">
        {/* Search & Filter */}
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search equipment types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
            <SelectTrigger className="h-8 text-xs">
              <Filter className="w-3 h-3 mr-1.5 text-slate-400" />
              <SelectValue placeholder="All Disciplines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Disciplines</SelectItem>
              {disciplines.map((d) => (
                <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Types List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {typesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : filteredTypes.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No equipment types found</p>
              </div>
            ) : (
              filteredTypes.map((type) => (
                <EquipmentTypeItem
                  key={type.id}
                  type={type}
                  isSelected={selectedType?.id === type.id}
                  hasStrategy={strategiesMap.has(type.id)}
                  onClick={() => setSelectedType(type)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Summary */}
        <div className="p-3 border-t bg-slate-50 text-xs text-slate-500">
          <div className="flex justify-between">
            <span>{filteredTypes.length} equipment types</span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              {strategiesMap.size} with strategies
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel - Strategy Manager */}
      <div className="flex-1 overflow-auto bg-slate-50">
        <div className="p-4">
          <AnimatePresence mode="wait">
            {selectedType ? (
              <motion.div
                key={selectedType.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <MaintenanceStrategyManager
                  equipmentType={selectedType}
                  onViewInFMEA={handleViewInFMEA}
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-[calc(100vh-300px)]"
              >
                <Wrench className="w-16 h-16 text-slate-200 mb-4" />
                <h3 className="text-lg font-medium text-slate-600 mb-2">
                  Maintenance Strategy Manager
                </h3>
                <p className="text-sm text-slate-400 text-center max-w-md">
                  Select an equipment type from the list to view and manage its maintenance strategy.
                  Strategies are defined at the equipment type level and automatically generate tasks for individual assets.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceStrategyTab;
