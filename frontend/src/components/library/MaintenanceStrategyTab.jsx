/**
 * Maintenance Strategy Tab Content
 * Shows Equipment Types list + Strategy Manager for selected type
 */

import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Wrench,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Package,
  Filter,
  Cog,
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
import { EQUIPMENT_ICONS, DISCIPLINE_COLORS } from "./EquipmentTypeItem";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTranslatedEquipmentTypes } from "../../hooks/useTranslatedEntities";

function translateDiscipline(name, t) {
  if (!name) return name;
  const translated = t(`disciplines.${name}`);
  if (translated && translated !== `disciplines.${name}`) return translated;
  return name;
}

/**
 * Equipment Type List Item
 */
const EquipmentTypeItem = ({ type, isSelected, hasStrategy, onClick, t }) => {
  const Icon = EQUIPMENT_ICONS[type.icon] || Cog;
  const disciplineStyle = DISCIPLINE_COLORS[type.discipline] || DISCIPLINE_COLORS["Rotating"];

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? "bg-blue-50 border border-blue-200"
          : "hover:bg-slate-50 border border-transparent"
      }`}
      onClick={onClick}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${disciplineStyle.bg}`}>
        <Icon className={`w-4 h-4 ${disciplineStyle.icon}`} />
      </div>
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
          <Badge className={`text-[10px] px-1.5 py-0 ${disciplineStyle.bg} ${disciplineStyle.text} ${disciplineStyle.border}`}>
            {translateDiscipline(type.discipline, t)}
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
const MaintenanceStrategyTab = ({
  filterLinkedToEquipment = true,
  onFilterLinkedToEquipmentChange,
  inUseEquipmentTypeIds = new Set(),
  initialEquipmentTypeId = null,
  onInitialEquipmentTypeConsumed,
  strategyHighlight = null,
  onStrategyHighlightConsumed,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [selectedType, setSelectedType] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Check URL for "with_strategy" filter
  const showOnlyWithStrategy = searchParams.get("filter") === "with_strategy";

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

  // Apply translations to equipment type names (NL/DE)
  const { equipmentTypes: translatedEquipmentTypes } = useTranslatedEquipmentTypes(equipmentTypesData || []);

  // Fetch all strategies to show which types have strategies
  const { data: strategiesData, isLoading: strategiesLoading } = useQuery({
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
    (translatedEquipmentTypes || []).forEach((t) => {
      if (t.discipline) set.add(t.discipline);
    });
    return Array.from(set).sort();
  }, [translatedEquipmentTypes]);

  // Filter equipment types (search, discipline, hierarchy-linked, with-strategy)
  const filteredTypes = useMemo(() => {
    let types = translatedEquipmentTypes || [];
    
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

    if (filterLinkedToEquipment) {
      types = types.filter((t) => inUseEquipmentTypeIds.has(t.id));
    }
    
    // Filter to show only equipment types with strategies (from URL param)
    if (showOnlyWithStrategy && strategiesData) {
      types = types.filter((t) => strategiesMap.has(t.id));
    }
    
    // Sort: custom first, then by name
    return types.sort((a, b) => {
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [translatedEquipmentTypes, searchQuery, disciplineFilter, filterLinkedToEquipment, inUseEquipmentTypeIds, showOnlyWithStrategy, strategiesMap, strategiesData]);

  const strategiesInFilteredTypesCount = useMemo(() => {
    if (!filterLinkedToEquipment) return strategiesMap.size;
    let count = 0;
    for (const typeId of strategiesMap.keys()) {
      if (inUseEquipmentTypeIds.has(typeId)) count++;
    }
    return count;
  }, [strategiesMap, filterLinkedToEquipment, inUseEquipmentTypeIds]);

  useEffect(() => {
    if (!selectedType) return;
    if (filterLinkedToEquipment && !inUseEquipmentTypeIds.has(selectedType.id)) {
      setSelectedType(null);
    }
  }, [filterLinkedToEquipment, selectedType, inUseEquipmentTypeIds]);

  // Auto-select first equipment type with strategy when "with_strategy" filter is active
  useEffect(() => {
    if (showOnlyWithStrategy && strategiesData) {
      // If current selection doesn't have a strategy, or no selection, select first with strategy
      if (!selectedType || !strategiesMap.has(selectedType.id)) {
        const firstWithStrategy = filteredTypes.find(t => strategiesMap.has(t.id));
        if (firstWithStrategy) {
          setSelectedType(firstWithStrategy);
          setSidebarCollapsed(false);
        }
      }
    }
  }, [showOnlyWithStrategy, selectedType, filteredTypes, strategiesData, strategiesMap]);

  // Deep-link / PM Import: pre-select equipment type for strategy view
  useEffect(() => {
    if (!initialEquipmentTypeId || typesLoading) return;
    const types = translatedEquipmentTypes || [];
    const match = types.find(
      (type) => String(type.id) === String(initialEquipmentTypeId)
    );
    if (match) {
      setSelectedType(match);
      setSidebarCollapsed(false);
      onInitialEquipmentTypeConsumed?.();
    }
  }, [
    initialEquipmentTypeId,
    typesLoading,
    translatedEquipmentTypes,
    onInitialEquipmentTypeConsumed,
  ]);

  // Handle view in FMEA
  const handleViewInFMEA = (failureModeName) => {
    // Navigate to failure modes tab with search
    navigate(`/library?tab=failure-modes&search=${encodeURIComponent(failureModeName)}`);
  };

  return (
    <div className="flex h-full">
      {/* Collapsed rail - shows a button to reopen the sidebar */}
      {sidebarCollapsed && (
        <div className="w-10 border-r bg-slate-50 flex flex-col items-center pt-3 gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarCollapsed(false)}
            title={t("maintenance.showEquipmentTypes")}
            data-testid="sidebar-expand-btn"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </Button>
          <div className="text-[10px] text-slate-500 [writing-mode:vertical-rl] rotate-180 mt-2">
            {t("maintenance.equipmentTypes")}
          </div>
        </div>
      )}

      {/* Left Sidebar - Equipment Types */}
      {!sidebarCollapsed && (
        <div className="w-80 border-r flex flex-col bg-white flex-shrink-0">
          {/* Header with collapse button */}
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              {t("maintenance.equipmentTypes")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSidebarCollapsed(true)}
              title={t("maintenance.hideEquipmentTypes")}
              data-testid="sidebar-collapse-btn"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </div>

          {/* Search & Filter */}
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("maintenance.searchEquipmentTypes")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
              <SelectTrigger className="h-8 text-xs">
                <Filter className="w-3 h-3 mr-1.5 text-slate-400" />
                <SelectValue placeholder={t("disciplines.allDisciplines")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">{t("disciplines.allDisciplines")}</SelectItem>
                {disciplines.map((d) => (
                  <SelectItem key={d} value={d} className="text-xs">{translateDiscipline(d, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onFilterLinkedToEquipmentChange && (
              <label
                className="flex items-center gap-2 text-xs cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                title={t("library.filterLinkedToEquipmentHint")}
              >
                <input
                  type="checkbox"
                  checked={filterLinkedToEquipment}
                  onChange={(e) => onFilterLinkedToEquipmentChange(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  data-testid="linked-to-equipment-toggle-maintenance"
                />
                <span className="text-slate-600 whitespace-nowrap">{t("library.filterLinkedToEquipment")}</span>
                {filterLinkedToEquipment && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                    {filteredTypes.length}
                  </span>
                )}
              </label>
            )}
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
                <p className="text-sm text-slate-500">{t("maintenance.noTypesFound")}</p>
              </div>
            ) : (
              filteredTypes.map((type) => (
                <EquipmentTypeItem
                  key={type.id}
                  type={type}
                  isSelected={selectedType?.id === type.id}
                  hasStrategy={strategiesMap.has(type.id)}
                  onClick={() => setSelectedType(type)}
                  t={t}
                />
              ))
            )}
          </div>
        </ScrollArea>

          {/* Summary */}
          <div className="p-3 border-t bg-slate-50 text-xs text-slate-500">
            <div className="flex justify-between">
              <span>{filteredTypes.length} {t("maintenance.typesCount")}</span>
              <button 
                className="flex items-center gap-1 hover:text-purple-600 transition-colors cursor-pointer"
                onClick={() => {
                  if (showOnlyWithStrategy) {
                    // Remove filter
                    setSearchParams({ tab: "maintenance" }, { replace: true });
                  } else {
                    // Add filter
                    setSearchParams({ tab: "maintenance", filter: "with_strategy" }, { replace: true });
                  }
                }}
              >
                <CheckCircle2 className={`w-3 h-3 ${showOnlyWithStrategy ? 'text-purple-500' : 'text-green-500'}`} />
                <span className={showOnlyWithStrategy ? 'text-purple-600 font-medium' : ''}>
                  {strategiesInFilteredTypesCount} {t("maintenance.withStrategies")}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                  strategyHighlight={strategyHighlight}
                  onStrategyHighlightConsumed={onStrategyHighlightConsumed}
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
                  {t("maintenance.strategyManager")}
                </h3>
                <p className="text-sm text-slate-400 text-center max-w-md">
                  {t("maintenance.strategyManagerEmpty")}
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
