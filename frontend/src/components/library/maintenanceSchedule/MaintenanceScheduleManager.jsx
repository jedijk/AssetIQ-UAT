/**
 * Maintenance Schedule Manager — orchestrates dashboard, timeline, planner, and task dialogs.
 */
import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  Check,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatApiError } from "../../../lib/apiErrors";
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
  DISCIPLINES,
  getDisciplineLabel,
  normalizeDiscipline,
} from "../../../constants/disciplines";
import {
  maintenanceSchedulerAPI,
  refreshMaintenanceSchedulerQueries,
  maintenanceStrategyV2API,
  equipmentHierarchyAPI,
} from "../../../lib/api";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useBreadcrumbTab } from "../../../contexts/BreadcrumbContext";
import { DashboardCards } from "./DashboardCards";
import { TimelineView } from "./TimelineView";
import { TaskListView } from "./TaskListView";
import { ApplyStrategyDialog } from "./ApplyStrategyDialog";
import { PlannerView } from "./PlannerView";
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import { matchesMaintenanceSourceFilter } from "./taskSourceFilter";
import {
  hierarchySearchQueryForScheduleRow,
  buildStrategyLibraryUrl,
  pickScheduledTaskForDialog,
} from "../../../lib/maintenanceScheduleContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import IntelligenceContextPanel, {
  IntelligenceContextToggle,
} from "../../intelligence/IntelligenceContextPanel";
import { useIntelligenceContextPanel } from "../../../hooks/useIntelligenceContextPanel";

const SCHEDULE_FILTER_TRIGGER_CLASS =
  "h-full w-full min-h-0 justify-between font-normal px-3 py-0 shadow-none overflow-hidden " +
  "transition-colors active:scale-100 " +
  "hover:border-input hover:bg-background " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0 " +
  "data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-ring data-[state=open]:ring-offset-0";

const SCHEDULE_FILTER_SHELL_CLASS = "relative h-9 shrink-0";

const SCHEDULE_FILTER_GROUP_CLASS = "flex h-9 shrink-0 items-center gap-2";
const SCHEDULE_FILTER_LABEL_CLASS =
  "text-sm font-medium leading-none text-slate-700 whitespace-nowrap";

export function MaintenanceScheduleManager({
  equipmentType,
  embedIntelligenceContext = false,
  contextEquipmentTypes = [],
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("timeline");
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [aiPlanOpen, setAiPlanOpen] = useState(false);
  const [aiPlanResult, setAiPlanResult] = useState(null);
  const [selectedAiRecs, setSelectedAiRecs] = useState(new Set());
  const [contextEquipmentTypeId, setContextEquipmentTypeId] = useState("");
  // Filter: Equipment Unit (ISO 14224 level). "" = all units.
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [unitFilterOpen, setUnitFilterOpen] = useState(false);
  const [selectedDisciplines, setSelectedDisciplines] = useState([]);
  const [disciplineFilterOpen, setDisciplineFilterOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");

  const scheduleTabBreadcrumbLabel = useMemo(() => {
    const viewLabels = {
      timeline: t("maintenance.timeline"),
      planner: t("maintenance.planner"),
      tasks:
        t("library.tasks") !== "library.tasks"
          ? t("library.tasks")
          : t("maintenance.taskTemplatesLabel"),
      programs: t("maintenance.programs"),
    };
    const viewLabel = viewLabels[activeTab] || activeTab;
    return `${t("maintenance.maintenanceScheduleTitle")} · ${viewLabel}`;
  }, [activeTab, t]);

  useBreadcrumbTab(scheduleTabBreadcrumbLabel);

  const equipmentTypeId = equipmentType?.id;
  const equipmentTypeName = equipmentType?.name || t("equipment.allEquipment");
  const intelligenceContextTypeId = equipmentTypeId || contextEquipmentTypeId || null;
  const intelligenceContextTypeName = equipmentTypeId
    ? equipmentTypeName
    : contextEquipmentTypes.find((type) => type.id === contextEquipmentTypeId)?.name || null;
  const intelPanelStorageKey = intelligenceContextTypeId
    ? `assetiq:intel-context:schedule:${intelligenceContextTypeId}`
    : embedIntelligenceContext
      ? "assetiq:intel-context:schedule:global"
      : null;
  const [intelPanelOpen, setIntelPanelOpen] = useIntelligenceContextPanel(
    embedIntelligenceContext ? intelPanelStorageKey : null,
  );
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
      const future = new Date(today.getTime() + 120 * 86400000).toISOString().split("T")[0];
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
    enabled: !!equipmentTypeId && applyDialogOpen,
  });

  // For global view: apply strategy requires a specific equipment type — no bulk fetch on load.
  const effectiveAffectedEquipment = useMemo(() => {
    if (equipmentTypeId) {
      return affectedEquipmentData?.equipment || [];
    }
    return [];
  }, [equipmentTypeId, affectedEquipmentData]);

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

  const matchesDisciplineFilter = useCallback((item) => {
    if (selectedDisciplines.length === 0) return true;
    const disc = normalizeDiscipline(item?.discipline) || (item?.discipline || "").toLowerCase();
    if (!disc) return false;
    return selectedDisciplines.some((d) => {
      const dl = d.toLowerCase();
      return disc === dl || disc.includes(dl) || dl.includes(disc);
    });
  }, [selectedDisciplines]);

  const filterTask = useCallback((task) => {
    if (!task) return false;
    if (filteredEquipmentIds && !filteredEquipmentIds.has(task.equipment_id)) return false;
    if (!matchesDisciplineFilter(task)) return false;
    return matchesMaintenanceSourceFilter(task, sourceFilter);
  }, [filteredEquipmentIds, matchesDisciplineFilter, sourceFilter]);

  const applyTaskListFilter = useCallback((items) => {
    if (!Array.isArray(items)) return items;
    return items.filter(filterTask);
  }, [filterTask]);

  const toggleDiscipline = (value) => {
    setSelectedDisciplines((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  };

  const getDisciplineFilterLabel = () => {
    if (selectedDisciplines.length === 0) {
      return t("disciplines.allDisciplines");
    }
    if (selectedDisciplines.length === 1) {
      const key = `disciplines.${selectedDisciplines[0]}`;
      const translated = t(key);
      return translated !== key ? translated : getDisciplineLabel(selectedDisciplines[0]);
    }
    const first = selectedDisciplines[0];
    const key = `disciplines.${first}`;
    const translated = t(key);
    const firstLabel = translated !== key ? translated : getDisciplineLabel(first);
    return `${firstLabel} +${selectedDisciplines.length - 1}`;
  };

  const getDisciplineOptionLabel = (value) => {
    const key = `disciplines.${value}`;
    const translated = t(key);
    return translated !== key ? translated : getDisciplineLabel(value);
  };

  // Filtered views passed to children
  const filteredTimeline = useMemo(() => {
    if (!timeline) return timeline;
    const hasUnitFilter = !!filteredEquipmentIds;
    const hasDisciplineFilter = selectedDisciplines.length > 0;
    const hasSourceFilter = sourceFilter !== "all";
    if (!hasUnitFilter && !hasDisciplineFilter && !hasSourceFilter) return timeline;

    const filterEquipmentList = (list) => {
      if (!Array.isArray(list)) return list;
      return list
        .filter((e) => !hasUnitFilter || filteredEquipmentIds.has(e.equipment_id))
        .map((e) => ({
          ...e,
          tasks: applyTaskListFilter(e.tasks || []),
        }))
        .filter((e) => (e.tasks || []).length > 0);
    };

    return {
      ...timeline,
      timeline: filterEquipmentList(timeline.timeline),
      equipment: filterEquipmentList(timeline.equipment),
    };
  }, [timeline, filteredEquipmentIds, selectedDisciplines, sourceFilter, applyTaskListFilter]);

  const filteredTasksList = useMemo(
    () => applyTaskListFilter(tasksData?.tasks),
    [tasksData, applyTaskListFilter]
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
      toast.error(formatApiError(err, t("maintenance.failedRunScheduler")));
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
            : "") +
          (data.deselected_equipment_count
            ? ` · removed ${data.deselected_programs_removed + data.deselected_v2_programs_removed} program(s) and ${data.deselected_scheduled_tasks_removed} scheduled task(s) from ${data.deselected_equipment_count} deselected equipment`
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
      toast.error(formatApiError(err, t("maintenance.failedApplyStrategy")));
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
      toast.error(formatApiError(err, t("maintenance.aiPlannerFailed")));
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
      toast.error(formatApiError(err, t("maintenance.failedApplyAiPlan")));
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
      toast.error(formatApiError(err, t("maintenance.failedUpdateTask")));
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
      toast.error(formatApiError(err, t("maintenance.failedCompleteTask")));
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
      toast.error(formatApiError(err, t("maintenance.failedDeferTask")));
    },
  });

  // ============= Handlers =============

  const handleRunScheduler = () => {
    runSchedulerMutation.mutate({ equipment_type_id: equipmentTypeId });
  };

  const handleTaskClick = (task) => {
    setSelectedTask(task);
  };

  const handleViewTaskFromContext = useCallback((row) => {
    const task = pickScheduledTaskForDialog(row);
    if (!task?.id) {
      toast.error(t("maintenance.contextViewTaskUnavailable"));
      return;
    }
    setSelectedTask(task);
  }, [t]);

  const handleParentStrategyFromContext = useCallback(async (row) => {
    const task = pickScheduledTaskForDialog(row);
    let resolvedEquipmentTypeId = equipmentTypeId || task?.strategy_id;

    if (!resolvedEquipmentTypeId && (row?.equipment_id || task?.equipment_id)) {
      try {
        const node = await equipmentHierarchyAPI.getNode(row?.equipment_id || task?.equipment_id);
        resolvedEquipmentTypeId = node?.equipment_type_id;
      } catch {
        resolvedEquipmentTypeId = null;
      }
    }

    if (!resolvedEquipmentTypeId) {
      toast.error(t("maintenance.contextParentStrategyUnavailable"));
      return;
    }

    navigate(
      buildStrategyLibraryUrl({
        equipmentTypeId: resolvedEquipmentTypeId,
        failureModeId: task?.failure_mode_id,
        taskName: row?.task_name || task?.task_name,
      }),
      { state: { from: "schedule", fromPage: t("maintenance.maintenanceScheduleTitle") } },
    );
  }, [equipmentTypeId, navigate, t]);

  const handleFindEquipmentFromContext = useCallback((row) => {
    const query = hierarchySearchQueryForScheduleRow(row);
    if (!query?.trim()) {
      toast.error(t("maintenance.contextFindEquipmentUnavailable"));
      return;
    }

    window.dispatchEvent(
      new CustomEvent("open-hierarchy-with-search", { detail: { query: query.trim() } }),
    );
  }, [t]);

  // ============= Render =============

  const hasPrograms = programsSummary?.total_programs > 0;

  const scheduleContent = (
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
          {embedIntelligenceContext && !equipmentTypeId && (
            <Select
              value={contextEquipmentTypeId || "__none__"}
              onValueChange={(value) =>
                setContextEquipmentTypeId(value === "__none__" ? "" : value)
              }
            >
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue placeholder={t("maintenance.selectEquipmentType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs text-slate-500">
                  {t("maintenance.selectEquipmentType")}
                </SelectItem>
                {contextEquipmentTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id} className="text-xs">
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {embedIntelligenceContext && (
            <IntelligenceContextToggle
              open={intelPanelOpen}
              onToggle={() => setIntelPanelOpen((prev) => !prev)}
              disabled={!intelligenceContextTypeId}
              title={
                !intelligenceContextTypeId
                  ? t("intelligenceContext.requiresEquipmentType")
                  : undefined
              }
            />
          )}
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

      {/* Schedule filters — single row, fixed 36px controls (no wrap jump) */}
      <div
        className="flex h-9 min-h-9 max-h-9 flex-nowrap items-center gap-x-4 overflow-x-auto overflow-y-hidden [scrollbar-gutter:stable]"
        data-testid="equipment-unit-filter-row"
      >
        <div className={SCHEDULE_FILTER_GROUP_CLASS}>
          <span className={SCHEDULE_FILTER_LABEL_CLASS}>
            {t("maintenance.equipmentUnit")}:
          </span>
          <div className={cn(SCHEDULE_FILTER_SHELL_CLASS, "w-72")}>
          <Popover open={unitFilterOpen} onOpenChange={setUnitFilterOpen} modal={false}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={unitFilterOpen}
                className={SCHEDULE_FILTER_TRIGGER_CLASS}
                data-testid="equipment-unit-filter"
              >
                <span className="flex min-h-0 min-w-0 flex-1 items-center truncate text-left">
                  {selectedUnitId ? (() => {
                    const sel = equipmentUnitNodes.find(n => n.id === selectedUnitId);
                    if (!sel) return t("maintenance.allEquipmentUnits");
                    return (
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        {sel.tag && (
                          <Badge
                            variant="outline"
                            className="h-5 shrink-0 px-1.5 py-0 text-[10px] font-mono leading-none"
                          >
                            {sel.tag}
                          </Badge>
                        )}
                        <span className="truncate">{sel.name}</span>
                      </span>
                    );
                  })() : (
                    <span className="text-muted-foreground">{t("maintenance.allEquipmentUnits")}</span>
                  )}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-0"
              align="start"
              side="bottom"
              sideOffset={4}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command
                filter={(value, search) => {
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
          </div>
        </div>

        <div className={SCHEDULE_FILTER_GROUP_CLASS}>
          <span className={SCHEDULE_FILTER_LABEL_CLASS}>
            {t("maintenance.discipline")}:
          </span>
          <div className={cn(SCHEDULE_FILTER_SHELL_CLASS, "w-56")}>
          <Popover open={disciplineFilterOpen} onOpenChange={setDisciplineFilterOpen} modal={false}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={disciplineFilterOpen}
                className={SCHEDULE_FILTER_TRIGGER_CLASS}
                data-testid="discipline-filter"
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left leading-none",
                    selectedDisciplines.length > 0 ? "text-slate-900" : "text-muted-foreground",
                  )}
                >
                  {getDisciplineFilterLabel()}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-56 p-0"
              align="start"
              side="bottom"
              sideOffset={4}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="p-2 border-b border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-sm"
                  onClick={() => {
                    setSelectedDisciplines([]);
                    setDisciplineFilterOpen(false);
                  }}
                  data-testid="discipline-filter-option-all"
                >
                  {t("disciplines.allDisciplines")}
                </Button>
              </div>
              <ScrollArea className="max-h-64">
                <div className="p-1">
                  {DISCIPLINES.map((disc) => {
                    const isSelected = selectedDisciplines.includes(disc.value);
                    return (
                      <button
                        key={disc.value}
                        type="button"
                        onClick={() => toggleDiscipline(disc.value)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 sm:py-2 rounded-md hover:bg-slate-50 text-left"
                        data-testid={`discipline-filter-option-${disc.value}`}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-slate-300",
                            isSelected && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="text-sm text-slate-700 flex-1">
                          {getDisciplineOptionLabel(disc.value)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          </div>
        </div>

        <div className={SCHEDULE_FILTER_GROUP_CLASS}>
          <span className={SCHEDULE_FILTER_LABEL_CLASS}>
            {t("maintenance.scheduleSourceFilter")}:
          </span>
          <div className={cn(SCHEDULE_FILTER_SHELL_CLASS, "w-44")}>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger
              className={cn(
                SCHEDULE_FILTER_TRIGGER_CLASS,
                "focus:ring-inset focus:ring-1 focus:ring-offset-0",
              )}
              data-testid="task-source-filter"
            >
              <SelectValue placeholder={t("maintenance.scheduleSourceAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="task-source-filter-all">
                {t("maintenance.scheduleSourceAll")}
              </SelectItem>
              <SelectItem value="import" data-testid="task-source-filter-import">
                {t("maintenance.scheduleSourceImport")}
              </SelectItem>
              <SelectItem value="strategy" data-testid="task-source-filter-strategy">
                {t("maintenance.scheduleSourceStrategy")}
              </SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>
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
            onViewTask={handleViewTaskFromContext}
            onParentStrategy={handleParentStrategyFromContext}
            onFindEquipment={handleFindEquipmentFromContext}
          />
        </TabsContent>

        {/* Planner Tab */}
        <TabsContent value="planner" className="mt-4">
          <PlannerView
            equipmentTypeId={equipmentTypeId}
            onTaskClick={handleTaskClick}
            filterTask={filterTask}
          />
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
        affectedEquipment={effectiveAffectedEquipment}
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

  if (!embedIntelligenceContext) {
    return scheduleContent;
  }

  return (
    <div className="flex items-start gap-0 min-h-0">
      <div className="flex-1 min-w-0">{scheduleContent}</div>
      <IntelligenceContextPanel
        open={intelPanelOpen && !!intelligenceContextTypeId}
        onOpenChange={setIntelPanelOpen}
        objectType="strategy"
        objectId={intelligenceContextTypeId}
        equipmentTypeName={intelligenceContextTypeName}
      />
    </div>
  );
}

export default MaintenanceScheduleManager;

