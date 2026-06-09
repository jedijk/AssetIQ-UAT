/** Permission feature groupings — keep aligned with backend FEATURES. */
export const PERMISSION_SECTIONS = [
  {
    id: "operations",
    label: "Operations",
    features: ["observations", "actions", "tasks", "scheduler", "forms"],
  },
  {
    id: "reliability",
    label: "Reliability & Equipment",
    features: ["investigations", "library", "library_ai_tools", "insights", "equipment"],
  },
  {
    id: "collaboration",
    label: "Collaboration",
    features: ["chat", "feedback"],
  },
  {
    id: "administration",
    label: "Administration",
    features: ["users", "statistics", "settings"],
  },
];

export const roleHasAnyFeaturePermission = (perm) =>
  !!(perm?.read || perm?.write || perm?.delete);

export const sectionHasPermissionsForRole = (section, role, permissions) =>
  section.features.some((featureKey) =>
    roleHasAnyFeaturePermission(permissions?.[role]?.[featureKey])
  );

export const getVisiblePermissionSections = (role, permissions, showEmptySections) => {
  if (showEmptySections || role === "owner") {
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
