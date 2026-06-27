import { api, aiApi } from "../apiClient";

// Work signals API (primary: /observations/signals/*; legacy /threats/* retained server-side)
export const threatsAPI = {
  getAll: async (status = null, options = {}) => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (options.language) params.append("language", options.language);
    const queryString = params.toString();
    const response = await api.get(
      `/observations/signals${queryString ? `?${queryString}` : ""}`
    );
    return response.data;
  },

  getTop: async (limit = 10, options = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (options.language) params.append("language", options.language);
    if (options.excludeMitigated) params.append("exclude_mitigated", "true");
    const response = await api.get(`/observations/signals/top?${params.toString()}`);
    return response.data;
  },

  getById: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.language) params.append("language", options.language);
    const queryString = params.toString();
    const response = await api.get(
      `/observations/signals/${id}${queryString ? `?${queryString}` : ""}`
    );
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.patch(`/observations/signals/${id}`, data);
    return response.data;
  },

  delete: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.deleteActions) params.append("delete_actions", "true");
    if (options.deleteInvestigations) params.append("delete_investigations", "true");
    const queryString = params.toString();
    const url = `/observations/signals/${id}${queryString ? `?${queryString}` : ""}`;
    const response = await api.delete(url);
    return response.data;
  },

  linkToEquipment: async (threatId, equipmentNodeId) => {
    const response = await api.post(`/observations/signals/${threatId}/link-equipment`, {
      equipment_node_id: equipmentNodeId,
    });
    return response.data;
  },

  linkToFailureMode: async (threatId, failureModeId) => {
    const response = await api.post(`/observations/signals/${threatId}/link-failure-mode`, {
      failure_mode_id: failureModeId,
    });
    return response.data;
  },

  recalculateScores: async () => {
    const response = await api.post("/observations/signals/recalculate-scores");
    return response.data;
  },

  getTimeline: async (threatId) => {
    const response = await api.get(`/observations/signals/${threatId}/timeline`);
    return response.data;
  },

  improveDescription: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.language) params.append("language", options.language);
    const queryString = params.toString();
    const response = await aiApi.post(
      `/observations/signals/${id}/improve-description${queryString ? `?${queryString}` : ""}`
    );
    return response.data;
  },
};

// Observations API
export const observationsAPI = {
  getAll: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.equipment_id) searchParams.append("equipment_id", params.equipment_id);
    if (params.severity) searchParams.append("severity", params.severity);
    if (params.status) searchParams.append("status", params.status);
    const response = await api.get(`/observations?${searchParams.toString()}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/observations/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post("/observations", data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.patch(`/observations/${id}`, data);
    return response.data;
  },

  delete: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.deleteActions) params.append("delete_actions", "true");
    if (options.deleteInvestigations) params.append("delete_investigations", "true");
    const queryString = params.toString();
    const url = `/observations/${id}${queryString ? `?${queryString}` : ""}`;
    const response = await api.delete(url);
    return response.data;
  },

  close: async (id, resolutionNotes = null) => {
    const response = await api.post(`/observations/${id}/close`, {
      resolution_notes: resolutionNotes,
    });
    return response.data;
  },
};
