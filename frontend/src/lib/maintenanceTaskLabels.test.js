import {
  getTaskStatusConfig,
  getPriorityConfig,
  taskStatusLabel,
  priorityLabel,
} from "./maintenanceTaskLabels";

const t = (key) => {
  const map = {
    "maintenance.statusDraft": "Draft",
    "maintenance.statusCompleted": "Completed",
    "common.critical": "Critical",
    "common.high": "High",
    "common.medium": "Medium",
    "common.low": "Low",
  };
  return map[key] || key;
};

describe("getTaskStatusConfig", () => {
  it("returns labels for all statuses", () => {
    const cfg = getTaskStatusConfig(t);
    expect(cfg.draft.label).toBe("Draft");
    expect(cfg.completed.label).toBe("Completed");
    expect(Object.keys(cfg)).toContain("in_progress");
  });
});

describe("getPriorityConfig", () => {
  it("includes case variants", () => {
    const cfg = getPriorityConfig(t);
    expect(cfg.critical.label).toBe("Critical");
    expect(cfg.Critical.label).toBe("Critical");
    expect(cfg.high.label).toBe("High");
  });
});

describe("taskStatusLabel", () => {
  it("returns translated status", () => {
    expect(taskStatusLabel(t, "draft")).toBe("Draft");
  });

  it("falls back to raw status", () => {
    expect(taskStatusLabel(t, "unknown")).toBe("unknown");
  });
});

describe("priorityLabel", () => {
  it("resolves case-insensitive priority", () => {
    expect(priorityLabel(t, "High")).toBe("High");
    expect(priorityLabel(t, "critical")).toBe("Critical");
  });

  it("falls back to raw priority", () => {
    expect(priorityLabel(t, "urgent")).toBe("urgent");
  });
});
