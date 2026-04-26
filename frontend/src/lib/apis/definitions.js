import { api } from "../apiClient";

// ==================== DEFINITIONS API ====================
export const definitionsAPI = {
  getInstallations: async () => {
    const response = await api.get("/definitions/installations");
    return response.data;
  },
  getDefinitions: async (equipmentId) => {
    const response = await api.get(`/definitions/equipment/${equipmentId}`);
    return response.data;
  },
  getDefaults: async () => {
    const response = await api.get("/definitions/defaults");
    return response.data;
  },
  saveDefinitions: async ({ equipmentId, severity, occurrence, detection, criticality }) => {
    const response = await api.post("/definitions", {
      equipment_id: equipmentId,
      severity,
      occurrence,
      detection,
      criticality,
    });
    return response.data;
  },
  resetDefinitions: async (equipmentId) => {
    const response = await api.delete(`/definitions/${equipmentId}`);
    return response.data;
  },
};

// ==================== PREFERENCES API ====================
export const preferencesAPI = {
  getPreferences: async () => {
    const response = await api.get("/users/me/preferences");
    return response.data;
  },
  updatePreferences: async (data) => {
    const response = await api.put("/users/me/preferences", data);
    return response.data;
  },
  getTimezones: async () => {
    const response = await api.get("/timezones");
    return response.data;
  },
};

// ==================== USER STATISTICS API ====================
export const userStatsAPI = {
  getOverview: async (period = "30", roleFilter = null) => {
    const params = new URLSearchParams({ period });
    if (roleFilter) params.append("role_filter", roleFilter);
    const response = await api.get(`/user-stats/overview?${params}`);
    return response.data;
  },
  getTrends: async (period = "30") => {
    const response = await api.get(`/user-stats/trends?period=${period}`);
    return response.data;
  },
};

