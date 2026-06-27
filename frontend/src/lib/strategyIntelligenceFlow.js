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

function filterScheduleProgramItems(scheduleProgramItems, failureModeIds, linkedTasks) {
  if (!failureModeIds.length) return scheduleProgramItems || [];
  return (scheduleProgramItems || []).filter((row) =>
    taskMatchesFailureModeSelection(row, failureModeIds, linkedTasks),
  );
}

function mapScheduleProgramItems(programs) {
  return (programs || []).map((row) => ({
    id: row.id || row.v2_task_id,
    name: row.task_name || row.name || "Schedule",
    relations: buildScheduleUpstreamRelations(row),
    relationVariant: "upstream",
  }));
}

export function normalizeScheduleProgramRow(row) {
  if (!row) return null;
  return {
    id: row.id || row.v2_task_id,
    name: row.task_name || row.name || "Schedule",
    task_name: row.task_name || row.name,
    failure_mode_id: row.failure_mode_id,
    failure_mode_name: row.failure_mode_name,
    equipment_type_id: row.equipment_type_id,
    equipment_type_name: row.equipment_type_name,
    equipment_id: row.equipment_id,
    equipment_name: row.equipment_name,
    equipment_tag: row.equipment_tag,
    strategy_id: row.strategy_id,
    strategy_version: row.strategy_version,
    template_id: row.v2_task_id,
    strategy_task_id: row.v2_task_id,
  };
}

export function buildScheduleUpstreamRelations(row) {
  if (!row) return null;

  const failureMode = row.failure_mode_name || row.failure_mode_id || null;
  const equipmentType = row.equipment_type_name || row.equipment_type_id || null;
  const equipment = row.equipment_name || row.equipment_tag || row.equipment_id || null;
  const strategy = equipmentType
    ? row.strategy_version
      ? `${equipmentType} (v${row.strategy_version})`
      : equipmentType
    : row.strategy_id || null;
  const program = equipment || equipmentType || null;

  if (!failureMode && !equipmentType && !equipment && !strategy && !program) {
    return null;
  }

  return {
    failureMode,
    equipmentType,
    strategy,
    program,
    equipment,
  };
}

export function matchesThreadSelectionRow(row, selection) {
  if (!row || !selection) return false;
  if (selection.id && row.id && String(row.id) === String(selection.id)) return true;

  const selectionName = selection.task_name || selection.name;
  const rowName = row.task_name || row.name;
  if (!selectionName || !rowName || selectionName !== rowName) return false;

  if (selection.equipment_id && row.equipment_id) {
    return String(selection.equipment_id) === String(row.equipment_id);
  }

  return true;
}

export function resolveThreadSelectionFromTask(task, scheduleRows = [], defaults = {}) {
  if (!task) return null;

  const candidate = normalizeScheduleProgramRow({
    id: task.template_id || task.strategy_task_id || task.id,
    v2_task_id: task.template_id || task.strategy_task_id,
    task_name: task.task_name || task.name,
    failure_mode_id: task.failure_mode_id,
    failure_mode_name: task.failure_mode_name,
    equipment_type_id: task.equipment_type_id || defaults.equipmentTypeId,
    equipment_type_name: task.equipment_type_name || defaults.equipmentTypeName,
    equipment_id: task.equipment_id,
    equipment_name: task.equipment_name,
    equipment_tag: task.equipment_tag,
    strategy_id: task.strategy_id,
  });

  const matched = (scheduleRows || []).find((row) => matchesThreadSelectionRow(row, candidate));
  return matched || candidate;
}

export function scheduleTaskThreadRowId(task) {
  if (!task) return null;
  return (
    task.v2_task_id
    || task.program_task_id
    || task.maintenance_program_id
    || task.template_id
    || task.strategy_task_id
    || task.id
  );
}

export function matchesScheduleTaskToThreadSelection(task, selection) {
  if (!selection) return true;
  if (!task) return false;
  return matchesThreadSelectionRow(
    normalizeScheduleProgramRow({
      id: scheduleTaskThreadRowId(task),
      task_name: task.task_name || task.name,
      equipment_id: task.equipment_id,
      failure_mode_id: task.failure_mode_id,
    }),
    selection,
  );
}

function applyThreadSelectionScope({
  threadSelection,
  scheduleProgramItems,
  equipmentTypeId,
  equipmentTypeName,
  selectedFailureModeId,
  selectedFailureModeIds,
}) {
  if (!threadSelection) {
    return {
      equipmentTypeId,
      equipmentTypeName,
      scheduleProgramItems,
      selectedFailureModeId,
      selectedFailureModeIds,
    };
  }

  const narrowedScheduleItems =
    scheduleProgramItems === undefined
      ? [threadSelection]
      : (scheduleProgramItems ?? []).filter((row) =>
          matchesThreadSelectionRow(row, threadSelection),
        );

  return {
    equipmentTypeId: threadSelection.equipment_type_id || equipmentTypeId,
    equipmentTypeName:
      threadSelection.equipment_type_name || equipmentTypeName || equipmentTypeId,
    scheduleProgramItems:
      narrowedScheduleItems.length > 0 ? narrowedScheduleItems : [threadSelection],
    selectedFailureModeId: threadSelection.failure_mode_id || selectedFailureModeId,
    selectedFailureModeIds: threadSelection.failure_mode_id
      ? [String(threadSelection.failure_mode_id)]
      : selectedFailureModeIds,
  };
}

function enrichItemsWithLinkedSchedules(items, scheduleRows, matchItem) {
  return (items || []).map((item) => {
    const related = scheduleRows.filter((row) => matchItem(item, row));
    if (!related.length) return item;

    const scheduleNames = [
      ...new Set(related.map((row) => row.task_name || row.name).filter(Boolean)),
    ];

    return {
      ...item,
      relations: {
        schedules: scheduleNames,
        scheduleCount: related.length,
      },
      relationVariant: "downstream",
    };
  });
}

function enrichNodesForScheduleThread({
  activeStep,
  scheduleRows,
  failureModeItems,
  equipmentTypeItems,
  strategyItems,
  programItems,
  scheduleItems,
}) {
  if (activeStep !== "schedules" || !scheduleRows?.length) {
    return {
      failureModeItems,
      equipmentTypeItems,
      strategyItems,
      programItems,
      scheduleItems,
    };
  }

  return {
    failureModeItems: enrichItemsWithLinkedSchedules(
      failureModeItems,
      scheduleRows,
      (item, row) =>
        item.id &&
        row.failure_mode_id &&
        String(row.failure_mode_id) === String(item.id),
    ),
    equipmentTypeItems: enrichItemsWithLinkedSchedules(
      equipmentTypeItems,
      scheduleRows,
      (item, row) =>
        item.id &&
        row.equipment_type_id &&
        String(row.equipment_type_id) === String(item.id),
    ),
    strategyItems: enrichItemsWithLinkedSchedules(
      strategyItems,
      scheduleRows,
      (item, row) =>
        item.id &&
        row.equipment_type_id &&
        String(row.equipment_type_id) === String(item.id),
    ),
    programItems: enrichItemsWithLinkedSchedules(
      programItems,
      scheduleRows,
      (item, row) =>
        (item.id &&
          row.equipment_type_id &&
          String(row.equipment_type_id) === String(item.id)) ||
        (item.id &&
          row.equipment_id &&
          String(row.equipment_id) === String(item.id)) ||
        (item.name &&
          row.equipment_name &&
          String(row.equipment_name).toLowerCase() === String(item.name).toLowerCase()),
    ),
    scheduleItems: (scheduleItems || []).map((item) => {
      const row = scheduleRows.find(
        (candidate) => String(candidate.id || candidate.v2_task_id) === String(item.id),
      );
      return {
        ...item,
        relations: buildScheduleUpstreamRelations(row || item),
        relationVariant: "upstream",
      };
    }),
  };
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

const NON_SCHEDULABLE_TASK_TYPES = new Set(["reactive", "corrective"]);
const NON_SCHEDULABLE_FREQUENCIES = new Set(["not_required", "hourly", "shift"]);

/** Task templates that would produce a recurring schedule when strategy is applied. */
export function isSchedulableStrategyTask(task) {
  if (!task?.id) return false;
  if (task.is_mandatory === false) return false;

  const taskType = String(task.task_type || task.task_category || "preventive").toLowerCase();
  if (NON_SCHEDULABLE_TASK_TYPES.has(taskType)) return false;

  const matrix = task.frequency_matrix || {};
  const frequencies = [matrix.low, matrix.medium, matrix.high].filter(Boolean);
  if (
    frequencies.length > 0 &&
    frequencies.every((freq) => NON_SCHEDULABLE_FREQUENCIES.has(String(freq).toLowerCase()))
  ) {
    return false;
  }

  const directFrequency = task.frequency ? String(task.frequency).toLowerCase() : null;
  if (directFrequency && NON_SCHEDULABLE_FREQUENCIES.has(directFrequency)) {
    return false;
  }

  return true;
}

export function filterSchedulableStrategyTasks(tasks, failureModeStrategies = []) {
  return filterActiveProgramTasks(tasks, failureModeStrategies).filter(isSchedulableStrategyTask);
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

function mapStrategyListItems(strategiesList) {
  return (strategiesList || [])
    .filter((row) => row.status !== "disabled")
    .map((row) => ({
      id: row.equipment_type_id,
      name: row.equipment_type_name || row.equipment_type_id,
    }))
    .filter((item) => item.id);
}

function resolveScopedProgramCount({
  strategyIsActive,
  hasActiveProgramTasks,
}) {
  return strategyIsActive && hasActiveProgramTasks ? 1 : 0;
}

function resolveProgramItems({
  programCount,
  equipmentTypeId,
  equipmentTypeName,
  hasSelection,
  activeLinkedTasks,
  activeProgramTasks,
}) {
  if (!programCount) return [];
  if (equipmentTypeId) {
    return [
      {
        id: equipmentTypeId,
        name: equipmentTypeName || "Maintenance program",
      },
    ];
  }
  const tasks = hasSelection ? activeLinkedTasks : activeProgramTasks;
  return mapTaskItems(tasks);
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
  scheduleProgramItems,
  scheduleTaskItems,
  strategiesList = [],
  preferStrategyScheduleProjection = false,
  threadSelection = null,
}) {
  const scoped = applyThreadSelectionScope({
    threadSelection,
    scheduleProgramItems,
    equipmentTypeId,
    equipmentTypeName,
    selectedFailureModeId,
    selectedFailureModeIds,
  });

  const failureModeIds = resolveSelectedFailureModeIds(
    scoped.selectedFailureModeId,
    scoped.selectedFailureModeIds,
  );
  const hasSelection = failureModeIds.length > 0;

  const selectedFmItems = hasSelection
    ? failureModeItems.filter((item) => failureModeIds.includes(String(item.id)))
    : failureModeItems;
  let fmItems = hasSelection ? selectedFmItems : failureModeItems;
  let fmCount = hasSelection
    ? selectedFmItems.length
    : failureModeItems.length || stats?.failure_modes?.count || 0;

  if (threadSelection && !hasSelection && (threadSelection.failure_mode_id || threadSelection.failure_mode_name)) {
    fmItems = [
      {
        id: threadSelection.failure_mode_id || "selected",
        name: threadSelection.failure_mode_name || threadSelection.failure_mode_id || "Failure mode",
      },
    ];
    fmCount = 1;
  } else if (threadSelection && hasSelection && selectedFmItems.length === 0 && threadSelection.failure_mode_name) {
    fmItems = [
      {
        id: threadSelection.failure_mode_id || "selected",
        name: threadSelection.failure_mode_name,
      },
    ];
    fmCount = 1;
  }

  let etItems = equipmentTypeItems;
  if (!etItems.length && scoped.equipmentTypeId) {
    etItems = [{ id: scoped.equipmentTypeId, name: scoped.equipmentTypeName || scoped.equipmentTypeId }];
  }
  if (hasSelection && equipmentTypeItems.length) {
    etItems = equipmentTypeItems;
  }
  if (threadSelection?.equipment_type_id) {
    etItems = [
      {
        id: threadSelection.equipment_type_id,
        name:
          threadSelection.equipment_type_name ||
          scoped.equipmentTypeName ||
          threadSelection.equipment_type_id,
      },
    ];
  }
  const etCount = etItems.length || (scoped.equipmentTypeId ? 1 : stats?.equipment_types?.in_use || 0);

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
  const projectedScheduleTasks = strategyIsActive
    ? filterSchedulableStrategyTasks(
        hasSelection ? activeLinkedTasks : strategy?.task_templates || [],
        failureModeStrategies,
      )
    : [];
  const hasLocalSchedulePrograms = scoped.scheduleProgramItems !== undefined;
  const activeSchedulePrograms = scoped.scheduleProgramItems ?? [];

  let strategyItems = [];
  let strategyCount = 0;
  if (strategyItemsOverride?.length) {
    strategyItems = filterActiveStrategyItems(strategyItemsOverride, strategiesList);
    strategyCount = strategyItems.length;
  } else if (hasSelection || threadSelection) {
    if (scoped.equipmentTypeId && (strategy ? isStrategyActive(strategy) : !!threadSelection)) {
      const fmInStrategy =
        !strategy ||
        !hasSelection ||
        failureModeStrategies.some((fm) =>
          failureModeIds.includes(String(fm.failure_mode_id)),
        );
      if (fmInStrategy) {
        strategyItems = [{ id: scoped.equipmentTypeId, name: scoped.equipmentTypeName || "Strategy" }];
        strategyCount = 1;
      }
    }
  } else if (scoped.equipmentTypeId) {
    if (isStrategyActive(strategy)) {
      strategyCount = 1;
      strategyItems = [{ id: scoped.equipmentTypeId, name: scoped.equipmentTypeName || "Strategy" }];
    }
  } else {
    strategyCount = countActiveStrategies(strategiesList, stats);
  }

  const hasActiveProgramTasks = hasSelection
    ? activeLinkedTasks.length > 0
    : activeProgramTasks.length > 0;
  const programCount = threadSelection
    ? 1
    : scoped.equipmentTypeId || strategy || hasSelection
      ? resolveScopedProgramCount({ strategyIsActive, hasActiveProgramTasks })
      : stats?.maintenance_programs?.active
        ?? stats?.maintenance_programs?.count
        ?? 0;
  let programItems = resolveProgramItems({
    programCount,
    equipmentTypeId: scoped.equipmentTypeId,
    equipmentTypeName: scoped.equipmentTypeName,
    hasSelection,
    activeLinkedTasks,
    activeProgramTasks,
  });

  let scheduleItems = [];
  let scheduleCount = 0;
  const hasThreadSelection = !!threadSelection;

  if (hasThreadSelection && activeSchedulePrograms.length) {
    scheduleItems = mapScheduleProgramItems(activeSchedulePrograms);
    scheduleCount = activeSchedulePrograms.length;
  } else if (hasSelection) {
    const filteredSchedules = filterScheduleProgramItems(
      activeSchedulePrograms,
      failureModeIds,
      activeLinkedTasks,
    );
    if (filteredSchedules.length) {
      scheduleItems = mapScheduleProgramItems(filteredSchedules);
      scheduleCount = filteredSchedules.length;
    } else if (projectedScheduleTasks.length) {
      scheduleItems = mapTaskItems(projectedScheduleTasks);
      scheduleCount = projectedScheduleTasks.length;
    }
  } else if (
    preferStrategyScheduleProjection &&
    (scoped.equipmentTypeId || strategy) &&
    projectedScheduleTasks.length
  ) {
    scheduleItems = mapTaskItems(projectedScheduleTasks);
    scheduleCount = projectedScheduleTasks.length;
  } else if (hasLocalSchedulePrograms) {
    scheduleItems = mapScheduleProgramItems(activeSchedulePrograms);
    scheduleCount = activeSchedulePrograms.length;
  } else {
    scheduleCount = stats?.schedules?.for_applied ?? 0;
    if (scheduleTaskItems?.length) {
      scheduleItems = (scheduleTaskItems || [])
        .filter(isActiveScheduleTask)
        .map((task) => ({
          id: task.id,
          name: task.task_name || task.name || "Schedule",
        }));
    }
  }

  if (!strategyItems.length && strategyCount > 0) {
    strategyItems = mapStrategyListItems(strategiesList);
  }

  if (!programItems.length && programCount > 0) {
    if (threadSelection?.equipment_name || threadSelection?.equipment_id) {
      programItems = [
        {
          id: threadSelection.equipment_id || scoped.equipmentTypeId,
          name: threadSelection.equipment_name || threadSelection.equipment_tag || "Maintenance program",
        },
      ];
    } else if (scoped.equipmentTypeId) {
      programItems = [
        {
          id: scoped.equipmentTypeId,
          name: scoped.equipmentTypeName || "Maintenance program",
        },
      ];
    } else {
      programItems = mapStrategyListItems(strategiesList);
    }
  }

  const enrichedItems = enrichNodesForScheduleThread({
    activeStep,
    scheduleRows: activeSchedulePrograms,
    failureModeItems: fmItems,
    equipmentTypeItems: etItems,
    strategyItems,
    programItems,
    scheduleItems,
  });

  const nodes = {
    failure_modes: {
      key: "failure_modes",
      count: fmCount,
      items: capItems(enrichedItems.failureModeItems),
    },
    equipment_types: {
      key: "equipment_types",
      count: etCount,
      items: capItems(enrichedItems.equipmentTypeItems),
    },
    strategies: {
      key: "strategies",
      count: strategyCount,
      items: capItems(enrichedItems.strategyItems),
    },
    programs: {
      key: "programs",
      count: programCount,
      items: capItems(enrichedItems.programItems),
    },
    schedules: {
      key: "schedules",
      count: scheduleCount,
      items: capItems(enrichedItems.scheduleItems),
    },
  };

  return STRATEGY_FLOW_STEPS.map((key) => ({
    ...nodes[key],
    active: activeStep === key,
  }));
}
