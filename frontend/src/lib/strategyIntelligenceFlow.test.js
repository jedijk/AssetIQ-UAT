import {
  buildStrategyFlowNodes,
  normalizeScheduleProgramRow,
  matchesThreadSelectionRow,
  resolveThreadSelectionFromTask,
} from "./strategyIntelligenceFlow";

describe("buildStrategyFlowNodes", () => {
  const baseStrategy = {
    failure_mode_strategies: [
      { failure_mode_id: "fm-1", failure_mode_name: "Seal leak", task_ids: ["t1"] },
      { failure_mode_id: "fm-2", failure_mode_name: "Bearing wear", task_ids: ["t2"] },
    ],
    task_templates: [
      { id: "t1", name: "Inspect seal" },
      { id: "t2", name: "Lubricate bearing" },
      { id: "t3", name: "General walkdown" },
    ],
  };

  it("scopes downstream nodes to a selected failure mode", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      equipmentTypeId: "pump_centrifugal",
      equipmentTypeName: "Centrifugal Pump",
      strategy: baseStrategy,
      failureModeItems: [
        { id: "fm-1", name: "Seal leak" },
        { id: "fm-2", name: "Bearing wear" },
      ],
      selectedFailureModeId: "fm-1",
      scheduleProgramItems: [
        { id: "s1", task_name: "Inspect seal", failure_mode_id: "fm-1" },
      ],
      stats: {
        failure_modes: { count: 2 },
        equipment_types: { in_use: 1 },
        strategies: { count: 1 },
        maintenance_programs: { active: 4 },
        schedules: { for_applied: 10 },
      },
    });

    expect(nodes.find((node) => node.key === "failure_modes").count).toBe(1);
    expect(nodes.find((node) => node.key === "strategies").count).toBe(1);
    expect(nodes.find((node) => node.key === "programs").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").count).toBe(1);
  });

  it("uses schedule program items and filters by failure mode", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      strategyItemsOverride: [
        { id: "bearing_radial", name: "Radial Bearing" },
        { id: "pump_centrifugal", name: "Centrifugal Pump" },
      ],
      strategiesList: [
        { equipment_type_id: "bearing_radial", status: "active" },
        { equipment_type_id: "pump_centrifugal", status: "disabled" },
      ],
      failureModeItems: [{ id: "fm-1", name: "Seal leak" }],
      selectedFailureModeIds: ["fm-1"],
      strategy: baseStrategy,
      scheduleProgramItems: [
        { id: "s1", task_name: "Inspect seal", failure_mode_id: "fm-1" },
        { id: "s2", task_name: "Lubricate bearing", failure_mode_id: "fm-2" },
        { id: "s3", task_name: "Other task" },
      ],
      stats: {
        strategies: { count: 3 },
        maintenance_programs: { active: 8 },
        schedules: { for_applied: 230 },
        planned_work: { for_applied: 230 },
      },
    });

    expect(nodes.find((node) => node.key === "strategies").count).toBe(1);
    expect(nodes.find((node) => node.key === "programs").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").items[0].name).toBe("Inspect seal");
  });

  it("counts one program when multiple tasks are linked to a selected failure mode", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      equipmentTypeId: "bearing_radial",
      equipmentTypeName: "Radial Bearing",
      strategy: {
        failure_mode_strategies: [
          {
            failure_mode_id: "fm-1",
            failure_mode_name: "Bearing Fatigue",
            task_ids: ["t1", "t2"],
            enabled: true,
          },
        ],
        task_templates: [
          { id: "t1", name: "Check bearing temperatures", is_mandatory: true },
          { id: "t2", name: "Ensure proper lubrication", is_mandatory: true },
        ],
      },
      failureModeItems: [{ id: "fm-1", name: "Bearing Fatigue" }],
      selectedFailureModeIds: ["fm-1"],
      scheduleProgramItems: [
        { id: "s1", task_name: "Check bearing temperatures", failure_mode_id: "fm-1" },
        { id: "s2", task_name: "Ensure proper lubrication", failure_mode_id: "fm-1" },
      ],
    });

    expect(nodes.find((node) => node.key === "programs").count).toBe(1);
    expect(nodes.find((node) => node.key === "programs").items[0].name).toBe("Radial Bearing");
    expect(nodes.find((node) => node.key === "schedules").count).toBe(2);
  });

  it("excludes disabled strategies and inactive programs from upstream nodes", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "programs",
      strategy: {
        status: "disabled",
        failure_mode_strategies: [
          { failure_mode_id: "fm-1", task_ids: ["t1"], enabled: true },
        ],
        task_templates: [
          { id: "t1", name: "Inspect seal", is_mandatory: true },
          { id: "t2", name: "Disabled task", is_mandatory: false },
        ],
      },
      equipmentTypeId: "pump_centrifugal",
      equipmentTypeName: "Centrifugal Pump",
      scheduleProgramItems: [
        { id: "s1", task_name: "Inspect seal", failure_mode_id: "fm-1" },
        { id: "s2", task_name: "Lubricate bearing", failure_mode_id: "fm-2" },
      ],
      strategiesList: [
        { equipment_type_id: "pump_centrifugal", status: "disabled" },
        { equipment_type_id: "motor_electric", status: "active" },
      ],
      stats: {
        strategies: { count: 2 },
        maintenance_programs: { active: 3, count: 5, active_tasks: 2 },
        schedules: { for_applied: 4 },
        planned_work: { for_applied: 12 },
      },
    });

    expect(nodes.find((node) => node.key === "strategies").count).toBe(0);
    expect(nodes.find((node) => node.key === "programs").count).toBe(0);
    expect(nodes.find((node) => node.key === "schedules").count).toBe(2);
  });

  it("uses local active schedule programs on the schedule page instead of open tasks", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "schedules",
      scheduleProgramItems: [],
      stats: {
        planned_work: { for_applied: 230 },
        schedules: { for_applied: 12 },
      },
    });

    expect(nodes.find((node) => node.key === "schedules").count).toBe(0);
  });

  it("falls back to active schedule stats when no local program items are provided", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      stats: {
        planned_work: { for_applied: 12 },
        schedules: { for_applied: 8 },
      },
    });

    expect(nodes.find((node) => node.key === "schedules").count).toBe(8);
  });

  it("projects schedule count from active schedulable strategy tasks on strategy view", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "strategies",
      equipmentTypeId: "bearing_radial",
      equipmentTypeName: "Radial Bearing",
      preferStrategyScheduleProjection: true,
      strategy: {
        failure_mode_strategies: [
          {
            failure_mode_id: "fm-1",
            failure_mode_name: "Bearing Failure",
            task_ids: ["t1", "t2", "t3"],
            enabled: true,
          },
          {
            failure_mode_id: "fm-2",
            failure_mode_name: "Bearing Fatigue",
            task_ids: ["t4"],
            enabled: false,
          },
        ],
        task_templates: [
          { id: "t1", name: "Check bearing temperatures", is_mandatory: true, task_type: "preventive" },
          { id: "t2", name: "Ensure proper lubrication", is_mandatory: true, task_type: "preventive" },
          { id: "t3", name: "Replace bearings proactively", is_mandatory: false, task_type: "preventive" },
          { id: "t4", name: "Disabled FM task", is_mandatory: true, task_type: "preventive" },
        ],
      },
      scheduleProgramItems: [{ id: "s1", task_name: "Check bearing temperatures" }],
    });

    expect(nodes.find((node) => node.key === "schedules").count).toBe(2);
    expect(nodes.find((node) => node.key === "schedules").items.map((item) => item.name)).toEqual([
      "Check bearing temperatures",
      "Ensure proper lubrication",
    ]);
  });

  it("fills strategy and program hover items from the strategies list", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      strategiesList: [
        {
          equipment_type_id: "bearing_radial",
          equipment_type_name: "Radial Bearing",
          status: "active",
        },
        {
          equipment_type_id: "pump_centrifugal",
          equipment_type_name: "Centrifugal Pump",
          status: "disabled",
        },
      ],
      stats: {
        strategies: { count: 1 },
        maintenance_programs: { active: 1 },
        schedules: { for_applied: 2 },
      },
    });

    expect(nodes.find((node) => node.key === "strategies").items).toEqual([
      { id: "bearing_radial", name: "Radial Bearing" },
    ]);
    expect(nodes.find((node) => node.key === "programs").items).toEqual([
      { id: "bearing_radial", name: "Radial Bearing" },
    ]);
  });

  it("enriches schedule thread relations on the schedule view", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "schedules",
      equipmentTypeId: "bearing_radial",
      equipmentTypeName: "Radial Bearing",
      failureModeItems: [{ id: "fm-1", name: "Bearing Failure" }],
      equipmentTypeItems: [{ id: "bearing_radial", name: "Radial Bearing" }],
      strategyItems: [{ id: "bearing_radial", name: "Radial Bearing" }],
      programItems: [{ id: "bearing_radial", name: "Radial Bearing" }],
      scheduleProgramItems: [
        normalizeScheduleProgramRow({
          id: "s1",
          v2_task_id: "t1",
          task_name: "Check bearing temperatures",
          failure_mode_id: "fm-1",
          failure_mode_name: "Bearing Failure",
          equipment_type_id: "bearing_radial",
          equipment_type_name: "Radial Bearing",
          equipment_name: "BRG-01",
        }),
      ],
    });

    const scheduleNode = nodes.find((node) => node.key === "schedules");
    expect(scheduleNode.items[0].relations.failureMode).toBe("Bearing Failure");
    expect(scheduleNode.items[0].relations.equipment).toBe("BRG-01");

    const failureModeNode = nodes.find((node) => node.key === "failure_modes");
    expect(failureModeNode.items[0].relations.schedules).toContain(
      "Check bearing temperatures",
    );
  });

  it("scopes all thread nodes to a selected schedule", () => {
    const scheduleRows = [
      normalizeScheduleProgramRow({
        id: "s1",
        v2_task_id: "t1",
        task_name: "Check bearing temperatures",
        failure_mode_id: "fm-1",
        failure_mode_name: "Bearing Failure",
        equipment_type_id: "bearing_radial",
        equipment_type_name: "Radial Bearing",
        equipment_id: "eq-1",
        equipment_name: "BRG-01",
      }),
      normalizeScheduleProgramRow({
        id: "s2",
        v2_task_id: "t2",
        task_name: "Lubricate bearing",
        failure_mode_id: "fm-2",
        failure_mode_name: "Seal leak",
        equipment_type_id: "bearing_radial",
        equipment_type_name: "Radial Bearing",
        equipment_id: "eq-2",
        equipment_name: "BRG-02",
      }),
    ];

    const threadSelection = scheduleRows[0];
    const nodes = buildStrategyFlowNodes({
      activeStep: "schedules",
      equipmentTypeId: "bearing_radial",
      equipmentTypeName: "Radial Bearing",
      failureModeItems: [
        { id: "fm-1", name: "Bearing Failure" },
        { id: "fm-2", name: "Seal leak" },
      ],
      equipmentTypeItems: [{ id: "bearing_radial", name: "Radial Bearing" }],
      scheduleProgramItems: scheduleRows,
      threadSelection,
    });

    expect(nodes.find((node) => node.key === "failure_modes").count).toBe(1);
    expect(nodes.find((node) => node.key === "equipment_types").count).toBe(1);
    expect(nodes.find((node) => node.key === "strategies").count).toBe(1);
    expect(nodes.find((node) => node.key === "programs").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").items[0].name).toBe(
      "Check bearing temperatures",
    );
  });

  it("resolves thread selection from a scheduled task click", () => {
    const scheduleRows = [
      normalizeScheduleProgramRow({
        id: "s1",
        task_name: "Inspect seal",
        failure_mode_id: "fm-1",
        equipment_type_id: "pump_centrifugal",
        equipment_id: "eq-9",
      }),
    ];

    const selection = resolveThreadSelectionFromTask(
      {
        id: "task-42",
        template_id: "s1",
        task_name: "Inspect seal",
        equipment_id: "eq-9",
        failure_mode_id: "fm-1",
      },
      scheduleRows,
      { equipmentTypeId: "pump_centrifugal", equipmentTypeName: "Centrifugal Pump" },
    );

    expect(matchesThreadSelectionRow(scheduleRows[0], selection)).toBe(true);
  });

  it("shows zero when global stats report no active schedules", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      stats: {
        planned_work: { for_applied: 230 },
        schedules: { for_applied: 0 },
      },
    });

    expect(nodes.find((node) => node.key === "schedules").count).toBe(0);
  });
});
