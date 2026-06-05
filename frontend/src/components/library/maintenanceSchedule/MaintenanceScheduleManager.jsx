/**
 * Maintenance Schedule Manager — orchestrates dashboard, timeline, planner, and task dialogs.
 */
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Users,
  ListChecks,
  CalendarDays,
  CalendarRange,
  Wrench,
  Sparkles,
  Info,
  X,
  Check,
  ChevronsUpDown,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command";
import { ScrollArea } from "../../ui/scroll-area";
import { cn } from "../../../lib/utils";
import {
  maintenanceSchedulerAPI,
  refreshMaintenanceSchedulerQueries,
  maintenanceStrategyV2API,
  equipmentHierarchyAPI,
} from "../../../lib/api";
import { useLanguage } from "../../../contexts/LanguageContext";
import { DashboardCards } from "./DashboardCards";
import { TimelineView } from "./TimelineView";
import { TaskListView } from "./TaskListView";
import { ApplyStrategyDialog } from "./ApplyStrategyDialog";
import { PlannerView } from "./PlannerView";
import { TaskDetailsDialog } from "./TaskDetailsDialog";

export function MaintenanceScheduleManager({ equipmentType }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("timeline");
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [aiPlanOpen, setAiPlanOpen] = useState(false);
  const [aiPlanResult, setAiPlanResult] = useState(null);
  const [selectedAiRecs, setSelectedAiRecs] = useState(new Set());
  // Filter: Equipment Unit (ISO 14224 level). "" = all units.
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [unitFilterOpen, setUnitFilterOpen] = useState(false);

  const equipmentTypeId = equipmentType?.id;
  const equipmentTypeName = equipmentType?.name || t("equipment.allEquipment");
  const isGlobalView = !equipmentTypeId;
  const schedulerStaleTime = 60_000;

  // ============= Queries =============

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ["maintenance-scheduler-dashboard", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getDashboard(equipmentTypeId),
    staleTime: schedulerStaleTime,
  });

  const { data: programsSummary, isLoading: programsLoading } = useQuery({
    queryKey: ["maintenance-scheduler-programs-summary", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getProgramsSummary(equipmentTypeId),
    enabled: !!equipmentTypeId,
    staleTime: schedulerStaleTime,
  });

  const { data: timeline, isLoading: timelineLoading, refetch: refetchTimeline } = useQuery({
    queryKey: ["maintenance-scheduler-timeline", equipmentTypeId || "all"],
    queryFn: () => {
      // Fetch a wide window so panning in the Gantt always finds tasks
      const today = new Date();
      const past = new Date(today.getTime() - 30 * 86400000).toISOString().split("T")[0];
      const future = new Date(today.getTime() + 365 * 86400000).toISOString().split("T")[0];
      return maintenanceSchedulerAPI.getTimeline({
        start_date: past,
        end_date: future,
        ...(equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {}),
      });
    },
    enabled: activeTab === "timeline",
    staleTime: schedulerStaleTime,
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["maintenance-scheduler-tasks", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getTasks(equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {}),
    enabled: activeTab === "tasks",
    staleTime: schedulerStaleTime,
  });

  const { data: affectedEquipmentData } = useQuery({
    queryKey: ["maintenance-strategy-v2-affected-equipment", equipmentTypeId],
    queryFn: () => maintenanceStrategyV2API.getAffectedEquipment(equipmentTypeId),
    enabled: !!equipmentTypeId,
  });

  const { data: techniciansData } = useQuery({
    queryKey: ["maintenance-scheduler-technicians"],
    queryFn: () => maintenanceSchedulerAPI.getTechnicians(),
  });
  const technicians = techniciansData?.technicians || [];

  // Equipment hierarchy nodes — used to build the Equipment Unit filter
  // and resolve a unit's descendant equipment_ids for client-side filtering.
  const { data: nodesData } = useQuery({
    queryKey: ["equipment-hierarchy-nodes-for-schedule-filter"],
    queryFn: () => equipmentHierarchyAPI.getNodes(),
    staleTime: 1000 * 60 * 5,
  });
  const allNodes = useMemo(() => nodesData?.nodes || nodesData || [], [nodesData]);

  // Build list of Equipment Unit nodes (translated via id-map if available)
  const equipmentUnitNodes = useMemo(
    () => allNodes
      .filter(n => n.level === "equipment_unit")
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [allNodes]
  );

  // Compute the set of equipment_ids included by the current Equipment Unit filter.
  // "" → return null (no filter); otherwise include the selected unit's id + all descendants.
  const filteredEquipmentIds = useMemo(() => {
    if (!selectedUnitId) return null;
    const childrenByParent = {};
    for (const n of allNodes) {
      if (!n.parent_id) continue;
      (childrenByParent[n.parent_id] = childrenByParent[n.parent_id] || []).push(n.id);
    }
    const included = new Set([selectedUnitId]);
    const stack = [selectedUnitId];
    while (stack.length) {
      const cur = stack.pop();
      for (const child of childrenByParent[cur] || []) {
        if (!included.has(child)) {
          included.add(child);
          stack.push(child);
        }
      }
    }
    return included;
  }, [selectedUnitId, allNodes]);

  // Helper to filter any list of tasks/items by the selected Equipment Unit
  const applyUnitFilter = (items) => {
    if (!filteredEquipmentIds || !Array.isArray(items)) return items;
    return items.filter(it => it && filteredEquipmentIds.has(it.equipment_id));
  };

  // Filtered views passed to children
  const filteredTimeline = useMemo(() => {
    if (!timeline) return timeline;
    if (!filteredEquipmentIds) return timeline;
    // The Gantt TimelineView iterates `timeline.timeline` (an array of
    // { equipment_id, equipment_name, tasks: [...] }); the legacy
    // `timeline.equipment` shape is preserved for backwards-compat.
    return {
      ...timeline,
      timeline: Array.isArray(timeline.timeline)
        ? timeline.timeline.filter(e => filteredEquipmentIds.has(e.equipment_id))
        : timeline.timeline,
      equipment: Array.isArray(timeline.equipment)
        ? timeline.equipment.filter(e => filteredEquipmentIds.has(e.equipment_id))
        : timeline.equipment,
    };
  }, [timeline, filteredEquipmentIds]);

  const filteredTasksList = useMemo(
    () => applyUnitFilter(tasksData?.tasks),
    [tasksData, filteredEquipmentIds]
  );

  // ============= Mutations =============

  const runSchedulerMutation = useMutation({
    mutationFn: (params) => maintenanceSchedulerAPI.runScheduler(params),
    onSuccess: async (data) => {
      toast.success(
        `${t("maintenance.schedulerCompleted")} ${data.tasks_created} ${t("maintenance.tasksCreatedSuffix")}`,
      );
      await refreshMaintenanceSchedulerQueries(queryClient);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("maintenance.failedRunScheduler"));
    },
  });

  const clearOrphanScheduleMutation = useMutation({
    mutationFn: () =>
      maintenanceSchedulerAPI.cleanupOrphans(
        equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {},
      ),
    onSuccess: async (data) => {
      const removed = data?.scheduled_tasks_removed ?? 0;
      const programs = data?.programs_removed ?? 0;
      const v2Programs = data?.v2_programs_removed ?? 0;
      const totalRemoved = removed + programs + v2Programs;
      toast.success(
        totalRemoved > 0
          ? t("maintenance.clearOrphanScheduleSuccess")
              .replace("{removed}", removed)
              .replace("{programs}", programs + v2Programs)
          : t("maintenance.clearOrphanScheduleEmpty"),
      );
      await refreshMaintenanceSchedulerQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["maintenance-program"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-strategy-v2"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("maintenance.clearOrphanScheduleFailed"));
    },
  });

  const applyStrategyMutation = useMutation({
    mutationFn: (equipmentIds) => maintenanceSchedulerAPI.applyStrategy(equipmentTypeId, equipmentIds),
    onSuccess: async (data, equipmentIds) => {
      const emCreated = data.equipment_manager_programs_created ?? 0;
      const emRegenerated = data.equipment_manager_programs_regenerated ?? 0;
      const emErrors = data.equipment_manager_program_errors ?? [];
      const emEquipmentIds = data.equipment_manager_equipment_ids ?? equipmentIds ?? [];

      toast.success(
        `${t("maintenance.strategyApplied")} ${data.programs_created} ${t("maintenance.programsCreatedSuffix")}` +
          (emCreated || emRegenerated
            ? ` (${emCreated} equipment programs created, ${emRegenerated} updated)`
            : ""),
      );

      if (emErrors.length > 0) {
        toast.error(
          `Equipment Manager program sync failed for ${emErrors.length} item(s). Open Equipment Manager and use Create Maintenance Program, or retry after deploy.`,
        );
      } else if (emCreated === 0 && emRegenerated === 0 && (equipmentIds?.length ?? 0) > 0) {
        toast.warning(
          "Scheduler programs updated but no Equipment Manager programs were synced. The server may need the latest backend deploy.",
        );
      }

      setApplyDialogOpen(false);
      await refreshMaintenanceSchedulerQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["maintenance-program"] });
      emEquipmentIds.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: ["maintenance-program", id] });
      });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("maintenance.failedApplyStrategy"));
    },
  });

  const aiPlanMutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().split("T")[0];
      const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      return maintenanceSchedulerAPI.aiPlan({ start_date: today, end_date: end });
    },
    onSuccess: (data) => {
      setAiPlanResult(data);
      // Pre-select all recommendations
      const allIds = new Set((data?.recommendations || []).map(r => r.task_id));
      setSelectedAiRecs(allIds);
      setAiPlanOpen(true);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("maintenance.aiPlannerFailed"));
    },
  });

  const applyAiPlanMutation = useMutation({
    mutationFn: (recs) => maintenanceSchedulerAPI.applyAiPlan(recs),
    onSuccess: async (data) => {
      toast.success(
        `${t("maintenance.aiPlanApplied")} ${data.tasks_updated} ${t("maintenance.tasksUpdatedSuffix")}`,
      );
      setAiPlanOpen(false);
      setAiPlanResult(null);
      setSelectedAiRecs(new Set());
      await refreshMaintenanceSchedulerQueries(queryClient);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("maintenance.failedApplyAiPlan"));
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }) => maintenanceSchedulerAPI.updateTask(taskId, data),
    onSuccess: async () => {
      toast.success(t("maintenance.taskUpdated"));
      await refreshMaintenanceSchedulerQueries(queryClient);
      setSelectedTask(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("maintenance.failedUpdateTask"));
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({ taskId, data }) => maintenanceSchedulerAPI.completeTask(taskId, data),
    onSuccess: async () => {
      toast.success(t("maintenance.taskCompleted"));
      await refreshMaintenanceSchedulerQueries(queryClient);
      setSelectedTask(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("maintenance.failedCompleteTask"));
    },
  });

  const deferTaskMutation = useMutation({
    mutationFn: ({ taskId, data }) => maintenanceSchedulerAPI.deferTask(taskId, data),
    onSuccess: async () => {
      toast.success(t("maintenance.taskDeferred"));
      await refreshMaintenanceSchedulerQueries(queryClient);
      setSelectedTask(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || t("maintenance.failedDeferTask"));
    },
  });

  // ============= Handlers =============

  const handleRunScheduler = () => {
    runSchedulerMutation.mutate({ equipment_type_id: equipmentTypeId });
  };

  const handleClearOrphanSchedule = () => {
    const scope = isGlobalView
      ? t("maintenance.clearOrphanScheduleConfirmAll")
      : t("maintenance.clearOrphanScheduleConfirmType").replace("{name}", equipmentTypeName);
    if (window.confirm(scope)) {
      clearOrphanScheduleMutation.mutate();
    }
  };

  const handleTaskClick = (task) => {
    setSelectedTask(task);
  };

  // ============= Render =============

  const hasPrograms = programsSummary?.total_programs > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-900">
            <Calendar className="w-7 h-7 text-blue-600" />
            {equipmentTypeName} <span className="text-slate-400 font-normal">|</span> {t("maintenance.maintenanceScheduleTitle")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setApplyDialogOpen(true)}
            data-testid="apply-strategy-btn"
          >
            <Play className="w-3.5 h-3.5 mr-1" />
            {t("maintenance.applyStrategy")}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => aiPlanMutation.mutate()}
                  disabled={aiPlanMutation.isPending}
                  className="border-purple-200 text-purple-700 hover:bg-purple-50"
                  data-testid="ai-planner-btn"
                >
                  {aiPlanMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                  )}
                  {t("maintenance.aiPlanner")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">AI-optimised assignments &amp; planned dates with reasoning</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearOrphanSchedule}
                  disabled={clearOrphanScheduleMutation.isPending}
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  data-testid="clear-orphan-schedule-btn"
                >
                  {clearOrphanScheduleMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                  )}
                  {t("maintenance.clearOrphanSchedule")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{t("maintenance.clearOrphanScheduleHint")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  size="sm" 
                  onClick={handleRunScheduler}
                  disabled={runSchedulerMutation.isPending}
                  data-testid="run-scheduler-btn"
                >
                  {runSchedulerMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  )}
                  {t("maintenance.runScheduler")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Generate scheduled tasks from maintenance programs</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Dashboard KPIs */}
      <DashboardCards dashboard={dashboard} isLoading={dashboardLoading} />

      {/* Equipment Unit Filter (searchable by name OR tag) */}
      <div className="flex items-center gap-2 flex-wrap" data-testid="equipment-unit-filter-row">
        <span className="text-sm font-medium text-slate-700">{t("maintenance.equipmentUnit")}:</span>
        <Popover open={unitFilterOpen} onOpenChange={setUnitFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={unitFilterOpen}
              className="w-72 justify-between font-normal"
              data-testid="equipment-unit-filter"
            >
              {selectedUnitId ? (() => {
                const sel = equipmentUnitNodes.find(n => n.id === selectedUnitId);
                if (!sel) return t("maintenance.allEquipmentUnits");
                return (
                  <span className="flex items-center gap-2 truncate">
                    {sel.tag && (
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                        {sel.tag}
                      </Badge>
                    )}
                    <span className="truncate">{sel.name}</span>
                  </span>
                );
              })() : (
                <span className="text-slate-500">{t("maintenance.allEquipmentUnits")}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command
              filter={(value, search) => {
                // value carries "name|tag" — match either substring
                const lc = (value || "").toLowerCase();
                return lc.includes((search || "").toLowerCase()) ? 1 : 0;
              }}
            >
              <CommandInput
                placeholder={t("maintenance.searchUnitByNameOrTag")}
                data-testid="equipment-unit-filter-search"
              />
              <CommandList>
                <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all"
                    onSelect={() => {
                      setSelectedUnitId("");
                      setUnitFilterOpen(false);
                    }}
                    data-testid="equipment-unit-filter-option-all"
                  >
                    <Check className={cn("mr-2 h-4 w-4", !selectedUnitId ? "opacity-100" : "opacity-0")} />
                    {t("maintenance.allEquipmentUnits")}
                  </CommandItem>
                  {equipmentUnitNodes.map(n => (
                    <CommandItem
                      key={n.id}
                      value={`${n.name || ""}|${n.tag || ""}`}
                      onSelect={() => {
                        setSelectedUnitId(n.id);
                        setUnitFilterOpen(false);
                      }}
                      data-testid={`equipment-unit-filter-option-${n.id}`}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedUnitId === n.id ? "opacity-100" : "opacity-0")} />
                      <span className="flex items-center gap-2 flex-1 min-w-0">
                        {n.tag && (
                          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 shrink-0">
                            {n.tag}
                          </Badge>
                        )}
                        <span className="truncate">{n.name}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedUnitId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedUnitId("")}
            className="h-8 text-xs"
            data-testid="clear-equipment-unit-filter"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            {t("common.clear")}
          </Button>
        )}
      </div>

      {/* Programs Summary */}
      {programsSummary && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-sm text-slate-500">{t("maintenance.equipmentWithPrograms")}</p>
                  <p className="text-xl font-bold">{programsSummary.equipment_count}</p>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <p className="text-sm text-slate-500">{t("maintenance.totalPrograms")}</p>
                  <p className="text-xl font-bold">{programsSummary.total_programs}</p>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <p className="text-sm text-slate-500">{t("maintenance.programsOverdue")}</p>
                  <p className={`text-xl font-bold ${programsSummary.overdue_count > 0 ? "text-red-600" : ""}`}>
                    {programsSummary.overdue_count}
                  </p>
                </div>
              </div>
              {!hasPrograms && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {t("maintenance.noProgramsYet")}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="timeline" className="text-xs" data-testid="tab-timeline">
            <CalendarRange className="w-3.5 h-3.5 mr-1.5" />
            {t("maintenance.timeline")}
          </TabsTrigger>
          <TabsTrigger value="planner" className="text-xs" data-testid="tab-planner">
            <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
            {t("maintenance.planner")}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs" data-testid="tab-tasks">
            <ListChecks className="w-3.5 h-3.5 mr-1.5" />
            {t("library.tasks") !== "library.tasks" ? t("library.tasks") : t("maintenance.taskTemplatesLabel")}
          </TabsTrigger>
          <TabsTrigger value="programs" className="text-xs" data-testid="tab-programs">
            <Wrench className="w-3.5 h-3.5 mr-1.5" />
            {t("maintenance.programs")}
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <TimelineView 
            timeline={filteredTimeline} 
            isLoading={timelineLoading} 
            onTaskClick={handleTaskClick}
            onTaskReschedule={(taskId, newDate) =>
              updateTaskMutation.mutate({ taskId, data: { planned_date: newDate } })
            }
          />
        </TabsContent>

        {/* Planner Tab */}
        <TabsContent value="planner" className="mt-4">
          <PlannerView equipmentTypeId={equipmentTypeId} onTaskClick={handleTaskClick} filteredEquipmentIds={filteredEquipmentIds} />
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          <TaskListView 
            tasks={filteredTasksList} 
            isLoading={tasksLoading}
            onTaskClick={handleTaskClick}
          />
        </TabsContent>

        {/* Programs Tab */}
        <TabsContent value="programs" className="mt-4">
          {programsSummary?.equipment?.length > 0 ? (
            <div className="space-y-2">
              {programsSummary.equipment.map((equip) => (
                <Card key={equip._id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Wrench className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="font-medium">{equip.equipment_name}</p>
                        {equip.equipment_tag && (
                          <Badge variant="outline" className="text-xs font-mono mt-1">
                            {equip.equipment_tag}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {equip.task_count} maintenance tasks
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No maintenance programs created yet</p>
              <p className="text-sm text-slate-400 mt-1">Apply the strategy to equipment to create programs</p>
              <Button 
                className="mt-4" 
                variant="outline"
                onClick={() => setApplyDialogOpen(true)}
              >
                <Play className="w-4 h-4 mr-2" />
                {t("maintenance.applyStrategy")}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Apply Strategy Dialog */}
      <ApplyStrategyDialog
        open={applyDialogOpen}
        onClose={() => setApplyDialogOpen(false)}
        equipmentTypeId={equipmentTypeId}
        equipmentTypeName={equipmentTypeName}
        affectedEquipment={affectedEquipmentData?.equipment}
        onApply={(equipmentIds) => applyStrategyMutation.mutate(equipmentIds)}
        isApplying={applyStrategyMutation.isPending}
      />

      {/* AI Planner Dialog */}
      <Dialog open={aiPlanOpen} onOpenChange={setAiPlanOpen}>
        <DialogContent className="max-w-3xl" data-testid="ai-planner-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              {t("maintenance.aiPlanTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("maintenance.aiPlanDesc")}
            </DialogDescription>
          </DialogHeader>

          {aiPlanResult?.summary && (
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg" data-testid="ai-plan-summary">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-purple-800">{aiPlanResult.summary}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {aiPlanResult?.tasks_analyzed || 0} {t("maintenance.tasksAnalysed")}{" "}
              {aiPlanResult?.technicians_considered || 0} {t("maintenance.techniciansConsidered")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const all = new Set((aiPlanResult?.recommendations || []).map(r => r.task_id));
                if (selectedAiRecs.size === all.size) {
                  setSelectedAiRecs(new Set());
                } else {
                  setSelectedAiRecs(all);
                }
              }}
            >
              {selectedAiRecs.size === (aiPlanResult?.recommendations?.length || 0)
                ? t("maintenance.deselectAll")
                : t("maintenance.selectAll")}
            </Button>
          </div>

          <ScrollArea className="max-h-[420px] pr-2">
            <div className="space-y-2">
              {(aiPlanResult?.recommendations || []).length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500">
                  {t("maintenance.noAiRecommendations")}
                </div>
              ) : (
                aiPlanResult.recommendations.map((rec) => {
                  const task = tasksData?.tasks?.find(t => t.id === rec.task_id);
                  const isSelected = selectedAiRecs.has(rec.task_id);
                  return (
                    <div
                      key={rec.task_id}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        isSelected ? "border-purple-300 bg-purple-50" : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => {
                        const next = new Set(selectedAiRecs);
                        if (next.has(rec.task_id)) next.delete(rec.task_id);
                        else next.add(rec.task_id);
                        setSelectedAiRecs(next);
                      }}
                      data-testid={`ai-rec-${rec.task_id}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="mt-1 pointer-events-none"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {task?.task_name || rec.task_id}
                            </span>
                            {task?.equipment_tag && (
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {task.equipment_tag}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {rec.assigned_technician_name || t("maintenance.unassignedTechnician")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {rec.planned_date || "—"}
                            </span>
                          </div>
                          <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100">
                            <div className="flex items-start gap-2">
                              <Sparkles className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-blue-800">{rec.reasoning}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiPlanOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                const recs = (aiPlanResult?.recommendations || []).filter(r =>
                  selectedAiRecs.has(r.task_id)
                );
                applyAiPlanMutation.mutate(recs);
              }}
              disabled={selectedAiRecs.size === 0 || applyAiPlanMutation.isPending}
              data-testid="apply-ai-plan-btn"
            >
              {applyAiPlanMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {t("maintenance.applyRecommendations")} {selectedAiRecs.size}{" "}
              {selectedAiRecs.size === 1
                ? t("maintenance.recommendationSingular")
                : t("maintenance.recommendationsPlural")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Details / Edit Dialog */}
      {selectedTask && (
        <TaskDetailsDialog
          task={selectedTask}
          technicians={technicians}
          onClose={() => setSelectedTask(null)}
          onUpdate={(taskId, data) => updateTaskMutation.mutate({ taskId, data })}
          onComplete={(taskId, data) => completeTaskMutation.mutate({ taskId, data })}
          onDefer={(taskId, data) => deferTaskMutation.mutate({ taskId, data })}
          isUpdating={updateTaskMutation.isPending}
          isCompleting={completeTaskMutation.isPending}
          isDeferring={deferTaskMutation.isPending}
        />
      )}
    </div>
  );
}

export default MaintenanceScheduleManager;

