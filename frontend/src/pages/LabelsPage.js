import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Copy,
  Archive,
  Printer,
  Eye,
  Tag,
  Search,
  History,
  Download,
  Loader2,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { labelsAPI } from "../lib/api";
import { formAPI } from "../components/forms/formAPI";

// ==================== HELPERS ====================

const STATUS_BADGE = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-rose-100 text-rose-700",
};

const emptyTemplate = {
  name: "",
  description: "",
  width_mm: 50,
  height_mm: 30,
  orientation: "portrait",
  preset: "standard",
  field_bindings: [
    { source: "asset_id" },
    { source: "serial_number" },
  ],
  qr_config: {
    target_type: "asset_page",
    form_id: "",
    custom_url: "",
    base_url: window.location.origin,
  },
  logo_config: {
    enabled: false,
    size_mm: 6,
    grayscale: true,
  },
  show_qr: true,
  font_size: "medium",
  source_form_template_ids: [],
  status: "draft",
};


function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}


// ==================== DESIGNER / EDIT DIALOG ====================

function TemplateEditor({ open, onClose, template, onSaved, presets, assetFields }) {
  const [form, setForm] = useState(template || emptyTemplate);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    setForm(template || emptyTemplate);
    setPreviewUrl(null);
  }, [template, open]);

  const isEdit = !!template?.id;
  const maxBindings = useMemo(
    () => presets.find((p) => p.key === form.preset)?.max_bindings || 4,
    [presets, form.preset]
  );

  // Load available form templates (light list, only when editor is open)
  const { data: formTemplatesData } = useQuery({
    queryKey: ["form-templates-for-labels"],
    queryFn: () => formAPI.getTemplates(),
    enabled: open,
    staleTime: 60_000,
  });
  const allFormTemplates = useMemo(
    () => formTemplatesData?.templates || formTemplatesData || [],
    [formTemplatesData]
  );
  const linkedFormIds = form.source_form_template_ids || [];

  // Aggregate fields from linked form templates (unique by id)
  const availableFormFields = useMemo(() => {
    const map = new Map();
    allFormTemplates
      .filter((ft) => linkedFormIds.includes(ft.id))
      .forEach((ft) => {
        (ft.fields || []).forEach((f) => {
          if (!f?.id) return;
          if (!map.has(f.id)) {
            map.set(f.id, {
              id: f.id,
              label: f.label || f.id,
              form_name: ft.name,
            });
          }
        });
      });
    return Array.from(map.values());
  }, [allFormTemplates, linkedFormIds]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (isEdit) return labelsAPI.updateTemplate(template.id, payload);
      return labelsAPI.createTemplate(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Template updated" : "Template created");
      qc.invalidateQueries({ queryKey: ["label-templates"] });
      onSaved?.();
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Save failed"),
  });

  const generatePreview = async () => {
    setPreviewing(true);
    try {
      // strip empty bindings
      const payload = {
        template: {
          ...form,
          field_bindings: (form.field_bindings || [])
            .filter((b) => b.source && (b.source !== "custom" || b.value))
            .slice(0, maxBindings),
        },
      };
      const blob = await labelsAPI.previewBlob(payload);
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e) {
      toast.error("Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const updateBinding = (idx, patch) => {
    const copy = [...(form.field_bindings || [])];
    copy[idx] = { ...copy[idx], ...patch };
    setForm({ ...form, field_bindings: copy });
  };

  const addBinding = () => {
    if ((form.field_bindings || []).length >= maxBindings) return;
    setForm({
      ...form,
      field_bindings: [...(form.field_bindings || []), { source: "asset_name" }],
    });
  };

  const removeBinding = (idx) => {
    const copy = [...(form.field_bindings || [])];
    copy.splice(idx, 1);
    setForm({ ...form, field_bindings: copy });
  };

  const onSave = () => {
    if (!form.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    saveMutation.mutate({
      ...form,
      field_bindings: (form.field_bindings || []).slice(0, maxBindings),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-500" />
            {isEdit ? "Edit Label Template" : "New Label Template"}
          </DialogTitle>
          <DialogDescription>
            Pick a preset layout, bind asset fields, configure the QR target, and preview before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-1">
          {/* === Left: Form === */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Equipment 50×30 Standard"
                data-testid="label-template-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Internal notes"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Width (mm)</Label>
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={form.width_mm}
                  onChange={(e) => setForm({ ...form, width_mm: Number(e.target.value) })}
                  data-testid="label-width"
                />
              </div>
              <div className="space-y-1">
                <Label>Height (mm)</Label>
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={form.height_mm}
                  onChange={(e) => setForm({ ...form, height_mm: Number(e.target.value) })}
                  data-testid="label-height"
                />
              </div>
              <div className="space-y-1">
                <Label>Orientation</Label>
                <Select
                  value={form.orientation}
                  onValueChange={(v) => setForm({ ...form, orientation: v })}
                >
                  <SelectTrigger data-testid="label-orientation"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Layout Preset</Label>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    data-testid={`preset-${p.key}`}
                    onClick={() => {
                      setForm({
                        ...form,
                        preset: p.key,
                        width_mm: p.default_size?.width_mm || form.width_mm,
                        height_mm: p.default_size?.height_mm || form.height_mm,
                        field_bindings: (form.field_bindings || []).slice(0, p.max_bindings),
                      });
                    }}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      form.preset === p.key
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-800">{p.name}</div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-1">{p.description}</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {p.default_size?.width_mm}×{p.default_size?.height_mm}mm · up to {p.max_bindings} fields
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Field Bindings ({(form.field_bindings || []).length}/{maxBindings})</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={addBinding}
                  disabled={(form.field_bindings || []).length >= maxBindings}
                  data-testid="add-binding-btn"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {(form.field_bindings || []).map((b, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <Select
                      value={
                        b.source === "form_field" && b.form_field_id
                          ? `form_field::${b.form_field_id}`
                          : b.source
                      }
                      onValueChange={(v) => {
                        if (v.startsWith("form_field::")) {
                          const fid = v.replace("form_field::", "");
                          const field = availableFormFields.find((f) => f.id === fid);
                          updateBinding(i, {
                            source: "form_field",
                            form_field_id: fid,
                            label: field?.label || fid,
                            value: undefined,
                          });
                        } else {
                          updateBinding(i, {
                            source: v,
                            value: v === "custom" ? b.value || "" : undefined,
                            form_field_id: undefined,
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs min-w-[170px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400">Asset</div>
                        {assetFields
                          .filter((f) => f.key !== "custom")
                          .map((f) => (
                            <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                          ))}
                        {availableFormFields.length > 0 && (
                          <>
                            <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase text-slate-400 border-t mt-1">Form Field</div>
                            {availableFormFields.map((f) => (
                              <SelectItem
                                key={`ff-${f.id}`}
                                value={`form_field::${f.id}`}
                                className="text-xs"
                              >
                                {f.label}
                                <span className="text-[10px] text-slate-400 ml-1">({f.id})</span>
                              </SelectItem>
                            ))}
                          </>
                        )}
                        <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase text-slate-400 border-t mt-1">Other</div>
                        <SelectItem value="custom" className="text-xs">Custom Text</SelectItem>
                      </SelectContent>
                    </Select>
                    {b.source === "custom" ? (
                      <>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Label"
                          value={b.label || ""}
                          onChange={(e) => updateBinding(i, { label: e.target.value })}
                        />
                        <Input
                          className="h-8 text-xs"
                          placeholder="Value — supports {asset_id} / {form.field_id}"
                          value={b.value || ""}
                          onChange={(e) => updateBinding(i, { value: e.target.value })}
                        />
                      </>
                    ) : (
                      <Input
                        className="h-8 text-xs"
                        placeholder="Override label (optional)"
                        value={b.label || ""}
                        onChange={(e) => updateBinding(i, { label: e.target.value })}
                      />
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-rose-500 shrink-0"
                      onClick={() => removeBinding(i)}
                      data-testid={`remove-binding-${i}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Linked form templates — unlocks Form Field bindings */}
            <div className="space-y-1.5 border-t pt-3">
              <Label>Linked Form Templates</Label>
              <p className="text-[11px] text-slate-500 -mt-0.5">
                Select the form(s) whose fields you want to print on this label. Their fields will appear in the binding dropdown under “Form Field”.
              </p>
              <div className="flex flex-wrap gap-1.5 p-2 border border-slate-200 rounded-lg bg-slate-50 min-h-[38px]">
                {allFormTemplates.length === 0 && (
                  <span className="text-[11px] text-slate-400">No form templates available</span>
                )}
                {allFormTemplates.map((ft) => {
                  const active = linkedFormIds.includes(ft.id);
                  return (
                    <button
                      key={ft.id}
                      type="button"
                      data-testid={`link-form-${ft.id}`}
                      onClick={() => {
                        const next = active
                          ? linkedFormIds.filter((x) => x !== ft.id)
                          : [...linkedFormIds, ft.id];
                        setForm({ ...form, source_form_template_ids: next });
                      }}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                      }`}
                    >
                      {ft.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <Label>QR Code Target</Label>
              <Select
                value={form.qr_config?.target_type || "asset_page"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    qr_config: { ...(form.qr_config || {}), target_type: v },
                  })
                }
              >
                <SelectTrigger data-testid="qr-target-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset_page">Asset detail page</SelectItem>
                  <SelectItem value="inspection_form">Inspection / Form</SelectItem>
                  <SelectItem value="maintenance_request">Maintenance request</SelectItem>
                  <SelectItem value="custom_url">Custom URL</SelectItem>
                </SelectContent>
              </Select>
              {form.qr_config?.target_type === "inspection_form" && (
                <Input
                  placeholder="Form template ID"
                  value={form.qr_config?.form_id || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      qr_config: { ...(form.qr_config || {}), form_id: e.target.value },
                    })
                  }
                  data-testid="qr-form-id"
                />
              )}
              {form.qr_config?.target_type === "custom_url" && (
                <Input
                  placeholder="https://…  {asset_id} / {asset_name} supported"
                  value={form.qr_config?.custom_url || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      qr_config: { ...(form.qr_config || {}), custom_url: e.target.value },
                    })
                  }
                  data-testid="qr-custom-url"
                />
              )}
              <Input
                placeholder="Base URL (auto-filled from window.location)"
                value={form.qr_config?.base_url || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    qr_config: { ...(form.qr_config || {}), base_url: e.target.value },
                  })
                }
                className="text-[11px] text-slate-500"
              />
            </div>

            {/* Logo Configuration */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <img src="/logo.png" alt="AssetIQ" className="w-4 h-4 rounded" />
                  AssetIQ Logo
                </Label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={form.logo_config?.enabled || false}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        logo_config: { ...(form.logo_config || {}), enabled: e.target.checked },
                      })
                    }
                    data-testid="logo-enabled-toggle"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              {form.logo_config?.enabled && (
                <div className="space-y-2 pl-1">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Size: {form.logo_config?.size_mm || 6}mm</span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="15"
                      step="0.5"
                      value={form.logo_config?.size_mm || 6}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          logo_config: { ...(form.logo_config || {}), size_mm: parseFloat(e.target.value) },
                        })
                      }
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      data-testid="logo-size-slider"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>4mm</span>
                      <span>15mm</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Logo is rendered in grayscale for thermal printer compatibility. Position is automatic based on preset.
                  </p>
                </div>
              )}
            </div>

            {/* QR Code Toggle */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="3" height="3"/>
                    <rect x="18" y="14" width="3" height="3"/>
                    <rect x="14" y="18" width="3" height="3"/>
                    <rect x="18" y="18" width="3" height="3"/>
                  </svg>
                  QR Code
                </Label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={form.show_qr !== false}
                    onChange={(e) => setForm({ ...form, show_qr: e.target.checked })}
                    data-testid="show-qr-toggle"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Hide QR code to use full label space for text fields.
              </p>
            </div>

            {/* Font Size Preset */}
            <div className="space-y-2 border-t pt-3">
              <Label>Font Size</Label>
              <div className="flex gap-2">
                {["small", "medium", "large"].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setForm({ ...form, font_size: size })}
                    className={`flex-1 py-1.5 px-2 text-xs rounded-md border transition-colors ${
                      (form.font_size || "medium") === size
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                    }`}
                    data-testid={`font-size-${size}`}
                  >
                    {size.charAt(0).toUpperCase() + size.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Adjusts text size for field bindings on the label.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger data-testid="label-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* === Right: Preview === */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Preview</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={generatePreview}
                disabled={previewing}
                data-testid="generate-preview-btn"
              >
                {previewing ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Eye className="w-3.5 h-3.5 mr-1" />
                )}
                Generate
              </Button>
            </div>
            <div className="border border-slate-200 rounded-lg bg-slate-50 h-[500px] flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title="label preview"
                  className="w-full h-full"
                  data-testid="preview-iframe"
                />
              ) : (
                <div className="text-xs text-slate-400 text-center px-4">
                  Click “Generate” to render a PDF preview using sample data
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={saveMutation.isPending}
            data-testid="save-template-btn"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ==================== PRINT DIALOG ====================

function PrintDialog({ open, template, onClose }) {
  const [copies, setCopies] = useState(1);
  const [assetIdsText, setAssetIdsText] = useState("");
  const [margin, setMargin] = useState(0);
  const [printing, setPrinting] = useState(false);
  const qc = useQueryClient();

  const onPrint = async (download = false) => {
    if (!template) return;
    // Pre-open window synchronously within the click handler for iOS.
    let preOpened = null;
    if (!download) {
      try {
        const { openPrintWindow, isMobileDevice } = await import("../lib/printLabel");
        if (isMobileDevice()) preOpened = openPrintWindow();
      } catch (_e) { /* ignore */ }
    }
    setPrinting(true);
    try {
      const blob = await labelsAPI.printBlob({
        template_id: template.id,
        asset_ids: assetIdsText
          .split(/[\s,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        copies: Math.max(1, Number(copies) || 1),
        margin_offset_mm: Number(margin) || 0,
      });
      qc.invalidateQueries({ queryKey: ["label-jobs"] });
      if (download) {
        downloadBlob(blob, `${template.name || "labels"}.pdf`);
        toast.success("PDF downloaded");
      } else {
        const { printLabel } = await import("../lib/printLabel");
        const res = await printLabel({
          template_id: template.id,
          asset_ids: assetIdsText
            .split(/[\s,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          copies: Math.max(1, Number(copies) || 1),
        }, { win: preOpened, filename: `${template.name || "labels"}.pdf` });
        if (res.method === "window") toast.success("Print dialog opened");
        else if (res.mobile) toast.info("PDF downloaded — use Share → Print");
        else if (res.method === "download") toast.info("Print blocked — PDF downloaded instead.");
        else toast.success("Print dialog opened");
      }
    } catch (e) {
      if (preOpened && !preOpened.closed) preOpened.close();
      toast.error(e.response?.data?.detail || "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-500" />
            Print — {template?.name}
          </DialogTitle>
          <DialogDescription>
            Leave asset IDs empty to print a sample label. Up to 500 per job.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Asset IDs (one per line, or comma-separated)</Label>
            <Textarea
              rows={4}
              value={assetIdsText}
              onChange={(e) => setAssetIdsText(e.target.value)}
              placeholder="EQ-00001&#10;EQ-00002"
              data-testid="print-asset-ids"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Copies per asset</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                data-testid="print-copies"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Margin offset (mm)</Label>
              <Input
                type="number"
                step="0.1"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => onPrint(true)} disabled={printing} data-testid="download-pdf-btn">
            <Download className="w-4 h-4 mr-1" /> Download PDF
          </Button>
          <Button onClick={() => onPrint(false)} disabled={printing} data-testid="print-labels-btn">
            {printing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />}
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ==================== MAIN PAGE ====================

export default function LabelsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null); // template object or "new"
  const [printing, setPrinting] = useState(null); // template object
  const [activeTab, setActiveTab] = useState("templates");

  const { data: presetData } = useQuery({
    queryKey: ["label-presets"],
    queryFn: labelsAPI.getPresets,
  });
  const presets = presetData?.presets || [];
  const assetFields = presetData?.asset_fields || [];

  const { data, isLoading } = useQuery({
    queryKey: ["label-templates", statusFilter],
    queryFn: () => labelsAPI.listTemplates(statusFilter === "all" ? undefined : statusFilter),
  });
  const templates = data?.templates || [];

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["label-jobs"],
    queryFn: () => labelsAPI.listJobs(100),
    enabled: activeTab === "history",
    refetchOnMount: "always",
  });
  const jobs = jobsData?.jobs || [];

  const filtered = useMemo(
    () =>
      templates.filter((t) =>
        search ? (t.name || "").toLowerCase().includes(search.toLowerCase()) : true
      ),
    [templates, search]
  );

  const duplicateMutation = useMutation({
    mutationFn: (id) => labelsAPI.duplicateTemplate(id),
    onSuccess: () => {
      toast.success("Template duplicated");
      qc.invalidateQueries({ queryKey: ["label-templates"] });
    },
    onError: () => toast.error("Duplicate failed"),
  });

  const archiveMutation = useMutation({
    mutationFn: (id) => labelsAPI.deleteTemplate(id),
    onSuccess: () => {
      toast.success("Template archived");
      qc.invalidateQueries({ queryKey: ["label-templates"] });
    },
    onError: () => toast.error("Archive failed"),
  });

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 md:p-6 space-y-4"
        data-testid="labels-page"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="w-6 h-6 text-indigo-500" />
              <h1 className="text-xl md:text-2xl font-semibold text-slate-800">Smart Labels</h1>
            </div>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Design, preview, and print QR-enabled asset labels.
            </p>
          </div>
          <Button onClick={() => setEditing("new")} data-testid="new-template-btn">
            <Plus className="w-4 h-4 mr-1" /> New Template
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="templates" data-testid="tab-templates">Templates</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="w-3.5 h-3.5 mr-1" /> Print History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Search templates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="search-templates"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-9" data-testid="status-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (active)</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                <Tag className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-600">No label templates yet</p>
                <Button className="mt-3" size="sm" onClick={() => setEditing("new")}>
                  <Plus className="w-4 h-4 mr-1" /> Create first template
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((t) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
                    data-testid={`template-card-${t.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-800 truncate">{t.name}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{t.description || "—"}</p>
                      </div>
                      <Badge className={`text-[10px] ${STATUS_BADGE[t.status] || STATUS_BADGE.draft}`} variant="secondary">
                        {t.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-slate-500">
                      <span>{t.width_mm}×{t.height_mm}mm</span>
                      <span>·</span>
                      <span className="capitalize">{t.preset?.replace("_", " ")}</span>
                      <span>·</span>
                      <span>v{t.version || 1}</span>
                    </div>
                    <div className="flex gap-1 mt-3 border-t pt-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPrinting(t)} data-testid={`print-btn-${t.id}`}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Print</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(t)} data-testid={`edit-btn-${t.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => duplicateMutation.mutate(t.id)}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Duplicate</TooltipContent>
                      </Tooltip>
                      <div className="flex-1" />
                      {t.status !== "archived" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-rose-500 hover:text-rose-600"
                              onClick={() => archiveMutation.mutate(t.id)}
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Archive</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {jobsLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                <History className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-600">No print jobs yet</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Template</th>
                      <th className="text-left px-3 py-2">User</th>
                      <th className="text-left px-3 py-2">Printer</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-left px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-700 tabular-nums text-xs">
                          {j.created_at?.replace("T", " ").slice(0, 19)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{j.template_name}</td>
                        <td className="px-3 py-2 text-slate-600">{j.user_name || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{j.printer_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{j.qty}</td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700">
                            {j.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Editor dialog */}
        {editing && (
          <TemplateEditor
            open={!!editing}
            template={editing === "new" ? null : editing}
            presets={presets}
            assetFields={assetFields}
            onClose={() => setEditing(null)}
          />
        )}

        {/* Print dialog */}
        {printing && (
          <PrintDialog
            open={!!printing}
            template={printing}
            onClose={() => setPrinting(null)}
          />
        )}
      </motion.div>
    </TooltipProvider>
  );
}
