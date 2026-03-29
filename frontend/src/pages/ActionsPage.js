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
  Paperclip,
  Upload,
  X,
  Loader2,
  Image,
  Repeat,
  CalendarClock,
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
  Sheet,
  SheetContent,
} from "../components/ui/sheet";
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
import { DISCIPLINES, getDisciplineColor } from "../constants/disciplines";

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
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useState(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    attachments: [],
  });
  const [uploadingActionAttachment, setUploadingActionAttachment] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
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
      queryClient.invalidateQueries({ queryKey: ["threatTimeline"] });
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
      attachments: action.attachments || [],
    });
    setUploadingActionAttachment(false);
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
    <div className="h-[calc(100vh-64px)] flex flex-col" data-testid="actions-page">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 max-w-7xl mx-auto w-full">
        {/* Back Button - shown when navigated from another page */}
        {location.state?.from && (
          <div className="mb-3">
            <BackButton />
          </div>
        )}
        
        {/* Header - Mobile Optimized */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">{t("actionsPage.title") || "Actions"}</h1>
            <p className="text-xs text-slate-500 hidden sm:block">{t("actionsPage.subtitle") || "Track and manage corrective actions"}</p>
          </div>
          {/* Mobile: Inline stats */}
          <div className="flex sm:hidden items-center gap-2 text-xs">
            <span className="bg-slate-100 px-2 py-0.5 rounded-full font-medium">{stats.total}</span>
            {stats.overdue > 0 && (
              <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{stats.overdue} overdue</span>
            )}
          </div>
        </div>
        
        {/* Compact Stats Row - Desktop only */}
        <div className="hidden sm:flex flex-wrap gap-3 mb-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200"
              data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className={`p-1.5 rounded-md ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <span className="text-lg font-bold text-slate-900">{stat.value}</span>
              <span className="text-xs text-slate-500">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Filters - Mobile Optimized */}
        <div className="flex items-center gap-2 mb-2" data-testid="actions-filters">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
              data-testid="actions-search"
            />
          </div>
          
          {/* Multi-select Status Filter */}
          <div className="relative">
            {statusDropdownOpen && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setStatusDropdownOpen(false)}
              />
            )}
            
            <button
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              className="flex items-center justify-between w-[90px] sm:w-40 h-9 px-2 sm:px-3 bg-white border border-slate-200 rounded-md text-xs sm:text-sm hover:bg-slate-50 transition-colors"
              data-testid="status-filter-select"
            >
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className={`truncate ${statusFilter.length > 0 ? "text-slate-900" : "text-slate-500"}`}>
                  {statusFilter.length === 0 ? "Status" : statusFilter.length === 1 ? statusFilter[0] : `${statusFilter.length} sel`}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${statusDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {statusDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 sm:w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
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

          {/* Priority Filter - Hidden on mobile */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="hidden sm:flex w-36 h-9 text-sm" data-testid="priority-filter">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
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

          {/* Sort By - Hidden on mobile */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="hidden sm:flex w-36 h-9 text-sm" data-testid="sort-by-select">
              <BarChart3 className="w-3.5 h-3.5 mr-1 text-slate-400" />
              <SelectValue placeholder="Sort" />
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
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* Actions List */}
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
                onClick={() => navigate(`/actions/${action.id}`)}
              >
                {/* Status Icon */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextStatus = action.status === "open" ? "in_progress" : 
                      action.status === "in_progress" ? "completed" : "open";
                    quickStatusUpdate(action, nextStatus);
                  }}
                  className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center ${priority.iconBg}`}
                  title={`Status: ${statusConfig[action.status]?.label}. Click to change.`}
                >
                  <StatusIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${priority.iconColor}`} />
                </button>

                {/* Action Number Badge - Hidden on mobile */}
                <div 
                  className="hidden sm:flex items-center justify-center px-2 py-1 bg-slate-100 rounded-md text-xs font-mono text-slate-500 min-w-[60px]" 
                  data-testid={`action-number-${action.id}`}
                >
                  {action.action_number}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-2 sm:line-clamp-1">
                      {action.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    {/* Priority Badge - Always show */}
                    <Badge className={`${priority.color} text-[10px] sm:text-xs px-1.5 py-0`}>
                      {priority.label}
                    </Badge>
                    {/* Action Type Badge - Hidden on mobile */}
                    {action.action_type && (
                      <Badge className={`hidden sm:inline-flex text-xs ${
                        action.action_type === 'PM' ? 'bg-blue-100 text-blue-700' :
                        action.action_type === 'CM' ? 'bg-amber-100 text-amber-700' :
                        action.action_type === 'PDM' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {action.action_type}
                      </Badge>
                    )}
                    {/* Discipline Badge - Hidden on mobile */}
                    {action.discipline && (
                      <Badge className="hidden sm:inline-flex bg-slate-100 text-slate-600 text-xs">
                        {action.discipline}
                      </Badge>
                    )}
                    {overdue && (
                      <Badge className="bg-red-100 text-red-700 text-[10px] sm:text-xs px-1.5 py-0">{t("taskScheduler.overdue")}</Badge>
                    )}
                  </div>
                  {/* Source info - Simplified on mobile */}
                  <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
                    {action.source_name || action.assignee || "No source"}
                  </div>
                </div>

                {/* Score Column - Visible on mobile, compact */}
                <div className="flex flex-col items-end min-w-[40px] sm:min-w-[50px]">
                  <span className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">{t("observations.riskScore")}</span>
                  <span className={`text-sm sm:text-lg font-bold ${
                    action.threat_risk_score >= 70 ? "text-red-600" :
                    action.threat_risk_score >= 50 ? "text-orange-500" :
                    action.threat_risk_score >= 30 ? "text-yellow-500" :
                    action.threat_risk_score ? "text-green-500" : "text-slate-300"
                  }`}>
                    {action.threat_risk_score ?? "—"}
                  </span>
                </div>

                {/* RPN Column - Show on mobile too */}
                <div className="flex flex-col items-end min-w-[35px] sm:min-w-[50px]">
                  <span className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">RPN</span>
                  <span className={`text-sm sm:text-lg font-bold ${
                    action.threat_rpn >= 200 ? "text-red-600" :
                    action.threat_rpn >= 100 ? "text-orange-500" :
                    action.threat_rpn ? "text-blue-500" : "text-slate-300"
                  }`}>
                    {action.threat_rpn ?? "—"}
                  </span>
                </div>

                {/* Right side - Due date & Status - Hidden on mobile except status */}
                <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                  {/* Due date - Hidden on mobile */}
                  <div className="hidden sm:block text-right">
                    <div className={`text-xs sm:text-sm font-medium ${overdue ? "text-red-600" : "text-slate-700"}`}>
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {formatDate(action.due_date)}
                    </div>
                  </div>
                  
                  {/* Status Badge - Hidden on mobile */}
                  <Badge className={`hidden sm:inline-flex ${
                    action.status === "completed" ? "bg-green-100 text-green-700" :
                    action.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-700"
                  }`}>
                    {statusConfig[action.status]?.label || "Open"}
                  </Badge>
                  
                  {/* Actions menu - Always visible on mobile */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/actions/${action.id}`)}>
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
        </div>
      </div>

      {/* Action Detail / Edit - Sheet on mobile, Dialog on desktop */}
      {isMobile ? (
        <Sheet open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl overflow-hidden p-0">
            {editingAction && (() => {
              const ea = editingAction;
              const EaSourceIcon = sourceConfig[ea.source_type]?.icon || FileText;
              return (
                <div className="flex flex-col h-full">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-slate-200 rounded text-[10px] font-mono text-slate-600">
                        {ea.action_number}
                      </span>
                      <h3 className="font-semibold text-sm text-slate-900 truncate">{ea.title}</h3>
                    </div>
                    {ea.source_type && ea.source_id && (
                      <button
                        onClick={() => {
                          if (ea.source_type === "investigation") navigate(`/causal-engine?inv=${ea.source_id}`);
                          else if (ea.source_type === "threat" || ea.source_type === "ai_recommendation") navigate(`/threats/${ea.source_id}`);
                          setIsEditDialogOpen(false);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] text-slate-500"
                      >
                        <EaSourceIcon className={`w-3 h-3 ${sourceConfig[ea.source_type]?.color}`} />
                        <span>{sourceConfig[ea.source_type]?.label}: {ea.source_name?.substring(0, 30) || "Unknown"}...</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  
                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Title</label>
                      <Input
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Description</label>
                      <Textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Type</label>
                        <Select value={editForm.action_type || "none"} onValueChange={(v) => setEditForm({ ...editForm, action_type: v === "none" ? "" : v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="CM">CM</SelectItem>
                            <SelectItem value="PM">PM</SelectItem>
                            <SelectItem value="PDM">PDM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Discipline</label>
                        <Select 
                          value={editForm.discipline} 
                          onValueChange={(v) => setEditForm({ ...editForm, discipline: v })}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select discipline" />
                          </SelectTrigger>
                          <SelectContent>
                            {DISCIPLINES.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Status</label>
                        <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Priority</label>
                        <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Assignee</label>
                        <Select value={editForm.assignee || "unassigned"} onValueChange={(v) => setEditForm({ ...editForm, assignee: v === "unassigned" ? "" : v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {usersList.map((u) => (
                              <SelectItem key={u.id} value={u.name || u.email}>{u.name || u.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Due Date</label>
                        <Input
                          type="date"
                          value={editForm.due_date}
                          onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Comments</label>
                      <Textarea
                        value={editForm.comments}
                        onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                    {editForm.status === "completed" && (
                      <div>
                        <label className="text-xs font-medium text-slate-600">Completion Notes</label>
                        <Textarea
                          value={editForm.completion_notes}
                          onChange={(e) => setEditForm({ ...editForm, completion_notes: e.target.value })}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                    )}
                    
                    {/* Attachments Section */}
                    {editForm.status === "completed" && (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                          <Paperclip className="w-3.5 h-3.5" />
                          Attachments
                        </label>
                        
                        {editForm.attachments?.length > 0 && (
                          <div className="space-y-1">
                            {editForm.attachments.map((att, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-1.5 bg-slate-50 rounded border border-slate-200 text-xs">
                                {att.type?.startsWith("image/") ? (
                                  <Image className="w-3.5 h-3.5 text-blue-500" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                                )}
                                <span className="truncate flex-1">{att.name}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => setEditForm(prev => ({
                                    ...prev,
                                    attachments: prev.attachments.filter((_, i) => i !== idx)
                                  }))}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            id="action-attachment-mobile"
                            className="hidden"
                            multiple
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length === 0) return;
                              setUploadingActionAttachment(true);
                              try {
                                for (const file of files) {
                                  const result = await actionsAPI.uploadAttachment(file);
                                  setEditForm(prev => ({
                                    ...prev,
                                    attachments: [...(prev.attachments || []), result]
                                  }));
                                }
                                toast.success(`${files.length} file(s) uploaded`);
                              } catch (error) {
                                toast.error("Failed to upload file(s)");
                              } finally {
                                setUploadingActionAttachment(false);
                                e.target.value = "";
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={uploadingActionAttachment}
                            onClick={() => document.getElementById("action-attachment-mobile")?.click()}
                          >
                            {uploadingActionAttachment ? (
                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Uploading...</>
                            ) : (
                              <><Upload className="w-3 h-3 mr-1" />Add Files</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                    {/* Risk Scores */}
                    {(ea.threat_risk_score != null || ea.threat_rpn != null) && (
                      <div className="grid grid-cols-2 gap-3 p-2 bg-slate-50 rounded-lg">
                        {ea.threat_risk_score != null && (
                          <div>
                            <label className="text-[10px] font-medium text-slate-500 uppercase">Risk Score</label>
                            <p className={`text-base font-bold ${ea.threat_risk_score >= 70 ? "text-red-600" : ea.threat_risk_score >= 50 ? "text-orange-500" : "text-green-500"}`}>{ea.threat_risk_score}</p>
                          </div>
                        )}
                        {ea.threat_rpn != null && (
                          <div>
                            <label className="text-[10px] font-medium text-slate-500 uppercase">RPN</label>
                            <p className={`text-base font-bold ${ea.threat_rpn >= 200 ? "text-red-600" : ea.threat_rpn >= 100 ? "text-orange-500" : "text-blue-500"}`}>{ea.threat_rpn}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Footer */}
                  <div className="px-4 py-3 border-t border-slate-200 bg-white flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200"
                      onClick={() => { setDeleteConfirm(ea); setIsEditDialogOpen(false); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(false)} className="flex-1">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending} className="flex-1">
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg">
            {editingAction && (() => {
              const ea = editingAction;
              const EaSourceIcon = sourceConfig[ea.source_type]?.icon || FileText;
              return (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center px-2.5 py-1 bg-slate-100 rounded-md text-xs font-mono text-slate-500">
                        {ea.action_number}
                      </div>
                      <DialogTitle className="text-base">{ea.title}</DialogTitle>
                    </div>
                    {ea.source_type && ea.source_id && (
                      <button
                        onClick={() => {
                          if (ea.source_type === "investigation") navigate(`/causal-engine?inv=${ea.source_id}`);
                          else if (ea.source_type === "threat" || ea.source_type === "ai_recommendation") navigate(`/threats/${ea.source_id}`);
                          setIsEditDialogOpen(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-xs text-slate-600 w-fit mt-1"
                      >
                        <EaSourceIcon className={`w-3.5 h-3.5 ${sourceConfig[ea.source_type]?.color}`} />
                        <span className="font-medium">{sourceConfig[ea.source_type]?.label}</span>
                        <span className="text-slate-300">-</span>
                        <span className="truncate max-w-[200px]">{ea.source_name || "Unknown"}</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </button>
                    )}
                  </DialogHeader>
                  <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
                    <div>
                      <label className="text-sm font-medium text-slate-700">{t("threatDetail.actionTitle")}</label>
                      <Input
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        placeholder={t("threatDetail.actionTitle")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">{t("common.description")}</label>
                      <Textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder={t("common.description")}
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-slate-700">{t("common.type") || "Type"}</label>
                        <Select value={editForm.action_type || "none"} onValueChange={(v) => setEditForm({ ...editForm, action_type: v === "none" ? "" : v })}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
                        <Select 
                          value={editForm.discipline || ""} 
                          onValueChange={(v) => setEditForm({ ...editForm, discipline: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select discipline" />
                          </SelectTrigger>
                          <SelectContent>
                            {DISCIPLINES.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-slate-700">{t("common.status")}</label>
                        <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                          <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
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
                        />
                      </div>
                    )}
                    
                    {/* Attachments Section */}
                    {editForm.status === "completed" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                          <Paperclip className="w-4 h-4" />
                          Attachments
                        </label>
                        
                        {editForm.attachments?.length > 0 && (
                          <div className="space-y-1.5">
                            {editForm.attachments.map((att, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                                {att.type?.startsWith("image/") ? (
                                  <Image className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                )}
                                <span className="text-sm text-slate-700 truncate flex-1">{att.name}</span>
                                <span className="text-xs text-slate-400">{(att.size / 1024).toFixed(1)} KB</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => setEditForm(prev => ({
                                    ...prev,
                                    attachments: prev.attachments.filter((_, i) => i !== idx)
                                  }))}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            id="action-attachment-desktop"
                            className="hidden"
                            multiple
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length === 0) return;
                              setUploadingActionAttachment(true);
                              try {
                                for (const file of files) {
                                  const result = await actionsAPI.uploadAttachment(file);
                                  setEditForm(prev => ({
                                    ...prev,
                                    attachments: [...(prev.attachments || []), result]
                                  }));
                                }
                                toast.success(`${files.length} file(s) uploaded`);
                              } catch (error) {
                                toast.error("Failed to upload file(s)");
                              } finally {
                                setUploadingActionAttachment(false);
                                e.target.value = "";
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={uploadingActionAttachment}
                            onClick={() => document.getElementById("action-attachment-desktop")?.click()}
                          >
                            {uploadingActionAttachment ? (
                              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading...</>
                            ) : (
                              <><Upload className="w-3.5 h-3.5 mr-1.5" />Add Files</>
                            )}
                          </Button>
                          <span className="text-xs text-slate-400">Images, PDF, documents</span>
                        </div>
                      </div>
                    )}
                    {(ea.threat_risk_score != null || ea.threat_rpn != null) && (
                      <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg">
                        {ea.threat_risk_score != null && (
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Risk Score</label>
                            <p className={`text-lg font-bold mt-0.5 ${ea.threat_risk_score >= 70 ? "text-red-600" : ea.threat_risk_score >= 50 ? "text-orange-500" : "text-green-500"}`}>{ea.threat_risk_score}</p>
                          </div>
                        )}
                        {ea.threat_rpn != null && (
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">RPN</label>
                            <p className={`text-lg font-bold mt-0.5 ${ea.threat_rpn >= 200 ? "text-red-600" : ea.threat_rpn >= 100 ? "text-orange-500" : "text-blue-500"}`}>{ea.threat_rpn}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 flex items-center gap-4 pt-2 border-t border-slate-100">
                      {ea.created_at && <span>Created: {new Date(ea.created_at).toLocaleString()}</span>}
                      {ea.updated_at && <span>Updated: {new Date(ea.updated_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:justify-between flex-wrap">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => { setDeleteConfirm(ea); setIsEditDialogOpen(false); }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t("common.delete")}
                      </Button>
                      
                      {/* Create Recurring Task button - Only for PM actions */}
                      {ea.action_type === "PM" && (
                        <Button
                          variant="outline"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                          onClick={() => {
                            // Navigate to task designer with pre-filled data
                            navigate("/tasks", {
                              state: {
                                createTask: true,
                                prefill: {
                                  name: ea.title,
                                  description: ea.description || `Recurring maintenance task from action: ${ea.title}`,
                                  discipline: ea.discipline || "",
                                  source_action_id: ea.id,
                                  source_action_title: ea.title,
                                }
                              }
                            });
                            setIsEditDialogOpen(false);
                          }}
                          data-testid="create-recurring-task-btn"
                        >
                          <CalendarClock className="w-4 h-4 mr-2" />
                          Create Recurring Task
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                        {t("common.cancel")}
                      </Button>
                      <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? t("taskScheduler.saving") : t("taskScheduler.saveChanges")}
                      </Button>
                    </div>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}

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
