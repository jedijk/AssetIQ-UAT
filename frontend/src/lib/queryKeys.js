/**
 * Centralized React Query key factories to avoid cache collisions.
 */
export const queryKeys = {
  threats: {
    all: () => ["threats"],
    detail: (id) => ["threats", id],
    /** Legacy singular key used by threat detail / workspace flows */
    legacyDetail: (id) => ["threat", id],
    timeline: (id) => ["threatTimeline", id],
    timelineAll: () => ["threatTimeline"],
    top: (limit = 10) => ["top-observations", limit],
  },
  actions: {
    all: () => ["actions"],
    detail: (id) => ["actions", id],
    /** Legacy singular key used by action detail page */
    legacyDetail: (id) => ["action", id],
    linked: (threatId) => ["actions", "linked", threatId],
    linkedToThreat: (threatId) => ["linked-actions", threatId],
  },
  observationWorkspace: {
    detail: (id) => ["observation-workspace", id],
  },
  investigations: {
    all: () => ["investigations"],
    detail: (id) => ["investigation", id],
    linkedIncident: (id) => ["linked-incident", id],
    similarIncidents: (id) => ["similar-incidents", id],
    centralActions: (id) => ["central-actions", "investigation", id],
  },
  equipment: {
    nodes: () => ["equipment-nodes"],
    types: () => ["equipment-types"],
    files: (nodeId) => ["equipment-files", nodeId],
  },
  users: {
    rbac: () => ["rbac-users"],
    preferences: () => ["user-preferences"],
  },
  stats: {
    all: () => ["stats"],
  },
  equipmentHistory: {
    /** Prefix invalidation for all equipment history queries */
    all: () => ["equipmentHistory"],
    detail: (equipmentId) => ["equipmentHistory", equipmentId],
  },
  failureModes: {
    list: () => ["failure-modes-list"],
    all: () => ["failure-modes"],
    /** Legacy key used by threat detail / observation workspace lookups */
    allForLookup: () => ["failure-modes-all"],
  },
};
