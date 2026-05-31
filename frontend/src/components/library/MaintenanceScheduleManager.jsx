/**
 * Maintenance Schedule Manager Component
 * Shows maintenance schedule, timeline, and planning interface for an equipment type
 */
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Loader2,
  RefreshCw,
  Users,
  BarChart3,
  ListChecks,
  CalendarDays,
  CalendarRange,
  Timer,
  Target,
  Wrench,
  Plus,
  Search,
  Filter,
  ArrowRight,
  Sparkles,
  Info,
  ExternalLink,
  PlayCircle,
  PauseCircle,
  XCircle,
  CheckCircle,
  ClockIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { Progress } from "../ui/progress";
import { Switch } from "../ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Textarea } from "../ui/textarea";
import { maintenanceSchedulerAPI, maintenanceStrategyV2API } from "../../lib/api";


// ============= Constants =============

const TASK_STATUS_CONFIG = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Clock },
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700", icon: Calendar },
  assigned: { label: "Assigned", color: "bg-purple-100 text-purple-700", icon: Users },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700", icon: PlayCircle },
  completed: { label: "Completed", color: "bg-green-100 text-green-700", icon: CheckCircle },
  deferred: { label: "Deferred", color: "bg-orange-100 text-orange-700", icon: PauseCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle },
};

const PRIORITY_CONFIG = {
  critical: { label: "Critical", color: "bg-red-500 text-white", textColor: "text-red-600" },
  high: { label: "High", color: "bg-orange-500 text-white", textColor: "text-orange-600" },
  medium: { label: "Medium", color: "bg-yellow-500 text-white", textColor: "text-yellow-600" },
  low: { label: "Low", color: "bg-green-500 text-white", textColor: "text-green-600" },
};


// ============= Sub-Components =============

/**
 * Dashboard KPI Cards
 */
const DashboardCards = ({ dashboard, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-8 bg-slate-200 rounded mb-2" />
              <div className="h-4 bg-slate-100 rounded w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const backlog = dashboard?.backlog || {};
  const compliance = dashboard?.compliance || {};

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Open Tasks</p>
              <p className="text-2xl font-bold">{backlog.open_tasks || 0}</p>
            </div>
            <ListChecks className="w-8 h-8 text-blue-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card className={backlog.overdue_tasks > 0 ? "border-red-200 bg-red-50" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Overdue</p>
              <p className={`text-2xl font-bold ${backlog.overdue_tasks > 0 ? "text-red-600" : ""}`}>
                {backlog.overdue_tasks || 0}
              </p>
            </div>
            <AlertTriangle className={`w-8 h-8 ${backlog.overdue_tasks > 0 ? "text-red-500" : "text-slate-300"}`} />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Upcoming (7 days)</p>
              <p className="text-2xl font-bold">{backlog.upcoming_tasks || 0}</p>
            </div>
            <Calendar className="w-8 h-8 text-amber-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Compliance</p>
              <p className={`text-2xl font-bold ${compliance.rate >= 90 ? "text-green-600" : compliance.rate >= 70 ? "text-amber-600" : "text-red-600"}`}>
                {compliance.rate || 100}%
              </p>
            </div>
            <Target className="w-8 h-8 text-green-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};


/**
 * Timeline View Component
 */
const TimelineView = ({ timeline, isLoading, onTaskClick }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!timeline?.timeline || timeline.timeline.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">No scheduled tasks in this period</p>
        <p className="text-sm text-slate-400 mt-1">Run the scheduler to generate tasks</p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      {timeline.timeline.map((equipment) => (
        <Card key={equipment.equipment_id} className="overflow-hidden">
          <CardHeader className="py-3 px-4 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-500" />
                <span className="font-medium text-sm">{equipment.equipment_name}</span>
                {equipment.equipment_tag && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {equipment.equipment_tag}
                  </Badge>
                )}
              </div>
              <Badge variant="outline" className="text-xs">
                {equipment.tasks.length} tasks
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
              
              {/* Tasks */}
              <div className="space-y-3">
                {equipment.tasks.map((task, idx) => {
                  const statusConfig = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.draft;
                  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                  const isOverdue = task.is_overdue;
                  const isToday = task.due_date === today;
                  
                  return (
                    <div
                      key={task.id}
                      className={`relative pl-10 cursor-pointer group ${isOverdue ? "animate-pulse" : ""}`}
                      onClick={() => onTaskClick?.(task)}
                    >
                      {/* Timeline dot */}
                      <div className={`absolute left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center
                        ${isOverdue ? "bg-red-500 border-red-500" : isToday ? "bg-blue-500 border-blue-500" : "bg-white border-slate-300"}
                      `}>
                        {isOverdue ? (
                          <AlertTriangle className="w-3 h-3 text-white" />
                        ) : task.status === "completed" ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <div className={`w-2 h-2 rounded-full ${isToday ? "bg-white" : "bg-slate-300"}`} />
                        )}
                      </div>
                      
                      {/* Task card */}
                      <div className={`p-3 rounded-lg border transition-all group-hover:shadow-md
                        ${isOverdue ? "border-red-200 bg-red-50" : "border-slate-200 bg-white hover:border-blue-200"}
                      `}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{task.task_name}</span>
                              <Badge className={`text-[10px] ${priorityConfig.color}`}>
                                {priorityConfig.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {task.due_date}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {task.estimated_hours}h
                              </span>
                            </div>
                          </div>
                          <Badge className={`text-[10px] ${statusConfig.color}`}>
                            {statusConfig.label}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};


/**
 * Task List View
 */
const TaskListView = ({ tasks, isLoading, onTaskClick, onStatusChange }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <ListChecks className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">No tasks found</p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const statusConfig = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.draft;
        const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
        const isOverdue = task.is_overdue || task.due_date < today;
        const StatusIcon = statusConfig.icon;

        return (
          <div
            key={task.id}
            className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md
              ${isOverdue && task.status !== "completed" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white hover:border-blue-200"}
            `}
            onClick={() => onTaskClick?.(task)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-lg ${statusConfig.color}`}>
                  <StatusIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{task.task_name}</span>
                    {isOverdue && task.status !== "completed" && (
                      <Badge className="text-[10px] bg-red-500 text-white">Overdue</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500">{task.equipment_name}</span>
                    {task.equipment_tag && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {task.equipment_tag}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {task.due_date}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {task.estimated_hours}h
                  </div>
                </div>
                <Badge className={`text-xs ${priorityConfig.color}`}>
                  {priorityConfig.label}
                </Badge>
              </div>
            </div>
            
            {task.ai_reasoning && (
              <div className="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">{task.ai_reasoning}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};


/**
 * Apply Strategy Dialog
 */
const ApplyStrategyDialog = ({ open, onClose, equipmentTypeId, equipmentTypeName, affectedEquipment, onApply, isApplying }) => {
  const [selectedEquipment, setSelectedEquipment] = useState([]);

  const handleSelectAll = () => {
    if (selectedEquipment.length === affectedEquipment?.length) {
      setSelectedEquipment([]);
    } else {
      setSelectedEquipment(affectedEquipment?.map(e => e.id) || []);
    }
  };

  const handleApply = () => {
    onApply(selectedEquipment);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-blue-600" />
            Apply Maintenance Strategy
          </DialogTitle>
          <DialogDescription>
            Select equipment to apply the <strong>{equipmentTypeName}</strong> maintenance strategy.
            This will create maintenance programs for each equipment-task combination.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Select Equipment</Label>
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              {selectedEquipment.length === affectedEquipment?.length ? "Deselect All" : "Select All"}
            </Button>
          </div>
          
          <ScrollArea className="h-[300px] border rounded-lg p-2">
            {affectedEquipment?.map((equip) => (
              <div
                key={equip.id}
                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                  selectedEquipment.includes(equip.id) ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
                onClick={() => {
                  if (selectedEquipment.includes(equip.id)) {
                    setSelectedEquipment(selectedEquipment.filter(id => id !== equip.id));
                  } else {
                    setSelectedEquipment([...selectedEquipment, equip.id]);
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedEquipment.includes(equip.id)}
                  onChange={() => {}}
                  className="pointer-events-none"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">{equip.name}</span>
                  {equip.tag && (
                    <Badge variant="outline" className="ml-2 text-xs font-mono">
                      {equip.tag}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </ScrollArea>
          
          <p className="text-sm text-slate-500">
            {selectedEquipment.length} of {affectedEquipment?.length || 0} equipment selected
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleApply} 
            disabled={selectedEquipment.length === 0 || isApplying}
          >
            {isApplying ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Apply Strategy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// ============= Main Component =============

/**
 * Planner View: Daily / Weekly / 14-day / 90-day workload
 */
const PlannerView = ({ equipmentTypeId }) => {
  const [horizon, setHorizon] = useState("daily"); // daily | weekly | "14" | "90"

  // ---- Daily uses dedicated endpoint (overdue / today / tomorrow buckets) ----
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ["maintenance-scheduler-daily-planner"],
    queryFn: () => maintenanceSchedulerAPI.getDailyPlanner(),
    enabled: horizon === "daily",
  });

  // ---- Weekly uses dedicated endpoint (7-day grid with technicians) ----
  const { data: weeklyData, isLoading: weeklyLoading } = useQuery({
    queryKey: ["maintenance-scheduler-weekly-planner"],
    queryFn: () => maintenanceSchedulerAPI.getWeeklyPlanner(),
    enabled: horizon === "weekly",
  });

  // ---- 14-day & 90-day use /tasks with from/to + frontend grouping ----
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const rangeDays = horizon === "14" ? 14 : horizon === "90" ? 90 : 0;
  const endDate = new Date(today.getTime() + rangeDays * 86400000)
    .toISOString()
    .split("T")[0];

  const { data: rangeData, isLoading: rangeLoading } = useQuery({
    queryKey: ["maintenance-scheduler-range", horizon, equipmentTypeId || "all"],
    queryFn: () =>
      maintenanceSchedulerAPI.getTasks({
        from_date: todayStr,
        to_date: endDate,
        ...(equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {}),
      }),
    enabled: horizon === "14" || horizon === "90",
  });

  // Technician capacity for the look-ahead views
  const { data: techData } = useQuery({
    queryKey: ["maintenance-scheduler-technicians"],
    queryFn: () => maintenanceSchedulerAPI.getTechnicians(),
  });

  const technicians = techData?.technicians || [];
  const totalDailyCapacityHours = technicians.reduce(
    (sum, t) => sum + (t.daily_available_hours || 8),
    0,
  );

  // ---- Group tasks by day for 14-day, by week for 90-day ----
  const groupedRange = useMemo(() => {
    if (!rangeData?.tasks) return [];
    const tasks = rangeData.tasks;

    if (horizon === "14") {
      // 14 daily buckets
      const buckets = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today.getTime() + i * 86400000);
        const iso = d.toISOString().split("T")[0];
        buckets.push({
          key: iso,
          label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
          date: iso,
          dayName: d.toLocaleDateString(undefined, { weekday: "short" }),
          tasks: [],
          hours: 0,
          capacityHours: totalDailyCapacityHours,
        });
      }
      const byDate = Object.fromEntries(buckets.map((b) => [b.key, b]));
      tasks.forEach((t) => {
        const d = t.planned_date || t.due_date;
        if (byDate[d]) {
          byDate[d].tasks.push(t);
          byDate[d].hours += t.estimated_hours || 1;
        }
      });
      return buckets;
    }

    if (horizon === "90") {
      // ~13 weekly buckets
      const buckets = [];
      const numWeeks = Math.ceil(90 / 7);
      for (let w = 0; w < numWeeks; w++) {
        const start = new Date(today.getTime() + w * 7 * 86400000);
        const end = new Date(start.getTime() + 6 * 86400000);
        const startIso = start.toISOString().split("T")[0];
        const endIso = end.toISOString().split("T")[0];
        buckets.push({
          key: startIso,
          label: `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
          startDate: startIso,
          endDate: endIso,
          tasks: [],
          hours: 0,
          capacityHours: totalDailyCapacityHours * 5, // assume 5 working days
        });
      }
      tasks.forEach((t) => {
        const d = t.planned_date || t.due_date;
        const bucket = buckets.find((b) => d >= b.startDate && d <= b.endDate);
        if (bucket) {
          bucket.tasks.push(t);
          bucket.hours += t.estimated_hours || 1;
        }
      });
      return buckets;
    }

    return [];
  }, [rangeData, horizon, totalDailyCapacityHours]);

  // ---- Renderers ----
  const isLoading =
    (horizon === "daily" && dailyLoading) ||
    (horizon === "weekly" && weeklyLoading) ||
    ((horizon === "14" || horizon === "90") && rangeLoading);

  return (
    <div className="space-y-4">
      {/* Horizon selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "daily", label: "Daily", icon: CalendarDays },
          { key: "weekly", label: "Weekly", icon: CalendarRange },
          { key: "14", label: "14 Days", icon: Calendar },
          { key: "90", label: "90 Days", icon: Calendar },
        ].map((opt) => {
          const Icon = opt.icon;
          const isActive = horizon === opt.key;
          return (
            <Button
              key={opt.key}
              size="sm"
              variant={isActive ? "default" : "outline"}
              onClick={() => setHorizon(opt.key)}
              className="text-xs"
              data-testid={`planner-horizon-${opt.key}`}
            >
              <Icon className="w-3.5 h-3.5 mr-1.5" />
              {opt.label}
            </Button>
          );
        })}
        {technicians.length > 0 && (
          <div className="ml-auto text-xs text-slate-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {technicians.length} tech{technicians.length === 1 ? "" : "s"} · {totalDailyCapacityHours}h/day
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {horizon === "daily" && <DailyPlanner data={dailyData} />}
          {horizon === "weekly" && (
            <WeeklyGrid days={weeklyData?.days || []} capacityHours={totalDailyCapacityHours} />
          )}
          {horizon === "14" && (
            <FourteenDayGrid buckets={groupedRange} totalTasks={rangeData?.total || 0} />
          )}
          {horizon === "90" && (
            <NinetyDayGrid buckets={groupedRange} totalTasks={rangeData?.total || 0} />
          )}
        </>
      )}
    </div>
  );
};


/** Daily planner: 3 vertical bucket cards (overdue, today, tomorrow) */
const DailyPlanner = ({ data }) => {
  if (!data) return null;
  const buckets = [
    { key: "overdue", title: "Overdue", color: "border-red-200 bg-red-50", titleColor: "text-red-700", icon: AlertTriangle, bucket: data.overdue },
    { key: "today", title: "Today", color: "border-blue-200 bg-blue-50", titleColor: "text-blue-700", icon: Calendar, bucket: data.today },
    { key: "tomorrow", title: "Tomorrow", color: "border-slate-200 bg-white", titleColor: "text-slate-700", icon: ArrowRight, bucket: data.tomorrow },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="daily-planner-grid">
      {buckets.map(({ key, title, color, titleColor, icon: Icon, bucket }) => (
        <Card key={key} className={`${color}`}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 font-medium ${titleColor}`}>
                <Icon className="w-4 h-4" />
                {title}
              </div>
              <Badge variant="outline" className="text-xs">{bucket?.count || 0}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {(bucket?.tasks || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No tasks</p>
                ) : (
                  bucket.tasks.map((t) => <PlannerTaskMini key={t.id} task={t} />)
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};


/** Weekly grid: 7 day columns with hours / capacity bar */
const WeeklyGrid = ({ days, capacityHours }) => {
  if (!days?.length) {
    return <div className="text-center py-12 text-sm text-slate-500">No scheduled tasks this week</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-2" data-testid="weekly-planner-grid">
      {days.map((d) => {
        const utilization = capacityHours > 0 ? Math.min(100, (d.total_hours / capacityHours) * 100) : 0;
        const isOver = d.total_hours > capacityHours && capacityHours > 0;
        return (
          <Card key={d.date} className="overflow-hidden">
            <CardHeader className="py-2 px-3 bg-slate-50">
              <div className="text-xs font-medium text-slate-700">{d.day_name.slice(0, 3)}</div>
              <div className="text-[10px] text-slate-400">{d.date.slice(5)}</div>
            </CardHeader>
            <CardContent className="p-2">
              <div className="text-xs font-semibold mb-1">
                {d.total_hours.toFixed(1)}h
                {capacityHours > 0 && <span className="text-slate-400 font-normal">/{capacityHours}h</span>}
              </div>
              {capacityHours > 0 && (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full ${isOver ? "bg-red-500" : utilization > 80 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${utilization}%` }}
                  />
                </div>
              )}
              <ScrollArea className="h-[200px]">
                <div className="space-y-1">
                  {d.tasks.length === 0 ? (
                    <p className="text-[10px] text-slate-300 text-center py-2">—</p>
                  ) : (
                    d.tasks.map((t) => <PlannerTaskMini key={t.id} task={t} compact />)
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};


/** 14-day grid: 2 rows of 7 day-cards each */
const FourteenDayGrid = ({ buckets, totalTasks }) => (
  <div className="space-y-2">
    <div className="text-xs text-slate-500" data-testid="planner-summary-14">
      {totalTasks} task{totalTasks === 1 ? "" : "s"} scheduled in the next 14 days
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
      {buckets.map((b) => {
        const util = b.capacityHours > 0 ? Math.min(100, (b.hours / b.capacityHours) * 100) : 0;
        const isOver = b.hours > b.capacityHours && b.capacityHours > 0;
        return (
          <Card key={b.key} className="overflow-hidden">
            <CardHeader className="py-1.5 px-2 bg-slate-50">
              <div className="text-[10px] text-slate-500 truncate">{b.label}</div>
            </CardHeader>
            <CardContent className="p-2">
              <div className="text-xs font-semibold mb-1">
                {b.hours.toFixed(1)}h
                {b.capacityHours > 0 && <span className="text-slate-400 font-normal">/{b.capacityHours}h</span>}
              </div>
              {b.capacityHours > 0 && (
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full ${isOver ? "bg-red-500" : util > 80 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${util}%` }}
                  />
                </div>
              )}
              <div className="text-[10px] text-slate-500">
                {b.tasks.length} task{b.tasks.length === 1 ? "" : "s"}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </div>
);


/** 90-day grid: weekly buckets */
const NinetyDayGrid = ({ buckets, totalTasks }) => (
  <div className="space-y-2">
    <div className="text-xs text-slate-500" data-testid="planner-summary-90">
      {totalTasks} task{totalTasks === 1 ? "" : "s"} scheduled in the next 90 days (weekly buckets)
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
      {buckets.map((b) => {
        const util = b.capacityHours > 0 ? Math.min(100, (b.hours / b.capacityHours) * 100) : 0;
        const isOver = b.hours > b.capacityHours && b.capacityHours > 0;
        return (
          <Card key={b.key} className="overflow-hidden">
            <CardHeader className="py-1.5 px-2 bg-slate-50">
              <div className="text-[10px] text-slate-500 truncate">{b.label}</div>
            </CardHeader>
            <CardContent className="p-2">
              <div className="text-xs font-semibold mb-1">
                {b.hours.toFixed(1)}h
                {b.capacityHours > 0 && (
                  <span className="text-slate-400 font-normal">/{b.capacityHours}h</span>
                )}
              </div>
              {b.capacityHours > 0 && (
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full ${isOver ? "bg-red-500" : util > 80 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${util}%` }}
                  />
                </div>
              )}
              <div className="text-[10px] text-slate-500">
                {b.tasks.length} task{b.tasks.length === 1 ? "" : "s"}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </div>
);


/** Compact task row used inside planner buckets */
const PlannerTaskMini = ({ task, compact = false }) => {
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  return (
    <div className="p-1.5 bg-white border border-slate-100 rounded text-xs hover:border-slate-200 transition-colors">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-medium text-[11px]">{task.task_name}</span>
        <Badge className={`text-[9px] px-1 py-0 ${priorityConfig.color}`}>
          {priorityConfig.label.charAt(0)}
        </Badge>
      </div>
      {!compact && (
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
          <span className="truncate">{task.equipment_name}</span>
          <span className="ml-auto whitespace-nowrap">{task.estimated_hours}h</span>
        </div>
      )}
    </div>
  );
};


const MaintenanceScheduleManager = ({ equipmentType }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("timeline");
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [aiPlanOpen, setAiPlanOpen] = useState(false);
  const [aiPlanResult, setAiPlanResult] = useState(null);
  const [selectedAiRecs, setSelectedAiRecs] = useState(new Set());

  const equipmentTypeId = equipmentType?.id;
  const equipmentTypeName = equipmentType?.name || "All Equipment";
  const isGlobalView = !equipmentTypeId;

  // ============= Queries =============

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ["maintenance-scheduler-dashboard", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getDashboard(equipmentTypeId),
  });

  const { data: programsSummary, isLoading: programsLoading } = useQuery({
    queryKey: ["maintenance-scheduler-programs-summary", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getProgramsSummary(equipmentTypeId),
    enabled: !!equipmentTypeId,
  });

  const { data: timeline, isLoading: timelineLoading, refetch: refetchTimeline } = useQuery({
    queryKey: ["maintenance-scheduler-timeline", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getTimeline(equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {}),
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["maintenance-scheduler-tasks", equipmentTypeId || "all"],
    queryFn: () => maintenanceSchedulerAPI.getTasks(equipmentTypeId ? { equipment_type_id: equipmentTypeId } : {}),
  });

  const { data: affectedEquipmentData } = useQuery({
    queryKey: ["maintenance-strategy-v2-affected-equipment", equipmentTypeId],
    queryFn: () => maintenanceStrategyV2API.getAffectedEquipment(equipmentTypeId),
    enabled: !!equipmentTypeId,
  });

  // ============= Mutations =============

  const runSchedulerMutation = useMutation({
    mutationFn: (params) => maintenanceSchedulerAPI.runScheduler(params),
    onSuccess: (data) => {
      toast.success(`Scheduler completed: ${data.tasks_created} tasks created`);
      queryClient.invalidateQueries(["maintenance-scheduler"]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to run scheduler");
    },
  });

  const applyStrategyMutation = useMutation({
    mutationFn: (equipmentIds) => maintenanceSchedulerAPI.applyStrategy(equipmentTypeId, equipmentIds),
    onSuccess: (data) => {
      toast.success(`Strategy applied: ${data.programs_created} programs created`);
      setApplyDialogOpen(false);
      queryClient.invalidateQueries(["maintenance-scheduler"]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to apply strategy");
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
      toast.error(err.response?.data?.detail || "AI planner failed");
    },
  });

  const applyAiPlanMutation = useMutation({
    mutationFn: (recs) => maintenanceSchedulerAPI.applyAiPlan(recs),
    onSuccess: (data) => {
      toast.success(`AI plan applied: ${data.tasks_updated} tasks updated`);
      setAiPlanOpen(false);
      setAiPlanResult(null);
      setSelectedAiRecs(new Set());
      queryClient.invalidateQueries(["maintenance-scheduler"]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Failed to apply AI plan");
    },
  });

  // ============= Handlers =============

  const handleRunScheduler = () => {
    runSchedulerMutation.mutate({ equipment_type_id: equipmentTypeId });
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
            {equipmentTypeName} <span className="text-slate-400 font-normal">|</span> Maintenance Schedule
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
            Apply Strategy
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
                  AI Planner
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
                  Run Scheduler
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

      {/* Programs Summary */}
      {programsSummary && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-sm text-slate-500">Equipment with Programs</p>
                  <p className="text-xl font-bold">{programsSummary.equipment_count}</p>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <p className="text-sm text-slate-500">Total Programs</p>
                  <p className="text-xl font-bold">{programsSummary.total_programs}</p>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <p className="text-sm text-slate-500">Programs Overdue</p>
                  <p className={`text-xl font-bold ${programsSummary.overdue_count > 0 ? "text-red-600" : ""}`}>
                    {programsSummary.overdue_count}
                  </p>
                </div>
              </div>
              {!hasPrograms && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    No maintenance programs yet. Apply the strategy to equipment to create programs.
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
            Timeline
          </TabsTrigger>
          <TabsTrigger value="planner" className="text-xs" data-testid="tab-planner">
            <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
            Planner
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs" data-testid="tab-tasks">
            <ListChecks className="w-3.5 h-3.5 mr-1.5" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="programs" className="text-xs" data-testid="tab-programs">
            <Wrench className="w-3.5 h-3.5 mr-1.5" />
            Programs
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <TimelineView 
            timeline={timeline} 
            isLoading={timelineLoading} 
            onTaskClick={handleTaskClick}
          />
        </TabsContent>

        {/* Planner Tab */}
        <TabsContent value="planner" className="mt-4">
          <PlannerView equipmentTypeId={equipmentTypeId} />
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          <TaskListView 
            tasks={tasksData?.tasks} 
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
                Apply Strategy
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
              AI Maintenance Plan
            </DialogTitle>
            <DialogDescription>
              Review and select recommendations to apply. Each item includes the AI's explicit reasoning.
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
              {aiPlanResult?.tasks_analyzed || 0} tasks analysed,{" "}
              {aiPlanResult?.technicians_considered || 0} technicians considered
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
                ? "Deselect All"
                : "Select All"}
            </Button>
          </div>

          <ScrollArea className="max-h-[420px] pr-2">
            <div className="space-y-2">
              {(aiPlanResult?.recommendations || []).length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500">
                  No recommendations returned.
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
                              {rec.assigned_technician_name || "Unassigned"}
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
              Cancel
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
              Apply {selectedAiRecs.size} Recommendation{selectedAiRecs.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MaintenanceScheduleManager;
