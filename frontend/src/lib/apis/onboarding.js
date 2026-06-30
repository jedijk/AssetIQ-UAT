import { api } from "../apiClient";

export const onboardingAPI = {
  getStatus: async () => {
    const response = await api.get("/onboarding/status");
    return response.data;
  },

  getPhase: async (phaseId) => {
    const response = await api.get(`/onboarding/phases/${phaseId}`);
    return response.data;
  },

  selectEntryPath: async (entryPath) => {
    const response = await api.post("/onboarding/entry-path", { entry_path: entryPath });
    return response.data;
  },

  validatePhase: async (phaseId) => {
    const response = await api.post(`/onboarding/phases/${phaseId}/validate`);
    return response.data;
  },

  validateGoLive: async () => {
    const response = await api.post("/onboarding/go-live/validate");
    return response.data;
  },
};
