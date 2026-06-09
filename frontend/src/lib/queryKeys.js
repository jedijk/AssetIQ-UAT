/**
 * Centralized React Query key factories to avoid cache collisions.
 */
export const queryKeys = {
  threats: {
    all: () => ["threats"],
    detail: (id) => ["threats", id],
    top: (limit = 10) => ["top-observations", limit],
  },
  actions: {
    all: () => ["actions"],
    detail: (id) => ["actions", id],
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
  },
  users: {
    rbac: () => ["rbac-users"],
    preferences: () => ["user-preferences"],
  },
  failureModes: {
    list: () => ["failure-modes-list"],
  },
};
