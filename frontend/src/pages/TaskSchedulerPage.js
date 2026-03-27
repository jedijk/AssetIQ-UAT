import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { format } from "date-fns";
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

// Get base URL without /api suffix
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

// API functions
const taskAPI = {
  // Templates
  getTemplates: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.discipline) queryParams.append("discipline", params.discipline);
    if (params.search) queryParams.append("search", params.search);
    const response = await fetch(`${API_BASE_URL}/api/task-templates?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch templates");
    return response.json();
  },
  createTemplate: async (data) => {
    const response = await fetch(`${API_BASE_URL}/api/task-templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error("Failed to create template");
    return response.json();
  },
  deleteTemplate: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/task-templates/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to delete template");
    }
    return response.json();
  },
  updateTemplate: async (id, data) => {
    const response = await fetch(`${API_BASE_URL}/api/task-templates/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to update template");
    }
    return response.json();
  },

  // Plans
  getPlans: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.equipment_id) queryParams.append("equipment_id", params.equipment_id);
    const response = await fetch(`${API_BASE_URL}/api/task-plans?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch plans");
    return response.json();
  },
  createPlan: async (data) => {
    const response = await fetch(`${API_BASE_URL}/api/task-plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to create plan");
    }
    return response.json();
  },
  deletePlan: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/task-plans/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to delete plan");
    }
    return response.json();
  },
  updatePlan: async (id, data) => {
    const response = await fetch(`${API_BASE_URL}/api/task-plans/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to update plan");
    }
    return response.json();
  },

  // Instances
  getInstances: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append("status", params.status);
    if (params.plan_id) queryParams.append("plan_id", params.plan_id);
    const response = await fetch(`${API_BASE_URL}/api/task-instances?${queryParams}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch instances");
    return response.json();
  },
  getCalendar: async (startDate, endDate) => {
    const response = await fetch(
      `${API_BASE_URL}/api/task-instances/calendar?start_date=${startDate}&end_date=${endDate}`,
      { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }}
    );
    if (!response.ok) throw new Error("Failed to fetch calendar");
    return response.json();
  },
  startInstance: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/task-instances/${id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to start task");
    return response.json();
  },
  completeInstance: async ({ id, data }) => {
    const response = await fetch(`${API_BASE_URL}/api/task-instances/${id}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error("Failed to complete task");
    return response.json();
  },
  generateInstances: async () => {
    const response = await fetch(`${API_BASE_URL}/api/tasks/generate-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to generate instances");
    return response.json();
  },
  deleteInstance: async (id) => {
    const response = await fetch(`${API_BASE_URL}/api/task-instances/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to delete execution");
    return response.json();
  },
  getStats: async () => {
    const response = await fetch(`${API_BASE_URL}/api/tasks/stats`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch stats");
    return response.json();
  }
};

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

// Discipline badge
const DisciplineBadge = ({ discipline }) => {
  const colors = {
    operations: "bg-blue-100 text-blue-700",
    maintenance: "bg-yellow-100 text-yellow-700",
    lab: "bg-purple-100 text-purple-700",
    laboratory: "bg-purple-100 text-purple-700",
    inspection: "bg-green-100 text-green-700",
    engineering: "bg-orange-100 text-orange-700",
  };
  return (
    <Badge className={colors[discipline] || "bg-slate-100 text-slate-700"}>
      {discipline}
    </Badge>
  );
};

const TaskSchedulerPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  
  // State
  const [activeTab, setActiveTab] = useState("instances");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
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
  });
  const [completeForm, setCompleteForm] = useState({
    notes: "",
    issues_found: [],
    needs_follow_up: false
  });
  const [editingTemplate, setEditingTemplate] = useState(null); // For editing templates
  const [editingPlan, setEditingPlan] = useState(null); // For editing plans
  const [deleteInstanceId, setDeleteInstanceId] = useState(null); // For delete confirmation

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
    enabled: activeTab === "plans"
  });

  const { data: equipmentData } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/equipment-hierarchy/nodes`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Failed to fetch equipment");
      return response.json();
    },
    enabled: showPlanDialog
  });

  const { data: formTemplatesData } = useQuery({
    queryKey: ["form-templates"],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/form-templates`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Failed to fetch form templates");
      return response.json();
    },
    enabled: showPlanDialog
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
      queryClient.invalidateQueries(["task-templates"]);
      toast.success("Template created");
      setShowTemplateDialog(false);
      resetTemplateForm();
    },
    onError: () => toast.error("Failed to create template")
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: taskAPI.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries(["task-templates"]);
      toast.success("Template deleted");
    },
    onError: (error) => toast.error(error.message || "Failed to delete template")
  });

  const deletePlanMutation = useMutation({
    mutationFn: taskAPI.deletePlan,
    onSuccess: () => {
      queryClient.invalidateQueries(["task-plans"]);
      queryClient.invalidateQueries(["task-templates"]);
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
      queryClient.invalidateQueries(["task-plans"]);
      queryClient.invalidateQueries(["task-stats"]);
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
      queryClient.invalidateQueries(["task-plans"]);
      queryClient.invalidateQueries(["task-stats"]);
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
      queryClient.invalidateQueries(["task-instances"]);
      queryClient.invalidateQueries(["task-stats"]);
      toast.success("Execution started");
    },
    onError: () => toast.error("Failed to start execution")
  });

  const completeInstanceMutation = useMutation({
    mutationFn: taskAPI.completeInstance,
    onSuccess: () => {
      queryClient.invalidateQueries(["task-instances"]);
      queryClient.invalidateQueries(["task-stats"]);
      toast.success("Execution completed");
      setShowCompleteDialog(false);
      setSelectedInstance(null);
    },
    onError: () => toast.error("Failed to complete execution")
  });

  const generateInstancesMutation = useMutation({
    mutationFn: taskAPI.generateInstances,
    onSuccess: (data) => {
      queryClient.invalidateQueries(["task-instances"]);
      queryClient.invalidateQueries(["task-stats"]);
      toast.success(`Generated ${data.created || 0} new executions`);
    },
    onError: () => toast.error("Failed to generate executions")
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }) => taskAPI.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["task-templates"]);
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
      queryClient.invalidateQueries(["task-instances"]);
      queryClient.invalidateQueries(["task-stats"]);
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
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="instances" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              {t("taskScheduler.executions")}
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2">
              <CalendarDays className="w-4 h-4" />
              {t("taskScheduler.plans")}
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="w-4 h-4" />
              {t("taskScheduler.templates")}
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

        {/* Executions Tab */}
        <TabsContent value="instances">
          {instancesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">{t("taskScheduler.noExecutionsFound")}</p>
              <Button variant="link" onClick={() => generateInstancesMutation.mutate()}>
                {t("taskScheduler.generateFromPlans")}
              </Button>
            </div>
          ) : (
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
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowPlanDialog(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              {t("taskScheduler.newPlan")}
            </Button>
          </div>
          {plansLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">{t("taskScheduler.noPlansYet")}</p>
              <p className="text-sm text-slate-400 mt-1">{t("taskScheduler.createPlansDesc")}</p>
              <Button onClick={() => setShowPlanDialog(true)} className="mt-4 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                {t("taskScheduler.createFirstPlan")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <Card key={plan.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{plan.task_template_name || plan.name}</CardTitle>
                        <CardDescription>{plan.equipment_name}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {plan.is_adhoc && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            <Zap className="w-3 h-3 mr-1" />
                            {t("taskScheduler.adhocLabel")}
                          </Badge>
                        )}
                        <Badge className={plan.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>
                          {plan.is_active ? t("taskScheduler.active") : t("taskScheduler.inactive")}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPlan(plan)}>
                              <Edit className="w-4 h-4 mr-2" />
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => deletePlanMutation.mutate(plan.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t("taskScheduler.deletePlan")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {plan.is_adhoc ? (
                        <div className="flex items-center gap-2 text-amber-600">
                          <Zap className="w-4 h-4" />
                          {t("taskScheduler.adhocTemplateHint")}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Repeat className="w-4 h-4" />
                          {t("taskScheduler.every")} {plan.interval_value} {plan.interval_unit}
                        </div>
                      )}
                      {plan.next_due_date ? (
                        <div className="flex items-center gap-2 text-slate-600">
                          <CalendarIcon className="w-4 h-4" />
                          {t("taskScheduler.next")}: {formatDate(plan.next_due_date)}
                        </div>
                      ) : plan.is_adhoc && (
                        <div className="flex items-center gap-2 text-slate-500">
                          <CalendarIcon className="w-4 h-4" />
                          {t("taskScheduler.next")}: -
                        </div>
                      )}
                      {plan.form_template_id && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <FileText className="w-4 h-4" />
                          <span className="truncate">{plan.form_template_name || t("taskScheduler.linkedForm")}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow" data-testid={`template-card-${template.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{template.name}</CardTitle>
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
                    <CardDescription className="line-clamp-2">{template.description || t("taskScheduler.noDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 flex-wrap">
                      <DisciplineBadge discipline={template.discipline} />
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
                    <div className="mt-3 text-xs text-slate-500">
                      {template.is_adhoc 
                        ? t("taskScheduler.adhocTemplateHint")
                        : `${t("taskScheduler.usedInPlans")} ${template.usage_count || 0} ${t("taskScheduler.plans").toLowerCase()}`
                      }
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
        formTemplatesData={formTemplatesData}
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
