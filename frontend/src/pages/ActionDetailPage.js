import { api } from '../lib/apiClient';
import { compressImage, formatFileSize, getCompressionPercent } from '../lib/imageCompression';
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { formatDate, formatDateTime } from '../lib/dateUtils';
import { 
  Save, Trash2, ExternalLink, Calendar, User,
  FileText, Brain, Search, AlertTriangle, Loader2, Check,
  CalendarClock, CheckCircle, CheckCircle2, Paperclip, Upload,
  X, Image, File, Download, Eye, Share2, Link2, Copy, ArrowLeft
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
  DialogDescription,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { actionsAPI } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { useBreadcrumb } from "../contexts/BreadcrumbContext";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { DocumentViewer } from "../components/DocumentViewer";
import AttachmentsPanel from "../components/attachments/AttachmentsPanel";
import { ReliabilityEvidencePanel } from "../components/reliability/ReliabilityEvidencePanel";
import { ActionOutcomeWidget } from "../components/actions/ActionOutcomeWidget";
import { getBackendUrl } from "../lib/apiConfig";
import { useIsMobile } from "../hooks/useIsMobile";
import { useDisciplines } from "../hooks/useDisciplines";

const API_BASE_URL = getBackendUrl();

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
  const isMobile = useIsMobile();
  const { goBack } = useBreadcrumb();
  const { disciplines, normalize: normalizeDiscipline } = useDisciplines();
  
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [closureSuggestion, setClosureSuggestion] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Generate shareable link
  const shareableLink = `${window.location.origin}/actions/${actionId}`;
  
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      toast.success("Link copied to clipboard");
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareableLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast.success("Link copied to clipboard");
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Action: ${action?.title || "Action Details"}`,
          text: `${action?.action_number} - ${action?.title}`,
          url: shareableLink,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          copyLink(); // Fallback to copy
        }
      }
    } else {
      setShareDialogOpen(true);
    }
  };

  // Fetch action details
  const { data: action, isLoading, error } = useQuery({
    queryKey: queryKeys.actions.legacyDetail(actionId),
    queryFn: () => actionsAPI.getById(actionId),
    enabled: !!actionId,
  });

  // Fetch users list
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get("/rbac/users");
        setUsersList(response.data.users || []);
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
        discipline: normalizeDiscipline(action.discipline || "") || "",
        comments: action.comments || "",
        completion_notes: action.completion_notes || "",
        attachments: action.attachments || [],
      });
    }
  }, [action, normalizeDiscipline]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => actionsAPI.update(actionId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.legacyDetail(actionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      toast.success("Action updated successfully");
      
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
    },
    onError: () => toast.error("Failed to update action"),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => actionsAPI.delete(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.all() });
      toast.success("Action deleted");
      navigate("/actions");
    },
    onError: () => toast.error("Failed to delete action"),
  });

  const handleSave = () => {
    const payload = { ...editForm };
    if ("discipline" in payload) {
      payload.discipline = normalizeDiscipline(payload.discipline) || payload.discipline || null;
    }
    updateMutation.mutate(payload);
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
      </div>
    );
  }

  const SourceIcon = sourceConfig[action.source_type]?.icon || FileText;
  const priority = priorityConfig[action.priority] || priorityConfig.medium;
  const status = statusConfig[action.status] || statusConfig.open;

  const fieldLabelClass = "text-xs sm:text-[10px] font-medium text-slate-600 sm:text-slate-400 uppercase mb-1 sm:mb-0.5 block";
  const fieldInputClass = "h-10 sm:h-8 text-sm";
  const fieldTextareaClass = "text-sm resize-none min-h-[72px] sm:min-h-[50px]";

  const handleAddAttachmentFiles = async (files) => {
    setUploadingAttachment(true);
    try {
      for (const file of files) {
        let processedFile = file;
        if (file.type.startsWith("image/")) {
          try {
            const result = await compressImage(file, {
              maxWidth: 1920,
              maxHeight: 1920,
              quality: 0.8,
              maxSizeMB: 1,
            });
            processedFile = result.file;
            if (result.wasCompressed) {
              const savedPercent = getCompressionPercent(result.originalSize, result.compressedSize);
              toast.success(`${file.name} compressed (${savedPercent}% smaller)`);
            }
          } catch (err) {
            console.error("Image compression failed:", err);
          }
        }
        const result = await actionsAPI.uploadAttachment(processedFile);
        setEditForm((prev) => ({
          ...prev,
          attachments: [...(prev.attachments || []), result],
        }));
      }
      toast.success(`${files.length} file(s) uploaded`);
    } catch (_e) {
      toast.error("Failed to upload file(s)");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = (raw) => {
    setEditForm((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((a) => a?.url !== raw?.url),
    }));
  };

  const headerActions = (
    <>
      <ReliabilityEvidencePanel
        equipmentId={action.linked_equipment_id}
        equipmentName={action.equipment_name || action.threat_asset}
        anchorNodeType="action"
        anchorNodeId={actionId}
        anchorLabel={action.title}
        buttonLabel="Graph evidence"
        buttonVariant="ghost"
        buttonSize="sm"
        className="h-9 sm:h-8"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={shareLink}
        className="h-9 w-9 sm:h-8 sm:w-auto sm:px-2 p-0 text-slate-500 hover:text-slate-700"
        title="Share link"
      >
        <Share2 className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setDeleteConfirm(true)}
        className="h-9 w-9 sm:h-8 sm:w-auto sm:px-2 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
        title="Delete action"
        data-testid="action-delete-icon-btn"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      {action.status !== "completed" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleQuickStatusChange("completed")}
          className="h-9 w-9 sm:h-8 sm:w-auto sm:px-3 p-0 text-green-600 border-green-200 hover:bg-green-50"
          title="Mark complete"
        >
          <Check className="w-4 h-4" />
          <span className="hidden sm:inline sm:ml-1">Complete</span>
        </Button>
      )}
      <Button
        size="sm"
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="h-9 w-9 sm:h-8 sm:w-auto sm:px-3 p-0"
        title="Save"
      >
        {updateMutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline sm:ml-1">Save</span>
          </>
        )}
      </Button>
    </>
  );

  const attachmentsSection = (
    <div className="bg-white rounded-lg border border-slate-200 p-3 h-full">
      <AttachmentsPanel
        title="Attachments"
        items={editForm.attachments || []}
        editable={true}
        isUploading={uploadingAttachment}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        getKey={(a) => a?.url || a?.name}
        getName={(a) => a?.name || "Attachment"}
        getUrl={(a) => (a?.url ? `${API_BASE_URL}/api/storage/${a.url}` : null)}
        getContentType={(a) => a?.type}
        onAddFiles={handleAddAttachmentFiles}
        onRemove={handleRemoveAttachment}
      />
    </div>
  );

  return (
    <div className="app-page-shell bg-slate-50" data-testid="action-detail-page">
      {/* Header stays fixed; content scrolls in the pane below */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 max-w-2xl">
          <div className="py-2.5 sm:py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden h-9 w-9 shrink-0 border-slate-200 bg-white"
                onClick={goBack}
                aria-label="Back to actions"
                data-testid="action-detail-back-button"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <span className="shrink-0 px-2 py-0.5 bg-slate-100 rounded text-xs font-mono text-slate-600">
                {action.action_number}
              </span>
              <div className="flex items-center gap-1 ml-auto shrink-0">
                {headerActions}
              </div>
            </div>
            <div className="px-1 min-w-0">
              <h1 className="font-semibold text-base sm:text-lg text-slate-900 leading-snug line-clamp-3 sm:line-clamp-2">
                {action.title}
              </h1>
              {action.equipment_tag && (
                <p className="text-xs text-slate-500 font-mono mt-1">{action.equipment_tag}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="app-page-scroll mobile-scroll-pane flex-1 min-h-0 pb-6">
      {/* Scrollable Content */}
      <div className="container mx-auto px-3 sm:px-4 py-4 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Desktop: paired rows (attachments ↔ outcome on same row) | Mobile: stacked */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:items-stretch">
              {/* Source & Scores */}
              <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 p-3">
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
                      <span className="truncate max-w-[120px] lg:max-w-[200px]">{action.source_name || "Unknown"}</span>
                      <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                    </button>
                  )}
                  
                  {/* Scores */}
                  <div className="flex items-center gap-3">
                    {action.threat_risk_score != null && (
                      <div className="text-center">
                        <div className="text-[10px] text-slate-400 uppercase">Score</div>
                        <div className={`text-sm font-bold ${
                          action.threat_risk_score >= 70 ? "text-red-600" :
                          action.threat_risk_score >= 50 ? "text-orange-500" : "text-green-500"
                        }`}>{action.threat_risk_score}</div>
                      </div>
                    )}
                    {action.threat_rpn != null && (
                      <div className="text-center">
                        <div className="text-[10px] text-slate-400 uppercase">RPN</div>
                        <div className={`text-sm font-bold ${
                          action.threat_rpn >= 200 ? "text-red-600" :
                          action.threat_rpn >= 100 ? "text-orange-500" : "text-blue-500"
                        }`}>{action.threat_rpn}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Status & Priority */}
              <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 p-4 sm:p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-2">
                  <div>
                    <label className={fieldLabelClass}>Status</label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger className={`${fieldInputClass} text-xs`}>
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
                    <label className={fieldLabelClass}>Priority</label>
                    <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                      <SelectTrigger className={`${fieldInputClass} text-xs`}>
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
              <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 p-4 sm:p-3 space-y-3 sm:space-y-2">
                <div>
                  <label className={fieldLabelClass}>Title</label>
                  <Input
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className={fieldInputClass}
                  />
                </div>
                <div>
                  <label className={fieldLabelClass}>Description</label>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={isMobile ? 4 : 2}
                    className={fieldTextareaClass}
                  />
                </div>
              </div>

              {/* Type & Discipline */}
              <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 p-4 sm:p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-2">
                  <div>
                    <label className={fieldLabelClass}>Type</label>
                    <Select value={editForm.action_type || "none"} onValueChange={(v) => setEditForm({ ...editForm, action_type: v === "none" ? "" : v })}>
                      <SelectTrigger className={`${fieldInputClass} text-xs`}>
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
                    <label className={fieldLabelClass}>Discipline</label>
                    <Select
                      value={normalizeDiscipline(editForm.discipline) || editForm.discipline || "none"}
                      onValueChange={(v) => setEditForm({ ...editForm, discipline: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className={`${fieldInputClass} text-xs`} data-testid="action-discipline-select">
                        <SelectValue placeholder={t("observations.selectDiscipline") || "Select discipline"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {disciplines.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Comments & Completion Notes */}
              <div className="lg:col-span-7 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-3">
                  <label className={fieldLabelClass}>Comments</label>
                  <Textarea
                    value={editForm.comments}
                    onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                    placeholder="Notes..."
                    rows={isMobile ? 3 : 2}
                    className={fieldTextareaClass}
                  />
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-3">
                  <label className={`${fieldLabelClass} flex items-center gap-1`}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    Completion Notes
                  </label>
                  <Textarea
                    value={editForm.completion_notes}
                    onChange={(e) => setEditForm({ ...editForm, completion_notes: e.target.value })}
                    placeholder="How was this resolved?"
                    rows={isMobile ? 3 : 2}
                    className={fieldTextareaClass}
                  />
                </div>
              </div>

              {/* Assignee & Due Date */}
              <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 p-4 sm:p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-2">
                  <div>
                    <label className={fieldLabelClass}>Assignee</label>
                    <Select value={editForm.assignee || "unassigned"} onValueChange={(v) => setEditForm({ ...editForm, assignee: v === "unassigned" ? "" : v })}>
                      <SelectTrigger className={`${fieldInputClass} text-xs`}>
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
                    <label className={fieldLabelClass}>Due Date</label>
                    <Input
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                      className={`${fieldInputClass} text-xs`}
                    />
                  </div>
                </div>
              </div>

              {/* Attachments — aligned with Action Outcome */}
              <div className="lg:col-span-7 min-h-0">
                {attachmentsSection}
              </div>

              <div className="lg:col-span-5 flex flex-col gap-3 min-h-0">
                <ActionOutcomeWidget actionId={actionId} actionStatus={action.status} />

                {/* Timestamps - Compact */}
                <div className="text-[10px] text-slate-400 flex gap-3 px-1">
                  {action.created_at && <span>Created: {formatDate(action.created_at)}</span>}
                  {action.updated_at && <span>Updated: {formatDate(action.updated_at)}</span>}
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-slate-200 mt-auto">
                  {editForm.action_type === "PM" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 h-8 text-xs"
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
                      <CalendarClock className="w-3 h-3 mr-1.5" />
                      Create Recurring Task
                    </Button>
                  )}
                </div>
              </div>
          </div>
        </motion.div>
      </div>
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

      {/* Attachment preview handled by AttachmentsPanel */}

      {/* Share Link Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-600" />
              Share Action
            </DialogTitle>
            <DialogDescription>
              Share this action with others using the link below
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-slate-100 rounded-lg border text-sm font-mono text-slate-600 truncate">
                {shareableLink}
              </div>
              <Button
                size="sm"
                onClick={() => {
                  copyLink();
                  setShareDialogOpen(false);
                }}
              >
                <Copy className="w-4 h-4 mr-1" />
                Copy
              </Button>
            </div>
            <div className="text-xs text-slate-500">
              Anyone with this link and access to the application can view this action.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
