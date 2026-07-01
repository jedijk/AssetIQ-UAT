import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useEffectiveRole } from "../../contexts/RolePreviewContext";
import { useDisciplineFilterOptional } from "../../contexts/DisciplineFilterContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { taskPriorityRank } from "./myTasksShared";
import { AdhocPlanCardContent, SortableAdhocPlanCard } from "./AdhocPlanCard";
import { MyTasksOfflineBanner } from "./MyTasksOfflineBanner";
import { MyTasksPageHeader } from "./MyTasksPageHeader";
import { MyTasksTaskList } from "./MyTasksTaskList";
import { MyTasksDeleteDialog } from "./MyTasksDeleteDialog";
import { MyTasksClosureDialog } from "./MyTasksClosureDialog";


import { useEquipmentNodeNameMap, useEquipmentTypeNameMap } from "../../hooks/useTranslatedEntities";
import { toast } from "sonner";
import { format, isToday, isBefore, startOfDay, parseISO } from "date-fns";
import { useNotificationTriggers } from "../../hooks/useNotificationTriggers";
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
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Calendar } from "../../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { imageAnalysisAPI, preferencesAPI } from "../../lib/api";
import { offlineStorage, useOfflineStatus } from "../../services/offlineStorage";
import { DISCIPLINES, getDisciplineLabel } from "../../constants/disciplines";
import {
  filterActiveWorkItems,
  getApiDisciplineParam,
  itemMatchesDisciplines,
  preferenceFromDisciplines,
  resolveMyTasksDisciplines,
} from "../../lib/myTasksFilterUtils";
import { queryKeys } from "../../lib/queryKeys";
import TaskExecutionFrame from "../../components/task-execution/TaskExecutionFrame";
import TaskCard, { SortableTaskCard } from "../../components/task-execution/TaskCard";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AppErrorBoundary } from "../../components/AppErrorBoundary";
import { useMobilePageBadge } from "../../contexts/BreadcrumbContext";
import { motion } from "framer-motion";
import { pageTransition, pageVariants } from "../../components/animations/constants";
import { isTouchMobileDevice } from "../../lib/deviceUtils";

// API functions for My Tasks
import { myTasksAPI } from "../../lib/api";
import { printLabel } from "../../lib/printLabel";

// Main My Tasks Page Component
export default function MyTasksPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { effectiveRole } = useEffectiveRole();
  const globalDisciplineFilter = useDisciplineFilterOptional();
  const globalDisciplineActive = Boolean(globalDisciplineFilter?.isActive);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidateTaskListQueries = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === queryKeys.myTasks.prefix ||
        query.queryKey[0] === queryKeys.myTasks.countPrefix ||
        query.queryKey[0] === queryKeys.myTasks.operatorCountsPrefix,
    });
  }, [queryClient]);
  const [activeFilter, setActiveFilter] = useState("open");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" or "execution"
  const [selectedDisciplines, setSelectedDisciplines] = useState([]);
  const [disciplineDropdownOpen, setDisciplineDropdownOpen] = useState(false);

  // Close Radix dropdown portals before swapping tab content (adhoc vs tasks).
  useEffect(() => {
    setDisciplineDropdownOpen(false);
  }, [activeFilter]);
  const userChangedDisciplineRef = useRef(false);
  const [secondaryQueriesEnabled, setSecondaryQueriesEnabled] = useState(false);

  const { data: preferences } = useQuery({
    queryKey: queryKeys.users.preferences(),
    queryFn: preferencesAPI.getPreferences,
    staleTime: 60000,
  });

  const updateDisciplinePreference = useMutation({
    mutationFn: (discipline) => preferencesAPI.updatePreferences({ discipline }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.preferences() });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.myTasks.operatorCountsPrefix,
      });
    },
  });

  const persistDisciplineSelection = useCallback(
    (nextDisciplines) => {
      const discipline = preferenceFromDisciplines(nextDisciplines);
      if (discipline !== undefined) {
        updateDisciplinePreference.mutate(discipline);
      }
    },
    [updateDisciplinePreference]
  );

  const isMobileView = useIsMobile();
  const touchMobile = isTouchMobileDevice();
  /** @dnd-kit often faults on touch mobile WebViews — render plain lists instead. */
  const canUseDnD =
    typeof ResizeObserver !== "undefined" && !isMobileView && !touchMobile;
  
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
  
  // Save manual sort preference per user (skip initial sync)
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (hasMountedRef.current) {
      localStorage.setItem(sortKey, isManualSort.toString());
    }
    hasMountedRef.current = true;
  }, [isManualSort, sortKey]);
  
  // Save sort orders per user when they change
  useEffect(() => {
    if (hasMountedRef.current && Object.keys(sortOrderByTab).length > 0) {
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
        invalidateTaskListQueries();
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

  const toggleDiscipline = (value) => {
    userChangedDisciplineRef.current = true;
    setSelectedDisciplines((prev) => {
      const next = prev.includes(value)
        ? prev.filter((d) => d !== value)
        : [...prev, value];
      persistDisciplineSelection(next);
      return next;
    });
  };

  const clearDisciplineFilter = () => {
    userChangedDisciplineRef.current = true;
    setSelectedDisciplines([]);
    persistDisciplineSelection([]);
  };

  const getDisciplineDisplayText = () => {
    if (selectedDisciplines.length === 0) {
      return isMobileView ? t("common.discipline") : t("disciplines.allDisciplines");
    }
    if (selectedDisciplines.length === 1) {
      return getDisciplineLabel(selectedDisciplines[0]);
    }
    if (isMobileView) {
      return `${selectedDisciplines.length} ${t("observations.selected")}`;
    }
    return `${getDisciplineLabel(selectedDisciplines[0])} +${selectedDisciplines.length - 1}`;
  };

  const matchesDisciplineFilter = (item) =>
    globalDisciplineActive
      ? globalDisciplineFilter.matchesItem(item)
      : itemMatchesDisciplines(item, selectedDisciplines);

  const filterDisciplines = globalDisciplineActive
    ? globalDisciplineFilter.selectedDisciplineIds
    : selectedDisciplines;

  const apiDisciplineParam = globalDisciplineActive
    ? undefined
    : getApiDisciplineParam(selectedDisciplines);

  // Seed discipline filter from saved preference or role-based defaults (shared with operator landing).
  useEffect(() => {
    if (!preferences || userChangedDisciplineRef.current || selectedDisciplines.length > 0) {
      return;
    }
    setSelectedDisciplines(resolveMyTasksDisciplines(effectiveRole, preferences.discipline));
  }, [preferences, selectedDisciplines.length, effectiveRole]);
  
  // Fetch tasks with offline caching
  const { data: tasksData, isLoading: tasksLoading, error: tasksError, refetch: refetchTasks } = useQuery({
    queryKey: queryKeys.myTasks.list(activeFilter, selectedDate, filterDisciplines),
    queryFn: async () => {
      try {
        const data = await myTasksAPI.getTasks({
          filter: activeFilter,
          date: activeFilter === "open" ? format(selectedDate, "yyyy-MM-dd") : undefined,
          discipline: apiDisciplineParam,
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
    refetchInterval: offlineStatus.isOnline ? 30000 : false,
    staleTime: 30000,
    retry: offlineStatus.isOnline ? 3 : 0,
    enabled: !!user,
  });

  // Defer tab badge counts and ad-hoc plans until the primary task list has loaded.
  useEffect(() => {
    if (!user || tasksLoading) {
      setSecondaryQueriesEnabled(false);
      return;
    }
    const enable = () => setSecondaryQueriesEnabled(true);
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(enable, { timeout: 2500 });
      return () => cancelIdleCallback(id);
    }
    const timer = setTimeout(enable, 800);
    return () => clearTimeout(timer);
  }, [user, tasksLoading]);

  // Trigger push notifications for new tasks assigned to this user
  useNotificationTriggers({
    tasks: tasksData?.tasks || [],
    actions: [],
    observations: [],
    enabled: !!user,
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
          const notification = result.completion_notification;
          if (notification.auto_mitigated) {
            toast.success(notification.message || "Observation moved to Mitigated");
            queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
          } else {
            setClosureSuggestion(notification);
          }
        }

        // Trigger label printing if configured on the form
        const labelCfg = result?.label_print_config
          || selectedTask?.form_template?.label_print_config
          || selectedTask?.label_print_config;
        const submissionId = result?.form_submission_id;
        console.log("[LabelPrint] result keys:", Object.keys(result || {}), "labelCfg:", labelCfg, "submissionId:", submissionId);
        const resolveTemplateId = async () => {
          const fallback = labelCfg?.label_template_id || "";
          if (!submissionId) return fallback;
          try {
            const { api } = await import("../../lib/apiClient");
            const res = await api.get(`/form-submissions/${submissionId}`);
            return res.data?.label_template_id || fallback;
          } catch {
            return fallback;
          }
        };

        if (labelCfg?.enabled && labelCfg?.label_template_id && submissionId) {
          const trigger = labelCfg.trigger || "manual";
          (async () => {
          if (trigger === "on_submit" || trigger === "both") {
            // On mobile (iOS especially), window.open after an async chain is
            // blocked. Always route auto-print through a sticky toast action
            // that the user taps — making it a true user gesture.
            const { isMobileDevice } = await import("../../lib/printLabel");
            const mobile = isMobileDevice();

            if (!mobile) {
              // Desktop: can auto-print via hidden iframe, no user gesture needed
              (async () => {
                try {
                  const { printLabel } = await import("../../lib/printLabel");
                  const templateId = await resolveTemplateId();
                  await printLabel({
                    template_id: templateId,
                    submission_id: submissionId,
                    copies: 1,
                  });
                  toast.success("Label sent to printer");
                } catch (err) {
                  toast.error("Label auto-print failed");
                }
              })();
            } else {
              // Mobile: sticky toast with Print action — tap fires window.open
              toast.success(labelCfg.button_label || "Print Label", {
                description: "Tap Print to open the label preview",
                action: {
                  label: "Print",
                  onClick: () => {
                    (async () => {
                      try {
                        const { printLabel } = await import("../../lib/printLabel");
                        const templateId = await resolveTemplateId();
                        await printLabel({
                          template_id: templateId,
                          submission_id: submissionId,
                          copies: 1,
                        });
                      } catch (_e) {
                        toast.error("Label print failed");
                      }
                    })();
                  },
                },
                duration: 20000,
              });
            }
          } else if (trigger === "manual") {
            toast.success(labelCfg.button_label || "Print Label", {
              description: "Tap Print to open the label preview",
              action: {
                label: "Print",
                onClick: () => {
                  (async () => {
                    try {
                      const { printLabel } = await import("../../lib/printLabel");
                      const templateId = await resolveTemplateId();
                      await printLabel({
                        template_id: templateId,
                        submission_id: submissionId,
                        copies: 1,
                      });
                    } catch (_e) {
                      toast.error("Label print failed");
                    }
                  })();
                },
              },
              duration: 20000,
            });
          }
          })();
        }
      }
      invalidateTaskListQueries();
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
      invalidateTaskListQueries();
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
  
  // Per-tab counts (respect discipline filter selection)
  const filterCountQueries = useQueries({
    queries: ["open", "overdue", "recurring"].map((filter) => ({
      queryKey: queryKeys.myTasks.filterCount(filter, filterDisciplines, selectedDate, user?.id),
      queryFn: async () => {
        const data = await myTasksAPI.getTasks({
          filter,
          date: filter === "open" ? format(selectedDate, "yyyy-MM-dd") : undefined,
          discipline: apiDisciplineParam,
        });
        return filterActiveWorkItems(data.tasks, filterDisciplines).length;
      },
      enabled: !!user && activeFilter !== filter && secondaryQueriesEnabled,
      staleTime: 30000,
    })),
  });

  const activeTabCount = useMemo(() => {
    if (!tasksData?.tasks || activeFilter === "adhoc") return undefined;
    return filterActiveWorkItems(tasksData.tasks, filterDisciplines).length;
  }, [tasksData, filterDisciplines, activeFilter]);

  const filterCounts = {
    open:
      activeFilter === "open" && activeTabCount != null
        ? activeTabCount
        : filterCountQueries[0]?.data ?? 0,
    overdue:
      activeFilter === "overdue" && activeTabCount != null
        ? activeTabCount
        : filterCountQueries[1]?.data ?? 0,
    recurring:
      activeFilter === "recurring" && activeTabCount != null
        ? activeTabCount
        : filterCountQueries[2]?.data ?? 0,
    adhoc: 0,
  };

  // Fetch ad-hoc plans (for adhoc tab + badge counts)
  const { data: adhocPlansData, isLoading: adhocPlansLoading } = useQuery({
    queryKey: ["adhoc-plans"],
    queryFn: () => myTasksAPI.getAdhocPlans(),
    enabled: !!user && (activeFilter === "adhoc" || secondaryQueriesEnabled),
    staleTime: 30000,
  });
  
  // Execute ad-hoc plan mutation
  const executeAdhocMutation = useMutation({
    mutationFn: (planId) => myTasksAPI.executeAdhocPlan(planId),
    onSuccess: (newTask) => {
      toast.success("Task started! Redirecting to execution...");
      queryClient.invalidateQueries({ queryKey: ["adhoc-plans"] });
      invalidateTaskListQueries();
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
      invalidateTaskListQueries();
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "task-instances" 
      });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      queryClient.invalidateQueries({ queryKey: ["task-plans"] });
      queryClient.invalidateQueries({ queryKey: ["adhoc-plans"] });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "actions" 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "central-actions" 
      });
      // Also invalidate overdue actions in notifications
      queryClient.invalidateQueries({ queryKey: ["overdue-actions"] });
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
    // Apply discipline filter (API only handles single discipline param)
    if (filterDisciplines.length > 0 && !matchesDisciplineFilter(task)) {
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
    
    // Then by priority (API may send "High" / "Medium" — normalize)
    const pr = taskPriorityRank(a.priority) - taskPriorityRank(b.priority);
    if (pr !== 0) return pr;
    
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
  const adhocPlans = (adhocPlansData?.plans || []).filter(matchesDisciplineFilter);
  const isAdhocTab = activeFilter === "adhoc";
  const tabCounts = { ...filterCounts, adhoc: adhocPlans.length };
  
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
    total: isAdhocTab ? adhocPlans.length : filteredTasks.length,
    overdue: filteredTasks.filter((t) => t.status === "overdue").length,
    today: filteredTasks.filter((t) => t.due_date && isToday(parseISO(t.due_date))).length,
    inProgress: isAdhocTab
      ? adhocPlans.filter((p) => p.has_in_progress_task).length
      : filteredTasks.filter((t) => t.status === "in_progress").length,
    open: isAdhocTab
      ? adhocPlans.filter((p) => !p.has_in_progress_task).length
      : filteredTasks.filter(
          (t) =>
            t.source_type === "action" ||
            (t.source_type === "task" && t.status === "in_progress")
        ).length,
  };

  const mobileListBadge = useMemo(
    () => (
      <>
        <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs font-medium">{stats.total}</span>
        {stats.overdue > 0 && (
          <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-medium">{stats.overdue}</span>
        )}
      </>
    ),
    [stats.total, stats.overdue],
  );
  useMobilePageBadge(mobileListBadge);
  
  // Handle back from execution frame
  const handleBackFromExecution = () => {
    setViewMode("list");
    setSelectedTask(null);
  };
  
  // If in execution mode, show the execution frame
  if (viewMode === "execution" && selectedTask) {
    const ExecutionShell = touchMobile ? "div" : motion.div;
    return (
      <ExecutionShell
        className="fixed inset-x-0 bottom-0 z-[36] flex flex-col min-h-0 overflow-hidden bg-slate-50"
        style={{ top: "var(--app-header-offset)" }}
        data-testid="task-execution-shell"
        {...(touchMobile
          ? {}
          : {
              variants: pageVariants,
              initial: "initial",
              animate: "animate",
              exit: "exit",
              transition: pageTransition,
            })}
      >
        <AppErrorBoundary
          context="TaskExecutionFrame"
          title="Form crashed"
          subtitle="This form hit an error while you were filling it in. Tap reload and try again."
        >
          <div className="flex-1 min-h-0 flex flex-col">
            <TaskExecutionFrame
              task={selectedTask}
              onBack={handleBackFromExecution}
              onComplete={handleCompleteTask}
              onDelete={(task) => {
                handleBackFromExecution();
                handleDeleteTask(task);
              }}
            />
          </div>
        </AppErrorBoundary>
      </ExecutionShell>
    );
  }
  
  // Default: Task List View
  return (
    <div className="app-page-shell">
      <MyTasksOfflineBanner offlineStatus={offlineStatus} isSyncing={isSyncing} onSync={handleManualSync} />

      <MyTasksPageHeader
        stats={stats}
        offlineStatus={offlineStatus}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        disciplineDropdownOpen={disciplineDropdownOpen}
        setDisciplineDropdownOpen={setDisciplineDropdownOpen}
        selectedDisciplines={selectedDisciplines}
        getDisciplineLabel={getDisciplineLabel}
        getDisciplineDisplayText={getDisciplineDisplayText}
        clearDisciplineFilter={clearDisciplineFilter}
        disciplines={disciplines}
        toggleDiscipline={toggleDiscipline}
        hideDisciplineFilter={globalDisciplineActive}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        isManualSort={isManualSort}
        toggleSortMode={toggleSortMode}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        tabCounts={tabCounts}
        t={t}
      />

      <MyTasksTaskList
        activeFilter={activeFilter}
        adhocPlansLoading={adhocPlansLoading}
        adhocPlans={adhocPlans}
        sortedAdhocPlans={sortedAdhocPlans}
        canUseDnD={canUseDnD}
        sensors={sensors}
        handleDragEnd={handleDragEnd}
        tasksData={tasksData}
        setSelectedTask={setSelectedTask}
        setViewMode={setViewMode}
        executeAdhocMutation={executeAdhocMutation}
        setActiveFilter={setActiveFilter}
        tasksLoading={tasksLoading}
        tasksError={tasksError}
        refetchTasks={refetchTasks}
        sortedTasks={sortedTasks}
        handleOpenTask={handleOpenTask}
        handleQuickComplete={handleQuickComplete}
        handleDeleteTask={handleDeleteTask}
      />

      <MyTasksDeleteDialog
        deleteTaskData={deleteTaskData}
        deleteMutation={deleteMutation}
        setDeleteTaskData={setDeleteTaskData}
      />

      <MyTasksClosureDialog
        closureSuggestion={closureSuggestion}
        setClosureSuggestion={setClosureSuggestion}
        navigate={navigate}
      />
    </div>
  );
};

