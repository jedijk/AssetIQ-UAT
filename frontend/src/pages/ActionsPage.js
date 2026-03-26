import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { actionsAPI, usersAPI } from "../lib/api";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  Calendar,
  User,
  Briefcase,
  MoreVertical,
  Edit2,
  Trash2,
  Target,
  FileText,
  GitBranch,
  CheckCircle,
  Brain,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  Check,
  BarChart3,
  Activity,
  Eye,
  MessageSquare,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
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
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import BackButton from "../components/BackButton";

// Status options with colors and icons - matching Observations
const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "bg-blue-500", textColor: "text-blue-700", bgColor: "bg-blue-100" },
  { value: "in_progress", label: "In Progress", color: "bg-amber-500", textColor: "text-amber-700", bgColor: "bg-amber-100" },
  { value: "completed", label: "Completed", color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-100" },
];

// Priority options with colors
const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical", color: "bg-red-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "medium", label: "Medium", color: "bg-yellow-500" },
  { value: "low", label: "Low", color: "bg-green-500" },
];

// Risk level options with colors - matching Observations
const RISK_OPTIONS = [
  { value: "Critical", label: "Critical", color: "bg-red-500" },
  { value: "High", label: "High", color: "bg-orange-500" },
  { value: "Medium", label: "Medium", color: "bg-yellow-500" },
  { value: "Low", label: "Low", color: "bg-green-500" },
];

const statusConfig = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
};

const priorityConfig = {
  critical: { label: "Critical", color: "bg-red-100 text-red-700", iconBg: "bg-red-50", iconColor: "text-red-600" },
  high: { label: "High", color: "bg-orange-100 text-orange-700", iconBg: "bg-orange-50", iconColor: "text-orange-600" },
  medium: { label: "Medium", color: "bg-yellow-100 text-yellow-700", iconBg: "bg-yellow-50", iconColor: "text-yellow-600" },
  low: { label: "Low", color: "bg-slate-100 text-slate-600", iconBg: "bg-slate-50", iconColor: "text-slate-600" },
};

const sourceConfig = {
  threat: { label: "Threat", icon: Target, color: "text-amber-600" },
  investigation: { label: "Investigation", icon: GitBranch, color: "text-blue-600" },
  ai_recommendation: { label: "AI", icon: Brain, color: "text-purple-600" },
};

export default function ActionsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState([]); // Multi-select: array of selected statuses
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [riskLevelFilter, setRiskLevelFilter] = useState("all"); // Filter by risk level (Critical/High/Medium/Low)
  const [sortBy, setSortBy] = useState("risk_score"); // Sort by risk_score or rpn
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [editingAction, setEditingAction] = useState(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [viewingAction, setViewingAction] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Toggle status in multi-select
  const toggleStatus = (status) => {
    setStatusFilter(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  // Clear all status filters
  const clearStatusFilter = () => {
    setStatusFilter([]);
  };

  // Get display text for status filter button
  const getStatusDisplayText = () => {
    if (statusFilter.length === 0) return "All Status";
    if (statusFilter.length === 1) return STATUS_OPTIONS.find(s => s.value === statusFilter[0])?.label || statusFilter[0];
    return `${statusFilter.length} selected`;
  };

  // Form state for editing
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    assignee: "",
    discipline: "",
    action_type: "",
    due_date: "",
    status: "open",
    comments: "",
    completion_notes: "",
  });

  // Fetch actions (fetch all, filter client-side for multi-select)
  const { data, isLoading } = useQuery({
    queryKey: ["actions"],
    queryFn: () => actionsAPI.getAll(),
  });

  const actions = data?.actions || [];
  const stats = data?.stats || { total: 0, open: 0, in_progress: 0, completed: 0, overdue: 0 };

  // Compute unique disciplines for filter
  const uniqueDisciplines = [...new Set(actions.map(a => a.discipline).filter(Boolean))].sort();

  // Fetch users for assignee lookup
  const { data: usersData } = useQuery({
    queryKey: ["rbac-users"],
    queryFn: usersAPI.getAll,
    staleTime: 5 * 60 * 1000,
  });
  const usersList = usersData?.users || [];

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ actionId, data, oldData }) => 
      actionsAPI.update(actionId, data).then(result => ({ result, actionId, data, oldData })),
    onSuccess: ({ actionId, data, oldData }) => {
      if (oldData) {
        pushUndo({
          type: "UPDATE_ACTION",
          label: `Edit action "${oldData.title}"`,
          data: { oldData, newData: data },
          undo: async () => {
            await actionsAPI.update(actionId, oldData);
            queryClient.invalidateQueries(["actions"]);
          },
        });
      }
      queryClient.invalidateQueries(["actions"]);
      toast.success("Action updated");
      setIsEditDialogOpen(false);
      setEditingAction(null);
    },
    onError: () => toast.error("Failed to update action"),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (actionId) => {
      const actionToDelete = actions.find(a => a.id === actionId);
      await actionsAPI.delete(actionId);
      return actionToDelete;
    },
    onSuccess: (deletedAction) => {
      if (deletedAction) {
        pushUndo({
          type: "DELETE_ACTION",
          label: `Delete action "${deletedAction.title}"`,
          data: deletedAction,
          undo: async () => {
            await actionsAPI.create({
              title: deletedAction.title,
              description: deletedAction.description,
              source_type: deletedAction.source_type,
              source_id: deletedAction.source_id,
              source_name: deletedAction.source_name,
              priority: deletedAction.priority,
              assignee: deletedAction.assignee,
              discipline: deletedAction.discipline,
              due_date: deletedAction.due_date,
            });
            queryClient.invalidateQueries(["actions"]);
          },
        });
      }
      queryClient.invalidateQueries(["actions"]);
      toast.success("Action deleted");
      setDeleteConfirm(null);
    },
    onError: () => toast.error("Failed to delete action"),
  });

  // Quick status update
  const quickStatusUpdate = (action, newStatus) => {
    updateMutation.mutate({
      actionId: action.id,
      data: { status: newStatus },
      oldData: action,
    });
  };

  // Open edit dialog
  const openEditDialog = (action) => {
    setEditingAction(action);
    setEditForm({
      title: action.title || "",
      description: action.description || "",
      priority: action.priority || "medium",
      assignee: action.assignee || "",
      discipline: action.discipline || "",
      action_type: action.action_type || "",
      due_date: action.due_date ? action.due_date.split("T")[0] : "",
      status: action.status || "open",
      comments: action.comments || "",
      completion_notes: action.completion_notes || "",
    });
    setViewingAction(null);
    setIsEditDialogOpen(true);
  };

  // Save edit
  const handleSaveEdit = () => {
    if (!editForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    updateMutation.mutate({
      actionId: editingAction.id,
      data: {
        ...editForm,
        due_date: editForm.due_date || null,
      },
      oldData: editingAction,
    });
  };

  // Filter actions by search, status, priority, source, and risk level
  const filteredActions = actions.filter((action) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        action.title?.toLowerCase().includes(query) ||
        action.description?.toLowerCase().includes(query) ||
        action.assignee?.toLowerCase().includes(query) ||
        action.action_number?.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
    }
    
    // Status filter (multi-select)
    if (statusFilter.length > 0) {
      if (!statusFilter.includes(action.status)) return false;
    }
    
    // Priority filter
    if (priorityFilter !== "all") {
      if (action.priority !== priorityFilter) return false;
    }
    
    // Source filter
    if (sourceFilter !== "all") {
      if (action.source_type !== sourceFilter) return false;
    }
    
    // Risk level filter
    if (riskLevelFilter !== "all") {
      if (action.threat_risk_level !== riskLevelFilter) return false;
    }
    
    // Discipline filter
    if (disciplineFilter !== "all") {
      if ((action.discipline || "") !== disciplineFilter) return false;
    }
    
    return true;
  });

  // Sort actions based on selected sort method
  const sortedActions = [...filteredActions].sort((a, b) => {
    if (sortBy === "rpn") {
      // Sort by RPN (higher first)
      const rpnA = a.threat_rpn || 0;
      const rpnB = b.threat_rpn || 0;
      return rpnB - rpnA;
    } else {
      // Default: sort by risk score (higher first)
      const scoreA = a.threat_risk_score || 0;
      const scoreB = b.threat_risk_score || 0;
      return scoreB - scoreA;
    }
  });

  // Check if action is overdue
  const isOverdue = (action) => {
    if (!action.due_date || action.status === "completed") return false;
    return new Date(action.due_date) < new Date();
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return "No due date";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Stats cards matching ThreatsPage style
  const statCards = [
    { label: t("actionsPage.totalActions"), value: stats.total, icon: FileText, color: "text-slate-600", bg: "bg-slate-100" },
    { label: t("common.open"), value: stats.open, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
    { label: t("common.inProgress"), value: stats.in_progress, icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50" },
    { label: t("actionsPage.completedActions"), value: stats.completed, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: t("actionsPage.overdueActions"), value: stats.overdue, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
  ];

  return (
    <div className="container mx-auto px-4 py-4 max-w-7xl" data-testid="actions-page">
      {/* Back Button - shown when navigated from another page */}
      {location.state?.from && (
        <div className="mb-3">
          <BackButton />
        </div>
      )}
      
      {/* Compact Stats Row - matching ThreatsPage */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200"
            data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <div className={`p-1.5 rounded-md ${stat.bg}`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div>
              <span className="text-lg font-bold text-slate-900">{stat.value}</span>
              <span className="text-xs text-slate-500 ml-1">{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters - matching Observations page */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6" data-testid="actions-filters">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder={t("actionsPage.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
            data-testid="actions-search"
          />
        </div>
        
        {/* Multi-select Status Filter - matching Observations */}
        <div className="relative">
          {statusDropdownOpen && (
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setStatusDropdownOpen(false)}
            />
          )}
          
          <button
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className="flex items-center justify-between w-full sm:w-48 h-11 px-3 bg-white border border-slate-200 rounded-md text-sm hover:bg-slate-50 transition-colors"
            data-testid="status-filter-select"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className={statusFilter.length > 0 ? "text-slate-900" : "text-slate-500"}>
                {getStatusDisplayText()}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {statusDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-full sm:w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
              {statusFilter.length > 0 && (
                <button
                  onClick={clearStatusFilter}
                  className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 border-b border-slate-100"
                >
                  Clear all filters
                </button>
              )}
              
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status.value}
                  onClick={() => toggleStatus(status.value)}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  data-testid={`status-option-${status.value}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${status.color}`}></span>
                    <span className="text-sm text-slate-700">{status.label}</span>
                  </div>
                  {statusFilter.includes(status.value) && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority Filter */}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-40 h-11" data-testid="priority-filter">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("decisionEngine.allPriority") || "All Priority"}</SelectItem>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.color}`}></span>
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Risk Level Filter - matching Observations */}
        <Select value={riskLevelFilter} onValueChange={setRiskLevelFilter}>
          <SelectTrigger className="w-full sm:w-40 h-11" data-testid="risk-level-filter">
            <AlertTriangle className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("actionsPage.allStatus") || "All Risk Levels"}</SelectItem>
            {RISK_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${r.color}`}></span>
                  {r.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Discipline Filter */}
        {uniqueDisciplines.length > 0 && (
          <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
            <SelectTrigger className="w-full sm:w-44 h-11" data-testid="discipline-filter">
              <Briefcase className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder={t("common.discipline") || "Discipline"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("actionsPage.allDisciplines") || "All Disciplines"}</SelectItem>
              {uniqueDisciplines.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Sort By - matching Observations */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-44 h-11" data-testid="sort-by-select">
            <BarChart3 className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="risk_score">
              <span className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-purple-500" />
                Risk Score
              </span>
            </SelectItem>
            <SelectItem value="rpn">
              <span className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                RPN
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Actions List - matching ThreatsPage priority-list style */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      ) : sortedActions.length === 0 ? (
        <div className="empty-state py-16" data-testid="no-actions-message">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-700 mb-2">{t("actionsPage.noActions")}</h3>
          <p className="text-slate-500">
            Click "Act" on threat recommendations or investigation actions to track them here.
          </p>
        </div>
      ) : (
        <div className="priority-list" data-testid="actions-list">
          {sortedActions.map((action, idx) => {
            const StatusIcon = statusConfig[action.status]?.icon || Clock;
            const SourceIcon = sourceConfig[action.source_type]?.icon || FileText;
            const priority = priorityConfig[action.priority] || priorityConfig.medium;
            const overdue = isOverdue(action);

            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`priority-item group cursor-pointer ${overdue ? "border-l-4 border-l-red-400" : ""}`}
                data-testid={`action-row-${action.id}`}
                onClick={() => setViewingAction(action)}
              >
                {/* Status Icon */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextStatus = action.status === "open" ? "in_progress" : 
                      action.status === "in_progress" ? "completed" : "open";
                    quickStatusUpdate(action, nextStatus);
                  }}
                  className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${priority.iconBg}`}
                  title={`Status: ${statusConfig[action.status]?.label}. Click to change.`}
                >
                  <StatusIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${priority.iconColor}`} />
                </button>

                {/* Action Number Badge */}
                <div 
                  className="flex items-center justify-center px-2 py-1 bg-slate-100 rounded-md text-xs font-mono text-slate-500 min-w-[60px]" 
                  data-testid={`action-number-${action.id}`}
                >
                  {action.action_number}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <h3 className="font-semibold text-slate-900 text-sm sm:text-base truncate max-w-[300px] sm:max-w-[400px] lg:max-w-[500px] cursor-default">
                            {action.title}
                          </h3>
                        </TooltipTrigger>
                        {action.title && action.title.length > 40 && (
                          <TooltipContent side="bottom" className="max-w-sm">
                            <p className="text-xs">{action.title}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    <Badge className={priority.color}>
                      {priority.label}
                    </Badge>
                    {/* Action Type Badge (CM/PM/PDM) */}
                    {action.action_type && (
                      <Badge className={
                        action.action_type === 'PM' ? 'bg-blue-100 text-blue-700' :
                        action.action_type === 'CM' ? 'bg-amber-100 text-amber-700' :
                        action.action_type === 'PDM' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }>
                        {action.action_type}
                      </Badge>
                    )}
                    {/* Discipline Badge */}
                    {action.discipline && (
                      <Badge className="bg-slate-100 text-slate-600">
                        {action.discipline}
                      </Badge>
                    )}
                    {overdue && (
                      <Badge className="bg-red-100 text-red-700">{t("taskScheduler.overdue")}</Badge>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                    {/* Source Link - Clickable to navigate to source */}
                    {action.source_type && action.source_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (action.source_type === "investigation") {
                            navigate(`/causal-engine?inv=${action.source_id}`);
                          } else if (action.source_type === "threat" || action.source_type === "ai_recommendation") {
                            navigate(`/threats/${action.source_id}`);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700"
                        data-testid={`source-link-${action.id}`}
                      >
                        <SourceIcon className={`w-3 h-3 ${sourceConfig[action.source_type]?.color}`} />
                        <span className="font-medium">{sourceConfig[action.source_type]?.label || action.source_type}</span>
                        <span className="text-slate-500">•</span>
                        <span className="max-w-[150px] truncate">{action.source_name || "Unknown"}</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </button>
                    )}
                    {!action.source_type && (
                      <span className="text-slate-400 italic">{t("actionsPage.noSourceLinked") || "No source linked"}</span>
                    )}
                    {action.assignee && (
                      <>
                        <span className="mx-1">•</span>
                        <User className="w-3 h-3" />
                        <span>{action.assignee}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Score Column - matching Observations format */}
                <div className="hidden sm:flex flex-col items-end min-w-[50px]">
                  <span className="text-xs text-slate-400 font-medium">{t("observations.riskScore")}</span>
                  <span className={`text-lg font-bold ${
                    action.threat_risk_score >= 70 ? "text-red-600" :
                    action.threat_risk_score >= 50 ? "text-orange-500" :
                    action.threat_risk_score >= 30 ? "text-yellow-500" :
                    action.threat_risk_score ? "text-green-500" : "text-slate-300"
                  }`}>
                    {action.threat_risk_score ?? "—"}
                  </span>
                </div>

                {/* RPN Column - matching Observations format */}
                <div className="hidden sm:flex flex-col items-end min-w-[50px]">
                  <span className="text-xs text-slate-400 font-medium">RPN</span>
                  <span className={`text-lg font-bold ${
                    action.threat_rpn >= 200 ? "text-red-600" :
                    action.threat_rpn >= 100 ? "text-orange-500" :
                    action.threat_rpn ? "text-blue-500" : "text-slate-300"
                  }`}>
                    {action.threat_rpn ?? "—"}
                  </span>
                </div>

                {/* Right side - Due date & Status */}
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className={`text-xs sm:text-sm font-medium ${overdue ? "text-red-600" : "text-slate-700"}`}>
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {formatDate(action.due_date)}
                    </div>
                  </div>
                  
                  {/* Status Badge - matching Observations format */}
                  <Badge className={
                    action.status === "completed" ? "bg-green-100 text-green-700" :
                    action.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-700"
                  }>
                    {statusConfig[action.status]?.label || "Open"}
                  </Badge>
                  
                  {/* Actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setViewingAction(action)}>
                        <Eye className="w-4 h-4 mr-2" /> View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEditDialog(action)}>
                        <Edit2 className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setDeleteConfirm(action)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("common.edit")} {t("actionsPage.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <label className="text-sm font-medium text-slate-700">{t("threatDetail.actionTitle")}</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder={t("threatDetail.actionTitle")}
                data-testid="edit-action-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">{t("common.description")}</label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder={t("common.description")}
                rows={2}
                data-testid="edit-action-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">{t("common.type") || "Type"}</label>
                <Select value={editForm.action_type || "none"} onValueChange={(v) => setEditForm({ ...editForm, action_type: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="edit-action-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No type</SelectItem>
                    <SelectItem value="CM">CM - Corrective</SelectItem>
                    <SelectItem value="PM">PM - Preventive</SelectItem>
                    <SelectItem value="PDM">PDM - Predictive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">{t("common.discipline") || "Discipline"}</label>
                <Input
                  value={editForm.discipline}
                  onChange={(e) => setEditForm({ ...editForm, discipline: e.target.value })}
                  placeholder="e.g. Mechanical, Electrical"
                  data-testid="edit-action-discipline"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">{t("common.status")}</label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger data-testid="edit-action-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">{t("common.open")}</SelectItem>
                    <SelectItem value="in_progress">{t("common.inProgress")}</SelectItem>
                    <SelectItem value="completed">{t("actionsPage.completedActions")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">{t("common.priority")}</label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                  <SelectTrigger data-testid="edit-action-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">{t("common.critical")}</SelectItem>
                    <SelectItem value="high">{t("common.high")}</SelectItem>
                    <SelectItem value="medium">{t("common.medium")}</SelectItem>
                    <SelectItem value="low">{t("common.low")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">{t("threatDetail.actionAssignee")}</label>
                <Select value={editForm.assignee || "unassigned"} onValueChange={(v) => setEditForm({ ...editForm, assignee: v === "unassigned" ? "" : v })}>
                  <SelectTrigger data-testid="edit-action-assignee">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {usersList.map((u) => (
                      <SelectItem key={u.id} value={u.name || u.email}>
                        <span className="flex items-center gap-2">
                          <User className="w-3 h-3" />
                          {u.name || u.email}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">{t("common.dueDate")}</label>
                <Input
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                  data-testid="edit-action-due-date"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">{t("common.comment") || "Comments"}</label>
              <Textarea
                value={editForm.comments}
                onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                placeholder="Add comments or notes..."
                rows={3}
                data-testid="edit-action-comments"
              />
            </div>
            {editForm.status === "completed" && (
              <div>
                <label className="text-sm font-medium text-slate-700">{t("taskScheduler.completionNotes")}</label>
                <Textarea
                  value={editForm.completion_notes}
                  onChange={(e) => setEditForm({ ...editForm, completion_notes: e.target.value })}
                  placeholder="Notes on how the action was completed"
                  rows={2}
                  data-testid="edit-action-notes"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t("taskScheduler.saving") : t("taskScheduler.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Action Dialog */}
      <Dialog open={!!viewingAction} onOpenChange={(open) => { if (!open) setViewingAction(null); }}>
        <DialogContent className="max-w-lg">
          {viewingAction && (() => {
            const va = viewingAction;
            const vaPriority = priorityConfig[va.priority] || priorityConfig.medium;
            const vaOverdue = isOverdue(va);
            const VaSourceIcon = sourceConfig[va.source_type]?.icon || FileText;
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center px-2 py-1 bg-slate-100 rounded-md text-xs font-mono text-slate-500">
                      {va.action_number}
                    </div>
                    <DialogTitle className="text-lg">{va.title}</DialogTitle>
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={vaPriority.color}>{vaPriority.label}</Badge>
                    <Badge className={
                      va.status === "completed" ? "bg-green-100 text-green-700" :
                      va.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                      "bg-slate-100 text-slate-700"
                    }>
                      {statusConfig[va.status]?.label || "Open"}
                    </Badge>
                    {va.action_type && (
                      <Badge className={
                        va.action_type === 'CM' ? 'bg-amber-100 text-amber-700' :
                        va.action_type === 'PM' ? 'bg-blue-100 text-blue-700' :
                        va.action_type === 'PDM' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }>{va.action_type}</Badge>
                    )}
                    {va.discipline && (
                      <Badge className="bg-slate-100 text-slate-600">{va.discipline}</Badge>
                    )}
                    {vaOverdue && (
                      <Badge className="bg-red-100 text-red-700">Overdue</Badge>
                    )}
                  </div>

                  {/* Description */}
                  {va.description && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("common.description")}</label>
                      <p className="text-sm text-slate-800 mt-1 leading-relaxed">{va.description}</p>
                    </div>
                  )}

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("threatDetail.actionAssignee")}</label>
                      <p className="text-sm text-slate-800 mt-1 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {va.assignee || <span className="text-slate-400 italic">Unassigned</span>}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("common.dueDate")}</label>
                      <p className={`text-sm mt-1 flex items-center gap-1.5 ${vaOverdue ? "text-red-600 font-medium" : "text-slate-800"}`}>
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(va.due_date)}
                      </p>
                    </div>
                  </div>

                  {/* Source */}
                  {va.source_type && va.source_id && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("actionsPage.source") || "Source"}</label>
                      <button
                        onClick={() => {
                          if (va.source_type === "investigation") navigate(`/causal-engine?inv=${va.source_id}`);
                          else if (va.source_type === "threat" || va.source_type === "ai_recommendation") navigate(`/threats/${va.source_id}`);
                          setViewingAction(null);
                        }}
                        className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-sm text-slate-700"
                        data-testid="view-action-source-link"
                      >
                        <VaSourceIcon className={`w-4 h-4 ${sourceConfig[va.source_type]?.color}`} />
                        <span className="font-medium">{sourceConfig[va.source_type]?.label}</span>
                        <span className="text-slate-400">-</span>
                        <span className="truncate max-w-[200px]">{va.source_name || "Unknown"}</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </button>
                    </div>
                  )}

                  {/* Risk scores */}
                  {(va.threat_risk_score || va.threat_rpn) && (
                    <div className="grid grid-cols-2 gap-4">
                      {va.threat_risk_score != null && (
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Risk Score</label>
                          <p className={`text-lg font-bold mt-1 ${
                            va.threat_risk_score >= 70 ? "text-red-600" :
                            va.threat_risk_score >= 50 ? "text-orange-500" :
                            "text-green-500"
                          }`}>{va.threat_risk_score}</p>
                        </div>
                      )}
                      {va.threat_rpn != null && (
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">RPN</label>
                          <p className={`text-lg font-bold mt-1 ${
                            va.threat_rpn >= 200 ? "text-red-600" :
                            va.threat_rpn >= 100 ? "text-orange-500" :
                            "text-blue-500"
                          }`}>{va.threat_rpn}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comments */}
                  {va.comments && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {t("common.comment") || "Comments"}
                      </label>
                      <p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3 leading-relaxed">{va.comments}</p>
                    </div>
                  )}

                  {/* Completion Notes */}
                  {va.completion_notes && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("taskScheduler.completionNotes")}</label>
                      <p className="text-sm text-slate-700 mt-1 bg-green-50 rounded-lg p-3 leading-relaxed">{va.completion_notes}</p>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="text-xs text-slate-400 flex items-center gap-4 pt-2 border-t border-slate-100">
                    {va.created_at && <span>Created: {new Date(va.created_at).toLocaleString()}</span>}
                    {va.updated_at && <span>Updated: {new Date(va.updated_at).toLocaleString()}</span>}
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => { setDeleteConfirm(va); setViewingAction(null); }}
                    data-testid="view-action-delete-btn"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t("common.delete")}
                  </Button>
                  <Button onClick={() => openEditDialog(va)} data-testid="view-action-edit-btn">
                    <Edit2 className="w-4 h-4 mr-2" />
                    {t("common.edit")}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")} {t("actionsPage.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("threatDetail.deleteWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
