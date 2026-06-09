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
    detail: (id, language = "en") => ["observation-workspace", id, language],
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
  chat: {
    history: () => ["chatHistory"],
  },
  myTasks: {
    /** Prefix for predicate invalidation across filter variants */
    prefix: "my-tasks",
    countPrefix: "my-tasks-count",
    operatorCountsPrefix: "operatorTaskCounts",
    list: (filter, date, disciplines) => ["my-tasks", filter, date, disciplines],
    operatorCounts: (disciplines, userId) => ["operatorTaskCounts", disciplines, userId],
    filterCount: (filter, disciplines, date, userId) =>
      ["my-tasks-count", filter, disciplines, date, userId],
  },
  centralActions: {
    prefix: "central-actions",
  },
  formSubmissions: {
    all: () => ["form-submissions"],
    list: (filters) => ["form-submissions", filters],
    dashboard: () => ["form-submissions-dashboard"],
  },
  notifications: {
    overdueActions: () => ["overdueActions"],
  },
  mobile: {
    myTasks: (filter) => ["myTasks", filter],
    executiveKpis: () => ["mobile-executive-kpis"],
    analytics: () => ["mobile-analytics"],
    riskOverview: () => ["mobile-risk-overview"],
    stats: () => ["mobile-stats"],
  },
};
