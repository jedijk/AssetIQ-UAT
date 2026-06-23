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

function resolveSelectedFailureModeIds(selectedFailureModeId, selectedFailureModeIds) {
  if (selectedFailureModeIds?.length) {
    return selectedFailureModeIds.map(String);
  }
  if (selectedFailureModeId) {
    return [String(selectedFailureModeId)];
  }
  return [];
}

function linkedTasksForFailureMode(strategy, failureModeId) {
  if (!strategy || !failureModeId) return [];
  const fmRow = (strategy.failure_mode_strategies || []).find(
    (row) => String(row.failure_mode_id) === String(failureModeId),
  );
  if (!fmRow) return [];
  const linkedIds = new Set((fmRow.task_ids || []).map(String));
  return (strategy.task_templates || []).filter((task) => {
    const taskId = String(task.id);
    if (linkedIds.has(taskId)) return true;
    return (task.failure_mode_ids || []).map(String).includes(String(failureModeId));
  });
}

function linkedTasksForFailureModes(strategy, failureModeIds) {
  if (!strategy || !failureModeIds.length) return [];
  const byId = new Map();
  failureModeIds.forEach((fmId) => {
    linkedTasksForFailureMode(strategy, fmId).forEach((task) => {
      byId.set(String(task.id), task);
    });
  });
  return [...byId.values()];
}

function taskMatchesFailureModeSelection(task, failureModeIds, linkedTasks) {
  if (!failureModeIds.length) return true;

  const fmIdSet = new Set(failureModeIds);
  if (task?.failure_mode_id && fmIdSet.has(String(task.failure_mode_id))) {
    return true;
  }

  const templateIds = new Set(linkedTasks.map((row) => String(row.id)));
  if (task?.template_id && templateIds.has(String(task.template_id))) return true;
  if (task?.strategy_task_id && templateIds.has(String(task.strategy_task_id))) return true;
  if (task?.id && templateIds.has(String(task.id))) return true;

  const templateNames = new Set(
    linkedTasks
      .map((row) => (row.name || row.task_name || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const taskName = (task?.task_name || task?.name || "").trim().toLowerCase();
  return Boolean(taskName && templateNames.has(taskName));
}

function filterScheduleTasks(scheduleTaskItems, failureModeIds, linkedTasks) {
  if (!failureModeIds.length) return scheduleTaskItems || [];
  return (scheduleTaskItems || []).filter((task) =>
    taskMatchesFailureModeSelection(task, failureModeIds, linkedTasks),
  );
}

function mapTaskItems(tasks) {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name || task.task_name || "Task template",
  }));
}

export function buildStrategyFlowNodes({
  stats,
  activeStep,
  equipmentTypeId,
  equipmentTypeName,
  equipmentTypeItems = [],
  strategyItemsOverride,
  strategy,
  failureModeItems = [],
  selectedFailureModeId,
  selectedFailureModeIds = [],
  selectedTask,
  scheduleTaskItems = [],
}) {
  const failureModeIds = resolveSelectedFailureModeIds(
    selectedFailureModeId,
    selectedFailureModeIds,
  );
  const hasSelection = failureModeIds.length > 0;

  const selectedFmItems = hasSelection
    ? failureModeItems.filter((item) => failureModeIds.includes(String(item.id)))
    : failureModeItems;
  const fmItems = hasSelection ? selectedFmItems : failureModeItems;
  const fmCount = hasSelection
    ? selectedFmItems.length
    : failureModeItems.length || stats?.failure_modes?.count || 0;

  let etItems = equipmentTypeItems;
  if (!etItems.length && equipmentTypeId) {
    etItems = [{ id: equipmentTypeId, name: equipmentTypeName || equipmentTypeId }];
  }
  if (hasSelection && equipmentTypeItems.length) {
    etItems = equipmentTypeItems;
  }
  const etCount = etItems.length || (equipmentTypeId ? 1 : stats?.equipment_types?.in_use || 0);

  const linkedTasks = hasSelection
    ? linkedTasksForFailureModes(strategy, failureModeIds)
    : strategy?.task_templates || [];

  let strategyItems = [];
  let strategyCount = 0;
  if (strategyItemsOverride?.length) {
    strategyItems = strategyItemsOverride;
    strategyCount = strategyItemsOverride.length;
  } else if (hasSelection) {
    if (equipmentTypeId && strategy) {
      const fmInStrategy = (strategy.failure_mode_strategies || []).some((fm) =>
        failureModeIds.includes(String(fm.failure_mode_id)),
      );
      if (fmInStrategy) {
        strategyItems = [{ id: equipmentTypeId, name: equipmentTypeName || "Strategy" }];
        strategyCount = 1;
      }
    }
  } else if (equipmentTypeId) {
    strategyCount = stats?.strategies?.count > 0 || strategy ? 1 : 0;
    if (strategyCount > 0) {
      strategyItems = [{ id: equipmentTypeId, name: equipmentTypeName || "Strategy" }];
    }
  } else {
    strategyCount = stats?.strategies?.count || 0;
  }

  const programItems = hasSelection
    ? mapTaskItems(linkedTasks)
    : (strategy?.task_templates || []).length
      ? mapTaskItems(strategy.task_templates)
      : [];
  const programCount = hasSelection
    ? linkedTasks.length
    : stats?.maintenance_programs?.active ?? stats?.maintenance_programs?.count ?? programItems.length ?? 0;

  let scheduleItems = scheduleTaskItems;
  if (selectedTask) {
    scheduleItems = [
      {
        id: selectedTask.id,
        name: selectedTask.task_name || selectedTask.name || "Scheduled task",
      },
    ];
  } else if (hasSelection) {
    const filteredSchedules = filterScheduleTasks(
      scheduleTaskItems,
      failureModeIds,
      linkedTasks,
    );
    if (filteredSchedules.length) {
      scheduleItems = filteredSchedules.map((task) => ({
        id: task.id,
        name: task.task_name || task.name || "Scheduled task",
      }));
    } else if (linkedTasks.length) {
      scheduleItems = mapTaskItems(linkedTasks);
    } else {
      scheduleItems = [];
    }
  }

  const scheduleCount = selectedTask
    ? 1
    : hasSelection
      ? scheduleItems.length
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
