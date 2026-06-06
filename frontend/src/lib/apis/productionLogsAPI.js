import { api } from "../apiClient";

export const productionLogsAPI = {
  upload: async (formData) => {
    const response = await api.post("/production-logs/upload", formData);
    return response.data;
  },

  listTemplates: async () => {
    const response = await api.get("/production-logs/templates");
    return response.data;
  },

  createTemplate: async (data) => {
    const response = await api.post("/production-logs/templates", data);
    return response.data;
  },

  deleteTemplate: async (templateId) => {
    const response = await api.delete(`/production-logs/templates/${templateId}`);
    return response.data;
  },

  detectColumns: async (formData) => {
    const response = await api.post("/production-logs/detect-columns", formData);
    return response.data;
  },

  parsePreview: async (formData) => {
    const response = await api.post("/production-logs/parse-preview", formData);
    return response.data;
  },

  aiParse: async (formData) => {
    const response = await api.post("/production-logs/ai-parse", formData);
    return response.data;
  },

  ingest: async (payload) => {
    const response = await api.post("/production-logs/ingest", payload);
    return response.data;
  },

  batchIngest: async (payload) => {
    const response = await api.post("/production-logs/batch-ingest", payload);
    return response.data;
  },

  batchIngestWithTemplate: async (payload) => {
    const response = await api.post("/production-logs/batch-ingest-with-template", payload);
    return response.data;
  },

  previewTemplateMatch: async (formData) => {
    const response = await api.post("/production-logs/preview-template-match", formData);
    return response.data;
  },

  listJobs: async () => {
    const response = await api.get("/production-logs/jobs");
    return response.data;
  },

  getJob: async (jobId) => {
    const response = await api.get(`/production-logs/jobs/${jobId}`);
    return response.data;
  },

  deleteJob: async (jobId) => {
    const response = await api.delete(`/production-logs/jobs/${jobId}`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get("/production-logs/stats");
    return response.data;
  },

  listAssets: async () => {
    const response = await api.get("/production-logs/assets");
    return response.data;
  },

  getAvailableDates: async (assetId) => {
    const response = await api.get("/production-logs/available-dates", {
      params: { asset_id: assetId },
    });
    return response.data;
  },

  getTimeseries: async (assetId) => {
    const response = await api.get("/production-logs/timeseries", {
      params: { asset_id: assetId },
    });
    return response.data;
  },

  getEntries: async ({ assetId, start, end, limit = 100 }) => {
    const response = await api.get("/production-logs/entries", {
      params: { asset_id: assetId, start, end, limit },
    });
    return response.data;
  },

  aggregate: async () => {
    const response = await api.post("/production-logs/aggregate");
    return response.data;
  },
};

export default productionLogsAPI;
