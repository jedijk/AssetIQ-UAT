import { api } from "../apiClient";

// Failure Modes API
export const failureModesAPI = {
  getAll: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append("search", params.search);
    if (params.category && params.category !== "all") searchParams.append("category", params.category);
    const response = await api.get(`/failure-modes?${searchParams.toString()}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/failure-modes/${id}`);
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get("/failure-modes/categories");
    return response.data;
  },

  create: async (data) => {
    const response = await api.post("/failure-modes", data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.patch(`/failure-modes/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/failure-modes/${id}`);
    return response.data;
  },

  validate: async (id, validatorName, validatorPosition, validatorId) => {
    const response = await api.post(`/failure-modes/${id}/validate`, {
      validated_by_name: validatorName,
      validated_by_position: validatorPosition,
      validated_by_id: validatorId,
    });
    return response.data;
  },

  unvalidate: async (id) => {
    const response = await api.post(`/failure-modes/${id}/unvalidate`);
    return response.data;
  },

  // Version history
  getVersions: async (id) => {
    const response = await api.get(`/failure-modes/${id}/versions`);
    return response.data;
  },

  rollback: async (id, versionId, reason = null) => {
    const response = await api.post(`/failure-modes/${id}/rollback`, {
      version_id: versionId,
      reason,
    });
    return response.data;
  },

  getCountsByEquipmentType: async () => {
    const response = await api.get("/failure-modes/counts-by-equipment-type");
    return response.data;
  },
};

