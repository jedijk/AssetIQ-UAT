/**
 * Maintenance Intelligence Map Dashboard
 * 
 * Provides a visual representation of how AssetIQ transforms reliability
 * knowledge into maintenance execution.
 * 
 * Flow: Failure Modes → Equipment Types → Equipment → 
 *       Maintenance Programs → Schedules → Planned Work
 * 
 * Secondary Flow (PM Imports):
 * PM Imports → Maintenance Programs → Schedules → Planned Work
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { intelligenceMapAPI } from "../../lib/apis/intelligenceMap";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import {
  RefreshCw,
  HelpCircle,
  ChevronRight,
  AlertTriangle,
  Cog,
  Building2,
  ClipboardList,
  Calendar,
  CheckSquare,
  Upload,
  Filter,
  Sparkles,
  Activity,
  Target,
  Loader2,
  ArrowRight,
  Shield,
  BarChart3,
  Layers,
  Network,
  GitBranch,
  Link2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Progress } from "../ui/progress";
import ReliabilityKnowledgeGraphDialog from "../ril/ReliabilityKnowledgeGraphDialog";
import SchedulesMissingFrequencyDialog from "./SchedulesMissingFrequencyDialog";
import KpiCalculationTooltip from "../ui/KpiCalculationTooltip";
import { Skeleton } from "../ui/skeleton";

// Flow card component for the main intelligence flow
const FlowCard = ({ 
  icon: Icon, 
  title, 
  count, 
  subtitle, 
  relationship,
  tooltipContent,
  onClick, 
  color = "blue",
  isLoading = false 
}) => {
  const colorClasses = {
    blue: "bg-blue-50 border-blue-200 hover:border-blue-400",
    purple: "bg-purple-50 border-purple-200 hover:border-purple-400",
    green: "bg-green-50 border-green-200 hover:border-green-400",
    amber: "bg-amber-50 border-amber-200 hover:border-amber-400",
    indigo: "bg-indigo-50 border-indigo-200 hover:border-indigo-400",
    slate: "bg-slate-50 border-slate-200 hover:border-slate-400",
    teal: "bg-teal-50 border-teal-200 hover:border-teal-400",
  };

  const iconColorClasses = {
    blue: "text-blue-600 bg-blue-100",
    purple: "text-purple-600 bg-purple-100",
    green: "text-green-600 bg-green-100",
    amber: "text-amber-600 bg-amber-100",
    indigo: "text-indigo-600 bg-indigo-100",
    slate: "text-slate-600 bg-slate-100",
    teal: "text-teal-600 bg-teal-100",
  };

  const textColorClasses = {
    blue: "text-blue-700",
    purple: "text-purple-700",
    green: "text-green-700",
    amber: "text-amber-700",
    indigo: "text-indigo-700",
    slate: "text-slate-700",
    teal: "text-teal-700",
  };

  if (isLoading) {
    return (
      <div className={`flex-shrink-0 w-36 sm:w-40 p-3 rounded-xl border-2 ${colorClasses[color]} transition-all duration-200`}>
        <div className="flex flex-col items-center text-center space-y-2">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`flex-shrink-0 w-36 sm:w-40 p-3 rounded-xl border-2 ${colorClasses[color]} transition-all duration-200 cursor-pointer hover:shadow-md active:scale-95`}
          >
            <div className="flex flex-col items-center text-center space-y-1.5">
              <div className={`p-2 rounded-lg ${iconColorClasses[color]}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className={`text-2xl font-bold ${textColorClasses[color]}`}>
                {count?.toLocaleString() ?? 0}
              </div>
              <div className="text-xs font-medium text-slate-600">{title}</div>
              {subtitle && (
                <div className="text-[10px] text-slate-400">{subtitle}</div>
              )}
            </div>
          </button>
        </TooltipTrigger>
        {(tooltipContent || relationship) && (
          <TooltipContent
            side="bottom"
            className={
              tooltipContent
                ? "max-w-xs bg-white text-slate-700 border border-slate-200 shadow-lg p-3"
                : "max-w-xs"
            }
          >
            {tooltipContent || <p className="text-sm">{relationship}</p>}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};

// Arrow connector between flow cards
const FlowArrow = ({ label, value, color = "slate" }) => {
  const colorClasses = {
    slate: "text-slate-400",
    purple: "text-purple-400",
    blue: "text-blue-400",
  };

  return (
    <div className="flex-shrink-0 flex flex-col items-center justify-center px-1">
      <ChevronRight className={`w-5 h-5 ${colorClasses[color]}`} />
      {value !== undefined && (
        <div className={`text-[10px] ${colorClasses[color]} font-medium whitespace-nowrap`}>
          {value?.toLocaleString()}
        </div>
      )}
    </div>
  );
};

// Insight Card for the right panel
const InsightCard = ({ title, value, unit, description, icon: Icon, color = "blue", trend, onClick, calculation, className = "", ...rest }) => {
  const colorClasses = {
    blue: "border-blue-200 bg-blue-50/50",
    green: "border-green-200 bg-green-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    red: "border-red-200 bg-red-50/50",
    purple: "border-purple-200 bg-purple-50/50",
  };

  const iconClasses = {
    blue: "text-blue-600",
    green: "text-green-600",
    amber: "text-amber-600",
    red: "text-red-600",
    purple: "text-purple-600",
  };

  const card = (
    <div
      className={`p-3 rounded-lg border ${colorClasses[color]} ${onClick ? "cursor-pointer hover:shadow-sm transition-shadow" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...rest}
    >
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-medium text-slate-600">{title}</span>
        {Icon && <Icon className={`w-4 h-4 ${iconClasses[color]}`} />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-slate-900">{value?.toLocaleString?.() ?? value}</span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
      {description && (
        <p className="text-[10px] text-slate-400 mt-1">{description}</p>
      )}
    </div>
  );

  if (!calculation) return card;

  return (
    <KpiCalculationTooltip calculation={calculation}>
      {card}
    </KpiCalculationTooltip>
  );
};

// Sankey Diagram Component
const SankeyDiagram = ({ data, isLoading }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 300 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        setDimensions({ width: Math.max(width, 600), height: 280 });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const sankeyData = useMemo(() => {
    if (!data || isLoading) return null;

    // Define nodes - Full flow: FM → Equipment Types → Strategies → Programs → Schedules → Planned Work
    // ("Equipment" was removed: it duplicates information already conveyed by Programs.)
    const nodes = [
      { id: "failure_modes", name: "Failure Modes", color: "#3B82F6" },
      { id: "equipment_types", name: "Equipment Types", color: "#10B981" },
      { id: "strategies", name: "Strategies", color: "#8B5CF6" },
      { id: "maintenance_programs", name: "Programs", color: "#6366F1" },
      { id: "schedules", name: "Schedules", color: "#14B8A6" },
      { id: "planned_work", name: "Planned Work", color: "#64748B" },
      { id: "pm_imports", name: "PM Imports", color: "#A855F7" },
    ];

    // Build links from relationships
    const relationships = data.relationships || {};
    const links = [];

    // Main flow: Failure Modes → Equipment Types → Strategies → Programs → Equipment → Schedules → Planned Work
    if (relationships.fm_to_equipment_types?.value > 0) {
      links.push({
        source: "failure_modes",
        target: "equipment_types",
        value: relationships.fm_to_equipment_types.value,
      });
    }
    if (relationships.equipment_types_to_strategies?.value > 0) {
      links.push({
        source: "equipment_types",
        target: "strategies",
        value: relationships.equipment_types_to_strategies.value,
      });
    }
    if (relationships.strategies_to_programs?.value > 0) {
      links.push({
        source: "strategies",
        target: "maintenance_programs",
        value: relationships.strategies_to_programs.value,
      });
    }
    if (relationships.programs_to_equipment?.value > 0) {
      // Match the flow cards: active schedule frequencies (task templates), not every
      // scheduled_tasks row (historical + future occurrences can be thousands).
      links.push({
        source: "maintenance_programs",
        target: "schedules",
        value:
          data?.schedules?.for_applied ||
          relationships.equipment_to_schedules?.value ||
          relationships.programs_to_equipment.value,
      });
    }
    if (relationships.schedules_to_work?.value > 0) {
      links.push({
        source: "schedules",
        target: "planned_work",
        value: relationships.schedules_to_work.value,
      });
    }

    // PM Import flow (secondary - purple)
    if (relationships.pm_to_programs?.value > 0) {
      links.push({
        source: "pm_imports",
        target: "maintenance_programs",
        value: relationships.pm_to_programs.value,
        isPmFlow: true,
      });
    }

    // Add minimum values for visibility if all zeros
    if (links.length === 0) {
      // Create placeholder links for visualization
      links.push(
        { source: "failure_modes", target: "equipment_types", value: 1 },
        { source: "equipment_types", target: "strategies", value: 1 },
        { source: "strategies", target: "maintenance_programs", value: 1 },
        { source: "maintenance_programs", target: "schedules", value: 1 },
        { source: "schedules", target: "planned_work", value: 1 },
      );
    }

    return { nodes, links };
  }, [data, isLoading]);

  const nodeDisplayCounts = useMemo(() => {
    if (!data || isLoading) return {};
    return {
      failure_modes: data.failure_modes?.count,
      equipment_types: data.equipment_types?.in_use,
      strategies: data.strategies?.count,
      maintenance_programs: data.maintenance_programs?.active,
      schedules: data.schedules?.for_applied,
      planned_work: data.planned_work?.for_applied,
      pm_imports: data.pm_imports?.accepted_no_fm,
    };
  }, [data, isLoading]);

  const sankeyLayout = useMemo(() => {
    if (!sankeyData) return null;

    const { width, height } = dimensions;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    const sankeyGenerator = sankey()
      .nodeId(d => d.id)
      .nodeWidth(24)
      .nodePadding(16)
      .extent([
        [margin.left, margin.top],
        [width - margin.right, height - margin.bottom]
      ]);

    // Create a copy of data for sankey
    // Filter out nodes that are not connected to any links.
    // Links are keyed by node `id` strings (matches `.nodeId(d => d.id)`).
    const connectedNodeIds = new Set();
    sankeyData.links.forEach(link => {
      connectedNodeIds.add(link.source);
      connectedNodeIds.add(link.target);
    });

    const filteredNodes = sankeyData.nodes.filter(n => connectedNodeIds.has(n.id));
    
    // If no nodes are connected, return null to show "no data" message
    if (filteredNodes.length === 0) return null;
    
    const graph = {
      nodes: filteredNodes.map(d => ({ ...d })),
      links: sankeyData.links.map(d => ({ ...d })),
    };

    try {
      return sankeyGenerator(graph);
    } catch (error) {
      console.error("Sankey layout error:", error);
      return null;
    }
  }, [sankeyData, dimensions]);

  if (isLoading) {
    return (
      <div ref={containerRef} className="w-full h-[280px] bg-slate-50 rounded-lg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!sankeyLayout) {
    return (
      <div ref={containerRef} className="w-full h-[280px] bg-slate-50 rounded-lg flex items-center justify-center">
        <p className="text-slate-400">No data available for visualization</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="min-w-[600px]"
      >
        {/* Links */}
        <g className="links">
          {sankeyLayout.links.map((link, i) => {
            const path = sankeyLinkHorizontal()(link);
            const isPmFlow = link.isPmFlow;
            return (
              <path
                key={i}
                d={path}
                fill="none"
                stroke={isPmFlow ? "#A855F7" : "#94A3B8"}
                strokeWidth={Math.max(link.width, 2)}
                strokeOpacity={isPmFlow ? 0.5 : 0.3}
                className="transition-all duration-200 hover:stroke-opacity-60"
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g className="nodes">
          {sankeyLayout.nodes.map((node, i) => (
            <g key={i} transform={`translate(${node.x0},${node.y0})`}>
              <rect
                width={node.x1 - node.x0}
                height={node.y1 - node.y0}
                fill={node.color}
                rx={4}
                className="transition-all duration-200 hover:opacity-80"
              />
              <text
                x={(node.x1 - node.x0) / 2}
                y={(node.y1 - node.y0) / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={10}
                fontWeight={600}
                className="pointer-events-none"
              >
                {(
                  nodeDisplayCounts[node.id] ??
                  node.value
                )?.toLocaleString() || 0}
              </text>
              <text
                x={(node.x1 - node.x0) / 2}
                y={-8}
                textAnchor="middle"
                fill="#475569"
                fontSize={10}
                fontWeight={500}
                className="pointer-events-none"
              >
                {node.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

// Main Intelligence Map Component
const IntelligenceMapTab = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  // Filter state
  const [plantId, setPlantId] = useState("all");
  const [systemId, setSystemId] = useState("all");
  const [equipmentTypeId, setEquipmentTypeId] = useState("all");
  const [equipmentId, setEquipmentId] = useState("all");
  const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false);
  const [schedulesMissingOpen, setSchedulesMissingOpen] = useState(false);
  // Fetch stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["intelligence-map-stats", plantId, systemId, equipmentTypeId, equipmentId],
    queryFn: () => intelligenceMapAPI.getStats({
      plantId: plantId !== "all" ? plantId : undefined,
      systemId: systemId !== "all" ? systemId : undefined,
      equipmentTypeId: equipmentTypeId !== "all" ? equipmentTypeId : undefined,
      equipmentId: equipmentId !== "all" ? equipmentId : undefined,
    }),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Fetch filter options
  const { data: filters, isLoading: filtersLoading } = useQuery({
    queryKey: ["intelligence-map-filters"],
    queryFn: () => intelligenceMapAPI.getFilters(),
    staleTime: 60000, // 1 minute
  });

  // Navigation handlers
  const navigateToFailureModes = () => navigate("/library?tab=failure-modes");
  const navigateToStrategies = () => {
    // Navigate to Maintenance Strategy tab filtered to show only equipment types with strategies
    navigate("/library?tab=maintenance&filter=with_strategy");
  };
  const navigateToEquipmentTypes = () => navigate("/library?tab=libraries");
  const navigateToEquipment = () => navigate("/equipment-manager");
  const navigateToPrograms = () => navigate("/library?tab=schedule");
  const navigateToSchedules = () => navigate("/tasks");
  const navigateToPlannedWork = () => navigate("/tasks");
  const navigateToPMImport = () => navigate("/library?tab=pm-import");

  // Calculate derived values
  const insights = stats?.insights || {};
  const failureModeCoverage = insights.failure_mode_coverage?.value || 0;
  const strategyApplied = insights.strategy_applied || { applied: 0, total: 0 };
  const strategyDensity = insights.strategy_density?.value || 0;
  const pmSourceSplit = insights.pm_source_split || { generated: 0, imported: 0 };
  const scheduleHealth = insights.schedule_health?.missing_frequency || 0;
  const scheduleCompliance = insights.schedule_compliance?.value || 100;

  const intelligenceMapFilters = useMemo(
    () => ({
      plantId: plantId !== "all" ? plantId : undefined,
      systemId: systemId !== "all" ? systemId : undefined,
      equipmentTypeId: equipmentTypeId !== "all" ? equipmentTypeId : undefined,
      equipmentId: equipmentId !== "all" ? equipmentId : undefined,
    }),
    [plantId, systemId, equipmentTypeId, equipmentId]
  );
  const reliabilityEdgesTotal =
    stats?.reliability_edges_total ??
    insights.reliability_graph?.reliability_edges_total ??
    0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            Maintenance Intelligence Map
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Understand how reliability knowledge creates maintenance work in your plant
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchStats()}
            disabled={statsLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="w-8 h-8">
                  <HelpCircle className="w-4 h-4 text-slate-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                <p className="text-sm">
                  This dashboard shows how AssetIQ transforms Failure Modes into Strategies,
                  applies them to Equipment Types and Equipment, generates Maintenance Programs,
                  Schedules, and Planned Work.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">Filters:</span>
            </div>
            
            {/* Plant Filter */}
            <Select value={plantId} onValueChange={setPlantId}>
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue placeholder="All Plants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plants</SelectItem>
                {filters?.plants?.map((plant) => (
                  <SelectItem key={plant.id} value={plant.id}>
                    {plant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* System Filter */}
            <Select value={systemId} onValueChange={setSystemId}>
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue placeholder="All Systems" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Systems</SelectItem>
                {filters?.systems
                  ?.filter(s => plantId === "all" || s.parent_id === plantId)
                  ?.map((system) => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Equipment Type Filter */}
            <Select value={equipmentTypeId} onValueChange={setEquipmentTypeId}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="All Equipment Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Equipment Types</SelectItem>
                {filters?.equipment_types?.map((et) => (
                  <SelectItem key={et.id} value={et.id}>
                    {et.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Flow Section - spans 3 columns */}
        <div className="xl:col-span-3 space-y-6">
          {/* Primary Intelligence Flow */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-600" />
                Reliability Intelligence Flow
              </CardTitle>
              <CardDescription className="text-xs">
                Click any card to navigate to detailed records
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-start gap-1 overflow-x-auto pb-2">
                <FlowCard
                  icon={AlertTriangle}
                  title="Failure Modes"
                  count={stats?.failure_modes?.count}
                  subtitle="Active Library"
                  relationship={`Connected to ${stats?.equipment_types?.in_use || 0} Equipment Types in use`}
                  onClick={navigateToFailureModes}
                  color="blue"
                  isLoading={statsLoading}
                />
                <FlowArrow value={stats?.relationships?.fm_to_equipment_types?.value} />
                
                <FlowCard
                  icon={Layers}
                  title="Equipment Types"
                  count={stats?.equipment_types?.in_use}
                  subtitle="In Use"
                  relationship={`${stats?.strategies?.count || 0} strategies created`}
                  onClick={navigateToEquipmentTypes}
                  color="green"
                  isLoading={statsLoading}
                />
                <FlowArrow value={stats?.relationships?.equipment_types_to_strategies?.value} />
                
                <FlowCard
                  icon={Cog}
                  title="Strategies"
                  count={stats?.strategies?.count}
                  subtitle={`${stats?.strategies?.task_templates || 0} Task Templates`}
                  relationship={`${stats?.maintenance_programs?.count || 0} programs active`}
                  onClick={navigateToStrategies}
                  color="purple"
                  isLoading={statsLoading}
                />
                <FlowArrow value={stats?.relationships?.strategies_to_programs?.value} />
                
                <FlowCard
                  icon={ClipboardList}
                  title="Programs"
                  count={stats?.maintenance_programs?.active}
                  subtitle="Active"
                  relationship={`${stats?.equipment?.with_active_program || 0} equipment affected`}
                  tooltipContent={
                    <div className="text-xs space-y-2 py-1 min-w-[200px]">
                      <div className="font-semibold text-slate-700">
                        Active Programs Breakdown
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5">
                            <Cog className="w-3 h-3 text-purple-600" />
                            <span className="text-slate-600">From Strategy</span>
                          </div>
                          <span className="font-semibold text-slate-900">
                            {(stats?.equipment?.with_strategy_applied || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5">
                            <Upload className="w-3 h-3 text-purple-600" />
                            <span className="text-slate-600">From PM Import</span>
                          </div>
                          <span className="font-semibold text-slate-900">
                            {(stats?.maintenance_programs?.from_pm_import || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="h-px bg-slate-200 my-1" />
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-700 font-medium">Total Active</span>
                          <span className="font-bold text-indigo-700">
                            {(stats?.maintenance_programs?.active || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                        Click to open Maintenance Programs
                      </div>
                    </div>
                  }
                  onClick={navigateToPrograms}
                  color="indigo"
                  isLoading={statsLoading}
                />
                <FlowArrow value={stats?.schedules?.for_applied} />
                
                <FlowCard
                  icon={Calendar}
                  title="Schedules"
                  count={stats?.schedules?.for_applied}
                  subtitle="Active Frequencies"
                  relationship={`Create ${stats?.planned_work?.for_applied || 0} Planned Tasks`}
                  tooltipContent={
                    <div className="text-xs space-y-2 py-1 min-w-[200px]">
                      <div className="font-semibold text-slate-700">
                        Active Schedules Breakdown
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5">
                            <Cog className="w-3 h-3 text-teal-600" />
                            <span className="text-slate-600">From Strategy</span>
                          </div>
                          <span className="font-semibold text-slate-900">
                            {(stats?.schedules?.from_strategy || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5">
                            <Upload className="w-3 h-3 text-teal-600" />
                            <span className="text-slate-600">From PM Import</span>
                          </div>
                          <span className="font-semibold text-slate-900">
                            {(stats?.schedules?.from_pm_import || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="h-px bg-slate-200 my-1" />
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-700 font-medium">Total Active</span>
                          <span className="font-bold text-teal-700">
                            {(stats?.schedules?.for_applied || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                        Click to open scheduled tasks
                      </div>
                    </div>
                  }
                  onClick={navigateToSchedules}
                  color="teal"
                  isLoading={statsLoading}
                />
                <FlowArrow value={stats?.relationships?.schedules_to_work?.value} />
                
                <FlowCard
                  icon={CheckSquare}
                  title="Planned Work"
                  count={stats?.planned_work?.for_applied}
                  subtitle="Tasks"
                  onClick={navigateToPlannedWork}
                  color="slate"
                  isLoading={statsLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* PM Import Flow (Secondary) */}
          <Card className="border-purple-200 bg-purple-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4 text-purple-600" />
                PM Import Integration
              </CardTitle>
              <CardDescription className="text-xs">
                Accepted PM tasks not connected to failure modes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <FlowCard
                  icon={Upload}
                  title="PM Imports"
                  count={stats?.pm_imports?.accepted_no_fm}
                  subtitle="Without Failure Mode"
                  relationship={`${stats?.pm_imports?.sessions || 0} import sessions`}
                  onClick={navigateToPMImport}
                  color="purple"
                  isLoading={statsLoading}
                />
                <FlowArrow color="purple" value={stats?.relationships?.pm_to_programs?.value} />
                <div className="flex items-center gap-2 text-sm text-purple-600">
                  <ArrowRight className="w-4 h-4" />
                  <span>Flows into Maintenance Programs → Schedules → Planned Work</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sankey Visualization */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                Data Lineage Visualization
              </CardTitle>
              <CardDescription className="text-xs">
                Flow width matches the Intelligence Flow cards above (programs, active frequencies, planned tasks)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SankeyDiagram data={stats} isLoading={statsLoading} />
            </CardContent>
          </Card>
        </div>

        {/* Insights Panel - 1 column */}
        <div className="xl:col-span-1">
          <Card className="border-slate-200 sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Reliability Intelligence Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Knowledge Graph */}
              <InsightCard
                title="Knowledge Graph"
                value={reliabilityEdgesTotal}
                unit="edges"
                description={
                  insights.reliability_graph?.description ||
                  "Reliability graph edges linking entities · Click to view ontology"
                }
                calculation={insights.reliability_graph?.calculation}
                icon={Link2}
                color="blue"
                onClick={() => setKnowledgeGraphOpen(true)}
                data-testid="intelligence-map-reliability-edges"
              />

              {/* Failure Mode Coverage */}
              <InsightCard
                title="Failure Mode Coverage"
                value={failureModeCoverage}
                unit="%"
                description={`${insights.failure_mode_coverage?.numerator || 0} of ${insights.failure_mode_coverage?.denominator || 0} equipment`}
                calculation={insights.failure_mode_coverage?.calculation}
                icon={Target}
                color={failureModeCoverage >= 80 ? "green" : failureModeCoverage >= 50 ? "amber" : "red"}
              />

              {/* Strategy Applied */}
              <KpiCalculationTooltip calculation={insights.strategy_applied?.calculation}>
              <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/50">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600">Strategy Applied</span>
                  <Cog className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-purple-700">{strategyApplied.applied}</span>
                  <span className="text-sm text-slate-500">of {strategyApplied.total}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Across all equipment
                </p>
                {strategyApplied.total > 0 && (
                  <Progress 
                    value={(strategyApplied.applied / strategyApplied.total) * 100} 
                    className="h-1.5 mt-2 [&>div]:bg-purple-500" 
                  />
                )}
              </div>
              </KpiCalculationTooltip>

              {/* Strategy Density */}
              <InsightCard
                title="Strategy Density"
                value={strategyDensity}
                unit="per asset"
                description="Average strategies per equipment"
                calculation={insights.strategy_density?.calculation}
                icon={Layers}
                color="blue"
              />

              {/* PM Source Split */}
              <KpiCalculationTooltip calculation={insights.pm_source_split?.calculation}>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600">PM Source Split</span>
                  <Activity className="w-4 h-4 text-slate-500" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Generated</span>
                    <span className="font-semibold text-blue-600">{pmSourceSplit.generated}%</span>
                  </div>
                  <Progress value={pmSourceSplit.generated} className="h-1.5" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Imported</span>
                    <span className="font-semibold text-purple-600">{pmSourceSplit.imported}%</span>
                  </div>
                  <Progress value={pmSourceSplit.imported} className="h-1.5 [&>div]:bg-purple-500" />
                </div>
              </div>
              </KpiCalculationTooltip>

              {/* Schedule Health */}
              <InsightCard
                title="Schedules Missing Frequency"
                value={scheduleHealth}
                description={
                  scheduleHealth > 0
                    ? "Click to view schedules requiring attention"
                    : "Schedules requiring attention"
                }
                calculation={insights.schedule_health?.calculation}
                icon={AlertTriangle}
                color={scheduleHealth === 0 ? "green" : scheduleHealth < 10 ? "amber" : "red"}
                onClick={scheduleHealth > 0 ? () => setSchedulesMissingOpen(true) : undefined}
                data-testid="intelligence-map-schedules-missing-frequency"
              />

              {/* Schedule Compliance */}
              <InsightCard
                title="Schedule Compliance"
                value={scheduleCompliance}
                unit="%"
                description="Schedules with valid frequency"
                calculation={insights.schedule_compliance?.calculation}
                icon={Shield}
                color={scheduleCompliance >= 95 ? "green" : scheduleCompliance >= 80 ? "amber" : "red"}
              />

              {/* Task Sources Breakdown */}
              {stats?.task_sources && (
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="text-xs font-medium text-slate-600 mb-2">Task Sources</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Strategy</span>
                      <Badge variant="secondary" className="h-5">{stats.task_sources.strategy || 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Imported</span>
                      <Badge variant="secondary" className="h-5 bg-purple-100 text-purple-700">{stats.task_sources.imported || 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">AI</span>
                      <Badge variant="secondary" className="h-5 bg-amber-100 text-amber-700">{stats.task_sources.ai || 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Manual</span>
                      <Badge variant="secondary" className="h-5">{stats.task_sources.manual || 0}</Badge>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ReliabilityKnowledgeGraphDialog
        open={knowledgeGraphOpen}
        onOpenChange={setKnowledgeGraphOpen}
        totalEdges={reliabilityEdgesTotal}
      />

      <SchedulesMissingFrequencyDialog
        open={schedulesMissingOpen}
        onOpenChange={setSchedulesMissingOpen}
        filters={intelligenceMapFilters}
        totalCount={scheduleHealth}
      />
    </div>
  );
};

export default IntelligenceMapTab;
