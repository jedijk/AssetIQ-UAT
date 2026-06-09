/** Simple mode landing variants — operations (default) vs maintenance. */
export const SIMPLE_MODE_PROFILES = {
  OPERATIONS: "operations",
  MAINTENANCE: "maintenance",
};

const MAINTENANCE_ROLES = new Set(["maintenance"]);

export function getSimpleModeProfile(role) {
  if (MAINTENANCE_ROLES.has(role)) {
    return SIMPLE_MODE_PROFILES.MAINTENANCE;
  }
  return SIMPLE_MODE_PROFILES.OPERATIONS;
}

export function isMaintenanceSimpleMode(role) {
  return getSimpleModeProfile(role) === SIMPLE_MODE_PROFILES.MAINTENANCE;
}
