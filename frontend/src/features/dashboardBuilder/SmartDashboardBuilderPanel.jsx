import React, { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BarChart3, GripVertical, Hash, Plus, Sparkles, Trash2, Copy, Pencil, Maximize2, Minimize2, Table2, TrendingUp, Layers, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { formAPI } from "../../components/forms/formAPI";
import { Checkbox } from "../../components/ui/checkbox";

const STORAGE_KEY = "assetiq_smart_dashboard_widgets_v1";

// Match Production Report visual language (cards + tooltips)
const fmt1 = (v) => (typeof v === "number" ? v.toFixed(1) : v);

function ReportChartTooltip({ active, payload, label }) {
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
}

function ReportKPICard({ icon: Icon, iconColor, label, value, unit, detail, detail2, trend, trendDirection }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor || "bg-slate-100"}`}>
          {Icon ? <Icon className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
        </div>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-900 tabular-nums">{value}</span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
      {detail && <p className="text-xs text-slate-500 truncate">{detail}</p>}
      {detail2 && <p className="text-xs text-slate-400 truncate">{detail2}</p>}
      {trend !== undefined && (
        <span
          className={`text-xs font-medium ${
            trendDirection === "up"
              ? "text-emerald-600"
              : trendDirection === "down"
                ? "text-red-500"
                : "text-slate-500"
          }`}
        >
          {trendDirection === "up" ? "+" : ""}
          {trend}
        </span>
      )}
    </div>
  );
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function uid() {
  return `w_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function lc(v) {
  return String(v || "").toLowerCase();
}

function isActionClosed(a) {
  const s = lc(a?.status);
  return s === "closed" || s === "completed" || s === "done";
}

function isActionOverdue(a) {
  const due = a?.due_date || a?.dueDate || a?.deadline;
  if (!due) return false;
  const d = new Date(due);
  if (isNaN(d)) return false;
  return !isActionClosed(a) && d.getTime() < Date.now();
}

function countBy(items, keyFn) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

const SOURCES = [
  { key: "actions", label: "Actions" },
  { key: "observations", label: "Observations" },
  { key: "investigations", label: "Investigations" },
  { key: "forms", label: "Forms" },
];

const DISPLAY_TYPES = [
  { key: "kpi", label: "KPI" },
  { key: "bar", label: "Bar chart" },
  { key: "line", label: "Line chart" },
  { key: "table", label: "Table" },
];

const METRICS = {
  actions: [
    { key: "open_actions", label: "Open actions", defaultDisplay: "kpi" },
    { key: "overdue_actions", label: "Overdue actions", defaultDisplay: "kpi" },
    { key: "overdue_by_owner", label: "Overdue actions by owner", defaultDisplay: "bar" },
  ],
  observations: [
    { key: "open_observations", label: "Open observations", defaultDisplay: "kpi" },
    { key: "by_severity", label: "Observations by severity", defaultDisplay: "bar" },
  ],
  investigations: [
    { key: "open_investigations", label: "Open investigations", defaultDisplay: "kpi" },
    { key: "by_status", label: "Investigations by status", defaultDisplay: "bar" },
  ],
  forms: [
    { key: "form_submissions_total", label: "Form submissions (total)", defaultDisplay: "kpi" },
    { key: "form_submissions_warnings", label: "Form submissions with warnings", defaultDisplay: "kpi" },
    { key: "form_submissions_critical", label: "Form submissions with critical", defaultDisplay: "kpi" },
    { key: "form_submissions_issues", label: "Issues & warnings", defaultDisplay: "bar" },
    { key: "form_submissions_by_form", label: "Form submissions by form", defaultDisplay: "bar" },
    { key: "form_submissions_trend", label: "Trends over time", defaultDisplay: "line" },
    { key: "form_field_value_distribution", label: "Field values (distribution)", defaultDisplay: "bar" },
  ],
};

function defaultMetricFor(sourceKey) {
  return METRICS[sourceKey]?.[0]?.key || "";
}

function metricDef(sourceKey, metricKey) {
  return (METRICS[sourceKey] || []).find((m) => m.key === metricKey) || null;
}

function computePreview(
  { sourceKey, metricKey, displayType, title, formTemplateId, formFieldIds, xAxisFieldId },
  data
) {
  const actions = data.actions || [];
  const observations = data.observations || [];
  const investigations = data.investigations || [];
  const users = data.users || [];
  const formTemplates = data.formTemplates || [];
  const formSubmissions = data.formSubmissions || [];
  const formSubmissionsTotal = Number.isFinite(data.formSubmissionsTotal) ? data.formSubmissionsTotal : formSubmissions.length;
  const usersById = new Map((users || []).map((u) => [u.id, u]));
  const templateById = new Map((formTemplates || []).map((t) => [t.id, t]));

  const metric = metricDef(sourceKey, metricKey);
  const widgetTitle = title?.trim() || metric?.label || "Widget";

  const selectedTemplate = formTemplateId ? templateById.get(formTemplateId) : null;
  const selectedFieldIds = Array.isArray(formFieldIds) ? formFieldIds.filter(Boolean) : [];
  const selectedFields = (selectedTemplate?.fields || []).filter((f) => selectedFieldIds.includes(f.id));
  const effectiveXAxisFieldId = xAxisFieldId && selectedFieldIds.includes(xAxisFieldId) ? xAxisFieldId : selectedFieldIds[0] || "";

  const whyByMetric = {
    open_actions: "Counts actions that are not closed/completed.",
    overdue_actions: "Counts actions where due date is before today and status is not closed.",
    overdue_by_owner: "Counts overdue actions grouped by owner/assignee.",
    open_observations: "Counts observations with status Open.",
    by_severity: "Groups observations by severity/risk level.",
    open_investigations: "Counts investigations that are not completed/closed.",
    by_status: "Groups investigations by status.",
    form_submissions_total: "Counts all submitted forms.",
    form_submissions_warnings: "Counts submitted forms that have warnings.",
    form_submissions_critical: "Counts submitted forms that have critical items.",
    form_submissions_issues: "Shows warnings and critical issues from submitted forms.",
    form_submissions_by_form: "Groups form submissions by form name.",
    form_submissions_trend: "Shows how submissions change over time.",
    form_field_value_distribution: "Shows the most common values for the selected form field(s).",
  };
  const why = whyByMetric[metricKey] || "Generated from your selections.";

  if (displayType === "kpi") {
    let value = 0;
    if (metricKey === "open_actions") value = actions.filter((a) => !isActionClosed(a)).length;
    else if (metricKey === "overdue_actions") value = actions.filter(isActionOverdue).length;
    else if (metricKey === "open_observations")
      value = observations.filter((o) => lc(o?.status) === "open").length;
    else if (metricKey === "open_investigations")
      value = investigations.filter((i) => {
        const s = lc(i?.status);
        return s && s !== "completed" && s !== "closed";
      }).length;
    else if (metricKey === "form_submissions_total") value = formSubmissionsTotal;
    else if (metricKey === "form_submissions_warnings")
      value = formSubmissions.filter((s) => !!(s?.has_warnings ?? s?.hasWarnings)).length;
    else if (metricKey === "form_submissions_critical")
      value = formSubmissions.filter((s) => !!(s?.has_critical ?? s?.hasCritical)).length;
    return { kind: "kpi", title: widgetTitle, why, value };
  }

  // Bar charts + tables + line charts
  if (metricKey === "overdue_by_owner") {
    const overdue = actions.filter(isActionOverdue);
    const byOwner = countBy(overdue, (a) => a?.assignee || a?.owner_id || a?.owner || "Unassigned");
    const rows = Array.from(byOwner.entries()).map(([ownerKey, count]) => ({
      label: usersById.get(ownerKey)?.name || String(ownerKey),
      value: count,
    }));
    rows.sort((a, b) => b.value - a.value);
    return { kind: displayType === "table" ? "table" : "bar", title: widgetTitle, why, series: rows.slice(0, 10) };
  }

  if (metricKey === "by_severity") {
    const by = countBy(observations, (o) => o?.severity || o?.risk_level || "Unknown");
    const rows = Array.from(by.entries()).map(([k, v]) => ({ label: String(k), value: v }));
    rows.sort((a, b) => b.value - a.value);
    return { kind: displayType === "table" ? "table" : "bar", title: widgetTitle, why, series: rows.slice(0, 10) };
  }

  if (metricKey === "by_status") {
    const by = countBy(investigations, (i) => i?.status || "Unknown");
    const rows = Array.from(by.entries()).map(([k, v]) => ({ label: String(k), value: v }));
    rows.sort((a, b) => b.value - a.value);
    return { kind: displayType === "table" ? "table" : "bar", title: widgetTitle, why, series: rows.slice(0, 10) };
  }

  if (metricKey === "form_submissions_by_form") {
    const by = countBy(formSubmissions, (s) => s?.template_id || s?.templateId || "Unknown");
    const rows = Array.from(by.entries()).map(([k, v]) => ({
      label: templateById.get(k)?.name || String(k),
      value: v,
    }));
    rows.sort((a, b) => b.value - a.value);
    return { kind: displayType === "table" ? "table" : "bar", title: widgetTitle, why, series: rows.slice(0, 10) };
  }

  if (metricKey === "form_submissions_issues") {
    const warnings = formSubmissions.filter((s) => !!(s?.has_warnings ?? s?.hasWarnings)).length;
    const critical = formSubmissions.filter((s) => !!(s?.has_critical ?? s?.hasCritical)).length;
    const rows = [
      { label: "Warnings", value: warnings },
      { label: "Critical", value: critical },
    ];
    return { kind: displayType === "table" ? "table" : "bar", title: widgetTitle, why, series: rows };
  }

  if (metricKey === "form_submissions_trend") {
    const subs = formTemplateId
      ? formSubmissions.filter((s) => (s?.form_template_id || s?.template_id || s?.templateId) === formTemplateId)
      : formSubmissions;
    const dayKey = (s) => {
      const raw = s?.submitted_at || s?.created_at || s?.submittedAt || s?.createdAt || "";
      const d = new Date(raw);
      if (isNaN(d)) return "";
      return d.toISOString().slice(0, 10);
    };
    const byDay = countBy(subs, (s) => dayKey(s) || "Unknown");
    const rows = Array.from(byDay.entries())
      .filter(([k]) => k !== "Unknown")
      .map(([k, v]) => ({ label: k, value: v }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-14);
    return { kind: "line", title: widgetTitle, why, series: rows };
  }

  if (metricKey === "form_field_value_distribution") {
    const subs = formTemplateId
      ? formSubmissions.filter((s) => (s?.form_template_id || s?.template_id || s?.templateId) === formTemplateId)
      : formSubmissions;

    const counts = new Map(); // label -> count

    const add = (label) => {
      counts.set(label, (counts.get(label) || 0) + 1);
    };

    subs.forEach((s) => {
      const responsesAll = s?.values || s?.responses || [];
      (responsesAll || []).forEach((r) => {
        const fid = r?.field_id || r?.fieldId || r?.id;
        if (!fid || fid !== effectiveXAxisFieldId) return;
        const rawVal = r?.value ?? r?.answer ?? r?.response ?? r?.text ?? r?.selected ?? "";
        const val = Array.isArray(rawVal) ? rawVal.join(", ") : String(rawVal ?? "").trim();
        if (!val) return;
        add(val);
      });
    });

    const rows = Array.from(counts.entries()).map(([label, value]) => ({ label, value }));
    rows.sort((a, b) => b.value - a.value);
    const effectiveWhy =
      effectiveXAxisFieldId
        ? why
        : "Select a form and at least one field to see a distribution.";
    const axisLabel =
      selectedTemplate?.fields?.find((f) => f.id === effectiveXAxisFieldId)?.label || effectiveXAxisFieldId || "Field";
    return {
      kind: displayType === "table" ? "table" : "bar",
      title: widgetTitle,
      why: effectiveWhy,
      xAxisLabel: axisLabel,
      series: rows.slice(0, 10),
    };
  }

  return { kind: "bar", title: widgetTitle, why, series: [] };
}

function withMockPreview(preview, config) {
  const p = preview || {};
  if (p.kind === "kpi") {
    const v = Number.isFinite(p.value) ? p.value : 0;
    return { ...p, value: v === 0 ? 128 : v };
  }
  const series = Array.isArray(p.series) ? p.series : [];
  if (series.length > 0) return p;
  const labelBase = config?.intentKey || "Sample";
  if (p.kind === "line") {
    return {
      ...p,
      kind: "line",
      series: Array.from({ length: 8 }).map((_, i) => ({
        label: `Day ${i + 1}`,
        value: Math.max(1, Math.round(20 + 8 * Math.sin(i / 2))),
      })),
    };
  }
  return {
    ...p,
    series: [
      { label: `${labelBase} A`, value: 12 },
      { label: `${labelBase} B`, value: 8 },
      { label: `${labelBase} C`, value: 5 },
    ],
  };
}

const INTENTS = [
  {
    key: "total_submissions",
    label: "Total submissions",
    desc: "How many forms were submitted",
    icon: Hash,
  },
  {
    key: "issues_warnings",
    label: "Issues & warnings",
    desc: "Warnings and critical items",
    icon: AlertTriangle,
  },
  {
    key: "trends_over_time",
    label: "Trends over time",
    desc: "How activity changes over time",
    icon: TrendingUp,
  },
  {
    key: "submissions_by_form",
    label: "Submissions by form",
    desc: "Which forms are used most",
    icon: BarChart3,
  },
];

const VISUALS = [
  { key: "kpi", label: "KPI card", desc: "Single number", icon: Hash },
  { key: "table", label: "Table", desc: "List + counts", icon: Table2 },
  { key: "bar", label: "Bar chart", desc: "Compare categories", icon: BarChart3 },
  { key: "line", label: "Line chart", desc: "Trend over time", icon: TrendingUp },
];

const BUILDER_TEMPLATES = [
  {
    key: "inspection_overview",
    label: "Inspection overview",
    desc: "Submissions by form (last 30 days)",
    preset: { intentKey: "submissions_by_form", displayType: "bar" },
  },
  {
    key: "safety_issues",
    label: "Safety issues",
    desc: "Warnings vs critical",
    preset: { intentKey: "issues_warnings", displayType: "bar" },
  },
  {
    key: "daily_activity",
    label: "Daily activity",
    desc: "Trend line of submissions",
    preset: { intentKey: "trends_over_time", displayType: "line" },
  },
  {
    key: "form_performance",
    label: "Form performance",
    desc: "Top forms by usage",
    preset: { intentKey: "submissions_by_form", displayType: "table" },
  },
];

function SortableWidgetCard({
  id,
  widget,
  data,
  renaming,
  onStartRename,
  onStopRename,
  onUpdateTitle,
  onDuplicate,
  onDelete,
  onToggleSize,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const p0 = computePreview(
    {
      sourceKey: widget.sourceKey,
      metricKey: widget.metricKey,
      displayType: widget.displayType,
      title: widget.title,
      formTemplateId: widget.formTemplateId,
      formFieldIds: widget.formFieldIds,
      xAxisFieldId: widget.xAxisFieldId,
    },
    data
  );
  const p = withMockPreview(p0, { intentKey: widget.metricKey });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${isDragging ? "ring-2 ring-indigo-300" : ""} ${
        widget.size === "wide" ? "lg:col-span-2" : ""
      }`}
      data-testid={`widget-${widget.id}`}
    >
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <Input
              autoFocus
              value={widget.title || ""}
              onChange={(e) => onUpdateTitle(e.target.value)}
              onBlur={onStopRename}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") onStopRename();
              }}
              className="h-8"
              data-testid={`rename-${widget.id}`}
            />
          ) : (
            <button
              type="button"
              className="text-left w-full"
              onClick={onStartRename}
              title="Rename"
              data-testid={`title-${widget.id}`}
            >
              <p className="text-sm font-semibold text-slate-900 truncate">{p.title}</p>
            </button>
          )}
          <p className="text-xs text-slate-500 mt-0.5">{p.why}</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-700"
            onClick={onToggleSize}
            title={widget.size === "wide" ? "Shrink" : "Expand"}
            aria-label={widget.size === "wide" ? "Shrink widget" : "Expand widget"}
            data-testid={`resize-${widget.id}`}
          >
            {widget.size === "wide" ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-700"
            onClick={onStartRename}
            title="Rename"
            aria-label="Rename widget"
            data-testid={`rename-btn-${widget.id}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-700"
            onClick={onDuplicate}
            title="Duplicate"
            aria-label="Duplicate widget"
            data-testid={`duplicate-${widget.id}`}
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-red-500"
            onClick={onDelete}
            title="Delete"
            aria-label="Delete widget"
            data-testid={`delete-${widget.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
            aria-label="Drag to reorder"
            data-testid={`drag-${widget.id}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4">
        {p.kind === "kpi" ? (
          <ReportKPICard label={p.title} value={p.value ?? 0} unit="" detail="KPI" />
        ) : p.kind === "line" ? (
          <div className="h-[240px] bg-white border border-slate-200 rounded-xl p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={p.series || []} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ReportChartTooltip />} />
                <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : p.kind === "table" ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 text-xs text-slate-500 flex items-center justify-between">
              <span className="truncate">{p?.xAxisLabel ? `X-axis: ${p.xAxisLabel}` : "Table"}</span>
              <span className="tabular-nums">{(p.series || []).length} rows</span>
            </div>
            <div className="max-h-[240px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">Value</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {(p.series || []).map((row) => (
                    <tr key={row.label} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 text-slate-700">{row.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">{row.value}</td>
                    </tr>
                  ))}
                  {(p.series || []).length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-xs text-slate-500">
                        No data yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.series || []} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="label" width={120} />
                <Tooltip content={<ReportChartTooltip />} />
                <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export function SmartDashboardBuilderPanel({ actions, observations, investigations, users }) {
  const [widgets, setWidgets] = useState(() => safeJsonParse(localStorage.getItem(STORAGE_KEY) || "[]", []));
  const [open, setOpen] = useState(false);
  const [lastDeleted, setLastDeleted] = useState(null); // { widget, index }
  const [renamingId, setRenamingId] = useState(null);

  const [sourceKey, setSourceKey] = useState("actions");
  const [metricKey, setMetricKey] = useState(defaultMetricFor("actions"));
  const [displayType, setDisplayType] = useState("kpi");
  const [title, setTitle] = useState("");

  const [intentKey, setIntentKey] = useState("total_submissions");
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const [selectedFormTemplateId, setSelectedFormTemplateId] = useState("");
  const [selectedFormFieldIds, setSelectedFormFieldIds] = useState([]);
  const [selectedFormXAxisFieldId, setSelectedFormXAxisFieldId] = useState("");

  const [formTemplates, setFormTemplates] = useState([]);
  const [formSubmissions, setFormSubmissions] = useState([]);
  const [formSubmissionsTotal, setFormSubmissionsTotal] = useState(0);
  const [formsLoaded, setFormsLoaded] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  // Load Forms data lazily (only when user actually uses Forms source).
  useEffect(() => {
    const needsForms =
      sourceKey === "forms" ||
      widgets.some((w) => w.sourceKey === "forms") ||
      metricKey?.startsWith?.("form_");
    if (!needsForms || formsLoaded) return;

    let cancelled = false;
    const loadForms = async () => {
      try {
        const [templatesRes, submissionsRes] = await Promise.all([
          formAPI.getTemplates({}),
          // Backend enforces a strict cap anyway; avoid requesting huge limits.
          formAPI.getSubmissions({ limit: 50 }),
        ]);
        if (cancelled) return;
        setFormTemplates(Array.isArray(templatesRes?.templates) ? templatesRes.templates : []);
        const subs = Array.isArray(submissionsRes?.submissions) ? submissionsRes.submissions : [];
        setFormSubmissions(subs);
        setFormSubmissionsTotal(typeof submissionsRes?.total === "number" ? submissionsRes.total : subs.length);
        setFormsLoaded(true);
      } catch {
        if (cancelled) return;
        setFormTemplates([]);
        setFormSubmissions([]);
        setFormSubmissionsTotal(0);
        setFormsLoaded(true);
      }
    };

    loadForms();
    return () => {
      cancelled = true;
    };
  }, [formsLoaded, metricKey, sourceKey, widgets]);

  // Smart defaults when source changes
  useEffect(() => {
    const m = defaultMetricFor(sourceKey);
    setMetricKey(m);
    const def = metricDef(sourceKey, m);
    if (def?.defaultDisplay) setDisplayType(def.defaultDisplay);
    setTitle("");

    if (sourceKey !== "forms") {
      setSelectedFormTemplateId("");
      setSelectedFormFieldIds([]);
      setSelectedFormXAxisFieldId("");
    }
  }, [sourceKey]);

  // Keep x-axis field valid when fields change
  useEffect(() => {
    if (sourceKey !== "forms") return;
    if (!selectedFormFieldIds.length) {
      setSelectedFormXAxisFieldId("");
      return;
    }
    if (!selectedFormXAxisFieldId || !selectedFormFieldIds.includes(selectedFormXAxisFieldId)) {
      setSelectedFormXAxisFieldId(selectedFormFieldIds[0]);
    }
  }, [sourceKey, selectedFormFieldIds, selectedFormXAxisFieldId]);

  // Smart defaults when metric changes
  useEffect(() => {
    const def = metricDef(sourceKey, metricKey);
    if (def?.defaultDisplay) setDisplayType(def.defaultDisplay);
  }, [sourceKey, metricKey]);

  const mostUsedFormTemplateId = useMemo(() => {
    const subs = formSubmissions || [];
    const by = countBy(subs, (s) => s?.form_template_id || s?.template_id || s?.templateId || "");
    let best = "";
    let bestCount = 0;
    for (const [k, v] of by.entries()) {
      if (!k) continue;
      if (v > bestCount) {
        best = k;
        bestCount = v;
      }
    }
    return best || "";
  }, [formSubmissions]);

  const applyIntent = (nextIntentKey) => {
    setIntentKey(nextIntentKey);
    setSourceKey("forms");
    setTitle("");
    if (nextIntentKey === "total_submissions") {
      setMetricKey("form_submissions_total");
      setDisplayType("kpi");
      setSelectedFormTemplateId("");
    } else if (nextIntentKey === "issues_warnings") {
      setMetricKey("form_submissions_issues");
      setDisplayType("bar");
      setSelectedFormTemplateId("");
    } else if (nextIntentKey === "submissions_by_form") {
      setMetricKey("form_submissions_by_form");
      setDisplayType("bar");
      setSelectedFormTemplateId("");
    } else if (nextIntentKey === "trends_over_time") {
      setMetricKey("form_submissions_trend");
      setDisplayType("line");
      // Auto-select a template if available so the chart looks meaningful
      setSelectedFormTemplateId(mostUsedFormTemplateId || "");
    }
  };

  const applyTemplatePreset = (preset) => {
    const ik = preset?.intentKey || "total_submissions";
    applyIntent(ik);
    if (preset?.displayType) setDisplayType(preset.displayType);
    setCustomizeOpen(false);
  };

  const data = useMemo(
    () => ({ actions, observations, investigations, users, formTemplates, formSubmissions, formSubmissionsTotal }),
    [actions, observations, investigations, users, formTemplates, formSubmissions, formSubmissionsTotal]
  );
  const previewRaw = useMemo(
    () =>
      computePreview(
        {
          sourceKey,
          metricKey,
          displayType,
          title,
          formTemplateId: selectedFormTemplateId,
          formFieldIds: selectedFormFieldIds,
          xAxisFieldId: selectedFormXAxisFieldId,
        },
        data
      ),
    [
      sourceKey,
      metricKey,
      displayType,
      title,
      selectedFormTemplateId,
      selectedFormFieldIds,
      selectedFormXAxisFieldId,
      data,
    ]
  );
  const preview = useMemo(
    () =>
      withMockPreview(previewRaw, {
        intentKey,
        sourceKey,
        metricKey,
        displayType,
      }),
    [previewRaw, intentKey, sourceKey, metricKey, displayType]
  );

  const recommendations = useMemo(() => (METRICS[sourceKey] || []).slice(0, 4), [sourceKey]);

  const saveWidget = () => {
    setWidgets((prev) => [
      {
        id: uid(),
        createdAt: Date.now(),
        sourceKey,
        metricKey,
        displayType,
        title: title?.trim() || metricDef(sourceKey, metricKey)?.label || "Widget",
        size: "normal",
        formTemplateId: sourceKey === "forms" ? selectedFormTemplateId : "",
        formFieldIds: sourceKey === "forms" ? selectedFormFieldIds : [],
        xAxisFieldId: sourceKey === "forms" ? selectedFormXAxisFieldId : "",
      },
      ...prev,
    ]);
    setOpen(false);
  };

  const duplicateWidget = (w) => {
    setWidgets((prev) => [
      { ...w, id: uid(), createdAt: Date.now(), title: `${w.title || "Widget"} (copy)` },
      ...prev,
    ]);
  };

  const deleteWidget = (id) => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx === -1) return prev;
      setLastDeleted({ widget: prev[idx], index: idx });
      return prev.filter((w) => w.id !== id);
    });
  };

  const undoDelete = () => {
    if (!lastDeleted?.widget) return;
    setWidgets((prev) => {
      const copy = [...prev];
      const idx = Math.max(0, Math.min(lastDeleted.index ?? 0, copy.length));
      copy.splice(idx, 0, lastDeleted.widget);
      return copy;
    });
    setLastDeleted(null);
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgets((prev) => {
      const oldIndex = prev.findIndex((w) => w.id === active.id);
      const newIndex = prev.findIndex((w) => w.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const updateTitle = (id, nextTitle) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, title: nextTitle } : w)));
  };

  const toggleSize = (id) => {
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const next = w.size === "wide" ? "normal" : "wide";
        return { ...w, size: next };
      })
    );
  };

  return (
    <div className="space-y-4" data-testid="smart-dashboard-builder">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-slate-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Smart Dashboard Builder</h2>
              <p className="text-xs text-slate-500 truncate">Build a widget in under 60 seconds. No technical setup.</p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => {
            setCustomizeOpen(false);
            applyIntent("total_submissions");
            setOpen(true);
          }}
          className="gap-2"
          data-testid="add-widget"
        >
          <Plus className="w-4 h-4" /> Add widget
        </Button>
      </div>

      {widgets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <p className="text-base font-semibold text-slate-900">Build your first dashboard</p>
          <p className="text-sm text-slate-500 mt-1">Add a KPI card or chart in seconds.</p>
          <div className="mt-4">
            <Button
              onClick={() => {
                setCustomizeOpen(false);
                applyIntent("total_submissions");
                setOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="w-4 h-4" /> Add widget
            </Button>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {widgets.map((w) => (
                <SortableWidgetCard
                  key={w.id}
                  id={w.id}
                  widget={w}
                  data={data}
                  renaming={renamingId === w.id}
                  onStartRename={() => setRenamingId(w.id)}
                  onStopRename={() => setRenamingId(null)}
                  onUpdateTitle={(next) => updateTitle(w.id, next)}
                  onDuplicate={() => duplicateWidget(w)}
                  onDelete={() => deleteWidget(w.id)}
                  onToggleSize={() => toggleSize(w.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {lastDeleted?.widget && (
        <div className="bg-slate-900 text-white rounded-xl px-4 py-3 flex items-center gap-3" data-testid="undo-banner">
          <span className="text-sm flex-1 min-w-0 truncate">
            Deleted “{lastDeleted.widget.title || "Widget"}”.
          </span>
          <Button variant="secondary" size="sm" onClick={undoDelete} data-testid="undo-delete">
            Undo
          </Button>
          <button
            type="button"
            onClick={() => setLastDeleted(null)}
            className="text-white/70 hover:text-white text-sm px-2"
            aria-label="Dismiss undo"
          >
            ×
          </button>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (v) {
            setCustomizeOpen(false);
            applyIntent("total_submissions");
          }
          setOpen(v);
        }}
      >
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Build a widget</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Builder steps */}
            <div className="space-y-4">
              {/* Templates */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Start from template</p>
                <div className="grid grid-cols-2 gap-2">
                  {BUILDER_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => applyTemplatePreset(tpl.preset)}
                      className="text-left bg-white border border-slate-200 rounded-xl p-3 hover:border-indigo-300 hover:shadow-sm transition-all"
                      data-testid={`tpl-${tpl.key}`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{tpl.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{tpl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 1: Intent */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">What do you want to track?</p>
                <div className="grid grid-cols-2 gap-2">
                  {INTENTS.map((it) => {
                    const selected = intentKey === it.key;
                    const Icon = it.icon || Layers;
                    return (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => applyIntent(it.key)}
                        className={`text-left rounded-xl border p-3 transition-all ${
                          selected
                            ? "bg-indigo-50 border-indigo-300 shadow-sm"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                        }`}
                        data-testid={`intent-${it.key}`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              selected ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-700"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 leading-tight">{it.label}</p>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{it.desc}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Visualization */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">How should it look?</p>
                <div className="grid grid-cols-2 gap-2">
                  {VISUALS.map((v) => {
                    const selected = displayType === v.key;
                    const Icon = v.icon || BarChart3;
                    return (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => setDisplayType(v.key)}
                        className={`text-left rounded-xl border p-3 transition-all ${
                          selected
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                        }`}
                        data-testid={`viz-${v.key}`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              selected ? "bg-white/10 text-white" : "bg-slate-50 text-slate-700"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold leading-tight ${selected ? "text-white" : "text-slate-900"}`}>
                              {v.label}
                            </p>
                            <p className={`text-xs mt-0.5 line-clamp-2 ${selected ? "text-slate-200" : "text-slate-500"}`}>
                              {v.desc}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customize */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setCustomizeOpen((p) => !p)}
                  className="w-full px-3 py-2 flex items-center justify-between text-left"
                  data-testid="customize-toggle"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-900">Customize</span>
                    <span className="text-xs text-slate-500">(optional)</span>
                  </div>
                  <span className="text-xs text-slate-500">{customizeOpen ? "Hide" : "Show"}</span>
                </button>
                {customizeOpen && (
                  <div className="px-3 pb-3 space-y-3">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-900">Form</p>
                      <Select
                        value={selectedFormTemplateId}
                        onValueChange={(v) => {
                          setSelectedFormTemplateId(v);
                          setSelectedFormFieldIds([]);
                          setSelectedFormXAxisFieldId("");
                          if (metricKey === "form_submissions_total") setMetricKey("form_field_value_distribution");
                        }}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder={formTemplates.length ? "Select a form" : "Loading forms…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {formTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name || t.title || t.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-900">Break it down by</p>
                      <div className="bg-white border border-slate-200 rounded-xl p-3 max-h-44 overflow-auto">
                        {selectedFormTemplateId ? (
                          (formTemplates.find((t) => t.id === selectedFormTemplateId)?.fields || []).length > 0 ? (
                            <div className="space-y-2">
                              {(formTemplates.find((t) => t.id === selectedFormTemplateId)?.fields || []).map((f) => {
                                const checked = selectedFormFieldIds.includes(f.id);
                                return (
                                  <label key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(next) => {
                                        const willCheck = !!next;
                                        setSelectedFormFieldIds((prev) => {
                                          const set = new Set(prev || []);
                                          if (willCheck) set.add(f.id);
                                          else set.delete(f.id);
                                          return Array.from(set);
                                        });
                                        setMetricKey("form_field_value_distribution");
                                        if (displayType === "kpi") setDisplayType("bar");
                                      }}
                                    />
                                    <span className="truncate" title={f.label || f.id}>
                                      {f.label || f.id}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500">This form has no fields.</div>
                          )
                        ) : (
                          <div className="text-xs text-slate-500">Select a form to choose fields.</div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-500">
                          Selected: <span className="font-medium text-slate-700">{selectedFormFieldIds.length}</span>
                        </div>
                        {selectedFormFieldIds.length > 0 && (
                          <button
                            type="button"
                            className="text-xs text-slate-600 hover:text-slate-900 underline"
                            onClick={() => {
                              setSelectedFormFieldIds([]);
                              setSelectedFormXAxisFieldId("");
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-900">Group by</p>
                      <Select
                        value={selectedFormXAxisFieldId}
                        onValueChange={(v) => {
                          setSelectedFormXAxisFieldId(v);
                          setMetricKey("form_field_value_distribution");
                          if (displayType === "kpi") setDisplayType("bar");
                        }}
                        disabled={selectedFormFieldIds.length === 0}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder={selectedFormFieldIds.length ? "Select a field" : "Select fields first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(formTemplates.find((t) => t.id === selectedFormTemplateId)?.fields || [])
                            .filter((f) => selectedFormFieldIds.includes(f.id))
                            .map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.label || f.id}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">Choose how to group the results.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button onClick={saveWidget} data-testid="save-widget">
                  Add to dashboard
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <div className="ml-auto text-xs text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Live preview updates instantly
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{preview.title}</p>
                  <p className="text-xs text-slate-500">{preview.why}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-white">
                    {SOURCES.find((s) => s.key === sourceKey)?.label}
                  </Badge>
                </div>
              </div>
              <div className="p-4">
                {preview.kind === "kpi" ? (
                  <ReportKPICard label={preview.title} value={preview.value ?? 0} unit="" detail="KPI preview" />
                ) : preview.kind === "line" ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 h-[320px]">
                    <div className="text-xs text-slate-500 flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4" /> Preview trend
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={preview.series || []} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<ReportChartTooltip />} />
                        <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : preview.kind === "table" ? (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                      <span className="truncate">{preview?.xAxisLabel ? `X-axis: ${preview.xAxisLabel}` : "Table"}</span>
                      <span className="tabular-nums">{(preview.series || []).length} rows</span>
                    </div>
                    <div className="max-h-[320px] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">Value</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-700">Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(preview.series || []).map((row) => (
                            <tr key={row.label} className="border-b border-slate-100 last:border-b-0">
                              <td className="px-3 py-2 text-slate-700">{row.label}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{row.value}</td>
                            </tr>
                          ))}
                          {(preview.series || []).length === 0 && (
                            <tr>
                              <td colSpan={2} className="px-3 py-6 text-center text-xs text-slate-500">
                                No data yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 h-[320px]">
                    <div className="text-xs text-slate-500 flex items-center gap-2 mb-2">
                      <BarChart3 className="w-4 h-4" /> Preview chart
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={preview.series || []} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="label" width={120} />
                        <Tooltip content={<ReportChartTooltip />} />
                        <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 4, 4]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

