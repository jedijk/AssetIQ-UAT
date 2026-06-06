/**
 * Form Designer API
 * Centralized API calls for form templates and submissions
 */
import { api } from "../../lib/apiClient";

export const formAPI = {
  getTemplates: async (params = {}) => {
    const response = await api.get("/form-templates", { params });
    return response.data;
  },

  getTemplate: async (id) => {
    const response = await api.get(`/form-templates/${id}`);
    return response.data;
  },

  createTemplate: async (data) => {
    const response = await api.post("/form-templates", data);
    return response.data;
  },

  updateTemplate: async (idOrParams, dataArg) => {
    let id, data;
    if (typeof idOrParams === "object" && idOrParams.id && idOrParams.data) {
      id = idOrParams.id;
      data = idOrParams.data;
    } else if (typeof idOrParams === "string" && dataArg) {
      id = idOrParams;
      data = dataArg;
    } else {
      throw new Error("Invalid arguments for updateTemplate. Expected (id, data) or { id, data }.");
    }

    const cleanedData = { ...data };
    delete cleanedData.id;
    delete cleanedData.pendingDocuments;

    const response = await api.patch(`/form-templates/${id}`, cleanedData);
    return response.data;
  },

  deleteTemplate: async (id) => {
    const response = await api.delete(`/form-templates/${id}`);
    return response.data;
  },

  getSubmissions: async (params = {}) => {
    const queryParams = {};
    if (params.templateId) queryParams.template_id = params.templateId;
    if (params.status) queryParams.status = params.status;
    if (params.limit) queryParams.limit = params.limit;
    const response = await api.get("/form-submissions", { params: queryParams });
    return response.data;
  },

  getTemplateAnalytics: async (templateId) => {
    const response = await api.get(`/form-templates/${templateId}/analytics`);
    return response.data;
  },

  uploadDocument: async (templateId, file, description) => {
    const formData = new FormData();
    formData.append("file", file);
    if (description) formData.append("description", description);
    const response = await api.post(`/form-templates/${templateId}/documents`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  deleteDocument: async (templateId, documentId) => {
    const response = await api.delete(`/form-templates/${templateId}/documents/${documentId}`);
    return response.data;
  },

  searchDocuments: async (templateId, query) => {
    const response = await api.post(`/form-templates/${templateId}/documents/search`, { query });
    return response.data;
  },

  searchEquipment: async (query) => {
    try {
      const response = await api.get("/equipment-hierarchy/search", { params: { query } });
      return response.data;
    } catch {
      return { results: [] };
    }
  },

  updateSubmission: async (submissionId, values = {}) => {
    const response = await api.patch(`/production/submission/${submissionId}`, { values });
    return response.data;
  },
};

export default formAPI;
