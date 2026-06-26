import {
  PERMISSION_SECTIONS,
  roleHasAnyFeaturePermission,
  sectionHasPermissionsForRole,
  getVisiblePermissionSections,
  normalizeFeatureEntries,
} from "./permissionSections";

describe("roleHasAnyFeaturePermission", () => {
  it("returns true when read/write/delete set", () => {
    expect(roleHasAnyFeaturePermission({ read: true })).toBe(true);
    expect(roleHasAnyFeaturePermission({ write: true })).toBe(true);
    expect(roleHasAnyFeaturePermission({ delete: true })).toBe(true);
  });

  it("returns false for empty permission", () => {
    expect(roleHasAnyFeaturePermission({})).toBe(false);
    expect(roleHasAnyFeaturePermission(null)).toBe(false);
  });
});

describe("sectionHasPermissionsForRole", () => {
  const section = PERMISSION_SECTIONS.find((s) => s.id === "operations");

  it("detects permissions on section features", () => {
    const permissions = {
      admin: { actions: { read: true } },
    };
    expect(sectionHasPermissionsForRole(section, "admin", permissions)).toBe(true);
  });

  it("returns false when role has no section permissions", () => {
    expect(sectionHasPermissionsForRole(section, "viewer", {})).toBe(false);
  });
});

describe("getVisiblePermissionSections", () => {
  it("returns all sections by default", () => {
    expect(getVisiblePermissionSections("admin", {})).toEqual(PERMISSION_SECTIONS);
  });

  it("filters empty sections when hideEmptySections true", () => {
    const permissions = { admin: { actions: { read: true } } };
    const visible = getVisiblePermissionSections("admin", permissions, true);
    expect(visible.length).toBeLessThan(PERMISSION_SECTIONS.length);
    expect(visible.some((s) => s.id === "operations")).toBe(true);
  });
});

describe("normalizeFeatureEntries", () => {
  it("returns object entries", () => {
    const entries = normalizeFeatureEntries({ actions: { name: "Actions" } });
    expect(entries).toEqual([["actions", { name: "Actions" }]]);
  });

  it("maps string array to titled names", () => {
    const entries = normalizeFeatureEntries(["my_tasks"]);
    expect(entries[0][0]).toBe("my_tasks");
    expect(entries[0][1].name).toBe("My Tasks");
  });

  it("uses fallback keys when features empty", () => {
    const entries = normalizeFeatureEntries(null, ["settings"]);
    expect(entries).toEqual([["settings", { name: "Settings" }]]);
  });
});

describe("PERMISSION_SECTIONS", () => {
  it("includes administration section", () => {
    expect(PERMISSION_SECTIONS.some((s) => s.id === "administration")).toBe(true);
  });
});
