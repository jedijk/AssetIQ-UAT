/** Per-widget display part definitions for enable/disable toggles in Board Designer. */
export const WIDGET_DISPLAY_PARTS = {
  information_panel: [
    { key: "title", label: "Title" },
    { key: "subtitle", label: "Subtitle" },
    { key: "count", label: "Entry count" },
    { key: "timestamp", label: "Timestamp" },
    { key: "submitter", label: "Submitted by" },
    { key: "pin_indicator", label: "Pin icon" },
    { key: "pinned_highlight", label: "Pinned highlight" },
  ],
  text_block: [
    { key: "title", label: "Title" },
    { key: "body", label: "Body text" },
  ],
  production_kpi: [
    { key: "title", label: "Label" },
    { key: "unit", label: "Unit" },
    { key: "subtitle", label: "Subtitle" },
    { key: "detail", label: "Detail line" },
  ],
  kpi_card: [
    { key: "title", label: "Label" },
    { key: "change", label: "Change %" },
    { key: "subtitle", label: "Subtitle" },
  ],
  mooney_chart: [
    { key: "title", label: "Title" },
    { key: "target_bands", label: "Target bands" },
    { key: "grid", label: "Grid lines" },
  ],
  trend_chart: [
    { key: "title", label: "Title" },
    { key: "grid", label: "Grid lines" },
  ],
  form_submissions_list: [
    { key: "title", label: "Title" },
    { key: "submitter", label: "Submitted by" },
    { key: "status", label: "Status badge" },
  ],
  risk_observation_list: [
    { key: "title", label: "Title" },
    { key: "rank", label: "Rank number" },
    { key: "equipment", label: "Equipment" },
    { key: "scores", label: "Risk / RPN scores" },
    { key: "status", label: "Status badge" },
  ],
  observation_list: [
    { key: "title", label: "Title" },
    { key: "asset", label: "Asset name" },
    { key: "status", label: "Status" },
    { key: "exposure", label: "Exposure / risk" },
  ],
  action_queue: [
    { key: "title", label: "Title" },
    { key: "subtitle", label: "Subtitle" },
    { key: "owner", label: "Owner" },
    { key: "status", label: "Status" },
  ],
  status_indicator: [
    { key: "status_label", label: "Status label" },
    { key: "reason", label: "Reason text" },
  ],
  exposure_waterfall: [
    { key: "title", label: "Title" },
  ],
};

export function getWidgetDisplayParts(widgetType) {
  return WIDGET_DISPLAY_PARTS[widgetType] || [];
}

/** Returns whether a display part is enabled (default: on). */
export function isWidgetPartEnabled(config, part, defaultEnabled = true) {
  const parts = config?.parts;
  if (parts && Object.prototype.hasOwnProperty.call(parts, part)) {
    return Boolean(parts[part]);
  }
  if (part === "title" && config?.show_title === false) return false;
  return defaultEnabled;
}
