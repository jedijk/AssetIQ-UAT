import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Save, Trash2, ExternalLink, Calendar, User,
  FileText, Brain, Search, AlertTriangle, Loader2, Check,
  CalendarClock, CheckCircle, CheckCircle2
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { actionsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || "";

const sourceConfig = {
  threat: { label: "Threat", icon: AlertTriangle, color: "text-orange-600" },
  investigation: { label: "Investigation", icon: Search, color: "text-blue-600" },
  ai_recommendation: { label: "AI", icon: Brain, color: "text-purple-600" },
};

const priorityConfig = {
  critical: { label: "Critical", color: "bg-red-100 text-red-700" },
  high: { label: "High", color: "bg-orange-100 text-orange-700" },
  medium: { label: "Medium", color: "bg-yellow-100 text-yellow-700" },
  low: { label: "Low", color: "bg-green-100 text-green-700" },
};

const statusConfig = {
  open: { label: "Open", color: "bg-slate-100 text-slate-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700" },
};

export default function ActionDetailPage() {
  const { actionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [closureSuggestion, setClosureSuggestion] = useState(null);

  // Fetch action details
  const { data: action, isLoading, error } = useQuery({
    queryKey: ["action", actionId],
    queryFn: () => actionsAPI.getById(actionId),
    enabled: !!actionId,
  });

  // Fetch users list
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_BASE_URL}/api/rbac/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setUsersList(data.users || []);
        }
      } catch (err) {
        console.error("Failed to fetch users:", err);
      }
    };
    fetchUsers();
  }, []);

  // Initialize form when action loads
  useEffect(() => {
    if (action) {
      setEditForm({
        title: action.title || "",
        description: action.description || "",
        status: action.status || "open",
        priority: action.priority || "medium",
        assignee: action.assignee || "",
        due_date: action.due_date ? action.due_date.split("T")[0] : "",
        action_type: action.action_type || "",
        discipline: action.discipline || "",
        comments: action.comments || "",
        completion_notes: action.completion_notes || "",
      });
    }
  }, [action]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => actionsAPI.update(actionId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["action", actionId] });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Action updated successfully");
      
      // Check if all actions for the source are now completed
      if (result?.completion_notification) {
        setClosureSuggestion(result.completion_notification);
      }
    },
    onError: () => toast.error("Failed to update action"),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => actionsAPI.delete(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Action deleted");
      navigate("/actions");
    },
    onError: () => toast.error("Failed to delete action"),
  });

  const handleSave = () => {
    updateMutation.mutate(editForm);
  };

  const handleQuickStatusChange = (newStatus) => {
    setEditForm(prev => ({ ...prev, status: newStatus }));
    updateMutation.mutate({ ...editForm, status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !action) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900">Action not found</h2>
        <Button variant="outline" onClick={() => navigate("/actions")} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Actions
        </Button>
      </div>
    );
  }

  const SourceIcon = sourceConfig[action.source_type]?.icon || FileText;
  const priority = priorityConfig[action.priority] || priorityConfig.medium;
  const status = statusConfig[action.status] || statusConfig.open;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Fixed Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 max-w-2xl">
          <div className="flex items-center gap-2 py-2 sm:py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/actions")}
              className="p-1.5 sm:p-2 -ml-1"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] sm:text-xs font-mono text-slate-500">
                  {action.action_number}
                </span>
                <h1 className="font-semibold text-sm sm:text-base text-slate-900 truncate">
                  {action.title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Quick Status Buttons */}
              {action.status !== "completed" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickStatusChange("completed")}
                  className="h-7 sm:h-8 px-2 sm:px-3 text-xs text-green-600 border-green-200 hover:bg-green-50"
                >
                  <Check className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Complete</span>
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="h-7 sm:h-8 px-2 sm:px-3 text-xs"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    <Save className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                    <span className="hidden sm:inline">Save</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="container mx-auto px-3 sm:px-4 py-4 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Source & Scores Card */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              {/* Source Link */}
              {action.source_type && action.source_id && (
                <button
                  onClick={() => {
                    if (action.source_type === "investigation") navigate(`/causal-engine?inv=${action.source_id}`);
                    else if (action.source_type === "threat" || action.source_type === "ai_recommendation") navigate(`/threats/${action.source_id}`);
                  }}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 transition-colors text-xs text-slate-600"
                >
                  <SourceIcon className={`w-3 h-3 ${sourceConfig[action.source_type]?.color}`} />
                  <span className="font-medium">{sourceConfig[action.source_type]?.label}:</span>
                  <span className="truncate max-w-[120px] sm:max-w-[200px]">{action.source_name || "Unknown"}</span>
                  <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                </button>
              )}
              
              {/* Scores */}
              <div className="flex items-center gap-2 sm:gap-3">
                {action.threat_risk_score != null && (
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 uppercase">Score</div>
                    <div className={`text-sm sm:text-base font-bold ${
                      action.threat_risk_score >= 70 ? "text-red-600" :
                      action.threat_risk_score >= 50 ? "text-orange-500" : "text-green-500"
                    }`}>{action.threat_risk_score}</div>
                  </div>
                )}
                {action.threat_rpn != null && (
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 uppercase">RPN</div>
                    <div className={`text-sm sm:text-base font-bold ${
                      action.threat_rpn >= 200 ? "text-red-600" :
                      action.threat_rpn >= 100 ? "text-orange-500" : "text-blue-500"
                    }`}>{action.threat_rpn}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status & Priority */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger className="h-9 text-sm">
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
                <label className="text-xs font-medium text-slate-500 mb-1 block">Priority</label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                  <SelectTrigger className="h-9 text-sm">
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
          </div>

          {/* Title & Description */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Title</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>

          {/* Type & Discipline */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Type</label>
                <Select value={editForm.action_type || "none"} onValueChange={(v) => setEditForm({ ...editForm, action_type: v === "none" ? "" : v })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="CM">CM - Corrective</SelectItem>
                    <SelectItem value="PM">PM - Preventive</SelectItem>
                    <SelectItem value="PDM">PDM - Predictive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Discipline</label>
                <Input
                  value={editForm.discipline}
                  onChange={(e) => setEditForm({ ...editForm, discipline: e.target.value })}
                  placeholder="e.g. Mech"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Assignee & Due Date */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Assignee</label>
                <Select value={editForm.assignee || "unassigned"} onValueChange={(v) => setEditForm({ ...editForm, assignee: v === "unassigned" ? "" : v })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {usersList.map((u) => (
                      <SelectItem key={u.id} value={u.name || u.email}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Due Date</label>
                <Input
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Comments</label>
            <Textarea
              value={editForm.comments}
              onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
              placeholder="Add comments or notes..."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Completion Notes (only if completed) */}
          {editForm.status === "completed" && (
            <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Completion Notes</label>
              <Textarea
                value={editForm.completion_notes}
                onChange={(e) => setEditForm({ ...editForm, completion_notes: e.target.value })}
                placeholder="How was this action completed?"
                rows={2}
                className="text-sm"
              />
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-slate-400 flex flex-wrap gap-3 px-1">
            {action.created_at && <span>Created: {new Date(action.created_at).toLocaleDateString()}</span>}
            {action.updated_at && <span>Updated: {new Date(action.updated_at).toLocaleDateString()}</span>}
          </div>

          {/* Create Recurring Task Button - Only for PM actions */}
          {editForm.action_type === "PM" && (
            <div className="pt-4 border-t border-slate-200">
              <Button
                variant="outline"
                className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => {
                  navigate("/tasks", {
                    state: {
                      createTask: true,
                      prefill: {
                        name: editForm.title,
                        description: editForm.description || `Recurring maintenance task from action: ${editForm.title}`,
                        discipline: editForm.discipline || "",
                        source_action_id: actionId,
                        source_action_title: editForm.title,
                      }
                    }
                  });
                }}
                data-testid="create-recurring-task-btn"
              >
                <CalendarClock className="w-4 h-4 mr-2" />
                Create Recurring Task
              </Button>
            </div>
          )}

          {/* Delete Button */}
          <div className="pt-4 border-t border-slate-200">
            <Button
              variant="outline"
              className="w-full text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Action
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this action? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Closure Suggestion Dialog */}
      <Dialog open={!!closureSuggestion} onOpenChange={() => setClosureSuggestion(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5 text-green-500" />
              All Actions Completed!
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-800">
                  {closureSuggestion?.total_actions} action{closureSuggestion?.total_actions !== 1 ? 's' : ''} completed
                </p>
                <p className="text-sm text-green-600">
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
              Later
            </Button>
            <Button 
              onClick={() => {
                const sourceType = closureSuggestion?.source_type;
                const sourceId = closureSuggestion?.source_id;
                setClosureSuggestion(null);
                if (sourceType === 'threat') {
                  navigate(`/threats/${sourceId}`);
                } else if (sourceType === 'investigation') {
                  navigate(`/causal-engine?inv=${sourceId}`);
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to {closureSuggestion?.source_type === 'threat' ? 'Observation' : 'Investigation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
