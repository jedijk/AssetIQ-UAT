/**
 * Reliability Intelligence Layer (RIL) API Client
 * Provides functions to interact with all RIL backend endpoints.
 */

import { api } from "../apiClient";

const RIL_PREFIX = "/ril";

async function rilGet(path, config) {
  const response = await api.get(`${RIL_PREFIX}${path}`, config);
  return response.data;
}

async function rilPost(path, data, config) {
  const response = await api.post(`${RIL_PREFIX}${path}`, data, config);
  return response.data;
}

async function rilPatch(path, data, config) {
  const response = await api.patch(`${RIL_PREFIX}${path}`, data, config);
  return response.data;
}

// ============= Observations API =============

export const rilObservationsAPI = {
  create: async (data) => rilPost("/observations", data),

  list: async (params = {}) => {
    const response = await api.get(`${RIL_PREFIX}/observations`, { params });
    return response.data;
  },

  get: async (id) => rilGet(`/observations/${id}`),
};

// ============= Readings API =============

export const rilReadingsAPI = {
  create: async (data) => rilPost("/readings", data),

  createBulk: async (readings) => rilPost("/readings/bulk", { readings }),

  list: async (params = {}) => {
    const response = await api.get(`${RIL_PREFIX}/readings`, { params });
    return response.data;
  },
};

// ============= Alerts API =============

export const rilAlertsAPI = {
  create: async (data) => rilPost("/alerts", data),

  list: async (params = {}) => {
    const response = await api.get(`${RIL_PREFIX}/alerts`, { params });
    return response.data;
  },

  get: async (id) => rilGet(`/alerts/${id}`),

  update: async (id, data) => {
    const response = await api.patch(`${RIL_PREFIX}/alerts/${id}`, null, { params: data });
    return response.data;
  },
};

// ============= Correlations API =============

export const rilCorrelationsAPI = {
  find: async (params = {}) => {
    const response = await api.post(`${RIL_PREFIX}/correlations/find`, null, { params });
    return response.data;
  },

  list: async (params = {}) => {
    const response = await api.get(`${RIL_PREFIX}/correlations`, { params });
    return response.data;
  },

  get: async (id) => rilGet(`/correlations/${id}`),
};

// ============= Cases API =============

export const rilCasesAPI = {
  create: async (data) => rilPost("/cases", data),

  list: async (params = {}) => {
    const response = await api.get(`${RIL_PREFIX}/cases`, { params });
    return response.data;
  },

  get: async (id) => rilGet(`/cases/${id}`),

  update: async (id, data) => rilPatch(`/cases/${id}`, data),

  linkObservation: async (caseId, observationId) =>
    rilPost(`/cases/${caseId}/link-observation`, null, { params: { observation_id: observationId } }),

  linkAlert: async (caseId, alertId) =>
    rilPost(`/cases/${caseId}/link-alert`, null, { params: { alert_id: alertId } }),

  linkInvestigation: async (caseId, investigationId) =>
    rilPost(`/cases/${caseId}/link-investigation`, null, { params: { investigation_id: investigationId } }),
};

// ============= Predictions API =============

export const rilPredictionsAPI = {
  list: async (params = {}) => {
    const response = await api.get(`${RIL_PREFIX}/predictions`, { params });
    return response.data;
  },

  generate: async (equipmentId) => rilPost(`/predictions/generate/${equipmentId}`),

  getForEquipment: async (equipmentId) => rilGet(`/predictions/equipment/${equipmentId}`),

  getAtRisk: async (params = {}) => {
    const response = await api.get(`${RIL_PREFIX}/predictions/at-risk`, { params });
    return response.data;
  },
};

// ============= Copilot API =============

export const rilCopilotAPI = {
  query: async (query, equipmentId = null, context = null) =>
    rilPost("/copilot/query", {
      query,
      equipment_id: equipmentId,
      context,
    }),

  getSuggestions: async () => rilGet("/copilot/suggestions"),

  getEquipmentContext: async (equipmentId) => rilGet(`/copilot/context/${equipmentId}`),
};

// ============= Dashboard API =============

export const rilDashboardAPI = {
  getStats: async () => rilGet("/dashboard/stats"),

  getExecutive: async () => rilGet("/dashboard/executive"),

  getSupervisor: async () => rilGet("/dashboard/supervisor"),

  getIntelligence: async () => rilGet("/dashboard/intelligence"),

  getDataQuality: async () => rilGet("/dashboard/data-quality"),

  getReliabilityGraphOntology: async () => rilGet("/dashboard/reliability-graph/ontology"),

  getEquipmentReliabilityChain: async (equipmentId, params = {}) => {
    const response = await api.get(`${RIL_PREFIX}/dashboard/equipment/${equipmentId}/reliability-chain`, { params });
    return response.data;
  },

  getEquipmentReliabilityProfile: async (equipmentId, params = {}) => {
    const response = await api.get(
      `${RIL_PREFIX}/dashboard/equipment/${equipmentId}/reliability-profile`,
      { params }
    );
    return response.data;
  },

  getEquipmentReliabilityState: async (equipmentId) => {
    const response = await api.get(
      `${RIL_PREFIX}/dashboard/equipment/${equipmentId}/reliability-state`
    );
    return response.data;
  },

  getNodeReliabilityTrace: async (nodeType, nodeId, params = {}) => {
    const response = await api.get(
      `${RIL_PREFIX}/dashboard/nodes/${encodeURIComponent(nodeType)}/${encodeURIComponent(nodeId)}/reliability-trace`,
      { params }
    );
    return response.data;
  },
};

// Export all APIs as a single object
export const rilAPI = {
  observations: rilObservationsAPI,
  readings: rilReadingsAPI,
  alerts: rilAlertsAPI,
  correlations: rilCorrelationsAPI,
  cases: rilCasesAPI,
  predictions: rilPredictionsAPI,
  copilot: rilCopilotAPI,
  dashboard: rilDashboardAPI,
};

export default rilAPI;
