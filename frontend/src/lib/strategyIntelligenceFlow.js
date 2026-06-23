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

function mapScheduleItems(tasks) {
  return (tasks || []).map((task) => ({
    id: task.id,
    name: task.task_name || task.name || "Scheduled task",
  }));
}

function mapTaskItems(tasks) {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name || task.task_name || "Task template",
  }));
}

/** Strategy is active when not explicitly disabled. */
export function isStrategyActive(strategy) {
  if (!strategy) return false;
  return strategy.status !== "disabled";
}

/**
 * Program task is active when mandatory and linked to at least one enabled FM (if linked).
 * Mirrors MaintenanceStrategyManager task toggle rules.
 */
export function isStrategyProgramTaskActive(task, failureModeStrategies = []) {
  if (!task?.id) return true;
  if (task.is_mandatory === false) return false;
  const linkedFms = failureModeStrategies.filter((fm) =>
    (fm?.task_ids || []).includes(task.id),
  );
  if (!linkedFms.length) return true;
  return linkedFms.some((fm) => fm?.enabled !== false);
}

export function filterActiveProgramTasks(tasks, failureModeStrategies = []) {
  return (tasks || []).filter((task) =>
    isStrategyProgramTaskActive(task, failureModeStrategies),
  );
}

const INACTIVE_SCHEDULE_STATUSES = new Set(["completed", "cancelled"]);

export function isActiveScheduleTask(task) {
  const status = task?.status;
  if (!status) return true;
  return !INACTIVE_SCHEDULE_STATUSES.has(status);
}

export function filterActiveScheduleTasks(tasks) {
  return (tasks || []).filter(isActiveScheduleTask);
}

function filterActiveStrategyItems(items, strategiesList = []) {
  if (!items?.length) return [];
  if (!strategiesList.length) return items;
  const activeTypeIds = new Set(
    strategiesList
      .filter((row) => row.status !== "disabled")
      .map((row) => String(row.equipment_type_id)),
  );
  return items.filter((item) => activeTypeIds.has(String(item.id)));
}

function countActiveStrategies(strategiesList, stats) {
  if (strategiesList?.length) {
    return strategiesList.filter((row) => row.status !== "disabled").length;
  }
  return stats?.strategies?.count || 0;
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
  scheduleTaskItems,
  strategiesList = [],
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

  const failureModeStrategies = strategy?.failure_mode_strategies || [];
  const strategyIsActive = isStrategyActive(strategy);
  const linkedTasks = hasSelection
    ? linkedTasksForFailureModes(strategy, failureModeIds)
    : strategy?.task_templates || [];
  const activeLinkedTasks = strategyIsActive
    ? filterActiveProgramTasks(linkedTasks, failureModeStrategies)
    : [];
  const activeProgramTasks = strategyIsActive
    ? filterActiveProgramTasks(strategy?.task_templates || [], failureModeStrategies)
    : [];
  const hasLocalScheduleTasks = scheduleTaskItems !== undefined;
  const activeScheduleTaskItems = filterActiveScheduleTasks(scheduleTaskItems ?? []);

  let strategyItems = [];
  let strategyCount = 0;
  if (strategyItemsOverride?.length) {
    strategyItems = filterActiveStrategyItems(strategyItemsOverride, strategiesList);
    strategyCount = strategyItems.length;
  } else if (hasSelection) {
    if (equipmentTypeId && strategy && isStrategyActive(strategy)) {
      const fmInStrategy = failureModeStrategies.some((fm) =>
        failureModeIds.includes(String(fm.failure_mode_id)),
      );
      if (fmInStrategy) {
        strategyItems = [{ id: equipmentTypeId, name: equipmentTypeName || "Strategy" }];
        strategyCount = 1;
      }
    }
  } else if (equipmentTypeId) {
    if (isStrategyActive(strategy)) {
      strategyCount = 1;
      strategyItems = [{ id: equipmentTypeId, name: equipmentTypeName || "Strategy" }];
    }
  } else {
    strategyCount = countActiveStrategies(strategiesList, stats);
  }

  const programItems = hasSelection
    ? mapTaskItems(activeLinkedTasks)
    : activeProgramTasks.length
      ? mapTaskItems(activeProgramTasks)
      : [];
  const programCount = hasSelection
    ? activeLinkedTasks.length
    : equipmentTypeId || strategy
      ? activeProgramTasks.length
      : stats?.maintenance_programs?.active_tasks
        ?? stats?.maintenance_programs?.active
        ?? programItems.length
        ?? 0;

  let scheduleItems = activeScheduleTaskItems;
  if (selectedTask && isActiveScheduleTask(selectedTask)) {
    scheduleItems = [
      {
        id: selectedTask.id,
        name: selectedTask.task_name || selectedTask.name || "Scheduled task",
      },
    ];
  } else if (selectedTask) {
    scheduleItems = [];
  } else if (hasSelection) {
    const filteredSchedules = filterActiveScheduleTasks(
      filterScheduleTasks(activeScheduleTaskItems, failureModeIds, activeLinkedTasks),
    );
    if (filteredSchedules.length) {
      scheduleItems = filteredSchedules.map((task) => ({
        id: task.id,
        name: task.task_name || task.name || "Scheduled task",
      }));
    } else if (activeLinkedTasks.length) {
      scheduleItems = mapTaskItems(activeLinkedTasks);
    } else {
      scheduleItems = [];
    }
  } else {
    scheduleItems = mapScheduleItems(activeScheduleTaskItems);
  }

  const scheduleCount = selectedTask
    ? (isActiveScheduleTask(selectedTask) ? 1 : 0)
    : hasSelection
      ? scheduleItems.length
      : hasLocalScheduleTasks
        ? activeScheduleTaskItems.length
        : equipmentTypeId || strategy
          ? activeScheduleTaskItems.length
          : stats?.planned_work?.for_applied ?? 0;

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
