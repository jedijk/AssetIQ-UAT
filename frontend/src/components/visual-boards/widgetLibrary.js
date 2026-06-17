export const WIDGET_LIBRARY = [
  { type: "kpi_card", label: "KPI Card", defaultTitle: "KPI", defaultConfig: { metric: "active_threat_exposure" }, defaultSize: { w: 3, h: 2 } },
  { type: "status_indicator", label: "Status Indicator", defaultTitle: "Reliability Status", defaultConfig: {}, defaultSize: { w: 3, h: 3 } },
  { type: "observation_list", label: "Observation List", defaultTitle: "Open Observations", defaultConfig: { limit: 8 }, defaultSize: { w: 6, h: 4 } },
  { type: "exposure_waterfall", label: "Exposure Waterfall", defaultTitle: "Exposure Waterfall", defaultConfig: {}, defaultSize: { w: 6, h: 3 } },
  { type: "action_queue", label: "Action Queue", defaultTitle: "Action Queue", defaultConfig: { limit: 8 }, defaultSize: { w: 6, h: 3 } },
  { type: "trend_chart", label: "Trend Chart", defaultTitle: "Trend", defaultConfig: { chart_metric: "active_threat_exposure", days: 30 }, defaultSize: { w: 4, h: 3 } },
];

export const KPI_METRICS = [
  { value: "active_threat_exposure", label: "Active Exposure" },
  { value: "critical_active_exposure", label: "Critical Risks" },
  { value: "exposure_coverage", label: "Exposure Coverage" },
  { value: "pm_compliance", label: "PM Compliance" },
  { value: "resolved_exposure", label: "Resolved Exposure" },
  { value: "uncovered_exposure", label: "Uncovered Exposure" },
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
    config: { ...entry.defaultConfig },
    position: { x: 0, y: 0, w: entry.defaultSize.w, h: entry.defaultSize.h },
  };
}
