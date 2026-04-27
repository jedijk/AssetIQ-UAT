import { useState, useEffect } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { formatDate as formatDateUtil } from "../lib/dateUtils";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isSameMonth, addMonths, subMonths, parseISO } from "date-fns";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import FormsPageContent from "./FormsPage";
import {
  Calendar as CalendarIcon,
  ClipboardList,
  Clock,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  PauseCircle,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Wrench,
  Zap,
  Target,
  Settings,
  Repeat,
  Timer,
  CalendarDays,
  FileText,
  Edit,
  Trash2,
  RefreshCw,
  ArrowRight,
  X,
  List,
  LayoutGrid,
  Layers,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SearchableSelect } from "../components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { TemplateDialog } from "../components/task-scheduler/TemplateDialog";
import { PlanDialog } from "../components/task-scheduler/PlanDialog";
import { CompleteDialog, DeleteExecutionDialog } from "../components/task-scheduler/ExecutionDialogs";
import { DISCIPLINES, getDisciplineColor } from "../constants/disciplines";

// Get base URL without /api suffix
import { taskSchedulerAPI as taskAPI, equipmentHierarchyAPI } from "../lib/api";
import { formAPI } from "../components/forms";

// Status badge component
const StatusBadge = ({ status }) => {
  const config = {
    planned: { color: "bg-blue-100 text-blue-800 border-blue-200", icon: Clock },
    in_progress: { color: "bg-amber-100 text-amber-800 border-amber-200", icon: PlayCircle },
    completed: { color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
    overdue: { color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
    skipped: { color: "bg-slate-100 text-slate-800 border-slate-200", icon: PauseCircle },
  };
  const { color, icon: Icon } = config[status] || config.planned;
  return (
    <Badge className={`${color} gap-1`}>
      <Icon className="w-3 h-3" />
      {status.replace("_", " ")}
    </Badge>
  );
};

// Discipline badge - using unified discipline colors
const DisciplineBadge = ({ discipline }) => {
  const colorClass = getDisciplineColor(discipline);
  return (
    <Badge className={colorClass}>
      {discipline}
    </Badge>
  );
};

const TaskSchedulerPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const location = useLocation();
  
  const isMobile = useIsMobile();
  
  // State
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabFromUrl === "forms" ? "forms" : tabFromUrl === "templates" ? "templates" : "instances");
  
  // Sync tab with URL
  useEffect(() => {
    if (tabFromUrl && ["instances", "templates", "forms"].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);
  
  // Update URL when tab changes
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (newTab === "instances") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", newTab);
    }
    setSearchParams(searchParams, { replace: true });
  };
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [scheduleView, setScheduleView] = useState("calendar"); // "calendar" or "list"
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [planForm, setPlanForm] = useState({
    equipment_id: "",
    task_template_id: "",
    form_template_id: "",
    interval_value: null, // null means inherit from template
    interval_unit: null,  // null means inherit from template
    effective_from: null, // Date object
    effective_until: null, // Date object
    notes: ""
  });
  const [inheritedInterval, setInheritedInterval] = useState({ value: 30, unit: "days" });
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    discipline: "maintenance",
    mitigation_strategy: "preventive",
    default_interval: 30,
    default_unit: "days",
    estimated_duration_minutes: 60,
    procedure_steps: [],
    safety_requirements: [],
    is_adhoc: false,
    form_template_id: null,
  });
  const [completeForm, setCompleteForm] = useState({
    notes: "",
    issues_found: [],
    needs_follow_up: false
  });
  const [editingTemplate, setEditingTemplate] = useState(null); // For editing templates
  const [editingPlan, setEditingPlan] = useState(null); // For editing plans
  const [deleteInstanceId, setDeleteInstanceId] = useState(null); // For delete confirmation
  const [expandedTemplateId, setExpandedTemplateId] = useState(null); // For showing plans under template

  // Handle prefill from navigation state (e.g., from Actions page PM action)
  useEffect(() => {
    if (location.state?.createTask && location.state?.prefill) {
      const prefill = location.state.prefill;
      // Switch to templates tab and open create dialog
      setActiveTab("templates");
      setTemplateForm(prev => ({
        ...prev,
        name: prefill.name || "",
        description: prefill.description || "",
        discipline: prefill.discipline || "maintenance",
        mitigation_strategy: "preventive",
        source_action_id: prefill.source_action_id,
        source_action_title: prefill.source_action_title,
      }));
      // Open the template dialog after a short delay to ensure tab switch
      setTimeout(() => {
        setShowTemplateDialog(true);
        toast.info("Creating recurring task from PM action. Configure the schedule below.");
      }, 100);
      
      // Clear the navigation state to prevent re-triggering
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Queries
  const { data: statsData } = useQuery({
    queryKey: ["task-stats"],
    queryFn: taskAPI.getStats
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["task-templates", search, disciplineFilter],
    queryFn: () => taskAPI.getTemplates({
      search: search || undefined,
      discipline: disciplineFilter !== "all" ? disciplineFilter : undefined
    }),
    enabled: activeTab === "templates" || showPlanDialog
  });

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["task-plans"],
    queryFn: () => taskAPI.getPlans(),
    enabled: activeTab === "templates" // Plans now shown in templates tab
  });

  const { data: equipmentData } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: () => equipmentHierarchyAPI.getNodes(),
    enabled: showPlanDialog
  });

  const { data: formTemplatesData } = useQuery({
    queryKey: ["form-templates"],
    queryFn: () => formAPI.getTemplates({}),
    enabled: showPlanDialog || showTemplateDialog
  });

  const { data: instancesData, isLoading: instancesLoading, refetch: refetchInstances } = useQuery({
    queryKey: ["task-instances", statusFilter],
    queryFn: () => taskAPI.getInstances({
      status: statusFilter !== "all" ? statusFilter : undefined
    }),
    enabled: activeTab === "instances"
  });

  // Mutations
  const createTemplateMutation = useMutation({
    mutationFn: taskAPI.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      toast.success("Template created");
      setShowTemplateDialog(false);
      resetTemplateForm();
    },
    onError: () => toast.error("Failed to create template")
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: taskAPI.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      queryClient.invalidateQueries({ queryKey: ["task-plans"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "task-instances" });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-tasks" });
      toast.success("Template deleted");
    },
    onError: (error) => toast.error(error.message || "Failed to delete template")
  });

  const deletePlanMutation = useMutation({
    mutationFn: taskAPI.deletePlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-plans"] });
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "task-instances" });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-tasks" });
      toast.success("Plan deleted");
    },
    onError: (error) => toast.error(error.message || "Failed to delete plan")
  });

  const createPlanMutation = useMutation({
    mutationFn: (data) => {
      // Use inherited values if not overridden
      const submitData = {
        ...data,
        interval_value: data.interval_value || inheritedInterval.value,
        interval_unit: data.interval_unit || inheritedInterval.unit,
        effective_from: data.effective_from ? data.effective_from.toISOString() : null,
        effective_until: data.effective_until ? data.effective_until.toISOString() : null,
      };
      return taskAPI.createPlan(submitData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-plans"] });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-tasks" });
      toast.success("Plan created");
      setShowPlanDialog(false);
      setPlanForm({ equipment_id: "", task_template_id: "", form_template_id: "", interval_value: null, interval_unit: null, effective_from: null, effective_until: null, notes: "" });
      setInheritedInterval({ value: 30, unit: "days" });
    },
    onError: (error) => toast.error(error.message || "Failed to create plan")
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const submitData = {
        ...data,
        effective_from: data.effective_from ? (data.effective_from instanceof Date ? data.effective_from.toISOString() : data.effective_from) : null,
        effective_until: data.effective_until ? (data.effective_until instanceof Date ? data.effective_until.toISOString() : data.effective_until) : null,
      };
      return taskAPI.updatePlan(id, submitData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-plans"] });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-tasks" });
      toast.success("Plan updated");
      setShowPlanDialog(false);
      setEditingPlan(null);
      setPlanForm({ equipment_id: "", task_template_id: "", form_template_id: "", interval_value: null, interval_unit: null, effective_from: null, effective_until: null, notes: "" });
    },
    onError: (error) => toast.error(error.message || "Failed to update plan")
  });

  const startInstanceMutation = useMutation({
    mutationFn: taskAPI.startInstance,
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "task-instances" });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-tasks" });
      toast.success("Execution started");
    },
    onError: () => toast.error("Failed to start execution")
  });

  const completeInstanceMutation = useMutation({
    mutationFn: taskAPI.completeInstance,
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "task-instances" });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-tasks" });
      toast.success("Execution completed");
      setShowCompleteDialog(false);
      setSelectedInstance(null);
    },
    onError: () => toast.error("Failed to complete execution")
  });

  const generateInstancesMutation = useMutation({
    mutationFn: taskAPI.generateInstances,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "task-instances" });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-tasks" });
      const count = data.instances_generated ?? data.created ?? 0;
      const plansCount = data.plans_processed || 0;
      if (count > 0) {
        toast.success(`Generated ${count} new executions from ${plansCount} plans`);
      } else if (plansCount > 0) {
        toast.info(`${plansCount} plans checked - all executions already exist`);
      } else {
        toast.info("No active plans found to generate executions");
      }
    },
    onError: () => toast.error("Failed to generate executions")
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }) => taskAPI.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      toast.success("Template updated");
      setShowTemplateDialog(false);
      setEditingTemplate(null);
      resetTemplateForm();
    },
    onError: () => toast.error("Failed to update template")
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: taskAPI.deleteInstance,
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "task-instances" });
      queryClient.invalidateQueries({ queryKey: ["task-stats"] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-tasks" });
      toast.success("Execution deleted");
      setDeleteInstanceId(null);
    },
    onError: () => toast.error("Failed to delete execution")
  });

  const templates = templatesData?.templates || [];
  const plans = plansData?.plans || [];
  const instances = instancesData?.instances || [];
  const stats = statsData || {};

  const resetTemplateForm = () => {
    setTemplateForm({
      name: "",
      description: "",
      discipline: "maintenance",
      mitigation_strategy: "preventive",
      default_interval: 30,
      default_unit: "days",
      estimated_duration_minutes: 60,
      procedure_steps: [],
      safety_requirements: [],
      is_adhoc: false,
      form_template_id: null,
    });
  };

  const handleCreateTemplate = () => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateForm });
    } else {
      createTemplateMutation.mutate(templateForm);
    }
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name || "",
      description: template.description || "",
      discipline: template.discipline || "maintenance",
      mitigation_strategy: template.mitigation_strategy || "preventive",
      default_interval: template.default_interval || 30,
      default_unit: template.default_unit || "days",
      estimated_duration_minutes: template.estimated_duration_minutes || 60,
      procedure_steps: template.procedure_steps || [],
      safety_requirements: template.safety_requirements || [],
      is_adhoc: template.is_adhoc || false,
      form_template_id: template.form_template_id || null,
    });
    setShowTemplateDialog(true);
  };

  const handleTemplateSelect = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setInheritedInterval({
        value: template.default_interval || 30,
        unit: template.default_unit || "days"
      });
      setPlanForm({
        ...planForm,
        task_template_id: templateId,
        interval_value: null, // Reset to inherit
        interval_unit: null,  // Reset to inherit
      });
    } else {
      setPlanForm({ ...planForm, task_template_id: templateId });
    }
  };

  const handleEditPlan = (plan) => {
    // Find the template to get inherited values
    const template = templates.find(t => t.id === plan.task_template_id);
    if (template) {
      setInheritedInterval({
        value: template.default_interval || 30,
        unit: template.default_unit || "days"
      });
    }
    
    setEditingPlan(plan);
    setPlanForm({
      equipment_id: plan.equipment_id || "",
      task_template_id: plan.task_template_id || "",
      form_template_id: plan.form_template_id || "",
      interval_value: plan.interval_value,
      interval_unit: plan.interval_unit,
      effective_from: plan.effective_from ? new Date(plan.effective_from) : null,
      effective_until: plan.effective_until ? new Date(plan.effective_until) : null,
      notes: plan.notes || "",
      is_active: plan.is_active !== false,
    });
    setShowPlanDialog(true);
  };

  const handlePlanDialogClose = (open) => {
    if (!open) {
      setEditingPlan(null);
      setPlanForm({ equipment_id: "", task_template_id: "", form_template_id: "", interval_value: null, interval_unit: null, effective_from: null, effective_until: null, notes: "" });
      setInheritedInterval({ value: 30, unit: "days" });
    }
    setShowPlanDialog(open);
  };

  const handlePlanSubmit = () => {
    if (editingPlan) {
      // Update existing plan
      updatePlanMutation.mutate({
        id: editingPlan.id,
        data: {
          interval_value: planForm.interval_value,
          interval_unit: planForm.interval_unit,
          effective_from: planForm.effective_from,
          effective_until: planForm.effective_until,
          form_template_id: planForm.form_template_id || null,
          notes: planForm.notes,
          is_active: planForm.is_active,
        }
      });
    } else {
      // Create new plan
      createPlanMutation.mutate(planForm);
    }
  };

  const handleStartTask = (instance) => {
    startInstanceMutation.mutate(instance.id);
  };

  const handleCompleteTask = (instance) => {
    setSelectedInstance(instance);
    setCompleteForm({ notes: "", issues_found: [], needs_follow_up: false });
    setShowCompleteDialog(true);
  };

  const handleConfirmComplete = () => {
    if (selectedInstance) {
      completeInstanceMutation.mutate({
        id: selectedInstance.id,
        data: completeForm
      });
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return formatDateUtil(dateStr);
  };

  // Mobile: Show desktop-only message
  if (isMobile) {
    return <DesktopOnlyMessage title="Task Planner" icon={CalendarIcon} />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="task-scheduler-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <CalendarIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("taskScheduler.title")}</h1>
            <p className="text-sm text-slate-500">{t("taskScheduler.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => generateInstancesMutation.mutate()}
            disabled={generateInstancesMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${generateInstancesMutation.isPending ? "animate-spin" : ""}`} />
            {t("taskScheduler.generateExecutions")}
          </Button>
          <Button size="sm" onClick={() => setShowTemplateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t("taskScheduler.newTemplate")}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="cursor-pointer hover:shadow-md" onClick={() => { setActiveTab("instances"); setStatusFilter("all"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total || 0}</p>
                <p className="text-xs text-slate-500">{t("taskScheduler.totalExecutions")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => { setActiveTab("instances"); setStatusFilter("planned"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.by_status?.planned || 0}</p>
                <p className="text-xs text-slate-500">{t("taskScheduler.planned")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => { setActiveTab("instances"); setStatusFilter("in_progress"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <PlayCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.by_status?.in_progress || 0}</p>
                <p className="text-xs text-slate-500">{t("common.inProgress")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => { setActiveTab("instances"); setStatusFilter("completed"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.by_status?.completed || 0}</p>
                <p className="text-xs text-slate-500">{t("actionsPage.completedActions")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => { setActiveTab("instances"); setStatusFilter("overdue"); }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.by_status?.overdue || 0}</p>
                <p className="text-xs text-slate-500">{t("taskScheduler.overdue")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="instances" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              {t("taskScheduler.executions")}
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="w-4 h-4" />
              {t("taskScheduler.taskLibrary") || "Task Library"}
            </TabsTrigger>
            <TabsTrigger value="forms" className="gap-2">
              <Layers className="w-4 h-4" />
              {t("forms.title") || "Form Designer"}
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2">
            {activeTab === "instances" && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("taskScheduler.allStatus")}</SelectItem>
                  <SelectItem value="planned">{t("taskScheduler.planned")}</SelectItem>
                  <SelectItem value="in_progress">{t("common.inProgress")}</SelectItem>
                  <SelectItem value="completed">{t("actionsPage.completedActions")}</SelectItem>
                  <SelectItem value="overdue">{t("taskScheduler.overdue")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {activeTab === "templates" && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder={t("taskScheduler.searchTemplates")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 w-[200px]"
                  />
                </div>
                <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Discipline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("taskScheduler.allDisciplines")}</SelectItem>
                    <SelectItem value="operations">{t("taskScheduler.operations")}</SelectItem>
                    <SelectItem value="maintenance">{t("taskScheduler.maintenance")}</SelectItem>
                    <SelectItem value="laboratory">{t("taskScheduler.laboratory")}</SelectItem>
                    <SelectItem value="inspection">{t("taskScheduler.inspection")}</SelectItem>
                    <SelectItem value="engineering">{t("taskScheduler.engineering")}</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        {/* Schedule Tab - Calendar View */}
        <TabsContent value="instances">
          {/* View Toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
              <Button
                size="sm"
                variant={scheduleView === "calendar" ? "default" : "ghost"}
                onClick={() => setScheduleView("calendar")}
                className="gap-2"
              >
                <LayoutGrid className="w-4 h-4" />
                {t("taskScheduler.calendarView")}
              </Button>
              <Button
                size="sm"
                variant={scheduleView === "list" ? "default" : "ghost"}
                onClick={() => setScheduleView("list")}
                className="gap-2"
              >
                <List className="w-4 h-4" />
                {t("taskScheduler.listView")}
              </Button>
            </div>
            {scheduleView === "calendar" && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} data-testid="prev-month-btn">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium text-slate-900 min-w-[140px] text-center">
                  {format(currentMonth, "MMMM yyyy")}
                </span>
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} data-testid="next-month-btn">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())} data-testid="today-btn">
                  {t("taskScheduler.todayButton")}
                </Button>
              </div>
            )}
          </div>

          {instancesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : scheduleView === "calendar" ? (
            /* Calendar View */
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Calendar Header */}
              <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="px-2 py-3 text-center text-sm font-semibold text-slate-600">
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar Days */}
              <div className="grid grid-cols-7">
                {(() => {
                  const monthStart = startOfMonth(currentMonth);
                  const monthEnd = endOfMonth(currentMonth);
                  const startDate = new Date(monthStart);
                  startDate.setDate(startDate.getDate() - startDate.getDay());
                  const endDate = new Date(monthEnd);
                  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
                  
                  const days = eachDayOfInterval({ start: startDate, end: endDate });
                  
                  return days.map((day) => {
                    const dayInstances = instances.filter((inst) => {
                      if (!inst.scheduled_date && !inst.due_date) return false;
                      const instDate = parseISO(inst.scheduled_date || inst.due_date);
                      return isSameDay(instDate, day);
                    });
                    
                    // Also show PLANS (not submissions) with next_due_date on this day
                    // Only include these when the user is looking at "all/planned" executions.
                    // Otherwise they inflate the calendar counts compared to "submitted/completed".
                    const includePlansInCalendar = statusFilter === "all" || statusFilter === "planned";
                    const dayPlans = includePlansInCalendar
                      ? (plans || []).filter((plan) => {
                          if (!plan.next_due_date || !plan.is_active) return false;
                          const planDate = parseISO(plan.next_due_date);
                          // Check if plan has no instance on this date
                          const hasInstance = dayInstances.some(inst => inst.task_plan_id === plan.id);
                          return isSameDay(planDate, day) && !hasInstance;
                        })
                      : [];
                    
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    
                    const allItems = [...dayInstances, ...dayPlans.map(p => ({
                      ...p,
                      isPlan: true,
                      task_template_name: p.task_template_name,
                      status: 'planned'
                    }))];
                    
                    return (
                      <div
                        key={day.toISOString()}
                        className={`min-h-[100px] border-b border-r border-slate-100 p-1 cursor-pointer transition-colors
                          ${!isCurrentMonth ? "bg-slate-50 text-slate-400" : "bg-white"}
                          ${isToday(day) ? "bg-blue-50" : ""}
                          ${isSelected ? "ring-2 ring-blue-500 ring-inset" : ""}
                          hover:bg-slate-50`}
                        onClick={() => setSelectedDate(day)}
                      >
                        <div className={`text-sm font-medium mb-1 ${isToday(day) ? "text-blue-600" : ""}`}>
                          {format(day, "d")}
                        </div>
                        <div className="space-y-1">
                          {allItems.slice(0, 3).map((item, idx) => (
                            <div
                              key={item.id || `plan-${idx}`}
                              className={`text-xs px-1.5 py-0.5 rounded truncate cursor-pointer
                                ${item.isPlan ? "bg-purple-100 text-purple-700 border border-purple-200 border-dashed" :
                                  item.status === "completed" ? "bg-green-100 text-green-700" :
                                  item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                                  item.status === "overdue" ? "bg-red-100 text-red-700" :
                                  "bg-slate-100 text-slate-700"}`}
                              title={item.isPlan ? `${item.task_template_name} (Planned)` : item.task_template_name}
                            >
                              {item.task_template_name}
                            </div>
                          ))}
                          {allItems.length > 3 && (
                            <div className="text-xs text-slate-500 px-1">
                              +{allItems.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : instances.length === 0 ? (
            /* List View - Empty State */
            <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">{t("taskScheduler.noExecutionsFound")}</p>
              <Button variant="link" onClick={() => generateInstancesMutation.mutate()}>
                {t("taskScheduler.generateFromPlans")}
              </Button>
            </div>
          ) : (
            /* List View - Table */
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">{t("taskScheduler.execution")}</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">{t("taskScheduler.equipment")}</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 hidden md:table-cell">{t("taskScheduler.scheduled")}</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">{t("common.status")}</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">{t("actionsPage.title")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {instances.map((instance) => (
                      <tr key={instance.id} className="hover:bg-slate-50" data-testid={`execution-instance-${instance.id}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{instance.task_template_name}</div>
                          <div className="text-sm text-slate-500">{instance.task_plan_name}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-700">{instance.equipment_name || "-"}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm text-slate-600">{formatDate(instance.scheduled_date)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={instance.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {instance.status === "planned" && (
                              <Button size="sm" variant="outline" onClick={() => handleStartTask(instance)}>
                                <PlayCircle className="w-4 h-4 mr-1" /> {t("taskScheduler.start")}
                              </Button>
                            )}
                            {instance.status === "in_progress" && (
                              <Button size="sm" onClick={() => handleCompleteTask(instance)}>
                                <CheckCircle2 className="w-4 h-4 mr-1" /> {t("taskScheduler.complete")}
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteInstanceId(instance.id)}
                              data-testid={`delete-execution-${instance.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Selected Date Tasks Panel */}
          {scheduleView === "calendar" && selectedDate && (
            <div className="mt-4 bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900">
                  {format(selectedDate, "EEEE, MMMM d, yyyy")}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {(() => {
                const dayInstances = instances.filter((inst) => {
                  if (!inst.scheduled_date && !inst.due_date) return false;
                  const instDate = parseISO(inst.scheduled_date || inst.due_date);
                  return isSameDay(instDate, selectedDate);
                });
                
                if (dayInstances.length === 0) {
                  return <p className="text-slate-500 text-sm">No tasks scheduled for this day</p>;
                }
                
                return (
                  <div className="space-y-2">
                    {dayInstances.map((instance) => (
                      <div key={instance.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <div className="font-medium text-slate-900">{instance.task_template_name}</div>
                          <div className="text-sm text-slate-500">{instance.equipment_name || "-"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={instance.status} />
                          {instance.status === "planned" && (
                            <Button size="sm" variant="outline" onClick={() => handleStartTask(instance)}>
                              <PlayCircle className="w-4 h-4 mr-1" /> Start
                            </Button>
                          )}
                          {instance.status === "in_progress" && (
                            <Button size="sm" onClick={() => handleCompleteTask(instance)}>
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Complete
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteInstanceId(instance.id)}
                            data-testid={`delete-calendar-task-${instance.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </TabsContent>

        {/* Task Library Tab (merged Templates + Plans) */}
        <TabsContent value="templates">
          <div className="flex justify-end mb-4 gap-2">
            <Button onClick={() => setShowPlanDialog(true)} variant="outline" className="gap-2">
              <CalendarDays className="w-4 h-4" />
              {t("taskScheduler.newPlan")}
            </Button>
          </div>
          {templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">{t("taskScheduler.noTemplatesFound")}</p>
              <Button variant="link" onClick={() => setShowTemplateDialog(true)}>
                {t("taskScheduler.createFirstTemplate")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => {
                const templatePlans = plans.filter(p => p.task_template_id === template.id);
                const isExpanded = expandedTemplateId === template.id;
                
                return (
                  <Card key={template.id} className="hover:shadow-md transition-shadow" data-testid={`template-card-${template.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{template.name}</CardTitle>
                            <DisciplineBadge discipline={template.discipline} />
                          </div>
                          <CardDescription className="line-clamp-2 mt-1">{template.description || t("taskScheduler.noDescription")}</CardDescription>
                        </div>
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`template-menu-${template.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditTemplate(template)} data-testid={`template-edit-${template.id}`}>
                                <Edit className="w-4 h-4 mr-2" /> {t("common.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setPlanForm(prev => ({ ...prev, task_template_id: template.id }));
                                setShowPlanDialog(true);
                              }}>
                                <Plus className="w-4 h-4 mr-2" /> {t("taskScheduler.createPlanForTask")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => deleteTemplateMutation.mutate(template.id)}
                                data-testid={`template-delete-${template.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> {t("common.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {template.is_adhoc ? (
                          <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200">
                            <Zap className="w-3 h-3" />
                            {t("taskScheduler.adhocLabel")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Repeat className="w-3 h-3" />
                            {template.default_interval} {template.default_unit}
                          </Badge>
                        )}
                        {template.estimated_duration_minutes && (
                          <Badge variant="outline" className="gap-1">
                            <Timer className="w-3 h-3" />
                            {template.estimated_duration_minutes} min
                          </Badge>
                        )}
                      </div>
                      
                      {/* Plans section */}
                      {templatePlans.length > 0 && (
                        <div className="border-t border-slate-100 pt-3 mt-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTemplateId(isExpanded ? null : template.id);
                            }}
                            className="flex items-center justify-between w-full text-sm text-slate-600 hover:text-slate-900"
                          >
                            <span className="flex items-center gap-2">
                              <CalendarDays className="w-4 h-4" />
                              {templatePlans.length} {templatePlans.length === 1 ? 'Plan' : 'Plans'}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          
                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              {templatePlans.map((plan) => (
                                <div key={plan.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm">{plan.equipment_name || 'All Equipment'}</span>
                                      <Badge className={plan.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"} variant="outline">
                                        {plan.is_active ? t("taskScheduler.active") : t("taskScheduler.inactive")}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                      {plan.is_adhoc ? (
                                        <span className="flex items-center gap-1">
                                          <Zap className="w-3 h-3" /> Ad-hoc
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1">
                                          <Repeat className="w-3 h-3" /> Every {plan.interval_value} {plan.interval_unit}
                                        </span>
                                      )}
                                      {!plan.is_adhoc && plan.next_due_date && (
                                        <span className="flex items-center gap-1">
                                          <CalendarIcon className="w-3 h-3" /> Next: {formatDate(plan.next_due_date)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEditPlan(plan); }}>
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-red-600 hover:text-red-700"
                                      onClick={(e) => { e.stopPropagation(); deletePlanMutation.mutate(plan.id); }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* No plans indicator */}
                      {templatePlans.length === 0 && !template.is_adhoc && (
                        <div className="border-t border-slate-100 pt-3 mt-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlanForm(prev => ({ ...prev, task_template_id: template.id }));
                              setShowPlanDialog(true);
                            }}
                            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                          >
                            <Plus className="w-4 h-4" />
                            {t("taskScheduler.createPlanForTask")}
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Forms Tab - Embedded Form Designer */}
        <TabsContent value="forms" className="-mx-6 -mb-6">
          <FormsPageContent embedded={true} />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Template Dialog */}
      <TemplateDialog
        open={showTemplateDialog}
        onOpenChange={(open) => {
          setShowTemplateDialog(open);
          if (!open) {
            setEditingTemplate(null);
            resetTemplateForm();
          }
        }}
        editingTemplate={editingTemplate}
        templateForm={templateForm}
        setTemplateForm={setTemplateForm}
        formTemplates={formTemplatesData?.templates || formTemplatesData || []}
        onSubmit={handleCreateTemplate}
        isPending={createTemplateMutation.isPending || updateTemplateMutation.isPending}
        onClose={() => {
          setShowTemplateDialog(false);
          setEditingTemplate(null);
          resetTemplateForm();
        }}
      />

      {/* Complete Execution Dialog */}
      <CompleteDialog
        open={showCompleteDialog}
        onOpenChange={setShowCompleteDialog}
        selectedInstance={selectedInstance}
        completeForm={completeForm}
        setCompleteForm={setCompleteForm}
        onSubmit={handleConfirmComplete}
        isPending={completeInstanceMutation.isPending}
      />

      {/* Delete Execution Confirmation Dialog */}
      <DeleteExecutionDialog
        open={!!deleteInstanceId}
        onOpenChange={(open) => !open && setDeleteInstanceId(null)}
        onConfirm={() => deleteInstanceMutation.mutate(deleteInstanceId)}
        isPending={deleteInstanceMutation.isPending}
      />

      {/* Create Plan Dialog */}
      <PlanDialog
        open={showPlanDialog}
        onOpenChange={handlePlanDialogClose}
        planForm={planForm}
        setPlanForm={setPlanForm}
        templates={templates}
        equipmentData={equipmentData}
        inheritedInterval={inheritedInterval}
        onTemplateSelect={handleTemplateSelect}
        onSubmit={handlePlanSubmit}
        isPending={createPlanMutation.isPending || updatePlanMutation.isPending}
        editingPlan={editingPlan}
      />
    </div>
  );
};

export default TaskSchedulerPage;
