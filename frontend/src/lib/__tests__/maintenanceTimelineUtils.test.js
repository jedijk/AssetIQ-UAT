import {
  normalizeMaintenanceTaskName,
  maintenanceTimelineRowKey,
  dedupeTimelineOccurrences,
} from "../maintenanceTimelineUtils";

describe("normalizeMaintenanceTaskName", () => {
  it("strips trailing bracket suffix and lowercases", () => {
    expect(normalizeMaintenanceTaskName("Ensure proper lubrication [Rotating]")).toBe(
      "ensure proper lubrication",
    );
  });

  it("trims whitespace", () => {
    expect(normalizeMaintenanceTaskName("  Inspect seals [Static]  ")).toBe("inspect seals");
  });

  it("handles names without bracket suffix", () => {
    expect(normalizeMaintenanceTaskName("Replace filter")).toBe("replace filter");
  });

  it("returns empty string for falsy input", () => {
    expect(normalizeMaintenanceTaskName(null)).toBe("");
    expect(normalizeMaintenanceTaskName("")).toBe("");
  });
});

describe("maintenanceTimelineRowKey", () => {
  it("groups by equipment id and normalized task name", () => {
    const taskA = { task_name: "Ensure proper lubrication [Rotating]" };
    const taskB = { task_name: "Ensure proper lubrication [Rotating]" };
    const keyA = maintenanceTimelineRowKey("eq-1", taskA);
    const keyB = maintenanceTimelineRowKey("eq-1", taskB);
    expect(keyA).toBe("eq-1::ensure proper lubrication");
    expect(keyB).toBe(keyA);
  });

  it("accepts a raw task name string", () => {
    expect(maintenanceTimelineRowKey("eq-2", "Replace filter")).toBe("eq-2::replace filter");
  });

  it("keeps different equipment on separate keys", () => {
    const task = { task_name: "Inspect seals" };
    expect(maintenanceTimelineRowKey("eq-1", task)).not.toBe(
      maintenanceTimelineRowKey("eq-2", task),
    );
  });

  it("ignores maintenance_program_id differences", () => {
    const taskA = {
      maintenance_program_id: "prog-1",
      task_name: "Ensure proper lubrication [Rotating]",
    };
    const taskB = {
      maintenance_program_id: "prog-2",
      task_name: "Ensure proper lubrication [Rotating]",
    };
    expect(maintenanceTimelineRowKey("eq-1", taskA)).toBe(
      maintenanceTimelineRowKey("eq-1", taskB),
    );
  });
});

describe("dedupeTimelineOccurrences", () => {
  it("removes duplicates with same date and status", () => {
    const occurrences = [
      { id: "a", due_date: "2026-06-01", status: "open", maintenance_program_id: "p1" },
      { id: "b", due_date: "2026-06-01", status: "open", maintenance_program_id: "p2" },
      { id: "c", due_date: "2026-06-15", status: "open", maintenance_program_id: "p1" },
    ];
    const result = dedupeTimelineOccurrences(occurrences);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("c");
  });

  it("uses planned_date when present", () => {
    const occurrences = [
      { id: "a", planned_date: "2026-06-01", due_date: "2026-06-05", status: "open" },
      { id: "b", planned_date: "2026-06-01", due_date: "2026-06-10", status: "open" },
    ];
    expect(dedupeTimelineOccurrences(occurrences)).toHaveLength(1);
  });

  it("keeps occurrences with different status on same date", () => {
    const occurrences = [
      { id: "a", due_date: "2026-06-01", status: "open" },
      { id: "b", due_date: "2026-06-01", status: "completed" },
    ];
    expect(dedupeTimelineOccurrences(occurrences)).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(dedupeTimelineOccurrences([])).toEqual([]);
    expect(dedupeTimelineOccurrences(null)).toEqual([]);
  });
});
