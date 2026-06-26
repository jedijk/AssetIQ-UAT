import {
  ROLE_LABELS,
  formatRoleLabel,
  resolveRoleDisplayName,
  resolveRoleDescription,
  roleInfoByKey,
} from "./roleLabels";

describe("formatRoleLabel", () => {
  it("returns known system role labels", () => {
    expect(formatRoleLabel("admin")).toBe("Admin");
    expect(formatRoleLabel("reliability_engineer")).toBe("Reliability Engineer");
  });

  it("title-cases unknown roles", () => {
    expect(formatRoleLabel("custom_role")).toBe("Custom Role");
  });

  it("returns empty string for falsy input", () => {
    expect(formatRoleLabel(null)).toBe("");
    expect(formatRoleLabel("")).toBe("");
  });
});

describe("resolveRoleDisplayName", () => {
  it("prefers ROLE_LABELS over roleInfo", () => {
    expect(resolveRoleDisplayName("admin", { display_name: "Super Admin" })).toBe("Admin");
  });

  it("uses roleInfo display_name when not a system role", () => {
    expect(resolveRoleDisplayName("custom", { display_name: "Custom Label" })).toBe("Custom Label");
  });

  it("falls back to formatted key", () => {
    expect(resolveRoleDisplayName("plant_lead", {})).toBe("Plant Lead");
  });
});

describe("resolveRoleDescription", () => {
  it("rewrites generic system role descriptions", () => {
    expect(resolveRoleDescription("admin", { description: "System role: admin" })).toBe(
      "System role: Admin",
    );
  });

  it("returns custom descriptions unchanged", () => {
    expect(resolveRoleDescription("admin", { description: "Full access" })).toBe("Full access");
  });

  it("returns null when no description", () => {
    expect(resolveRoleDescription("admin", {})).toBeNull();
  });
});

describe("roleInfoByKey", () => {
  it("maps array of role keys to info objects", () => {
    const map = roleInfoByKey(["admin", "viewer"]);
    expect(map.admin.display_name).toBe("Admin");
    expect(map.viewer.name).toBe("viewer");
  });

  it("passes through object roles", () => {
    const roles = { admin: { display_name: "Admin" } };
    expect(roleInfoByKey(roles)).toBe(roles);
  });

  it("returns empty object for invalid input", () => {
    expect(roleInfoByKey(null)).toEqual({});
  });
});

describe("ROLE_LABELS", () => {
  it("includes owner and viewer", () => {
    expect(ROLE_LABELS.owner).toBe("Owner");
    expect(ROLE_LABELS.viewer).toBe("Viewer");
  });
});
