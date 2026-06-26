/** Pure filter helpers for maintenance strategy views. */
export function filterFailureModeStrategies(fmStrategies, searchQuery) {
  const rows = fmStrategies || [];
  if (!searchQuery) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter((fm) => fm.failure_mode_name?.toLowerCase().includes(q));
}

export function filterTaskTemplates(tasks, searchQuery) {
  const rows = tasks || [];
  if (!searchQuery) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter(
    (task) =>
      task.name?.toLowerCase().includes(q) ||
      task.description?.toLowerCase().includes(q) ||
      task.task_type?.toLowerCase().includes(q),
  );
}

/**
 * A strategy task is active when mandatory and linked to at least one enabled FM strategy.
 */
export function isStrategyTaskActive(task, failureModeStrategies = []) {
  if (!task?.id) return true;
  if (task.is_mandatory === false) return false;
  const linkedFms = failureModeStrategies.filter((fm) =>
    (fm?.task_ids || []).includes(task.id),
  );
  if (!linkedFms.length) return true;
  return linkedFms.some((fm) => fm?.enabled !== false);
}
