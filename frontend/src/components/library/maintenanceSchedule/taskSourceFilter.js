/** PM Import rows on the maintenance schedule. */
export function isMaintenanceImportTask(task) {
  if (!task) return false;
  return task.task_source === "customer_imported" || !!task.pm_import_task_id;
}

/** Strategy-backed scheduled tasks (excludes PM import). */
export function isMaintenanceStrategyTask(task) {
  if (!task || isMaintenanceImportTask(task)) return false;
  return (
    task.task_source === "strategy_generated" ||
    !!task.strategy_id
  );
}

export function matchesMaintenanceSourceFilter(task, sourceFilter) {
  if (!sourceFilter || sourceFilter === "all") return true;
  if (sourceFilter === "import") return isMaintenanceImportTask(task);
  if (sourceFilter === "strategy") return isMaintenanceStrategyTask(task);
  return true;
}
