import {
  PERMISSION_FEATURE_NAME_KEYS,
  getPermissionFeatureName,
  getPermissionFeatureDescription,
  getPermissionSectionLabel,
} from "./permissionFeatureLabels";

const t = (key) => {
  const map = {
    "nav.observations": "Observations",
    "permissions.features.observations.description": "View observations",
    "permissions.sections.dashboards": "Dashboards",
  };
  return map[key] || key;
};

describe("PERMISSION_FEATURE_NAME_KEYS", () => {
  it("maps observations to nav key", () => {
    expect(PERMISSION_FEATURE_NAME_KEYS.observations).toBe("nav.observations");
  });
});

describe("getPermissionFeatureName", () => {
  it("returns translated name", () => {
    expect(getPermissionFeatureName(t, "observations", "Observations")).toBe("Observations");
  });

  it("falls back when key missing", () => {
    expect(getPermissionFeatureName(t, "unknown_feature", "Fallback")).toBe("Fallback");
  });
});

describe("getPermissionFeatureDescription", () => {
  it("returns translated description", () => {
    expect(getPermissionFeatureDescription(t, "observations", "Desc")).toBe("View observations");
  });
});

describe("getPermissionSectionLabel", () => {
  it("returns translated section label", () => {
    expect(getPermissionSectionLabel(t, "dashboards", "Dashboards")).toBe("Dashboards");
  });

  it("falls back for unknown section", () => {
    expect(getPermissionSectionLabel(t, "unknown", "Other")).toBe("Other");
  });
});
