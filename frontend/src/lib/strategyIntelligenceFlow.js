/** Build intelligence thread nodes for the strategy flow bar. */

export const STRATEGY_FLOW_STEPS = [
  "failure_modes",
  "equipment_types",
  "strategies",
  "programs",
  "schedules",
];

const MAX_HOVER_ITEMS = 12;

function capItems(items = []) {
  const list = items.filter((item) => item?.name);
  if (list.length <= MAX_HOVER_ITEMS) return list;
  return [
    ...list.slice(0, MAX_HOVER_ITEMS),
    { id: "__more__", name: `+${list.length - MAX_HOVER_ITEMS} more` },
  ];
}

function linkedTasksForFailureMode(strategy, failureModeId) {
  if (!strategy || !failureModeId) return [];
  const fmRow = (strategy.failure_mode_strategies || []).find(
    (row) => row.failure_mode_id === failureModeId,
  );
  if (!fmRow) return [];
  const linkedIds = new Set((fmRow.task_ids || []).map(String));
  return (strategy.task_templates || []).filter((task) => {
    const taskId = String(task.id);
    if (linkedIds.has(taskId)) return true;
    return (task.failure_mode_ids || []).map(String).includes(String(failureModeId));
  });
}

export function buildStrategyFlowNodes({
  stats,
  activeStep,
  equipmentTypeId,
  equipmentTypeName,
  equipmentTypeItems = [],
  strategy,
  failureModeItems = [],
  selectedFailureModeId,
  selectedTask,
  scheduleTaskItems = [],
}) {
  const selectedFm = selectedFailureModeId
    ? failureModeItems.find((item) => item.id === selectedFailureModeId)
    : null;

  let fmItems = failureModeItems;
  if (selectedFm) {
    fmItems = [selectedFm];
  }
  const fmCount = selectedFm
    ? 1
    : failureModeItems.length || stats?.failure_modes?.count || 0;

  const etItems = equipmentTypeItems.length
    ? equipmentTypeItems
    : equipmentTypeId
      ? [{ id: equipmentTypeId, name: equipmentTypeName || equipmentTypeId }]
      : [];
  const etCount = etItems.length || (equipmentTypeId ? 1 : stats?.equipment_types?.in_use || 0);

  const linkedTasks = selectedFailureModeId
    ? linkedTasksForFailureMode(strategy, selectedFailureModeId)
    : strategy?.task_templates || [];

  const strategyItems = equipmentTypeId
    ? [{ id: equipmentTypeId, name: equipmentTypeName || "Strategy" }]
    : [];
  const strategyCount = equipmentTypeId
    ? stats?.strategies?.count > 0 || strategy ? 1 : 0
    : stats?.strategies?.count || 0;

  const programItems = linkedTasks.map((task) => ({
    id: task.id,
    name: task.name || task.task_name || "Task template",
  }));
  const programCount = selectedFailureModeId
    ? linkedTasks.length
    : stats?.maintenance_programs?.active ?? stats?.maintenance_programs?.count ?? 0;

  let scheduleItems = scheduleTaskItems;
  if (selectedTask) {
    scheduleItems = [
      {
        id: selectedTask.id,
        name: selectedTask.task_name || selectedTask.name || "Scheduled task",
      },
    ];
  }
  const scheduleCount = selectedTask
    ? 1
    : stats?.planned_work?.for_applied
      ?? stats?.schedules?.for_applied
      ?? stats?.schedules?.count
      ?? scheduleTaskItems.length
      ?? 0;

  const nodes = {
    failure_modes: {
      key: "failure_modes",
      count: fmCount,
      items: capItems(fmItems),
    },
    equipment_types: {
      key: "equipment_types",
      count: etCount,
      items: capItems(etItems),
    },
    strategies: {
      key: "strategies",
      count: strategyCount,
      items: capItems(strategyItems),
    },
    programs: {
      key: "programs",
      count: programCount,
      items: capItems(programItems),
    },
    schedules: {
      key: "schedules",
      count: scheduleCount,
      items: capItems(scheduleItems),
    },
  };

  return STRATEGY_FLOW_STEPS.map((key) => ({
    ...nodes[key],
    active: activeStep === key,
  }));
}
