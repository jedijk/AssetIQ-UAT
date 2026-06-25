const REPLACEMENT_KEYWORDS = ["replace", "replacement", "swap", "change out", "overhaul"];

function containsReplacementKeyword(...texts) {
  const combined = texts.filter(Boolean).join(" ").toLowerCase();
  return REPLACEMENT_KEYWORDS.some((keyword) => combined.includes(keyword));
}

export function taskConsumesSpareParts(task) {
  if (!task) return false;
  if (task.spare_part_requirements?.length) return true;
  if (task.consumes_spare_parts) return true;
  return containsReplacementKeyword(task.task_title, task.task_description);
}

export function actionConsumesSpareParts(action) {
  if (!action) return false;
  if (action.spare_part_requirements?.length) return true;
  if (action.consumes_spare_parts) return true;
  if (action.action_type === "CM") {
    return containsReplacementKeyword(action.title, action.description);
  }
  return containsReplacementKeyword(action.title, action.description);
}
