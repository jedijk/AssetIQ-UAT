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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import { Sheet, SheetContent } from "../../../components/ui/sheet";

export function ActionsEditSheet({
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
            <Sheet open={open} onOpenChange={onOpenChange}>
              <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl overflow-hidden p-0">
                {editingAction && (() => {
                  const ea = editingAction;
                  const EaSourceIcon = sourceConfig[ea.source_type]?.icon || FileText;
                  return (
                    <div className="flex flex-col h-full">
                      {/* Header */}
                      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-slate-200 rounded text-xs font-mono text-slate-600 shrink-0">
                            {ea.action_number}
                          </span>
                        </div>
                        <h3 className="font-semibold text-base text-slate-900 leading-snug line-clamp-3">{ea.title}</h3>
                        {ea.source_type && ea.source_id && (
                          <button
                            onClick={() => {
                              if (ea.source_type === "investigation") navigate(`/causal-engine?inv=${ea.source_id}`);
                              else if (ea.source_type === "threat" || ea.source_type === "ai_recommendation") navigate(`/threats/${ea.source_id}`);
                              onOpenChange(false);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 mt-2"
                          >
                            <EaSourceIcon className={`w-3.5 h-3.5 ${sourceConfig[ea.source_type]?.color}`} />
                            <span>{sourceConfig[ea.source_type]?.label}: {ea.source_name?.substring(0, 40) || "Unknown"}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      
                      {/* Scrollable Content */}
                      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        <div>
                          <label className="text-sm font-medium text-slate-700">Title</label>
                          <Input
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            className="h-10 text-sm mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-700">Description</label>
                          <Textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            rows={3}
                            className="text-sm mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700">Status</label>
                            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                              <SelectTrigger className="h-10 text-sm mt-1"><SelectValue /></SelectTrigger>
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
                              <SelectTrigger className="h-10 text-sm mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="critical">Critical</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700">Type</label>
                            <Select value={editForm.action_type || "none"} onValueChange={(v) => setEditForm({ ...editForm, action_type: v === "none" ? "" : v })}>
                              <SelectTrigger className="h-10 text-sm mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="CM">CM</SelectItem>
                                <SelectItem value="PM">PM</SelectItem>
                                <SelectItem value="PDM">PDM</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-700">Discipline</label>
                            <Select 
                              value={editForm.discipline} 
                              onValueChange={(v) => setEditForm({ ...editForm, discipline: v })}
                            >
                              <SelectTrigger className="h-10 text-sm mt-1">
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
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700">Assignee</label>
                            <Select value={editForm.assignee || "unassigned"} onValueChange={(v) => setEditForm({ ...editForm, assignee: v === "unassigned" ? "" : v })}>
                              <SelectTrigger className="h-10 text-sm mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {usersList.map((u) => (
                                  <SelectItem key={u.id} value={u.name || u.email}>{u.name || u.email}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-700">Due Date</label>
                            <Input
                              type="date"
                              value={editForm.due_date}
                              onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                              className="h-10 text-sm mt-1"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-700">Comments</label>
                          <Textarea
                            value={editForm.comments}
                            onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                            rows={3}
                            className="text-sm mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-700">Completion Notes</label>
                          <Textarea
                            value={editForm.completion_notes}
                            onChange={(e) => setEditForm({ ...editForm, completion_notes: e.target.value })}
                            rows={3}
                            className="text-sm mt-1"
                          />
                        </div>
                        {/* Risk Scores */}
                        {(ea.threat_risk_score != null || ea.threat_rpn != null) && (
                          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg">
                            {ea.threat_risk_score != null && (
                              <div>
                                <label className="text-xs font-medium text-slate-500 uppercase">Risk Score</label>
                                <p className={`text-base font-bold ${ea.threat_risk_score >= 70 ? "text-red-600" : ea.threat_risk_score >= 50 ? "text-orange-500" : "text-green-500"}`}>{ea.threat_risk_score}</p>
                              </div>
                            )}
                            {ea.threat_rpn != null && (
                              <div>
                                <label className="text-xs font-medium text-slate-500 uppercase">RPN</label>
                                <p className={`text-base font-bold ${ea.threat_rpn >= 200 ? "text-red-600" : ea.threat_rpn >= 100 ? "text-orange-500" : "text-blue-500"}`}>{ea.threat_rpn}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Attachments - at bottom */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                            <Paperclip className="w-4 h-4" />
                            Attachments
                          </label>
                          
                          {editForm.attachments?.length > 0 && (
                            <div className="space-y-2">
                              {editForm.attachments.map((att, idx) => (
                                <div key={att.url || att.id || `att-${idx}`} className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200 text-sm">
                                  {att.type?.startsWith("image/") ? (
                                    <Image className="w-4 h-4 text-blue-500" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-slate-500" />
                                  )}
                                  <span className="truncate flex-1">{att.name}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => setEditForm(prev => ({
                                      ...prev,
                                      attachments: prev.attachments.filter((_, i) => i !== idx)
                                    }))}
                                  >
                                    <X className="w-3.5 h-3.5" />
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
                                    let processedFile = file;
                                    
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
                              className="h-9 text-sm w-full"
                              disabled={uploadingActionAttachment}
                              onClick={() => document.getElementById("action-attachment-mobile")?.click()}
                            >
                              {uploadingActionAttachment ? (
                                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Uploading...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-1" />Add Files</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Footer */}
                      <div className="px-4 py-3 border-t border-slate-200 bg-white flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200"
                          onClick={() => { onRequestDelete(ea); onOpenChange(false); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1">
                          Cancel
                        </Button>
                        <Button size="sm" onClick={onSave} disabled={isSaving} className="flex-1">
                          {isSaving ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </SheetContent>
            </Sheet>
  );
}
