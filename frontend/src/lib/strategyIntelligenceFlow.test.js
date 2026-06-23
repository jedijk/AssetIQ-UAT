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

    expect(nodes.find((node) => node.key === "strategies").count).toBe(2);
    expect(nodes.find((node) => node.key === "programs").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").count).toBe(1);
    expect(nodes.find((node) => node.key === "schedules").items[0].name).toBe("Inspect seal");
  });
});
