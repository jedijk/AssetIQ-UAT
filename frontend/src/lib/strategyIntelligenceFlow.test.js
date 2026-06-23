import { buildStrategyFlowNodes } from "./strategyIntelligenceFlow";

describe("buildStrategyFlowNodes", () => {
  it("highlights the active step and scopes counts to a selected failure mode", () => {
    const nodes = buildStrategyFlowNodes({
      activeStep: "failure_modes",
      equipmentTypeId: "pump_centrifugal",
      equipmentTypeName: "Centrifugal Pump",
      strategy: {
        failure_mode_strategies: [
          { failure_mode_id: "fm-1", failure_mode_name: "Seal leak", task_ids: ["t1"] },
          { failure_mode_id: "fm-2", failure_mode_name: "Bearing wear", task_ids: [] },
        ],
        task_templates: [
          { id: "t1", name: "Inspect seal" },
          { id: "t2", name: "Lubricate bearing" },
        ],
      },
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

    const fmNode = nodes.find((node) => node.key === "failure_modes");
    const programNode = nodes.find((node) => node.key === "programs");

    expect(fmNode.active).toBe(true);
    expect(fmNode.count).toBe(1);
    expect(fmNode.items[0].name).toBe("Seal leak");
    expect(programNode.count).toBe(1);
    expect(programNode.items[0].name).toBe("Inspect seal");
  });
});
