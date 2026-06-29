import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Edit,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import LabelPrintConfigPanel from "../../../components/forms/LabelPrintConfigPanel";
import { EXTRACTION_TEMPLATES } from "../../../components/forms/extractionTemplates";
import { DISCIPLINES, translateDiscipline } from "../../../constants/disciplines";
import {
  formAPI, FIELD_TYPES, FieldPreview, DocumentManager,
} from "../../../components/forms";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { Switch } from "../../../components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../../components/ui/dialog";

export function FormsTemplateEditorDialog({
  open,
  onOpenChange,
  newTemplate,
  setNewTemplate,
  t,
  onSave,
  isSaving,
  onAddField,
  onEditField,
  onRemoveField,
  onCancel,
}) {
  const queryClient = useQueryClient();
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {newTemplate.id ? t("common.edit") + " " + t("forms.templates") : t("forms.title")}
            </DialogTitle>
            <DialogDescription>
              {t("forms.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">{t("forms.templateName")} *</Label>
                <Input
                  id="template-name"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Daily Equipment Inspection"
                  data-testid="template-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">{t("forms.templateDescription")}</Label>
                <Textarea
                  id="template-description"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the purpose of this form..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("forms.discipline")}</Label>
                  <Select
                    value={newTemplate.discipline || ""}
                    onValueChange={(v) => setNewTemplate(prev => ({ ...prev, discipline: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("forms.discipline")} />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCIPLINES.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {translateDiscipline(t, d.value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="require-signature"
                      checked={newTemplate.require_signature}
                      onCheckedChange={(v) => setNewTemplate(prev => ({ ...prev, require_signature: v }))}
                    />
                    <Label htmlFor="require-signature" className="cursor-pointer">{t("forms.requireSignature")}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="allow-partial"
                      checked={newTemplate.allow_partial_submission}
                      onCheckedChange={(v) => setNewTemplate(prev => ({ ...prev, allow_partial_submission: v }))}
                    />
                    <Label htmlFor="allow-partial" className="cursor-pointer">{t("forms.allowPartialSubmit")}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="photo-extraction-enabled"
                      checked={newTemplate.photo_extraction_config?.enabled || false}
                      onCheckedChange={(v) => setNewTemplate(prev => ({
                        ...prev,
                        photo_extraction_config: {
                          ...(prev.photo_extraction_config || { label: "Capture Photo", mode: "hybrid", confidence_threshold: 0.7, extraction_fields: [] }),
                          enabled: v,
                        }
                      }))}
                    />
                    <Label htmlFor="photo-extraction-enabled" className="cursor-pointer">Photo AI Extraction</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="label-print-enabled"
                      checked={newTemplate.label_print_config?.enabled || false}
                      onCheckedChange={(v) => setNewTemplate(prev => ({
                        ...prev,
                        label_print_config: {
                          ...(prev.label_print_config || { trigger: "manual", button_label: "Print Label" }),
                          enabled: v,
                        }
                      }))}
                      data-testid="label-print-toggle"
                    />
                    <Label htmlFor="label-print-enabled" className="cursor-pointer">Label Printing</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Label Printing Config */}
            {newTemplate.label_print_config?.enabled && (
              <LabelPrintConfigPanel
                config={newTemplate.label_print_config}
                onChange={(patch) => setNewTemplate(prev => ({
                  ...prev,
                  label_print_config: { ...(prev.label_print_config || {}), ...patch }
                }))}
              />
            )}

            {/* Photo Extraction Config - shown when enabled */}
            {newTemplate.photo_extraction_config?.enabled && (
              <div className="space-y-3 p-4 border border-blue-200 rounded-lg bg-blue-50/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-blue-800">Photo Extraction Settings</Label>
                  <Select
                    value=""
                    onValueChange={(templateId) => {
                      const tpl = EXTRACTION_TEMPLATES.find(t => t.id === templateId);
                      if (!tpl) return;
                      setNewTemplate(prev => ({
                        ...prev,
                        photo_extraction_config: {
                          ...prev.photo_extraction_config,
                          label: tpl.label,
                          mode: tpl.mode,
                          extraction_fields: tpl.fields.map(f => ({ ...f, target_field_id: "" })),
                        }
                      }));
                      toast.success(`Loaded "${tpl.name}" template with ${tpl.fields.length} fields`);
                    }}
                  >
                    <SelectTrigger className="w-[180px] h-7 text-xs" data-testid="load-extraction-template">
                      <SelectValue placeholder="Load template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EXTRACTION_TEMPLATES.map(tpl => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          <div>
                            <div className="font-medium">{tpl.name}</div>
                            <div className="text-[10px] text-slate-400">{tpl.fields.length} fields</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Button Label</Label>
                    <Input
                      value={newTemplate.photo_extraction_config?.label || "Capture Photo"}
                      onChange={(e) => setNewTemplate(prev => ({
                        ...prev,
                        photo_extraction_config: { ...prev.photo_extraction_config, label: e.target.value }
                      }))}
                      placeholder="Capture Photo"
                      className="h-8 text-sm"
                      data-testid="photo-extraction-label"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mode</Label>
                    <Select
                      value={newTemplate.photo_extraction_config?.mode || "hybrid"}
                      onValueChange={(v) => setNewTemplate(prev => ({
                        ...prev,
                        photo_extraction_config: { ...prev.photo_extraction_config, mode: v }
                      }))}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid="photo-extraction-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hybrid">Hybrid (recommended)</SelectItem>
                        <SelectItem value="structured">Structured (readings)</SelectItem>
                        <SelectItem value="text">Text (serial numbers)</SelectItem>
                        <SelectItem value="classification">Classification</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Custom Prompt (optional)</Label>
                  <Textarea
                    value={newTemplate.photo_extraction_config?.prompt_template || ""}
                    onChange={(e) => setNewTemplate(prev => ({
                      ...prev,
                      photo_extraction_config: { ...prev.photo_extraction_config, prompt_template: e.target.value || null }
                    }))}
                    placeholder="Leave empty for auto-generated prompt based on fields..."
                    className="text-sm min-h-[60px]"
                    data-testid="photo-extraction-prompt"
                  />
                </div>

                {/* Extraction Fields */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Extraction Fields</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                        fields.push({ key: "", description: "", type: "string", target_field_id: "" });
                        setNewTemplate(prev => ({
                          ...prev,
                          photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields }
                        }));
                      }}
                      data-testid="add-extraction-field-btn"
                    >
                      + Add Field
                    </Button>
                  </div>
                  {(newTemplate.photo_extraction_config?.extraction_fields || []).map((ef, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-white p-2 rounded border">
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Key</Label>
                        <Input
                          value={ef.key}
                          onChange={(e) => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields[idx] = { ...fields[idx], key: e.target.value };
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                          placeholder="pressure"
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <Label className="text-[10px]">Description</Label>
                        <Input
                          value={ef.description}
                          onChange={(e) => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields[idx] = { ...fields[idx], description: e.target.value };
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                          placeholder="Pressure reading from gauge"
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Map to Field</Label>
                        <Select
                          value={ef.target_field_id || ""}
                          onValueChange={(v) => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields[idx] = { ...fields[idx], target_field_id: v };
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Field" /></SelectTrigger>
                          <SelectContent>
                            {(newTemplate.fields || []).map(f => (
                              <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Type</Label>
                        <Select
                          value={ef.type || "string"}
                          onValueChange={(v) => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields[idx] = { ...fields[idx], type: v };
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="datetime">Date & Time</SelectItem>
                            <SelectItem value="enum">Enum</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                          onClick={() => {
                            const fields = [...(newTemplate.photo_extraction_config?.extraction_fields || [])];
                            fields.splice(idx, 1);
                            setNewTemplate(prev => ({ ...prev, photo_extraction_config: { ...prev.photo_extraction_config, extraction_fields: fields } }));
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fields Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">{t("forms.formFields")}</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddField}
                  data-testid="add-field-btn"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Field
                </Button>
              </div>

              {newTemplate.fields.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <p className="text-sm text-slate-500">{t("forms.noFieldsYet")}</p>
                  <p className="text-xs text-slate-400 mt-1">{t("forms.addFieldHint")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {newTemplate.fields.map((field) => (
                    <FieldPreview
                      key={field.id}
                      field={field}
                      onEdit={onEditField}
                      onDelete={() => onRemoveField(field.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Documents Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">{t("forms.referenceDocuments")}</Label>
                  <p className="text-xs text-slate-500">{t("forms.referenceDocumentsHint")}</p>
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // If editing existing template, upload immediately
                      if (newTemplate.id) {
                        const docId = `uploading_${Date.now()}`;
                        // Show uploading state
                        setNewTemplate(prev => ({
                          ...prev,
                          pendingDocuments: [
                            ...(prev.pendingDocuments || []),
                            { id: docId, name: file.name, type: file.name.split('.').pop().toLowerCase(), uploading: true, file, error: null }
                          ]
                        }));
                        
                        try {
                          const result = await formAPI.uploadDocument(newTemplate.id, file, "");
                          // Replace pending with actual document - SUCCESS STATE
                          setNewTemplate(prev => ({
                            ...prev,
                            pendingDocuments: prev.pendingDocuments?.filter(d => d.id !== docId),
                            documents: [...(prev.documents || []), result.document]
                          }));
                          // Invalidate templates query to refresh documents list
                          queryClient.invalidateQueries({ queryKey: ["form-templates"] });
                          toast.success(t("forms.documentUploaded"));
                        } catch (error) {
                          // Set error state on the pending document (allow retry)
                          setNewTemplate(prev => ({
                            ...prev,
                            pendingDocuments: prev.pendingDocuments?.map(d => 
                              d.id === docId 
                                ? { ...d, uploading: false, error: error.message || "Upload failed" }
                                : d
                            )
                          }));
                          toast.error(error.message || "Upload failed");
                        }
                      } else {
                        // For new templates, stage the document for later upload
                        const docId = `pending_${Date.now()}`;
                        setNewTemplate(prev => ({
                          ...prev,
                          pendingDocuments: [
                            ...(prev.pendingDocuments || []),
                            { id: docId, file, name: file.name, type: file.name.split('.').pop().toLowerCase(), uploading: false, error: null }
                          ]
                        }));
                      }
                      e.target.value = '';
                    }}
                    data-testid="document-upload-input"
                  />
                  <Button variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-1" /> {t("forms.addDocument")}
                    </span>
                  </Button>
                </label>
              </div>

              {/* Existing Documents */}
              {(newTemplate.documents?.length > 0 || newTemplate.pendingDocuments?.length > 0) ? (
                <div className="space-y-2">
                  {newTemplate.documents?.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                      <div className="h-8 w-8 rounded bg-white border flex items-center justify-center">
                        <FileText className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{doc.name}</div>
                        <div className="text-xs text-slate-500">{doc.type?.toUpperCase()} • {doc.description || 'No description'}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        onClick={async () => {
                          if (newTemplate.id && doc.id) {
                            try {
                              await formAPI.deleteDocument(newTemplate.id, doc.id);
                              setNewTemplate(prev => ({
                                ...prev,
                                documents: prev.documents?.filter(d => d.id !== doc.id)
                              }));
                              // Invalidate templates query to refresh documents list
                              queryClient.invalidateQueries({ queryKey: ["form-templates"] });
                              toast.success("Document deleted");
                            } catch (error) {
                              toast.error("Failed to delete document");
                            }
                          } else {
                            setNewTemplate(prev => ({
                              ...prev,
                              documents: prev.documents?.filter(d => d.id !== doc.id)
                            }));
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {newTemplate.pendingDocuments?.map((doc) => (
                    <div key={doc.id} className={`flex items-center gap-3 p-3 rounded-lg border ${doc.error ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`} data-testid={`pending-doc-${doc.id}`}>
                      <div className="h-8 w-8 rounded bg-white border flex items-center justify-center">
                        {doc.uploading ? (
                          <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                        ) : doc.error ? (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        ) : (
                          <Upload className="w-4 h-4 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{doc.name}</div>
                        <div className={`text-xs ${doc.error ? 'text-red-600' : 'text-amber-600'}`}>
                          {doc.uploading 
                            ? t("common.uploading") 
                            : doc.error 
                              ? doc.error 
                              : newTemplate.id 
                                ? t("forms.pendingUpload")
                                : t("forms.willUploadOnSave") || "Will upload when form is saved"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Retry button for failed uploads */}
                        {doc.error && doc.file && newTemplate.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-600 hover:text-amber-800"
                            onClick={async () => {
                              // Set uploading state
                              setNewTemplate(prev => ({
                                ...prev,
                                pendingDocuments: prev.pendingDocuments?.map(d => 
                                  d.id === doc.id ? { ...d, uploading: true, error: null } : d
                                )
                              }));
                              
                              try {
                                const result = await formAPI.uploadDocument(newTemplate.id, doc.file, "");
                                setNewTemplate(prev => ({
                                  ...prev,
                                  pendingDocuments: prev.pendingDocuments?.filter(d => d.id !== doc.id),
                                  documents: [...(prev.documents || []), result.document]
                                }));
                                // Invalidate templates query to refresh documents list
                                queryClient.invalidateQueries({ queryKey: ["form-templates"] });
                                toast.success(t("forms.documentUploaded"));
                              } catch (error) {
                                setNewTemplate(prev => ({
                                  ...prev,
                                  pendingDocuments: prev.pendingDocuments?.map(d => 
                                    d.id === doc.id ? { ...d, uploading: false, error: error.message || "Retry failed" } : d
                                  )
                                }));
                                toast.error(error.message || "Retry failed");
                              }
                            }}
                            data-testid={`retry-upload-${doc.id}`}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {/* Remove button - only when not uploading */}
                        {!doc.uploading && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600"
                            onClick={() => setNewTemplate(prev => ({
                              ...prev,
                              pendingDocuments: prev.pendingDocuments?.filter(d => d.id !== doc.id)
                            }))}
                            data-testid={`remove-pending-doc-${doc.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">{t("forms.noDocuments")}</p>
                  <p className="text-xs text-slate-400">{t("forms.noDocumentsHint")}</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              onOpenChange(false);
              onCancel?.();
            }}>
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={isSaving}
              data-testid="save-template-btn"
            >
              {isSaving ? t("taskScheduler.saving") : t("taskScheduler.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

  );
}
