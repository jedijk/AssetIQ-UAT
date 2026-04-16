import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { format, isToday, isBefore, startOfDay, parseISO } from "date-fns";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  Calendar as CalendarIcon,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Wrench,
  Repeat,
  Timer,
  Search,
  Filter,
  MapPin,
  Play,
  Check,
  X,
  Camera,
  Plus,
  Minus,
  FileText,
  ChevronDown,
  Loader2,
  ArrowLeft,
  Upload,
  Zap,
  Target,
  Eye,
  Users,
  Trash2,
  ChevronUp,
  Sparkles,
  ScanEye,
  Paperclip,
  Image,
  WifiOff,
  Wifi,
  RefreshCw,
  CloudOff,
  Cloud,
  Building2,
  Download,
  ArrowUpDown,
  GripVertical,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { Calendar } from "../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from "../lib/utils";
import { useIsMobile } from "../hooks/useIsMobile";
import { imageAnalysisAPI } from "../lib/api";
import { offlineStorage, useOfflineStatus } from "../services/offlineStorage";
import { DISCIPLINES } from "../constants/disciplines";
import TaskExecutionFrame from "../components/task-execution/TaskExecutionFrame";
import TaskCard, { priorityColors, taskTypeIcons, SortableTaskCard } from "../components/task-execution/TaskCard";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// API functions for My Tasks
import { myTasksAPI } from "../lib/api";

// Source badges
const sourceBadges = {
  fmea: { label: "FMEA", color: "bg-purple-100 text-purple-700" },
  observation: { label: "Observation", color: "bg-blue-100 text-blue-700" },
  investigation: { label: "Investigation", color: "bg-indigo-100 text-indigo-700" },
  threat: { label: "Threat", color: "bg-orange-100 text-orange-700" },
  manual: { label: "Manual", color: "bg-slate-100 text-slate-700" },
  recurring: { label: "Recurring", color: "bg-emerald-100 text-emerald-700" },
};

// Sortable Ad-hoc Plan Card Component
const SortableAdhocPlanCard = ({ plan, tasksData, setSelectedTask, setViewMode, executeAdhocMutation }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className={cn(
          "bg-white rounded-lg border border-amber-200 p-4 hover:shadow-md transition-all",
          isDragging && "shadow-lg ring-2 ring-amber-400 opacity-90"
        )}
        data-testid={`adhoc-plan-${plan.id}`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Drag Handle */}
          <div 
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 -ml-1 mr-1 mt-1 touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-5 h-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Title */}
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 flex-shrink-0 text-amber-500" />
              <h3 className="font-medium text-slate-900 truncate">{plan.title}</h3>
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                Ad-hoc
              </Badge>
            </div>
            
            {/* Equipment */}
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
              <MapPin className="w-3.5 h-3.5" />
              <span className="truncate">{plan.equipment_name}</span>
            </div>
            
            {/* Tags Row */}
            <div className="flex flex-wrap items-center gap-1.5">
              {plan.discipline && (
                <Badge variant="outline" className="text-xs bg-slate-50">
                  {plan.discipline}
                </Badge>
              )}
              {plan.has_form && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  <FileText className="w-3 h-3 mr-1" />
                  Form
                </Badge>
              )}
              {plan.execution_count > 0 && (
                <span className="text-xs text-slate-400">
                  Executed {plan.execution_count}x
                </span>
              )}
            </div>
          </div>
          
          {/* Right Side - Execute/Continue Button */}
          <div className="flex flex-col items-end gap-2">
            {plan.has_in_progress_task ? (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-600 hover:bg-amber-50"
                onClick={() => {
                  const task = tasksData?.tasks?.find(t => t.id === plan.in_progress_task_id);
                  if (task) {
                    setSelectedTask(task);
                    setViewMode("execution");
                  } else {
                    executeAdhocMutation.mutate(plan.id);
                  }
                }}
                data-testid={`continue-adhoc-${plan.id}`}
              >
                <Play className="w-4 h-4 mr-1" />
                Continue
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => executeAdhocMutation.mutate(plan.id)}
                disabled={executeAdhocMutation.isPending}
                data-testid={`execute-adhoc-${plan.id}`}
              >
                {executeAdhocMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" />
                    Execute
                  </>
                )}
              </Button>
            )}
            {plan.last_executed_at && (
              <span className="text-xs text-slate-400">
                Last: {format(parseISO(plan.last_executed_at), "MMM d")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Main My Tasks Page Component
const MyTasksPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState("adhoc");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" or "execution"
  const [selectedDiscipline, setSelectedDiscipline] = useState("");
  
  // User-scoped localStorage keys for manual sorting
  const sortKey = user?.id ? `myTasks_manualSort_${user.id}` : "myTasks_manualSort";
  const orderKey = user?.id ? `myTasks_sortOrderByTab_${user.id}` : "myTasks_sortOrderByTab";

  // Manual sorting state - stored per user per tab
  const [isManualSort, setIsManualSort] = useState(() => {
    const key = user?.id ? `myTasks_manualSort_${user.id}` : "myTasks_manualSort";
    return localStorage.getItem(key) === "true";
  });
  const [sortOrderByTab, setSortOrderByTab] = useState(() => {
    try {
      const key = user?.id ? `myTasks_sortOrderByTab_${user.id}` : "myTasks_sortOrderByTab";
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Re-sync if user changes (login switch)
  const prevSortKeyRef = useRef(sortKey);
  useEffect(() => {
    if (prevSortKeyRef.current !== sortKey) {
      prevSortKeyRef.current = sortKey;
      setIsManualSort(localStorage.getItem(sortKey) === "true");
      try {
        const saved = localStorage.getItem(orderKey);
        setSortOrderByTab(saved ? JSON.parse(saved) : {});
      } catch {
        setSortOrderByTab({});
      }
    }
  }, [sortKey, orderKey]);
  
  // Get current tab's sort order
  const manualSortOrder = sortOrderByTab[activeFilter] || [];
  
  // Update sort order for current tab
  const setManualSortOrder = (newOrder) => {
    setSortOrderByTab(prev => ({
      ...prev,
      [activeFilter]: newOrder
    }));
  };
  
  // DnD sensors for both mouse and touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Save manual sort preference per user
  useEffect(() => {
    localStorage.setItem(sortKey, isManualSort.toString());
  }, [isManualSort, sortKey]);
  
  // Save sort orders per user when they change
  useEffect(() => {
    if (Object.keys(sortOrderByTab).length > 0) {
      localStorage.setItem(orderKey, JSON.stringify(sortOrderByTab));
    }
  }, [sortOrderByTab, orderKey]);
  
  // Closure suggestion dialog state
  const [closureSuggestion, setClosureSuggestion] = useState(null);
  
  // Offline support
  const offlineStatus = useOfflineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Cache tasks when fetched for offline access
  const cacheTasksForOffline = useCallback(async (tasks) => {
    try {
      await offlineStorage.cacheTasks(tasks);
    } catch (error) {
      console.error('Failed to cache tasks:', error);
    }
  }, []);
  
  // Manual sync trigger
  const handleManualSync = async () => {
    if (!offlineStatus.isOnline) {
      toast.error("You're offline. Please connect to the internet to sync.");
      return;
    }
    
    setIsSyncing(true);
    try {
      const result = await offlineStorage.syncPendingCompletions();
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} completed task(s)`);
        // Invalidate all my-tasks queries regardless of filters
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === "my-tasks" 
        });
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === "task-instances" 
        });
      }
      if (result.failed > 0) {
        toast.error(`Failed to sync ${result.failed} task(s)`);
      }
      if (result.synced === 0 && result.failed === 0) {
        toast.info("Nothing to sync");
      }
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };
  
  // Available disciplines for filtering (from unified constants)
  const disciplines = DISCIPLINES;
  
  // Fetch tasks with offline caching
  const { data: tasksData, isLoading: tasksLoading, error: tasksError, refetch: refetchTasks } = useQuery({
    queryKey: ["my-tasks", activeFilter, selectedDate, selectedDiscipline],
    queryFn: async () => {
      try {
        const data = await myTasksAPI.getTasks({
          filter: activeFilter,
          date: activeFilter === "open" ? format(selectedDate, "yyyy-MM-dd") : undefined,
          discipline: selectedDiscipline || undefined,
        });
        // Cache tasks for offline access
        if (data?.tasks) {
          cacheTasksForOffline(data.tasks);
        }
        return data;
      } catch (error) {
        // If offline, try to get cached tasks
        if (!offlineStatus.isOnline) {
          const cachedTasks = await offlineStorage.getCachedTasks();
          if (cachedTasks.length > 0) {
            return { tasks: cachedTasks, total: cachedTasks.length, fromCache: true };
          }
        }
        throw error;
      }
    },
    refetchInterval: offlineStatus.isOnline ? 30000 : false, // Only refresh when online
    refetchOnWindowFocus: true, // Refetch when window regains focus
    staleTime: 5000, // Consider data stale after 5 seconds for faster updates
    retry: offlineStatus.isOnline ? 3 : 0,
  });
  
  // Complete task mutation with offline support
  const completeMutation = useMutation({
    mutationFn: async ({ taskId, data, isAction }) => {
      // If offline, save for later sync
      if (!offlineStatus.isOnline) {
        const taskInfo = selectedTask || { title: 'Unknown Task', source_type: isAction ? 'action' : 'task' };
        await offlineStorage.savePendingCompletion(taskId, data, taskInfo);
        // Update local cache to show task as completed
        await offlineStorage.updateCachedTask(taskId, { status: 'completed_offline', completed_at: new Date().toISOString() });
        return { offline: true, taskId };
      }
      // Online: complete normally
      return myTasksAPI.completeTask({ taskId, data, isAction });
    },
    onSuccess: (result) => {
      if (result?.offline) {
        toast.success("Task saved offline! Will sync when connected.", {
          icon: <CloudOff className="w-4 h-4" />,
        });
      } else {
        toast.success("Task completed successfully!");
        
        // Check if all actions for the source are now completed
        if (result?.completion_notification) {
          setClosureSuggestion(result.completion_notification);
        }
      }
      // Invalidate all my-tasks queries regardless of filters
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "my-tasks" 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "task-instances" 
      });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      // Also invalidate actions list since action status changed
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "actions" 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "central-actions" 
      });
      setViewMode("list");
      setSelectedTask(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to complete task");
    },
  });
  
  // Start task mutation
  const startMutation = useMutation({
    mutationFn: ({ taskId, isAction }) => myTasksAPI.startTask(taskId, isAction),
    onSuccess: (data) => {
      // Invalidate all my-tasks queries regardless of filters
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "my-tasks" 
      });
      // Also invalidate actions list since action status changed
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "actions" 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "central-actions" 
      });
      setSelectedTask(data);
    },
  });
  
  // Fetch ad-hoc plans (only when adhoc tab is active)
  const { data: adhocPlansData, isLoading: adhocPlansLoading } = useQuery({
    queryKey: ["adhoc-plans"],
    queryFn: () => myTasksAPI.getAdhocPlans(),
    enabled: activeFilter === "adhoc",
    refetchInterval: 30000,
    staleTime: 10000, // Consider data fresh for 10 seconds
    refetchOnWindowFocus: true,
  });
  
  // Execute ad-hoc plan mutation
  const executeAdhocMutation = useMutation({
    mutationFn: (planId) => myTasksAPI.executeAdhocPlan(planId),
    onSuccess: (newTask) => {
      toast.success("Task started! Redirecting to execution...");
      queryClient.invalidateQueries({ queryKey: ["adhoc-plans"] });
      // Invalidate all my-tasks queries regardless of filters
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "my-tasks" 
      });
      // Also invalidate actions list
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "actions" 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "central-actions" 
      });
      // Open the new task for execution
      setSelectedTask(newTask);
      setViewMode("execution");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to execute ad-hoc plan");
    },
  });
  
  // Delete task state and mutation
  const [deleteTaskData, setDeleteTaskData] = useState(null); // Store full task object for delete
  
  const deleteMutation = useMutation({
    mutationFn: ({ taskId, isAction }) => myTasksAPI.deleteTask(taskId, isAction),
    onSuccess: (_, variables) => {
      const itemType = variables.isAction ? "Action" : "Task";
      toast.success(`${itemType} deleted`);
      // Invalidate all task-related queries for instant sync (use predicate for partial match)
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "my-tasks" 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "task-instances" 
      });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      queryClient.invalidateQueries({ queryKey: ["adhoc-plans"] });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "actions" 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "central-actions" 
      });
      setDeleteTaskData(null);
    },
    onError: (error) => {
      toast.error("Delete failed: " + (error.message || "Unknown error"));
    },
  });
  
  // Handle delete task - store full task object
  const handleDeleteTask = (task) => {
    setDeleteTaskData(task);
  };
  
  // Handle task open
  const handleOpenTask = async (task) => {
    setSelectedTask(task);
    const isAction = task.source_type === "action";
    // Start task if not already started
    if (task.status !== "in_progress") {
      startMutation.mutate({ taskId: task.id, isAction });
    }
    setViewMode("execution");
  };
  
  // Handle quick complete
  const handleQuickComplete = async (task) => {
    const isAction = task.source_type === "action";
    completeMutation.mutate({
      taskId: task.id,
      isAction,
      data: {
        completion_notes: "Quick completed",
        issues_found: [],
        follow_up_required: false,
      }
    });
  };
  
  // Handle task completion
  const handleCompleteTask = async (data) => {
    if (!selectedTask) return;
    const isAction = selectedTask.source_type === "action";
    await completeMutation.mutateAsync({
      taskId: selectedTask.id,
      isAction,
      data,
    });
  };
  
  // Filter tasks based on search and hide completed tasks
  const tasks = tasksData?.tasks || [];
  const filteredTasks = tasks.filter(task => {
    // Hide completed tasks from all views
    if (task.status === "completed" || task.status === "completed_offline") {
      return false;
    }
    // Apply search filter
    if (searchQuery) {
      return task.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.equipment_name?.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });
  
  // Auto sort tasks: Overdue -> High Priority -> Due Soon -> Others
  const autoSortedTasks = [...filteredTasks].sort((a, b) => {
    // Overdue first
    const aOverdue = a.status === "overdue" || (a.due_date && isBefore(parseISO(a.due_date), startOfDay(new Date())));
    const bOverdue = b.status === "overdue" || (b.due_date && isBefore(parseISO(b.due_date), startOfDay(new Date())));
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    
    // Then by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    
    // Then by due date
    if (a.due_date && b.due_date) {
      return new Date(a.due_date) - new Date(b.due_date);
    }
    
    return 0;
  });
  
  // Apply manual sort order if enabled
  const sortedTasks = isManualSort && manualSortOrder.length > 0
    ? [...filteredTasks].sort((a, b) => {
        const aIndex = manualSortOrder.indexOf(a.id);
        const bIndex = manualSortOrder.indexOf(b.id);
        // If both are in the order, sort by their position
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        // If only a is in the order, a comes first
        if (aIndex !== -1) return -1;
        // If only b is in the order, b comes first
        if (bIndex !== -1) return 1;
        // If neither is in the order, use auto sort
        return autoSortedTasks.indexOf(a) - autoSortedTasks.indexOf(b);
      })
    : autoSortedTasks;
  
  // Handle drag end for manual sorting - works for both tasks and adhoc plans
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      // Determine which list we're sorting
      const currentList = activeFilter === "adhoc" ? sortedAdhocPlans : sortedTasks;
      const oldIndex = currentList.findIndex((item) => item.id === active.id);
      const newIndex = currentList.findIndex((item) => item.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(currentList, oldIndex, newIndex).map((item) => item.id);
        setManualSortOrder(newOrder);
        
        // Enable manual sort if not already
        if (!isManualSort) {
          setIsManualSort(true);
        }
      }
    }
  };
  
  // Toggle between manual and auto sort
  const toggleSortMode = () => {
    if (isManualSort) {
      // Switching to auto sort
      setIsManualSort(false);
      toast.info("Auto-sorting by priority & due date");
    } else {
      // Switching to manual sort - capture current order for the active tab
      const currentList = activeFilter === "adhoc" ? sortedAdhocPlans : sortedTasks;
      setManualSortOrder(currentList.map((item) => item.id));
      setIsManualSort(true);
      toast.success("Manual sorting enabled. Drag items to reorder.");
    }
  };
  
  // Calculate stats - adjust for adhoc tab
  const adhocPlans = adhocPlansData?.plans || [];
  const isAdhocTab = activeFilter === "adhoc";
  
  // Sort adhoc plans - manual or default (by last executed, then by title)
  const sortedAdhocPlans = isManualSort && manualSortOrder.length > 0
    ? [...adhocPlans].sort((a, b) => {
        const aIndex = manualSortOrder.indexOf(a.id);
        const bIndex = manualSortOrder.indexOf(b.id);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        // Default sort: in-progress first, then by last executed
        if (a.has_in_progress_task && !b.has_in_progress_task) return -1;
        if (!a.has_in_progress_task && b.has_in_progress_task) return 1;
        return (a.title || "").localeCompare(b.title || "");
      })
    : [...adhocPlans].sort((a, b) => {
        // Default: in-progress tasks first, then alphabetically
        if (a.has_in_progress_task && !b.has_in_progress_task) return -1;
        if (!a.has_in_progress_task && b.has_in_progress_task) return 1;
        return (a.title || "").localeCompare(b.title || "");
      });
  
  const stats = {
    total: isAdhocTab ? adhocPlans.length : tasks.length,
    overdue: tasks.filter(t => t.status === "overdue").length,
    today: tasks.filter(t => t.due_date && isToday(parseISO(t.due_date))).length,
    inProgress: isAdhocTab 
      ? adhocPlans.filter(p => p.has_in_progress_task).length 
      : tasks.filter(t => t.status === "in_progress").length,
    open: isAdhocTab 
      ? adhocPlans.filter(p => !p.has_in_progress_task).length
      : tasks.filter(t => t.source_type === "action" || (t.source_type === "task" && t.status === "in_progress")).length,
  };
  
  // Handle back from execution frame
  const handleBackFromExecution = () => {
    setViewMode("list");
    setSelectedTask(null);
  };
  
  // If in execution mode, show the execution frame
  if (viewMode === "execution" && selectedTask) {
    return (
      <div className="h-[calc(100vh-64px)]">
        <TaskExecutionFrame
          task={selectedTask}
          onBack={handleBackFromExecution}
          onComplete={handleCompleteTask}
        />
      </div>
    );
  }
  
  // Default: Task List View
  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Offline Banner */}
      {!offlineStatus.isOnline && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4" />
            <span>You're offline. Tasks will sync when connected.</span>
          </div>
          {offlineStatus.pendingCount > 0 && (
            <Badge variant="secondary" className="bg-amber-600 text-white">
              {offlineStatus.pendingCount} pending
            </Badge>
          )}
        </div>
      )}
      
      {/* Sync Banner - Show when online with pending items */}
      {offlineStatus.isOnline && offlineStatus.pendingCount > 0 && (
        <div className="bg-blue-500 text-white px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            <span>{offlineStatus.pendingCount} task(s) completed offline, ready to sync</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-white text-blue-600 hover:bg-blue-50"
            onClick={handleManualSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 mr-1" />
                Sync Now
              </>
            )}
          </Button>
        </div>
      )}
      
      {/* Fixed Header - Mobile Optimized Minimalist */}
      <div className="flex-shrink-0">
        <div className="px-4 sm:px-6 pt-3 pb-3 max-w-7xl mx-auto w-full">
          {/* Title Row - Compact on mobile */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">My Tasks</h1>
              {/* Mobile: Inline stats next to title */}
              <div className="flex sm:hidden items-center gap-1.5">
                <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs font-medium">{stats.total}</span>
                {stats.overdue > 0 && (
                  <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-medium">{stats.overdue}</span>
                )}
              </div>
              {/* Online/Offline indicator - small */}
              {offlineStatus.isOnline ? (
                <Wifi className="w-4 h-4 text-green-500 hidden sm:block" />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-500" />
              )}
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">Execute and complete your assigned tasks</p>
            {/* Mobile: Close button */}
            <button
              onClick={() => navigate("/dashboard")}
              className="sm:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              data-testid="my-tasks-close-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        
          {/* Filters Row - Aligned single row */}
          <div className="flex items-center gap-2 mb-2">
            {/* Search - Flexible width */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
                data-testid="task-search"
              />
            </div>
            
            {/* Discipline Filter */}
            <Select value={selectedDiscipline || "all"} onValueChange={(v) => setSelectedDiscipline(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[90px] sm:w-[140px] h-9 text-xs sm:text-sm" data-testid="discipline-filter">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Disciplines</SelectItem>
                {disciplines.map((disc) => (
                  <SelectItem key={disc.value} value={disc.value}>
                    {disc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Date Picker - Desktop only */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "hidden sm:flex w-[140px] h-9 text-sm justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                  data-testid="date-filter"
                >
                  <CalendarIcon className="mr-1.5 h-4 w-4" />
                  <span className="truncate">{selectedDate ? format(selectedDate, "MMM d") : "Date"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            {/* Sort Mode Toggle */}
            <Button
              variant={isManualSort ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-9 px-2 sm:px-3",
                isManualSort && "bg-slate-200 hover:bg-slate-300 text-slate-700"
              )}
              onClick={toggleSortMode}
              data-testid="sort-toggle"
              title={isManualSort ? "Manual sorting enabled (drag to reorder)" : "Auto-sorting by priority"}
            >
              {isManualSort ? (
                <>
                  <GripVertical className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">Manual</span>
                </>
              ) : (
                <>
                  <ArrowUpDown className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">Auto</span>
                </>
              )}
            </Button>
          </div>
          
          {/* Quick Filter Tabs */}
          <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-4 mb-2 sm:mb-0">
                <TabsTrigger value="open" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="filter-open">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Open</span>
                  {stats.today > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px] hidden sm:flex">{stats.today}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="overdue" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="filter-overdue">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Overdue</span>
                  {stats.overdue > 0 && (
                    <Badge variant="destructive" className="ml-0.5 h-4 px-1 text-[10px] hidden sm:flex">{stats.overdue}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="recurring" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="filter-recurring">
                  <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Recurring</span>
                </TabsTrigger>
                <TabsTrigger value="adhoc" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="filter-adhoc">
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">Adhoc</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
          
          {/* Stats Summary - Desktop only */}
          <div className="hidden sm:grid grid-cols-4 gap-2 mt-2">
            <div className="bg-slate-50 rounded-lg p-1.5 text-center">
              <div className="text-base font-bold text-slate-900">{stats.total}</div>
              <div className="text-[10px] text-slate-500">Total</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-1.5 text-center">
              <div className="text-base font-bold text-amber-600">{stats.inProgress}</div>
              <div className="text-[10px] text-slate-500">In Progress</div>
            </div>
            <div className="bg-red-50 rounded-lg p-1.5 text-center">
              <div className="text-base font-bold text-red-600">{stats.overdue}</div>
              <div className="text-[10px] text-slate-500">Overdue</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-1.5 text-center">
              <div className="text-base font-bold text-blue-600">{stats.open}</div>
              <div className="text-[10px] text-slate-500">Open</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Scrollable Task List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
        <div className="max-w-7xl mx-auto">
          {/* Task List or Ad-hoc Plans */}
          <div className="space-y-3 pt-2">
        {activeFilter === "adhoc" ? (
          // Ad-hoc Plans View
          adhocPlansLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500">Loading ad-hoc plans...</p>
            </div>
          ) : (adhocPlansData?.plans || []).length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <Zap className="w-12 h-12 mx-auto text-amber-400 mb-3" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No ad-hoc plans available</h3>
              <p className="text-slate-500 mb-4">Create ad-hoc task plans in the Task Planner</p>
              <Button variant="outline" onClick={() => setActiveFilter("today")}>
                View scheduled tasks
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={sortedAdhocPlans.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {sortedAdhocPlans.map((plan) => (
                  <SortableAdhocPlanCard
                    key={plan.id}
                    plan={plan}
                    tasksData={tasksData}
                    setSelectedTask={setSelectedTask}
                    setViewMode={setViewMode}
                    executeAdhocMutation={executeAdhocMutation}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )
        ) : (
          // Regular Tasks View
          tasksLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500">Loading tasks...</p>
            </div>
          ) : tasksError ? (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
              <p className="text-red-600">Failed to load tasks</p>
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-400 mb-3" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">No tasks for {activeFilter}</h3>
              <p className="text-slate-500 mb-4">You're all caught up!</p>
              <Button variant="outline" onClick={() => setActiveFilter("open")}>
                View open tasks
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={sortedTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {sortedTasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onOpen={handleOpenTask}
                    onQuickComplete={handleQuickComplete}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )
        )}
      </div>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTaskData} onOpenChange={(open) => !open && setDeleteTaskData(null)}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)] mx-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              Delete {deleteTaskData?.source_type === "action" ? "Action" : "Task"}
            </DialogTitle>
            <DialogDescription className="text-sm">
              <span className="block">Are you sure you want to delete this item?</span>
              <span className="block mt-2 font-medium text-slate-700 line-clamp-2 break-words">
                "{deleteTaskData?.title}"
              </span>
              <span className="block mt-2 text-xs text-slate-500">This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteTaskData(null)}
              disabled={deleteMutation.isPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteMutation.mutate({ 
                taskId: deleteTaskData?.id, 
                isAction: deleteTaskData?.source_type === "action" 
              })}
              disabled={deleteMutation.isPending}
              className="w-full sm:w-auto"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Closure Suggestion Dialog */}
      <Dialog open={!!closureSuggestion} onOpenChange={() => setClosureSuggestion(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              All Actions Completed
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 mb-3 p-3 bg-green-50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">
                  {closureSuggestion?.total_actions} action{closureSuggestion?.total_actions !== 1 ? 's' : ''} completed
                </p>
                <p className="text-xs text-green-600 mt-1">
                  {closureSuggestion?.source_name}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              {closureSuggestion?.message || `All corrective actions for this ${closureSuggestion?.source_type === 'threat' ? 'observation' : 'investigation'} have been completed.`}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setClosureSuggestion(null)}>
              Dismiss
            </Button>
            <Button
              onClick={() => {
                const sourceType = closureSuggestion?.source_type;
                const sourceId = closureSuggestion?.source_id;
                setClosureSuggestion(null);
                if (sourceType === 'threat') {
                  navigate(`/observations/${sourceId}`);
                } else if (sourceType === 'investigation') {
                  navigate(`/causal-engine?investigation=${sourceId}`);
                }
              }}
            >
              Go to {closureSuggestion?.source_type === 'threat' ? 'Observation' : 'Investigation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
};

export default MyTasksPage;
