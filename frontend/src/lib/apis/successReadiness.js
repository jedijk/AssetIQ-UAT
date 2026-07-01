import { api } from "../apiClient";

export const successReadinessAPI = {
  getDashboard: async () => {
    const response = await api.get("/success-readiness/dashboard");
    return response.data;
  },

  getKpis: async (pillar) => {
    const response = await api.get("/success-readiness/kpis", {
      params: pillar ? { pillar } : undefined,
    });
    return response.data;
  },

  getKpi: async (kpiId) => {
    const response = await api.get(`/success-readiness/kpis/${kpiId}`);
    return response.data;
  },

  getRegisters: async (registerType) => {
    const response = await api.get(`/success-readiness/registers/${registerType}`);
    return response.data;
  },

  getAssessments: async () => {
    const response = await api.get("/success-readiness/assessments");
    return response.data;
  },

  getEvidence: async (kpiId) => {
    const response = await api.get("/success-readiness/evidence", {
      params: kpiId ? { kpi_id: kpiId } : undefined,
    });
    return response.data;
  },

  getHistory: async () => {
    const response = await api.get("/success-readiness/history");
    return response.data;
  },

  getAiRecommendations: async () => {
    const response = await api.get("/success-readiness/ai-recommendations");
    return response.data;
  },

  getConfiguration: async () => {
    const response = await api.get("/success-readiness/configuration");
    return response.data;
  },
};
