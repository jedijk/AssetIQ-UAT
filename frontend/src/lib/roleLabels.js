/** Human-readable labels for system roles — keep in sync with backend SYSTEM_ROLE_LABELS. */
export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  reliability_engineer: "Reliability Engineer",
  maintenance: "Maintenance",
  operations: "Operations",
  operator: "Operator",
  viewer: "Viewer",
};

export function formatRoleLabel(role) {
  if (!role) return "";
  const key = String(role).trim();
  return ROLE_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveRoleDisplayName(roleKey, roleInfo) {
  if (roleInfo?.display_name && roleInfo.display_name !== roleKey) {
    return roleInfo.display_name;
  }
  return formatRoleLabel(roleKey);
}

export function resolveRoleDescription(roleKey, roleInfo) {
  const description = roleInfo?.description;
  if (!description) return null;
  if (description === `System role: ${roleKey}` || description.startsWith("System role:")) {
    return `System role: ${formatRoleLabel(roleKey)}`;
  }
  return description;
}

export function roleInfoByKey(roles) {
  if (!roles) return {};
  if (Array.isArray(roles)) {
    return Object.fromEntries(
      roles.map((roleKey) => [
        roleKey,
        { name: roleKey, display_name: formatRoleLabel(roleKey) },
      ])
    );
  }
  if (typeof roles === "object") {
    return roles;
  }
  return {};
}
