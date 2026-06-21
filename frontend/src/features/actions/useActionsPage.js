import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { actionsAPI, usersAPI } from "../../lib/api";
import { useUndo } from "../../contexts/UndoContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import { formatDate as formatDateUtil } from "../../lib/dateUtils";
import { useTranslatedActions } from "../../hooks/useTranslatedEntities";
import { queryKeys } from "../../lib/queryKeys";

const EMPTY_EDIT_FORM = {
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
};

export function useActionsPage() {
  const queryClient = useQueryClient();
  const { pushUndo } = useUndo();
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(["open", "in_progress"]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [riskLevelFilter, setRiskLevelFilter] = useState("all");
  const [sortBy, setSortBy] = useState("latest");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [editingAction, setEditingAction] = useState(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [uploadingActionAttachment, setUploadingActionAttachment] = useState(false);
  const [closureSuggestion, setClosureSuggestion] = useState(null);

  const canWrite = hasPermission("actions", "write");
  const canDelete = hasPermission("actions", "delete");

  const toggleStatus = (status) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const clearStatusFilter = () => setStatusFilter([]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.actions.all(),
    queryFn: () => actionsAPI.getAll(),
  });

  const rawActions = data?.actions || [];
  const { actions: translatedActions } = useTranslatedActions(rawActions);
  const actions = translatedActions;
  const uniqueDisciplines = [...new Set(actions.map((a) => a.discipline).filter(Boolean))].sort();

  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.rbac(),
    queryFn: usersAPI.getAll,
    staleTime: 5 * 60 * 1000,
  });
  const usersList = usersData?.users || [];

  const updateMutation = useMutation({
    mutationFn: ({ actionId, data: payload, oldData }) =>
      actionsAPI.update(actionId, payload).then((result) => ({ result, actionId, data: payload, oldData })),
    onSuccess: ({ result, actionId, data: payload, oldData }) => {
      if (oldData) {
        pushUndo({
          type: "UPDATE_ACTION",
          label: `Edit action "${oldData.title}"`,
          data: { oldData, newData: payload },
          undo: async () => {
            await actionsAPI.update(actionId, oldData);
            queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.myTasks.prefix,
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.centralActions.prefix,
      });
      toast.success("Action updated");
      setIsEditDialogOpen(false);
      setEditingAction(null);
      if (result?.completion_notification) {
        const notification = result.completion_notification;
        if (notification.auto_mitigated) {
          toast.success(notification.message || "Observation moved to Mitigated");
          queryClient.invalidateQueries({ queryKey: queryKeys.threats.all() });
        } else {
          setClosureSuggestion(notification);
        }
      }
    },
    onError: () => toast.error("Failed to update action"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (actionId) => {
      const actionToDelete = actions.find((a) => a.id === actionId);
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
            queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.threats.timelineAll() });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.myTasks.prefix,
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.centralActions.prefix,
      });
      toast.success("Action deleted");
      setDeleteConfirm(null);
    },
    onError: () => toast.error("Failed to delete action"),
  });

  const quickStatusUpdate = (action, newStatus) => {
    updateMutation.mutate({
      actionId: action.id,
      data: { status: newStatus },
      oldData: action,
    });
  };

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

  const handleSaveEdit = () => {
    if (!editForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    updateMutation.mutate({
      actionId: editingAction.id,
      data: { ...editForm, due_date: editForm.due_date || null },
      oldData: editingAction,
    });
  };

  const filteredActions = useMemo(
    () =>
      actions.filter((action) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesSearch =
            action.title?.toLowerCase().includes(query) ||
            action.description?.toLowerCase().includes(query) ||
            action.assignee?.toLowerCase().includes(query) ||
            action.action_number?.toLowerCase().includes(query);
          if (!matchesSearch) return false;
        }
        if (statusFilter.length > 0 && !statusFilter.includes(action.status)) return false;
        if (priorityFilter !== "all" && action.priority !== priorityFilter) return false;
        if (sourceFilter !== "all" && action.source_type !== sourceFilter) return false;
        if (riskLevelFilter !== "all" && action.threat_risk_level !== riskLevelFilter) return false;
        if (disciplineFilter !== "all" && (action.discipline || "") !== disciplineFilter) return false;
        return true;
      }),
    [
      actions,
      searchQuery,
      statusFilter,
      priorityFilter,
      sourceFilter,
      riskLevelFilter,
      disciplineFilter,
    ]
  );

  const isOverdue = (action) => {
    if (!action.due_date || action.status === "completed") return false;
    return new Date(action.due_date) < new Date();
  };

  const stats = useMemo(() => {
    const next = { total: filteredActions.length, open: 0, in_progress: 0, completed: 0, overdue: 0 };
    for (const action of filteredActions) {
      if (action.status === "open") next.open += 1;
      else if (action.status === "in_progress") next.in_progress += 1;
      else if (action.status === "completed") next.completed += 1;
      if (isOverdue(action)) next.overdue += 1;
    }
    return next;
  }, [filteredActions]);

  const sortedActions = useMemo(() => {
    return [...filteredActions].sort((a, b) => {
      if (sortBy === "rpn") return (b.threat_rpn || 0) - (a.threat_rpn || 0);
      if (sortBy === "latest") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === "oldest") return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      return (b.threat_risk_score || 0) - (a.threat_risk_score || 0);
    });
  }, [filteredActions, sortBy]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "No due date";
    return formatDateUtil(dateStr);
  };

  const statCards = [
    { label: t("actionsPage.totalActions"), value: stats.total, icon: FileText, color: "text-slate-600", bg: "bg-slate-100" },
    { label: t("common.open"), value: stats.open, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
    { label: t("common.inProgress"), value: stats.in_progress, icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50" },
    { label: t("actionsPage.completedActions"), value: stats.completed, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: t("actionsPage.overdueActions"), value: stats.overdue, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
  ];

  return {
    t,
    stats,
    statCards,
    searchQuery,
    setSearchQuery,
    statusFilter,
    statusDropdownOpen,
    setStatusDropdownOpen,
    toggleStatus,
    clearStatusFilter,
    priorityFilter,
    setPriorityFilter,
    sourceFilter,
    setSourceFilter,
    riskLevelFilter,
    setRiskLevelFilter,
    sortBy,
    setSortBy,
    sortDropdownOpen,
    setSortDropdownOpen,
    disciplineFilter,
    setDisciplineFilter,
    uniqueDisciplines,
    canWrite,
    canDelete,
    isLoading,
    sortedActions,
    usersList,
    editingAction,
    isEditDialogOpen,
    setIsEditDialogOpen,
    deleteConfirm,
    setDeleteConfirm,
    editForm,
    setEditForm,
    uploadingActionAttachment,
    setUploadingActionAttachment,
    closureSuggestion,
    setClosureSuggestion,
    updateMutation,
    deleteMutation,
    quickStatusUpdate,
    openEditDialog,
    handleSaveEdit,
    isOverdue,
    formatDate,
  };
}
