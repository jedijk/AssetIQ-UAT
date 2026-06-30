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

  askCoach: async (phaseId, message) => {
    const response = await api.post("/onboarding/coach", {
      phase_id: phaseId,
      message,
    });
    return response.data;
  },

  getCompanyProfile: async () => {
    const response = await api.get("/onboarding/company-profile");
    return response.data;
  },

  updateCompanyProfile: async (payload) => {
    const response = await api.patch("/onboarding/company-profile", payload);
    return response.data;
  },

  uploadCompanyLogo: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/onboarding/company-profile/logo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  getCompanyLogoBlob: async () => {
    const response = await api.get("/onboarding/company-profile/logo", {
      responseType: "blob",
      validateStatus: (status) => status === 200 || status === 204,
    });
    if (response.status === 204 || !response.data?.size) return null;
    return response.data;
  },
};
