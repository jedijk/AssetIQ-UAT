import {
  canBeChildOf,
  getValidChildLevels,
  isSparePartLinkableLevel,
  LEVEL_ORDER,
} from "./equipmentHierarchyUtils";

describe("getValidChildLevels", () => {
  it("returns the next ISO level", () => {
    expect(getValidChildLevels("installation")).toEqual(["plant_unit"]);
    expect(getValidChildLevels("equipment_unit")).toEqual(["subunit"]);
  });

  it("returns empty for leaf levels", () => {
    expect(getValidChildLevels("maintainable_item")).toEqual([]);
  });
});

describe("canBeChildOf", () => {
  it("allows direct parent-child ISO levels", () => {
    expect(canBeChildOf("plant_unit", "installation")).toBe(true);
    expect(canBeChildOf("section_system", "installation")).toBe(false);
  });

  it("normalizes legacy equipment alias to equipment_unit", () => {
    expect(canBeChildOf("subunit", "equipment")).toBe(true);
  });
});

describe("isSparePartLinkableLevel", () => {
  it("allows equipment_unit and below", () => {
    expect(isSparePartLinkableLevel("equipment_unit")).toBe(true);
    expect(isSparePartLinkableLevel("subunit")).toBe(true);
    expect(isSparePartLinkableLevel("installation")).toBe(false);
  });
});

describe("LEVEL_ORDER", () => {
  it("has six canonical ISO levels", () => {
    expect(LEVEL_ORDER).toHaveLength(6);
  });
});
