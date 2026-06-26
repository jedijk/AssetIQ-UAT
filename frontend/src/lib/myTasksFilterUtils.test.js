import {
  defaultDisciplinesForRole,
  filterActiveWorkItems,
  getApiDisciplineParam,
  itemMatchesDisciplines,
  preferenceFromDisciplines,
  resolveMyTasksDisciplines,
} from "./myTasksFilterUtils";

describe("defaultDisciplinesForRole", () => {
  it("returns operations discipline for operators", () => {
    expect(defaultDisciplinesForRole("operations")).toEqual(["operations"]);
  });

  it("returns maintenance bundle for maintenance role", () => {
    expect(defaultDisciplinesForRole("maintenance")).toContain("rotating");
  });

  it("returns empty for other roles", () => {
    expect(defaultDisciplinesForRole("viewer")).toEqual([]);
  });
});

describe("resolveMyTasksDisciplines", () => {
  it("prefers saved preference over role default", () => {
    expect(resolveMyTasksDisciplines("maintenance", "electrical")).toEqual(["electrical"]);
  });
});

describe("preferenceFromDisciplines", () => {
  it("maps empty selection to all", () => {
    expect(preferenceFromDisciplines([])).toBe("all");
  });

  it("returns undefined for multi-select (client-side filter only)", () => {
    expect(preferenceFromDisciplines(["rotating", "electrical"])).toBeUndefined();
  });
});

describe("itemMatchesDisciplines", () => {
  it("matches discipline substring case-insensitively", () => {
    expect(itemMatchesDisciplines({ discipline: "Rotating Equipment" }, ["rotating"])).toBe(true);
  });

  it("passes all items when no filter selected", () => {
    expect(itemMatchesDisciplines({ discipline: "electrical" }, [])).toBe(true);
  });
});

describe("filterActiveWorkItems", () => {
  it("excludes completed and cancelled items but not cancelled_offline", () => {
    const items = [
      { id: "1", status: "open", discipline: "rotating" },
      { id: "2", status: "completed", discipline: "rotating" },
      { id: "3", status: "cancelled_offline", discipline: "rotating" },
      { id: "4", status: "cancelled", discipline: "rotating" },
    ];
    expect(filterActiveWorkItems(items, ["rotating"]).map((i) => i.id)).toEqual(["1", "3"]);
  });
});

describe("getApiDisciplineParam", () => {
  it("returns single discipline for API", () => {
    expect(getApiDisciplineParam(["electrical"])).toBe("electrical");
  });

  it("returns undefined for multi-select", () => {
    expect(getApiDisciplineParam(["rotating", "electrical"])).toBeUndefined();
  });
});
