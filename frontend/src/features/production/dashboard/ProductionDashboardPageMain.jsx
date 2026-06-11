import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productionAPI } from "../../../lib/api";
import { api } from "../../../lib/apiClient";
import { useAuth } from "../../../contexts/AuthContext";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { formatDateOnlyCompact, formatDateTimeCompact } from "../../../lib/dateUtils";
import { isUatEnvironment } from "../../../lib/envDetection";
import { getDatabaseEnvironment } from "../../../lib/databaseEnv";
import { getErrorMessage } from "../../../lib/api";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  Package,
  Trash2,
  TrendingUp,
  FlaskConical,
  Sigma,
  Clock,
  AlertTriangle,
  Search,
  X,
  Pencil,
  Settings,
  Sparkles,
  Download,
  Brain,
  Target,
  Gauge,
  Zap,
  MessageCircle,
  Printer,
  Loader2,
  Pin,
  PinOff,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import {
  Tooltip as RadixTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  Line,
  ComposedChart,
  ReferenceArea,
} from "recharts";
import { toast } from "sonner";
import { displayDate, PERIOD_OPTIONS } from "../../../lib/production/dateRange";
import { useProductionDashboardQuery } from "../../../hooks/production/useProductionDashboardQuery";
import { useProductionDateRange } from "../hooks/useProductionDateRange";
import { productionKeys } from "../queryKeys";
import { useCapabilities } from "../../../core/performance";
import { openPrintWindow } from "../../../lib/printLabel";
import { formAPI } from "../../../components/forms/formAPI";

// MachineAnalysisPanel removed per request (AI Machine Settings Analysis)

import {
  formatHoursMinutes,
  KPICard,
  fmt1,
  ChartTooltip,
  ViscosityTooltip,
  ChartSeriesToggles,
  OPTIONAL_SERIES,
  formTemplateFieldTypeKey,
  formatWasteTypeLabel,
  WasteReportingPanel,
  FormExecutionDialog,
  sortMillisecondsForProductionEntry,
  chartPointSortMs,
  PRODUCTION_SHIFT_OPTIONS,
  loadProductionDashboardFiltersSnapshot,
  parseSavedShiftsFromSnapshot,
  saveProductionDashboardFiltersSnapshot,
  PRODUCTION_DASH_FILTERS_V,
  PERIOD_KEY_SET,
  PRODUCTION_DASH_ACTION_EDIT,
  PRODUCTION_DASH_ACTION_DELETE,
  PRODUCTION_DASH_INFO_ACTION_BTN,
  PRODUCTION_DASH_INFO_ACTION_EDIT,
  PRODUCTION_DASH_INFO_ACTION_DELETE,
} from "../dashboard/productionDashboardShared";
import { ProductionDashboardHeader } from "./ProductionDashboardHeader";
import { ProductionDashboardKPIs } from "./ProductionDashboardKPIs";
import { ProductionShiftPanels } from "./ProductionShiftPanels";
import { ProductionLogTable } from "./ProductionLogTable";
import { ProductionDashboardModals } from "./ProductionDashboardModals";
import { MooneyViscosityChart } from "./MooneyViscosityChart";

// ──────────────────────────────────────────
// Main component
// ──────────────────────────────────────────
export default function ProductionDashboardPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const caps = useCapabilities();

  const getTimeKey = (entry) => {
    // Always use datetime field and convert to user's local timezone
    // The backend sends datetime in UTC (ISO format), so we parse and format locally
    if (entry?.datetime) {
      const d = new Date(entry.datetime);
      if (!isNaN(d)) {
        return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      }
    }
    // Fallback to pre-formatted time only if datetime is missing (legacy data)
    if (entry?.time) return entry.time;
    return "";
  };

  const {
    period,
    setPeriod,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    showCustomDate,
    setShowCustomDate,
    handlePeriod,
    fromStr,
    toStr,
  } = useProductionDateRange();

  const [selectedShifts, setSelectedShifts] = useState(() =>
    parseSavedShiftsFromSnapshot(loadProductionDashboardFiltersSnapshot())
  );
  const [productionFiltersHydrated, setProductionFiltersHydrated] = useState(false);
  const productionFiltersRestoredRef = useRef(false);

  const shiftQueryKey = useMemo(() => [...selectedShifts].sort().join(","), [selectedShifts]);

  const toggleProductionShift = useCallback((key) => {
    setSelectedShifts((prev) => {
      const has = prev.includes(key);
      if (has && prev.length === 1) return prev;
      if (has) return prev.filter((k) => k !== key);
      const order = { morning: 0, afternoon: 1, night: 2 };
      return [...prev, key].sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9));
    });
  }, []);
  const [logSearch, setLogSearch] = useState("");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", type: "action", severity: "info" });
  const [chartSeries, setChartSeries] = useState({ rpm: false, feed: false, mp4: false, t_product_ir: false, screenChange: false, magnetCleaning: false });
  const [expandedEosNotes, setExpandedEosNotes] = useState(null); // Track which EOS row has notes expanded (for mobile)
  const [formExec, setFormExec] = useState(null); // { templateId, templateName }
  const [selectedTime, setSelectedTime] = useState(null); // highlighted time from chart click

  useLayoutEffect(() => {
    const already = productionFiltersRestoredRef.current;
    productionFiltersRestoredRef.current = true;
    if (!already) {
      try {
        const saved = loadProductionDashboardFiltersSnapshot();
        if (saved) {
          const p = saved.period;
          if (p === "custom" && saved.fromStr && saved.toStr) {
            const fd = new Date(`${saved.fromStr}T12:00:00`);
            const td = new Date(`${saved.toStr}T12:00:00`);
            if (!Number.isNaN(fd.getTime()) && !Number.isNaN(td.getTime())) {
              setFromDate(fd);
              setToDate(td);
              setPeriod("custom");
              setShowCustomDate(!!saved.showCustomDate);
            }
          } else if (p && PERIOD_KEY_SET.has(p)) {
            handlePeriod(p);
          }
        }
      } catch {
        /* ignore corrupt snapshot */
      }
    }
    setProductionFiltersHydrated(true);
    // One-time restore on mount (localStorage); `hydrated` must flip even in React Strict Mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once
  }, []);

  useEffect(() => {
    if (!productionFiltersHydrated) return;
    saveProductionDashboardFiltersSnapshot({
      v: PRODUCTION_DASH_FILTERS_V,
      shifts: selectedShifts,
      period,
      fromStr,
      toStr,
      showCustomDate,
    });
  }, [productionFiltersHydrated, selectedShifts, period, fromStr, toStr, showCustomDate]);

  // Force period to "1d" on mobile
  useEffect(() => {
    if (isMobile && period !== "1d") {
      setPeriod("1d");
      setShowCustomDate(false);
    }
  }, [isMobile, period, setPeriod, setShowCustomDate]);

  // Template IDs (fetched once)
  const { data: formTemplates } = useQuery({
    queryKey: productionKeys.formTemplates(),
    queryFn: async () => {
      const res = await api.get("/form-templates");
      const list = Array.isArray(res.data) ? res.data : res.data.templates || [];
      const bigBag = list.find((t) => t.name === "Big Bag Loading");
      const extruder = list.find((t) => t.name === "Extruder settings sample");
      const viscosity = list.find((t) => /mooney viscosity/i.test(t.name));
      const endOfShift = list.find((t) => /end of shift/i.test(t.name));
      const wasteReporting = list.find((t) => /waste/i.test(t.name) && /report/i.test(t.name));
      const informationTemplates = list.filter((t) => /\b(information|informatie)\b/i.test(String(t.name || "")));
      return { bigBag, extruder, viscosity, endOfShift, wasteReporting, informationTemplates };
    },
    staleTime: 600000,
  });

  // Fetch Line-90 equipment ID for form submissions
  const { data: line90Equipment } = useQuery({
    queryKey: ["line90-equipment"],
    queryFn: async () => {
      const res = await api.get("/equipment-hierarchy/search?q=Line-90&limit=1");
      const results = res.data?.results || res.data?.nodes || [];
      return results[0] || null;
    },
    staleTime: 600000,
  });

  // Fetch dashboard data
  const { data, isLoading, isFetching, isError, error, refetch } = useProductionDashboardQuery({
    fromStr,
    toStr,
    shift: shiftQueryKey,
    period,
    productionAPI,
    capabilities: caps,
    filtersReady: productionFiltersHydrated,
  });

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: productionKeys.dashboard(period, fromStr, toStr, shiftQueryKey),
      exact: true,
    });
  };

  const runPairingRepair = async () => {
    try {
      if (period !== "1d") {
        toast.error("Pairing repair can only run in 1D mode");
        return;
      }
      const res = await api.post(`/production/viscosity-pairing/repair?date=${encodeURIComponent(fromStr)}&limit=500`);
      const processed = res?.data?.processed ?? 0;
      toast.success(`Pairing run complete (${processed} samples checked)`);
      await refetch();
    } catch (e) {
      toast.error("Failed to run pairing");
    }
  };

  const downloadPairingDebugReport = async () => {
    try {
      if (period !== "1d") {
        toast.error("Debug report can only run in 1D mode");
        return;
      }
      const res = await api.get(`/production/viscosity-pairing/debug-report?date=${encodeURIComponent(fromStr)}`);
      const payload = res?.data || {};
      const json = JSON.stringify(payload, null, 2);

      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pairing-debug-${fromStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2500);

      toast.success("Pairing debug report downloaded");
    } catch (e) {
      toast.error("Failed to generate debug report");
    }
  };

  const invalidateDashboard = () =>
    queryClient.invalidateQueries({ queryKey: productionKeys.dashboard(period, fromStr, toStr, shiftQueryKey) });

  // Mutation for creating events
  const createEventMutation = useMutation({
    mutationFn: (eventData) => productionAPI.createEvent(eventData),
    onSuccess: () => {
      invalidateDashboard();
      setShowAddEvent(false);
      setNewEvent({ title: "", description: "", type: "action", severity: "info" });
      toast.success("Event created");
    },
    onError: () => toast.error("Failed to create event"),
  });

  // Edit log entry state
  const [editEntry, setEditEntry] = useState(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type, ids[], label }

  /** Label reprint for extruder or viscosity submission (same flow as SubmissionRow). */
  const [printingLogSubmissionId, setPrintingLogSubmissionId] = useState(null);

  const handleProductionLogReprint = async (entry, isViscOnly, e) => {
    if (e) e.stopPropagation();
    const submissionId = isViscOnly ? entry._viscosity_submission_id : entry.submission_id;
    if (!submissionId) {
      toast.error("No submission linked to this row.");
      return;
    }
    let preOpened = null;
    try {
      preOpened = openPrintWindow();
    } catch (_err) {
      /* ignore */
    }
    setPrintingLogSubmissionId(submissionId);
    try {
      const tpl = isViscOnly ? formTemplates?.viscosity : formTemplates?.extruder;
      let cfg = tpl?.label_print_config;
      if (!cfg?.enabled || !cfg?.label_template_id) {
        if (tpl?.id) {
          try {
            const full = await formAPI.getTemplate(tpl.id);
            cfg = full?.label_print_config || cfg;
          } catch (_e) {
            /* keep cfg */
          }
        }
      }
      const templateId = cfg?.label_template_id;
      if (!cfg?.enabled || !templateId) {
        toast.error("This form has no label template configured. Enable it in the form designer.");
        if (preOpened && !preOpened.closed) preOpened.close();
        return;
      }
      const { printLabel } = await import("../../../lib/printLabel");
      const res = await printLabel(
        {
          template_id: templateId,
          submission_id: submissionId,
          copies: 1,
        },
        {
          win: preOpened,
          filename: `label-${String(submissionId).slice(0, 8)}.pdf`,
        }
      );
      if (res.method === "window") toast.success("Label print dialog opened");
      else if (res.mobile) toast.info("Label downloaded — use Share → Print");
      else if (res.method === "download") toast.info("Print blocked — label downloaded.");
      else toast.success("Print dialog opened");
    } catch (err) {
      if (preOpened && !preOpened.closed) preOpened.close();
      toast.error(err?.response?.data?.detail || err?.message || "Print failed");
    } finally {
      setPrintingLogSubmissionId(null);
    }
  };

  // Mutation for updating a submission
  const updateSubmissionMutation = useMutation({
    mutationFn: ({ id, values }) => productionAPI.updateSubmission(id, values),
    onSuccess: () => {
      invalidateDashboard();
      setEditEntry(null);
      toast.success("Entry updated");
    },
    onError: () => toast.error("Failed to update entry"),
  });

  // Mutation for deleting a submission
  const deleteSubmissionMutation = useMutation({
    mutationFn: (id) => productionAPI.deleteSubmission(id),
    onSuccess: () => {
      invalidateDashboard();
      toast.success("Entry deleted");
    },
    onError: (error) => {
      // 404 means already deleted - treat as success
      if (error?.response?.status === 404) {
        invalidateDashboard();
        toast.success("Entry already deleted");
      } else {
        toast.error("Failed to delete entry");
      }
    },
  });

  const setInformationPinMutation = useMutation({
    mutationFn: ({ submissionId, pinned }) => productionAPI.setInformationPin(submissionId, pinned),
    onSuccess: () => {
      invalidateDashboard();
    },
    onError: () => {
      toast.error("Could not update pin");
    },
  });

  const toggleInformationPin = useCallback(
    (submissionId) => {
      if (!submissionId || setInformationPinMutation.isPending) return;
      const row = data?.information_entries?.find((e) => e.submission_id === submissionId);
      const nextPinned = !row?.pinned;
      setInformationPinMutation.mutate({ submissionId, pinned: nextPinned });
    },
    [data?.information_entries, setInformationPinMutation]
  );

  const sortedInformationEntries = useMemo(() => {
    const list = data?.information_entries;
    if (!list?.length) return [];
    return list.map((e) => ({
      ...e,
      _informationPinned: !!e.pinned,
    }));
  }, [data?.information_entries]);

  // Edit state for big bag entries
  const [editBigBag, setEditBigBag] = useState(null);

  // Export to Excel
  const exportToExcel = () => {
    if (!data) return;
    import("xlsx").then((XLSX) => {
      import("file-saver").then(({ saveAs }) => {
        const wb = XLSX.utils.book_new();

        // Sheet 1: KPIs
        const kpiRows = [
          ["KPI", "Value", "Unit", "Detail"],
          ["Total Input", kpis.total_input, "kg", kpis.lot_info || ""],
          ["Waste", kpis.waste, "kg", `${kpis.waste_pct || 0}% of input (${kpis.waste_reporting_count ?? 0} reporting entries)`],
          ["Yield", kpis.yield_pct, "%", `Target: ${kpis.yield_target}%`],
          ["Avg Mooney Viscosity", kpis.avg_viscosity, "MU", `Range: ${kpis.viscosity_range} (${kpis.viscosity_sample_count ?? 0} samples)`],
          ["RSD", kpis.rsd, "%", `Target: < ${kpis.rsd_target}`],
          ["Runtime", formatHoursMinutes(kpis.runtime_hours), "", ""],
        ];
        const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
        wsKpi["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(wb, wsKpi, "KPIs");

        // Sheet 2: Production Log
        const logHeader = ["#", "Date", "Time", "RPM", "Feed", "M%", "Energy", "MT1", "MT2", "MT3", "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR", "Viscosity", "Remarks", "By"];
        const logRows = [logHeader];
        const viscMap = {};
        (data.viscosity_series || []).forEach((v) => { 
          const localTime = getLocalTime(v);
          if (localTime) viscMap[localTime] = v.viscosity; 
        });
        const logSorted = [...(data.production_log || [])].sort((a, b) => {
          const da = sortMillisecondsForProductionEntry(a, fromDate);
          const db = sortMillisecondsForProductionEntry(b, fromDate);
          if (da !== db) return da - db;
          const sa = a.submission_id || "";
          const sb = b.submission_id || "";
          return String(sa).localeCompare(String(sb));
        });
        logSorted.forEach((e, i) => {
          const dateStr = e.datetime ? formatDateOnlyCompact(e.datetime) : '';
          const timeKey = getTimeKey(e);
          logRows.push([
            i + 1, dateStr, timeKey || "—", e.rpm, e.feed, e.moisture, e.energy,
            e.mt1, e.mt2, e.mt3, e.mp1, e.mp2, e.mp3, e.mp4,
            e.co2_feed_p, e.t_product_ir,
            timeKey && viscMap[timeKey] !== undefined ? viscMap[timeKey] : "TBD",
            e.remarks || "", e.submitted_by || "",
          ]);
        });
        const wsLog = XLSX.utils.aoa_to_sheet(logRows);
        wsLog["!cols"] = logHeader.map(() => ({ wch: 12 }));
        XLSX.utils.book_append_sheet(wb, wsLog, "Production Log");

        // Sheet 3: Viscosity Samples
        const viscHeader = ["Time", "Sample No.", "Viscosity (MU)"];
        const viscRows = [viscHeader];
        (data.viscosity_series || []).forEach((v) => {
          viscRows.push([getLocalTime(v), v.sample || "", v.viscosity]);
        });
        const wsVisc = XLSX.utils.aoa_to_sheet(viscRows);
        wsVisc["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, wsVisc, "Viscosity Samples");

        // Sheet 4: Input Material
        const bagHeader = ["Material", "Supplier", "Bag No.", "Lot No.", "Production Date", "Equipment / line", "By"];
        const bagRows = [bagHeader];
        (data.big_bag_entries || []).forEach((b) => {
          bagRows.push([
            b.material,
            b.supplier,
            b.bag_no,
            b.lot_no,
            b.production_date || "",
            b.equipment_name || "Line-90",
            b.submitted_by || "",
          ]);
        });
        const wsBag = XLSX.utils.aoa_to_sheet(bagRows);
        wsBag["!cols"] = bagHeader.map(() => ({ wch: 16 }));
        XLSX.utils.book_append_sheet(wb, wsBag, "Input Material");

        // Sheet 5: End of Shift (input only — waste tracked in Waste Reporting)
        const eosHeader = ["Date & Time", "Input (kg)", "Completion comments", "Submitted by", "Submission ID"];
        const eosRows = [eosHeader];
        (data.end_of_shift_entries || []).forEach((eos) => {
          eosRows.push([
            formatDateTimeCompact(eos.datetime || eos.date_time_raw),
            eos.total_input ?? 0,
            eos.notes || "",
            eos.submitted_by || "",
            eos.submission_id || "",
          ]);
        });
        const wsEos = XLSX.utils.aoa_to_sheet(eosRows);
        wsEos["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 36 }, { wch: 18 }, { wch: 28 }];
        XLSX.utils.book_append_sheet(wb, wsEos, "End of Shift");

        // Sheet 6: Waste Reporting (KPI waste total = sum of Weight column)
        const wasteRepHeader = ["Date & Time", "Waste Type", "Weight (KG)", "Submitted by", "Submission ID"];
        const wasteRepRows = [wasteRepHeader];
        (data.waste_reporting_entries || []).forEach((row) => {
          const typeLabel = formatWasteTypeLabel(row.waste_type);
          wasteRepRows.push([
            formatDateTimeCompact(row.datetime || row.date_time_raw),
            typeLabel === "—" ? "" : typeLabel,
            row.weight_kg ?? 0,
            row.submitted_by || "",
            row.submission_id || "",
          ]);
        });
        const wsWasteRep = XLSX.utils.aoa_to_sheet(wasteRepRows);
        wsWasteRep["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 28 }];
        XLSX.utils.book_append_sheet(wb, wsWasteRep, "Waste Reporting");

        // Sheet 7: Actions
        const actHeader = ["Time", "Severity", "Title", "Description"];
        const actRows = [actHeader];
        (data.actions || []).forEach((ev) => {
          actRows.push([ev.time, ev.severity, ev.title, ev.description]);
        });
        const wsAct = XLSX.utils.aoa_to_sheet(actRows);
        wsAct["!cols"] = [{ wch: 8 }, { wch: 10 }, { wch: 30 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, wsAct, "Actions");

        // Sheet 8: Information (form submissions)
        const infoHeader = ["Shift time", "Submitted at", "Info", "Submitted by", "Form", "Submission ID"];
        const infoRows = [infoHeader];
        (data.information_entries || []).forEach((row) => {
          infoRows.push([
            row.time || "",
            formatDateTimeCompact(row.submitted_at || row.datetime || ""),
            row.text || "",
            row.submitted_by || "",
            row.form_template_name || "",
            row.submission_id || "",
          ]);
        });
        const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
        wsInfo["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 48 }, { wch: 18 }, { wch: 28 }, { wch: 28 }];
        XLSX.utils.book_append_sheet(wb, wsInfo, "Information");

        // Save
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const exportName = fromStr === toStr
          ? `Production_Dashboard_${fromStr}.xlsx`
          : `Production_Dashboard_${fromStr}_${toStr}.xlsx`;
        saveAs(blob, exportName);
        toast.success("Excel exported");
      });
    });
  };

  // Date navigation (day mode only)
  const prevDay = () => { const d = new Date(fromDate.getTime() - 86400000); setFromDate(d); setToDate(d); };
  const nextDay = () => { const d = new Date(fromDate.getTime() + 86400000); setFromDate(d); setToDate(d); };

  // Period-aware navigation (month/year stepping)
  const stepPeriod = (direction) => {
    const dir = direction; // -1 or +1
    const from = new Date(fromDate);
    const to = new Date(toDate);

    switch (period) {
      case "1w": {
        from.setDate(from.getDate() + dir * 7);
        to.setDate(to.getDate() + dir * 7);
        break;
      }
      case "1m": {
        from.setMonth(from.getMonth() + dir);
        to.setMonth(to.getMonth() + dir);
        break;
      }
      case "3m": {
        from.setMonth(from.getMonth() + dir * 3);
        to.setMonth(to.getMonth() + dir * 3);
        break;
      }
      case "6m": {
        from.setMonth(from.getMonth() + dir * 6);
        to.setMonth(to.getMonth() + dir * 6);
        break;
      }
      case "1y": {
        from.setFullYear(from.getFullYear() + dir);
        to.setFullYear(to.getFullYear() + dir);
        break;
      }
      case "ytd": {
        // Step by year
        from.setFullYear(from.getFullYear() + dir);
        to.setFullYear(to.getFullYear() + dir);
        from.setMonth(0, 1); // Jan 1
        break;
      }
      default:
        // custom or unknown — step by the current range size
        const rangeMs = to.getTime() - from.getTime();
        from.setTime(from.getTime() + dir * rangeMs);
        to.setTime(to.getTime() + dir * rangeMs);
    }
    setFromDate(from);
    setToDate(to);
  };

  // Combined time series for Mooney Viscosity chart (merges viscosity + production log data)
  const isMultiDay = period !== "1d";

  // Helper to convert datetime to local HH:MM format
  const getLocalTime = (item) => {
    if (item?.datetime) {
      const d = new Date(item.datetime);
      if (!isNaN(d)) {
        return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      }
    }
    // Fallback to pre-formatted time (legacy data in UTC)
    return item?.time || "";
  };

  // Filtered production log
  const filteredLog = useMemo(() => {
    if (!data?.production_log) return [];

    // Merge standalone viscosity entries (no matching extruder time) as separate rows
    // Use local time keys for matching
    const logKeys = new Set(
      (data.production_log || [])
        .map((e) => (isMultiDay ? e.datetime : getTimeKey(e)))
        .filter(Boolean)
    );
    const standaloneVisc = (data?.viscosity_series || [])
      .filter((v) => {
        const key = isMultiDay ? v.datetime : getLocalTime(v);
        return key && !logKeys.has(key);
      })
      .map((v) => ({
        time: v.time,
        datetime: v.datetime || "",
        submitted_by: "",
        rpm: null, feed: null, moisture: null, energy: null,
        mt1: null, mt2: null, mt3: null,
        mp1: null, mp2: null, mp3: null, mp4: null,
        co2_feed_p: null, t_product_ir: null,
        remarks: "", waste: null,
        submission_id: "",
        _viscosity_only: true,
        _viscosity_value: v.viscosity,
        _viscosity_submission_id: v.submission_id,
      }));

    // Chronological (first reading of the day/shift at top) so row #1 is the first line item.
    const merged = [...data.production_log, ...standaloneVisc].sort((a, b) => {
      const da = sortMillisecondsForProductionEntry(a, fromDate);
      const db = sortMillisecondsForProductionEntry(b, fromDate);
      if (da !== db) return da - db;
      const sa = a.submission_id || a._viscosity_submission_id || "";
      const sb = b.submission_id || b._viscosity_submission_id || "";
      return String(sa).localeCompare(String(sb));
    });

    if (!logSearch) return merged;
    const s = logSearch.toLowerCase();
    return merged.filter(
      (e) =>
        getTimeKey(e)?.toLowerCase().includes(s) ||
        e.submitted_by?.toLowerCase().includes(s) ||
        String(e.rpm).includes(s) ||
        String(e.feed).includes(s)
    );
  }, [data?.production_log, data?.viscosity_series, logSearch, isMultiDay, fromDate]);

  const combinedSeries = useMemo(() => {
    const log = data?.production_log || [];
    const viscSeries = data?.viscosity_series || [];
    const viscVals = data?.viscosity_values || [];
    // Convert screen_changes and magnet_cleanings to local time keys
    const screenChanges = chartSeries.screenChange 
      ? new Set((data?.screen_changes || []).map(s => getLocalTime(s))) 
      : new Set();
    const magnetCleanings = chartSeries.magnetCleaning 
      ? new Set((data?.magnet_cleanings || []).map(s => getLocalTime(s))) 
      : new Set();

    if (!isMultiDay) {
      // Single day: use time (HH:MM) in local timezone as key
      // Build viscosity lookup by local time
      const viscByTime = {};
      viscSeries.forEach((v) => { 
        const localTime = getLocalTime(v);
        if (localTime) viscByTime[localTime] = v.viscosity; 
      });

      const timeMap = {};
      log.forEach((entry) => {
        const timeKey = getTimeKey(entry);
        if (!timeKey) return;
        timeMap[timeKey] = {
          time: timeKey,
          _sortMs: chartPointSortMs(entry, fromDate),
          rpm: entry.rpm, feed: entry.feed, mp4: entry.mp4, t_product_ir: entry.t_product_ir,
          viscosity: viscByTime[timeKey] ?? null,
          screenChange: null, magnetCleaning: null,
        };
      });
      viscSeries.forEach((v) => {
        const localTime = getLocalTime(v);
        if (!localTime) return;
        const sm = chartPointSortMs({ datetime: v.datetime, time: v.time }, fromDate);
        if (!timeMap[localTime]) {
          timeMap[localTime] = { time: localTime, _sortMs: sm, viscosity: v.viscosity, rpm: null, feed: null, mp4: null, t_product_ir: null, screenChange: null, magnetCleaning: null };
        } else {
          timeMap[localTime].viscosity = v.viscosity;
          if (Number.isFinite(sm) && sm < timeMap[localTime]._sortMs) {
            timeMap[localTime]._sortMs = sm;
          }
        }
      });
      const addEvent = (timeSet, fieldName) => {
        timeSet.forEach((t) => {
          if (timeMap[t]) {
            timeMap[t][fieldName] = timeMap[t].viscosity || 0;
          } else {
            timeMap[t] = {
              time: t,
              _sortMs: chartPointSortMs({ time: t }, fromDate),
              viscosity: null,
              rpm: null,
              feed: null,
              mp4: null,
              t_product_ir: null,
              screenChange: null,
              magnetCleaning: null,
              [fieldName]: 0,
            };
          }
        });
      };
      addEvent(screenChanges, "screenChange");
      addEvent(magnetCleanings, "magnetCleaning");
      const sorted = Object.values(timeMap)
        .sort((a, b) => {
          const da = a._sortMs ?? Number.POSITIVE_INFINITY;
          const db = b._sortMs ?? Number.POSITIVE_INFINITY;
          if (da !== db) return da - db;
          return String(a.time || "").localeCompare(String(b.time || ""));
        })
        .map(({ _sortMs: _ignored, ...row }) => row);
      sorted.forEach((p) => {
        if (p.screenChange !== null) p.screenChange = p.viscosity || p.screenChange;
        if (p.magnetCleaning !== null) p.magnetCleaning = p.viscosity || p.magnetCleaning;
      });
      return sorted;
    }

    // Multi-day: aggregate per day (1W, 1M, 3M) or per month (6M, 1Y, YTD)
    const useMonthBucket = false; // Always show per-day data points
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const getBucket = (dt) => {
      if (!dt) return null;
      const dateStr = dt.substring(0, 10); // YYYY-MM-DD
      if (useMonthBucket) return dateStr.substring(0, 7); // YYYY-MM
      return dateStr; // YYYY-MM-DD
    };

    const formatBucket = (bucket) => {
      // YYYY-MM-DD → compact label based on period
      try {
        const d = new Date(bucket + "T12:00:00");
        if (["6m", "1y", "ytd"].includes(period)) {
          return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        }
        return `${d.getDate()} ${months[d.getMonth()]}`;
      } catch { return bucket; }
    };

    // Build viscosity lookup by datetime for multi-day
    const viscByDatetime = {};
    viscSeries.forEach((v) => {
      if (v.datetime) viscByDatetime[v.datetime] = v.viscosity;
      else if (v.time) viscByDatetime[v.time] = v.viscosity;
    });

    // Aggregate into buckets
    const buckets = {};
    log.forEach((entry) => {
      const dt = entry.datetime || "";
      const bucket = getBucket(dt);
      if (!bucket) return;
      if (!buckets[bucket]) {
        buckets[bucket] = { rpms: [], feeds: [], mp4s: [], t_irs: [], viscosities: [], hasScreen: false, hasMagnet: false };
      }
      if (entry.rpm) buckets[bucket].rpms.push(entry.rpm);
      if (entry.feed) buckets[bucket].feeds.push(entry.feed);
      if (entry.mp4) buckets[bucket].mp4s.push(entry.mp4);
      if (entry.t_product_ir) buckets[bucket].t_irs.push(entry.t_product_ir);
      // Match viscosity by datetime
      const visc = viscByDatetime[dt] ?? null;
      if (visc != null) buckets[bucket].viscosities.push(visc);
    });
    // Add viscosity from series not in log
    viscSeries.forEach((v) => {
      const dt = v.datetime || "";
      const bucket = getBucket(dt) || getBucket(v.time);
      if (!bucket || !v.viscosity) return;
      if (!buckets[bucket]) {
        buckets[bucket] = { rpms: [], feeds: [], mp4s: [], t_irs: [], viscosities: [], hasScreen: false, hasMagnet: false };
      }
      buckets[bucket].viscosities.push(v.viscosity);
    });
    // Mark screen change and magnet events
    (data?.screen_changes || []).forEach((s) => {
      const dt = s.datetime || "";
      const bucket = getBucket(dt) || getBucket(s.time);
      if (bucket && buckets[bucket]) buckets[bucket].hasScreen = true;
    });
    (data?.magnet_cleanings || []).forEach((s) => {
      const dt = s.datetime || "";
      const bucket = getBucket(dt) || getBucket(s.time);
      if (bucket && buckets[bucket]) buckets[bucket].hasMagnet = true;
    });

    const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const sorted = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, b]) => {
        const avgVisc = avg(b.viscosities);
        return {
          time: formatBucket(bucket),
          rpm: avg(b.rpms),
          feed: avg(b.feeds),
          mp4: avg(b.mp4s),
          t_product_ir: avg(b.t_irs),
          viscosity: avgVisc != null ? Math.round(avgVisc * 100) / 100 : null,
          screenChange: (chartSeries.screenChange && b.hasScreen) ? avgVisc : null,
          magnetCleaning: (chartSeries.magnetCleaning && b.hasMagnet) ? avgVisc : null,
        };
      });
    return sorted;
  }, [data?.production_log, data?.viscosity_series, data?.viscosity_values, data?.screen_changes, data?.magnet_cleanings, chartSeries.screenChange, chartSeries.magnetCleaning, isMultiDay, period, fromDate]);

  const kpis = data?.kpis || {};
  const activeDbEnv = getDatabaseEnvironment();
  const showProdDbOnUatWarning = isUatEnvironment() && activeDbEnv === "production";
  const dashboardEmpty = !isLoading && !isError && data && (data.submissions_count ?? 0) === 0;
  const wasteWeightThresholdKg = Number(data?.waste_weight_threshold_kg) > 0
    ? Number(data.waste_weight_threshold_kg)
    : 500;

  // Build time-to-viscosity map for accurate matching (using local timezone)
  const viscosityByTime = useMemo(() => {
    const map = {};
    (data?.viscosity_series || []).forEach((v) => {
      const localTime = getLocalTime(v);
      if (localTime) map[localTime] = { value: v.viscosity, submission_id: v.submission_id };
    });
    return map;
  }, [data?.viscosity_series]);

  // Anomaly highlight row
  const isAnomalyRow = (entry) => {
    const avgVisc = kpis.avg_viscosity || 0;
    const timeKey = getTimeKey(entry);
    const visc = viscosityByTime[timeKey]?.value;
    if (visc !== undefined) {
      return Math.abs(visc - avgVisc) > 4;
    }
    return false;
  };

  // ──────────────────────────────────────────
  return (
    <div className="bg-transparent space-y-5 overflow-x-hidden" data-testid="production-dashboard">
      <ProductionDashboardHeader
        isMobile={isMobile}
        period={period}
        setPeriod={setPeriod}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        showCustomDate={showCustomDate}
        setShowCustomDate={setShowCustomDate}
        handlePeriod={handlePeriod}
        fromStr={fromStr}
        toStr={toStr}
        selectedShifts={selectedShifts}
        toggleProductionShift={toggleProductionShift}
        isFetching={isFetching}
        handleManualRefresh={handleManualRefresh}
        runPairingRepair={runPairingRepair}
        downloadPairingDebugReport={downloadPairingDebugReport}
        exportToExcel={exportToExcel}
        displayDate={displayDate}
        PERIOD_OPTIONS={PERIOD_OPTIONS}
        prevDay={prevDay}
        nextDay={nextDay}
        stepPeriod={stepPeriod}
        user={user}
        data={data}
      />
      {showProdDbOnUatWarning && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          data-testid="production-db-env-warning"
        >
          You are viewing the <strong>Production</strong> database on UAT. Production forms and KPIs
          live in UAT are in the <strong>UAT</strong> database — switch to UAT under
          Settings → Database Environment.
        </div>
      )}
      {isError && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          data-testid="production-dashboard-error"
        >
          Failed to load production data: {getErrorMessage(error, "Unknown error")}.{" "}
          <button type="button" className="underline font-medium" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}
      {dashboardEmpty && (
        <div
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          data-testid="production-dashboard-empty"
        >
          No production submissions for <strong>{fromStr}</strong>
          {shiftQueryKey ? ` (${shiftQueryKey.replace(/,/g, ", ")})` : ""}.
          Try another date, include more shifts, or confirm the active database
          ({activeDbEnv === "uat" ? "UAT" : "Production"}).
        </div>
      )}
      {/* ── Loading state ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-slate-500">Loading dashboard...</span>
        </div>
      )}
      {!isLoading && (
        <>
          <ProductionDashboardKPIs kpis={kpis} />
          <MooneyViscosityChart
            caps={caps}
            chartSeries={chartSeries}
            setChartSeries={setChartSeries}
            combinedSeries={combinedSeries}
            selectedTime={selectedTime}
            setSelectedTime={setSelectedTime}
          />
          <ProductionShiftPanels
            data={data}
            isMobile={isMobile}
            formTemplates={formTemplates}
            line90Equipment={line90Equipment}
            setFormExec={setFormExec}
            setDeleteConfirm={setDeleteConfirm}
            wasteWeightThresholdKg={wasteWeightThresholdKg}
            expandedEosNotes={expandedEosNotes}
            setExpandedEosNotes={setExpandedEosNotes}
            editBigBag={editBigBag}
            setEditBigBag={setEditBigBag}
            sortedInformationEntries={sortedInformationEntries}
            toggleInformationPin={toggleInformationPin}
            setInformationPinMutation={setInformationPinMutation}
          />
          <ProductionLogTable
            isMobile={isMobile}
            logSearch={logSearch}
            setLogSearch={setLogSearch}
            filteredLog={filteredLog}
            data={data}
            getTimeKey={getTimeKey}
            viscosityByTime={viscosityByTime}
            isAnomalyRow={isAnomalyRow}
            selectedTime={selectedTime}
            setEditEntry={setEditEntry}
            handleProductionLogReprint={handleProductionLogReprint}
            printingLogSubmissionId={printingLogSubmissionId}
            formTemplates={formTemplates}
            line90Equipment={line90Equipment}
            setFormExec={setFormExec}
            setDeleteConfirm={setDeleteConfirm}
          />
        </>
      )}
      <ProductionDashboardModals
        showAddEvent={showAddEvent}
        setShowAddEvent={setShowAddEvent}
        newEvent={newEvent}
        setNewEvent={setNewEvent}
        createEventMutation={createEventMutation}
        fromStr={fromStr}
        editEntry={editEntry}
        setEditEntry={setEditEntry}
        updateSubmissionMutation={updateSubmissionMutation}
        invalidateDashboard={invalidateDashboard}
        editBigBag={editBigBag}
        setEditBigBag={setEditBigBag}
        formExec={formExec}
        setFormExec={setFormExec}
        queryClient={queryClient}
        deleteConfirm={deleteConfirm}
        setDeleteConfirm={setDeleteConfirm}
        deleteSubmissionMutation={deleteSubmissionMutation}
      />
    </div>
  );
}
