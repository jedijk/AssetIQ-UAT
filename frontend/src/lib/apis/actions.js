import { api } from "../apiClient";

// Centralized Actions API
export const actionsAPI = {
  getAll: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);
    if (filters.priority) params.append("priority", filters.priority);
    if (filters.assignee) params.append("assignee", filters.assignee);
    if (filters.source_type) params.append("source_type", filters.source_type);
    const response = await api.get(`/actions?${params.toString()}`);
    return response.data;
  },

  getOverdue: async () => {
    const response = await api.get("/actions/overdue");
    return response.data;
  },

  get: async (actionId) => {
    const response = await api.get(`/actions/${actionId}`);
    return response.data;
  },

  // Alias for get() - kept for backward compatibility
  getById: async (actionId) => {
    const response = await api.get(`/actions/${actionId}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post("/actions", data);
    return response.data;
  },

  update: async (actionId, data) => {
    const response = await api.patch(`/actions/${actionId}`, data);
    return response.data;
  },

  delete: async (actionId) => {
    const response = await api.delete(`/actions/${actionId}`);
    return response.data;
  },

  uploadAttachment: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/tasks/upload-attachment", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  // Validation
  validate: async (actionId, validatorName, validatorPosition, validatorId) => {
    const response = await api.post(`/actions/${actionId}/validate`, {
      validated_by_name: validatorName,
      validated_by_position: validatorPosition,
      validated_by_id: validatorId,
    });
    return response.data;
  },

  unvalidate: async (actionId) => {
    const response = await api.post(`/actions/${actionId}/unvalidate`);
    return response.data;
  },
};

