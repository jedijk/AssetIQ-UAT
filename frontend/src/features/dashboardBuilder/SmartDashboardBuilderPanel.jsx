import React, { useEffect, useMemo, useState, useCallback } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BarChart3, GripVertical, Hash, Plus, Sparkles, Trash2, Copy, Pencil, Maximize2, Minimize2,
  Table2, TrendingUp, Layers, AlertTriangle, FileText, Eye, Search, ClipboardList,
  CheckCircle2, Clock, Users, Calendar, Filter, ChevronRight, ChevronDown, Settings2,
  PieChart, Activity, Target, AlertCircle, XCircle, Info
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, PieChart as RechartsPieChart, Pie, Cell } from "recharts";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { formAPI } from "../../components/forms/formAPI";
import { Checkbox } from "../../components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";

const STORAGE_KEY = "assetiq_smart_dashboard_widgets_v2";

const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

const fmt1 = (v) => (typeof v === "number" ? v.toFixed(1) : v);

function uid() {
  return `w_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function lc(v) {
  return String(v || "").toLowerCase();
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

// Status helpers
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
    const k = keyFn(it) || "Unknown";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

// Data source definitions
const DATA_SOURCES = [
  {
    key: "actions",
    label: "Actions",
    icon: CheckCircle2,
    color: "bg-emerald-100 text-emerald-700",
    description: "Track action items, assignments and due dates",
  },
  {
    key: "observations",
    label: "Observations",
    icon: Eye,
    color: "bg-amber-100 text-amber-700",
    description: "Monitor safety observations and findings",
  },
  {
    key: "investigations",
    label: "Investigations",
    icon: Search,
    color: "bg-blue-100 text-blue-700",
    description: "Track incident investigations and root causes",
  },
  {
    key: "forms",
    label: "Forms",
    icon: FileText,
    color: "bg-purple-100 text-purple-700",
    description: "Analyze form submissions and field data",
  },
];

// Metrics per source
const METRICS = {
  actions: [
    { key: "total", label: "Total actions", defaultDisplay: "kpi", icon: Hash },
    { key: "open", label: "Open actions", defaultDisplay: "kpi", icon: Clock },
    { key: "closed", label: "Closed actions", defaultDisplay: "kpi", icon: CheckCircle2 },
    { key: "overdue", label: "Overdue actions", defaultDisplay: "kpi", icon: AlertTriangle },
    { key: "by_status", label: "Actions by status", defaultDisplay: "pie", icon: PieChart },
    { key: "by_priority", label: "Actions by priority", defaultDisplay: "bar", icon: BarChart3 },
    { key: "by_assignee", label: "Actions by assignee", defaultDisplay: "bar", icon: Users },
    { key: "by_category", label: "Actions by category", defaultDisplay: "bar", icon: Layers },
    { key: "overdue_by_owner", label: "Overdue by owner", defaultDisplay: "bar", icon: AlertTriangle },
    { key: "trend", label: "Actions over time", defaultDisplay: "line", icon: TrendingUp },
    { key: "completion_rate", label: "Completion rate", defaultDisplay: "kpi", icon: Target },
    { key: "table_all", label: "Actions table", defaultDisplay: "table", icon: Table2 },
  ],
  observations: [
    { key: "total", label: "Total observations", defaultDisplay: "kpi", icon: Hash },
    { key: "open", label: "Open observations", defaultDisplay: "kpi", icon: Clock },
    { key: "by_status", label: "By status", defaultDisplay: "pie", icon: PieChart },
    { key: "by_severity", label: "By severity", defaultDisplay: "bar", icon: AlertTriangle },
    { key: "by_type", label: "By type", defaultDisplay: "bar", icon: Layers },
    { key: "by_location", label: "By location", defaultDisplay: "bar", icon: Target },
    { key: "by_reporter", label: "By reporter", defaultDisplay: "bar", icon: Users },
    { key: "trend", label: "Observations over time", defaultDisplay: "line", icon: TrendingUp },
    { key: "table_all", label: "Observations table", defaultDisplay: "table", icon: Table2 },
  ],
  investigations: [
    { key: "total", label: "Total investigations", defaultDisplay: "kpi", icon: Hash },
    { key: "open", label: "Open investigations", defaultDisplay: "kpi", icon: Clock },
    { key: "by_status", label: "By status", defaultDisplay: "pie", icon: PieChart },
    { key: "by_type", label: "By type", defaultDisplay: "bar", icon: Layers },
    { key: "by_severity", label: "By severity", defaultDisplay: "bar", icon: AlertTriangle },
    { key: "by_investigator", label: "By investigator", defaultDisplay: "bar", icon: Users },
    { key: "trend", label: "Investigations over time", defaultDisplay: "line", icon: TrendingUp },
    { key: "avg_duration", label: "Avg. resolution time", defaultDisplay: "kpi", icon: Clock },
    { key: "table_all", label: "Investigations table", defaultDisplay: "table", icon: Table2 },
  ],
  forms: [
    { key: "total", label: "Total submissions", defaultDisplay: "kpi", icon: Hash },
    { key: "with_warnings", label: "With warnings", defaultDisplay: "kpi", icon: AlertTriangle },
    { key: "with_critical", label: "With critical issues", defaultDisplay: "kpi", icon: XCircle },
    { key: "by_form", label: "By form template", defaultDisplay: "bar", icon: FileText },
    { key: "by_submitter", label: "By submitter", defaultDisplay: "bar", icon: Users },
    { key: "issues_breakdown", label: "Issues breakdown", defaultDisplay: "pie", icon: PieChart },
    { key: "trend", label: "Submissions over time", defaultDisplay: "line", icon: TrendingUp },
    { key: "field_distribution", label: "Field value distribution", defaultDisplay: "bar", icon: BarChart3 },
    { key: "table_all", label: "Submissions table", defaultDisplay: "table", icon: Table2 },
  ],
};

const DISPLAY_TYPES = [
  { key: "kpi", label: "KPI Card", icon: Hash, description: "Single metric value" },
  { key: "bar", label: "Bar Chart", icon: BarChart3, description: "Compare categories" },
  { key: "line", label: "Line Chart", icon: TrendingUp, description: "Show trends over time" },
  { key: "pie", label: "Pie Chart", icon: PieChart, description: "Show proportions" },
  { key: "table", label: "Data Table", icon: Table2, description: "Detailed list view" },
];

// Quick templates for common dashboards
const QUICK_TEMPLATES = [
  {
    key: "safety_overview",
    label: "Safety Overview",
    description: "Key safety metrics at a glance",
    icon: AlertTriangle,
    widgets: [
      { sourceKey: "observations", metricKey: "open", displayType: "kpi", title: "Open Observations" },
      { sourceKey: "actions", metricKey: "overdue", displayType: "kpi", title: "Overdue Actions" },
      { sourceKey: "observations", metricKey: "by_severity", displayType: "bar", title: "Observations by Severity" },
      { sourceKey: "actions", metricKey: "by_status", displayType: "pie", title: "Action Status" },
    ],
  },
  {
    key: "action_tracker",
    label: "Action Tracker",
    description: "Monitor action completion and ownership",
    icon: CheckCircle2,
    widgets: [
      { sourceKey: "actions", metricKey: "open", displayType: "kpi", title: "Open Actions" },
      { sourceKey: "actions", metricKey: "overdue", displayType: "kpi", title: "Overdue" },
      { sourceKey: "actions", metricKey: "by_assignee", displayType: "bar", title: "By Assignee" },
      { sourceKey: "actions", metricKey: "trend", displayType: "line", title: "Actions Over Time" },
    ],
  },
  {
    key: "form_analytics",
    label: "Form Analytics",
    description: "Form submission trends and issues",
    icon: FileText,
    widgets: [
      { sourceKey: "forms", metricKey: "total", displayType: "kpi", title: "Total Submissions" },
      { sourceKey: "forms", metricKey: "with_warnings", displayType: "kpi", title: "With Warnings" },
      { sourceKey: "forms", metricKey: "by_form", displayType: "bar", title: "By Form Type" },
      { sourceKey: "forms", metricKey: "trend", displayType: "line", title: "Submission Trend" },
    ],
  },
  {
    key: "investigation_dashboard",
    label: "Investigation Dashboard",
    description: "Track investigations and root causes",
    icon: Search,
    widgets: [
      { sourceKey: "investigations", metricKey: "open", displayType: "kpi", title: "Open Investigations" },
      { sourceKey: "investigations", metricKey: "by_status", displayType: "pie", title: "By Status" },
      { sourceKey: "investigations", metricKey: "by_type", displayType: "bar", title: "By Type" },
      { sourceKey: "investigations", metricKey: "trend", displayType: "line", title: "Over Time" },
    ],
  },
];

// Compute widget data
function computeWidgetData(config, data) {
  const { sourceKey, metricKey, displayType, title, formTemplateId, formFieldId } = config;
  const { actions = [], observations = [], investigations = [], users = [], formTemplates = [], formSubmissions = [] } = data;
  
  const usersById = new Map(users.map((u) => [u.id, u]));
  const templateById = new Map(formTemplates.map((t) => [t.id, t]));
  const getUserName = (id) => usersById.get(id)?.name || usersById.get(id)?.email || id || "Unknown";
  const getFormName = (id) => templateById.get(id)?.name || templateById.get(id)?.title || id || "Unknown";
  
  const metricDef = METRICS[sourceKey]?.find((m) => m.key === metricKey);
  const widgetTitle = title || metricDef?.label || "Widget";

  // Helper to get date key
  const getDateKey = (item) => {
    const raw = item?.created_at || item?.createdAt || item?.submitted_at || item?.submittedAt || "";
    const d = new Date(raw);
    return isNaN(d) ? "" : d.toISOString().slice(0, 10);
  };

  // Actions metrics
  if (sourceKey === "actions") {
    const openActions = actions.filter((a) => !isActionClosed(a));
    const closedActions = actions.filter((a) => isActionClosed(a));
    const overdueActions = actions.filter(isActionOverdue);

    switch (metricKey) {
      case "total":
        return { kind: "kpi", title: widgetTitle, value: actions.length };
      case "open":
        return { kind: "kpi", title: widgetTitle, value: openActions.length };
      case "closed":
        return { kind: "kpi", title: widgetTitle, value: closedActions.length };
      case "overdue":
        return { kind: "kpi", title: widgetTitle, value: overdueActions.length, alert: overdueActions.length > 0 };
      case "completion_rate":
        const rate = actions.length > 0 ? Math.round((closedActions.length / actions.length) * 100) : 0;
        return { kind: "kpi", title: widgetTitle, value: rate, unit: "%" };
      case "by_status":
        const statusCounts = countBy(actions, (a) => a?.status || "Unknown");
        return { kind: displayType, title: widgetTitle, series: Array.from(statusCounts.entries()).map(([label, value]) => ({ label, value })) };
      case "by_priority":
        const priorityCounts = countBy(actions, (a) => a?.priority || "Normal");
        return { kind: displayType, title: widgetTitle, series: Array.from(priorityCounts.entries()).map(([label, value]) => ({ label, value })) };
      case "by_assignee":
        const assigneeCounts = countBy(actions, (a) => getUserName(a?.assignee || a?.owner_id || a?.assigned_to));
        return { kind: displayType, title: widgetTitle, series: Array.from(assigneeCounts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10) };
      case "by_category":
        const catCounts = countBy(actions, (a) => a?.category || a?.type || "Uncategorized");
        return { kind: displayType, title: widgetTitle, series: Array.from(catCounts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10) };
      case "overdue_by_owner":
        const overdueCounts = countBy(overdueActions, (a) => getUserName(a?.assignee || a?.owner_id));
        return { kind: displayType, title: widgetTitle, series: Array.from(overdueCounts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10) };
      case "trend":
        const actionsByDay = countBy(actions, getDateKey);
        const trendData = Array.from(actionsByDay.entries())
          .filter(([k]) => k)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => a.label.localeCompare(b.label))
          .slice(-14);
        return { kind: "line", title: widgetTitle, series: trendData };
      case "table_all":
        const tableData = actions.slice(0, 20).map((a) => ({
          id: a.id,
          title: a.title || a.name || a.description?.slice(0, 50) || "Untitled",
          status: a.status || "Unknown",
          assignee: getUserName(a?.assignee || a?.owner_id),
          due: a.due_date || a.dueDate || "-",
          priority: a.priority || "Normal",
        }));
        return { kind: "table", title: widgetTitle, columns: ["Title", "Status", "Assignee", "Due", "Priority"], rows: tableData };
      default:
        return { kind: "kpi", title: widgetTitle, value: 0 };
    }
  }

  // Observations metrics
  if (sourceKey === "observations") {
    const openObs = observations.filter((o) => lc(o?.status) === "open");

    switch (metricKey) {
      case "total":
        return { kind: "kpi", title: widgetTitle, value: observations.length };
      case "open":
        return { kind: "kpi", title: widgetTitle, value: openObs.length };
      case "by_status":
        const statusCounts = countBy(observations, (o) => o?.status || "Unknown");
        return { kind: displayType, title: widgetTitle, series: Array.from(statusCounts.entries()).map(([label, value]) => ({ label, value })) };
      case "by_severity":
        const sevCounts = countBy(observations, (o) => o?.severity || o?.risk_level || "Unknown");
        return { kind: displayType, title: widgetTitle, series: Array.from(sevCounts.entries()).map(([label, value]) => ({ label, value })) };
      case "by_type":
        const typeCounts = countBy(observations, (o) => o?.type || o?.category || "Unknown");
        return { kind: displayType, title: widgetTitle, series: Array.from(typeCounts.entries()).map(([label, value]) => ({ label, value })).slice(0, 10) };
      case "by_location":
        const locCounts = countBy(observations, (o) => o?.location || o?.area || "Unknown");
        return { kind: displayType, title: widgetTitle, series: Array.from(locCounts.entries()).map(([label, value]) => ({ label, value })).slice(0, 10) };
      case "by_reporter":
        const repCounts = countBy(observations, (o) => getUserName(o?.reporter_id || o?.created_by));
        return { kind: displayType, title: widgetTitle, series: Array.from(repCounts.entries()).map(([label, value]) => ({ label, value })).slice(0, 10) };
      case "trend":
        const obsByDay = countBy(observations, getDateKey);
        return { kind: "line", title: widgetTitle, series: Array.from(obsByDay.entries()).filter(([k]) => k).map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)).slice(-14) };
      case "table_all":
        const tableData = observations.slice(0, 20).map((o) => ({
          id: o.id,
          description: o.description?.slice(0, 50) || o.title || "Untitled",
          status: o.status || "Unknown",
          severity: o.severity || o.risk_level || "-",
          location: o.location || o.area || "-",
          date: o.created_at?.slice(0, 10) || "-",
        }));
        return { kind: "table", title: widgetTitle, columns: ["Description", "Status", "Severity", "Location", "Date"], rows: tableData };
      default:
        return { kind: "kpi", title: widgetTitle, value: 0 };
    }
  }

  // Investigations metrics
  if (sourceKey === "investigations") {
    const openInv = investigations.filter((i) => !["completed", "closed"].includes(lc(i?.status)));

    switch (metricKey) {
      case "total":
        return { kind: "kpi", title: widgetTitle, value: investigations.length };
      case "open":
        return { kind: "kpi", title: widgetTitle, value: openInv.length };
      case "by_status":
        const statusCounts = countBy(investigations, (i) => i?.status || "Unknown");
        return { kind: displayType, title: widgetTitle, series: Array.from(statusCounts.entries()).map(([label, value]) => ({ label, value })) };
      case "by_type":
        const typeCounts = countBy(investigations, (i) => i?.type || i?.category || "Unknown");
        return { kind: displayType, title: widgetTitle, series: Array.from(typeCounts.entries()).map(([label, value]) => ({ label, value })).slice(0, 10) };
      case "by_severity":
        const sevCounts = countBy(investigations, (i) => i?.severity || i?.priority || "Unknown");
        return { kind: displayType, title: widgetTitle, series: Array.from(sevCounts.entries()).map(([label, value]) => ({ label, value })) };
      case "by_investigator":
        const invCounts = countBy(investigations, (i) => getUserName(i?.investigator_id || i?.assigned_to || i?.owner_id));
        return { kind: displayType, title: widgetTitle, series: Array.from(invCounts.entries()).map(([label, value]) => ({ label, value })).slice(0, 10) };
      case "trend":
        const invByDay = countBy(investigations, getDateKey);
        return { kind: "line", title: widgetTitle, series: Array.from(invByDay.entries()).filter(([k]) => k).map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)).slice(-14) };
      case "avg_duration":
        // Calculate average duration for closed investigations
        const closedInv = investigations.filter((i) => ["completed", "closed"].includes(lc(i?.status)));
        let totalDays = 0;
        let counted = 0;
        closedInv.forEach((i) => {
          const start = new Date(i?.created_at || i?.createdAt);
          const end = new Date(i?.completed_at || i?.closed_at || i?.updated_at);
          if (!isNaN(start) && !isNaN(end)) {
            totalDays += (end - start) / (1000 * 60 * 60 * 24);
            counted++;
          }
        });
        const avgDays = counted > 0 ? Math.round(totalDays / counted) : 0;
        return { kind: "kpi", title: widgetTitle, value: avgDays, unit: "days" };
      case "table_all":
        const tableData = investigations.slice(0, 20).map((i) => ({
          id: i.id,
          title: i.title || i.description?.slice(0, 50) || "Untitled",
          status: i.status || "Unknown",
          type: i.type || i.category || "-",
          investigator: getUserName(i?.investigator_id || i?.assigned_to),
          date: i.created_at?.slice(0, 10) || "-",
        }));
        return { kind: "table", title: widgetTitle, columns: ["Title", "Status", "Type", "Investigator", "Date"], rows: tableData };
      default:
        return { kind: "kpi", title: widgetTitle, value: 0 };
    }
  }

  // Forms metrics
  if (sourceKey === "forms") {
    const filteredSubs = formTemplateId
      ? formSubmissions.filter((s) => (s?.form_template_id || s?.template_id || s?.templateId) === formTemplateId)
      : formSubmissions;
    const withWarnings = filteredSubs.filter((s) => s?.has_warnings ?? s?.hasWarnings);
    const withCritical = filteredSubs.filter((s) => s?.has_critical ?? s?.hasCritical);

    switch (metricKey) {
      case "total":
        return { kind: "kpi", title: widgetTitle, value: filteredSubs.length };
      case "with_warnings":
        return { kind: "kpi", title: widgetTitle, value: withWarnings.length, alert: withWarnings.length > 0 };
      case "with_critical":
        return { kind: "kpi", title: widgetTitle, value: withCritical.length, alert: withCritical.length > 0 };
      case "by_form":
        const formCounts = countBy(formSubmissions, (s) => getFormName(s?.form_template_id || s?.template_id || s?.templateId));
        return { kind: displayType, title: widgetTitle, series: Array.from(formCounts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10) };
      case "by_submitter":
        const subCounts = countBy(filteredSubs, (s) => getUserName(s?.submitted_by || s?.user_id || s?.created_by));
        return { kind: displayType, title: widgetTitle, series: Array.from(subCounts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10) };
      case "issues_breakdown":
        return { kind: displayType, title: widgetTitle, series: [
          { label: "OK", value: filteredSubs.length - withWarnings.length - withCritical.length },
          { label: "Warnings", value: withWarnings.length },
          { label: "Critical", value: withCritical.length },
        ].filter((s) => s.value > 0) };
      case "trend":
        const subsByDay = countBy(filteredSubs, getDateKey);
        return { kind: "line", title: widgetTitle, series: Array.from(subsByDay.entries()).filter(([k]) => k).map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)).slice(-14) };
      case "field_distribution":
        if (!formFieldId || !formTemplateId) {
          return { kind: displayType, title: widgetTitle, series: [], hint: "Select a form and field to see distribution" };
        }
        const fieldCounts = new Map();
        filteredSubs.forEach((s) => {
          const responses = s?.values || s?.responses || [];
          responses.forEach((r) => {
            const fid = r?.field_id || r?.fieldId || r?.id;
            if (fid !== formFieldId) return;
            const val = Array.isArray(r?.value) ? r.value.join(", ") : String(r?.value ?? r?.answer ?? "").trim();
            if (val) fieldCounts.set(val, (fieldCounts.get(val) || 0) + 1);
          });
        });
        return { kind: displayType, title: widgetTitle, series: Array.from(fieldCounts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10) };
      case "table_all":
        const tableData = filteredSubs.slice(0, 20).map((s) => ({
          id: s.id,
          form: getFormName(s?.form_template_id || s?.template_id || s?.templateId),
          submitter: getUserName(s?.submitted_by || s?.user_id),
          date: (s?.submitted_at || s?.created_at)?.slice(0, 10) || "-",
          status: (s?.has_critical ?? s?.hasCritical) ? "Critical" : (s?.has_warnings ?? s?.hasWarnings) ? "Warning" : "OK",
        }));
        return { kind: "table", title: widgetTitle, columns: ["Form", "Submitter", "Date", "Status"], rows: tableData };
      default:
        return { kind: "kpi", title: widgetTitle, value: 0 };
    }
  }

  return { kind: "kpi", title: widgetTitle, value: 0 };
}

// Add mock data for preview when no real data
function withMockData(result, config) {
  if (result.kind === "kpi" && result.value === 0 && !result.hint) {
    return { ...result, value: Math.floor(Math.random() * 50) + 10, isMock: true };
  }
  if ((result.kind === "bar" || result.kind === "pie" || result.kind === "line") && (!result.series || result.series.length === 0) && !result.hint) {
    if (result.kind === "line") {
      return {
        ...result,
        isMock: true,
        series: Array.from({ length: 7 }).map((_, i) => ({
          label: `Day ${i + 1}`,
          value: Math.floor(Math.random() * 20) + 5,
        })),
      };
    }
    return {
      ...result,
      isMock: true,
      series: [
        { label: "Category A", value: 12 },
        { label: "Category B", value: 8 },
        { label: "Category C", value: 5 },
      ],
    };
  }
  return result;
}

// Chart tooltip
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
          <span className="text-slate-600">{entry.name || "Value"}:</span>
          <span className="font-medium text-slate-800">{fmt1(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Widget renderer
function WidgetContent({ data, size }) {
  const isWide = size === "wide";
  const height = isWide ? 280 : 220;

  if (data.hint) {
    return (
      <div className="h-[180px] flex items-center justify-center text-sm text-slate-500 bg-slate-50 rounded-xl">
        <div className="text-center px-4">
          <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          {data.hint}
        </div>
      </div>
    );
  }

  if (data.kind === "kpi") {
    return (
      <div className={`flex items-center gap-4 p-4 ${data.alert ? "bg-red-50" : "bg-slate-50"} rounded-xl`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${data.alert ? "bg-red-100" : "bg-white border border-slate-200"}`}>
          {data.alert ? <AlertTriangle className="w-6 h-6 text-red-500" /> : <Hash className="w-6 h-6 text-slate-600" />}
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-bold tabular-nums ${data.alert ? "text-red-600" : "text-slate-900"}`}>
              {data.value}
            </span>
            {data.unit && <span className="text-lg text-slate-500">{data.unit}</span>}
          </div>
          {data.isMock && <p className="text-xs text-slate-400 mt-1">Sample data</p>}
        </div>
      </div>
    );
  }

  if (data.kind === "pie") {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={data.series}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={isWide ? 90 : 70}
              label={({ label, percent }) => `${label} (${(percent * 100).toFixed(0)}%)`}
              labelLine={false}
            >
              {data.series.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </RechartsPieChart>
        </ResponsiveContainer>
        {data.isMock && <p className="text-xs text-slate-400 text-center">Sample data</p>}
      </div>
    );
  }

  if (data.kind === "line") {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} dot={{ fill: "#4f46e5", r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        {data.isMock && <p className="text-xs text-slate-400 text-center mt-1">Sample data</p>}
      </div>
    );
  }

  if (data.kind === "table") {
    const columns = data.columns || ["Label", "Value"];
    const rows = data.rows || [];
    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="max-h-[280px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr>
                {columns.map((col, i) => (
                  <th key={i} className="text-left px-3 py-2 text-xs font-semibold text-slate-700">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                    No data available
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.id || idx} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    {Object.entries(row).filter(([k]) => k !== "id").map(([key, val], i) => (
                      <td key={i} className="px-3 py-2 text-slate-700 truncate max-w-[200px]">
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Bar chart (default)
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.series} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
          <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 11 }} stroke="#94a3b8" />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="value" fill="#4f46e5" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {data.isMock && <p className="text-xs text-slate-400 text-center mt-1">Sample data</p>}
    </div>
  );
}

// Sortable widget card
function SortableWidgetCard({ id, widget, computedData, renaming, onStartRename, onStopRename, onUpdateTitle, onDuplicate, onDelete, onToggleSize }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const sourceDef = DATA_SOURCES.find((s) => s.key === widget.sourceKey);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${isDragging ? "ring-2 ring-indigo-300 shadow-lg" : ""} ${widget.size === "wide" ? "lg:col-span-2" : ""}`}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {sourceDef && (
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${sourceDef.color}`}>
                <sourceDef.icon className="w-3.5 h-3.5" />
              </div>
            )}
            {renaming ? (
              <Input
                autoFocus
                value={widget.title || ""}
                onChange={(e) => onUpdateTitle(e.target.value)}
                onBlur={onStopRename}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") onStopRename(); }}
                className="h-7 text-sm font-semibold"
              />
            ) : (
              <button type="button" onClick={onStartRename} className="text-left">
                <p className="text-sm font-semibold text-slate-900 truncate hover:text-indigo-600">
                  {computedData.title}
                </p>
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">{sourceDef?.label} • {METRICS[widget.sourceKey]?.find((m) => m.key === widget.metricKey)?.label}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={onToggleSize} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700" title={widget.size === "wide" ? "Shrink" : "Expand"}>
            {widget.size === "wide" ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button type="button" onClick={onStartRename} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700" title="Rename">
            <Pencil className="w-4 h-4" />
          </button>
          <button type="button" onClick={onDuplicate} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700" title="Duplicate">
            <Copy className="w-4 h-4" />
          </button>
          <button type="button" onClick={onDelete} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-red-500" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing" title="Drag" {...attributes} {...listeners}>
            <GripVertical className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Content */}
      <div className="p-4">
        <WidgetContent data={computedData} size={widget.size} />
      </div>
    </div>
  );
}

// Main component
export function SmartDashboardBuilderPanel({ actions = [], observations = [], investigations = [], users = [] }) {
  const [widgets, setWidgets] = useState(() => safeJsonParse(localStorage.getItem(STORAGE_KEY) || "[]", []));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);

  // Builder state
  const [builderStep, setBuilderStep] = useState(1);
  const [selectedSource, setSelectedSource] = useState("actions");
  const [selectedMetric, setSelectedMetric] = useState("open");
  const [selectedDisplay, setSelectedDisplay] = useState("kpi");
  const [widgetTitle, setWidgetTitle] = useState("");
  const [selectedFormId, setSelectedFormId] = useState("");
  const [selectedFieldId, setSelectedFieldId] = useState("");

  // Form data
  const [formTemplates, setFormTemplates] = useState([]);
  const [formSubmissions, setFormSubmissions] = useState([]);
  const [formsLoaded, setFormsLoaded] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Persist widgets
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  // Load form data when needed
  useEffect(() => {
    const needsForms = selectedSource === "forms" || widgets.some((w) => w.sourceKey === "forms");
    if (!needsForms || formsLoaded) return;

    let cancelled = false;
    const loadForms = async () => {
      try {
        const [templatesRes, submissionsRes] = await Promise.all([
          formAPI.getTemplates({}),
          formAPI.getSubmissions({ limit: 100 }),
        ]);
        if (cancelled) return;
        setFormTemplates(Array.isArray(templatesRes?.templates) ? templatesRes.templates : []);
        setFormSubmissions(Array.isArray(submissionsRes?.submissions) ? submissionsRes.submissions : []);
        setFormsLoaded(true);
      } catch {
        if (cancelled) return;
        setFormTemplates([]);
        setFormSubmissions([]);
        setFormsLoaded(true);
      }
    };
    loadForms();
    return () => { cancelled = true; };
  }, [selectedSource, widgets, formsLoaded]);

  const data = useMemo(
    () => ({ actions, observations, investigations, users, formTemplates, formSubmissions }),
    [actions, observations, investigations, users, formTemplates, formSubmissions]
  );

  // Reset builder when source changes
  useEffect(() => {
    const metrics = METRICS[selectedSource] || [];
    if (metrics.length > 0) {
      setSelectedMetric(metrics[0].key);
      setSelectedDisplay(metrics[0].defaultDisplay);
    }
    setSelectedFormId("");
    setSelectedFieldId("");
    setWidgetTitle("");
  }, [selectedSource]);

  // Update display type when metric changes
  useEffect(() => {
    const metric = METRICS[selectedSource]?.find((m) => m.key === selectedMetric);
    if (metric?.defaultDisplay) {
      setSelectedDisplay(metric.defaultDisplay);
    }
  }, [selectedSource, selectedMetric]);

  const previewConfig = useMemo(() => ({
    sourceKey: selectedSource,
    metricKey: selectedMetric,
    displayType: selectedDisplay,
    title: widgetTitle,
    formTemplateId: selectedFormId === "__all__" ? "" : selectedFormId,
    formFieldId: selectedFieldId,
  }), [selectedSource, selectedMetric, selectedDisplay, widgetTitle, selectedFormId, selectedFieldId]);

  const previewData = useMemo(() => {
    const result = computeWidgetData(previewConfig, data);
    return withMockData(result, previewConfig);
  }, [previewConfig, data]);

  const openBuilder = () => {
    setBuilderStep(1);
    setSelectedSource("actions");
    setSelectedMetric("open");
    setSelectedDisplay("kpi");
    setWidgetTitle("");
    setSelectedFormId("");
    setSelectedFieldId("");
    setDialogOpen(true);
  };

  const saveWidget = () => {
    const metric = METRICS[selectedSource]?.find((m) => m.key === selectedMetric);
    setWidgets((prev) => [
      {
        id: uid(),
        createdAt: Date.now(),
        sourceKey: selectedSource,
        metricKey: selectedMetric,
        displayType: selectedDisplay,
        title: widgetTitle || metric?.label || "Widget",
        size: "normal",
        formTemplateId: selectedFormId === "__all__" ? "" : selectedFormId,
        formFieldId: selectedFieldId,
      },
      ...prev,
    ]);
    setDialogOpen(false);
  };

  const applyQuickTemplate = (template) => {
    const newWidgets = template.widgets.map((w) => ({
      ...w,
      id: uid(),
      createdAt: Date.now(),
      size: "normal",
      formTemplateId: "",
      formFieldId: "",
    }));
    setWidgets((prev) => [...newWidgets, ...prev]);
    setDialogOpen(false);
  };

  const duplicateWidget = (w) => {
    setWidgets((prev) => [{ ...w, id: uid(), createdAt: Date.now(), title: `${w.title} (copy)` }, ...prev]);
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
      copy.splice(Math.min(lastDeleted.index, copy.length), 0, lastDeleted.widget);
      return copy;
    });
    setLastDeleted(null);
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgets((prev) => {
      const oldIdx = prev.findIndex((w) => w.id === active.id);
      const newIdx = prev.findIndex((w) => w.id === over.id);
      return oldIdx === -1 || newIdx === -1 ? prev : arrayMove(prev, oldIdx, newIdx);
    });
  };

  const updateTitle = (id, title) => setWidgets((prev) => prev.map((w) => w.id === id ? { ...w, title } : w));
  const toggleSize = (id) => setWidgets((prev) => prev.map((w) => w.id === id ? { ...w, size: w.size === "wide" ? "normal" : "wide" } : w));

  const selectedFormTemplate = selectedFormId && selectedFormId !== "__all__" 
    ? formTemplates.find((t) => t.id === selectedFormId) 
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Dashboard Builder</h2>
            <p className="text-sm text-slate-500">Create custom widgets from your data</p>
          </div>
        </div>
        <Button onClick={openBuilder} className="gap-2">
          <Plus className="w-4 h-4" /> Add Widget
        </Button>
      </div>

      {/* Empty state */}
      {widgets.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Build your dashboard</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Create KPIs, charts, and tables from your actions, observations, investigations, and forms.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={openBuilder} className="gap-2">
              <Plus className="w-4 h-4" /> Create Widget
            </Button>
          </div>
          
          {/* Quick templates */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-sm font-medium text-slate-700 mb-4">Or start with a template:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.key}
                  onClick={() => applyQuickTemplate(tpl)}
                  className="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  <tpl.icon className="w-5 h-5 text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-900">{tpl.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{tpl.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Widgets grid */}
      {widgets.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {widgets.map((w) => {
                const computed = computeWidgetData(w, data);
                return (
                  <SortableWidgetCard
                    key={w.id}
                    id={w.id}
                    widget={w}
                    computedData={computed}
                    renaming={renamingId === w.id}
                    onStartRename={() => setRenamingId(w.id)}
                    onStopRename={() => setRenamingId(null)}
                    onUpdateTitle={(t) => updateTitle(w.id, t)}
                    onDuplicate={() => duplicateWidget(w)}
                    onDelete={() => deleteWidget(w.id)}
                    onToggleSize={() => toggleSize(w.id)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Undo banner */}
      {lastDeleted && (
        <div className="bg-slate-900 text-white rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-sm flex-1">Deleted "{lastDeleted.widget.title}"</span>
          <Button variant="secondary" size="sm" onClick={undoDelete}>Undo</Button>
          <button onClick={() => setLastDeleted(null)} className="text-white/70 hover:text-white px-2">×</button>
        </div>
      )}

      {/* Builder dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Create Widget
            </DialogTitle>
            <DialogDescription>
              Build a custom KPI, chart, or table from your data
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-1">
              {/* Builder steps */}
              <div className="space-y-6">
                {/* Step 1: Choose data source */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                    <h3 className="text-sm font-semibold text-slate-900">Choose data source</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DATA_SOURCES.map((source) => (
                      <button
                        key={source.key}
                        onClick={() => setSelectedSource(source.key)}
                        className={`text-left p-3 rounded-xl border-2 transition-all ${
                          selectedSource === source.key
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${source.color}`}>
                            <source.icon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{source.label}</p>
                            <p className="text-xs text-slate-500">{source.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Choose metric */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">2</div>
                    <h3 className="text-sm font-semibold text-slate-900">What do you want to see?</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-2">
                    {(METRICS[selectedSource] || []).map((metric) => (
                      <button
                        key={metric.key}
                        onClick={() => setSelectedMetric(metric.key)}
                        className={`text-left p-2.5 rounded-lg border transition-all ${
                          selectedMetric === metric.key
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <metric.icon className={`w-4 h-4 ${selectedMetric === metric.key ? "text-indigo-600" : "text-slate-500"}`} />
                          <span className="text-sm text-slate-700">{metric.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Display type */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <h3 className="text-sm font-semibold text-slate-900">Visualization</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {DISPLAY_TYPES.map((dt) => (
                      <button
                        key={dt.key}
                        onClick={() => setSelectedDisplay(dt.key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                          selectedDisplay === dt.key
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 hover:border-slate-300 text-slate-700"
                        }`}
                      >
                        <dt.icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{dt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Form-specific options */}
                {selectedSource === "forms" && (selectedMetric === "field_distribution" || selectedMetric === "trend") && (
                  <div className="space-y-3 p-3 bg-slate-50 rounded-xl">
                    <p className="text-sm font-medium text-slate-700">Form Options</p>
                    <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a form (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All forms</SelectItem>
                        {formTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name || t.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {selectedMetric === "field_distribution" && selectedFormId && selectedFormTemplate?.fields?.length > 0 && (
                      <Select value={selectedFieldId} onValueChange={setSelectedFieldId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a field" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedFormTemplate.fields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.label || f.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {/* Custom title */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold">4</div>
                    <h3 className="text-sm font-semibold text-slate-900">Custom title (optional)</h3>
                  </div>
                  <Input
                    value={widgetTitle}
                    onChange={(e) => setWidgetTitle(e.target.value)}
                    placeholder={METRICS[selectedSource]?.find((m) => m.key === selectedMetric)?.label || "Widget title"}
                  />
                </div>
              </div>

              {/* Live preview */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Live Preview</h3>
                  <Badge variant="secondary">
                    {DATA_SOURCES.find((s) => s.key === selectedSource)?.label}
                  </Badge>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <p className="text-sm font-semibold text-slate-900">{previewData.title}</p>
                    <p className="text-xs text-slate-500">
                      {METRICS[selectedSource]?.find((m) => m.key === selectedMetric)?.label}
                    </p>
                  </div>
                  <div className="p-4">
                    <WidgetContent data={previewData} size="normal" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveWidget} className="gap-2">
              <Plus className="w-4 h-4" /> Add to Dashboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
