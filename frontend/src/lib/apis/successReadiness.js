import { api } from "../apiClient";

export const successReadinessAPI = {
  getDashboard: async () => {
    const response = await api.get("/success-readiness/dashboard");
    return response.data;
  },

  collectMeasurements: async () => {
    const response = await api.post("/success-readiness/collect");
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

  createRegister: async (registerType, payload) => {
    const response = await api.post(`/success-readiness/registers/${registerType}`, payload);
    return response.data;
  },

  updateRegister: async (registerType, entryId, payload) => {
    const response = await api.patch(`/success-readiness/registers/${registerType}/${entryId}`, payload);
    return response.data;
  },

  getAssessments: async () => {
    const response = await api.get("/success-readiness/assessments");
    return response.data;
  },

  submitAssessment: async (assessmentId, payload) => {
    const response = await api.post(`/success-readiness/assessments/${assessmentId}/submit`, payload);
    return response.data;
  },

  getEvidence: async (kpiId) => {
    const response = await api.get("/success-readiness/evidence", {
      params: kpiId ? { kpi_id: kpiId } : undefined,
    });
    return response.data;
  },

  createEvidence: async (payload) => {
    const response = await api.post("/success-readiness/evidence", payload);
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

  // Pulse Surveys
  getPulseDashboard: async () => {
    const response = await api.get("/success-readiness/pulse-surveys/dashboard");
    return response.data;
  },

  getPulseTemplates: async () => {
    const response = await api.get("/success-readiness/pulse-surveys/templates");
    return response.data;
  },

  listPulseSurveys: async (status) => {
    const response = await api.get("/success-readiness/pulse-surveys", {
      params: status ? { status } : undefined,
    });
    return response.data;
  },

  createPulseSurvey: async (payload) => {
    const response = await api.post("/success-readiness/pulse-surveys", payload);
    return response.data;
  },

  updatePulseSurvey: async (surveyId, payload) => {
    const response = await api.put(`/success-readiness/pulse-surveys/${surveyId}`, payload);
    return response.data;
  },

  publishPulseSurvey: async (surveyId) => {
    const response = await api.post(`/success-readiness/pulse-surveys/${surveyId}/publish`);
    return response.data;
  },

  closePulseSurvey: async (surveyId) => {
    const response = await api.post(`/success-readiness/pulse-surveys/${surveyId}/close`);
    return response.data;
  },

  getPulseSurvey: async (surveyId) => {
    const response = await api.get(`/success-readiness/pulse-surveys/${surveyId}`);
    return response.data;
  },

  getMyPendingPulseSurveys: async () => {
    const response = await api.get("/success-readiness/pulse-surveys/my/pending");
    return response.data;
  },

  submitPulseResponse: async (surveyId, payload) => {
    const response = await api.post(`/success-readiness/pulse-surveys/${surveyId}/responses`, payload);
    return response.data;
  },
};
