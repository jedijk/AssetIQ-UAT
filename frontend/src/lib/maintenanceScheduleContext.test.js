import {
  buildStrategyLibraryUrl,
  hierarchySearchQueryForScheduleRow,
  pickScheduledTaskForDialog,
  taskNamesMatch,
} from "./maintenanceScheduleContext";

describe("maintenanceScheduleContext", () => {
  test("pickScheduledTaskForDialog prefers active occurrence", () => {
    const row = {
      occurrences: [
        { id: "a", status: "cancelled" },
        { id: "b", status: "scheduled" },
      ],
    };
    expect(pickScheduledTaskForDialog(row)?.id).toBe("b");
  });

  test("taskNamesMatch ignores bracket suffix", () => {
    expect(taskNamesMatch("Ensure lubrication [Rotating]", "ensure lubrication")).toBe(true);
  });

  test("hierarchySearchQueryForScheduleRow prefers equipment tag", () => {
    expect(
      hierarchySearchQueryForScheduleRow({
        _equipmentTag: "1F-3001-0129",
        _equipmentName: "Motor TRF1",
      }),
    ).toBe("1F-3001-0129");
  });

  test("buildStrategyLibraryUrl encodes highlight params", () => {
    const url = buildStrategyLibraryUrl({
      equipmentTypeId: "etype-1",
      failureModeId: "fm-1",
      taskName: "Lubricate bearings",
    });
    expect(url).toContain("tab=maintenance");
    expect(url).toContain("equipment_type_id=etype-1");
    expect(url).toContain("highlight_failure_mode_id=fm-1");
    expect(url).toContain("highlight_task_name=Lubricate");
  });
});
