import { api } from "../apiClient";

// Threats API
export const threatsAPI = {
  getAll: async (status = null) => {
    const params = status ? `?status=${status}` : "";
    const response = await api.get(`/threats${params}`);
    return response.data;
  },

  getTop: async (limit = 10) => {
    const response = await api.get(`/threats/top?limit=${limit}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/threats/${id}`);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.patch(`/threats/${id}`, data);
    return response.data;
  },

  delete: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.deleteActions) params.append("delete_actions", "true");
    if (options.deleteInvestigations) params.append("delete_investigations", "true");
    const queryString = params.toString();
    const url = `/threats/${id}${queryString ? `?${queryString}` : ""}`;
    const response = await api.delete(url);
    return response.data;
  },

  linkToEquipment: async (threatId, equipmentNodeId) => {
    const response = await api.post(`/threats/${threatId}/link-equipment`, {
      equipment_node_id: equipmentNodeId,
    });
    return response.data;
  },

  linkToFailureMode: async (threatId, failureModeId) => {
    const response = await api.post(`/threats/${threatId}/link-failure-mode`, {
      failure_mode_id: failureModeId,
    });
    return response.data;
  },

  recalculateScores: async () => {
    const response = await api.post("/threats/recalculate-scores");
    return response.data;
  },

  getTimeline: async (threatId) => {
    const response = await api.get(`/threats/${threatId}/timeline`);
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

