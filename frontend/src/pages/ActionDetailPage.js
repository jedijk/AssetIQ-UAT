import { getBackendUrl, getAuthHeaders } from '../lib/apiConfig';
import { compressImage, formatFileSize, getCompressionPercent } from '../lib/imageCompression';
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { formatDate, formatDateTime } from '../lib/dateUtils';
import { 
  ArrowLeft, Save, Trash2, ExternalLink, Calendar, User,
  FileText, Brain, Search, AlertTriangle, Loader2, Check,
  CalendarClock, CheckCircle, CheckCircle2, Paperclip, Upload,
  X, Image, File, Download, Eye, Share2, Link2, Copy
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
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { DocumentViewer } from "../components/DocumentViewer";

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
  
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [closureSuggestion, setClosureSuggestion] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
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
    queryKey: ["action", actionId],
    queryFn: () => actionsAPI.getById(actionId),
    enabled: !!actionId,
  });

  // Fetch users list
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/rbac/users`, {
          headers: getAuthHeaders(),
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
        attachments: action.attachments || [],
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
      {/* Fixed Header - starts below main nav (top-12 = 48px) */}
      <div className="sticky top-12 z-30 bg-white border-b border-slate-200 shadow-sm">
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
              {action.equipment_tag && (
                <div className="text-xs text-slate-400 font-mono mt-0.5 ml-0">{action.equipment_tag}</div>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Share Button */}
              <Button
                size="sm"
                variant="ghost"
                onClick={shareLink}
                className="h-7 sm:h-8 px-2 text-slate-500 hover:text-slate-700"
                title="Share link"
              >
                <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
              
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
      <div className="container mx-auto px-3 sm:px-4 py-4 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Desktop: Two-column layout | Mobile: Single column */}
          <div className="lg:grid lg:grid-cols-12 lg:gap-4">
            
            {/* LEFT COLUMN - Main content (spans 7 cols on desktop) */}
            <div className="lg:col-span-7 space-y-3">
              {/* Source & Scores + Status Row - Compact header */}
              <div className="bg-white rounded-lg border border-slate-200 p-3">
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

              {/* Title & Description - Compact */}
              <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Title</label>
                  <Input
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Description</label>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2}
                    className="text-sm resize-none min-h-[50px]"
                  />
                </div>
              </div>

              {/* Comments & Completion Notes - Side by side on desktop */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Comments</label>
                  <Textarea
                    value={editForm.comments}
                    onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                    placeholder="Notes..."
                    rows={2}
                    className="text-sm resize-none min-h-[50px]"
                  />
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    Completion Notes
                  </label>
                  <Textarea
                    value={editForm.completion_notes}
                    onChange={(e) => setEditForm({ ...editForm, completion_notes: e.target.value })}
                    placeholder="How was this resolved?"
                    rows={2}
                    className="text-sm resize-none min-h-[50px]"
                  />
                </div>
              </div>

              {/* Attachments Section - Compact */}
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-medium text-slate-400 uppercase flex items-center gap-1">
                    <Paperclip className="w-3 h-3" />
                    Attachments
                    {editForm.attachments?.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                        {editForm.attachments.length}
                      </Badge>
                    )}
                  </label>
                  <input
                    type="file"
                    id="action-detail-attachment"
                    className="hidden"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      setUploadingAttachment(true);
                      try {
                        for (const file of files) {
                          let processedFile = file;
                          
                          // Compress images before upload
                          if (file.type.startsWith('image/')) {
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
                              console.error('Image compression failed:', err);
                            }
                          }
                          
                          const result = await actionsAPI.uploadAttachment(processedFile);
                          setEditForm(prev => ({
                            ...prev,
                            attachments: [...(prev.attachments || []), result]
                          }));
                        }
                        toast.success(`${files.length} file(s) uploaded`);
                      } catch (error) {
                        toast.error("Failed to upload file(s)");
                      } finally {
                        setUploadingAttachment(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    disabled={uploadingAttachment}
                    onClick={() => document.getElementById("action-detail-attachment")?.click()}
                  >
                    {uploadingAttachment ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <><Upload className="w-3 h-3 mr-1" />Add</>
                    )}
                  </Button>
                </div>
                
                {/* Attachments Grid - Horizontal scroll on desktop for compactness */}
                {editForm.attachments?.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {editForm.attachments.map((att, idx) => {
                      const isImage = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name);
                      const isPdf = att.type === 'application/pdf' || /\.pdf$/i.test(att.name);
                      const isDoc = /\.(doc|docx)$/i.test(att.name);
                      const previewUrl = att.url || att.data;
                      
                      return (
                        <div 
                          key={idx} 
                          className="relative group flex-shrink-0 w-16 h-16 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden"
                        >
                          <button
                            onClick={() => {
                              if (previewUrl) {
                                if (isImage) setViewingImage({ url: previewUrl, name: att.name });
                                else if (isPdf || isDoc) setViewingAttachment(att);
                                else { const link = document.createElement('a'); link.href = previewUrl; link.download = att.name; link.click(); }
                              }
                            }}
                            className="w-full h-full"
                          >
                            {isImage && previewUrl ? (
                              <img src={previewUrl} alt={att.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center">
                                {isPdf ? <FileText className="w-5 h-5 text-red-400" /> : isDoc ? <FileText className="w-5 h-5 text-blue-400" /> : <File className="w-5 h-5 text-slate-400" />}
                                <span className="text-[8px] text-slate-500 uppercase mt-0.5">{att.name?.split('.').pop()}</span>
                              </div>
                            )}
                          </button>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-0.5 right-0.5 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); setEditForm(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) })); }}
                          >
                            <X className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-2 text-xs text-slate-400">No attachments</div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN - Metadata & Actions (spans 5 cols on desktop) */}
            <div className="lg:col-span-5 space-y-3 mt-3 lg:mt-0">
              {/* Status & Priority - Inline */}
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Status</label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger className="h-8 text-xs">
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
                    <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Priority</label>
                    <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                      <SelectTrigger className="h-8 text-xs">
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

              {/* Type & Discipline - Inline */}
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Type</label>
                    <Select value={editForm.action_type || "none"} onValueChange={(v) => setEditForm({ ...editForm, action_type: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-8 text-xs">
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
                    <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Discipline</label>
                    <Input
                      value={editForm.discipline}
                      onChange={(e) => setEditForm({ ...editForm, discipline: e.target.value })}
                      placeholder="Mech"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Assignee & Due Date - Inline */}
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Assignee</label>
                    <Select value={editForm.assignee || "unassigned"} onValueChange={(v) => setEditForm({ ...editForm, assignee: v === "unassigned" ? "" : v })}>
                      <SelectTrigger className="h-8 text-xs">
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
                    <label className="text-[10px] font-medium text-slate-400 uppercase mb-0.5 block">Due Date</label>
                    <Input
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Timestamps - Compact */}
              <div className="text-[10px] text-slate-400 flex gap-3 px-1">
                {action.created_at && <span>Created: {formatDate(action.created_at)}</span>}
                {action.updated_at && <span>Updated: {formatDate(action.updated_at)}</span>}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                {/* Create Recurring Task Button - Only for PM actions */}
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

                {/* Delete Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50 h-8 text-xs"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="w-3 h-3 mr-1.5" />
                  Delete Action
                </Button>
              </div>
            </div>
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

      {/* Attachment Viewer */}
      {viewingAttachment && (
        <DocumentViewer
          url={viewingAttachment.url || viewingAttachment.data}
          fileName={viewingAttachment.name}
          fileType={viewingAttachment.type}
          onClose={() => setViewingAttachment(null)}
        />
      )}

      {/* Image Lightbox */}
      {viewingImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-full max-h-full">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20"
              onClick={() => setViewingImage(null)}
            >
              <X className="w-6 h-6" />
            </Button>
            
            {/* Image */}
            <img
              src={viewingImage.url}
              alt={viewingImage.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* File name */}
            <div className="absolute -bottom-10 left-0 right-0 text-center">
              <p className="text-white/80 text-sm">{viewingImage.name}</p>
            </div>
            
            {/* Download button */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-12 left-0 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = viewingImage.url;
                link.download = viewingImage.name;
                link.click();
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      )}

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
