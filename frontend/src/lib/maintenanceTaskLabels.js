/** Task status / priority labels for maintenance scheduling UI (use with t from useLanguage). */

export function getTaskStatusConfig(t) {
  return {
    draft: { label: t("maintenance.statusDraft") },
    scheduled: { label: t("maintenance.statusScheduled") },
    assigned: { label: t("maintenance.statusAssigned") },
    in_progress: { label: t("maintenance.statusInProgress") },
    completed: { label: t("maintenance.statusCompleted") },
    deferred: { label: t("maintenance.statusDeferred") },
    cancelled: { label: t("maintenance.statusCancelled") },
  };
}

export function getPriorityConfig(t) {
  const critical = { label: t("common.critical") };
  const high = { label: t("common.high") };
  const medium = { label: t("common.medium") };
  const low = { label: t("common.low") };
  return {
    critical,
    Critical: critical,
    high,
    High: high,
    medium,
    Medium: medium,
    low,
    Low: low,
  };
}

export function taskStatusLabel(t, status) {
  return getTaskStatusConfig(t)[status]?.label ?? status;
}

export function priorityLabel(t, priority) {
  return (
    getPriorityConfig(t)[priority]?.label
    ?? getPriorityConfig(t)[String(priority || "").toLowerCase()]?.label
    ?? priority
  );
}
