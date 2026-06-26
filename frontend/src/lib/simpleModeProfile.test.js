import {
  SIMPLE_MODE_PROFILES,
  getSimpleModeProfile,
  isMaintenanceSimpleMode,
} from "./simpleModeProfile";

describe("getSimpleModeProfile", () => {
  it("returns maintenance profile for maintenance role", () => {
    expect(getSimpleModeProfile("maintenance")).toBe(SIMPLE_MODE_PROFILES.MAINTENANCE);
  });

  it("returns operations profile for other roles", () => {
    expect(getSimpleModeProfile("operator")).toBe(SIMPLE_MODE_PROFILES.OPERATIONS);
    expect(getSimpleModeProfile("admin")).toBe(SIMPLE_MODE_PROFILES.OPERATIONS);
  });
});

describe("isMaintenanceSimpleMode", () => {
  it("is true only for maintenance role", () => {
    expect(isMaintenanceSimpleMode("maintenance")).toBe(true);
    expect(isMaintenanceSimpleMode("viewer")).toBe(false);
  });
});
