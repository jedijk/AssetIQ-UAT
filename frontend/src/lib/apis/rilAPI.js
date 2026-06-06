/**
 * Reliability Intelligence Layer (RIL) API Client
 * Provides functions to interact with all RIL backend endpoints.
 */

import { getBackendUrl, getAuthFetchInit } from '../apiConfig';

const BASE_URL = `${getBackendUrl()}/api/ril`;

// Helper function for API calls
async function rilFetch(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, getAuthFetchInit({
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }));

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `Request failed: ${response.status}`);
  }

  return response.json();
}

// ============= Observations API =============

export const rilObservationsAPI = {
  create: async (data) => {
    return rilFetch('/observations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.set('equipment_id', params.equipment_id);
    if (params.source) searchParams.set('source', params.source);
    if (params.severity) searchParams.set('severity', params.severity);
    if (params.from_date) searchParams.set('from_date', params.from_date);
    if (params.to_date) searchParams.set('to_date', params.to_date);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.skip) searchParams.set('skip', params.skip);
    
    const query = searchParams.toString();
    return rilFetch(`/observations${query ? `?${query}` : ''}`);
  },

  get: async (id) => {
    return rilFetch(`/observations/${id}`);
  },
};

// ============= Readings API =============

export const rilReadingsAPI = {
  create: async (data) => {
    return rilFetch('/readings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createBulk: async (readings) => {
    return rilFetch('/readings/bulk', {
      method: 'POST',
      body: JSON.stringify({ readings }),
    });
  },

  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.set('equipment_id', params.equipment_id);
    if (params.source_system) searchParams.set('source_system', params.source_system);
    if (params.source_tag) searchParams.set('source_tag', params.source_tag);
    if (params.alarms_only) searchParams.set('alarms_only', params.alarms_only);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.skip) searchParams.set('skip', params.skip);
    
    const query = searchParams.toString();
    return rilFetch(`/readings${query ? `?${query}` : ''}`);
  },
};

// ============= Alerts API =============

export const rilAlertsAPI = {
  create: async (data) => {
    return rilFetch('/alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.set('equipment_id', params.equipment_id);
    if (params.priority) searchParams.set('priority', params.priority);
    if (params.status) searchParams.set('status', params.status);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.skip) searchParams.set('skip', params.skip);
    
    const query = searchParams.toString();
    return rilFetch(`/alerts${query ? `?${query}` : ''}`);
  },

  get: async (id) => {
    return rilFetch(`/alerts/${id}`);
  },

  update: async (id, data) => {
    const params = new URLSearchParams();
    if (data.status) params.set('status', data.status);
    if (data.assigned_to) params.set('assigned_to', data.assigned_to);
    
    return rilFetch(`/alerts/${id}?${params.toString()}`, {
      method: 'PATCH',
    });
  },
};

// ============= Correlations API =============

export const rilCorrelationsAPI = {
  find: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.set('equipment_id', params.equipment_id);
    if (params.time_window_hours) searchParams.set('time_window_hours', params.time_window_hours);
    
    const query = searchParams.toString();
    return rilFetch(`/correlations/find${query ? `?${query}` : ''}`, {
      method: 'POST',
    });
  },

  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.set('equipment_id', params.equipment_id);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.skip) searchParams.set('skip', params.skip);
    
    const query = searchParams.toString();
    return rilFetch(`/correlations${query ? `?${query}` : ''}`);
  },

  get: async (id) => {
    return rilFetch(`/correlations/${id}`);
  },
};

// ============= Cases API =============

export const rilCasesAPI = {
  create: async (data) => {
    return rilFetch('/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.set('equipment_id', params.equipment_id);
    if (params.status) searchParams.set('status', params.status);
    if (params.priority) searchParams.set('priority', params.priority);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.skip) searchParams.set('skip', params.skip);
    
    const query = searchParams.toString();
    return rilFetch(`/cases${query ? `?${query}` : ''}`);
  },

  get: async (id) => {
    return rilFetch(`/cases/${id}`);
  },

  update: async (id, data) => {
    return rilFetch(`/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  linkObservation: async (caseId, observationId) => {
    return rilFetch(`/cases/${caseId}/link-observation?observation_id=${observationId}`, {
      method: 'POST',
    });
  },

  linkAlert: async (caseId, alertId) => {
    return rilFetch(`/cases/${caseId}/link-alert?alert_id=${alertId}`, {
      method: 'POST',
    });
  },

  linkInvestigation: async (caseId, investigationId) => {
    return rilFetch(`/cases/${caseId}/link-investigation?investigation_id=${investigationId}`, {
      method: 'POST',
    });
  },
};

// ============= Predictions API =============

export const rilPredictionsAPI = {
  list: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.set('equipment_id', params.equipment_id);
    if (params.min_risk) searchParams.set('min_risk', params.min_risk);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.skip) searchParams.set('skip', params.skip);
    
    const query = searchParams.toString();
    return rilFetch(`/predictions${query ? `?${query}` : ''}`);
  },

  generate: async (equipmentId) => {
    return rilFetch(`/predictions/generate/${equipmentId}`, {
      method: 'POST',
    });
  },

  getForEquipment: async (equipmentId) => {
    return rilFetch(`/predictions/equipment/${equipmentId}`);
  },

  getAtRisk: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.health_threshold) searchParams.set('health_threshold', params.health_threshold);
    if (params.limit) searchParams.set('limit', params.limit);
    
    const query = searchParams.toString();
    return rilFetch(`/predictions/at-risk${query ? `?${query}` : ''}`);
  },
};

// ============= Copilot API =============

export const rilCopilotAPI = {
  query: async (query, equipmentId = null, context = null) => {
    return rilFetch('/copilot/query', {
      method: 'POST',
      body: JSON.stringify({
        query,
        equipment_id: equipmentId,
        context,
      }),
    });
  },

  getSuggestions: async () => {
    return rilFetch('/copilot/suggestions');
  },
};

// ============= Dashboard API =============

export const rilDashboardAPI = {
  getStats: async () => {
    return rilFetch('/dashboard/stats');
  },

  getExecutive: async () => {
    return rilFetch('/dashboard/executive');
  },

  getIntelligence: async () => {
    return rilFetch('/dashboard/intelligence');
  },

  getDataQuality: async () => {
    return rilFetch('/dashboard/data-quality');
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
