import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  FileText, ExternalLink, Paperclip, Image, Upload, Loader2, Trash2, CalendarClock,
} from "lucide-react";
import { actionsAPI } from "../../../lib/apis/actions";
import { compressImage, getCompressionPercent } from "../../../lib/imageCompression";
import { formatDateTime } from "../../../lib/dateUtils";
import { DISCIPLINES } from "../../../constants/disciplines";
import { sourceConfig } from "../actionsPageConstants";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { SearchableSelect } from "../../../components/ui/searchable-select";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "../../../components/ui/dialog";

export function ActionsEditDialog({
  open,
  onOpenChange,
  editingAction,
  editForm,
  setEditForm,
  usersList,
  t,
  onSave,
  isSaving,
  onRequestDelete,
  uploadingActionAttachment,
  setUploadingActionAttachment,
}) {
  const navigate = useNavigate();
  return (
            <Dialog open={open} onOpenChange={onOpenChange}>
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
                              onOpenChange(false);
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
                            <SearchableSelect
                              options={[
                                { value: "unassigned", label: "Unassigned" },
                                ...usersList.map((u) => ({
                                  value: u.name || u.email,
                                  label: u.name || u.email,
                                  badge: u.position || u.role || ""
                                }))
                              ]}
                              value={editForm.assignee || "unassigned"}
                              onValueChange={(v) => setEditForm({ ...editForm, assignee: v === "unassigned" ? "" : v })}
                              placeholder="Select assignee"
                              searchPlaceholder="Search users..."
                            />
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
                                  <div key={att.url || att.id || `att-desktop-${idx}`} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
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
                          {ea.created_at && <span>Created: {formatDateTime(ea.created_at)}</span>}
                          {ea.updated_at && <span>Updated: {formatDateTime(ea.updated_at)}</span>}
                        </div>
                      </div>
                      <DialogFooter className="gap-2 sm:justify-between flex-wrap">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => { onRequestDelete(ea); onOpenChange(false); }}
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
                                onOpenChange(false);
                              }}
                              data-testid="create-recurring-task-btn"
                            >
                              <CalendarClock className="w-4 h-4 mr-2" />
                              Create Recurring Task
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {t("common.cancel")}
                          </Button>
                          <Button onClick={onSave} disabled={isSaving}>
                            {isSaving ? t("taskScheduler.saving") : t("taskScheduler.saveChanges")}
                          </Button>
                        </div>
                      </DialogFooter>
                    </>
                  );
                })()}
              </DialogContent>
            </Dialog>
  );
}
