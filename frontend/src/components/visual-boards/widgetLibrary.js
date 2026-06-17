export const WIDGET_LIBRARY = [
  { type: "kpi_card", label: "KPI Card", defaultTitle: "KPI", defaultConfig: { metric: "active_threat_exposure" }, defaultSize: { w: 6, h: 4 } },
  { type: "production_kpi", label: "Production KPI", defaultTitle: "Total Input", defaultConfig: { production_metric: "total_input", period: "today" }, defaultSize: { w: 4, h: 4 } },
  { type: "mooney_chart", label: "Mooney Chart", defaultTitle: "Mooney Viscosity", defaultConfig: { period: "today" }, defaultSize: { w: 24, h: 8 } },
  { type: "form_submissions_list", label: "Form Submissions", defaultTitle: "Recent Form Submissions", defaultConfig: { limit: 8 }, defaultSize: { w: 8, h: 8 } },
  { type: "risk_observation_list", label: "Risk Observations", defaultTitle: "Top Risk Observations", defaultConfig: { limit: 10 }, defaultSize: { w: 8, h: 8 } },
  { type: "status_indicator", label: "Status Indicator", defaultTitle: "Reliability Status", defaultConfig: {}, defaultSize: { w: 6, h: 6 } },
  { type: "observation_list", label: "Observation List", defaultTitle: "Open Observations", defaultConfig: { limit: 8 }, defaultSize: { w: 12, h: 8 } },
  { type: "exposure_waterfall", label: "Exposure Waterfall", defaultTitle: "Exposure Waterfall", defaultConfig: {}, defaultSize: { w: 12, h: 6 } },
  { type: "action_queue", label: "Action Queue", defaultTitle: "Action Queue", defaultConfig: { limit: 8, queue_mode: "open" }, defaultSize: { w: 12, h: 6 } },
  { type: "trend_chart", label: "Trend Chart", defaultTitle: "Trend", defaultConfig: { chart_metric: "active_threat_exposure", days: 30 }, defaultSize: { w: 8, h: 6 } },
];

export const KPI_METRICS = [
  { value: "active_threat_exposure", label: "Active Exposure" },
  { value: "critical_active_exposure", label: "Controlled Exposure" },
  { value: "exposure_coverage", label: "Exposure Coverage" },
  { value: "pm_compliance", label: "PM Compliance" },
  { value: "resolved_exposure", label: "Resolved Exposure" },
  { value: "uncovered_exposure", label: "Uncovered Exposure" },
  { value: "page_views", label: "Page Views" },
];

export const PRODUCTION_METRICS = [
  { value: "total_input", label: "Total Input" },
  { value: "waste", label: "Waste" },
  { value: "yield", label: "Yield" },
  { value: "avg_mooney", label: "Avg Mooney" },
  { value: "rsd", label: "RSD" },
  { value: "runtime", label: "Runtime" },
];

export const CHART_METRICS = [
  { value: "active_threat_exposure", label: "Active Exposure" },
  { value: "pm_compliance", label: "PM Compliance" },
  { value: "observation_count", label: "Observation Count" },
  { value: "critical_active_exposure", label: "Critical Risks" },
];

export function createWidgetFromLibrary(entry) {
  const id = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    type: entry.type,
    title: entry.defaultTitle,
    config: { font_size: "md", ...entry.defaultConfig },
    position: { x: 0, y: 0, w: entry.defaultSize.w, h: entry.defaultSize.h },
  };
}
