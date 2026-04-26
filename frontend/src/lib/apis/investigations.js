import { api } from "../apiClient";

// Causal Investigation API
export const investigationAPI = {
  // Investigation CRUD
  getAll: async (status = null) => {
    const params = status ? `?status=${status}` : "";
    const response = await api.get(`/investigations${params}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/investigations/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post("/investigations", data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.patch(`/investigations/${id}`, data);
    return response.data;
  },

  delete: async (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.deleteCentralActions) params.append("delete_central_actions", "true");
    const queryString = params.toString();
    const url = `/investigations/${id}${queryString ? `?${queryString}` : ""}`;
    const response = await api.delete(url);
    return response.data;
  },

  getStats: async (id) => {
    const response = await api.get(`/investigations/${id}/stats`);
    return response.data;
  },

  // Create from threat
  createFromThreat: async (threatId) => {
    const response = await api.post(`/threats/${threatId}/investigate`);
    return response.data;
  },

  // Timeline events
  createEvent: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/events`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  updateEvent: async (invId, eventId, data) => {
    const response = await api.patch(`/investigations/${invId}/events/${eventId}`, data);
    return response.data;
  },

  deleteEvent: async (invId, eventId) => {
    const response = await api.delete(`/investigations/${invId}/events/${eventId}`);
    return response.data;
  },

  // Failure identifications
  createFailure: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/failures`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  updateFailure: async (invId, failureId, data) => {
    const response = await api.patch(`/investigations/${invId}/failures/${failureId}`, data);
    return response.data;
  },

  deleteFailure: async (invId, failureId) => {
    const response = await api.delete(`/investigations/${invId}/failures/${failureId}`);
    return response.data;
  },

  // Cause nodes
  createCause: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/causes`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  updateCause: async (invId, causeId, data) => {
    const response = await api.patch(`/investigations/${invId}/causes/${causeId}`, data);
    return response.data;
  },

  deleteCause: async (invId, causeId) => {
    const response = await api.delete(`/investigations/${invId}/causes/${causeId}`);
    return response.data;
  },

  // Action items
  createAction: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/actions`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  updateAction: async (invId, actionId, data) => {
    const response = await api.patch(`/investigations/${invId}/actions/${actionId}`, data);
    return response.data;
  },

  deleteAction: async (invId, actionId) => {
    const response = await api.delete(`/investigations/${invId}/actions/${actionId}`);
    return response.data;
  },

  // Evidence
  addEvidence: async (invId, data) => {
    const response = await api.post(`/investigations/${invId}/evidence`, {
      ...data,
      investigation_id: invId,
    });
    return response.data;
  },

  deleteEvidence: async (invId, evidenceId) => {
    const response = await api.delete(`/investigations/${invId}/evidence/${evidenceId}`);
    return response.data;
  },

  // File upload
  uploadFile: async (invId, file, description = null) => {
    const formData = new FormData();
    formData.append("file", file);
    if (description) {
      formData.append("description", description);
    }
    const response = await api.post(`/investigations/${invId}/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  // File download
  downloadFile: async (storagePath) => {
    const response = await api.get(`/files/${storagePath}`, {
      responseType: "blob",
    });
    return response.data;
  },

  // Report generation
  downloadReportPPTX: async (investigationId) => {
    const response = await api.get(`/investigations/${investigationId}/report/pptx`, {
      responseType: "blob",
    });
    return response.data;
  },

  downloadReportPDF: async (investigationId) => {
    const response = await api.get(`/investigations/${investigationId}/report/pdf`, {
      responseType: "blob",
    });
    return response.data;
  },

  getAISummary: async (investigationId) => {
    const response = await api.get(`/investigations/${investigationId}/ai-summary`);
    return response.data;
  },
};

