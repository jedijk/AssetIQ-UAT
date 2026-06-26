import { queryKeys } from "./queryKeys";

describe("queryKeys.threats", () => {
  it("builds stable threat keys", () => {
    expect(queryKeys.threats.all()).toEqual(["threats"]);
    expect(queryKeys.threats.detail("t1")).toEqual(["threats", "t1"]);
    expect(queryKeys.threats.legacyDetail("t1")).toEqual(["threat", "t1"]);
    expect(queryKeys.threats.top(5)).toEqual(["top-observations", 5]);
  });
});

describe("queryKeys.actions", () => {
  it("builds action and linked keys", () => {
    expect(queryKeys.actions.linked("th-1")).toEqual(["actions", "linked", "th-1"]);
    expect(queryKeys.actions.linkedToThreat("th-1")).toEqual(["linked-actions", "th-1"]);
  });
});

describe("queryKeys.observationWorkspace", () => {
  it("includes language in detail key", () => {
    expect(queryKeys.observationWorkspace.detail("obs-1", "nl")).toEqual([
      "observation-workspace",
      "obs-1",
      "nl",
    ]);
    expect(queryKeys.observationWorkspace.prefix("obs-1")).toEqual([
      "observation-workspace",
      "obs-1",
    ]);
  });
});

describe("queryKeys.myTasks", () => {
  it("builds filter and count keys", () => {
    expect(queryKeys.myTasks.list("today", "2024-01-01", ["mech"])).toEqual([
      "my-tasks",
      "today",
      "2024-01-01",
      ["mech"],
    ]);
    expect(queryKeys.myTasks.filterCount("overdue", [], null, "u1")).toEqual([
      "my-tasks-count",
      "overdue",
      [],
      null,
      "u1",
    ]);
  });
});

describe("queryKeys.equipmentHistory", () => {
  it("uses equipment id in detail key", () => {
    expect(queryKeys.equipmentHistory.detail("eq-99")).toEqual(["equipmentHistory", "eq-99"]);
  });
});
