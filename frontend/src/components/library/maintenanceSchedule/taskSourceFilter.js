/** PM Import rows on the maintenance schedule (pending import, not yet in strategy). */
export function isMaintenanceImportTask(task) {
  if (!task) return false;
  if (task.pm_import_incorporated) return false;
  if (task.task_source === "strategy_generated") return false;
  return task.task_source === "customer_imported" || !!task.pm_import_task_id;
}

/** Strategy-backed scheduled tasks (includes PM import merged into failure modes). */
export function isMaintenanceStrategyTask(task) {
  if (!task) return false;
  if (isMaintenanceImportTask(task)) return false;
  return (
    task.task_source === "strategy_generated" ||
    !!task.strategy_id ||
    task.pm_import_incorporated === true
  );
}

export function matchesMaintenanceSourceFilter(task, sourceFilter) {
  if (!sourceFilter || sourceFilter === "all") return true;
  if (sourceFilter === "import") return isMaintenanceImportTask(task);
  if (sourceFilter === "strategy") return isMaintenanceStrategyTask(task);
  return true;
}
