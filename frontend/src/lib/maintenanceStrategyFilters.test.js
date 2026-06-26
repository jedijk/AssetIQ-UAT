import {
  filterFailureModeStrategies,
  filterTaskTemplates,
  isStrategyTaskActive,
} from "./maintenanceStrategyFilters";

describe("maintenanceStrategyFilters", () => {
  const fmStrategies = [
    { failure_mode_id: "fm-1", failure_mode_name: "Seal leak", task_ids: ["t1"], enabled: true },
    { failure_mode_id: "fm-2", failure_mode_name: "Bearing wear", task_ids: ["t2"], enabled: false },
  ];

  const tasks = [
    { id: "t1", name: "Inspect seal", task_type: "preventive", is_mandatory: true },
    { id: "t2", name: "Lubricate bearing", description: "Monthly grease", task_type: "preventive" },
    { id: "t3", name: "Walkdown", task_type: "inspection", is_mandatory: false },
  ];

  it("filters failure mode strategies by name", () => {
    expect(filterFailureModeStrategies(fmStrategies, "seal")).toHaveLength(1);
    expect(filterFailureModeStrategies(fmStrategies, "")).toHaveLength(2);
    expect(filterFailureModeStrategies(fmStrategies, "xyz")).toHaveLength(0);
  });

  it("filters task templates by name, description, or type", () => {
    expect(filterTaskTemplates(tasks, "lubricate")).toHaveLength(1);
    expect(filterTaskTemplates(tasks, "monthly")).toHaveLength(1);
    expect(filterTaskTemplates(tasks, "inspection")).toHaveLength(1);
  });

  it("marks tasks inactive when mandatory=false or only linked to disabled FM", () => {
    expect(isStrategyTaskActive(tasks[0], fmStrategies)).toBe(true);
    expect(isStrategyTaskActive(tasks[2], fmStrategies)).toBe(false);
    expect(isStrategyTaskActive(tasks[1], fmStrategies)).toBe(false);
    expect(isStrategyTaskActive({ id: "solo", name: "Standalone" }, fmStrategies)).toBe(true);
  });
});
