/** Permission feature groupings — keep aligned with backend FEATURES. */
export const PERMISSION_SECTIONS = [
  {
    id: "dashboards",
    label: "Dashboards",
    labelKey: "permissions.sections.dashboards",
    features: [
      "dashboard_operational",
      "supervisor_command_center",
      "dashboard_production",
      "dashboard_executive",
      "dashboard_builder",
      "reliability_intelligence",
    ],
  },
  {
    id: "observations",
    label: "Observations",
    labelKey: "permissions.sections.observations",
    features: ["observations"],
  },
  {
    id: "operations",
    label: "Operations",
    labelKey: "permissions.sections.operations",
    features: ["actions", "tasks", "scheduler", "forms"],
  },
  {
    id: "reliability",
    label: "Reliability & Equipment",
    labelKey: "permissions.sections.reliability",
    features: ["investigations", "library", "library_ai_tools", "equipment"],
  },
  {
    id: "collaboration",
    label: "Collaboration",
    labelKey: "permissions.sections.collaboration",
    features: ["chat", "feedback"],
  },
  {
    id: "administration",
    label: "Administration",
    labelKey: "permissions.sections.administration",
    features: ["users", "statistics", "settings"],
  },
];

export const roleHasAnyFeaturePermission = (perm) =>
  !!(perm?.read || perm?.write || perm?.delete);

export const sectionHasPermissionsForRole = (section, role, permissions) =>
  section.features.some((featureKey) =>
    roleHasAnyFeaturePermission(permissions?.[role]?.[featureKey])
  );

/** Admin UI: show every section by default so disabled features stay editable. */
export const getVisiblePermissionSections = (role, permissions, hideEmptySections = false) => {
  if (!hideEmptySections) {
    return PERMISSION_SECTIONS;
  }
  return PERMISSION_SECTIONS.filter((section) =>
    sectionHasPermissionsForRole(section, role, permissions)
  );
};

export const normalizeFeatureEntries = (features, fallbackKeys = []) => {
  if (features && typeof features === "object" && !Array.isArray(features)) {
    return Object.entries(features);
  }
  if (Array.isArray(features) && features.length > 0) {
    return features.map((f) => [
      f,
      { name: f.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) },
    ]);
  }
  return fallbackKeys.map((f) => [
    f,
    { name: f.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) },
  ]);
};
