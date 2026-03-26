import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { actionsAPI } from "../lib/api";
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
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
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
import BackButton from "../components/BackButton";

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
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [riskScoreFilter, setRiskScoreFilter] = useState("all");
  const [editingAction, setEditingAction] = useState(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Form state for editing
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    assignee: "",
    discipline: "",
    due_date: "",
    status: "open",
    completion_notes: "",
  });

  // Fetch actions
  const { data, isLoading } = useQuery({
    queryKey: ["actions", statusFilter, priorityFilter, sourceFilter],
    queryFn: () => actionsAPI.getAll({
      status: statusFilter !== "all" ? statusFilter : undefined,
      priority: priorityFilter !== "all" ? priorityFilter : undefined,
      source_type: sourceFilter !== "all" ? sourceFilter : undefined,
    }),
  });

  const actions = data?.actions || [];
  const stats = data?.stats || { total: 0, open: 0, in_progress: 0, completed: 0, overdue: 0 };

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
      due_date: action.due_date ? action.due_date.split("T")[0] : "",
      status: action.status || "open",
      completion_notes: action.completion_notes || "",
    });
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

  // Filter actions by search and risk score
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
    
    // Risk score filter
    if (riskScoreFilter !== "all") {
      const riskScore = action.threat_risk_score;
      if (riskScoreFilter === "critical" && (riskScore === null || riskScore < 70)) return false;
      if (riskScoreFilter === "high" && (riskScore === null || riskScore < 50 || riskScore >= 70)) return false;
      if (riskScoreFilter === "medium" && (riskScore === null || riskScore < 30 || riskScore >= 50)) return false;
      if (riskScoreFilter === "low" && (riskScore === null || riskScore >= 30)) return false;
      if (riskScoreFilter === "none" && riskScore !== null) return false;
    }
    
    return true;
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

      {/* Filters - matching ThreatsPage */}
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 h-11" data-testid="status-filter">
            <Filter className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder={t("common.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("actionsPage.allStatus")}</SelectItem>
            <SelectItem value="open">{t("common.open")}</SelectItem>
            <SelectItem value="in_progress">{t("common.inProgress")}</SelectItem>
            <SelectItem value="completed">{t("actionsPage.completed")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-40 h-11" data-testid="priority-filter">
            <SelectValue placeholder={t("common.priority")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-44 h-11" data-testid="source-filter">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="threat">From Threats</SelectItem>
            <SelectItem value="investigation">From Investigations</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskScoreFilter} onValueChange={setRiskScoreFilter}>
          <SelectTrigger className="w-full sm:w-44 h-11" data-testid="risk-score-filter">
            <AlertTriangle className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Risk Score" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Scores</SelectItem>
            <SelectItem value="critical">Critical (70+)</SelectItem>
            <SelectItem value="high">High (50-69)</SelectItem>
            <SelectItem value="medium">Medium (30-49)</SelectItem>
            <SelectItem value="low">Low (&lt;30)</SelectItem>
            <SelectItem value="none">No Risk Data</SelectItem>
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
      ) : filteredActions.length === 0 ? (
        <div className="empty-state py-16" data-testid="no-actions-message">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No actions yet</h3>
          <p className="text-slate-500">
            Click "Act" on threat recommendations or investigation actions to track them here.
          </p>
        </div>
      ) : (
        <div className="priority-list" data-testid="actions-list">
          {filteredActions.map((action, idx) => {
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
                className={`priority-item group ${overdue ? "border-l-4 border-l-red-400" : ""}`}
                data-testid={`action-row-${action.id}`}
              >
                {/* Status Icon */}
                <button
                  onClick={() => {
                    const nextStatus = action.status === "open" ? "in_progress" : 
                      action.status === "in_progress" ? "completed" : "open";
                    quickStatusUpdate(action, nextStatus);
                  }}
                  className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${priority.iconBg}`}
                  title={`Status: ${statusConfig[action.status]?.label}. Click to change.`}
                >
                  <StatusIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${priority.iconColor}`} />
                </button>

                {/* Action Number */}
                <div className="priority-rank text-sm sm:text-base" data-testid={`action-number-${action.id}`}>
                  {action.action_number}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base line-clamp-1">
                      {action.title}
                    </h3>
                    <Badge className={priority.color}>
                      {priority.label}
                    </Badge>
                    {overdue && (
                      <Badge className="bg-red-100 text-red-700">Overdue</Badge>
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
                    {action.discipline && (
                      <>
                        <span className="mx-1">•</span>
                        <span>{action.discipline}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Score Column - matching Observations format */}
                <div className="hidden sm:flex flex-col items-end min-w-[50px]">
                  <span className="text-xs text-slate-400 font-medium">Score</span>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
            <DialogTitle>Edit Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Title</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Action title"
                data-testid="edit-action-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Action description"
                className="w-full min-h-[80px] px-3 py-2 border border-slate-300 rounded-md text-sm"
                data-testid="edit-action-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Status</label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger data-testid="edit-action-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Priority</label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                  <SelectTrigger data-testid="edit-action-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Assignee</label>
                <Input
                  value={editForm.assignee}
                  onChange={(e) => setEditForm({ ...editForm, assignee: e.target.value })}
                  placeholder="Person name"
                  data-testid="edit-action-assignee"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Discipline</label>
                <Input
                  value={editForm.discipline}
                  onChange={(e) => setEditForm({ ...editForm, discipline: e.target.value })}
                  placeholder="e.g. Mechanical, Electrical"
                  data-testid="edit-action-discipline"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Due Date</label>
              <Input
                type="date"
                value={editForm.due_date}
                onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                data-testid="edit-action-due-date"
              />
            </div>
            {editForm.status === "completed" && (
              <div>
                <label className="text-sm font-medium text-slate-700">Completion Notes</label>
                <textarea
                  value={editForm.completion_notes}
                  onChange={(e) => setEditForm({ ...editForm, completion_notes: e.target.value })}
                  placeholder="Notes on how the action was completed"
                  className="w-full min-h-[60px] px-3 py-2 border border-slate-300 rounded-md text-sm"
                  data-testid="edit-action-notes"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.title}"? This action can be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
