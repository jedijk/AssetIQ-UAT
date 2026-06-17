/**
 * Strip trailing bracket suffix like "[Rotating]", trim, lowercase.
 */
export function normalizeMaintenanceTaskName(name) {
  if (!name) return "";
  return String(name)
    .replace(/\s*\[[^\]]+\]\s*$/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Stable row key for timeline display: one row per equipment + logical task title.
 */
export function maintenanceTimelineRowKey(equipmentId, task) {
  const taskName = typeof task === "string" ? task : task?.task_name;
  const normalized = normalizeMaintenanceTaskName(taskName);
  return `${equipmentId}::${normalized}`;
}

/**
 * Dedupe occurrences merged from duplicate maintenance programs.
 * Keeps the first occurrence per due/planned date + status.
 */
export function dedupeTimelineOccurrences(occurrences) {
  if (!occurrences?.length) return [];
  const seen = new Map();
  for (const occ of occurrences) {
    const date = occ.planned_date || occ.due_date || "";
    const key = `${date}::${occ.status ?? ""}`;
    if (!seen.has(key)) {
      seen.set(key, occ);
    }
  }
  return Array.from(seen.values());
}
