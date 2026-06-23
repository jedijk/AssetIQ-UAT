import { buildStrategyFlowNodes } from "./strategyIntelligenceFlow";

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

  it("uses strategy overrides and filters scheduled tasks by failure mode", () => {
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
      scheduleTaskItems: [
        { id: "s1", task_name: "Inspect seal", failure_mode_id: "fm-1" },
        { id: "s2", task_name: "Lubricate bearing", failure_mode_id: "fm-2" },
        { id: "s3", task_name: "Other task" },
      ],
      stats: {
        strategies: { count: 3 },
        maintenance_programs: { active: 8 },
        schedules: { for_applied: 230 },
      },
    });

    expect(nodes.find((node) => node.key === "strategies").count).toBe(1);
    expect(nodes.find((node) => node.key === "programs").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").items[0].name).toBe("Inspect seal");
  });

  it("excludes disabled strategies, inactive programs, and completed schedules", () => {
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
      scheduleTaskItems: [
        { id: "s1", task_name: "Open task", status: "scheduled" },
        { id: "s2", task_name: "Done task", status: "completed" },
      ],
      strategiesList: [
        { equipment_type_id: "pump_centrifugal", status: "disabled" },
        { equipment_type_id: "motor_electric", status: "active" },
      ],
      stats: {
        strategies: { count: 2 },
        maintenance_programs: { active: 3, count: 5, active_tasks: 2 },
        planned_work: { for_applied: 4 },
      },
    });

    expect(nodes.find((node) => node.key === "strategies").count).toBe(0);
    expect(nodes.find((node) => node.key === "programs").count).toBe(0);
    expect(nodes.find((node) => node.key === "schedules").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").items[0].name).toBe("Open task");
  });

  it("uses local schedule tasks on the schedule page instead of global stats", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "schedules",
      scheduleTaskItems: [],
      stats: {
        planned_work: { for_applied: 230 },
        schedules: { for_applied: 230 },
      },
    });

    expect(nodes.find((node) => node.key === "schedules").count).toBe(0);
  });

  it("falls back to global open-task stats when no local schedule tasks are provided", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      stats: {
        planned_work: { for_applied: 12 },
        schedules: { for_applied: 230 },
      },
    });

    expect(nodes.find((node) => node.key === "schedules").count).toBe(12);
  });

  it("shows zero when global stats report no open scheduled tasks", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      stats: {
        planned_work: { for_applied: 0 },
        schedules: { for_applied: 230 },
      },
    });

    expect(nodes.find((node) => node.key === "schedules").count).toBe(0);
  });
});
