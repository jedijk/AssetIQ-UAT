import { normalizeMaintenanceTaskName } from "./maintenanceTimelineUtils";

/** Pick a scheduled-task occurrence suitable for the task details dialog. */
export function pickScheduledTaskForDialog(rowOrTask) {
  if (!rowOrTask) return null;
  if (rowOrTask.id && rowOrTask.status) return rowOrTask;

  const occurrences = rowOrTask.occurrences || [];
  if (!occurrences.length) return null;

  return (
    occurrences.find((occ) => occ.id && occ.status !== "cancelled") ||
    occurrences.find((occ) => occ.id) ||
    occurrences[0]
  );
}

export function taskNamesMatch(a, b) {
  if (!a || !b) return false;
  return normalizeMaintenanceTaskName(a) === normalizeMaintenanceTaskName(b);
}

export function isStrategyTaskHighlighted(task, highlight) {
  if (!highlight || !task) return false;
  if (highlight.taskTemplateId && task.id === highlight.taskTemplateId) return true;
  if (highlight.taskName && taskNamesMatch(task.name, highlight.taskName)) return true;
  return false;
}

export function buildStrategyLibraryUrl({ equipmentTypeId, failureModeId, taskName }) {
  const params = new URLSearchParams();
  params.set("tab", "maintenance");
  if (equipmentTypeId) params.set("equipment_type_id", equipmentTypeId);
  if (failureModeId) params.set("highlight_failure_mode_id", failureModeId);
  if (taskName) params.set("highlight_task_name", taskName);
  return `/library?${params.toString()}`;
}

/** Search query for the left equipment hierarchy (matches observation tag click). */
export function hierarchySearchQueryForScheduleRow(row) {
  if (!row) return "";
  const task = pickScheduledTaskForDialog(row);
  return (
    row._equipmentTag ||
    task?.equipment_tag ||
    row._equipmentName ||
    task?.equipment_name ||
    ""
  );
}
