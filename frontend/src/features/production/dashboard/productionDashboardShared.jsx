import React, { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { api } from "../../../lib/apiClient";
import { formatDateTimeCompact } from "../../../lib/dateUtils";
import { PERIOD_OPTIONS } from "../../../lib/production/dateRange";
import KpiCalculationTooltip from "../../../components/ui/KpiCalculationTooltip";

// ──────────────────────────────────────────
// KPI Card
// ──────────────────────────────────────────
export const formatHoursMinutes = (hoursLike) => {
  const h = Number(hoursLike);
  if (!Number.isFinite(h) || h <= 0) return "0h 0m";
  const totalMinutes = Math.max(0, Math.round(h * 60));
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}h ${mm}m`;
};

export const KPICard = ({ icon: Icon, iconColor, label, value, unit, detail, detail2, trend, trendDirection, calculation }) => {
  const card = (
  <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col gap-1 sm:gap-1.5 min-w-0" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
    <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center ${iconColor || 'bg-slate-100'}`}>
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </div>
      <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide leading-tight">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-lg sm:text-2xl font-bold text-slate-900 tabular-nums leading-none">{value}</span>
      {unit && <span className="text-xs sm:text-sm text-slate-500">{unit}</span>}
    </div>
    {detail && <p className="text-[10px] sm:text-xs text-slate-500 truncate">{detail}</p>}
    {detail2 && <p className="text-[10px] sm:text-xs text-slate-400 truncate">{detail2}</p>}
    {trend !== undefined && (
      <span className={`text-[10px] sm:text-xs font-medium ${trendDirection === 'up' ? 'text-emerald-600' : trendDirection === 'down' ? 'text-red-500' : 'text-slate-500'}`}>
        {trendDirection === 'up' ? '+' : ''}{trend}
      </span>
    )}
  </div>
  );

  if (!calculation) return card;
  return <KpiCalculationTooltip calculation={calculation}>{card}</KpiCalculationTooltip>;
};

// ──────────────────────────────────────────
// Custom chart tooltip
// ──────────────────────────────────────────
export const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : v);

export const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-medium text-slate-800">{fmt1(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

// Viscosity chart tooltip — always shows RPM, Feed, MP4, T Product IR
export const ViscosityTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[150px]">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {d.viscosity != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#8b5cf6]" /><span className="text-slate-600">Viscosity:</span><span className="font-medium text-slate-800">{fmt1(d.viscosity)} MU</span></div>
      )}
      {d.rpm != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#3b82f6]" /><span className="text-slate-600">RPM:</span><span className="font-medium text-slate-800">{fmt1(d.rpm)}</span></div>
      )}
      {d.feed != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#f97316]" /><span className="text-slate-600">Feed:</span><span className="font-medium text-slate-800">{fmt1(d.feed)} kg</span></div>
      )}
      {d.mp4 != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#14b8a6]" /><span className="text-slate-600">MP4:</span><span className="font-medium text-slate-800">{fmt1(d.mp4)}</span></div>
      )}
      {d.t_product_ir != null && (
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ef4444]" /><span className="text-slate-600">T Product IR:</span><span className="font-medium text-slate-800">{fmt1(d.t_product_ir)}</span></div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Chart series toggle buttons
// ──────────────────────────────────────────
export const OPTIONAL_SERIES = [
  { key: "rpm", label: "RPM", color: "#3b82f6" },
  { key: "feed", label: "Feed", color: "#f97316" },
  { key: "mp4", label: "MP4", color: "#14b8a6" },
  { key: "t_product_ir", label: "T Product IR", color: "#ef4444" },
  { key: "screenChange", label: "Screen Change", color: "#a855f7" },
  { key: "magnetCleaning", label: "Magnet Cleaning", color: "#ec4899" },
];

export const ChartSeriesToggles = ({ active, onToggle }) => (
  <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap" data-testid="chart-toggles">
    {OPTIONAL_SERIES.map((s) => (
      <button
        key={s.key}
        onClick={() => onToggle(s.key)}
        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border transition-colors ${
          active[s.key]
            ? "border-transparent text-white"
            : "border-slate-200 text-slate-500 bg-white hover:bg-slate-50"
        }`}
        style={active[s.key] ? { backgroundColor: s.color } : undefined}
        data-testid={`toggle-${s.key}`}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active[s.key] ? "#fff" : s.color }} />
        <span className="hidden sm:inline">{s.label}</span>
        <span className="sm:hidden">{s.label.length > 4 ? s.label.substring(0, 4) : s.label}</span>
      </button>
    ))}
  </div>
);

// ──────────────────────────────────────────
// Form Execution Dialog
// ──────────────────────────────────────────
export const FIELD_TYPE_MAP = {
  text: "text",
  textarea: "text",
  string: "text",
  multiline: "text",
  paragraph: "text",
  numeric: "number",
  number: "number",
  date: "date",
  datetime: "datetime-local",
  dropdown: "text",
  select: "text",
};

/** Normalize template field type strings (designer / API casing varies). */
export function formTemplateFieldTypeKey(field) {
  const raw = field?.type ?? field?.field_type ?? "text";
  return typeof raw === "string" ? raw.trim().toLowerCase() : "text";
}

/** Scrollable production tile body — keeps nested touch scroll working on mobile. */
export const PRODUCTION_TILE_SCROLL_CLASS = "max-h-[240px] mobile-scroll-pane";
export const PRODUCTION_TILE_SCROLL_CLASS_SM = "max-h-[200px] mobile-scroll-pane";

/** Production Log–style icon buttons for dashboard tables */
export const PRODUCTION_DASH_ACTION_EDIT = "p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors";
export const PRODUCTION_DASH_ACTION_DELETE = "p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors";

/** Map form waste type values (e.g. cut_waste) to dashboard labels (Cut). */
export const formatWasteTypeLabel = (raw) => {
  if (raw == null || raw === "") return "—";
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  const labels = { cut_waste: "Cut", production_waste: "Production" };
  return labels[key] ?? String(raw).trim();
};

/** Waste reporting table — matches End of Shift panel styling. */
export function WasteReportingPanel({
  entries,
  thresholdKg,
  isMobile,
  formTemplates,
  line90Equipment,
  setFormExec,
  setDeleteConfirm,
}) {
  const openAdd = () => {
    if (formTemplates?.wasteReporting) {
      setFormExec({
        templateId: formTemplates.wasteReporting.id,
        templateName: formTemplates.wasteReporting.name || "Waste reporting",
        equipmentId: line90Equipment?.id,
      });
    } else {
      toast.error("Waste reporting template not found");
    }
  };

  const openEdit = (row) => {
    if (formTemplates?.wasteReporting && row.submission_id) {
      setFormExec({
        templateId: formTemplates.wasteReporting.id,
        templateName: formTemplates.wasteReporting.name || "Waste reporting",
        equipmentId: line90Equipment?.id,
        submissionId: row.submission_id,
        initialValues: row.prefill || {},
      });
    }
  };

  const renderActions = (row, i, displayDT) => (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openEdit(row);
        }}
        className={PRODUCTION_DASH_ACTION_EDIT}
        title="Edit"
        data-testid={`edit-waste-${i}`}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (row.submission_id) {
            setDeleteConfirm({
              ids: [row.submission_id],
              label: `waste entry (${formatWasteTypeLabel(row.waste_type).replace(/^—$/, displayDT || "item")})`,
            });
          }
        }}
        className={PRODUCTION_DASH_ACTION_DELETE}
        title="Delete"
        data-testid={`delete-waste-${i}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="waste-reporting-panel">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Waste</h3>
        <div className="flex items-center gap-2">
          {entries?.length > 0 && (
            <Badge variant="secondary" className="text-xs">{entries.length}</Badge>
          )}
          {!isMobile && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={openAdd}
              data-testid="waste-reporting-add-btn"
            >
              <Plus className="w-3 h-3" /> Add
            </Button>
          )}
        </div>
      </div>
      <div className={PRODUCTION_TILE_SCROLL_CLASS}>
        {entries?.length > 0 ? (
          isMobile ? (
            <div className="space-y-1">
              {entries.map((row, i) => {
                const weight = Number(row.weight_kg ?? 0);
                const isHigh = weight >= thresholdKg;
                const displayDT = formatDateTimeCompact(row.datetime || row.date_time_raw);
                return (
                  <div
                    key={row.submission_id || i}
                    className="flex items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50 py-1 px-2 text-[11px] leading-tight"
                    data-testid={`waste-row-${i}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
                        <span className="shrink-0 tabular-nums text-[10px] text-slate-500">{displayDT}</span>
                        <span className="font-medium text-slate-800">{formatWasteTypeLabel(row.waste_type)}</span>
                        <span
                          className={`shrink-0 tabular-nums font-medium ${isHigh ? "text-red-600" : "text-slate-700"}`}
                        >
                          {weight.toLocaleString()} kg
                        </span>
                      </div>
                    </div>
                    {renderActions(row, i, displayDT)}
                  </div>
                );
              })}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-2 font-semibold text-slate-700 tracking-wide text-[11px]">Date & Time</th>
                  <th className="text-left py-2 px-1 font-medium text-slate-500 uppercase tracking-wider text-[10px]">Waste Type</th>
                  <th className="text-right py-2 px-1 font-medium text-slate-500 uppercase tracking-wider text-[10px]">Weight (KG)</th>
                  <th className="w-14 p-0" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {entries.map((row, i) => {
                  const weight = Number(row.weight_kg ?? 0);
                  const isHigh = weight >= thresholdKg;
                  const displayDT = formatDateTimeCompact(row.datetime || row.date_time_raw);
                  return (
                    <tr key={row.submission_id || i} className="border-b border-slate-50 hover:bg-slate-50 group" data-testid={`waste-row-${i}`}>
                      <td className="py-1.5 px-1 text-slate-700 whitespace-nowrap tabular-nums">{displayDT}</td>
                      <td className="py-1.5 px-1 text-slate-700">{formatWasteTypeLabel(row.waste_type)}</td>
                      <td className={`py-1.5 px-1 text-right tabular-nums font-medium ${isHigh ? "text-red-600" : "text-slate-700"}`}>
                        {weight.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-2 align-top">{renderActions(row, i, displayDT)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : (
          <p className="text-xs text-slate-400 py-8 text-center">No waste entries recorded yet</p>
        )}
      </div>
    </div>
  );
}
/** Square touch target + centered glyph for Information (and similar) icon rows */
export const PRODUCTION_DASH_INFO_ACTION_BTN = "inline-flex size-9 shrink-0 items-center justify-center rounded transition-colors";
export const PRODUCTION_DASH_INFO_ACTION_EDIT = `${PRODUCTION_DASH_INFO_ACTION_BTN} text-slate-400 hover:bg-slate-100 hover:text-slate-600`;
export const PRODUCTION_DASH_INFO_ACTION_DELETE = `${PRODUCTION_DASH_INFO_ACTION_BTN} text-slate-300 hover:bg-red-50 hover:text-red-500`;

export const FormExecutionDialog = ({ open, onClose, templateId, templateName, equipmentId, equipmentName, equipmentTag, onSuccess, submissionId, initialValues }) => {
  const [fields, setFields] = useState([]);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dropdownOptions, setDropdownOptions] = useState({});

  // Fetch template fields when dialog opens
  useEffect(() => {
    if (!open || !templateId) return;
    setLoading(true);
    api.get(`/form-templates/${templateId}`).then((res) => {
      const t = res.data;
      const f = t.fields || [];
      setFields(f);
      // Set defaults (or prefill from initialValues in edit mode)
      const defaults = {};
      const optsMap = {};
      const now = new Date();
      const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
      f.forEach((field) => {
        const ft = formTemplateFieldTypeKey(field);
        const prefill = initialValues?.[field.id];
        if (prefill !== undefined && prefill !== null && prefill !== "") {
          defaults[field.id] = String(prefill);
        } else if (ft === "datetime") defaults[field.id] = localISO.slice(0, 16);
        else if (ft === "date") defaults[field.id] = localISO.slice(0, 10);
        else defaults[field.id] = "";
        const optList = field.options;
        const hasOptions = Array.isArray(optList) && optList.length > 0;
        if ((ft === "dropdown" || ft === "select") && hasOptions) {
          optsMap[field.id] = optList;
        }
      });
      setDropdownOptions(optsMap);
      setFormData(defaults);
    }).catch(() => toast.error("Failed to load form")).finally(() => setLoading(false));
  }, [open, templateId, submissionId, initialValues]);

  const handleSubmit = async () => {
    // Validate required
    for (const field of fields) {
      if (field.required && !formData[field.id] && formData[field.id] !== 0) {
        toast.error(`${field.label} is required`);
        return;
      }
    }
    setSubmitting(true);
    try {
      if (submissionId) {
        // Edit mode: send values keyed by field_label (matches productionAPI.updateSubmission)
        const valuesByLabel = {};
        fields.forEach((f) => {
          valuesByLabel[f.label] = String(formData[f.id] ?? "");
        });
        await api.patch(`/production/submission/${submissionId}`, { values: valuesByLabel });
        toast.success(`${templateName} updated`);
      } else {
        const values = fields.map((f) => ({
          field_id: f.id,
          field_label: f.label,
          value: String(formData[f.id] ?? ""),
        }));
        await api.post("/form-submissions", {
          form_template_id: templateId,
          equipment_id: equipmentId || "",
          values,
          notes: "",
        });
        toast.success(`${templateName} submitted`);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(submissionId ? "Update failed" : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden" data-testid="form-execution-dialog">
        <DialogHeader>
          <DialogTitle>{submissionId ? `Edit ${templateName}` : templateName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-blue-500" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pt-2">
            {fields.map((field) => {
              const ft = formTemplateFieldTypeKey(field);
              const inputType = FIELD_TYPE_MAP[ft] || "text";
              const opts = dropdownOptions[field.id];
              const isPlainText = !opts && inputType === "text";
              const fieldSpan = ft === "datetime" || isPlainText ? "col-span-2" : "";
              return (
                <div key={field.id} className={fieldSpan}>
                  <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  {opts ? (
                    <Select value={formData[field.id] || ""} onValueChange={(v) => setFormData((p) => ({ ...p, [field.id]: v }))}>
                      <SelectTrigger className="h-9 mt-1" data-testid={`form-field-${field.id}`}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {opts.map((o) => (
                          <SelectItem key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>
                            {typeof o === "string" ? o : o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : isPlainText ? (
                    <Textarea
                      className="mt-1 min-h-[10rem] w-full resize-y text-sm leading-relaxed"
                      rows={8}
                      value={formData[field.id] ?? ""}
                      onChange={(e) => setFormData((p) => ({ ...p, [field.id]: e.target.value }))}
                      data-testid={`form-field-${field.id}`}
                    />
                  ) : (
                    <Input
                      type={inputType}
                      step={inputType === "number" ? "any" : undefined}
                      max={(() => {
                        if (inputType === "date") {
                          const now = new Date();
                          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        }
                        if (inputType === "datetime-local") {
                          const now = new Date();
                          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                        }
                        return undefined;
                      })()}
                      className="h-9 mt-1"
                      value={formData[field.id] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Prevent future dates (using local timezone)
                        const now = new Date();
                        const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        const nowLocal = `${todayLocal}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                        
                        if (inputType === "date" && val > todayLocal) {
                          toast.error("Future dates are not allowed");
                          return;
                        }
                        if (inputType === "datetime-local" && val > nowLocal) {
                          toast.error("Future dates are not allowed");
                          return;
                        }
                        setFormData((p) => ({ ...p, [field.id]: val }));
                      }}
                      onMouseDown={(e) => {
                        // Prevent dialog from capturing date picker clicks
                        if (inputType === "date" || inputType === "datetime-local") {
                          e.stopPropagation();
                        }
                      }}
                      data-testid={`form-field-${field.id}`}
                    />
                  )}
                </div>
              );
            })}
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={submitting} onClick={handleSubmit} data-testid="form-submit-btn">
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Chronological sort key for production log rows (ISO `datetime` or clock time anchored on `fromDate`). */
export function sortMillisecondsForProductionEntry(entry, fromDate) {
  const raw = (entry?.datetime || "").trim();
  if (raw) {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return ms;
  }
  const t = (entry?.time || "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m && fromDate) {
    const d = new Date(
      fromDate.getFullYear(),
      fromDate.getMonth(),
      fromDate.getDate(),
      parseInt(m[1], 10),
      parseInt(m[2], 10),
      m[3] ? parseInt(m[3], 10) : 0,
      0
    );
    return d.getTime();
  }
  return Number.POSITIVE_INFINITY;
}

/** Chart / series ordering: always use full `datetime` when present so e.g. 23:16 before 01:36 next calendar day (06:00–06:00 shift). */
export function chartPointSortMs(entry, fromDate) {
  const raw = (entry?.datetime || "").trim();
  if (raw) {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return ms;
  }
  return sortMillisecondsForProductionEntry(entry, fromDate);
}

export const PRODUCTION_SHIFT_OPTIONS = [
  { key: "morning", short: "Morning", sub: "06:00–14:00", title: "Morning (06:00 – 14:00)" },
  { key: "afternoon", short: "Afternoon", sub: "14:00–22:00", title: "Afternoon (14:00 – 22:00)" },
  { key: "night", short: "Night", sub: "22:00–06:00", title: "Night (22:00 – 06:00)" },
];

export const PRODUCTION_DASH_FILTERS_KEY = "assetiq.productionDashboard.filters";
export const PRODUCTION_DASH_FILTERS_V = 1;
export const PERIOD_KEY_SET = new Set(PERIOD_OPTIONS.map((o) => o.key));

export function loadProductionDashboardFiltersSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PRODUCTION_DASH_FILTERS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j?.v !== PRODUCTION_DASH_FILTERS_V) return null;
    return j;
  } catch {
    return null;
  }
}

export function parseSavedShiftsFromSnapshot(saved) {
  const allowed = new Set(["morning", "afternoon", "night"]);
  const arr = saved?.shifts;
  if (!Array.isArray(arr)) return ["morning"];
  const next = [...new Set(arr.filter((x) => typeof x === "string" && allowed.has(x)))];
  return next.length ? next : ["morning"];
}

export function saveProductionDashboardFiltersSnapshot(payload) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(PRODUCTION_DASH_FILTERS_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}


